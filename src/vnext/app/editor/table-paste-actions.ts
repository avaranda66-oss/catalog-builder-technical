import type { ApplicationAction, DocumentSession } from '../../application';
import type { TableFitHeightPreparation } from '../../editor/table-fit-height-authoring';
import type { CatalogDocument, TableModel, TableObject } from '../../domain';
import {
  prepareExternalTsvPaste,
  prepareTypedTablePaste,
  type PreparedTableBulkMutation,
} from '../../editor/table-bulk-authoring';
import { parseTypedTableClipboard } from '../../editor/table-clipboard';
import {
  describeGrowth,
  growTableModel,
  parsePastedTable,
  pastedTableModel,
  planPasteGrowth,
  type PasteGrowthPlan,
  type PastedTable,
  type PastedTableParse,
} from '../../editor/table-paste-import';
import type { TableSelection } from '../../editor/table-selection';
import { parseTsv } from '../../editor/table-tsv';
import { createTableInsertSpec, MAX_NEW_TABLE_COLUMNS, MAX_NEW_TABLE_ROWS } from '../editor-defaults';

/**
 * Session orchestration for "Colar do Excel" (FR-31). Every change runs under
 * one transactionId so a single Desfazer removes the whole paste.
 */

export const PASTE_TABLE_LIMITS = { maxRows: MAX_NEW_TABLE_ROWS, maxColumns: MAX_NEW_TABLE_COLUMNS } as const;
/** Above this many columns text gets cramped on a portrait A4 page. */
export const COMFORTABLE_A4_COLUMNS = 7;
const MAX_ROWS_PER_INSERT = 100;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

let fallbackTransaction = 0;
/**
 * Transaction id for one table creation/paste. Only needs to be unique in this
 * editor session, so it still works where `crypto.randomUUID` is unavailable
 * (plain http on a local network).
 */
export function newTableTransactionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  fallbackTransaction += 1;
  return `table-transaction-${Date.now()}-${fallbackTransaction}`;
}

function listNumbers(values: readonly number[]): string {
  if (values.length > 6) return `${values.slice(0, 5).join(', ')} e outras ${values.length - 5}`;
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`;
}

/**
 * Whether a paste event belongs to the page (so an Excel block may become a new
 * table): the page itself, the editing toolbar or nothing focused. Form fields
 * and editable text keep the browser's normal paste.
 */
export function isPageLevelPasteTarget(target: EventTarget | null, body: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select')) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return target === body || Boolean(target.closest('.vnext-document-preview, .vnext-authoring-toolbar'));
}

export function pastedTableProblemMessage(parse: Extract<PastedTableParse, { ok: false }>): string {
  switch (parse.problem) {
    case 'EMPTY':
      return 'Não há nada para colar. Copie as células no Excel (Ctrl+C) e tente de novo.';
    case 'TOO_MANY_COLUMNS':
      return `A tabela copiada tem ${parse.columnCount} colunas. Numa página A4 cabem no máximo ${MAX_NEW_TABLE_COLUMNS}. Copie menos colunas no Excel e cole de novo. Nada foi alterado.`;
    case 'TOO_MANY_ROWS':
      return `A tabela copiada tem ${parse.rowCount} linhas. Dá para colar até ${MAX_NEW_TABLE_ROWS} de cada vez. Copie uma parte menor e cole de novo. Nada foi alterado.`;
  }
}

/** Plain-language summary of what the paste will create (also used as a warning list). */
export function pastedTableNotes(table: PastedTable, header: boolean): string[] {
  const notes: string[] = [];
  if (header && table.rowCount > 1) notes.push('A primeira linha virou o cabeçalho, em destaque.');
  if (table.paddedRows.length > 0) {
    notes.push(table.paddedRows.length === 1
      ? `A linha ${table.paddedRows[0]} tinha menos colunas; completamos com células vazias.`
      : `As linhas ${listNumbers(table.paddedRows)} tinham menos colunas; completamos com células vazias.`);
  }
  if (table.columnCount > COMFORTABLE_A4_COLUMNS) {
    notes.push(`Com mais de ${COMFORTABLE_A4_COLUMNS} colunas, o texto pode ficar apertado numa página A4 em pé.`);
  }
  return notes;
}

export type CreatePastedTableOutcome =
  | { ok: true; objectId: string; document: CatalogDocument; message: string }
  | { ok: false; message: string };

/** Creates a new styled table on the page from pasted spreadsheet text, in one undoable step. */
export function createTableFromPastedText(
  session: DocumentSession,
  pageId: string,
  text: string,
  options: { header?: boolean; transactionId: string }
): CreatePastedTableOutcome {
  const parse = parsePastedTable(text, PASTE_TABLE_LIMITS);
  if (!parse.ok) return { ok: false, message: pastedTableProblemMessage(parse) };
  const snapshot = session.getSnapshot().document;
  const page = snapshot.pages.find((entry) => entry.id === pageId);
  if (!page) return { ok: false, message: 'Abra uma página antes de colar a tabela. Nada foi alterado.' };
  const header = (options.header ?? parse.table.header) && parse.table.rowCount > 1;
  const table = pastedTableModel(parse.table, { header });
  const result = session.execute(
    { type: 'object.insert', pageId, object: createTableInsertSpec(page, table, snapshot.style) },
    { transactionId: options.transactionId }
  );
  const objectId = result.ok ? result.metadata.createdIds[0] : undefined;
  if (!result.ok || !objectId) return { ok: false, message: 'Não foi possível criar a tabela. Nada foi alterado.' };
  const summary = `Tabela criada com ${plural(parse.table.rowCount, 'linha', 'linhas')} e ${plural(parse.table.columnCount, 'coluna', 'colunas')}.`;
  return {
    ok: true,
    objectId,
    document: result.document,
    message: [summary, ...pastedTableNotes(parse.table, header), 'Se não era isso, clique em Desfazer.'].join(' '),
  };
}

export interface TablePasteSource {
  /** Internal typed clipboard (copied inside the editor), or '' for external text. */
  readonly typedText: string;
  readonly plainText: string;
}

/** Same preparation the grid uses for Ctrl+V and the "Colar" box. Throws the authoring errors unchanged. */
export function prepareTablePaste(table: TableModel, selection: TableSelection, source: TablePasteSource): PreparedTableBulkMutation {
  return source.typedText
    ? prepareTypedTablePaste(table, selection, parseTypedTableClipboard(source.typedText))
    : prepareExternalTsvPaste(table, selection, parseTsv(source.plainText));
}

export interface TablePasteGrowthOffer {
  readonly plan: PasteGrowthPlan;
  readonly label: string;
}

/**
 * When a paste does not fit from the selected cell, offer to append the missing
 * rows/columns. Returns undefined when growth would not help or exceeds limits.
 */
export function tablePasteGrowthOffer(
  table: TableModel,
  selection: TableSelection,
  sourceRows: number,
  sourceColumns: number
): TablePasteGrowthOffer | undefined {
  const plan = planPasteGrowth(table, selection, sourceRows, sourceColumns);
  if (!plan) return undefined;
  if (table.columns.length + plan.columnsToAdd > MAX_NEW_TABLE_COLUMNS || plan.rowsToAdd > MAX_NEW_TABLE_ROWS) return undefined;
  return { plan, label: `Adicionar ${describeGrowth(plan)} e colar` };
}

/** A table the editor just created whose height should be fitted once it has been measured. */
export interface PendingTableFit {
  readonly objectId: string;
  readonly transactionId: string;
  /** Document right after the insert; any other change cancels the automatic fit. */
  readonly document: CatalogDocument;
}

export type PendingTableFitDecision =
  | { kind: 'wait' }
  | { kind: 'cancel' }
  | { kind: 'fit'; action: Extract<ApplicationAction, { type: 'table.fitHeight' }> };

/**
 * Decides what to do with a pending automatic "Ajustar altura" for a new table:
 * wait for the measurement, give up when anything changed, or fit when the
 * measured table still fits on the page (otherwise preflight keeps reporting it).
 */
export function decidePendingTableFit(
  pending: PendingTableFit,
  liveDocument: CatalogDocument,
  selectedTableId: string | undefined,
  preparation: TableFitHeightPreparation | { ok: false; reason: string } | null | undefined,
  /** The user already started typing a position/size: never overwrite that draft. */
  userIsTyping = false
): PendingTableFitDecision {
  if (userIsTyping || liveDocument !== pending.document || selectedTableId !== pending.objectId) return { kind: 'cancel' };
  if (!preparation || (!preparation.ok && (preparation.reason === 'MEASURING' || preparation.reason === 'NO_FACT'))) return { kind: 'wait' };
  if (!preparation.ok) return { kind: 'cancel' };
  const { wouldExceedPage, tallerThanPage, wouldViolateSafeArea: _safeArea, ...prepared } = preparation.prepared;
  if (wouldExceedPage || tallerThanPage || prepared.objectId !== pending.objectId) return { kind: 'cancel' };
  return { kind: 'fit', action: { type: 'table.fitHeight', ...prepared } };
}

function tableObjectIn(document: CatalogDocument, pageId: string, objectId: string): TableObject | undefined {
  return document.pages.find((page) => page.id === pageId)?.objects
    .find((object): object is TableObject => object.id === objectId && object.type === 'table');
}

export type GrowAndPasteOutcome =
  | { ok: true; table: TableModel; prepared: PreparedTableBulkMutation; message: string }
  | { ok: false; error?: unknown; code?: string; message?: string };

/**
 * Appends the missing rows/columns and pastes, all under one transactionId.
 * The paste is first checked on a pure simulation, so nothing changes when it
 * cannot succeed; an unexpected late failure is rolled back with one Undo.
 */
export function growTableAndPaste(
  session: DocumentSession,
  target: { pageId: string; object: TableObject; selection: TableSelection },
  source: TablePasteSource,
  plan: PasteGrowthPlan,
  transactionId: string
): GrowAndPasteOutcome {
  try {
    prepareTablePaste(growTableModel(target.object.table, plan), target.selection, source);
  } catch (error) {
    return { ok: false, error };
  }
  let executed = false;
  const rollback = (code?: string): GrowAndPasteOutcome => {
    if (executed) session.undo();
    return { ok: false, code, message: 'Não foi possível aumentar a tabela para colar. Nada foi alterado.' };
  };
  let current = target.object.table;
  const base = { pageId: target.pageId, objectId: target.object.id, tableId: current.id };
  for (let remaining = plan.rowsToAdd; remaining > 0;) {
    const count = Math.min(MAX_ROWS_PER_INSERT, remaining);
    const result = session.execute({
      type: 'table.axis.insert', ...base, axis: 'row', referenceAxisId: current.rows[current.rows.length - 1].id,
      position: 'after', count, properties: { role: 'body', heightPolicy: { mode: 'AUTO' } }, expectedTable: current,
    }, { transactionId });
    if (!result.ok) return rollback(result.error.code);
    executed = true;
    const next = tableObjectIn(result.document, target.pageId, target.object.id);
    if (!next) return rollback();
    current = next.table;
    remaining -= count;
  }
  if (plan.columnsToAdd > 0) {
    const result = session.execute({
      type: 'table.axis.insert', ...base, axis: 'column', referenceAxisId: current.columns[current.columns.length - 1].id,
      position: 'after', count: plan.columnsToAdd, properties: { width: { mode: 'flex', weight: 1 }, minMm: 1 }, expectedTable: current,
    }, { transactionId });
    if (!result.ok) return rollback(result.error.code);
    executed = true;
    const next = tableObjectIn(result.document, target.pageId, target.object.id);
    if (!next) return rollback();
    current = next.table;
  }
  let prepared: PreparedTableBulkMutation;
  try {
    prepared = prepareTablePaste(current, target.selection, source);
  } catch {
    return rollback();
  }
  const result = session.execute({
    type: 'table.cells.setContents',
    ...base,
    geometry: prepared.geometry,
    targets: prepared.targets,
    ...(prepared.legendCreates ? { legendCreates: prepared.legendCreates } : {}),
    ...(prepared.expectedLegend ? { expectedLegend: prepared.expectedLegend } : {}),
  }, { transactionId });
  if (!result.ok) return rollback(result.error.code);
  const next = tableObjectIn(result.document, target.pageId, target.object.id);
  if (!next) return rollback();
  return {
    ok: true,
    table: next.table,
    prepared,
    message: `Tabela aumentada em ${describeGrowth(plan)} e ${plural(prepared.targets.length, 'célula colada', 'células coladas')}. Se não era isso, clique em Desfazer.`,
  };
}
