import type { TableModel } from '../domain/editorial-model';
import { insertedRowRole, removeAxisLabel, tableAxisRefusalMessage } from './table-axis-authoring';
import { mergeEligibility, unmergeEligibility } from './table-merge-authoring';
import { tableSelectionAxisIds, type TableSelection } from './table-selection';

/**
 * FR-34 (part of slice 2A) — what the "+" buttons and the right-click menu of the table grid do.
 *
 * Pure decisions only: which row or column is the reference and what the menu offers. The rows and columns of a
 * selection, the role of a new row, the removal plan and the session work are the ones of the table panel and the
 * bar above the page (`table-axis-authoring.ts`, `tableSelectionAxisIds`, `app/editor/table-structure-actions.ts`),
 * so the grid, the panel and the bar always do the same thing. No new action exists.
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

const STALE_REFERENCE_MESSAGE = 'A tabela mudou. Selecione a célula de novo.';

/**
 * The row (or column) next to which the new one goes: the one a "+" button names, or the edge of the selection
 * (above its first row, below its last row), the same rule as "Linha acima/abaixo" in the panel.
 */
export function planTableAxisInsert(
  table: TableModel,
  selection: TableSelection | null,
  command: Extract<TableGridCommand, { type: 'insert' }>
): TableGridPlan<PlannedTableAxisInsert> {
  const items = command.axis === 'row' ? table.rows : table.columns;
  let referenceAxisId = command.referenceAxisId;
  if (referenceAxisId === undefined && selection) {
    const axisIds = tableSelectionAxisIds(table, selection, command.axis);
    referenceAxisId = command.position === 'before' ? axisIds[0] : axisIds[axisIds.length - 1];
  }
  if (referenceAxisId === undefined) return { ok: false, message: tableAxisRefusalMessage('NO_AXIS', command.axis) };
  if (!items.some((item) => item.id === referenceAxisId)) return { ok: false, message: STALE_REFERENCE_MESSAGE };
  return {
    ok: true,
    plan: {
      axis: command.axis,
      referenceAxisId,
      position: command.position,
      properties: command.axis === 'row'
        ? { role: insertedRowRole(table, referenceAxisId, command.position), heightPolicy: { mode: 'AUTO' } }
        : { width: { mode: 'flex', weight: 1 }, minMm: 1 },
    },
  };
}

export interface TableGridMenuModel {
  /** Rows can be inserted next to the selection (a cell, a range or whole rows). */
  readonly insertRows: boolean;
  /** Columns can be inserted next to the selection (a cell, a range or whole columns). */
  readonly insertColumns: boolean;
  /** Row deletion is offered unless whole columns (or the whole table) are selected. */
  readonly removeRows?: { readonly label: string; readonly count: number };
  readonly removeColumns?: { readonly label: string; readonly count: number };
  readonly canMerge: boolean;
  readonly canUnmerge: boolean;
}

export function tableGridMenuModel(table: TableModel, selection: TableSelection): TableGridMenuModel {
  const rowIds = tableSelectionAxisIds(table, selection, 'row');
  const columnIds = tableSelectionAxisIds(table, selection, 'column');
  // Deleting every row of the whole table is "Excluir" on the table itself, not a grid command.
  const rowCount = selection.kind === 'table' ? 0 : rowIds.length;
  const columnCount = selection.kind === 'table' ? 0 : columnIds.length;
  return {
    insertRows: rowIds.length > 0,
    insertColumns: columnIds.length > 0,
    ...(rowCount > 0 ? { removeRows: { label: removeAxisLabel('row', rowCount), count: rowCount } } : {}),
    ...(columnCount > 0 ? { removeColumns: { label: removeAxisLabel('column', columnCount), count: columnCount } } : {}),
    canMerge: mergeEligibility(table, selection).enabled,
    canUnmerge: unmergeEligibility(table, selection).enabled,
  };
}
