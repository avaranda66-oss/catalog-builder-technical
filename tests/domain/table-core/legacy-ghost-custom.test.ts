// tests/domain/table-core/legacy-ghost-custom.test.ts
// Testes de Prevenção de Dados Fantasmas, Suporte Canônico a Custom_Table e Robustez de IDs.

import { describe, it, expect } from 'vitest';
import { ContentBlock } from '../../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  generateDeterministicColumnId,
  generateDeterministicRowId,
  generateDeterministicCellId
} from '../../../src/domain/table-core';

describe('Table Core V2: Legacy Ghost Data & Custom Table Hardening', () => {
  it('LEGACY-GHOST-1: Bloco legado sem colunas é rejeitado com missing_legacy_columns (Zero Ghost Column)', () => {
    const block: ContentBlock = {
      id: 'blk_empty_cols',
      type: 'table',
      tableColumns: [],
      tableRows: []
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('missing_legacy_columns');
    }
  });

  it('LEGACY-GHOST-2: Bloco com colunas e zero linhas resulta em tabela vazia real (Zero Ghost Row)', () => {
    const block: ContentBlock = {
      id: 'blk_zero_rows',
      type: 'table',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão', visible: true }],
      tableRows: [] // zero linhas!
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.rows).toHaveLength(0);
      expect(Object.keys(res.table.cells)).toHaveLength(0);
      expect(res.table.columns).toHaveLength(1);
    }
  });

  it('LEGACY-CUSTOM-1: custom_table com tableColumns canônico é suportado com sucesso', () => {
    const block: ContentBlock = {
      id: 'blk_custom_canonical',
      type: 'custom_table',
      tableColumns: [
        { key: 'param', label: 'Parâmetro', visible: true },
        { key: 'value', label: 'Valor', visible: true }
      ],
      tableRows: [
        { id: 'r1', localOverrides: { param: 'Pressão', value: '100 bar' } }
      ]
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.columns).toHaveLength(2);
      expect(res.table.rows).toHaveLength(1);
      expect(res.table.presentation.presetId).toBe('presys_clean_technical');
    }
  });

  it('LEGACY-CUSTOM-2: custom_table com customData.headers proprietário é rejeitado', () => {
    const block: ContentBlock = {
      id: 'blk_custom_prop',
      type: 'custom_table',
      customData: {
        headers: ['Header 1'],
        rows: [['Data 1']]
      }
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('custom_data_headers_unsupported');
    }
  });

  it('ADAPTER-ID-1 a ADAPTER-ID-5: Integridade e ausência de colisão com delimitadores e Unicode', () => {
    const bId1 = 'block:1/main';
    const bId2 = 'block:2/main';
    const colKey = 'temp_range:°C';
    const rowId = 'row#42/section';

    // Mesma entrada -> mesmo ID
    const id1 = generateDeterministicCellId(bId1, rowId, colKey);
    const id2 = generateDeterministicCellId(bId1, rowId, colKey);
    expect(id1).toBe(id2);

    // Bloco diferente -> ID diferente
    const idDiffBlock = generateDeterministicCellId(bId2, rowId, colKey);
    expect(id1).not.toBe(idDiffBlock);

    // Row ID determinístico
    const rId1 = generateDeterministicRowId(bId1, rowId);
    const rId2 = generateDeterministicRowId(bId1, rowId);
    expect(rId1).toBe(rId2);

    // Caracteres delimitadores não causam colisão ambígua
    const c1 = generateDeterministicColumnId('b1', 'a_b');
    const c2 = generateDeterministicColumnId('b1_a', 'b');
    expect(c1).not.toBe(c2);

    // Unicode preservado de forma determinística
    const u1 = generateDeterministicColumnId('b1', 'Exatidão ± 0.05%');
    const u2 = generateDeterministicColumnId('b1', 'Exatidão ± 0.05%');
    expect(u1).toBe(u2);
  });

  it('ADAPTER-ID-6: Bateria de 10.000 combinações geradas sem nenhuma colisão de identificador', () => {
    const seenIds = new Set<string>();
    const totalCombinations = 10000;

    for (let i = 0; i < totalCombinations; i++) {
      const blockId = `blk_${i % 50}`;
      const rowId = `row_${Math.floor(i / 50)}`;
      const colKey = `col_${i % 10}`;

      const cellId = generateDeterministicCellId(blockId, rowId, colKey);
      expect(seenIds.has(cellId)).toBe(false);
      seenIds.add(cellId);
    }

    expect(seenIds.size).toBe(totalCombinations);
  });
});
