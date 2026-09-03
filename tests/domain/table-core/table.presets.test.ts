// tests/domain/table-core/table.presets.test.ts
// Testes de Presets de Apresentação e Desacoplamento de Conteúdo.

import { describe, it, expect } from 'vitest';
import {
  createTable,
  setCellContent,
  applyTablePreset,
  getCellKey
} from '../../../src/domain/table-core';

describe('Table Core V2: Presentation Presets', () => {
  it('TABLE-PRESET-1: Aplicar preset altera apenas tokens visuais de apresentação', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1,
      presetId: 'presys_clean_technical'
    });

    const updated = applyTablePreset(table, 'dense_spec_matrix');

    expect(updated.presentation.presetId).toBe('dense_spec_matrix');
    expect(updated.presentation.density).toBe('compact');
    expect(updated.presentation.fontScale).toBe('compact');
    expect(updated.presentation.stripeStyle).toBe('subtle_zebra');
  });

  it('TABLE-PRESET-2: Aplicar preset NÃO altera valores de células existentes', () => {
    const table = createTable({
      columns: [{ semanticKey: 'accuracy', defaultLabel: 'Exatidão', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    const r0 = table.rows[0].id;
    const c0 = table.columns[0].id;

    const populated = setCellContent(table, r0, c0, {
      kind: 'value_unit',
      amount: 0.05,
      unit: '% FE',
      qualifier: '±'
    });

    const withPreset = applyTablePreset(populated, 'model_comparison');

    const cell = withPreset.cells[getCellKey(r0, c0)];
    expect(cell.content).toEqual({
      kind: 'value_unit',
      amount: 0.05,
      unit: '% FE',
      qualifier: '±'
    });
  });

  it('TABLE-PRESET-3: IDs de colunas, linhas e células permanecem 100% idênticos', () => {
    const table = createTable({
      columns: [
        { semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' },
        { semanticKey: 'c2', defaultLabel: 'C2', widthSpec: { mode: 'auto' }, align: 'left' }
      ],
      rowsCount: 2
    });

    const withPreset = applyTablePreset(table, 'parameter_value');

    expect(withPreset.columns.map((c) => c.id)).toEqual(table.columns.map((c) => c.id));
    expect(withPreset.rows.map((r) => r.id)).toEqual(table.rows.map((r) => r.id));
    expect(Object.keys(withPreset.cells)).toEqual(Object.keys(table.cells));
  });

  it('TABLE-PRESET-4: Preset desconhecido lança erro e não altera a tabela', () => {
    const table = createTable({
      columns: [{ semanticKey: 'c1', defaultLabel: 'C1', widthSpec: { mode: 'auto' }, align: 'left' }],
      rowsCount: 1
    });

    expect(() => {
      applyTablePreset(table, 'preset_inexistente' as any);
    }).toThrowError(/desconhecido/i);
  });
});
