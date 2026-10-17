import { z } from 'zod';
import { isVerifiedStatus, type CandidateVerification, type FactCandidate, type FactProposal, type ValueVerificationStatus } from './contracts';
import {
  fitQuotesToPages, literalHasUnit, sourceFactValues, toFactProposal, withNormalizedSymbols,
  type DropReason, type DroppedValue, type NormalizedExtraction, type SourceFactValue,
} from './fact-extraction';
import { ALL_MODELS_COLUMN, PAGE_CONTENT_KINDS, type ExtractionSource, type PageContentKind } from './fact-extraction-prompt';
import {
  pdfEvidenceSource, verificationMessage, verifyFactProposal,
  type FactVerificationReport, type PdfEvidenceSource, type VerifiedCandidate, type VerifiedValue,
} from './fact-verifier';
import type { ExtractedPdf } from './pdf-intake';
import { verificationPageText } from './pdf-layout-evidence';
import { normalizeEvidenceWhitespace } from './pdf-literal-evidence';

/**
 * Local review of one server extraction (FR-66, vnext-catalog-draft): turns
 * the model's v3 answer for ONE file into verified tables, using only the
 * file's own text read in this browser (pdf-intake). The server and the model
 * are never trusted: every value goes through `verifyFactProposal`, exactly
 * as in the FR-66a spike (§1 of SPIKE_EXTRACAO_20261015.md).
 *
 * What v3 adds over the spike (its §8, conditions 5 and 6):
 * - tables that apply to every model ("sharedTables", the TA manual p. 6
 *   inputs table): verified as their own matrix, whose positions are the
 *   table's printed columns, so the column check of the verifier ties each
 *   value to its header ("Resolução", "Exatidão");
 * - a report of EVERY page read, so a page that gave no value is said out
 *   loud, never dropped in silence;
 * - the unit shown once (`valueDisplayText`), the literal never edited.
 *
 * Why this module exists (IDS: CREATE): fact-extraction.ts normalizes one
 * model × row matrix and has no notion of shared tables, page reports or of
 * the server reply; it is reused here as it is (toFactProposal,
 * fitQuotesToPages, sourceFactValues).
 */

export type ReviewDropReason = DropReason | 'PAGE_OUTSIDE_RANGE' | 'COLUMN_NOT_DECLARED' | 'INVALID_ROW';
export interface ReviewDroppedValue extends Omit<DroppedValue, 'reason'> {
  readonly reason: ReviewDropReason;
  /** "Tabela comum" for a shared table, the section title for the model table. */
  readonly table: string;
}

export interface ReviewedTable {
  readonly kind: 'models' | 'shared';
  readonly title: string;
  /** Model table: the product models. Shared table: its printed value columns. */
  readonly columns: readonly string[];
  /** Products the values apply to: the table's own models, or every product for a shared table. */
  readonly appliesTo: readonly string[];
  readonly extraction: NormalizedExtraction;
  readonly report: FactVerificationReport;
  readonly fittedQuotes: number;
  /** Plain-Portuguese message of every value position, by `VerifiedValue.id`. */
  readonly messages: ReadonlyMap<string, string>;
}

export interface PageReview {
  readonly page: number;
  /** What the model said the page holds (never trusted for a value; it only explains an empty page). */
  readonly content?: PageContentKind;
  readonly values: number;
  readonly verified: number;
  readonly toCheck: number;
  readonly unverified: number;
  readonly tables: readonly string[];
  readonly message: string;
}

export interface ExtractionReviewCounts {
  readonly verified: number;
  /** Values a person must look at on the page (VISUAL_ONLY) or choose between (CONFLICT). */
  readonly toCheck: number;
  readonly unverified: number;
  readonly missing: number;
}

export interface ExtractionReview {
  readonly source: ExtractionSource;
  readonly tables: readonly ReviewedTable[];
  /** One entry for every page of the range, in order: no page read vanishes. */
  readonly pages: readonly PageReview[];
  readonly dropped: readonly ReviewDroppedValue[];
  /** Items the server left out because the answer passed its size limits. */
  readonly trimmedByServer: number;
  readonly counts: ExtractionReviewCounts;
  /** One plain-Portuguese paragraph for the father. */
  readonly summary: string;
}

/** The literal as printed plus its unit, shown once ("260 x 200 x 305 mm" with "mm" stays as it is). */
export function valueDisplayText(literal: string, unit: string): string {
  const clean = unit.trim();
  return !clean || literalHasUnit(literal, clean) ? literal : `${literal} ${clean}`;
}
/**
 * What a separate "Unidade" column shows for a row: nothing when every value
 * already prints the unit (it would read "mm mm"), the unit otherwise.
 */
export function unitColumnText(unit: string, literals: readonly string[]): string {
  const clean = unit.trim();
  const shown = literals.filter(literal => literal.trim());
  return clean && shown.length && shown.every(literal => literalHasUnit(literal, clean)) ? '' : clean;
}

const oneLine = (value: string | undefined) => (value ?? '').replace(/\s+/gu, ' ').trim();

/**
 * "ºC", "˚F" -> "°C", "°F": the ordinal indicator or the ring typed (or read)
 * as a degree sign before a temperature unit. One character for one, so text
 * positions never move. Applied alike to the file's text and to the answer
 * (like `normalizeSymbolText`), so verification still compares exact text:
 * on the TA manual p. 6 the page prints "°C" through the Symbol font and the
 * model writes "ºC", which would otherwise fail every temperature value.
 */
export function canonicalDegreeSign(text: string): string {
  return text.replace(/[º˚](?=\s?[CFK](?![\p{L}\p{N}]))/gu, '°');
}
const canonicalAnswer = (value: unknown): unknown => typeof value === 'string' ? canonicalDegreeSign(value)
  : Array.isArray(value) ? value.map(canonicalAnswer)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, canonicalAnswer(item)]))
      : value;
function canonicalPdf(pdf: ExtractedPdf): ExtractedPdf {
  return { ...pdf, pages: pdf.pages.map(page => ({
    ...page, text: canonicalDegreeSign(page.text),
    ...(page.runs ? { runs: page.runs.map(run => ({ ...run, text: canonicalDegreeSign(run.text) })) } : {}),
  })) };
}

const SharedRowSchema = z.object({
  label: z.string().default(''),
  sourceRef: z.object({
    file: z.string().optional(), page: z.number(), quote: z.string(), box_2d: z.array(z.number()).optional(),
  }),
  values: z.array(z.object({
    column: z.string(), literal: z.string(), unit: z.string().optional(), condition: z.string().optional(),
  })).default([]),
});
const SharedTableSchema = z.object({
  title: z.string().default(''),
  columns: z.array(z.string()).default([]),
  rows: z.array(z.unknown()).default([]),
});
const SheetV3Schema = z.object({
  title: z.string().default(''),
  models: z.array(z.string()).default([]),
  sections: z.array(z.object({
    title: z.string().default(''),
    rows: z.array(z.object({
      key: z.string().default(''), label: z.string().default(''),
      values: z.array(z.object({ model: z.string(), literal: z.string(), sourceRef: z.object({ page: z.number() }).passthrough() })
        .passthrough()).default([]),
    }).passthrough()).default([]),
  }).passthrough()).default([]),
  sharedTables: z.array(z.unknown()).default([]),
  pages: z.array(z.unknown()).default([]),
}).passthrough();
const PageNoteSchema = z.object({ page: z.number().int(), content: z.enum(PAGE_CONTENT_KINDS) });

const MAX_SHARED_COLUMNS = 6;
const SHARED_TABLE_DROP_LABEL = 'Tabela comum';

/** Text lines of a page as the verifier sees them (native lines and lines rebuilt from text positions). */
function pageLines(source: PdfEvidenceSource, page: number): string[] {
  const found = source.pages.find(item => item.number === page);
  return found ? verificationPageText(found).split(/\r\n|\r|\n/u).map(normalizeEvidenceWhitespace).filter(Boolean) : [];
}

/**
 * Shared tables only: a value is verified by a quote that must stay inside
 * ONE line of the page. A quote running over two table lines could tie the
 * label of one row to the value of the next (the TA p. 6 "milivolt" has two
 * ranges under one name), so it goes to a person instead (LABEL_UNCLEAR).
 * Only ever lowers a status, never raises one.
 */
function guardSharedRows(report: FactVerificationReport, source: PdfEvidenceSource): FactVerificationReport {
  const lines = new Map<number, string[]>();
  const oneLineQuote = (candidate: VerifiedCandidate) => {
    if (!lines.has(candidate.source.page)) lines.set(candidate.source.page, pageLines(source, candidate.source.page));
    const quote = normalizeEvidenceWhitespace(candidate.source.quote);
    return lines.get(candidate.source.page)!.some(line => line.includes(quote));
  };
  const lowered = new Set<string>();
  const values = report.values.map((value): VerifiedValue => {
    if (!value.candidates.some(item => isVerifiedStatus(item.status) && !oneLineQuote(item))) return value;
    lowered.add(value.id);
    const candidates = value.candidates.map((item): VerifiedCandidate => isVerifiedStatus(item.status) && !oneLineQuote(item)
      ? { value: item.value, source: item.source, status: 'VISUAL_ONLY', reason: 'LABEL_UNCLEAR' } : item);
    const evidence = candidates.filter(item => item.status !== 'UNVERIFIED');
    const differ = new Set(evidence.map(item => normalizeEvidenceWhitespace(item.value))).size > 1;
    const selected = candidates.findIndex(item => isVerifiedStatus(item.status));
    const status: ValueVerificationStatus = differ ? 'CONFLICT' : selected >= 0 ? candidates[selected].status
      : evidence.length ? 'VISUAL_ONLY' : 'UNVERIFIED';
    const { selected: _previous, ...rest } = value;
    void _previous;
    return { ...rest, status, candidates, ...(selected >= 0 && !differ ? { selected } : {}) };
  });
  if (!lowered.size) return report;
  const counts: Record<ValueVerificationStatus | 'MISSING', number> =
    { VERIFIED_TEXT: 0, VERIFIED_CELL: 0, VISUAL_ONLY: 0, UNVERIFIED: 0, CONFLICT: 0, MISSING: 0 };
  for (const value of values) counts[value.status]++;
  const byId = new Map(values.map(value => [value.id, value]));
  const stamp = (candidate: FactCandidate, verification: CandidateVerification | undefined): FactCandidate =>
    verification ? { ...candidate, verification } : candidate;
  const proposal: FactProposal = {
    ...report.proposal,
    sections: report.proposal.sections.map(section => ({ ...section, rows: section.rows.map(row => ({
      ...row,
      values: row.values.map((fact, modelIndex) => {
        const value = byId.get(`${section.id}/${row.id}/${modelIndex}`);
        if (!value || !lowered.has(value.id) || fact.status === 'missing') return fact;
        return fact.status === 'known'
          ? { status: 'known' as const, candidate: stamp(fact.candidate, value.candidates[0]?.status) }
          : { status: 'conflict' as const, candidates: fact.candidates.map((item, index) => stamp(item, value.candidates[index]?.status)) };
      }),
    })) })),
  };
  return { ...report, proposal, values, counts };
}

/** "página 6" or "página 6 de manual.pdf". */
const place = (page: number, sourceId: string, names: ReadonlyMap<string, string>) =>
  names.get(sourceId) ? `página ${page} de ${names.get(sourceId)}` : `página ${page}`;
/**
 * Message of a shared-table value. Its matrix positions are the table's
 * columns, not product models, so the verifier's "modelo" wording becomes
 * "coluna"; every other message is the verifier's own.
 */
export function sharedTableMessage(value: VerifiedValue, names: ReadonlyMap<string, string> = new Map()): string {
  if (value.status === 'VISUAL_ONLY' || value.status === 'UNVERIFIED') {
    const first = value.status === 'VISUAL_ONLY' ? value.candidates.find(item => item.status === 'VISUAL_ONLY') : value.candidates[0];
    if (first) {
      const where = place(first.source.page, first.source.sourceId, names), column = value.model;
      switch (first.reason) {
        case 'MODEL_NOT_ON_PAGE': return `A coluna "${column}" não aparece na ${where}.`;
        case 'MODEL_VARIANT': return `Na ${where}, a coluna "${column}" aparece com outro nome.`;
        case 'MODEL_ATTRIBUTION':
        case 'COLUMN_MISMATCH': return `Na ${where}, este valor está em outra coluna, não em "${column}".`;
        case 'COLUMN_UNCLEAR': return `Na ${where}, não dá para saber pelo texto se este valor é da coluna "${column}"; confira olhando a página.`;
        default: break;
      }
    }
  }
  return verificationMessage(value, names);
}

interface PendingDrop { readonly table: string; readonly label: string; readonly model: string; readonly literal: string; readonly reason: ReviewDropReason }

function verifyTable(kind: ReviewedTable['kind'], answer: unknown, source: ExtractionSource, evidence: PdfEvidenceSource,
  options: { readonly models?: readonly string[]; readonly title?: string; readonly appliesTo: readonly string[] }):
  { readonly table: ReviewedTable | null; readonly dropped: readonly DroppedValue[] } {
  let normalized: NormalizedExtraction;
  try {
    normalized = toFactProposal(answer, [source], { ...(options.models ? { models: options.models } : {}), ...(options.title ? { title: options.title } : {}) });
  } catch {
    return { table: null, dropped: [] };
  }
  const { extraction, fitted } = fitQuotesToPages(normalized, [evidence]);
  const verified = verifyFactProposal(extraction.proposal, [evidence]);
  const report = kind === 'shared' ? guardSharedRows(verified, evidence) : verified;
  const message = kind === 'shared' ? sharedTableMessage : verificationMessage;
  const messages = new Map(report.values.map(value => [value.id, message(value, report.sourceNames)]));
  return {
    table: {
      kind, title: extraction.proposal.title, columns: extraction.proposal.models, appliesTo: options.appliesTo,
      extraction, report, fittedQuotes: fitted, messages,
    },
    dropped: extraction.dropped,
  };
}

const PAGE_CONTENT_TEXT: Readonly<Record<PageContentKind, string>> = {
  'specifications': 'a IA disse que há especificações, mas nenhum valor veio desta página. Confira olhando a página se falta alguma coisa.',
  'shared-table': 'a IA disse que há uma tabela comum a todos os modelos, mas nenhum valor veio desta página. Confira olhando a página.',
  'other-models': 'fala de outros modelos, que não foram pedidos; nada foi aproveitado.',
  'no-specifications': 'não tem valores de especificação.',
  'image-only': 'os valores estão em imagem e a IA não conseguiu lê-los. Confira olhando a página.',
};
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
function pageMessage(page: Omit<PageReview, 'message'>): string {
  if (!page.values) {
    return `Página ${page.page}: ${page.content ? PAGE_CONTENT_TEXT[page.content]
      : 'a IA não trouxe nenhum valor desta página. Confira olhando a página se falta alguma coisa.'}`;
  }
  const parts = [
    page.verified ? plural(page.verified, 'valor conferido no texto', 'valores conferidos no texto') : '',
    page.toCheck ? plural(page.toCheck, 'para conferir olhando a página', 'para conferir olhando a página') : '',
    page.unverified ? plural(page.unverified, 'que não confere com o texto', 'que não conferem com o texto') : '',
  ].filter(Boolean);
  const tables = page.tables.length ? ` (${page.tables.map(title => `"${title}"`).join(', ')})` : '';
  return `Página ${page.page}${tables}: ${parts.join(', ')}.`;
}

/**
 * Reviews the server's answer for one file against that file's own text.
 *
 * @param answer   the `sheet` of a vnext-catalog-draft reply (untrusted).
 * @param source   the file and page range that was asked.
 * @param pdf      the same file read here by pdf-intake (Symbol-font signs are normalized inside).
 * @param options  `models`: the products asked for; `trimmedByServer`: items the server left out.
 */
export function reviewExtraction(answer: unknown, source: ExtractionSource, pdf: ExtractedPdf,
  options: { readonly models?: readonly string[]; readonly trimmedByServer?: number } = {}): ExtractionReview {
  if (pdf.sha256 !== source.sha256) throw new Error('EXTRACTION_SOURCE_MISMATCH');
  const evidence = pdfEvidenceSource(source.sourceId, canonicalPdf(withNormalizedSymbols(pdf)), source.fileName);
  const parsed = SheetV3Schema.safeParse(canonicalAnswer(answer));
  const sheet = parsed.success ? parsed.data : SheetV3Schema.parse({});
  const inRange = (page: number) => Number.isInteger(page) && page >= source.firstPage && page <= source.lastPage;
  const drops: PendingDrop[] = [];

  // Model table: values outside the asked pages are left out and counted.
  const sections = sheet.sections.map(section => ({
    ...section,
    rows: section.rows.map(row => ({
      ...row,
      values: row.values.filter(value => {
        if (inRange(value.sourceRef.page)) return true;
        drops.push({ table: oneLine(section.title) || 'Especificações', label: oneLine(row.label), model: oneLine(value.model),
          literal: oneLine(value.literal), reason: 'PAGE_OUTSIDE_RANGE' });
        return false;
      }),
    })),
  }));
  const products = (options.models?.length ? options.models : sheet.models).map(oneLine).filter(Boolean);
  const tables: ReviewedTable[] = [];
  const pushDropped = (table: string, list: readonly DroppedValue[]) =>
    drops.push(...list.map(item => ({ table, label: item.label, model: item.model, literal: item.literal, reason: item.reason })));
  if (sections.some(section => section.rows.some(row => row.values.length))) {
    const result = verifyTable('models', { ...sheet, sections }, source, evidence,
      { ...(options.models?.length ? { models: options.models } : {}), appliesTo: products });
    if (result.table) tables.push({ ...result.table, appliesTo: result.table.columns });
    pushDropped('Especificações', result.dropped);
  }

  // Shared tables: one matrix per table, whose positions are its printed columns.
  for (const raw of sheet.sharedTables) {
    const table = SharedTableSchema.safeParse(raw);
    if (!table.success) continue;
    const title = oneLine(table.data.title) || SHARED_TABLE_DROP_LABEL;
    const columns: string[] = [];
    for (const column of table.data.columns.map(oneLine)) if (column && !columns.includes(column)) columns.push(column);
    const kept = columns.slice(0, MAX_SHARED_COLUMNS);
    const columnOf = (name: string) => {
      const clean = oneLine(name);
      return kept.find(column => column === clean) ?? kept.find(column => column.toLowerCase() === clean.toLowerCase());
    };
    const rows = [];
    for (const rawRow of table.data.rows) {
      const row = SharedRowSchema.safeParse(rawRow);
      if (!row.success) { drops.push({ table: title, label: '', model: '', literal: '', reason: 'INVALID_ROW' }); continue; }
      const label = oneLine(row.data.label);
      const values = [];
      for (const value of row.data.values) {
        const column = columnOf(value.column);
        const literal = oneLine(value.literal);
        if (!inRange(row.data.sourceRef.page)) { drops.push({ table: title, label, model: oneLine(value.column), literal, reason: 'PAGE_OUTSIDE_RANGE' }); continue; }
        if (!column) {
          drops.push({ table: title, label, model: oneLine(value.column), literal,
            reason: columns.includes(oneLine(value.column)) ? 'LIMIT_REACHED' : 'COLUMN_NOT_DECLARED' });
          continue;
        }
        const unit = oneLine(value.unit);
        // Condition 6 of the spike: a unit the literal already prints is not repeated, and the literal is never edited.
        values.push({ model: column, literal: value.literal, unit: unit && literalHasUnit(literal, unit) ? '' : unit,
          condition: value.condition ?? '', sourceRef: row.data.sourceRef });
      }
      if (values.length) rows.push({ key: '', label, values });
    }
    if (!rows.length || !kept.length) continue;
    const result = verifyTable('shared', { title, models: kept, sections: [{ title, rows }] }, source, evidence,
      { models: kept, title, appliesTo: products });
    if (result.table) tables.push(result.table);
    pushDropped(title, result.dropped);
  }

  // Every page of the range gets a line, with or without values.
  const notes = new Map<number, PageContentKind>();
  for (const raw of sheet.pages) {
    const note = PageNoteSchema.safeParse(raw);
    if (note.success && inRange(note.data.page) && !notes.has(note.data.page)) notes.set(note.data.page, note.data.content);
  }
  const pages: PageReview[] = [];
  for (let page = source.firstPage; page <= source.lastPage; page++) {
    let values = 0, verified = 0, toCheck = 0, unverified = 0;
    const titles = new Set<string>();
    for (const table of tables) for (const value of table.report.values) {
      if (value.status === 'MISSING') continue;
      const chosen = value.candidates[value.selected ?? 0];
      if (!value.candidates.some(item => item.source.page === page) || !chosen) continue;
      values++;
      if (chosen.source.page !== page && value.status !== 'CONFLICT') continue;
      if (isVerifiedStatus(value.status)) verified++;
      else if (value.status === 'VISUAL_ONLY' || value.status === 'CONFLICT') toCheck++;
      else unverified++;
      titles.add(table.kind === 'shared' ? table.title : '');
    }
    const content = notes.get(page);
    const base = { page, ...(content ? { content } : {}), values, verified, toCheck, unverified,
      tables: [...titles].filter(Boolean) };
    pages.push({ ...base, message: pageMessage(base) });
  }

  const counts = tables.reduce((total, table) => ({
    verified: total.verified + table.report.counts.VERIFIED_TEXT + table.report.counts.VERIFIED_CELL,
    toCheck: total.toCheck + table.report.counts.VISUAL_ONLY + table.report.counts.CONFLICT,
    unverified: total.unverified + table.report.counts.UNVERIFIED,
    missing: total.missing + table.report.counts.MISSING,
  }), { verified: 0, toCheck: 0, unverified: 0, missing: 0 });
  const trimmedByServer = Math.max(0, Math.trunc(options.trimmedByServer ?? 0));
  const dropped: ReviewDroppedValue[] = drops.map(item => ({ section: item.table, table: item.table, label: item.label,
    model: item.model, literal: item.literal, reason: item.reason }));
  return { source, tables, pages, dropped, trimmedByServer, counts,
    summary: reviewSummary(source, counts, pages, dropped.length + trimmedByServer) };
}

function reviewSummary(source: ExtractionSource, counts: ExtractionReviewCounts, pages: readonly PageReview[], leftOut: number): string {
  const range = source.firstPage === source.lastPage ? `a página ${source.firstPage}` : `as páginas ${source.firstPage} a ${source.lastPage}`;
  const found = [
    plural(counts.verified, 'valor conferido no texto', 'valores conferidos no texto'),
    plural(counts.toCheck, 'para você conferir olhando a página', 'para você conferir olhando a página'),
    ...(counts.unverified ? [plural(counts.unverified, 'que não confere e não será usado sem você', 'que não conferem e não serão usados sem você')] : []),
  ].join(', ');
  const empty = pages.filter(page => !page.values).map(page => page.page);
  const emptyText = empty.length ? ` ${empty.length === 1 ? 'A página' : 'As páginas'} ${empty.join(', ')} não ${empty.length === 1 ? 'trouxe' : 'trouxeram'} valores; veja o motivo abaixo.` : '';
  const leftOutText = leftOut ? ` ${plural(leftOut, 'leitura ficou de fora', 'leituras ficaram de fora')} (fora das páginas pedidas ou além do limite).` : '';
  return `Li ${range} de ${source.fileName}: ${found}.${emptyText}${leftOutText}`;
}

/** Values of the model table, one per model and quantity, for `findSourceDivergences` across files (FR-68). */
export function reviewSourceValues(review: ExtractionReview): SourceFactValue[] {
  return review.tables.filter(table => table.kind === 'models')
    .flatMap(table => sourceFactValues(table.extraction, table.report));
}

export { ALL_MODELS_COLUMN };
