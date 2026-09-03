// tests/domain/table-core/legacy-table.adapter.test.ts
// Testes dos Adaptadores READ-ONLY para Blocos Legados.
// Valida geração determinística de identidades e detecção de blocos não-suportados.

import { describe, it, expect } from 'vitest';
import { ContentBlock } from '../../../src/domain/catalog.schema';
import { adaptLegacyBlockToTableCore } from '../../../src/domain/table-core';

describe('Table Core V2: Legacy Read-Only Adapters', () => {
  it('LEGACY-ADAPTER-1: Bloco "table" canônico é adaptado com sucesso', () => {
    const block: ContentBlock = {
      id: 'blk_table_1',
      type: 'table',
      title: 'Especificações Técnicas Oficiais',
      tableColumns: [
        { key: 'code', label: 'Código', visible: true, width: 100 },
        { key: 'model', label: 'Modelo', visible: true, width: 120 }
      ],
      tableRows: [
        { id: 'r1', productRefId: 'prod_pcon', localOverrides: { code: 'PCON-Y18', model: 'Y18-Standard' } }
      ]
    };

    const res = adaptLegacyBlockToTableCore(block);

    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.title).toBe('Especificações Técnicas Oficiais');
      expect(res.table.columns).toHaveLength(2);
      expect(res.table.rows).toHaveLength(1);
      expect(res.table.presentation.presetId).toBe('presys_clean_technical');
    }
  });

  it('LEGACY-ADAPTER-2: Bloco "specs_table" é adaptado com sucesso', () => {
    const block: ContentBlock = {
      id: 'blk_specs_1',
      type: 'specs_table',
      title: 'Tabela de Specs',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão', visible: true }],
      tableRows: [{ id: 'r1', localOverrides: { accuracy: '0.025%' } }]
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(true);
  });

  it('LEGACY-ADAPTER-3: Bloco "electrical_table" é adaptado com preset dense_spec_matrix', () => {
    const block: ContentBlock = {
      id: 'blk_elec_1',
      type: 'electrical_table',
      tableColumns: [{ key: 'signal', label: 'Sinal de Saída', visible: true }],
      tableRows: [{ id: 'er1', localOverrides: { signal: '4-20 mA + HART' } }]
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.presentation.presetId).toBe('dense_spec_matrix');
    }
  });

  it('LEGACY-ADAPTER-4: Bloco "accessories_table" é adaptado com preset parameter_value', () => {
    const block: ContentBlock = {
      id: 'blk_acc_1',
      type: 'accessories_table',
      tableColumns: [{ key: 'item', label: 'Acessório', visible: true }],
      tableRows: [{ id: 'ar1', localOverrides: { item: 'Manifold 2 Vias' } }]
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.presentation.presetId).toBe('parameter_value');
    }
  });

  it('LEGACY-ADAPTER-5: Mesma entrada executada duas vezes gera identidades 100% idênticas', () => {
    const block: ContentBlock = {
      id: 'blk_stable_id_test',
      type: 'table',
      tableColumns: [
        { key: 'col_a', label: 'Coluna A', visible: true },
        { key: 'col_b', label: 'Coluna B', visible: true }
      ],
      tableRows: [
        { id: 'row_1', localOverrides: { col_a: 'Valor A' } },
        { id: 'row_2', localOverrides: { col_b: 'Valor B' } }
      ]
    };

    const res1 = adaptLegacyBlockToTableCore(block);
    const res2 = adaptLegacyBlockToTableCore(block);

    expect(res1.supported).toBe(true);
    expect(res2.supported).toBe(true);

    if (res1.supported && res2.supported) {
      expect(res1.table.id).toBe(res2.table.id);
      expect(res1.table.columns.map((c) => c.id)).toEqual(res2.table.columns.map((c) => c.id));
      expect(res1.table.rows.map((r) => r.id)).toEqual(res2.table.rows.map((r) => r.id));
      expect(Object.keys(res1.table.cells)).toEqual(Object.keys(res2.table.cells));
    }
  });

  it('LEGACY-ADAPTER-6: Renomear label da coluna preserva o mesmo ID estável da coluna', () => {
    const blockPt: ContentBlock = {
      id: 'blk_col_rename_test',
      type: 'table',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão', visible: true }],
      tableRows: [{ id: 'r1' }]
    };

    const blockEn: ContentBlock = {
      id: 'blk_col_rename_test',
      type: 'table',
      tableColumns: [{ key: 'accuracy', label: 'Accuracy', visible: true }], // mesmo key, label diferente!
      tableRows: [{ id: 'r1' }]
    };

    const resPt = adaptLegacyBlockToTableCore(blockPt);
    const resEn = adaptLegacyBlockToTableCore(blockEn);

    expect(resPt.supported).toBe(true);
    expect(resEn.supported).toBe(true);

    if (resPt.supported && resEn.supported) {
      expect(resPt.table.columns[0].id).toBe(resEn.table.columns[0].id);
      expect(resPt.table.columns[0].semanticKey).toBe('accuracy');
    }
  });

  it('LEGACY-ADAPTER-7: Bloco custom_table com customData.headers é rejeitado com motivo explícito', () => {
    const block: ContentBlock = {
      id: 'blk_custom',
      type: 'custom_table',
      customData: {
        headers: ['H1', 'H2'],
        rows: [['D1', 'D2']]
      }
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('custom_data_headers_unsupported');
    }
  });

  it('LEGACY-ADAPTER-8: Bloco matrix_spec_table é rejeitado com adiamento explícito para T3', () => {
    const block: ContentBlock = {
      id: 'blk_matrix',
      type: 'matrix_spec_table'
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('matrix_spec_table_deferred_to_t3');
    }
  });

  it('LEGACY-ADAPTER-9: Bloco ordering_codes é rejeitado por pertencer a domínio especializado', () => {
    const block: ContentBlock = {
      id: 'blk_ord',
      type: 'ordering_codes'
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('ordering_codes_specialized_domain');
    }
  });

  it('LEGACY-ADAPTER-10: Bloco inserts_visual é rejeitado por ser híbrido gráfico', () => {
    const block: ContentBlock = {
      id: 'blk_ins',
      type: 'inserts_visual'
    };

    const res = adaptLegacyBlockToTableCore(block);
    expect(res.supported).toBe(false);
    if (!res.supported) {
      expect(res.reason).toBe('inserts_visual_hybrid_block');
    }
  });
});
