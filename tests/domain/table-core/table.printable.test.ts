// tests/domain/table-core/table.printable.test.ts
// Testes de Identidade Estável de Tradução (i18n) do Table Core V2.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  addRow,
  getTableColumnPrintableNodeId,
  getTableCellPrintableNodeId,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Stable Printable Node IDs', () => {
  it('TABLE-I18N-ID-1: A mesma tabela produz IDs estáveis consistentes', () => {
    const table = createTable({
      id: 'tbl_stable_test',
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const col = table.columns[0];
    const row = table.rows[0];
    const cell = table.cells[getCellKey(row.id, col.id)];

    const colNodeId1 = getTableColumnPrintableNodeId(table.id, col.id);
    const colNodeId2 = getTableColumnPrintableNodeId(table.id, col.id);
    expect(colNodeId1).toBe(colNodeId2);
    expect(colNodeId1).toBe(`table_${table.id}_column_${col.id}_label`);

    const cellNodeId1 = getTableCellPrintableNodeId(table.id, cell.id);
    const cellNodeId2 = getTableCellPrintableNodeId(table.id, cell.id);
    expect(cellNodeId1).toBe(cellNodeId2);
    expect(cellNodeId1).toBe(`table_${table.id}_cell_${cell.id}_text`);
  });

  it('TABLE-I18N-ID-2: Reordenação ou adição de linhas NÃO altera a identidade da célula', () => {
    const table = createTable({
      id: 'tbl_reorder_rows',
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const initialCell = Object.values(table.cells)[0];
    const initialCellNodeId = getTableCellPrintableNodeId(table.id, initialCell.id);

    // Adiciona uma linha no topo (índice 0), empurrando a linha anterior para o índice 1
    const expanded = addRow(table, { kind: 'data' }, undefined, 0);

    // A célula original ainda existe com seu próprio ID imutável
    const preservedCell = expanded.cells[getCellKey(initialCell.rowId, initialCell.columnId)];
    expect(preservedCell).toBeDefined();

    const currentCellNodeId = getTableCellPrintableNodeId(expanded.id, preservedCell.id);
    expect(currentCellNodeId).toBe(initialCellNodeId);
  });

  it('TABLE-I18N-ID-3: Reordenação ou adição de colunas NÃO altera a identidade da coluna', () => {
    const table = createTable({
      id: 'tbl_reorder_cols',
      columns: [{ semanticKey: 'col_orig', defaultLabel: 'Original', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const origCol = table.columns[0];
    const origColNodeId = getTableColumnPrintableNodeId(table.id, origCol.id);

    // Reordena ou cria outra tabela preservando a coluna
    const reorderedCols = [
      { id: 'new_col_top', semanticKey: 'top', defaultLabel: 'Top', widthSpec: { mode: 'auto' as const }, align: 'left' as const },
      origCol
    ];

    const reorderedTable = {
      ...table,
      columns: reorderedCols
    };

    const currentTargetCol = reorderedTable.columns.find((c) => c.id === origCol.id)!;
    const currentTargetNodeId = getTableColumnPrintableNodeId(reorderedTable.id, currentTargetCol.id);

    expect(currentTargetNodeId).toBe(origColNodeId);
  });
});
