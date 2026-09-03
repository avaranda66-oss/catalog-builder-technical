// tests/domain/table-core/operations-expansion.test.ts
// Testes das Operações Expandidas do Table Core: Reordenação, Altura Mínima e Largura Total.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  reorderRows,
  reorderColumns,
  setTableWidth,
  setRowMinHeight,
  mergeCells,
  TableEngineError,
  getTableColumnPrintableNodeId,
  getTableCellPrintableNodeId,
  getCellKey
} from '../../../src/domain/table-core';
import { executeTableCommand } from '../../../src/domain/document-commands';

describe('Table Core V2: Operations Expansion & Reorder Protection', () => {
  it('OPERATIONS-EXPANSION-1: reorderRows reordena linhas preservando células e IDs', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 3
    });

    const [r0, r1, r2] = table.rows.map((r) => r.id);
    const reordered = reorderRows(table, [r2, r0, r1]);

    expect(reordered.rows.map((r) => r.id)).toEqual([r2, r0, r1]);
    expect(reordered.cells[getCellKey(r2, table.columns[0].id)]).toBeDefined();
    expect(reordered.cells[getCellKey(r0, table.columns[0].id)]).toBeDefined();
  });

  it('OPERATIONS-EXPANSION-2: reorderRows que quebre contiguidade de merge vertical é rejeitada (fail-closed)', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 3
    });

    const [r0, r1, r2] = table.rows.map((r) => r.id);
    // Mescla r0 e r1 verticalmente (span=2)
    const merged = mergeCells(table, r0, table.columns[0].id, 1, 2);

    // Tentar intercalar r2 entre r0 e r1 -> [r0, r2, r1] quebraria a contiguidade do merge
    expect(() => {
      reorderRows(merged, [r0, r2, r1]);
    }).toThrowError(TableEngineError);
  });

  it('OPERATIONS-EXPANSION-3: reorderColumns reordena colunas preservando células e IDs', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c0', defaultLabel: 'C0', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 1
    });

    const [c0, c1, c2] = table.columns.map((c) => c.id);
    const reordered = reorderColumns(table, [c2, c0, c1]);

    expect(reordered.columns.map((c) => c.id)).toEqual([c2, c0, c1]);
  });

  it('OPERATIONS-EXPANSION-4: setTableWidth e setRowMinHeight funcionam com tipos discriminados', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const resized = setTableWidth(table, { mode: 'fixed_mm', widthMm: 160 });
    expect(resized.presentation.tableWidth).toEqual({ mode: 'fixed_mm', widthMm: 160 });

    const withHeight = setRowMinHeight(resized, table.rows[0].id, 15);
    expect(withHeight.rows[0].minHeightMm).toBe(15);
  });

  it('OPERATIONS-EXPANSION-5: Comandos TABLE_REORDER_ROWS e TABLE_REORDER_COLUMNS executam via executor', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c0', defaultLabel: 'C0', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const resRow = executeTableCommand(table, {
      type: 'TABLE_REORDER_ROWS',
      tableId: table.id,
      newRowOrderIds: [table.rows[1].id, table.rows[0].id]
    });
    expect(resRow.success).toBe(true);

    const resCol = executeTableCommand(table, {
      type: 'TABLE_REORDER_COLUMNS',
      tableId: table.id,
      newColumnOrderIds: [table.columns[1].id, table.columns[0].id]
    });
    expect(resCol.success).toBe(true);
  });

  it('OPERATIONS-EXPANSION-6: Reordenação NÃO altera nenhum ID estável de tradução', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c0', defaultLabel: 'C0', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const cellBefore = Object.values(table.cells)[0];
    const nodeIdBefore = getTableCellPrintableNodeId(table.id, cellBefore.id);
    const colNodeIdBefore = getTableColumnPrintableNodeId(table.id, table.columns[0].id);

    const reordered = reorderRows(table, [table.rows[1].id, table.rows[0].id]);
    const reorderedBoth = reorderColumns(reordered, [table.columns[1].id, table.columns[0].id]);

    const cellAfter = reorderedBoth.cells[getCellKey(cellBefore.rowId, cellBefore.columnId)];
    const nodeIdAfter = getTableCellPrintableNodeId(reorderedBoth.id, cellAfter.id);
    const colNodeIdAfter = getTableColumnPrintableNodeId(reorderedBoth.id, table.columns[0].id);

    expect(nodeIdAfter).toBe(nodeIdBefore);
    expect(colNodeIdAfter).toBe(colNodeIdBefore);
  });
});
