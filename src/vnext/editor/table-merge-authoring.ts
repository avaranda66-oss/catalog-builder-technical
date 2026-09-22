import type { Cell, TableModel } from '../domain/editorial-model';
import { cellIndex, getCellKey } from '../table/table-model';
import {
  canonicalTablePoint,
  normalizeTableSelection,
  tableCellSelection,
  tableRangeSelection,
  type TableSelection,
  type TableSelectionIdentity,
} from './table-selection';

export interface PreparedTableMerge {
  anchorCellId: string;
  rows: number;
  columns: number;
}

export interface MergeEligibility {
  enabled: boolean;
  reason?: string;
  prepared?: PreparedTableMerge;
}

export interface UnmergeEligibility {
  enabled: boolean;
  reason?: string;
  anchorCellId?: string;
}

function slotCell(table: TableModel, rowIndex: number, columnIndex: number): Cell | undefined {
  const row = table.rows[rowIndex];
  const column = table.columns[columnIndex];
  if (!row || !column) return undefined;
  return cellIndex(table).get(getCellKey(row.id, column.id));
}

export function mergeEligibility(table: TableModel, selection: TableSelection): MergeEligibility {
  if (selection.kind !== 'range') {
    return { enabled: false, reason: 'Selecione duas ou mais células adjacentes.' };
  }
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return { enabled: false, reason: 'A seleção não é mais válida.' };
  const rows = normalized.rowEnd - normalized.rowStart + 1;
  const columns = normalized.columnEnd - normalized.columnStart + 1;
  if (rows * columns < 2) return { enabled: false, reason: 'Selecione duas ou mais células adjacentes.' };

  const anchor = slotCell(table, normalized.rowStart, normalized.columnStart);
  if (!anchor) return { enabled: false, reason: 'A seleção não é mais válida.' };

  const cells: Cell[] = [];
  for (let row = normalized.rowStart; row <= normalized.rowEnd; row += 1) {
    for (let column = normalized.columnStart; column <= normalized.columnEnd; column += 1) {
      const cell = slotCell(table, row, column);
      if (!cell) return { enabled: false, reason: 'A seleção não é mais válida.' };
      cells.push(cell);
    }
  }

  if (cells.some((cell) => cell.coveredBy || (cell.span?.rows ?? 1) > 1 || (cell.span?.columns ?? 1) > 1)) {
    return { enabled: false, reason: 'Desmescle as células existentes antes de criar uma nova mesclagem.' };
  }
  const selectedRows = table.rows.slice(normalized.rowStart, normalized.rowEnd + 1);
  if (selectedRows.some((row) => (row.role === 'header') !== (selectedRows[0].role === 'header'))) {
    return { enabled: false, reason: 'Não é possível mesclar cabeçalho e corpo.' };
  }
  const nonAnchor = cells.filter((cell) => cell.id !== anchor.id);
  if (nonAnchor.some((cell) => cell.content.type !== 'empty')) {
    return { enabled: false, reason: 'Não é possível mesclar porque outra célula contém conteúdo.' };
  }
  if (nonAnchor.some((cell) => (cell.annotationIds?.length ?? 0) > 0)) {
    return { enabled: false, reason: 'Não é possível mesclar porque outra célula contém uma anotação.' };
  }
  return { enabled: true, prepared: { anchorCellId: anchor.id, rows, columns } };
}

export function unmergeEligibility(table: TableModel, selection: TableSelection): UnmergeEligibility {
  if (selection.kind !== 'cell') return { enabled: false, reason: 'Selecione uma célula mesclada.' };
  const canonical = canonicalTablePoint(table, selection.focus);
  if (!canonical) return { enabled: false, reason: 'A seleção não é mais válida.' };
  const anchor = table.cells.find((cell) => cell.rowId === canonical.rowId && cell.columnId === canonical.columnId);
  if (!anchor || (anchor.span?.rows ?? 1) <= 1 && (anchor.span?.columns ?? 1) <= 1) {
    return { enabled: false, reason: 'Selecione uma célula mesclada.' };
  }
  return { enabled: true, anchorCellId: anchor.id };
}

export function selectionAfterMerge(
  identity: TableSelectionIdentity,
  table: TableModel,
  anchorCellId: string
): TableSelection {
  const anchor = table.cells.find((cell) => cell.id === anchorCellId);
  if (!anchor) throw new Error(`Merged anchor ${anchorCellId} no longer exists`);
  return tableCellSelection(identity, { rowId: anchor.rowId, columnId: anchor.columnId });
}

export function selectionAfterUnmerge(
  identity: TableSelectionIdentity,
  table: TableModel,
  rowIndex: number,
  columnIndex: number,
  rows: number,
  columns: number,
  anchorCellId: string
): TableSelection {
  const anchor = table.cells.find((cell) => cell.id === anchorCellId);
  const rowStart = table.rows[rowIndex];
  const columnStart = table.columns[columnIndex];
  const rowEnd = table.rows[rowIndex + rows - 1];
  const columnEnd = table.columns[columnIndex + columns - 1];
  if (!anchor || !rowStart || !columnStart || !rowEnd || !columnEnd) {
    if (!anchor) throw new Error(`Unmerged anchor ${anchorCellId} no longer exists`);
    return tableCellSelection(identity, { rowId: anchor.rowId, columnId: anchor.columnId });
  }
  return tableRangeSelection(
    identity,
    { rowId: rowStart.id, columnId: columnStart.id },
    { rowId: rowEnd.id, columnId: columnEnd.id }
  );
}
