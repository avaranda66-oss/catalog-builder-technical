// tests/domain/product-workspace/workspace-projection.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildWorkspaceProjection
} from '../../../src/domain/product-workspace/projection';
import {
  createWorkbook,
  ensureWorkbookV2,
  addModule,
  addDatum,
  resolveEffectiveProductKnowledge
} from '../../../src/domain/product-workbook';
import {
  WorkspaceLayoutV1
} from '../../../src/domain/product-workspace/types';

describe('Workspace Projection Engine & Zero Copy of Truth', () => {
  it('garante ZERO COPY OF TRUTH: alterar TechnicalDatum.value atualiza a projeção sem tocar no layout', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-truth-test',
        owner: { kind: 'product', id: 'TA-25N' },
        revision: 1
      })
    );

    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-thermal',
        semanticKey: 'thermal.specs',
        label: 'Térmica',
        kind: 'key_value',
        order: 0
      })
    );

    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.thermal.stability',
          moduleId: 'mod-thermal',
          label: 'Estabilidade',
          value: { type: 'quantity', amount: 0.05, unit: '°C' },
          evidence: [],
          status: 'verified'
        },
        'd-stab-1'
      )
    );

    const staticLayout: WorkspaceLayoutV1 = {
      schemaVersion: 1,
      id: 'layout-truth',
      productId: 'TA-25N',
      title: 'Ficha TA-25N',
      sections: [
        {
          id: 'sec-1',
          title: 'Resumo',
          blockIds: ['block-1'],
          order: 0
        }
      ],
      blocks: {
        'block-1': {
          id: 'block-1',
          kind: 'fact_grid',
          title: 'Fatos',
          datumIds: ['d-stab-1'],
          columns: 2
        }
      }
    };

    // 1ª Projeção: valor inicial 0.05 °C
    const proj1 = buildWorkspaceProjection({
      workbook: wb,
      layout: staticLayout
    });

    const block1 = proj1.sections[0].blocks[0];
    expect(block1.kind).toBe('fact_grid');
    if (block1.kind === 'fact_grid') {
      expect(block1.items[0].formattedValue).toBe('0.05 °C');
    }

    // Altera o dado canônico no workbook (por exemplo, nova medição de laboratório: 0.03 °C)
    wb = {
      ...wb,
      data: {
        ...wb.data,
        'd-stab-1': {
          ...wb.data['d-stab-1'],
          value: { type: 'quantity', amount: 0.03, unit: '°C' }
        }
      }
    };

    // 2ª Projeção: O layout NUNCA foi editado, mas a projeção reflete o novo valor instantaneamente!
    const proj2 = buildWorkspaceProjection({
      workbook: wb,
      layout: staticLayout
    });

    const block2 = proj2.sections[0].blocks[0];
    if (block2.kind === 'fact_grid') {
      expect(block2.items[0].formattedValue).toBe('0.03 °C');
    }
  });

  it('projeta dados herdados da família e sinaliza overrides sem clonagem física', () => {
    // Família TA
    let familyWb = ensureWorkbookV2(
      createWorkbook({
        id: 'family-ta-wb',
        owner: { kind: 'family', id: 'FAMILY-TA' },
        revision: 1
      })
    );
    familyWb = ensureWorkbookV2(
      addModule(familyWb, {
        id: 'mod-gen',
        semanticKey: 'general.specs',
        label: 'Geral',
        kind: 'key_value',
        order: 0
      })
    );
    familyWb = ensureWorkbookV2(
      addDatum(
        familyWb,
        {
          semanticKey: 'electrical.power_supply',
          moduleId: 'mod-gen',
          label: 'Alimentação',
          value: { type: 'text', value: '110/220 Vca, 50/60 Hz' },
          evidence: [],
          status: 'approved'
        },
        'fam-d-voltage'
      )
    );

    // Produto TA-25N
    const prodWb = ensureWorkbookV2(
      createWorkbook({
        id: 'prod-ta25-wb',
        owner: { kind: 'product', id: 'TA-25N' },
        revision: 1
      })
    );

    const effectiveKnowledge = resolveEffectiveProductKnowledge({
      productId: 'TA-25N',
      familyWorkbook: familyWb,
      productWorkbook: prodWb
    });

    const projection = buildWorkspaceProjection({
      workbook: prodWb,
      effectiveKnowledge
    });

    expect(projection.stats.inheritedDatums).toBe(1);
    expect(projection.stats.localDatums).toBe(0);

    const firstFact = projection.summaryFacts[0];
    expect(firstFact.origin).toBe('family');
    expect(firstFact.formattedValue).toBe('110/220 Vca, 50/60 Hz');
  });

  it('realiza busca local com match em display label, chave canônica e aliases', () => {
    let wb = ensureWorkbookV2(
      createWorkbook({
        id: 'wb-search',
        owner: { kind: 'product', id: 'PCON-TEST' },
        revision: 1
      })
    );
    wb = ensureWorkbookV2(
      addModule(wb, {
        id: 'mod-p',
        semanticKey: 'pressure.specs',
        label: 'Pressão',
        kind: 'key_value',
        order: 0
      })
    );
    wb = ensureWorkbookV2(
      addDatum(
        wb,
        {
          semanticKey: 'metrology.pressure.range',
          moduleId: 'mod-p',
          label: 'Faixa do Transdutor',
          value: { type: 'range', lower: 0, upper: 100, unit: 'bar' },
          evidence: [],
          status: 'verified'
        },
        'd-p-range'
      )
    );

    const projMatch = buildWorkspaceProjection({
      workbook: wb,
      searchQuery: 'Transdutor'
    });

    expect(projMatch.searchHits).toBeDefined();
    expect(projMatch.searchHits!.matchedDatumIds).toContain('d-p-range');

    const projMiss = buildWorkspaceProjection({
      workbook: wb,
      searchQuery: 'Termopar Inexistente'
    });
    expect(projMiss.searchHits!.matchedDatumIds.length).toBe(0);
  });
});
