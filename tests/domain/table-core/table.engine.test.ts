// tests/domain/table-core/table.engine.test.ts
// Testes de Operações Funcionais e Imutabilidade do Table Core Engine.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  addRow,
  removeRow,
  addColumn,
  removeColumn,
  setColumnWidth,
  setCellContent,
  TableEngineError,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Operations Engine', () => {
  it('TABLE-ENGINE-1: Criação determinística e válida de tabela', () => {
    const table = createTable({
      id: 'tbl_fixed',
      title: 'Tabela PCON',
      columns: [
        { semanticKey: 'model', defaultLabel: 'Modelo', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'fixed_mm', widthMm: 30 }, align: 'center' }
      ],
      rowsCount: 3
    });

    expect(table.id).toBe('tbl_fixed');
    expect(table.schemaVersion).toBe(1);
    expect(table.columns).toHaveLength(2);
    expect(table.rows).toHaveLength(3);
    expect(Object.keys(table.cells)).toHaveLength(6);
  });

  it('TABLE-ENGINE-2: Adicionar linha com preenchimento correto de células', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const next = addRow(initial, { kind: 'data', minHeightMm: 8 });

    expect(next.rows).toHaveLength(2);
    expect(Object.keys(next.cells)).toHaveLength(2);
    expect(next.rows[1].minHeightMm).toBe(8);
  });

  it('TABLE-ENGINE-3: Remover linha limpa as células da grade com precisão', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 2
    });

    const rowToRemove = initial.rows[1].id;
    const next = removeRow(initial, rowToRemove);

    expect(next.rows).toHaveLength(1);
    expect(Object.keys(next.cells)).toHaveLength(1);
    expect(next.cells[getCellKey(rowToRemove, initial.columns[0].id)]).toBeUndefined();
  });

  it('TABLE-ENGINE-4: Adicionar coluna expande todas as linhas existentes', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 3
    });

    const next = addColumn(initial, {
      semanticKey: 'c2',
      defaultLabel: 'C2',
      widthSpec: { mode: 'auto' },
      align: 'right'
    });

    expect(next.columns).toHaveLength(2);
    expect(Object.keys(next.cells)).toHaveLength(6);
  });

  it('TABLE-ENGINE-5: Remover coluna limpa células correspondentes', () => {
    const initial = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const colToRemove = initial.columns[1].id;
    const next = removeColumn(initial, colToRemove);

    expect(next.columns).toHaveLength(1);
    expect(Object.keys(next.cells)).toHaveLength(2);
  });

  it('TABLE-ENGINE-6: Definir largura física da coluna em mm', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const colId = initial.columns[0].id;
    const next = setColumnWidth(initial, colId, { mode: 'fixed_mm', widthMm: 45 });

    expect(next.columns[0].widthSpec).toEqual({ mode: 'fixed_mm', widthMm: 45 });
  });

  it('TABLE-ENGINE-7: Definir conteúdo tipado na célula específica', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const rId = initial.rows[0].id;
    const cId = initial.columns[0].id;

    const next = setCellContent(initial, rId, cId, {
      kind: 'value_unit',
      amount: 0.025,
      unit: '% FE',
      qualifier: '±'
    });

    const cell = next.cells[getCellKey(rId, cId)];
    expect(cell.content).toEqual({
      kind: 'value_unit',
      amount: 0.025,
      unit: '% FE',
      qualifier: '±'
    });
  });

  it('TABLE-ENGINE-8: Imutabilidade estrita — o objeto de entrada nunca é modificado', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const snapshot = JSON.stringify(initial);

    // Executa operações
    const step1 = addRow(initial, { kind: 'data' });
    const step2 = addColumn(step1, { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' });

    // O initial original permanece 100% inalterado
    expect(JSON.stringify(initial)).toBe(snapshot);
    expect(initial.rows).toHaveLength(1);
    expect(step2.rows).toHaveLength(2);
  });

  it('TABLE-ENGINE-9: Operação inválida não causa mutação parcial e lança TableEngineError', () => {
    const initial = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const snapshot = JSON.stringify(initial);

    expect(() => {
      removeRow(initial, 'row_inexistente');
    }).toThrowError(TableEngineError);

    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});
