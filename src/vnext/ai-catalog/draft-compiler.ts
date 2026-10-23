import {
  createCatalogDocument, createDocumentSession, executeApplicationAction, parseCanonicalDocument,
  type ApplicationAction, type DocumentSession,
} from '../application';
import type { TablePresetId } from '../application/contracts';
import { materializeTablePreset, tablePresetFirstColumnMm } from '../application/table-preset-registry';
import { createTableInsertSpec } from '../app/editor-defaults';
import { findObjectInTree, mmToU, plainRichText, type CatalogDocument, type DocumentStyle, type Page, type TableModel } from '../domain';
import { estimateTableHeightMm, pastedTableModel } from '../editor/table-paste-import';
import { planTableComposition, projectTableLook, tableLookSteps } from '../editor/table-look-authoring';
import { continuationTitle } from '../editor/table-split-authoring';
import { planTablePagination } from '../table/table-pagination';
import {
  isVerifiedStatus, type CandidateVerification, type Decisions, type SourceReference, type ValueVerificationStatus,
} from './contracts';
import { reviewSourceValues, valueDisplayText, type ExtractionReview } from './extraction-review';
import { findSourceDivergences, type SourceDivergence } from './fact-extraction';
import { verificationMessage, type FactVerificationReport, type VerificationReason, type VerifiedValue } from './fact-verifier';
import { pageAfterTableRun } from './intake/source-table-insert';

/**
 * FR-69 (slice 3A): deterministic draft compiler. Verified facts (FR-67 fact
 * verifier, fed by the FR-66 extraction) become typed application actions —
 * `page.add` and `object.insert` of a TableModel with its title and notes —
 * under ONE transactionId, so one Desfazer removes the whole draft.
 *
 * - T1 "Comparativo de modelos": label column + 1–6 model columns, header row.
 * - T3 "Especificações": one product, label/value, no header row.
 * Units go inline with the value (`valueDisplayText`), conditions become table
 * notes (a characteristic printed once per model, each under its own
 * condition, is ONE row with a note per model: `joinConditionSplitRows`),
 * and a table taller than its A4 page continues on new pages with the
 * header repeated and "(continuação)" in the title (FR-35 paginator).
 *
 * Nothing is invented: a value cell holds a candidate of its own fact, and
 * only when that candidate is VERIFIED_TEXT / VERIFIED_CELL (alone, or chosen
 * by the person between verified candidates of a conflict — FR-68). Every
 * other value position stays an empty cell and is listed as pending, except
 * the "—" of a model-specific row (see `resolvePosition`).
 *
 * Why this module exists (IDS: ADAPT of composition.ts + CREATE): the old
 * generator fixed 8 rows per page, forced "Unidade"/"Condição" columns and
 * split 3+3 models; it also printed placeholder words in value cells. The
 * insertion, the house presets, the readable widths and the continuation
 * logic are reused from the Wave 2 modules imported above.
 */

/* ---------------------------------------------------------------------------------------------------------- */
/* Fact set                                                                                                   */
/* ---------------------------------------------------------------------------------------------------------- */

export interface DraftCandidate {
  readonly value: string;
  /** Unit printed with this reading (the row's unit, or the other file's own unit). */
  readonly unit: string;
  readonly status: CandidateVerification;
  readonly source: SourceReference;
  readonly reason?: VerificationReason;
}
export type DraftPositionKind = 'value' | 'condition';
export interface DraftPosition {
  /** `decisionKey(section, row, model)` for a value; `section/row/condicao` for a row condition in conflict. */
  readonly id: string;
  readonly kind: DraftPositionKind;
  /** `sectionId/rowId`. */
  readonly rowRef: string;
  /** Model column of a value; -1 for a row condition. */
  readonly modelIndex: number;
  readonly status: ValueVerificationStatus | 'MISSING';
  readonly candidates: readonly DraftCandidate[];
  /** Verified candidate used without a person (status VERIFIED_TEXT / VERIFIED_CELL). */
  readonly selected?: number;
  readonly missingReason?: string;
}
export interface DraftRow {
  readonly ref: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly rowId: string;
  /** Quantity key that lines the same row up across files (`NormalizedExtraction.rowKeys`). */
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly condition: string;
  /**
   * One condition per model (by model index, '' for none) when the row joins the rows a file prints once per
   * model, each under its own condition (`joinConditionSplitRows`); `condition` is then ''.
   */
  readonly modelConditions?: readonly string[];
}
/**
 * Everything the compiler may use, and the person's choices (FR-68). Choices
 * use the `Decisions` contract: a candidate index, or 'missing' to leave the
 * cell blank on purpose. They are recorded here BEFORE applying.
 */
export interface DraftFactSet {
  readonly version: 1;
  readonly title: string;
  readonly models: readonly string[];
  readonly rows: readonly DraftRow[];
  readonly positions: readonly DraftPosition[];
  /** File name (and revision) of each source, by source id. */
  readonly sourceNames: Readonly<Record<string, string>>;
  readonly choices: Decisions;
}

const rowRef = (sectionId: string, rowId: string) => `${sectionId}/${rowId}`;
export const conditionPositionId = (ref: string) => `${ref}/condicao`;

/** A value position that holds something: a reading of any status, or a status other than plain absence. */
const holdsReading = (position: DraftPosition) => position.kind === 'value' && (position.candidates.length > 0 || position.status !== 'MISSING');

/**
 * One characteristic printed once per model, each under its own condition — "Cooling Time: 11 min (25 °C to
 * -25 °C) / 16 min (25 °C to -35 °C) / 25 min (25 °C to -50 °C)" — reaches the fact set as one row per
 * condition (the proposal has one condition per row), each with a single model's value and "—" for the others.
 * Those rows become ONE row with the value of each model and the conditions as notes per model.
 *
 * Only when nothing can be lost or changed: same section, label and unit; all conditions different; each model
 * holds a reading in at most one of the rows and each row holds at least one; no row has a condition to choose.
 * The positions keep their ids, candidates, statuses and choices (only `rowRef` changes); the positions that
 * were plain absences ("—") of the joined rows are dropped, except one per model that holds nothing anywhere.
 */
export function joinConditionSplitRows(set: DraftFactSet): DraftFactSet {
  if (set.models.length < 2) return set;
  const byRow = new Map<string, DraftPosition[]>();
  for (const position of set.positions) byRow.set(position.rowRef, [...(byRow.get(position.rowRef) ?? []), position]);
  const valueAt = (row: DraftRow, model: number) => (byRow.get(row.ref) ?? []).find(item => item.kind === 'value' && item.modelIndex === model);
  const groups = new Map<string, DraftRow[]>();
  for (const row of set.rows) {
    if (row.modelConditions) continue;
    const id = [row.sectionId, row.label.trim(), row.unit.trim()].join('\u0000');
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const joined = new Map<string, { readonly row: DraftRow; readonly positions: DraftPosition[] } | null>();
  for (const rows of groups.values()) {
    if (rows.length < 2 || new Set(rows.map(row => row.condition.trim())).size !== rows.length) continue;
    if (rows.some(row => (byRow.get(row.ref) ?? []).some(item => item.kind === 'condition'))) continue;
    const owner: (DraftRow | undefined)[] = set.models.map(() => undefined);
    const disjoint = rows.every(row => {
      const held = (byRow.get(row.ref) ?? []).filter(holdsReading);
      return held.length > 0 && held.every(item => {
        if (item.modelIndex < 0 || item.modelIndex >= set.models.length || owner[item.modelIndex]) return false;
        owner[item.modelIndex] = row;
        return true;
      });
    });
    if (!disjoint) continue;
    const first = rows[0];
    const positions = set.models.flatMap((_, model) => {
      const kept = owner[model] ? valueAt(owner[model]!, model) : rows.map(row => valueAt(row, model)).find(Boolean);
      return kept ? [{ ...kept, rowRef: first.ref }] : [];
    });
    joined.set(first.ref, { row: { ...first, condition: '', modelConditions: owner.map(row => row?.condition.trim() ?? '') }, positions });
    for (const row of rows.slice(1)) joined.set(row.ref, null);
  }
  if (!joined.size) return set;
  return {
    ...set,
    rows: set.rows.flatMap(row => { const entry = joined.get(row.ref); return entry === undefined ? [row] : entry ? [entry.row] : []; }),
    positions: [...set.positions.filter(position => !joined.has(position.rowRef)),
      ...[...joined.values()].flatMap(entry => entry?.positions ?? [])],
  };
}

/** The fact set of one verified table (one file, or one proposal with its own conflicts). */
export function factSetFromReport(report: FactVerificationReport, options: {
  readonly title?: string; readonly rowKeys?: Readonly<Record<string, string>>;
  /**
   * Join the rows printed once per model under different conditions (`joinConditionSplitRows`). Default false:
   * `withSourceDivergences` works on the rows as read, and `factSetFromReviews` joins after it.
   */
  readonly joinSplitRows?: boolean;
} = {}): DraftFactSet {
  const { proposal } = report;
  const rows: DraftRow[] = proposal.sections.flatMap(section => section.rows.map(row => {
    const ref = rowRef(section.id, row.id);
    return { ref, sectionId: section.id, sectionTitle: section.title, rowId: row.id, key: options.rowKeys?.[ref] ?? row.id,
      label: row.label, unit: row.unit, condition: row.condition };
  }));
  const positions: DraftPosition[] = report.values.map(value => ({
    id: value.id, kind: 'value', rowRef: rowRef(value.sectionId, value.rowId), modelIndex: value.modelIndex, status: value.status,
    candidates: value.candidates.map(item => ({ value: item.value, unit: value.unit, status: item.status, source: item.source,
      ...(item.reason ? { reason: item.reason } : {}) })),
    ...(value.selected === undefined ? {} : { selected: value.selected }),
    ...(value.missingReason ? { missingReason: value.missingReason } : {}),
  }));
  const set: DraftFactSet = {
    version: 1, title: (options.title ?? proposal.title).trim() || proposal.title, models: [...proposal.models], rows, positions,
    sourceNames: Object.fromEntries(report.sourceNames), choices: {},
  };
  return options.joinSplitRows ? joinConditionSplitRows(set) : set;
}

const sameReading = (a: DraftCandidate, b: DraftCandidate) =>
  a.source.sourceId === b.source.sourceId && a.source.page === b.source.page && a.value === b.value;

/**
 * Files that disagree (`findSourceDivergences`, e.g. TA-25N "-25 °C to +155 °C"
 * in the folder x "-25 a 140" in the manual) turn the matching value into a
 * CONFLICT between the readings, each with the status it got in its own file;
 * a condition that differs ("23 °C" x "20 °C") becomes a row condition to
 * choose. Nothing is picked here: the person chooses in the pending panel.
 * Expects the rows as read (before `joinConditionSplitRows`).
 */
export function withSourceDivergences(set: DraftFactSet, divergences: readonly SourceDivergence[],
  sourceNames: ReadonlyMap<string, string> | Readonly<Record<string, string>> = {}): DraftFactSet {
  const names = { ...set.sourceNames, ...(sourceNames instanceof Map ? Object.fromEntries(sourceNames) : sourceNames) };
  const rowsByKey = new Map<string, DraftRow[]>();
  for (const row of set.rows) rowsByKey.set(row.key, [...(rowsByKey.get(row.key) ?? []), row]);
  const readingCandidate = (reading: SourceDivergence['readings'][number], value: string, unit: string): DraftCandidate => ({
    value, unit, status: reading.status === 'CONFLICT' || reading.status === 'MISSING' ? 'UNVERIFIED' : reading.status,
    source: { sourceId: reading.sourceId, page: reading.page, quote: reading.quote },
  });
  const unique = (items: DraftCandidate[]) => items.filter((item, index) => items.findIndex(other => sameReading(other, item)) === index);
  let positions = [...set.positions];
  const conditions = new Map<string, DraftCandidate[]>();
  // A quantity printed once per condition has one row per condition: a model's divergence belongs to the row
  // that holds that model's reading, not to the rows where it is absent ("—").
  const holds = (row: DraftRow, model: number) =>
    set.positions.some(position => position.rowRef === row.ref && position.modelIndex === model && holdsReading(position));
  for (const divergence of divergences) {
    const model = set.models.indexOf(divergence.model);
    const keyed = rowsByKey.get(divergence.key) ?? [];
    const holding = model >= 0 ? keyed.filter(row => holds(row, model)) : [];
    for (const row of holding.length ? holding : keyed) {
      if (divergence.field === 'condition') {
        const readings = [...(conditions.get(row.ref) ?? []), ...divergence.readings.map(reading => readingCandidate(reading, reading.condition, ''))];
        conditions.set(row.ref, readings.filter((item, index) =>
          readings.findIndex(other => other.source.sourceId === item.source.sourceId && other.value === item.value) === index));
        continue;
      }
      if (model < 0) continue;
      positions = positions.map(position => {
        if (position.kind !== 'value' || position.rowRef !== row.ref || position.modelIndex !== model) return position;
        const merged = unique([...position.candidates, ...divergence.readings.map(reading => readingCandidate(reading, reading.value, reading.unit))]);
        return { id: position.id, kind: 'value', rowRef: position.rowRef, modelIndex: position.modelIndex, status: 'CONFLICT', candidates: merged };
      });
    }
  }
  for (const [ref, candidates] of conditions) {
    if (candidates.length < 2) continue;
    const id = conditionPositionId(ref);
    positions = [...positions.filter(position => position.id !== id),
      { id, kind: 'condition', rowRef: ref, modelIndex: -1, status: 'CONFLICT', candidates }];
  }
  return { ...set, positions, sourceNames: names };
}

/**
 * The fact set of the files read by the server extraction (FR-66), as the app
 * reviews them: the model table of the first file gives the rows (the
 * person's file, usually the Portuguese manual); the other files only add
 * their readings where they disagree with it.
 */
export function factSetFromReviews(reviews: readonly ExtractionReview[], options: { readonly title?: string } = {}): DraftFactSet {
  const primary = reviews.flatMap(review => review.tables).find(table => table.kind === 'models');
  if (!primary) throw new Error('DRAFT_NO_MODEL_TABLE');
  const names = Object.fromEntries(reviews.flatMap(review => review.tables.flatMap(table => [...table.report.sourceNames])));
  const set = factSetFromReport(primary.report, { title: options.title ?? primary.title, rowKeys: primary.extraction.rowKeys });
  return joinConditionSplitRows(withSourceDivergences(set, findSourceDivergences(reviews.flatMap(reviewSourceValues)), names));
}

/** Candidates a person may choose: only values verified in their own file. */
export function choosableCandidates(position: DraftPosition): number[] {
  if (position.status !== 'CONFLICT') return [];
  return position.candidates.flatMap((item, index) => isVerifiedStatus(item.status) ? [index] : []);
}

/**
 * Records the person's choice for a conflict (FR-68) and returns the new fact
 * set. Only a verified candidate, or 'missing' ("Deixar em branco"), is
 * accepted; a value that needs no choice cannot be overridden.
 */
export function recordChoice(set: DraftFactSet, positionId: string, choice: number | 'missing' | null): DraftFactSet {
  const position = set.positions.find(item => item.id === positionId);
  if (!position || position.status !== 'CONFLICT') throw new Error('DRAFT_CHOICE_INVALID');
  const choices = { ...set.choices };
  if (choice === null) delete choices[positionId];
  else if (choice === 'missing' || choosableCandidates(position).includes(choice)) choices[positionId] = choice;
  else throw new Error('DRAFT_CHOICE_INVALID');
  return { ...set, choices };
}

export type PositionResolution =
  | { readonly state: 'verified' | 'chosen'; readonly candidate: number }
  | { readonly state: 'pending' | 'blank' | 'notApplicable' };
/** Literal text of a cell that does not apply to its model (never a number, never a pending item). */
export const NOT_APPLICABLE_TEXT = '—';
const holdsVerifiedValue = (position: DraftPosition) =>
  (position.status === 'VERIFIED_TEXT' || position.status === 'VERIFIED_CELL')
  && Boolean(position.candidates[position.selected ?? -1]) && isVerifiedStatus(position.candidates[position.selected ?? -1].status);
/**
 * Which candidate fills a position, if any. A stale or forged choice is ignored (the position stays pending).
 * Model-specific row (J2-lite): a value with NO candidate at all, in a row where another model has a verified value,
 * is "notApplicable" ("—", not pending); any candidate, or a row with no verified value, stays empty and pending.
 */
export function resolvePosition(set: DraftFactSet, position: DraftPosition): PositionResolution {
  if (holdsVerifiedValue(position)) return { state: 'verified', candidate: position.selected! };
  if (position.kind === 'value' && position.status === 'MISSING' && position.candidates.length === 0
    && set.positions.some(other => other.kind === 'value' && other.rowRef === position.rowRef && holdsVerifiedValue(other))) {
    return { state: 'notApplicable' };
  }
  if (position.status !== 'CONFLICT') return { state: 'pending' };
  const choice = set.choices[position.id];
  if (choice === 'missing') return { state: 'blank' };
  return typeof choice === 'number' && choosableCandidates(position).includes(choice) ? { state: 'chosen', candidate: choice } : { state: 'pending' };
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Pending list (FR-68)                                                                                       */
/* ---------------------------------------------------------------------------------------------------------- */

export interface PendingCandidate extends DraftCandidate {
  readonly index: number;
  readonly choosable: boolean;
  /** "presys-ta-folder.pdf · página 9" or "tabela.xlsx · aba Dados, célula B7". */
  readonly where: string;
}
export interface PendingFact {
  readonly id: string;
  readonly kind: DraftPositionKind;
  readonly sectionTitle: string;
  readonly label: string;
  /** Model of a value; absent for a row condition. */
  readonly model?: string;
  readonly status: ValueVerificationStatus | 'MISSING';
  /** Plain-Portuguese explanation, in the verifier's words. */
  readonly message: string;
  readonly candidates: readonly PendingCandidate[];
  readonly choice?: number | 'missing';
  /** A verified candidate was chosen: the cell (or the note) gets it. */
  readonly resolved: boolean;
}

/** "presys-ta-folder.pdf · página 9" / "planilha.xlsx · aba Dados, célula B7". */
export function sourcePlace(source: SourceReference, names: Readonly<Record<string, string>>): string {
  const place = source.cell
    ? `${source.cell.sheet ? `aba ${source.cell.sheet}, ` : ''}célula ${source.cell.address.replace(/\$/gu, '').toUpperCase()}`
    : `página ${source.page}`;
  const name = names[source.sourceId];
  return name ? `${name} · ${place}` : place;
}

function messageFor(set: DraftFactSet, row: DraftRow, position: DraftPosition): string {
  const names = new Map(Object.entries(set.sourceNames));
  if (position.kind === 'condition') {
    const options = position.candidates.map(item => `“${item.value}” (${sourcePlace(item.source, set.sourceNames)})`);
    return `As fontes divergem na condição de “${row.label}”: ${options.join('; ')}. Escolha a condição certa.`;
  }
  const value: VerifiedValue = {
    id: position.id, sectionId: row.sectionId, sectionTitle: row.sectionTitle, rowId: row.rowId, label: row.label,
    unit: row.unit, condition: row.modelConditions?.[position.modelIndex] ?? row.condition,
    modelIndex: position.modelIndex, model: set.models[position.modelIndex] ?? '',
    status: position.status, ...(position.selected === undefined ? {} : { selected: position.selected }),
    ...(position.missingReason ? { missingReason: position.missingReason } : {}),
    candidates: position.candidates.map(item => ({
      value: position.status === 'CONFLICT' ? valueDisplayText(item.value, item.unit) : item.value, source: item.source,
      status: item.status, ...(item.reason ? { reason: item.reason } : {}),
    })),
  };
  return verificationMessage(value, names);
}

/** Every value (or row condition) that will not be filled without a person, in table order. */
export function pendingFacts(set: DraftFactSet): PendingFact[] {
  const rows = new Map(set.rows.map(row => [row.ref, row]));
  const order = new Map(set.rows.map((row, index) => [row.ref, index]));
  return set.positions
    .filter(position => rows.has(position.rowRef) && !['verified', 'notApplicable'].includes(resolvePosition(set, position).state))
    .sort((a, b) => (order.get(a.rowRef)! - order.get(b.rowRef)!) || (a.modelIndex - b.modelIndex))
    .map(position => {
      const row = rows.get(position.rowRef)!;
      const choosable = new Set(choosableCandidates(position));
      const choice = set.choices[position.id];
      return {
        id: position.id, kind: position.kind, sectionTitle: row.sectionTitle, label: row.label,
        ...(position.kind === 'value' ? { model: set.models[position.modelIndex] } : {}),
        status: position.status, message: messageFor(set, row, position),
        candidates: position.candidates.map((item, index) => ({ ...item, index, choosable: choosable.has(index),
          where: sourcePlace(item.source, set.sourceNames) })),
        ...(choice === undefined ? {} : { choice }),
        resolved: resolvePosition(set, position).state === 'chosen',
      };
    });
}

/** Items that still leave a cell empty or a condition out ("Pendências (N)"). */
export const openPendingCount = (items: readonly PendingFact[]) => items.filter(item => !item.resolved).length;

/* ---------------------------------------------------------------------------------------------------------- */
/* Compilation                                                                                                */
/* ---------------------------------------------------------------------------------------------------------- */

export type DraftLayout = 'T1' | 'T3';
export const DRAFT_PRESETS: Readonly<Record<DraftLayout, TablePresetId>> = { T1: 'comparison', T3: 'technical-specification' };
/** Header of the label column of a T1 table. */
export const LABEL_HEADER = 'Característica';

export interface CompileDraftOptions {
  /** 'auto' (default): T3 for one product, T1 otherwise. */
  readonly layout?: DraftLayout | 'auto';
  /** The new pages go after this page (default: the last page), after its table's continuation pages. */
  readonly afterPageId?: string;
  /** An existing EMPTY page that takes the first part; otherwise a new page is added. */
  readonly onPageId?: string;
  /** Default: derived from the fact set, so the same input always compiles to the same output. */
  readonly transactionId?: string;
  /** Text of a value cell left for the person; empty by default (the pending list names the cell). */
  readonly pendingCellText?: string;
}
export interface DraftCellTrace {
  /** Position id (fact id) the cell belongs to. */
  readonly factId: string;
  readonly kind: DraftPositionKind;
  readonly part: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
  /** Text written in the cell; '' (or `pendingCellText`) when pending. */
  readonly text: string;
  readonly state: PositionResolution['state'];
  readonly candidate?: number;
}
export type DraftStep =
  | { readonly kind: 'page'; readonly pageRef: string; readonly action: Extract<ApplicationAction, { type: 'page.add' }> }
  | { readonly kind: 'table'; readonly part: number; readonly pageRef: string; readonly action: Extract<ApplicationAction, { type: 'object.insert' }> };
export interface CompiledDraft {
  readonly transactionId: string;
  readonly layout: DraftLayout;
  readonly presetId: TablePresetId;
  /** Pages the draft needs to find unchanged when it is applied. */
  readonly anchorPageId: string;
  readonly onPageId?: string;
  /** In order; `pageRef` placeholders (`rascunho-pagina-N`) are the pages created by the `page` steps. */
  readonly steps: readonly DraftStep[];
  readonly parts: number;
  readonly cells: readonly DraftCellTrace[];
  readonly pending: readonly PendingFact[];
}

const SAFETY_MM = 1;
const MM_PER_PT = 25.4 / 72;
export const DRAFT_PAGE_REF_PREFIX = 'rascunho-pagina-';

/** Small stable hash (FNV-1a), for a deterministic default transactionId. */
function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

interface Grid {
  readonly cells: string[][];
  readonly roles: ('header' | 'section' | 'body')[];
  /** Per grid row: the position of each column (or undefined), for the trace. */
  readonly trace: ({ readonly position: DraftPosition; readonly resolution: PositionResolution } | undefined)[][];
  readonly notes: string[];
}

function modelsByCondition(conditions: readonly string[], models: readonly string[]): Map<string, string[]> {
  const byCondition = new Map<string, string[]>();
  conditions.forEach((condition, index) => {
    const text = condition.trim();
    if (text && models[index]) byCondition.set(text, [...(byCondition.get(text) ?? []), models[index]]);
  });
  return byCondition;
}

function buildGrid(set: DraftFactSet, layout: DraftLayout, pendingText: string): Grid {
  const valueOf = new Map(set.positions.filter(item => item.kind === 'value').map(item => [`${item.rowRef}#${item.modelIndex}`, item]));
  const conditionOf = new Map(set.positions.filter(item => item.kind === 'condition').map(item => [item.rowRef, item]));
  const sections = [...new Set(set.rows.map(row => row.sectionId))];
  const width = layout === 'T1' ? set.models.length + 1 : 2;
  const grid: Grid = { cells: [], roles: [], trace: [], notes: [] };
  if (layout === 'T1') {
    grid.cells.push([LABEL_HEADER, ...set.models]); grid.roles.push('header'); grid.trace.push([]);
  }
  for (const sectionId of sections) {
    const rows = set.rows.filter(row => row.sectionId === sectionId);
    if (sections.length > 1) {
      grid.cells.push([rows[0].sectionTitle, ...new Array<string>(width - 1).fill('')]); grid.roles.push('section'); grid.trace.push([]);
    }
    for (const row of rows) {
      const cells = [row.label];
      const trace: Grid['trace'][number] = [];
      const condition = conditionOf.get(row.ref);
      if (condition) trace[0] = { position: condition, resolution: resolvePosition(set, condition) };
      for (let model = 0; model < (layout === 'T1' ? set.models.length : 1); model++) {
        const position = valueOf.get(`${row.ref}#${model}`);
        const resolution = position ? resolvePosition(set, position) : { state: 'pending' as const };
        const candidate = 'candidate' in resolution && position ? position.candidates[resolution.candidate] : undefined;
        cells.push(candidate ? valueDisplayText(candidate.value, candidate.unit) : resolution.state === 'notApplicable' ? NOT_APPLICABLE_TEXT : pendingText);
        if (position) trace[model + 1] = { position, resolution };
      }
      grid.cells.push(cells); grid.roles.push('body'); grid.trace.push(trace);
      const chosenCondition = condition
        ? (() => { const resolved = resolvePosition(set, condition); return 'candidate' in resolved ? condition.candidates[resolved.candidate].value : ''; })()
        : row.condition;
      // A label printed with its colon ("Display Accuracy:") is not doubled in the note.
      const label = row.label.replace(/\s*:\s*$/u, '');
      const notes = row.modelConditions
        // A joined row: one note per condition, naming its models ("Cooling Time (TA-25N): 25 °C to -25 °C").
        ? [...modelsByCondition(row.modelConditions, set.models)].map(([text, models]) => `${label} (${models.join(', ')}): ${text}`)
        : chosenCondition.trim() ? [`${label}: ${chosenCondition.trim()}`] : [];
      for (const note of notes) if (!grid.notes.includes(note)) grid.notes.push(note);
    }
  }
  return grid;
}

function structuralTable(grid: Grid, rows: readonly number[], title: string | undefined, notes: readonly string[], prefix: string): TableModel {
  const cells = rows.map(index => grid.cells[index]);
  const base = pastedTableModel({ cells, rowCount: cells.length, columnCount: cells[0].length, paddedRows: [], header: false },
    { header: false, idPrefix: prefix });
  const annotations = notes.map((text, index) => ({ id: `${prefix}-note-${index}`, kind: 'note' as const, text: plainRichText(`${prefix}-note-${index}`, text) }));
  return {
    ...base,
    rows: base.rows.map((row, index) => ({ ...row, role: grid.roles[rows[index]] })),
    ...(title ? { title: plainRichText(`${prefix}-title`, title) } : {}),
    annotations,
    ...(annotations.length ? { annotationIds: annotations.map(note => note.id) } : {}),
  };
}

function lineCount(text: string, fontSizePt: number, widthMm: number): number {
  const charMm = fontSizePt * 0.6 * MM_PER_PT;
  return text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length * charMm / Math.max(charMm, widthMm))), 0);
}
function textBlockMm(lines: readonly string[], style: DocumentStyle, widthMm: number): number {
  const fontSizePt = style.defaultText.fontSizePt ?? 10;
  const lineMm = fontSizePt * (style.defaultText.lineHeight ?? 1.25) * MM_PER_PT;
  return lines.reduce((total, line) => total + lineCount(line, fontSizePt, widthMm) * lineMm, 0);
}

/** The panel preset with its accents (bands, first column), applied on a private copy: the look of slice 2. */
function styledPart(table: TableModel, style: DocumentStyle, presetId: TablePresetId, page: Page): TableModel {
  let next = 0;
  const createId = () => `rascunho-estilo-${++next}`;
  const scratch = createCatalogDocument(createId);
  const document: CatalogDocument = { ...scratch, style, pages: [{ ...page, objects: [] }] };
  const spec = createTableInsertSpec(document.pages[0], table);
  const inserted = executeApplicationAction(document, { type: 'object.insert', pageId: page.id, object: spec }, { createId });
  const fallback = materializeTablePreset(table, style, presetId);
  if (!inserted.ok) return fallback;
  const objectId = inserted.metadata.createdIds[0];
  const object = findObjectInTree(inserted.document, objectId)?.object;
  if (!object || object.type !== 'table') return fallback;
  const plan = planTableComposition(inserted.document, page.id, objectId,
    tableLookSteps({ kind: 'preset', presetId }, projectTableLook(object.table, style), style));
  const styled = plan.ok ? findObjectInTree(plan.document, objectId)?.object : undefined;
  return styled?.type === 'table' ? styled.table : fallback;
}

function heightsFor(table: TableModel, style: DocumentStyle, widthMm: number): Record<string, number> {
  return Object.fromEntries(table.rows.map(row => {
    const single: TableModel = { ...table, rows: [row], cells: table.cells.filter(cell => cell.rowId === row.id) };
    // estimateTableHeightMm adds 1 mm of borders per table; it is counted once, in the title.
    return [row.id, Math.ceil(mmToU(Math.max(0.5, estimateTableHeightMm(single, style.defaultText, widthMm) - 1)))];
  }));
}

/**
 * Compiles the fact set into the draft's steps, without changing `document`.
 * Deterministic: the same fact set, document and options give the same steps.
 */
export function compileDraft(set: DraftFactSet, document: CatalogDocument, options: CompileDraftOptions = {}): CompiledDraft {
  if (!set.rows.length || !set.models.length) throw new Error('DRAFT_EMPTY');
  const layout: DraftLayout = options.layout && options.layout !== 'auto' ? options.layout : set.models.length === 1 ? 'T3' : 'T1';
  if (layout === 'T3' && set.models.length !== 1) throw new Error('DRAFT_LAYOUT_ONE_PRODUCT');
  if (set.models.length > 6) throw new Error('DRAFT_TOO_MANY_MODELS');
  const presetId = DRAFT_PRESETS[layout];
  const pendingText = options.pendingCellText ?? '';
  const transactionId = options.transactionId ?? `rascunho-${stableHash(JSON.stringify([set, layout, pendingText]))}`;
  const lastPage = document.pages[document.pages.length - 1];
  if (!lastPage) throw new Error('DRAFT_NO_PAGE');
  const onPage = options.onPageId ? document.pages.find(page => page.id === options.onPageId && page.objects.length === 0) : undefined;
  const anchorPageId = onPage?.id ?? pageAfterTableRun(document, options.afterPageId && document.pages.some(page => page.id === options.afterPageId)
    ? options.afterPageId : lastPage.id);

  const grid = buildGrid(set, layout, pendingText);
  let probe = 0;
  // The page `page.add` creates, read from the application's own blank catalog (as table-split-authoring does).
  const blankPage = createCatalogDocument(() => `rascunho-modelo-${++probe}`).pages[0];
  const firstPage = onPage ?? blankPage;
  const widthOf = (page: Page) => Math.max(10, page.widthMm - (page.safeArea?.leftMm ?? 20) - (page.safeArea?.rightMm ?? 20));
  const availableMm = (page: Page) => page.heightMm - (page.safeArea?.bottomMm ?? 20) - (page.safeArea?.topMm ?? 20) - SAFETY_MM;

  // Paginate the full table (FR-35 paginator) with conservative estimates of the house look.
  const all = grid.cells.map((_, index) => index);
  let estimate = materializeTablePreset(structuralTable(grid, all, set.title, grid.notes, 'rascunho'), document.style, presetId);
  const labelMm = tablePresetFirstColumnMm(presetId, estimate, widthOf(firstPage));
  if (labelMm) estimate = { ...estimate, columns: estimate.columns.map((column, index) => index === 0 ? { ...column, width: { mode: 'fixed', mm: labelMm } } : column) };
  const gapMm = estimate.style.annotationGapMm;
  const titleMm = textBlockMm([set.title], document.style, widthOf(firstPage)) + gapMm + 1;
  const continuationMm = textBlockMm([`${set.title} (continuação)`], document.style, widthOf(blankPage)) + gapMm + 1;
  const footerMm = grid.notes.length ? textBlockMm(grid.notes, document.style, widthOf(firstPage)) + gapMm : 0;
  const pagination = planTablePagination(estimate, {
    rowHeightsU: heightsFor(estimate, document.style, widthOf(firstPage)),
    titleHeightU: Math.ceil(mmToU(titleMm)), continuationTitleHeightU: Math.ceil(mmToU(continuationMm)),
    footerHeightU: Math.ceil(mmToU(footerMm)),
    firstPageAvailableU: Math.max(0, Math.floor(mmToU(availableMm(firstPage)))),
    nextPageAvailableU: Math.max(1, Math.floor(mmToU(availableMm(blankPage)))),
  });
  const rowIndex = new Map(estimate.rows.map((row, index) => [row.id, index]));
  const slices = pagination.slices.length
    ? pagination.slices.map(slice => [...slice.headerRowIds, ...slice.bodyRowIds].map(id => rowIndex.get(id)!))
    : [all];

  const steps: DraftStep[] = [];
  const cells: DraftCellTrace[] = [];
  let previousPage = anchorPageId;
  slices.forEach((rows, part) => {
    const last = part === slices.length - 1;
    const page = part === 0 ? firstPage : blankPage;
    const title = part === 0 ? set.title : undefined;
    let table = structuralTable(grid, rows, title, last ? grid.notes : [], `rascunho-p${part + 1}`);
    if (part > 0) table = { ...table, title: continuationTitle(plainRichText(`rascunho-p${part + 1}-title`, set.title)) };
    const pageRef = part === 0 && onPage ? onPage.id : `${DRAFT_PAGE_REF_PREFIX}${part + 1}`;
    if (!(part === 0 && onPage)) {
      steps.push({ kind: 'page', pageRef, action: { type: 'page.add', afterPageId: previousPage } });
    }
    const styled = styledPart(table, document.style, presetId, { ...page, id: pageRef });
    const spec = createTableInsertSpec({ ...page, objects: [] }, styled);
    const partTitleMm = part === 0 ? titleMm : continuationMm;
    const heightMm = Math.min(availableMm(page) + SAFETY_MM,
      Math.ceil((estimateTableHeightMm(styled, document.style.defaultText, widthOf(page)) + partTitleMm + (last ? footerMm : 0)) * 2) / 2);
    steps.push({ kind: 'table', part, pageRef, action: { type: 'object.insert', pageId: pageRef,
      object: { ...spec, frameU: { ...spec.frameU, heightU: mmToU(heightMm) }, table: styled } } });
    previousPage = pageRef;
    rows.forEach((gridRow, localRow) => grid.trace[gridRow]?.forEach((entry, column) => {
      if (!entry) return;
      const filled = 'candidate' in entry.resolution;
      cells.push({
        factId: entry.position.id, kind: entry.position.kind, part, rowIndex: localRow, columnIndex: column,
        text: entry.position.kind === 'condition' ? grid.cells[gridRow][0] : grid.cells[gridRow][column],
        state: entry.resolution.state, ...(filled ? { candidate: (entry.resolution as { candidate: number }).candidate } : {}),
      });
    }));
  });
  return {
    transactionId, layout, presetId, anchorPageId, ...(onPage ? { onPageId: onPage.id } : {}),
    steps, parts: slices.length, cells, pending: pendingFacts(set),
  };
}

/**
 * Every value cell must hold exactly a verified (or chosen verified) candidate
 * of its own fact, or stay pending; no number may come from anywhere else.
 * Returns the problems found (empty when the draft is faithful).
 */
export function draftIntegrityProblems(set: DraftFactSet, draft: CompiledDraft, pendingCellText = ''): string[] {
  const positions = new Map(set.positions.map(position => [position.id, position]));
  const problems: string[] = [];
  const tables = draft.steps.flatMap(step => step.kind === 'table' && step.action.object.type === 'table' ? [step.action.object.table] : []);
  for (const cell of draft.cells) {
    const position = positions.get(cell.factId);
    if (!position) { problems.push(`${cell.factId}: fato desconhecido`); continue; }
    const table = tables[cell.part];
    const row = table?.rows[cell.rowIndex], column = table?.columns[cell.columnIndex];
    const content = table?.cells.find(item => item.rowId === row?.id && item.columnId === column?.id)?.content;
    const text = content?.type === 'richText'
      ? content.value.paragraphs.map(paragraph => paragraph.inlines.map(inline => inline.kind === 'text' ? inline.text : '\n').join('')).join('\n') : '';
    if (cell.kind === 'condition') continue;
    const resolution = resolvePosition(set, position);
    const expected = resolution.state === 'notApplicable' ? NOT_APPLICABLE_TEXT
      : 'candidate' in resolution
        ? (isVerifiedStatus(position.candidates[resolution.candidate].status)
          ? valueDisplayText(position.candidates[resolution.candidate].value, position.candidates[resolution.candidate].unit) : undefined)
        : pendingCellText;
    if (expected === undefined || text !== expected) problems.push(`${cell.factId}: célula “${text}” não confere com o fato`);
  }
  const traced = new Set(draft.cells.filter(cell => cell.kind === 'value').map(cell => cell.factId));
  for (const position of set.positions) {
    if (position.kind === 'value' && set.rows.some(row => row.ref === position.rowRef) && !traced.has(position.id)) {
      problems.push(`${position.id}: fato sem célula`);
    }
  }
  return problems;
}

/* ---------------------------------------------------------------------------------------------------------- */
/* Application                                                                                                */
/* ---------------------------------------------------------------------------------------------------------- */

export interface DraftCellTarget {
  readonly factId: string;
  readonly kind: DraftPositionKind;
  readonly pageId: string;
  readonly objectId: string;
  readonly tableId: string;
  readonly cellId: string;
  readonly state: PositionResolution['state'];
}
export interface AppliedDraft {
  readonly transactionId: string;
  /** Every page that holds a part, first one first. */
  readonly pageIds: readonly string[];
  readonly tables: readonly { readonly part: number; readonly pageId: string; readonly objectId: string; readonly tableId: string }[];
  /** Where each fact landed, by fact id (a row condition points to its label cell). */
  readonly cells: ReadonlyMap<string, DraftCellTarget>;
  readonly message: string;
}
export type ApplyDraftOutcome = { readonly ok: true; readonly applied: AppliedDraft } | { readonly ok: false; readonly message: string };

const NOTHING_CHANGED = 'Nada foi alterado.';

function runSteps(target: DocumentSession, draft: CompiledDraft, transactionId: string) {
  const pages = new Map<string, string>();
  const tables: AppliedDraft['tables'][number][] = [];
  const resolve = (ref: string) => pages.get(ref) ?? ref;
  for (const step of draft.steps) {
    if (step.kind === 'page') {
      const result = target.execute({ ...step.action, ...(step.action.afterPageId ? { afterPageId: resolve(step.action.afterPageId) } : {}) },
        { transactionId });
      const created = result.ok ? result.metadata.createdIds[0] : undefined;
      if (!created) return undefined;
      pages.set(step.pageRef, created);
      continue;
    }
    const pageId = resolve(step.pageRef);
    const result = target.execute({ ...step.action, pageId }, { transactionId });
    const objectId = result.ok ? result.metadata.createdIds[0] : undefined;
    const object = objectId ? findObjectInTree(target.getSnapshot().document, objectId)?.object : undefined;
    if (!object || object.type !== 'table') return undefined;
    tables.push({ part: step.part, pageId, objectId: object.id, tableId: object.table.id });
  }
  return tables;
}

function pageNumbersText(document: CatalogDocument, pageIds: readonly string[]): string {
  const numbers = pageIds.map(id => document.pages.findIndex(page => page.id === id) + 1);
  if (numbers.length === 1) return `na página ${numbers[0]}`;
  return `nas páginas ${numbers.slice(0, -1).join(', ')} e ${numbers.at(-1)}`;
}

/**
 * Applies the draft under its transactionId (one Desfazer removes it all).
 * Rehearsed first on a private copy, so a refused step never leaves half a
 * table behind; the catalog must still have the pages the draft was made for.
 */
export function applyCompiledDraft(session: DocumentSession, draft: CompiledDraft): ApplyDraftOutcome {
  const before = session.getSnapshot().document;
  const anchor = before.pages.find(page => page.id === draft.anchorPageId);
  if (!anchor || (draft.onPageId && anchor.objects.length > 0)) {
    return { ok: false, message: `O catálogo mudou desde que a tabela foi preparada. ${NOTHING_CHANGED} Prepare a tabela de novo.` };
  }
  let serial = 0;
  const rehearsal = createDocumentSession(before, { createId: () => `rascunho-ensaio-${++serial}` });
  if (!runSteps(rehearsal, draft, `${draft.transactionId}:ensaio`)) {
    return { ok: false, message: `Não foi possível montar a tabela. ${NOTHING_CHANGED}` };
  }
  const tables = runSteps(session, draft, draft.transactionId);
  if (!tables) {
    if (session.getSnapshot().document !== before) session.undo();
    return { ok: false, message: `Não foi possível inserir a tabela. ${NOTHING_CHANGED} Tente de novo.` };
  }
  const document = session.getSnapshot().document;
  const cells = new Map<string, DraftCellTarget>();
  for (const cell of draft.cells) {
    const placed = tables.find(table => table.part === cell.part);
    const object = placed ? findObjectInTree(document, placed.objectId)?.object : undefined;
    if (!placed || object?.type !== 'table') continue;
    const row = object.table.rows[cell.rowIndex], column = object.table.columns[cell.columnIndex];
    const found = object.table.cells.find(item => item.rowId === row?.id && item.columnId === column?.id);
    if (found && !cells.has(cell.factId)) {
      cells.set(cell.factId, { factId: cell.factId, kind: cell.kind, pageId: placed.pageId, objectId: placed.objectId,
        tableId: placed.tableId, cellId: found.id, state: cell.state });
    }
  }
  const pageIds = tables.map(table => table.pageId);
  const open = openPendingCount(draft.pending);
  const pending = open === 0 ? '' : open === 1 ? ' 1 valor ficou para conferir: veja as Pendências.'
    : ` ${open} valores ficaram para conferir: veja as Pendências.`;
  return {
    ok: true,
    applied: {
      transactionId: draft.transactionId, pageIds, tables, cells,
      message: `Tabela inserida ${pageNumbersText(document, pageIds)}.${pending} Use Desfazer se precisar.`,
    },
  };
}

/**
 * The CLI path: compiles the fact set into a new, blank catalog, applies it
 * and returns the document validated by CatalogDocumentSchema, with the
 * integrity check of every value cell.
 */
export function compileDraftDocument(set: DraftFactSet, options: CompileDraftOptions & { readonly catalogTitle?: string } = {}) {
  let serial = 0;
  const createId = () => `doc-${(++serial).toString(36).padStart(4, '0')}`;
  const blank = createCatalogDocument(createId, options.catalogTitle ?? set.title);
  const session = createDocumentSession(blank, { createId });
  const draft = compileDraft(set, blank, { ...options, onPageId: options.onPageId ?? blank.pages[0].id });
  const problems = draftIntegrityProblems(set, draft, options.pendingCellText ?? '');
  if (problems.length) throw new Error(`DRAFT_INTEGRITY: ${problems.join('; ')}`);
  const outcome = applyCompiledDraft(session, draft);
  if (!outcome.ok) throw new Error(`DRAFT_APPLY: ${outcome.message}`);
  const document = parseCanonicalDocument(session.getSnapshot().document);
  return { document, draft, applied: outcome.applied };
}
