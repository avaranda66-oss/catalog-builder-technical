// src/domain/table-core/table.engine.ts
// Motor Funcional Puro do Table Core V2.
// Executa mutações puramente imutáveis sobre TableCoreModel,
// validando invariantes e aplicando política fail-closed.

import {
  TableCoreModel,
  TableColumnModel,
  TableRowModel,
  TableCellModel,
  TableCellContent,
  ColumnWidthSpec,
  TablePresetId
} from './table.types';
import { getCellKey, validateTableModel } from './table.validator';
import { applyTablePreset } from './table.presets';
import { DEFAULT_TABLE_PAGINATION_POLICY } from './table.pagination';

export class TableEngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TableEngineError';
    this.code = code;
  }
}

/**
 * Gera um ID estável simples para novos elementos gerados em runtime.
 */
function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateTableParams {
  id?: string;
  title?: string;
  columns: Omit<TableColumnModel, 'id'>[];
  rowsCount?: number;
  presetId?: TablePresetId;
}

/**
 * Cria uma nova tabela TableCoreModel válida e normalizada.
 */
export function createTable(params: CreateTableParams): TableCoreModel {
  const tableId = params.id || generateId('tbl');
  const presetId = params.presetId || 'presys_clean_technical';

  const columns: TableColumnModel[] = params.columns.map((col) => ({
    ...col,
    id: generateId('col')
  }));

  if (columns.length === 0) {
    throw new TableEngineError('EMPTY_COLUMNS', 'A tabela deve possuir ao menos uma coluna.');
  }

  const rowsCount = params.rowsCount ?? 1;
  const rows: TableRowModel[] = [];
  const cells: Record<string, TableCellModel> = {};

  for (let r = 0; r < rowsCount; r++) {
    const rowId = generateId('row');
    rows.push({
      id: rowId,
      kind: 'data'
    });

    for (const col of columns) {
      const cellId = generateId('cell');
      const key = getCellKey(rowId, col.id);
      cells[key] = {
        id: cellId,
        rowId,
        columnId: col.id,
        content: { kind: 'empty' },
        colSpan: 1,
        rowSpan: 1
      };
    }
  }

  const baseTable: TableCoreModel = {
    id: tableId,
    schemaVersion: 1,
    title: params.title,
    columns,
    rows,
    cells,
    presentation: {
      presetId,
      density: 'regular',
      borderStyle: 'all',
      stripeStyle: 'none',
      headerBackgroundToken: 'slate_900',
      headerTextColorToken: 'white',
      fontScale: 'normal',
      tableWidthMode: 'auto_fill'
    },
    paginationPolicy: structuredClone(DEFAULT_TABLE_PAGINATION_POLICY)
  };

  const configuredTable = applyTablePreset(baseTable, presetId);
  const validation = validateTableModel(configuredTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_TABLE_INITIALIZATION', validation.errors.join('; '));
  }

  return configuredTable;
}

/**
 * Adiciona uma nova linha à tabela.
 */
export function addRow(
  table: TableCoreModel,
  newRow: Omit<TableRowModel, 'id'> & { id?: string },
  initialCellContents?: Record<string, TableCellContent>,
  targetIndex?: number
): TableCoreModel {
  const rowId = newRow.id || generateId('row');
  if (table.rows.some((r) => r.id === rowId)) {
    throw new TableEngineError('DUPLICATE_ROW_ID', `Já existe linha com ID "${rowId}".`);
  }

  const rowModel: TableRowModel = {
    ...newRow,
    id: rowId
  };

  const updatedRows = [...table.rows];
  if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= updatedRows.length) {
    updatedRows.splice(targetIndex, 0, rowModel);
  } else {
    updatedRows.push(rowModel);
  }

  const updatedCells = { ...table.cells };
  for (const col of table.columns) {
    const cellId = generateId('cell');
    const key = getCellKey(rowId, col.id);
    const content = initialCellContents?.[col.id] || initialCellContents?.[col.semanticKey] || { kind: 'empty' };
    updatedCells[key] = {
      id: cellId,
      rowId,
      columnId: col.id,
      content,
      colSpan: 1,
      rowSpan: 1
    };
  }

  const nextTable: TableCoreModel = {
    ...table,
    rows: updatedRows,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_ROW_ADDITION', validation.errors.join('; '));
  }

  return nextTable;
}

/**
 * Remove uma linha da tabela.
 * FAIL-CLOSED: Se a linha intersectar uma célula com rowSpan > 1, a operação é rejeitada.
 */
export function removeRow(table: TableCoreModel, rowId: string): TableCoreModel {
  const rowIndex = table.rows.findIndex((r) => r.id === rowId);
  if (rowIndex === -1) {
    throw new TableEngineError('ROW_NOT_FOUND', `Linha "${rowId}" não encontrada.`);
  }

  // Verificar se há merges afetados
  for (const cell of Object.values(table.cells)) {
    if (cell.rowId === rowId) {
      if ((cell.rowSpan ?? 1) > 1) {
        throw new TableEngineError(
          'CANNOT_MUTATE_MERGED_CELL',
          `Não é possível excluir linha contendo célula âncora mesclada verticalmente (rowSpan=${cell.rowSpan}).`
        );
      }
      if (cell.coveredBy) {
        throw new TableEngineError(
          'CANNOT_MUTATE_MERGED_CELL',
          `Não é possível excluir linha que intersecta uma área mesclada (coberta por "${cell.coveredBy}").`
        );
      }
    }
  }

  const updatedRows = table.rows.filter((r) => r.id !== rowId);
  const updatedCells = { ...table.cells };

  for (const col of table.columns) {
    const key = getCellKey(rowId, col.id);
    delete updatedCells[key];
  }

  const nextTable: TableCoreModel = {
    ...table,
    rows: updatedRows,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_ROW_REMOVAL', validation.errors.join('; '));
  }

  return nextTable;
}

/**
 * Adiciona uma nova coluna à tabela.
 */
export function addColumn(
  table: TableCoreModel,
  newCol: Omit<TableColumnModel, 'id'> & { id?: string },
  initialCellContents?: Record<string, TableCellContent>,
  targetIndex?: number
): TableCoreModel {
  const colId = newCol.id || generateId('col');
  if (table.columns.some((c) => c.id === colId)) {
    throw new TableEngineError('DUPLICATE_COLUMN_ID', `Já existe coluna com ID "${colId}".`);
  }

  const colModel: TableColumnModel = {
    ...newCol,
    id: colId
  };

  const updatedCols = [...table.columns];
  if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= updatedCols.length) {
    updatedCols.splice(targetIndex, 0, colModel);
  } else {
    updatedCols.push(colModel);
  }

  const updatedCells = { ...table.cells };
  for (const row of table.rows) {
    const cellId = generateId('cell');
    const key = getCellKey(row.id, colId);
    const content = initialCellContents?.[row.id] || { kind: 'empty' };
    updatedCells[key] = {
      id: cellId,
      rowId: row.id,
      columnId: colId,
      content,
      colSpan: 1,
      rowSpan: 1
    };
  }

  const nextTable: TableCoreModel = {
    ...table,
    columns: updatedCols,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_COLUMN_ADDITION', validation.errors.join('; '));
  }

  return nextTable;
}

/**
 * Remove uma coluna da tabela.
 * FAIL-CLOSED: Se a coluna intersectar uma célula com colSpan > 1, a operação é rejeitada.
 */
export function removeColumn(table: TableCoreModel, columnId: string): TableCoreModel {
  if (table.columns.length <= 1) {
    throw new TableEngineError('MIN_COLUMNS_REACHED', 'A tabela não pode ficar sem colunas.');
  }

  const colIndex = table.columns.findIndex((c) => c.id === columnId);
  if (colIndex === -1) {
    throw new TableEngineError('COLUMN_NOT_FOUND', `Coluna "${columnId}" não encontrada.`);
  }

  // Verificar se há merges afetados
  for (const cell of Object.values(table.cells)) {
    if (cell.columnId === columnId) {
      if ((cell.colSpan ?? 1) > 1) {
        throw new TableEngineError(
          'CANNOT_MUTATE_MERGED_CELL',
          `Não é possível excluir coluna contendo célula âncora mesclada horizontalmente (colSpan=${cell.colSpan}).`
        );
      }
      if (cell.coveredBy) {
        throw new TableEngineError(
          'CANNOT_MUTATE_MERGED_CELL',
          `Não é possível excluir coluna que intersecta uma área mesclada (coberta por "${cell.coveredBy}").`
        );
      }
    }
  }

  const updatedCols = table.columns.filter((c) => c.id !== columnId);
  const updatedCells = { ...table.cells };

  for (const row of table.rows) {
    const key = getCellKey(row.id, columnId);
    delete updatedCells[key];
  }

  const nextTable: TableCoreModel = {
    ...table,
    columns: updatedCols,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_COLUMN_REMOVAL', validation.errors.join('; '));
  }

  return nextTable;
}

/**
 * Altera a largura física de uma coluna.
 */
export function setColumnWidth(
  table: TableCoreModel,
  columnId: string,
  widthSpec: ColumnWidthSpec
): TableCoreModel {
  const colIndex = table.columns.findIndex((c) => c.id === columnId);
  if (colIndex === -1) {
    throw new TableEngineError('COLUMN_NOT_FOUND', `Coluna "${columnId}" não encontrada.`);
  }

  if (widthSpec.mode === 'fixed_mm') {
    if (typeof widthSpec.widthMm !== 'number' || widthSpec.widthMm <= 0) {
      throw new TableEngineError('INVALID_COLUMN_WIDTH', 'Largura fixed_mm deve ser estritamente maior que zero.');
    }
  }

  const updatedCols = table.columns.map((c) => (c.id === columnId ? { ...c, widthSpec } : c));

  return {
    ...table,
    columns: updatedCols
  };
}

/**
 * Altera o conteúdo de uma célula específica por coordenadas (rowId, columnId).
 */
export function setCellContent(
  table: TableCoreModel,
  rowId: string,
  columnId: string,
  content: TableCellContent
): TableCoreModel {
  const key = getCellKey(rowId, columnId);
  const existingCell = table.cells[key];
  if (!existingCell) {
    throw new TableEngineError('CELL_NOT_FOUND', `Célula não encontrada na coordenada [row=${rowId}, col=${columnId}].`);
  }

  if (existingCell.coveredBy) {
    throw new TableEngineError(
      'CANNOT_EDIT_COVERED_CELL',
      `Não é possível definir conteúdo em célula coberta por outra mesclagem (coberta por "${existingCell.coveredBy}").`
    );
  }

  const updatedCells = {
    ...table.cells,
    [key]: {
      ...existingCell,
      content
    }
  };

  return {
    ...table,
    cells: updatedCells
  };
}

/**
 * Mescla uma região retangular de células a partir da âncora (startRowId, startColumnId).
 */
export function mergeCells(
  table: TableCoreModel,
  startRowId: string,
  startColumnId: string,
  colSpan: number,
  rowSpan: number
): TableCoreModel {
  if (colSpan < 1 || rowSpan < 1) {
    throw new TableEngineError('INVALID_SPAN', 'colSpan e rowSpan devem ser maiores ou iguais a 1.');
  }
  if (colSpan === 1 && rowSpan === 1) {
    return table; // No-op
  }

  const startR = table.rows.findIndex((r) => r.id === startRowId);
  const startC = table.columns.findIndex((c) => c.id === startColumnId);

  if (startR === -1) throw new TableEngineError('ROW_NOT_FOUND', `Linha âncora "${startRowId}" não encontrada.`);
  if (startC === -1) throw new TableEngineError('COLUMN_NOT_FOUND', `Coluna âncora "${startColumnId}" não encontrada.`);

  if (startC + colSpan > table.columns.length) {
    throw new TableEngineError('SPAN_OVERFLOW', `colSpan (${colSpan}) ultrapassa o limite de colunas da tabela.`);
  }
  if (startR + rowSpan > table.rows.length) {
    throw new TableEngineError('SPAN_OVERFLOW', `rowSpan (${rowSpan}) ultrapassa o limite de linhas da tabela.`);
  }

  const anchorKey = getCellKey(startRowId, startColumnId);
  const anchorCell = table.cells[anchorKey];
  if (!anchorCell) {
    throw new TableEngineError('ANCHOR_NOT_FOUND', `Célula âncora não encontrada.`);
  }
  if (anchorCell.coveredBy) {
    throw new TableEngineError('ANCHOR_IS_COVERED', `A célula de origem já é coberta por outra mesclagem.`);
  }

  // Verificar se qualquer célula no retângulo de destino já participa de outro merge
  for (let r = startR; r < startR + rowSpan; r++) {
    for (let c = startC; c < startC + colSpan; c++) {
      if (r === startR && c === startC) continue;
      const targetRow = table.rows[r];
      const targetCol = table.columns[c];
      const targetCell = table.cells[getCellKey(targetRow.id, targetCol.id)];
      if (targetCell) {
        if (targetCell.coveredBy) {
          throw new TableEngineError('MERGE_OVERLAP', `A célula [${targetRow.id}::${targetCol.id}] já está coberta por outra mesclagem.`);
        }
        if ((targetCell.colSpan ?? 1) > 1 || (targetCell.rowSpan ?? 1) > 1) {
          throw new TableEngineError('MERGE_OVERLAP', `A célula [${targetRow.id}::${targetCol.id}] é uma âncora ativa de outra mesclagem.`);
        }
      }
    }
  }

  const updatedCells = { ...table.cells };

  // Atualizar a âncora
  updatedCells[anchorKey] = {
    ...anchorCell,
    colSpan,
    rowSpan,
    coveredBy: undefined
  };

  // Marcar as células cobertas
  for (let r = startR; r < startR + rowSpan; r++) {
    for (let c = startC; c < startC + colSpan; c++) {
      if (r === startR && c === startC) continue;
      const targetRow = table.rows[r];
      const targetCol = table.columns[c];
      const targetKey = getCellKey(targetRow.id, targetCol.id);
      const cellToCover = table.cells[targetKey];
      if (cellToCover) {
        updatedCells[targetKey] = {
          ...cellToCover,
          colSpan: 1,
          rowSpan: 1,
          coveredBy: anchorCell.id,
          content: { kind: 'empty' } // Limpa conteúdo da coberta
        };
      }
    }
  }

  const nextTable: TableCoreModel = {
    ...table,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_MERGE_RESULT', validation.errors.join('; '));
  }

  return nextTable;
}

/**
 * Desfaz a mesclagem de uma célula âncora, restaurando as células cobertas.
 */
export function unmergeCell(table: TableCoreModel, anchorRowId: string, anchorColumnId: string): TableCoreModel {
  const anchorKey = getCellKey(anchorRowId, anchorColumnId);
  const anchorCell = table.cells[anchorKey];
  if (!anchorCell) {
    throw new TableEngineError('CELL_NOT_FOUND', `Célula [${anchorRowId}::${anchorColumnId}] não encontrada.`);
  }

  const colSpan = anchorCell.colSpan ?? 1;
  const rowSpan = anchorCell.rowSpan ?? 1;

  if (colSpan <= 1 && rowSpan <= 1) {
    return table; // Já não é mesclada
  }

  const updatedCells = { ...table.cells };

  // Reseta âncora
  updatedCells[anchorKey] = {
    ...anchorCell,
    colSpan: 1,
    rowSpan: 1,
    coveredBy: undefined
  };

  // Libera todas as células cobertas por esta âncora
  for (const [key, cell] of Object.entries(updatedCells)) {
    if (cell.coveredBy === anchorCell.id) {
      updatedCells[key] = {
        ...cell,
        coveredBy: undefined,
        colSpan: 1,
        rowSpan: 1
      };
    }
  }

  const nextTable: TableCoreModel = {
    ...table,
    cells: updatedCells
  };

  const validation = validateTableModel(nextTable);
  if (!validation.valid) {
    throw new TableEngineError('INVALID_UNMERGE_RESULT', validation.errors.join('; '));
  }

  return nextTable;
}
