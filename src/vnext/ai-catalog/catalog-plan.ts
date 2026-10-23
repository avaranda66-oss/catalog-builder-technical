import type { Page, TableModel } from '../domain';
import { TO_FILL, presysArchetype, type PresysArchetypeFills, type PresysArchetypeId, type PresysTableFillRow } from '../library/presys-archetypes';
import { estimateTableHeightMm } from '../editor/table-paste-import';
import {
  PLAN_LIMITS, PLAN_PAGE_KINDS, planPageKind, type PlanBrief, type PlanPageKind, type PlanPageKindId,
} from './catalog-plan-contract';
import { isVerifiedStatus, type CatalogDraftPlan, type CatalogDraftPlanPage } from './contracts';
import { resolvePosition, type DraftFactSet } from './draft-compiler';
import { canonicalDegreeSign, valueDisplayText } from './extraction-review';
import { normalizeSymbolText } from './fact-extraction';
import type { ExtractedPdf } from './pdf-intake';
import { buildPlanTemplatePage, type CompiledPagePlan, type PagePlanEntry } from './page-plan-apply';

/**
 * FR-70 in the browser: what goes to `plan_draft` (the brief) and what comes back from it, checked here before
 * anything reaches a page.
 *
 * The brief carries the text of the PDF pages read on this computer and ONLY the facts already checked against
 * those pages (FR-67). The plan that comes back is untrusted:
 * - every `[[VNEXT_TECH_n]]` token must point to a literal that is printed on the cited page of the cited file
 *   (or on another page of the same file), or to a checked fact; the text written is the literal as printed, or
 *   the fact's own value. A literal that is not there becomes "A COMPLETAR" and is listed as pending;
 * - a text with a digit OUTSIDE a token (other than a product name of the brief) is rejected whole: the field
 *   keeps the model's "A COMPLETAR" and the reason is listed;
 * - the specification table is never taken from the plan: it is compiled from the checked facts.
 */

export interface PlanSourceFile {
  /** "arquivo-1"… */
  readonly id: string;
  readonly fileName: string;
  readonly pdf: ExtractedPdf;
}
export interface PlanPhoto { readonly id: string; readonly fileName: string }

/* ---------------------------------------------------------------------------------------------------------- */
/* Brief                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------- */

const pageTextForPrompt = (text: string) => normalizeSymbolText(text).replace(/[^\S\n]{2,}/gu, '  ').replace(/\n{3,}/gu, '\n\n').trim();
const oneLine = (text: string, max: number) => text.replace(/[\r\n\t]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

export interface BuiltBrief {
  readonly brief: PlanBrief;
  /** Fact id of the brief ("f3") → position id of the fact set. */
  readonly facts: ReadonlyMap<string, string>;
  /** Pages left out or shortened to fit the request (0 for the TA folder). */
  readonly shortenedPages: number;
}

/** The request body of `plan_draft`: bounded the same way the server parses it. */
export function buildPlanBrief(input: {
  readonly files: readonly PlanSourceFile[];
  readonly set?: DraftFactSet;
  readonly photos?: readonly PlanPhoto[];
  readonly title?: string;
  readonly instructions?: string;
}): BuiltBrief {
  const files = input.files.slice(0, PLAN_LIMITS.maxFiles);
  const pages = files.flatMap(file => file.pdf.pages.filter(page => page.text.trim()).slice(0, PLAN_LIMITS.maxPagesPerFile));
  const perPage = Math.min(PLAN_LIMITS.maxPageTextChars, Math.floor(PLAN_LIMITS.maxTotalTextChars / Math.max(1, pages.length)));
  let shortenedPages = 0;
  const briefFiles = files.map(file => {
    const withText = file.pdf.pages.filter(page => page.text.trim());
    shortenedPages += Math.max(0, withText.length - PLAN_LIMITS.maxPagesPerFile);
    return {
      id: file.id, name: oneLine(file.fileName, PLAN_LIMITS.nameChars) || file.id,
      pages: withText.slice(0, PLAN_LIMITS.maxPagesPerFile).map(page => {
        const text = pageTextForPrompt(page.text);
        if (text.length > perPage) shortenedPages++;
        return { page: page.number, text: text.slice(0, perPage) };
      }),
    };
  }).filter(file => file.pages.length > 0);
  const facts = new Map<string, string>();
  const briefFacts: PlanBrief['facts'][number][] = [];
  const set = input.set;
  if (set) {
    const rows = new Map(set.rows.map(row => [row.ref, row]));
    for (const position of set.positions) {
      if (position.kind !== 'value' || briefFacts.length >= PLAN_LIMITS.maxFacts) continue;
      const resolution = resolvePosition(set, position);
      if (!('candidate' in resolution)) continue;
      const candidate = position.candidates[resolution.candidate];
      const row = rows.get(position.rowRef);
      const model = set.models[position.modelIndex];
      if (!candidate || !isVerifiedStatus(candidate.status) || !row || !model) continue;
      const value = oneLine(valueDisplayText(candidate.value, candidate.unit), PLAN_LIMITS.factChars);
      const label = oneLine(row.label, PLAN_LIMITS.factChars);
      if (!value || !label) continue;
      const id = `f${briefFacts.length + 1}`;
      facts.set(id, position.id);
      briefFacts.push({ id, section: oneLine(row.sectionTitle, PLAN_LIMITS.factChars), label,
        model: oneLine(model, PLAN_LIMITS.modelChars), value });
    }
  }
  const models = [...new Set((set?.models ?? []).map(model => oneLine(model, PLAN_LIMITS.modelChars)).filter(Boolean))]
    .slice(0, PLAN_LIMITS.maxModels);
  const brief: PlanBrief = {
    title: oneLine(input.title ?? set?.title ?? '', PLAN_LIMITS.titleChars),
    models, facts: briefFacts, files: briefFiles,
    photos: (input.photos ?? []).slice(0, PLAN_LIMITS.maxPhotos)
      .map((photo, index) => ({ id: `foto-${index + 1}`, name: oneLine(photo.fileName, PLAN_LIMITS.nameChars) || `foto-${index + 1}` })),
    // eslint-disable-next-line no-control-regex
    instructions: (input.instructions ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '').slice(0, PLAN_LIMITS.maxInstructionChars),
  };
  return { brief, facts, shortenedPages };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Checking every literal                                                                                     */
/* ---------------------------------------------------------------------------------------------------------- */

/** Comparable form of a printed run: symbol fonts, degree signs, dashes, quotes, ligatures and spaces unified. */
export function matchableText(text: string): string {
  return canonicalDegreeSign(normalizeSymbolText(text)).normalize('NFKC')
    .replace(/[‐-―−]/gu, '-').replace(/[“”„″]/gu, '"').replace(/[‘’′]/gu, "'")
    .replace(/\s+/gu, ' ').trim();
}
const compact = (text: string) => text.replace(/\s+/gu, '');

export type PlanLiteralProblem = 'unknown-literal' | 'unknown-file' | 'not-on-page' | 'fact-not-checked';
export interface PlanLiteralUse {
  readonly n: number;
  /** What the page shows: the literal as printed, the fact's own value, or "" when not checked. */
  readonly text: string;
  readonly ok: boolean;
  /** "presys-ta-folder.pdf · página 9" or "valor conferido da tabela: Resolution · TA-25N". */
  readonly where: string;
  /** The text the AI copied (shown when it was not found). */
  readonly copied: string;
  readonly problem?: PlanLiteralProblem;
}
export type PlanTextProblem = 'free-digit' | 'bad-token' | 'too-long' | 'empty';
export interface PlanText {
  readonly status: 'ok' | 'pending' | 'rejected';
  /** The text with every token replaced (unchecked ones by "A COMPLETAR"); absent when rejected. */
  readonly text?: string;
  readonly uses: readonly PlanLiteralUse[];
  readonly problem?: PlanTextProblem;
}

interface CheckContext {
  readonly files: readonly PlanSourceFile[];
  readonly set?: DraftFactSet;
  readonly facts: ReadonlyMap<string, string>;
  readonly literals: ReadonlyMap<number, CatalogDraftPlan['literals'][number]>;
  /** Product names that may be written without a token, longest first. */
  readonly names: readonly string[];
  readonly pageTexts: ReadonlyMap<string, readonly { readonly page: number; readonly text: string; readonly compact: string }[]>;
}

const TOKEN = /\[\[VNEXT_TECH_(\d{1,3})\]\]/gu;
const DIGIT = /\p{Nd}/u;

function checkLiteral(n: number, context: CheckContext): PlanLiteralUse {
  const literal = context.literals.get(n);
  if (!literal) return { n, text: '', ok: false, where: '', copied: '', problem: 'unknown-literal' };
  const copied = literal.text.trim();
  const factId = literal.fact.trim();
  if (factId) {
    const set = context.set, positionId = context.facts.get(factId);
    const position = set && positionId ? set.positions.find(item => item.id === positionId) : undefined;
    const resolution = set && position ? resolvePosition(set, position) : undefined;
    const candidate = position && resolution && 'candidate' in resolution ? position.candidates[resolution.candidate] : undefined;
    const row = position && set ? set.rows.find(item => item.ref === position.rowRef) : undefined;
    if (!set || !position || !candidate || !isVerifiedStatus(candidate.status) || !row) {
      return { n, text: '', ok: false, where: 'fato não conferido', copied, problem: 'fact-not-checked' };
    }
    return { n, text: valueDisplayText(candidate.value, candidate.unit), ok: true, copied,
      where: `valor conferido da tabela: ${row.label.replace(/\s*:\s*$/u, '')} · ${set.models[position.modelIndex]}` };
  }
  const file = context.files.find(item => item.id === literal.file.trim());
  if (!file) return { n, text: '', ok: false, where: '', copied, problem: 'unknown-file' };
  const wanted = matchableText(copied);
  const pages = context.pageTexts.get(file.id) ?? [];
  const hit = (page: { text: string; compact: string }) => Boolean(wanted) && (page.text.includes(wanted) || page.compact.includes(compact(wanted)));
  const cited = pages.find(page => page.page === literal.page);
  const found = cited && hit(cited) ? cited : pages.find(hit);
  if (!found) {
    return { n, text: '', ok: false, copied, problem: 'not-on-page',
      where: `${file.fileName} · ${literal.page > 0 ? `página ${literal.page}` : 'página não informada'}` };
  }
  return { n, text: canonicalDegreeSign(normalizeSymbolText(copied)).replace(/\s+/gu, ' '), ok: true, copied,
    where: `${file.fileName} · página ${found.page}` };
}

function stripNames(text: string, names: readonly string[]): string {
  let rest = text;
  for (const name of names) rest = rest.split(name).join(' ');
  return rest;
}

/** Checks one text the AI wrote (a field, a cell, a note); `maxChars` after the tokens are replaced. */
export function checkPlanText(raw: string, context: CheckContext, maxChars: number = PLAN_LIMITS.textChars): PlanText {
  const text = raw.replace(/\r\n?/gu, '\n');
  if (!text.trim()) return { status: 'rejected', uses: [], problem: 'empty' };
  const rest = stripNames(text.replace(TOKEN, ' '), context.names);
  if (/\[\[|\]\]|VNEXT_TECH/u.test(rest)) return { status: 'rejected', uses: [], problem: 'bad-token' };
  if (DIGIT.test(rest)) return { status: 'rejected', uses: [], problem: 'free-digit' };
  const uses: PlanLiteralUse[] = [];
  const resolved = text.replace(TOKEN, (_, digits: string) => {
    const use = checkLiteral(Number(digits), context);
    uses.push(use);
    return use.ok ? use.text : TO_FILL;
  }).trim();
  // Tolerance for the model's own count: the frame budget is an estimate, the A4 check measures afterwards.
  if (resolved.length > Math.ceil(maxChars * 1.15)) return { status: 'rejected', uses, problem: 'too-long' };
  return { status: uses.every(use => use.ok) ? 'ok' : 'pending', text: resolved, uses };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* The checked plan                                                                                           */
/* ---------------------------------------------------------------------------------------------------------- */

export interface PlanField {
  readonly slot: string;
  readonly label: string;
  readonly kind: 'text' | 'table';
  readonly status: 'ok' | 'pending' | 'rejected';
  readonly text?: string;
  readonly table?: { readonly header?: readonly string[]; readonly rows: readonly PresysTableFillRow[]; readonly notes?: readonly string[] };
  readonly uses: readonly PlanLiteralUse[];
  /** Plain Portuguese, for anything that is not simply checked. */
  readonly message?: string;
}
export interface PlanPage {
  readonly key: string;
  readonly kind: PlanPageKindId;
  readonly archetype: PresysArchetypeId;
  readonly label: string;
  /** What the page shows, in the AI's words (tokens left out). */
  readonly purpose: string;
  /** "presys-ta-folder (4).pdf · páginas 2 e 3". */
  readonly sources: readonly string[];
  readonly fields: readonly PlanField[];
  /** The page is the specification table compiled from the checked facts. */
  readonly specTable: boolean;
  /** Added by the app (the plan had no cover, specification or back cover page). */
  readonly addedByApp: boolean;
}
export interface CheckedCatalogPlan {
  readonly title: string;
  readonly pages: readonly PlanPage[];
  readonly questions: readonly string[];
  /** Literals checked / not found; fields rejected (digit outside a token, too long). */
  readonly counts: { readonly checked: number; readonly notFound: number; readonly rejected: number };
}

const PROBLEM_TEXT: Record<PlanTextProblem, string> = {
  'free-digit': 'A IA escreveu um número sem dizer de onde ele veio. Este campo não entrou; escreva-o você.',
  'bad-token': 'A IA marcou um valor de um jeito que não deu para conferir. Este campo não entrou; escreva-o você.',
  'too-long': 'O texto da IA ficou longo demais para este espaço. Este campo não entrou; escreva um texto mais curto.',
  empty: 'A IA deixou este campo vazio.',
};
const notFoundText = (uses: readonly PlanLiteralUse[]) => {
  const missing = uses.filter(use => !use.ok);
  if (!missing.length) return undefined;
  const first = missing[0];
  const what = first.copied ? `“${first.copied}”` : 'um valor';
  return missing.length === 1
    ? `${what} não foi achado ${first.where ? `em ${first.where}` : 'no arquivo'}: ficou “${TO_FILL}” para você conferir.`
    : `${missing.length} valores não foram achados no arquivo (por exemplo ${what}): ficaram “${TO_FILL}” para você conferir.`;
};
const pageList = (pages: readonly number[]) => pages.length === 1 ? `página ${pages[0]}`
  : `páginas ${pages.slice(0, -1).join(', ')} e ${pages.at(-1)}`;

function slotLabels(archetype: PresysArchetypeId): ReadonlyMap<string, string> {
  return new Map(presysArchetype(archetype).slots.map(slot => [slot.id, slot.label]));
}
const LINE_PREFIX: Readonly<Record<string, string>> = { 'P2.highlights': '▸ ', 'P7.delivery': '– ' };
const BULLET = /^[\s▸•·\-–—*]+/u;

function checkTextField(kind: PlanPageKind, slot: string, raw: string, context: CheckContext, label: string): PlanField | undefined {
  const spec = kind.texts.find(item => item.slot === slot);
  if (!spec) return undefined;
  let source = raw;
  let dropped = 0;
  if (spec.maxLines) {
    const lines = raw.split(/\r?\n/u).map(line => line.replace(BULLET, '').trim()).filter(Boolean);
    dropped = Math.max(0, lines.length - spec.maxLines);
    source = lines.slice(0, spec.maxLines).map(line => `${LINE_PREFIX[slot] ?? ''}${line}`).join('\n');
  }
  if (/^P8\.insert-\d-code$/u.test(slot) && !/^c[óo]digo/iu.test(source.trim())) source = `Código: ${source.trim()}`;
  const checked = checkPlanText(source, context, spec.maxChars + (spec.maxLines ? spec.maxLines * 2 : 0));
  const message = checked.problem ? PROBLEM_TEXT[checked.problem] : [notFoundText(checked.uses),
    dropped ? `${dropped} ${dropped === 1 ? 'item ficou' : 'itens ficaram'} de fora por falta de espaço.` : undefined].filter(Boolean).join(' ') || undefined;
  return { slot, label, kind: 'text', status: checked.status, ...(checked.text !== undefined ? { text: checked.text } : {}),
    uses: checked.uses, ...(message ? { message } : {}) };
}

function checkTableField(kind: PlanPageKind, table: CatalogDraftPlanPage['tables'][number], context: CheckContext, label: string): PlanField | undefined {
  const spec = kind.tables.find(item => item.slot === table.slot);
  if (!spec) return undefined;
  const uses: PlanLiteralUse[] = [];
  let rejected = 0;
  const cell = (raw: string, max: number) => {
    if (!raw.trim()) return '';
    const checked = checkPlanText(raw, context, max);
    uses.push(...checked.uses);
    if (checked.status === 'rejected') { rejected++; return TO_FILL; }
    return checked.text ?? '';
  };
  const header = table.header.map(text => cell(text, 60)).filter((text, index, all) => text || index < all.length);
  const width = Math.min(PLAN_LIMITS.maxCells, Math.max(header.length, ...table.rows.map(row => row.cells.length), 1));
  const rows: PresysTableFillRow[] = [];
  for (const row of table.rows.slice(0, spec.maxRows)) {
    if (row.section.trim() && row.cells.every(text => !text.trim())) { rows.push({ section: cell(row.section, 80) }); continue; }
    const cells = row.cells.slice(0, width).map(text => cell(text, PLAN_LIMITS.cellChars));
    if (cells.every(text => !text)) continue;
    rows.push([...cells, ...new Array<string>(Math.max(0, width - cells.length)).fill('')]);
  }
  const dropped = Math.max(0, table.rows.length - spec.maxRows);
  const notes = table.notes.map(text => cell(text, 200)).filter(Boolean);
  if (!rows.length) return undefined;
  const status: PlanField['status'] = rejected || uses.some(use => !use.ok) ? 'pending' : 'ok';
  const message = [rejected ? `${rejected} ${rejected === 1 ? 'célula tinha' : 'células tinham'} número sem origem e ${rejected === 1 ? 'ficou' : 'ficaram'} “${TO_FILL}”.` : undefined,
    notFoundText(uses), dropped ? `${dropped} ${dropped === 1 ? 'linha ficou' : 'linhas ficaram'} de fora por falta de espaço.` : undefined,
    'Confira se cada código está na linha certa.'].filter(Boolean).join(' ');
  return { slot: table.slot, label, kind: 'table', status, uses, message,
    table: { ...(header.some(Boolean) ? { header: header.length >= width ? header.slice(0, width) : [...header, ...new Array<string>(width - header.length).fill('')] } : {}),
      rows, ...(notes.length ? { notes } : {}) } };
}

/** Product names of the brief, longest first (so "TA-25NL" is removed before "TA-25N"). */
function namesOf(set: DraftFactSet | undefined, extra: readonly string[] = []): string[] {
  return [...new Set([...(set?.models ?? []), ...extra].map(name => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
}

/**
 * Checks the AI's plan against the files read here and the checked facts. Deterministic. The pages come in the
 * AI's order, at most the number each kind allows; the cover is first and the back cover last; a missing cover,
 * back cover, or (with checked facts) specification page is added by the app, empty, for the person to fill.
 */
export function checkCatalogPlan(plan: CatalogDraftPlan, input: {
  readonly files: readonly PlanSourceFile[];
  readonly set?: DraftFactSet;
  /** Fact id of the brief → position id (`buildPlanBrief`). */
  readonly facts: ReadonlyMap<string, string>;
  readonly models?: readonly string[];
}): CheckedCatalogPlan {
  const pageTexts = new Map(input.files.map(file => [file.id, file.pdf.pages.map(page => {
    const text = matchableText(page.text);
    return { page: page.number, text, compact: compact(text) };
  })]));
  const context: CheckContext = {
    files: input.files, set: input.set, facts: input.facts,
    literals: new Map(plan.literals.map(literal => [literal.id, literal])),
    names: namesOf(input.set, input.models), pageTexts,
  };
  const used = new Map<PlanPageKindId, number>();
  const pages: PlanPage[] = [];
  plan.pages.forEach((raw, index) => {
    const kind = planPageKind(raw.kind);
    if (!kind) return;
    const count = used.get(raw.kind) ?? 0;
    if (count >= kind.max) return;
    used.set(raw.kind, count + 1);
    const labels = slotLabels(kind.archetype);
    const fields: PlanField[] = [];
    const seen = new Set<string>();
    if (raw.kind !== 'especificacoes') {
      for (const text of raw.texts) {
        if (seen.has(text.slot)) continue;
        const field = checkTextField(kind, text.slot, text.text, context, labels.get(text.slot) ?? text.slot);
        if (field) { fields.push(field); seen.add(text.slot); }
      }
      for (const table of raw.tables) {
        if (seen.has(table.slot)) continue;
        const field = checkTableField(kind, table, context, labels.get(table.slot) ?? table.slot);
        if (field) { fields.push(field); seen.add(table.slot); }
      }
    }
    const byFile = new Map<string, number[]>();
    for (const source of raw.sourcePages) {
      const file = input.files.find(item => item.id === source.file);
      if (!file || source.page > file.pdf.pageCount) continue;
      const list = byFile.get(file.fileName) ?? [];
      if (!list.includes(source.page)) list.push(source.page);
      byFile.set(file.fileName, list);
    }
    pages.push({
      key: `pagina-${index + 1}`, kind: raw.kind, archetype: kind.archetype, label: kind.label,
      purpose: oneLine(raw.purpose.replace(TOKEN, '…'), PLAN_LIMITS.purposeChars),
      sources: [...byFile].map(([name, list]) => `${name} · ${pageList(list.sort((a, b) => a - b))}`),
      fields, specTable: raw.kind === 'especificacoes' && Boolean(input.set?.rows.length), addedByApp: false,
    });
  });
  const added = (kind: PlanPageKindId): PlanPage => {
    const spec = planPageKind(kind)!;
    return { key: `app-${kind}`, kind, archetype: spec.archetype, label: spec.label, purpose: '', sources: [], fields: [],
      specTable: kind === 'especificacoes' && Boolean(input.set?.rows.length), addedByApp: true };
  };
  if (!used.has('especificacoes') && input.set?.rows.length) {
    const at = pages.findIndex(page => PLAN_PAGE_KINDS.findIndex(item => item.kind === page.kind) > 3);
    pages.splice(at < 0 ? pages.length : at, 0, added('especificacoes'));
  }
  const cover = pages.findIndex(page => page.kind === 'capa');
  if (cover > 0) pages.unshift(...pages.splice(cover, 1));
  if (cover < 0) pages.unshift(added('capa'));
  const back = pages.findIndex(page => page.kind === 'contracapa');
  if (back >= 0 && back < pages.length - 1) pages.push(...pages.splice(back, 1));
  if (back < 0) pages.push(added('contracapa'));
  const uses = pages.flatMap(page => page.fields.flatMap(field => field.uses));
  return {
    title: plan.title.replace(TOKEN, '').trim().slice(0, PLAN_LIMITS.titleChars),
    pages,
    questions: plan.questions.map(question => oneLine(question, PLAN_LIMITS.questionChars)).filter(Boolean),
    counts: { checked: uses.filter(use => use.ok).length, notFound: uses.filter(use => !use.ok).length,
      rejected: pages.reduce((total, page) => total + page.fields.filter(field => field.status === 'rejected').length, 0) },
  };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* From the checked plan to the pages                                                                         */
/* ---------------------------------------------------------------------------------------------------------- */

/** What the person kept: page keys in the order chosen (a page left out is not in the list). */
export type PlanSelection = readonly string[];
export const defaultSelection = (plan: CheckedCatalogPlan): PlanSelection => plan.pages.map(page => page.key);

export function planPageFills(page: PlanPage): PresysArchetypeFills {
  const fills: Record<string, PresysArchetypeFills[string]> = {};
  for (const field of page.fields) {
    if (field.status === 'rejected') continue;
    if (field.kind === 'text' && field.text !== undefined) fills[field.slot] = { kind: 'text', text: field.text };
    if (field.kind === 'table' && field.table) fills[field.slot] = { kind: 'table', ...field.table };
  }
  return fills;
}

/** The entries of "aplicar plano de páginas" for the pages kept, in the order kept. */
export function catalogPlanEntries(plan: CheckedCatalogPlan, selection: PlanSelection, set?: DraftFactSet): PagePlanEntry[] {
  const byKey = new Map(plan.pages.map(page => [page.key, page]));
  return selection.flatMap((key): PagePlanEntry[] => {
    const page = byKey.get(key);
    if (!page) return [];
    if (page.specTable && set?.rows.length) return [{ kind: 'spec-table', key, set }];
    return [{ kind: 'template', key, template: page.archetype, fills: planPageFills(page) }];
  });
}

/* ---------------------------------------------------------------------------------------------------------- */
/* What stays for the person, and the A4 estimate                                                             */
/* ---------------------------------------------------------------------------------------------------------- */

export interface PlanPageReview {
  readonly key: string;
  /** Fields of the model that keep "A COMPLETAR" (text and photos), by label. */
  readonly toComplete: readonly string[];
  /** Photos and logos to choose on the page. */
  readonly photos: readonly string[];
  /** Fields whose text may not fit its box. */
  readonly mayOverflow: readonly string[];
}

const MM_PER_PT = 25.4 / 72;
const plainOf = (page: Page, id: string) => {
  const object = page.objects.find(item => item.id === id);
  return object?.type === 'text'
    ? object.text.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '').join('')) : [];
};
/** Lines a text needs in its box, with 0.55 em per character (Noto Sans is narrower: conservative). */
function textOverflows(page: Page, id: string): boolean {
  const object = page.objects.find(item => item.id === id);
  if (object?.type !== 'text') return false;
  const size = object.style.fontSizePt ?? 10, lineHeight = object.style.lineHeight ?? 1.2;
  const charMm = size * (object.style.fontWeight === 700 ? 0.58 : 0.52) * MM_PER_PT;
  const perLine = Math.max(1, Math.floor(object.frame.widthMm / charMm));
  const lines = plainOf(page, id).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return lines * size * lineHeight * MM_PER_PT > object.frame.heightMm + 0.5;
}
function tableOverflows(page: Page, id: string): boolean {
  const object = page.objects.find(item => item.id === id);
  if (object?.type !== 'table') return false;
  return estimateTableHeightMm(object.table as TableModel, undefined, object.frame.widthMm) > object.frame.heightMm + 1;
}

/** Reads each model page as it will be applied (`compilePagePlan` previews): what stays to complete, what may overflow. */
export function reviewPlanPages(plan: CheckedCatalogPlan, compiled: CompiledPagePlan): PlanPageReview[] {
  return compiled.pageRefs.flatMap(({ key, refs }) => {
    const page = plan.pages.find(item => item.key === key);
    const preview = refs[0] ? compiled.previews[refs[0]] : undefined;
    if (!page || !preview) return page ? [{ key, toComplete: [], photos: [], mayOverflow: [] }] : [];
    const slots = presysArchetype(page.archetype).slots;
    const toComplete: string[] = [], photos: string[] = [], mayOverflow: string[] = [];
    for (const slot of slots) {
      const name = slot.id.slice(slot.id.indexOf('.') + 1);
      if (slot.kind === 'image') {
        if (preview.objects.some(object => object.id === `${preview.id}-${name}-marker`)) photos.push(slot.label);
        continue;
      }
      if (slot.kind === 'text') {
        if (plainOf(preview, `${preview.id}-${name}`).join('\n').includes(TO_FILL)) toComplete.push(slot.label);
        if (page.fields.some(field => field.slot === slot.id && field.status !== 'rejected') && textOverflows(preview, `${preview.id}-${name}`)) {
          mayOverflow.push(slot.label);
        }
        continue;
      }
      const table = preview.objects.find(object => object.id === `${preview.id}-${name}-object`);
      if (table?.type === 'table' && table.table.cells.some(cell => cell.content.type === 'richText'
        && cell.content.value.paragraphs.some(paragraph => paragraph.inlines.some(inline => inline.kind === 'text' && inline.text.includes(TO_FILL))))) {
        toComplete.push(slot.label);
      }
      if (page.fields.some(field => field.slot === slot.id) && tableOverflows(preview, `${preview.id}-${name}-object`)) mayOverflow.push(slot.label);
    }
    return [{ key, toComplete, photos, mayOverflow }];
  });
}

/** A built model page for a thumbnail (the specification page is shown as its compiled table instead). */
export function planThumbnailPage(page: PlanPage): Page {
  return buildPlanTemplatePage(page.archetype, `miniatura-${page.key}`, planPageFills(page));
}
