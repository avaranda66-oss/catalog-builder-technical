// tests/domain/table-core/merge-data-loss.test.ts
// Testes de Prevenção de Perda Silenciosa de Dados em Mesclagens (Zero Silent Data Loss).

import { describe, it, expect } from 'vitest';
import {
  createTable,
  setCellContent,
  mergeCells,
  TableEngineError,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Zero Silent Data Loss on Merge', () => {
  it('MERGE-DATA-LOSS-1: Célula vizinha com texto causa rejeição imediata da mesclagem', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    // Anchor possui texto e vizinha também possui texto
    const t1 = setCellContent(table, r0, c0, { kind: 'text', text: 'Âncora' });
    const t2 = setCellContent(t1, r0, c1, { kind: 'text', text: 'Dado Importante' });

    expect(() => {
      mergeCells(t2, r0, c0, 2, 1);
    }).toThrowError(TableEngineError);

    try {
      mergeCells(t2, r0, c0, 2, 1);
    } catch (err: unknown) {
      expect((err as TableEngineError).code).toBe('MERGE_WOULD_DISCARD_CONTENT');
      expect((err as Error).message).toContain('seriam perdidos silenciosamente');
    }
  });

  it('MERGE-DATA-LOSS-2: Célula vizinha com número causa rejeição', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    const t1 = setCellContent(table, r0, c1, { kind: 'number', value: 42 });

    expect(() => {
      mergeCells(t1, r0, c0, 2, 1);
    }).toThrowError(TableEngineError);
  });

  it('MERGE-DATA-LOSS-3: Célula vizinha com datum_reference causa rejeição', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    const t1 = setCellContent(table, r0, c1, {
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'k1',
      bindingMode: 'live'
    });

    expect(() => {
      mergeCells(t1, r0, c0, 2, 1);
    }).toThrowError(TableEngineError);
  });

  it('MERGE-DATA-LOSS-4: Todas as células cobertas estritamente vazias → mesclagem é realizada com sucesso', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    // Anchor possui valor, mas vizinha é empty
    const t1 = setCellContent(table, r0, c0, { kind: 'text', text: 'Título Unificado' });
    const merged = mergeCells(t1, r0, c0, 2, 1);

    expect(merged.cells[getCellKey(r0, c0)].colSpan).toBe(2);
    expect(merged.cells[getCellKey(r0, c0)].content).toEqual({ kind: 'text', text: 'Título Unificado' });
    expect(merged.cells[getCellKey(r0, c1)].coveredBy).toBe(merged.cells[getCellKey(r0, c0)].id);
  });

  it('MERGE-DATA-LOSS-5: Rejeição de mesclagem preserva o modelo de entrada 100% inalterado', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;
    const c1 = table.columns[1].id;

    const populated = setCellContent(table, r0, c1, { kind: 'text', text: 'Não Me Apague' });
    const snapshot = JSON.stringify(populated);

    try {
      mergeCells(populated, r0, c0, 2, 1);
    } catch {
      // Ignora erro esperado
    }

    expect(JSON.stringify(populated)).toBe(snapshot);
  });
});
