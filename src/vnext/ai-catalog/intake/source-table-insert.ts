import type { DocumentSession } from '../../application';
import type { CatalogDocument, TableModel } from '../../domain';
import { createTableInsertSpec, MAX_NEW_TABLE_COLUMNS, MAX_NEW_TABLE_ROWS } from '../../app/editor-defaults';
import { decidePendingTableFit, describeRowsByColumns } from '../../app/editor/table-paste-actions';
import { prepareTableFitHeight, type FitHeightMeasurement } from '../../editor/table-fit-height-authoring';
import { detectHeaderRow, pastedTableModel, type PastedTable } from '../../editor/table-paste-import';
import { applyTableSplit, planTableSplit, prepareTableSplit } from '../../editor/table-split-authoring';
import { columnLabel } from '../source-intake';
import type { SourceTableBlock } from './intake-model';

/**
 * FR-64 "Escolher colunas" → "Inserir como tabela": a table read from a spreadsheet, CSV or PDF becomes a native
 * table in one undoable step. The insertion is deterministic (same block, same columns → same table) and reuses
 * what the editor already does for "Colar do Excel" (FR-31): structural model, house preset, usable width.
 * A table taller than its page then continues on the next pages with the header repeated (FR-35, slice 2I), under the
 * same transactionId, so one Desfazer removes the new table and its continuation pages together.
 */

/** Columns suggested for a portrait A4 page (FR-64: "até 7 sugeridas"). */
export const SUGGESTED_A4_COLUMNS = 7;

export interface SourceColumn {
  readonly index: number;
  /** Column letter as the person sees it in Excel ("C"), or the position for PDF tables ("3"). */
  readonly letter: string;
  /** Header text, or "Coluna C" when the column has none. */
  readonly label: string;
  /** First filled value under the header, to recognise the column. */
  readonly sample: string;
  readonly empty: boolean;
}

export interface SourceTableChoice {
  readonly block: SourceTableBlock;
  /** Chosen column indexes, in the order of the source. */
  readonly columns: readonly number[];
  /** First kept row is the header (repeated on continuation pages). */
  readonly header: boolean;
}

const isBlank = (value: string | undefined) => !value || value.trim() === '';

/** First row of the table the person will get: the detected header, or the first row. */
export function sourceHeaderRow(block: SourceTableBlock): number {
  return block.headerRow !== undefined && block.headerRow >= 0 && block.headerRow < block.rows.length ? block.headerRow : 0;
}

/** Whether to start with "A primeira linha é o cabeçalho" on: a header found by the reader, or one that looks like it. */
export function sourceHasHeader(block: SourceTableBlock): boolean {
  if (block.headerRow !== undefined) return true;
  return block.rows.length > 1 && detectHeaderRow(block.rows);
}

function letterOf(block: SourceTableBlock, column: number): string {
  const address = block.addresses[sourceHeaderRow(block)]?.[column] ?? block.addresses[0]?.[column] ?? '';
  const match = /(?:^|!)\$?([A-Z]{1,3})\$?\d+$/.exec(address);
  return match ? match[1] : block.source.page !== undefined ? String(column + 1) : columnLabel(column + 1);
}

export function sourceColumns(block: SourceTableBlock, header = sourceHasHeader(block)): SourceColumn[] {
  const width = Math.max(0, ...block.rows.map((row) => row.length));
  const start = sourceHeaderRow(block);
  return Array.from({ length: width }, (_, index) => {
    const letter = letterOf(block, index);
    const title = header ? (block.rows[start]?.[index] ?? '').trim() : '';
    const body = block.rows.slice(header ? start + 1 : start).map((row) => row[index] ?? '');
    const sample = body.find((value) => !isBlank(value))?.trim() ?? '';
    return { index, letter, label: title || `Coluna ${letter}`, sample, empty: !sample && !title };
  });
}

/**
 * Up to {@link SUGGESTED_A4_COLUMNS} columns, in the order of the source: columns without any data and exact copies of
 * an earlier column (same title and same values) are left out of the suggestion.
 */
export function suggestSourceColumns(block: SourceTableBlock, max = SUGGESTED_A4_COLUMNS): number[] {
  const header = sourceHasHeader(block);
  const start = sourceHeaderRow(block);
  const rows = block.rows.slice(start);
  const seen = new Set<string>();
  const chosen: number[] = [];
  for (const column of sourceColumns(block, header)) {
    if (chosen.length >= max) break;
    const values = rows.map((row) => (row[column.index] ?? '').trim());
    const hasData = values.slice(header ? 1 : 0).some((value) => value !== '');
    if (!hasData) continue;
    const signature = JSON.stringify(values);
    if (seen.has(signature)) continue;
    seen.add(signature);
    chosen.push(column.index);
  }
  return chosen;
}

/** The rows the new table gets: from the header down, without rows that are empty in every chosen column. */
export function sourceTableCells(choice: SourceTableChoice): string[][] {
  const start = sourceHeaderRow(choice.block);
  return choice.block.rows.slice(start)
    .map((row) => choice.columns.map((column) => row[column] ?? ''))
    .filter((cells, index) => (choice.header && index === 0) || cells.some((value) => !isBlank(value)));
}

export type SourceChoiceProblem = { readonly ok: false; readonly message: string };

/** Why "Inserir como tabela" cannot run with this choice, in plain Portuguese; undefined when it can. */
export function sourceChoiceProblem(choice: SourceTableChoice): string | undefined {
  if (choice.columns.length === 0) return 'Escolha pelo menos 1 coluna.';
  if (choice.columns.length > MAX_NEW_TABLE_COLUMNS) {
    return `Numa página A4 cabem no máximo ${MAX_NEW_TABLE_COLUMNS} colunas. Desmarque ${choice.columns.length - MAX_NEW_TABLE_COLUMNS}.`;
  }
  const cells = sourceTableCells(choice);
  if (cells.length === 0 || cells.every((row) => row.every(isBlank))) return 'As colunas escolhidas estão vazias. Escolha outras colunas.';
  if (cells.length > MAX_NEW_TABLE_ROWS) {
    return `A tabela teria ${cells.length} linhas; dá para inserir até ${MAX_NEW_TABLE_ROWS} de cada vez. Leia um intervalo menor da planilha.`;
  }
  return undefined;
}

/** Structural model of the chosen columns (the house preset is applied when it is inserted). */
export function sourceTableModel(choice: SourceTableChoice): TableModel {
  const cells = sourceTableCells(choice);
  const pasted: PastedTable = {
    cells, rowCount: cells.length, columnCount: choice.columns.length, paddedRows: [], header: choice.header,
  };
  return pastedTableModel(pasted, { header: choice.header && cells.length > 1, idPrefix: 'source' });
}

export interface InsertedSourceTable {
  readonly pageId: string;
  readonly objectId: string;
  readonly transactionId: string;
  /** Document right after the insert; any other change before the measurement cancels the follow-up. */
  readonly document: CatalogDocument;
  readonly rows: number;
  readonly columns: number;
  /** A new page was added after the open page because the open page already had content. */
  readonly newPage: boolean;
}

export type SourceTableInsertOutcome =
  | { readonly ok: true; readonly inserted: InsertedSourceTable }
  | SourceChoiceProblem;

const NOTHING_CHANGED = 'Nada foi alterado.';

/**
 * Inserts the chosen columns as a styled table. On an empty open page the table goes there; on a page that already
 * has content it goes on a new page right after it, so it never covers what is there.
 */
export function insertSourceTable(
  session: DocumentSession,
  activePageId: string | undefined,
  choice: SourceTableChoice,
  transactionId: string
): SourceTableInsertOutcome {
  const problem = sourceChoiceProblem(choice);
  if (problem) return { ok: false, message: `${problem} ${NOTHING_CHANGED}` };
  const start = session.getSnapshot();
  const document = start.document;
  const open = document.pages.find((page) => page.id === activePageId) ?? document.pages[0];
  if (!open) return { ok: false, message: `Abra uma página antes de inserir a tabela. ${NOTHING_CHANGED}` };
  const table = sourceTableModel(choice);
  let pageId = open.id;
  let newPage = false;
  if (open.objects.length > 0) {
    const added = session.execute({ type: 'page.add', afterPageId: open.id }, { transactionId });
    const createdPageId = added.ok ? added.metadata.createdIds[0] : undefined;
    if (!added.ok || !createdPageId) return { ok: false, message: `Não foi possível criar a página da tabela. ${NOTHING_CHANGED}` };
    pageId = createdPageId;
    newPage = true;
  }
  const current = session.getSnapshot().document;
  const page = current.pages.find((entry) => entry.id === pageId)!;
  const result = session.execute(
    { type: 'object.insert', pageId, object: createTableInsertSpec(page, table, current.style) },
    { transactionId }
  );
  const objectId = result.ok ? result.metadata.createdIds[0] : undefined;
  if (!result.ok || !objectId) {
    if (newPage && session.getSnapshot().document !== document) session.undo();
    return { ok: false, message: `Não foi possível criar a tabela. ${NOTHING_CHANGED}` };
  }
  return {
    ok: true,
    inserted: {
      pageId, objectId, transactionId, document: result.document,
      rows: table.rows.length, columns: table.columns.length, newPage,
    },
  };
}

export type SourceTableFollowUp =
  /** The editor has not measured the new table yet. */
  | { readonly kind: 'wait' }
  /** Done: fitted, or continued on the next pages. `pageIds` are every page that holds a part, first one first. */
  | { readonly kind: 'done'; readonly message: string; readonly pageIds: readonly string[] }
  /** The table is in the catalog, but the person has to finish by hand (the reason says how). */
  | { readonly kind: 'manual'; readonly message: string; readonly pageIds: readonly string[] };

function pageNumber(document: CatalogDocument, pageId: string): number {
  return document.pages.findIndex((page) => page.id === pageId) + 1;
}

function insertedSentence(inserted: InsertedSourceTable, document: CatalogDocument): string {
  return `Tabela com ${describeRowsByColumns(inserted.rows, inserted.columns)} inserida na página ${pageNumber(document, inserted.pageId)}.`;
}

const UNDO_HINT = 'Use Desfazer se precisar.';
const IF_TOO_TALL = 'Se ela não couber na página, selecione a tabela e clique em “Continuar na próxima página”.';

/** Whether the follow-up can run now: the catalog still is exactly the one right after the insert. */
function untouched(session: DocumentSession, inserted: InsertedSourceTable): boolean {
  return session.getSnapshot().document === inserted.document;
}

export type SourceTableFollowUpPlan =
  | { readonly kind: 'wait' | 'fit' | 'split' }
  /** `overflows`: the table does not fit on its page, so "Continuar na próxima página" is worth a try later. */
  | { readonly kind: 'manual'; readonly message: string; readonly overflows: boolean };

/**
 * Plans what to do once the editor measured the new table, without changing anything: wait, fit the height,
 * continue on the next pages, or explain what is left to do by hand.
 */
export function planSourceTableFollowUp(
  session: DocumentSession,
  inserted: InsertedSourceTable,
  measurement: FitHeightMeasurement | null | undefined
): SourceTableFollowUpPlan {
  const document = session.getSnapshot().document;
  if (!untouched(session, inserted)) {
    return { kind: 'manual', overflows: true,
      message: 'O catálogo mudou antes de a tabela ser medida, então ela ficou como foi inserida.' };
  }
  if (!measurement || measurement.source !== document) return { kind: 'wait' };
  const planning = planTableSplit(document, inserted.objectId, measurement);
  if (planning.ok) return { kind: 'split' };
  if (planning.reason === 'MEASURING' || planning.reason === 'UNSTABLE') return { kind: 'wait' };
  if (planning.reason === 'FITS') return { kind: 'fit' };
  return { kind: 'manual', message: planning.message, overflows: false };
}

/**
 * Runs the follow-up under the insert's transactionId (one Desfazer for everything). It plans again on the live
 * catalog and the live measurement, so it never guesses: without a current measurement it only says "wait".
 */
export function finishSourceTableInsert(
  session: DocumentSession,
  inserted: InsertedSourceTable,
  measurement: FitHeightMeasurement | null | undefined
): SourceTableFollowUp {
  const plan = planSourceTableFollowUp(session, inserted, measurement);
  if (plan.kind === 'wait') return { kind: 'wait' };
  const document = session.getSnapshot().document;
  const first = insertedSentence(inserted, document);
  if (plan.kind === 'manual') {
    return { kind: 'manual', message: `${first} ${plan.message}${plan.overflows ? ` ${IF_TOO_TALL}` : ''}`, pageIds: [inserted.pageId] };
  }
  if (plan.kind === 'fit') {
    const preparation = prepareTableFitHeight(document, inserted.pageId, inserted.objectId, measurement);
    const decision = decidePendingTableFit(
      { objectId: inserted.objectId, transactionId: inserted.transactionId, document: inserted.document },
      document, inserted.objectId, preparation
    );
    if (decision.kind === 'fit') session.execute(decision.action, { transactionId: inserted.transactionId });
    return { kind: 'done', message: `${first} ${UNDO_HINT}`, pageIds: [inserted.pageId] };
  }
  const prepared = prepareTableSplit(document, inserted.objectId, measurement);
  if (!prepared.ok) return { kind: 'manual', message: `${first} ${prepared.message}`, pageIds: [inserted.pageId] };
  const outcome = applyTableSplit(session, prepared.prepared, inserted.transactionId);
  if (!outcome.ok) {
    // A late failure is rolled back with one Desfazer, and that step also holds the insert: say so plainly.
    const stillThere = session.getSnapshot().document.pages.some((page) => page.objects.some((object) => object.id === inserted.objectId));
    return stillThere
      ? { kind: 'manual', message: `${first} ${outcome.message} ${IF_TOO_TALL}`, pageIds: [inserted.pageId] }
      : { kind: 'manual', message: `Não foi possível inserir a tabela e continuar nas próximas páginas. ${NOTHING_CHANGED} Tente de novo.`, pageIds: [] };
  }
  return {
    kind: 'done',
    message: `${insertedSentence(inserted, session.getSnapshot().document)} ${outcome.message}`,
    pageIds: [inserted.pageId, ...outcome.pageIds],
  };
}

/** The editor never measured the table (for example the page is in the background): finish by hand. */
export function sourceTableNotMeasured(session: DocumentSession, inserted: InsertedSourceTable): SourceTableFollowUp {
  return {
    kind: 'manual',
    message: `${insertedSentence(inserted, session.getSnapshot().document)} Ainda não deu para medir a página. ${IF_TOO_TALL}`,
    pageIds: [inserted.pageId],
  };
}
