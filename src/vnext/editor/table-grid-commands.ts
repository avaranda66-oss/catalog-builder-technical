import type { Row, TableModel } from '../domain/editorial-model';
import { deleteAxis } from '../table/table-model';
import { mergeEligibility, unmergeEligibility } from './table-merge-authoring';
import {
  canonicalTablePoint,
  normalizeTableSelection,
  tableCellSelection,
  tableSelectionFocusPoint,
  type TableSelection,
  type TableSelectionIdentity,
  type TableSelectionPoint,
} from './table-selection';

/**
 * FR-34 (part of slice 2A) — what the "+" buttons and the right-click menu of the table grid do.
 *
 * Pure decisions only: which row or column is the reference, which rows or columns a deletion takes, what the menu
 * offers and where the selection goes afterwards. The session work (one `table.axis.insert`, or a loop of
 * `table.axis.remove` under one transactionId) lives in `app/editor/table-grid-actions.ts`; no new action exists.
 */

export type TableGridAxis = 'row' | 'column';

export type TableGridCommand =
  | {
      readonly type: 'insert';
      readonly axis: TableGridAxis;
      /** 'before' = above / to the left; 'after' = below / to the right. */
      readonly position: 'before' | 'after';
      /** Row or column next to which the new one goes; without it, the edge of the selection is used. */
      readonly referenceAxisId?: string;
      /** Select the first cell of the new row (Tab on the last cell) instead of the cell beside the old one. */
      readonly selectFirstCell?: boolean;
    }
  | { readonly type: 'remove'; readonly axis: TableGridAxis }
  | { readonly type: 'merge' }
  | { readonly type: 'unmerge' };

export type TableAxisInsertProperties =
  | { readonly role: 'header' | 'body'; readonly heightPolicy: { readonly mode: 'AUTO' } }
  | { readonly width: { readonly mode: 'flex'; readonly weight: 1 }; readonly minMm: 1 };

export interface PlannedTableAxisInsert {
  readonly axis: TableGridAxis;
  readonly referenceAxisId: string;
  readonly position: 'before' | 'after';
  readonly properties: TableAxisInsertProperties;
}

export type TableGridPlan<T> = { readonly ok: true; readonly plan: T } | { readonly ok: false; readonly message: string };

const axisWord = (axis: TableGridAxis) => (axis === 'row' ? 'linha' : 'coluna');

/** "1 linha", "3 linhas", "1 coluna"… */
export function describeAxisCount(axis: TableGridAxis, count: number): string {
  return `${count} ${axisWord(axis)}${count === 1 ? '' : 's'}`;
}

/**
 * A new row joins the header only when it goes inside the header block (above a header row, or between two header
 * rows). Below the last header row it is an ordinary row, which is what the person expects after a title row.
 */
function insertedRowRole(rows: readonly Row[], referenceIndex: number, position: 'before' | 'after'): 'header' | 'body' {
  const reference = rows[referenceIndex];
  if (reference.role !== 'header') return 'body';
  if (position === 'before') return 'header';
  return rows[referenceIndex + 1]?.role === 'header' ? 'header' : 'body';
}

export function planTableAxisInsert(
  table: TableModel,
  selection: TableSelection | null,
  command: Extract<TableGridCommand, { type: 'insert' }>
): TableGridPlan<PlannedTableAxisInsert> {
  const items = command.axis === 'row' ? table.rows : table.columns;
  let referenceIndex = command.referenceAxisId === undefined
    ? -1
    : items.findIndex((item) => item.id === command.referenceAxisId);
  if (command.referenceAxisId === undefined) {
    const normalized = selection ? normalizeTableSelection(table, selection) : undefined;
    if (normalized) {
      const start = command.axis === 'row' ? normalized.rowStart : normalized.columnStart;
      const end = command.axis === 'row' ? normalized.rowEnd : normalized.columnEnd;
      referenceIndex = command.position === 'before' ? start : end;
    }
  }
  const reference = items[referenceIndex];
  if (!reference) return { ok: false, message: 'A tabela mudou. Selecione a célula de novo.' };
  return {
    ok: true,
    plan: {
      axis: command.axis,
      referenceAxisId: reference.id,
      position: command.position,
      properties: command.axis === 'row'
        ? { role: insertedRowRole(table.rows, referenceIndex, command.position), heightPolicy: { mode: 'AUTO' } }
        : { width: { mode: 'flex', weight: 1 }, minMm: 1 },
    },
  };
}

export interface PlannedTableAxisRemoval {
  readonly axis: TableGridAxis;
  /** In table order; removed one by one under one transactionId. */
  readonly axisIds: readonly string[];
  /** Index of the first removed row or column, to keep the selection nearby. */
  readonly firstIndex: number;
}

/** The rows (or columns) a deletion takes: every row the selection touches, merged cells included. */
export function selectedAxisIds(table: TableModel, selection: TableSelection, axis: TableGridAxis): readonly string[] {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return [];
  return axis === 'row' ? normalized.displayRowIds : normalized.displayColumnIds;
}

export function planTableAxisRemoval(
  table: TableModel,
  selection: TableSelection | null,
  axis: TableGridAxis
): TableGridPlan<PlannedTableAxisRemoval> {
  const axisIds = selection ? selectedAxisIds(table, selection, axis) : [];
  if (axisIds.length === 0) return { ok: false, message: 'A tabela mudou. Selecione a célula de novo.' };
  const items = axis === 'row' ? table.rows : table.columns;
  if (axisIds.length >= items.length) {
    return {
      ok: false,
      message: `A tabela precisa ter pelo menos 1 ${axisWord(axis)}. Para tirar a tabela inteira, selecione a tabela e use Excluir.`,
    };
  }
  // Same rule the engine applies to each step: simulate first, so a refused deletion changes nothing.
  let simulated = table;
  try {
    for (const id of axisIds) simulated = deleteAxis(simulated, axis, id);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return {
      ok: false,
      message: code === 'MERGE_INTERSECTION'
        ? `Há células mescladas nesta ${axisWord(axis)}. Desfaça a mescla antes de excluir.`
        : 'Não foi possível excluir. Nada foi alterado.',
    };
  }
  return { ok: true, plan: { axis, axisIds, firstIndex: items.findIndex((item) => item.id === axisIds[0]) } };
}

export interface TableGridMenuModel {
  /** Row deletion is offered unless whole columns (or the whole table) are selected. */
  readonly removeRows?: { readonly label: string; readonly count: number };
  readonly removeColumns?: { readonly label: string; readonly count: number };
  readonly canMerge: boolean;
  readonly canUnmerge: boolean;
}

export function tableGridMenuModel(table: TableModel, selection: TableSelection): TableGridMenuModel {
  const rowCount = selection.kind === 'columns' || selection.kind === 'table' ? 0 : selectedAxisIds(table, selection, 'row').length;
  const columnCount = selection.kind === 'rows' || selection.kind === 'table' ? 0 : selectedAxisIds(table, selection, 'column').length;
  const label = (axis: TableGridAxis, count: number) => (count === 1
    ? `Excluir ${axisWord(axis)}`
    : `Excluir ${describeAxisCount(axis, count)}`);
  return {
    ...(rowCount > 0 ? { removeRows: { label: label('row', rowCount), count: rowCount } } : {}),
    ...(columnCount > 0 ? { removeColumns: { label: label('column', columnCount), count: columnCount } } : {}),
    canMerge: mergeEligibility(table, selection).enabled,
    canUnmerge: unmergeEligibility(table, selection).enabled,
  };
}

function cellAt(table: TableModel, rowIndex: number, columnIndex: number): TableSelectionPoint | undefined {
  const row = table.rows[Math.min(Math.max(rowIndex, 0), table.rows.length - 1)];
  const column = table.columns[Math.min(Math.max(columnIndex, 0), table.columns.length - 1)];
  return row && column ? canonicalTablePoint(table, { rowId: row.id, columnId: column.id }) : undefined;
}

/**
 * After an insert the person lands on the new row (or column), on the same column (or row) as before, ready to
 * type. `previousFocus` comes from the table before the change.
 */
export function selectionAfterGridInsert(
  identity: TableSelectionIdentity,
  table: TableModel,
  axis: TableGridAxis,
  insertedId: string,
  previousFocus: TableSelectionPoint | undefined,
  selectFirstCell = false
): TableSelection | undefined {
  const rowIndex = axis === 'row'
    ? table.rows.findIndex((row) => row.id === insertedId)
    : Math.max(0, table.rows.findIndex((row) => row.id === previousFocus?.rowId));
  const columnIndex = axis === 'column'
    ? table.columns.findIndex((column) => column.id === insertedId)
    : selectFirstCell ? 0 : Math.max(0, table.columns.findIndex((column) => column.id === previousFocus?.columnId));
  if (rowIndex < 0 || columnIndex < 0) return undefined;
  const point = cellAt(table, rowIndex, columnIndex);
  return point ? tableCellSelection(identity, point) : undefined;
}

/** After a deletion the selection stays where the first removed row (or column) was. */
export function selectionAfterGridRemoval(
  identity: TableSelectionIdentity,
  before: TableModel,
  after: TableModel,
  plan: PlannedTableAxisRemoval,
  previousSelection: TableSelection
): TableSelection | undefined {
  const focus = tableSelectionFocusPoint(before, previousSelection);
  const rowIndex = plan.axis === 'row'
    ? plan.firstIndex
    : Math.max(0, after.rows.findIndex((row) => row.id === focus?.rowId));
  const columnIndex = plan.axis === 'column'
    ? plan.firstIndex
    : Math.max(0, after.columns.findIndex((column) => column.id === focus?.columnId));
  const point = cellAt(after, rowIndex, columnIndex);
  return point ? tableCellSelection(identity, point) : undefined;
}
