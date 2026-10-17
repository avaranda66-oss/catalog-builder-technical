import type { CatalogDocument, Cell, TableModel } from '../domain/editorial-model';
import { cellIndex, getCellKey, orderedAnchors } from '../table/table-model';

export interface TableSelectionIdentity {
  pageId: string;
  objectId: string;
  tableId: string;
}

export interface TableSelectionPoint {
  rowId: string;
  columnId: string;
}

type IdentitySelection = { identity: TableSelectionIdentity };

export type TableCellRangeSelection = IdentitySelection & {
  kind: 'cell' | 'range';
  anchor: TableSelectionPoint;
  focus: TableSelectionPoint;
};

export type TableSelection =
  | TableCellRangeSelection
  | (IdentitySelection & { kind: 'rows'; anchorRowId: string; focusRowId: string })
  | (IdentitySelection & { kind: 'columns'; anchorColumnId: string; focusColumnId: string })
  | (IdentitySelection & { kind: 'table' });

export interface NormalizedTableSelection {
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
  displayRowIds: readonly string[];
  displayColumnIds: readonly string[];
  displayCellIds: readonly string[];
  explicitRowIds: readonly string[];
  explicitColumnIds: readonly string[];
}

interface CellExtent {
  cell: Cell;
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}

export function tableSelectionIdentity(pageId: string, objectId: string, tableId: string): TableSelectionIdentity {
  return { pageId, objectId, tableId };
}

export function tableCellSelection(identity: TableSelectionIdentity, point: TableSelectionPoint): TableCellRangeSelection {
  return { kind: 'cell', identity, anchor: point, focus: point };
}

export function tableRangeSelection(
  identity: TableSelectionIdentity,
  anchor: TableSelectionPoint,
  focus: TableSelectionPoint
): TableCellRangeSelection {
  const same = anchor.rowId === focus.rowId && anchor.columnId === focus.columnId;
  return { kind: same ? 'cell' : 'range', identity, anchor, focus };
}

export function tableRowSelection(
  identity: TableSelectionIdentity,
  anchorRowId: string,
  focusRowId = anchorRowId
): TableSelection {
  return { kind: 'rows', identity, anchorRowId, focusRowId };
}

export function tableColumnSelection(
  identity: TableSelectionIdentity,
  anchorColumnId: string,
  focusColumnId = anchorColumnId
): TableSelection {
  return { kind: 'columns', identity, anchorColumnId, focusColumnId };
}

export function wholeTableSelection(identity: TableSelectionIdentity): TableSelection {
  return { kind: 'table', identity };
}

function inclusiveIds(ids: readonly string[], startId: string, endId: string): string[] | undefined {
  const start = ids.indexOf(startId);
  const end = ids.indexOf(endId);
  if (start < 0 || end < 0) return undefined;
  return ids.slice(Math.min(start, end), Math.max(start, end) + 1);
}

function tableLookup(table: TableModel) {
  return {
    rows: new Map(table.rows.map((row, index) => [row.id, index])),
    columns: new Map(table.columns.map((column, index) => [column.id, index])),
    cells: cellIndex(table),
    byId: new Map(table.cells.map(cell => [cell.id, cell])),
  };
}

function ownerExtent(table: TableModel, point: TableSelectionPoint, lookup = tableLookup(table)): CellExtent | undefined {
  if (!lookup.rows.has(point.rowId) || !lookup.columns.has(point.columnId)) return undefined;
  const slot = lookup.cells.get(getCellKey(point.rowId, point.columnId));
  if (!slot) return undefined;
  const cell = slot.coveredBy ? lookup.byId.get(slot.coveredBy) : slot;
  if (!cell) return undefined;
  const rowStart = lookup.rows.get(cell.rowId);
  const columnStart = lookup.columns.get(cell.columnId);
  if (rowStart === undefined || columnStart === undefined) return undefined;
  return {
    cell,
    rowStart,
    rowEnd: rowStart + (cell.span?.rows ?? 1) - 1,
    columnStart,
    columnEnd: columnStart + (cell.span?.columns ?? 1) - 1,
  };
}

export function canonicalTablePoint(table: TableModel, point: TableSelectionPoint): TableSelectionPoint | undefined {
  const extent = ownerExtent(table, point);
  return extent ? { rowId: extent.cell.rowId, columnId: extent.cell.columnId } : undefined;
}

/** One lookup per immutable table render, instead of rebuilding the entire grid for every hit target. */
export function createTablePointResolver(table: TableModel): (point: TableSelectionPoint) => TableSelectionPoint | undefined {
  const lookup = tableLookup(table);
  return point => {
    const extent = ownerExtent(table, point, lookup);
    return extent ? { rowId: extent.cell.rowId, columnId: extent.cell.columnId } : undefined;
  };
}

function intersects(
  extent: CellExtent,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number
): boolean {
  return extent.rowStart <= rowEnd
    && extent.rowEnd >= rowStart
    && extent.columnStart <= columnEnd
    && extent.columnEnd >= columnStart;
}

export function normalizeTableSelection(table: TableModel, selection: TableSelection): NormalizedTableSelection | undefined {
  const lookup = tableLookup(table);
  let rowStart: number;
  let rowEnd: number;
  let columnStart: number;
  let columnEnd: number;
  let explicitRowIds: string[] = [];
  let explicitColumnIds: string[] = [];

  if (selection.kind === 'cell' || selection.kind === 'range') {
    const anchor = ownerExtent(table, selection.anchor, lookup);
    const focus = ownerExtent(table, selection.focus, lookup);
    if (!anchor || !focus) return undefined;
    rowStart = Math.min(anchor.rowStart, focus.rowStart);
    rowEnd = Math.max(anchor.rowEnd, focus.rowEnd);
    columnStart = Math.min(anchor.columnStart, focus.columnStart);
    columnEnd = Math.max(anchor.columnEnd, focus.columnEnd);
  } else if (selection.kind === 'rows') {
    explicitRowIds = inclusiveIds(table.rows.map((row) => row.id), selection.anchorRowId, selection.focusRowId) ?? [];
    if (explicitRowIds.length === 0) return undefined;
    rowStart = table.rows.findIndex((row) => row.id === explicitRowIds[0]);
    rowEnd = rowStart + explicitRowIds.length - 1;
    columnStart = 0;
    columnEnd = table.columns.length - 1;
  } else if (selection.kind === 'columns') {
    explicitColumnIds = inclusiveIds(table.columns.map((column) => column.id), selection.anchorColumnId, selection.focusColumnId) ?? [];
    if (explicitColumnIds.length === 0) return undefined;
    columnStart = table.columns.findIndex((column) => column.id === explicitColumnIds[0]);
    columnEnd = columnStart + explicitColumnIds.length - 1;
    rowStart = 0;
    rowEnd = table.rows.length - 1;
  } else {
    rowStart = 0;
    rowEnd = table.rows.length - 1;
    columnStart = 0;
    columnEnd = table.columns.length - 1;
    explicitRowIds = table.rows.map((row) => row.id);
    explicitColumnIds = table.columns.map((column) => column.id);
  }

  const extents = table.cells.filter(cell => !cell.coveredBy).map((cell) => ownerExtent(table, {
    rowId: cell.rowId,
    columnId: cell.columnId,
  }, lookup)!);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const extent of extents) {
      if (!intersects(extent, rowStart, rowEnd, columnStart, columnEnd)) continue;
      const next = {
        rowStart: Math.min(rowStart, extent.rowStart),
        rowEnd: Math.max(rowEnd, extent.rowEnd),
        columnStart: Math.min(columnStart, extent.columnStart),
        columnEnd: Math.max(columnEnd, extent.columnEnd),
      };
      if (next.rowStart !== rowStart || next.rowEnd !== rowEnd
          || next.columnStart !== columnStart || next.columnEnd !== columnEnd) {
        ({ rowStart, rowEnd, columnStart, columnEnd } = next);
        expanded = true;
      }
    }
  }

  const displayRows = table.rows.slice(rowStart, rowEnd + 1);
  const displayColumns = table.columns.slice(columnStart, columnEnd + 1);
  const slots = lookup.cells;
  return {
    rowStart,
    rowEnd,
    columnStart,
    columnEnd,
    displayRowIds: displayRows.map((row) => row.id),
    displayColumnIds: displayColumns.map((column) => column.id),
    displayCellIds: displayRows.flatMap((row) => displayColumns.map((column) => slots.get(getCellKey(row.id, column.id))!.id)),
    explicitRowIds,
    explicitColumnIds,
  };
}

export function selectedTableAnchorIds(table: TableModel, selection: TableSelection): readonly string[] {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return [];
  const byId = new Map(table.cells.map((cell) => [cell.id, cell]));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const slotId of normalized.displayCellIds) {
    const slot = byId.get(slotId);
    if (!slot) continue;
    const anchorId = slot.coveredBy ?? slot.id;
    if (seen.has(anchorId)) continue;
    seen.add(anchorId);
    result.push(anchorId);
  }
  return result;
}

export function explicitTableAxisIds(
  table: TableModel,
  selection: TableSelection,
  axis: 'row' | 'column'
): readonly string[] {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return [];
  if (axis === 'row' && selection.kind === 'rows') return normalized.explicitRowIds;
  if (axis === 'column' && selection.kind === 'columns') return normalized.explicitColumnIds;
  return [];
}

/**
 * FR-34: the rows (or columns) the current selection touches, in table order, for "Linha acima", "Excluir linhas"
 * and the other structure actions. A cell or a range counts every row and column it covers, merged cells included
 * (a merged cell over two rows touches both). A row selection keeps its explicit rows and no column (and the
 * reverse for columns); the whole table touches every axis. Style scopes and dimension fields keep using
 * `explicitTableAxisIds`.
 */
export function tableSelectionAxisIds(
  table: TableModel,
  selection: TableSelection,
  axis: 'row' | 'column'
): readonly string[] {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return [];
  if (selection.kind === 'rows') return axis === 'row' ? normalized.explicitRowIds : [];
  if (selection.kind === 'columns') return axis === 'column' ? normalized.explicitColumnIds : [];
  return axis === 'row' ? normalized.displayRowIds : normalized.displayColumnIds;
}

export function tableSelectionFocusPoint(table: TableModel, selection: TableSelection): TableSelectionPoint | undefined {
  if (selection.kind === 'cell' || selection.kind === 'range') return canonicalTablePoint(table, selection.focus);
  if (selection.kind === 'rows') return canonicalTablePoint(table, {
    rowId: selection.focusRowId,
    columnId: table.columns[0].id,
  });
  if (selection.kind === 'columns') return canonicalTablePoint(table, {
    rowId: table.rows[0].id,
    columnId: selection.focusColumnId,
  });
  return canonicalTablePoint(table, { rowId: table.rows[0].id, columnId: table.columns[0].id });
}

function movePoint(
  table: TableModel,
  point: TableSelectionPoint,
  direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
): TableSelectionPoint {
  const extent = ownerExtent(table, point)!;
  let row = extent.rowStart;
  let column = extent.columnStart;
  if (direction === 'ArrowLeft') column = extent.columnStart - 1;
  if (direction === 'ArrowRight') column = extent.columnEnd + 1;
  if (direction === 'ArrowUp') row = extent.rowStart - 1;
  if (direction === 'ArrowDown') row = extent.rowEnd + 1;
  if (row < 0 || row >= table.rows.length || column < 0 || column >= table.columns.length) {
    return { rowId: extent.cell.rowId, columnId: extent.cell.columnId };
  }
  return canonicalTablePoint(table, { rowId: table.rows[row].id, columnId: table.columns[column].id })!;
}

export interface TableNavigationResult {
  selection: TableSelection;
  exited: boolean;
}

export function navigateTableSelection(
  table: TableModel,
  selection: TableSelection,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Tab',
  options: { extend?: boolean; backwards?: boolean } = {}
): TableNavigationResult {
  const current = tableSelectionFocusPoint(table, selection);
  if (!current) return { selection, exited: false };
  let next: TableSelectionPoint;
  if (key === 'Tab') {
    const stops = orderedAnchors(table).map((cell) => ({ rowId: cell.rowId, columnId: cell.columnId }));
    const currentIndex = stops.findIndex((point) => point.rowId === current.rowId && point.columnId === current.columnId);
    const nextIndex = currentIndex + (options.backwards ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= stops.length) return { selection, exited: true };
    next = stops[nextIndex];
  } else {
    next = movePoint(table, current, key);
  }
  const anchor = options.extend && (selection.kind === 'cell' || selection.kind === 'range')
    ? selection.anchor
    : next;
  return { selection: tableRangeSelection(selection.identity, anchor, next), exited: false };
}

export function reconcileTableSelection(document: CatalogDocument, selection: TableSelection | null): TableSelection | null {
  if (!selection) return null;
  const page = document.pages.find((entry) => entry.id === selection.identity.pageId);
  const object = page?.objects.find((entry) => entry.id === selection.identity.objectId);
  if (!object || object.type !== 'table' || object.table.id !== selection.identity.tableId) return null;
  return normalizeTableSelection(object.table, selection) ? selection : null;
}

export function selectionAfterAxisInsert(
  identity: TableSelectionIdentity,
  axis: 'row' | 'column',
  axisId: string
): TableSelection {
  return axis === 'row'
    ? tableRowSelection(identity, axisId)
    : tableColumnSelection(identity, axisId);
}

/**
 * FR-34: after "Linha acima/abaixo" or "Coluna à esquerda/direita". A row or column chosen by the side selector
 * selects the new row or column (as before); a cell, range or the whole table selects the new cell in the same
 * column (or row), so the person can type there right away.
 */
export function selectionAfterTableAxisInsert(
  table: TableModel,
  selection: TableSelection,
  axis: 'row' | 'column',
  insertedAxisId: string
): TableSelection {
  if (selection.kind === 'rows' || selection.kind === 'columns') return selectionAfterAxisInsert(selection.identity, axis, insertedAxisId);
  const focus = tableSelectionFocusPoint(table, selection);
  const point = axis === 'row'
    ? { rowId: insertedAxisId, columnId: focus?.columnId ?? table.columns[0].id }
    : { rowId: focus?.rowId ?? table.rows[0].id, columnId: insertedAxisId };
  const canonical = canonicalTablePoint(table, point);
  return canonical ? tableCellSelection(selection.identity, canonical) : selectionAfterAxisInsert(selection.identity, axis, insertedAxisId);
}

/**
 * FR-34: after "Excluir linhas/colunas". A side-selector selection keeps selecting the row or column now at the
 * first removed position (as before); a cell or range selects the cell there, in the column (or row) it had.
 */
export function selectionAfterTableAxisRemove(
  table: TableModel,
  selection: TableSelection,
  axis: 'row' | 'column',
  firstRemovedIndex: number,
  focusBefore: TableSelectionPoint | undefined
): TableSelection {
  if (selection.kind === 'rows' || selection.kind === 'columns' || selection.kind === 'table') {
    return selectionAfterAxisRemove(selection.identity, axis, firstRemovedIndex, table);
  }
  const clamp = (length: number) => Math.min(Math.max(firstRemovedIndex, 0), length - 1);
  const keepsColumn = focusBefore && table.columns.some((column) => column.id === focusBefore.columnId);
  const keepsRow = focusBefore && table.rows.some((row) => row.id === focusBefore.rowId);
  const point = axis === 'row'
    ? { rowId: table.rows[clamp(table.rows.length)].id, columnId: keepsColumn ? focusBefore!.columnId : table.columns[0].id }
    : { rowId: keepsRow ? focusBefore!.rowId : table.rows[0].id, columnId: table.columns[clamp(table.columns.length)].id };
  const canonical = canonicalTablePoint(table, point);
  return canonical ? tableCellSelection(selection.identity, canonical) : selectionAfterAxisRemove(selection.identity, axis, firstRemovedIndex, table);
}

export function selectionAfterAxisRemove(
  identity: TableSelectionIdentity,
  axis: 'row' | 'column',
  removedIndex: number,
  table: TableModel
): TableSelection {
  if (axis === 'row') {
    const row = table.rows[Math.min(Math.max(removedIndex, 0), table.rows.length - 1)];
    return tableRowSelection(identity, row.id);
  }
  const column = table.columns[Math.min(Math.max(removedIndex, 0), table.columns.length - 1)];
  return tableColumnSelection(identity, column.id);
}
