import {
  FactProposalSchema, decisionKey, isVerifiedStatus,
  type CandidateVerification, type FactCandidate, type FactProposal, type SourceReference, type ValueVerificationStatus,
} from './contracts';
import type { ExtractedPdf, ExtractedPdfPage } from './pdf-intake';
import {
  checkValueTextEvidence, literalEvidencePositions, normalizeEvidenceWhitespace, valueEvidencePositions,
  type TextEvidenceProblem,
} from './pdf-literal-evidence';

/**
 * Per-value fact verification (FR-67). It only orchestrates checks that run
 * locally on the exact file bytes the user provided; it never calls a model.
 * One bad value never discards the others: every value position gets its own
 * status, and only VERIFIED_TEXT / VERIFIED_CELL may be used without a person.
 *
 * Why this module exists (IDS: CREATE): no spreadsheet-cell verifier existed,
 * and pdf-evidence.ts / pdf-grounded-input.ts were all-or-nothing throws.
 */

export type VerificationReason =
  | TextEvidenceProblem
  | 'SOURCE_NOT_PROVIDED' | 'SOURCE_HASH_MISMATCH' | 'SOURCE_KIND_MISMATCH'
  | 'PAGE_NOT_FOUND' | 'PAGE_TEXT_INCOMPLETE' | 'PAGE_NEEDS_VISUAL_CHECK' | 'VISUAL_REGION_ONLY'
  | 'COLUMN_MISMATCH' | 'COLUMN_UNCLEAR'
  | 'CELL_REFERENCE_REQUIRED' | 'CELL_NOT_FOUND' | 'CELL_VALUE_MISMATCH';

/** A PDF read locally (pdf-intake), with its native text and text positions. */
export interface PdfEvidenceSource {
  readonly kind: 'pdf';
  readonly sourceId: string;
  readonly sha256: string;
  readonly pageCount: number;
  readonly pages: readonly ExtractedPdfPage[];
}
/** A spreadsheet read locally; cell text exactly as the intake produced it. */
export interface SheetEvidenceSource {
  readonly kind: 'sheet';
  readonly sourceId: string;
  readonly sha256: string;
  readonly sheets: readonly {
    readonly number: number;
    readonly name?: string;
    /** A1 address (upper case, no $) -> cell text. */
    readonly cells: Readonly<Record<string, string>>;
  }[];
}
export type EvidenceSource = PdfEvidenceSource | SheetEvidenceSource;

export const pdfEvidenceSource = (sourceId: string, pdf: ExtractedPdf): PdfEvidenceSource =>
  ({ kind: 'pdf', sourceId, sha256: pdf.sha256, pageCount: pdf.pageCount, pages: pdf.pages });

const cellAddress = (address: string) => address.replace(/\$/gu, '').toUpperCase();
const columnLetters = (index: number) => {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
};
/**
 * Builds sheet evidence from table rows. `addresses` may be the intake's own
 * ("Aba!B7" for XLSX, "B7" for CSV); without them, A1 addresses are derived.
 */
export function sheetEvidenceSource(sourceId: string, sha256: string, sheets: readonly {
  number: number; name?: string; rows: readonly (readonly string[])[]; addresses?: readonly (readonly string[])[];
}[]): SheetEvidenceSource {
  return {
    kind: 'sheet', sourceId, sha256,
    sheets: sheets.map(sheet => {
      const cells: Record<string, string> = {};
      sheet.rows.forEach((row, rowIndex) => row.forEach((text, columnIndex) => {
        const raw = sheet.addresses?.[rowIndex]?.[columnIndex] ?? `${columnLetters(columnIndex)}${rowIndex + 1}`;
        const address = cellAddress(raw.includes('!') ? raw.slice(raw.lastIndexOf('!') + 1) : raw);
        if (/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u.test(address)) cells[address] = text;
      }));
      return { number: sheet.number, ...(sheet.name ? { name: sheet.name } : {}), cells };
    }),
  };
}

export interface CandidateContext {
  readonly model: string;
  readonly models: readonly string[];
  readonly modelIndex: number;
  readonly label: string;
  readonly labels: readonly string[];
  readonly unit: string;
  readonly condition: string;
}
export interface CandidateCheck {
  readonly status: CandidateVerification;
  readonly reason?: VerificationReason;
}

interface Run { text: string; x: number; y: number; width: number }
interface Segment { start: number; end: number; x0: number; x1: number; cell: number }
interface Line { y: number; text: string; segments: Segment[] }
/** x0/x1: the literal itself; cellX0/cellX1: the whole cell it sits in (a merged cell may span columns). */
interface Span { line: number; y: number; x0: number; x1: number; cellX0: number; cellX1: number; cell: number; cellText: string }

/**
 * Rebuilds visual lines from native text positions, left to right. Pieces that
 * physically touch are joined without a space: some PDFs split "155" into
 * "1" + "55" or "TA-25N" into "TA" + "-" + "25N", and PDF.js then inserts
 * spaces the printed page does not have. A wide gap starts a new table cell.
 */
const linesByRuns = new WeakMap<readonly Run[], Line[]>();
function visualLines(runs: readonly Run[]): Line[] {
  const cached = linesByRuns.get(runs);
  if (cached) return cached;
  const lines = buildVisualLines(runs);
  linesByRuns.set(runs, lines);
  return lines;
}
function buildVisualLines(runs: readonly Run[]): Line[] {
  const groups: Run[][] = [];
  for (const run of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const group = groups.find(items => Math.abs(items[0].y - run.y) < 2);
    if (group) group.push(run); else groups.push([run]);
  }
  return groups.map(group => {
    const line: Line = { y: group[0].y, text: '', segments: [] };
    let previous: Run | undefined, cell = 0;
    for (const run of group.sort((a, b) => a.x - b.x)) {
      const text = normalizeEvidenceWhitespace(run.text);
      if (!text) continue;
      if (previous) {
        const gap = run.x - (previous.x + Math.max(0, previous.width));
        const charWidth = Math.max(0.5, Math.max(0, previous.width) / Math.max(1, previous.text.length));
        const touching = gap > -charWidth && gap < Math.min(0.5, charWidth * 0.12);
        if (!touching) line.text += ' ';
        if (gap > Math.max(8, charWidth * 2)) cell++;
      }
      line.segments.push({ start: line.text.length, end: line.text.length + text.length, x0: run.x, x1: run.x + Math.max(0, run.width), cell });
      line.text += text;
      previous = run;
    }
    return line;
  });
}

/**
 * Text used to verify a page: the native text, plus the lines rebuilt from
 * text positions when they read differently (joined pieces). Deterministic, so
 * a sidecar that stores it re-verifies to the same result.
 */
export function verificationPageText(page: ExtractedPdfPage): string {
  if (!page.runs?.length) return page.text;
  const rebuilt = visualLines(page.runs).map(line => line.text).filter(Boolean).join('\n');
  if (!rebuilt || normalizeEvidenceWhitespace(rebuilt) === normalizeEvidenceWhitespace(page.text)) return page.text;
  const combined = `${page.text}\n\n${rebuilt}`;
  return combined.length <= 50_000 ? combined : page.text;
}

function spanX(line: Line, start: number, end: number): Omit<Span, 'line' | 'y'> | null {
  const touched = line.segments.filter(segment => segment.end > start && segment.start < end);
  if (!touched.length) return null;
  const at = (segment: Segment, index: number) => {
    const length = segment.end - segment.start;
    const ratio = length ? Math.min(1, Math.max(0, (index - segment.start) / length)) : 0;
    return segment.x0 + ratio * (segment.x1 - segment.x0);
  };
  const cell = touched[0].cell, members = line.segments.filter(segment => segment.cell === cell);
  return { x0: at(touched[0], start), x1: at(touched[touched.length - 1], end), cell,
    cellX0: members[0].x0, cellX1: members[members.length - 1].x1,
    cellText: line.text.slice(members[0].start, members[members.length - 1].end) };
}
function literalSpans(lines: readonly Line[], literal: string, kind: 'model' | 'value', unit = ''): Span[] {
  const needle = normalizeEvidenceWhitespace(literal);
  return lines.flatMap((line, index) => (kind === 'value' ? valueEvidencePositions(line.text, needle, unit)
    : literalEvidencePositions(line.text, needle, kind)).flatMap(start => {
    const box = spanX(line, start, start + needle.length);
    return box ? [{ line: index, y: line.y, ...box }] : [];
  }));
}

/**
 * Column check using native text positions. The header row of a value is the
 * nearest line above it that names the value's model exactly once and has
 * several cells (other models, even ones not declared, are just other cells).
 * Each header cell defines a column band; the value must sit in its model's.
 * - MATCH: the value is in its model's column.
 * - MISMATCH: it is only in other columns, in a row with several cells.
 * - UNCLEAR: it is the only cell of its row and outside the model's column, so
 *   it may be merged across models or belong to one model only; a person must
 *   look at the page.
 * - UNKNOWN: no such header row, a cell reaching the model's column (merged
 *   cell, whole line as one run) or anything else; the text check decides.
 * Works for a single-product sheet cut from a multi-model table, too. Only
 * occurrences whose cell is inside the cited quote count (the same figure may
 * appear in another row and column of the page).
 */
export function columnAttribution(page: ExtractedPdfPage, model: string, value: string, unit = '', quote = ''):
  'MATCH' | 'MISMATCH' | 'UNCLEAR' | 'UNKNOWN' {
  if (!page.runs?.length) return 'UNKNOWN';
  const lines = visualLines(page.runs);
  const headers = lines.flatMap((line, index) => {
    const found = literalSpans([line], model, 'model');
    const cells = [...new Set(line.segments.map(segment => segment.cell))].map(cell => {
      const members = line.segments.filter(segment => segment.cell === cell);
      return { cell, x0: members[0].x0, x1: members[members.length - 1].x1 };
    });
    return found.length === 1 && cells.length >= 2 ? [{ index, y: line.y, cells, target: found[0].cell }] : [];
  });
  if (!headers.length) return 'UNKNOWN';
  const everywhere = literalSpans(lines, value, 'value', unit), cited = normalizeEvidenceWhitespace(quote);
  const quoted = cited ? everywhere.filter(span => cited.includes(normalizeEvidenceWhitespace(span.cellText))) : [];
  const spans = quoted.length ? quoted : everywhere;
  const overlaps = (x0: number, x1: number, band: { left: number; right: number }) => x1 > band.left && x0 < band.right;
  let reaches = false, matched = false;
  const elsewhere: boolean[] = [];
  for (const span of spans) {
    const header = headers.filter(item => item.y - span.y > 1).sort((a, b) => a.y - b.y)[0];
    if (!header) continue;
    const centers = header.cells.map(cell => ({ cell: cell.cell, center: (cell.x0 + cell.x1) / 2 }));
    const bands = centers.map((item, position) => {
      const previous = centers[position - 1]?.center, next = centers[position + 1]?.center;
      const left = previous === undefined ? item.center - ((next ?? item.center) - item.center) / 2 : (previous + item.center) / 2;
      const right = next === undefined ? item.center + (item.center - (previous ?? item.center)) / 2 : (item.center + next) / 2;
      return { cell: item.cell, left, right };
    });
    const target = bands.find(band => band.cell === header.target)!;
    if (overlaps(span.x0, span.x1, target)) matched = true;
    else if (overlaps(span.cellX0, span.cellX1, target)) reaches = true;
    else if (bands.some(band => band !== target && overlaps(span.x0, span.x1, band))) {
      const rowCells = new Set(lines[span.line].segments
        .filter(segment => bands.some(band => overlaps(segment.x0, segment.x1, band))).map(segment => segment.cell));
      elsewhere.push(rowCells.size === 1);
    }
  }
  if (matched) return 'MATCH';
  if (reaches || !elsewhere.length) return 'UNKNOWN';
  return elsewhere.every(Boolean) ? 'UNCLEAR' : 'MISMATCH';
}

function verifyPdfCandidate(source: PdfEvidenceSource, candidate: FactCandidate, context: CandidateContext): CandidateCheck {
  const page = source.pages.find(item => item.number === candidate.source.page);
  if (!page || candidate.source.page > source.pageCount) return { status: 'UNVERIFIED', reason: 'PAGE_NOT_FOUND' };
  if (page.needsVisualExtraction) return { status: 'VISUAL_ONLY', reason: 'PAGE_NEEDS_VISUAL_CHECK' };
  const check = checkValueTextEvidence({
    pageText: verificationPageText(page), quote: candidate.source.quote, value: candidate.value,
    model: context.model, models: context.models, label: context.label, labels: context.labels,
    unit: context.unit, condition: context.condition,
  });
  if (!check.verified) {
    // A page with some text can still carry the table as an image: a value
    // the model located by region (box_2d) but absent from the text layer is
    // something a person must look at, never a verified value.
    if (candidate.source.box_2d && (check.problem === 'QUOTE_NOT_ON_PAGE' || check.problem === 'VALUE_NOT_IN_QUOTE')) {
      return { status: 'VISUAL_ONLY', reason: 'VISUAL_REGION_ONLY' };
    }
    if (page.textLength > page.text.length) return { status: 'UNVERIFIED', reason: 'PAGE_TEXT_INCOMPLETE' };
    return { status: 'UNVERIFIED', reason: check.problem };
  }
  const column = columnAttribution(page, context.model, candidate.value, context.unit, candidate.source.quote);
  if (column === 'MISMATCH') return { status: 'UNVERIFIED', reason: 'COLUMN_MISMATCH' };
  if (column === 'UNCLEAR') return { status: 'VISUAL_ONLY', reason: 'COLUMN_UNCLEAR' };
  return { status: 'VERIFIED_TEXT' };
}

const sameCellText = (cell: string, value: string, unit: string) => {
  const text = normalizeEvidenceWhitespace(cell), wanted = normalizeEvidenceWhitespace(value), suffix = normalizeEvidenceWhitespace(unit);
  return text === wanted || (suffix !== '' && (text === `${wanted} ${suffix}` || text === `${wanted}${suffix}`));
};
function verifySheetCandidate(source: SheetEvidenceSource, candidate: FactCandidate, context: CandidateContext): CandidateCheck {
  const reference = candidate.source.cell;
  if (!reference) return { status: 'UNVERIFIED', reason: 'CELL_REFERENCE_REQUIRED' };
  if (!normalizeEvidenceWhitespace(candidate.value)) return { status: 'UNVERIFIED', reason: 'EMPTY_VALUE' };
  const sheet = reference.sheet !== undefined
    ? source.sheets.find(item => item.name === reference.sheet)
    : source.sheets.find(item => item.number === candidate.source.page);
  const text = sheet?.cells[cellAddress(reference.address)];
  if (text === undefined) return { status: 'UNVERIFIED', reason: 'CELL_NOT_FOUND' };
  return sameCellText(text, candidate.value, context.unit)
    ? { status: 'VERIFIED_CELL' }
    : { status: 'UNVERIFIED', reason: 'CELL_VALUE_MISMATCH' };
}

/** Verifies one candidate against the provided local sources. Claimed statuses are ignored. */
export function verifyCandidate(candidate: FactCandidate, context: CandidateContext,
  sources: ReadonlyMap<string, EvidenceSource>): CandidateCheck {
  const source = sources.get(candidate.source.sourceId);
  if (!source) return { status: 'UNVERIFIED', reason: 'SOURCE_NOT_PROVIDED' };
  if (candidate.source.sha256 && candidate.source.sha256 !== source.sha256) return { status: 'UNVERIFIED', reason: 'SOURCE_HASH_MISMATCH' };
  if (source.kind === 'pdf') {
    return candidate.source.cell ? { status: 'UNVERIFIED', reason: 'SOURCE_KIND_MISMATCH' } : verifyPdfCandidate(source, candidate, context);
  }
  return verifySheetCandidate(source, candidate, context);
}

export interface VerifiedCandidate {
  readonly value: string;
  readonly source: SourceReference;
  readonly status: CandidateVerification;
  readonly reason?: VerificationReason;
}
export interface VerifiedValue {
  /** Same id as `decisionKey(section, row, modelIndex)`. */
  readonly id: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly rowId: string;
  readonly label: string;
  readonly unit: string;
  readonly condition: string;
  readonly modelIndex: number;
  readonly model: string;
  readonly status: ValueVerificationStatus | 'MISSING';
  readonly candidates: readonly VerifiedCandidate[];
  /** Index of the candidate to use when the status is VERIFIED_TEXT or VERIFIED_CELL. */
  readonly selected?: number;
  /** Reason given by the proposal for a missing value. */
  readonly missingReason?: string;
}
export interface FactVerificationReport {
  /** The proposal with each candidate's `verification` recomputed locally. */
  readonly proposal: FactProposal;
  readonly values: readonly VerifiedValue[];
  readonly counts: Readonly<Record<ValueVerificationStatus | 'MISSING', number>>;
  /** Sources that support at least one verified, visual-only or conflicting value. */
  readonly usedSourceIds: readonly string[];
}

const EVIDENCE: ReadonlySet<CandidateVerification> = new Set(['VERIFIED_TEXT', 'VERIFIED_CELL', 'VISUAL_ONLY']);
/** Aggregates candidate statuses into one value status; differing evidence is a CONFLICT. */
export function valueStatus(candidates: readonly Pick<VerifiedCandidate, 'value' | 'status'>[]):
  { status: ValueVerificationStatus; selected?: number } {
  const evidence = candidates.filter(item => EVIDENCE.has(item.status));
  if (new Set(evidence.map(item => normalizeEvidenceWhitespace(item.value))).size > 1) return { status: 'CONFLICT' };
  const selected = candidates.findIndex(item => isVerifiedStatus(item.status));
  if (selected >= 0) return { status: candidates[selected].status, selected };
  return { status: evidence.length ? 'VISUAL_ONLY' : 'UNVERIFIED' };
}

/**
 * Verifies every value of an untrusted proposal against local sources.
 * Throws only when the proposal itself is malformed (schema), never because
 * of a single value: unsupported values come back as UNVERIFIED.
 */
export function verifyFactProposal(untrusted: unknown, sources: readonly EvidenceSource[]): FactVerificationReport {
  const proposal = FactProposalSchema.parse(untrusted);
  const byId = new Map<string, EvidenceSource>();
  for (const source of sources) {
    if (byId.has(source.sourceId)) throw new Error('FACT_SOURCE_DUPLICATE');
    byId.set(source.sourceId, source);
  }
  const labels = proposal.sections.flatMap(section => section.rows.map(row => row.label));
  const values: VerifiedValue[] = [];
  const used = new Set<string>();
  const counts: Record<ValueVerificationStatus | 'MISSING', number> =
    { VERIFIED_TEXT: 0, VERIFIED_CELL: 0, VISUAL_ONLY: 0, UNVERIFIED: 0, CONFLICT: 0, MISSING: 0 };
  const stamped: FactProposal = {
    ...proposal,
    sections: proposal.sections.map(section => ({ ...section, rows: section.rows.map(row => ({
      ...row,
      values: row.values.map((fact, modelIndex) => {
        const base = {
          id: decisionKey(section.id, row.id, modelIndex), sectionId: section.id, sectionTitle: section.title,
          rowId: row.id, label: row.label, unit: row.unit, condition: row.condition,
          modelIndex, model: proposal.models[modelIndex],
        };
        if (fact.status === 'missing') {
          values.push({ ...base, status: 'MISSING', candidates: [], missingReason: fact.reason });
          counts.MISSING++;
          return fact;
        }
        const context: CandidateContext = {
          model: base.model, models: proposal.models, modelIndex, label: row.label, labels, unit: row.unit, condition: row.condition,
        };
        const checked = (fact.status === 'known' ? [fact.candidate] : fact.candidates).map(item => {
          const result = verifyCandidate(item, context, byId);
          return { value: item.value, source: item.source, status: result.status, ...(result.reason ? { reason: result.reason } : {}) };
        });
        const outcome = valueStatus(checked);
        for (const item of checked) if (EVIDENCE.has(item.status)) used.add(item.source.sourceId);
        values.push({ ...base, status: outcome.status, candidates: checked,
          ...(outcome.selected === undefined ? {} : { selected: outcome.selected }) });
        counts[outcome.status]++;
        const withStatus = (item: FactCandidate, index: number): FactCandidate => ({ ...item, verification: checked[index].status });
        return fact.status === 'known'
          ? { status: 'known' as const, candidate: withStatus(fact.candidate, 0) }
          : { status: 'conflict' as const, candidates: fact.candidates.map(withStatus) };
      }),
    })) })),
  };
  return { proposal: stamped, values, counts, usedSourceIds: [...used].sort() };
}

const where = (source: SourceReference) => !source.cell ? `página ${source.page}`
  : source.cell.sheet ? `aba ${source.cell.sheet}, célula ${cellAddress(source.cell.address)}`
    : `célula ${cellAddress(source.cell.address)}`;
const REASON_TEXT: Readonly<Record<VerificationReason, (source: SourceReference, model: string) => string>> = {
  EMPTY_VALUE: () => 'O valor veio vazio.',
  QUOTE_NOT_ON_PAGE: source => `O trecho citado não foi encontrado na ${where(source)}.`,
  VALUE_NOT_IN_QUOTE: source => `O valor não aparece no trecho citado da ${where(source)}.`,
  AMBIGUOUS_QUOTE: source => `O trecho da ${where(source)} traz mais de um valor para o mesmo item.`,
  MODEL_VARIANT: (source, model) => `A ${where(source)} fala de outra versão, não exatamente do ${model}.`,
  MODEL_NOT_ON_PAGE: (source, model) => `O modelo ${model} não aparece na ${where(source)}.`,
  MODEL_ATTRIBUTION: (source, model) => `Na ${where(source)}, este valor parece ser de outro modelo, não do ${model}.`,
  LABEL_ATTRIBUTION: source => `Na ${where(source)}, este valor parece ser de outra linha da tabela.`,
  UNIT_MISMATCH: source => `A unidade não confere com a ${where(source)}.`,
  UNIT_NOT_ON_PAGE: source => `A unidade informada não aparece na ${where(source)}.`,
  CONDITION_MISMATCH: source => `A condição informada não confere com a ${where(source)}.`,
  CONDITION_NOT_ON_PAGE: source => `A condição informada não aparece na ${where(source)}.`,
  SOURCE_NOT_PROVIDED: () => 'O arquivo citado não foi enviado.',
  SOURCE_HASH_MISMATCH: () => 'O arquivo citado é diferente do arquivo enviado.',
  SOURCE_KIND_MISMATCH: () => 'A citação não combina com o tipo de arquivo.',
  PAGE_NOT_FOUND: source => `A ${where(source)} não existe no arquivo.`,
  PAGE_TEXT_INCOMPLETE: source => `A ${where(source)} tem texto demais para conferir por inteiro.`,
  PAGE_NEEDS_VISUAL_CHECK: source => `A ${where(source)} é uma imagem; confira olhando a página.`,
  VISUAL_REGION_ONLY: source => `O valor está numa imagem da ${where(source)}; confira olhando a página.`,
  COLUMN_MISMATCH: (source, model) => `Na ${where(source)}, este valor está na coluna de outro modelo, não do ${model}.`,
  COLUMN_UNCLEAR: (source, model) =>
    `Na ${where(source)}, não dá para saber pelo texto se este valor vale para o ${model}; confira olhando a página.`,
  CELL_REFERENCE_REQUIRED: () => 'Falta dizer de qual célula da planilha veio o valor.',
  CELL_NOT_FOUND: source => `A ${where(source)} não existe na planilha.`,
  CELL_VALUE_MISMATCH: source => `O valor não é igual ao da planilha (${where(source)}).`,
};

/** Short plain-Portuguese explanation of a value's status, for review screens. */
export function verificationMessage(value: VerifiedValue): string {
  if (value.status === 'MISSING') return value.missingReason?.trim() || 'Não informado nas fontes.';
  if (value.status === 'CONFLICT') {
    const options = value.candidates.filter(item => EVIDENCE.has(item.status)).map(item => `${item.value} (${where(item.source)})`);
    return `As fontes divergem: ${options.join(' e ')}. Escolha o valor certo.`;
  }
  if (value.status === 'VERIFIED_TEXT' || value.status === 'VERIFIED_CELL') {
    const chosen = value.candidates[value.selected ?? 0];
    return value.status === 'VERIFIED_CELL' ? `Conferido na planilha: ${where(chosen.source)}.` : `Conferido no texto da ${where(chosen.source)}.`;
  }
  const first = value.status === 'VISUAL_ONLY' ? value.candidates.find(item => item.status === 'VISUAL_ONLY') : value.candidates[0];
  if (!first) return 'Não foi possível conferir este valor.';
  return first.reason ? REASON_TEXT[first.reason](first.source, value.model) : `Confira olhando a ${where(first.source)}.`;
}
