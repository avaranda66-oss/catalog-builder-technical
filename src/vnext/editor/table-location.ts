import type { TableModel } from '../domain/editorial-model';

/**
 * FR-20 (2D): where a problem is inside a table, in the words the person sees on the page — "Linha 3, coluna 2" —
 * instead of the internal identifiers of rows and cells. Rows and columns are counted from 1, top to bottom and left
 * to right, the header row included. An identifier that no longer exists (the table changed) gives an empty text.
 */
export function describeTableLocation(
  table: Pick<TableModel, 'rows' | 'columns' | 'cells'>,
  rowId?: string,
  cellId?: string
): string {
  const cell = cellId ? table.cells.find((entry) => entry.id === cellId) : undefined;
  const rowIndex = table.rows.findIndex((row) => row.id === (cell?.rowId ?? rowId));
  if (rowIndex < 0) return '';
  const columnIndex = cell ? table.columns.findIndex((column) => column.id === cell.columnId) : -1;
  return columnIndex >= 0 ? `Linha ${rowIndex + 1}, coluna ${columnIndex + 1}` : `Linha ${rowIndex + 1}`;
}
