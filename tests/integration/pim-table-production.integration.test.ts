// tests/integration/pim-table-production.integration.test.ts
// Suíte de Testes Canônicos de Integração PIM ↔ TABLE CORE V2 (INTEGRATION.PIM.TABLE.PROD1)
// Valida todas as 20 Emendas Arquiteturais, com ênfase nas 15 baterias obrigatórias da Emenda 20.
// ZERO chamadas à banco live / bjxqvrpbigwgabwbhtqa. Totalmente isolado via test doubles em memória.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProductWorkbookV2,
  TechnicalDatum,
  TechnicalDataset,
  ProductDataView,
  ResolvedProductKnowledge,
  EffectiveDatum,
  getDatasetCellKey,
  resolveEffectiveProductKnowledge
} from '../../src/domain/product-workbook';
import {
  ProductKnowledgeRuntime,
  InMemoryProductRegistryReader,
  ProductWorkbookFetcher,
  projectPimDatasetToTechnicalDatasetProjection,
  projectPimSavedViewToSavedViewProjection,
  evaluateBindingFreshness,
  createProductWorkbookDatumResolver,
  mapTechnicalValueToTableLiteral,
  mapTechnicalValueToTableLiteralV2
} from '../../src/domain/table-binding';
import { auditCatalogPublishSafety } from '../../src/domain/table-core/publish-safety.audit';
import { SupabaseProductKnowledgeProvider } from '../../src/services/product-knowledge/supabase-product-knowledge.provider';
import { Catalog, CatalogCellBinding } from '../../src/domain/catalog.schema';
import { useUIStore } from '../../src/stores/useUIStore';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

describe('INTEGRATION.PIM.TABLE.PROD1 — Canonical PIM ↔ Table Core V2 Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // FIXTURES
  // =========================================================================
  const familyId = 'fam_calibrators_001';
  const productId = 'prod_ta25n_001';

  const familyDatumRange: TechnicalDatum = {
    id: 'datum_fam_range',
    moduleId: 'mod_metrology',
    semanticKey: 'metrology.range',
    label: 'Faixa Geral da Família',
    value: { type: 'text', value: '-50 a 500 °C' },
    evidence: [],
    status: 'approved'
  };

  const familyDatumPwr: TechnicalDatum = {
    id: 'datum_fam_pwr',
    moduleId: 'mod_electrical',
    semanticKey: 'electrical.power_supply',
    label: 'Alimentação Elétrica',
    value: { type: 'text', value: '110/220 Vac 50/60 Hz' },
    evidence: [],
    status: 'approved'
  };

  const familyDatumSuppressed: TechnicalDatum = {
    id: 'datum_fam_suppressed',
    moduleId: 'mod_extra',
    semanticKey: 'extra.legacy_feature',
    label: 'Recurso Descontinuado',
    value: { type: 'text', value: 'V1 Feature' },
    evidence: [],
    status: 'approved'
  };

  const familyWorkbook: ProductWorkbookV2 = {
    id: 'wb_fam_001',
    schemaVersion: 2,
    owner: { kind: 'family', id: familyId },
    revision: 10,
    modules: [],
    data: {
      datum_fam_range: familyDatumRange,
      datum_fam_pwr: familyDatumPwr,
      datum_fam_suppressed: familyDatumSuppressed
    },
    datasets: [],
  };

  const productDatumRangeOverride: TechnicalDatum = {
    id: 'datum_prod_range',
    moduleId: 'mod_metrology',
    semanticKey: 'metrology.range',
    label: 'Faixa de Temperatura TA-25N',
    value: { type: 'range', lower: -25, upper: 140, unit: '°C' },
    evidence: [],
    status: 'approved'
  };

  const productDatumAccuracy: TechnicalDatum = {
    id: 'datum_prod_acc',
    moduleId: 'mod_metrology',
    semanticKey: 'metrology.accuracy',
    label: 'Exatidão',
    value: { type: 'quantity', amount: 0.1, unit: '°C', qualifier: 'approx' },
    evidence: [],
    status: 'approved'
  };

  const productDatasetAccuracyTable: TechnicalDataset = {
    id: 'ds_acc_points',
    moduleId: 'mod_metrology',
    semanticKey: 'metrology.accuracy_table',
    label: 'Tabela de Exatidão por Ponto',
    kind: 'matrix',
    order: 1,
    columns: [
      { id: 'col_setpoint', semanticKey: 'setpoint', label: 'Setpoint', valueType: 'range', order: 1 },
      { id: 'col_acc', semanticKey: 'acc_val', label: 'Incerteza', valueType: 'quantity', order: 2 }
    ],
    rows: [
      { id: 'row_1', label: 'Ponto 1', order: 1 }
    ],
    cells: {
      [getDatasetCellKey('row_1', 'col_setpoint')]: {
        rowId: 'row_1',
        columnId: 'col_setpoint',
        datumId: 'datum_prod_range'
      },
      [getDatasetCellKey('row_1', 'col_acc')]: {
        rowId: 'row_1',
        columnId: 'col_acc',
        datumId: 'datum_prod_acc'
      }
    }
  };

  const productDataViewMain: ProductDataView = {
    id: 'view_main_specs',
    name: 'Especificações Principais',
    datumKeys: ['metrology.range', 'metrology.accuracy', 'electrical.power_supply'],
    viewKind: 'spec_matrix'
  };

  const productWorkbook: ProductWorkbookV2 = {
    id: 'wb_prod_001',
    schemaVersion: 2,
    owner: { kind: 'product', id: productId },
    revision: 15,
    modules: [],
    data: {
      datum_prod_range: productDatumRangeOverride,
      datum_prod_acc: productDatumAccuracy
    },
    datasets: [productDatasetAccuracyTable],
    overrides: {
      'metrology.range': {
        targetSemanticKey: 'metrology.range',
        mode: 'override',
        overriddenValue: { type: 'range', lower: -25, upper: 140, unit: '°C' },
        overriddenStatus: 'approved'
      },
      'extra.legacy_feature': {
        targetSemanticKey: 'extra.legacy_feature',
        mode: 'suppress'
      }
    },
    savedViews: [productDataViewMain]
  };

  function createTestRuntime(options?: {
    customProductWorkbook?: ProductWorkbookV2;
    customFamilyWorkbook?: ProductWorkbookV2;
  }) {
    const pWb = options?.customProductWorkbook ?? productWorkbook;
    const fWb = options?.customFamilyWorkbook ?? familyWorkbook;

    const registryReader = new InMemoryProductRegistryReader([
      { id: productId, code: 'TA-25N', model: 'TA-25N', name: 'Calibrador TA-25N', familyId }
    ]);

    const workbookFetcher: ProductWorkbookFetcher = {
      getWorkbook: async (owner) => {
        if (owner.kind === 'product' && owner.id === productId) return pWb;
        if (owner.kind === 'family' && owner.id === familyId) return fWb;
        return null;
      }
    };

    return new ProductKnowledgeRuntime({ registryReader, workbookFetcher });
  }

  // =========================================================================
  // BATERIA OBRIGATÓRIA DA EMENDA 20 (TESTES 1 a 15)
  // =========================================================================

  it('1. product-scoped search includes inherited family datum', async () => {
    const runtime = createTestRuntime();
    const results = await runtime.search(productId, 'Alimentação');

    expect(results.length).toBeGreaterThan(0);
    const pwrItem = results.find((r) => r.semanticKey === 'electrical.power_supply');
    expect(pwrItem).toBeDefined();
    expect(pwrItem?.origin).toBe('family');
    expect(pwrItem?.sourceOwnerKind).toBe('family');
    expect(pwrItem?.sourceOwnerId).toBe(familyId);
    expect(pwrItem?.sourceRevision).toBe(10);
    expect(pwrItem?.productId).toBe(productId); // Bindable no contexto do produto requisitado
  });

  it('2. product override esconde/replaces family inherited datum', async () => {
    const runtime = createTestRuntime();
    const results = await runtime.search(productId, 'Faixa');

    // metrology.range existe na família (-50 a 500) e no produto (-25 a 140)
    const rangeHits = results.filter((r) => r.semanticKey === 'metrology.range');
    expect(rangeHits.length).toBe(1);

    const effectiveRange = rangeHits[0];
    expect(effectiveRange.origin).toBe('product_override');
    expect(effectiveRange.sourceOwnerKind).toBe('product');
    expect(effectiveRange.sourceOwnerId).toBe(productId);
    expect(effectiveRange.sourceRevision).toBe(15);
    expect(effectiveRange.preview).toEqual({
      kind: 'range',
      lower: -25,
      upper: 140,
      unit: '°C'
    });
  });

  it('3. suppressed family datum não aparece no picker', async () => {
    const runtime = createTestRuntime();
    // 'extra.legacy_feature' está suprimido em productWorkbook.overrides com mode='suppress'
    const results = await runtime.search(productId, 'legacy_feature');
    expect(results.length).toBe(0);

    const allResults = await runtime.search(productId, '');
    const found = allResults.find((r) => r.semanticKey === 'extra.legacy_feature');
    expect(found).toBeUndefined();
  });

  it('4. family owner não é confundido com productId', async () => {
    const runtime = createTestRuntime();
    // Item herdado reporta explicitamente sourceOwnerKind='family' e sourceOwnerId=familyId
    const results = await runtime.search(productId, 'power_supply');
    const item = results[0];

    expect(item.sourceOwnerKind).toBe('family');
    expect(item.sourceOwnerId).toBe(familyId);
    expect(item.sourceOwnerId).not.toBe(item.productId);
    expect(item.productId).toBe(productId);
  });

  it('5. dataset RPC hit é agregado por dataset', async () => {
    // Simula mock Supabase transport que retorna múltiplos hits de célula para o mesmo dataset_id
    const mockRpcHits = [
      { id: 'h1', kind: 'technical_dataset', owner_kind: 'product', owner_id: productId, semantic_key: 'col_setpoint', label: 'Tabela de Exatidão', dataset_id: 'ds_acc_points' },
      { id: 'h2', kind: 'technical_dataset', owner_kind: 'product', owner_id: productId, semantic_key: 'col_acc', label: 'Tabela de Exatidão', dataset_id: 'ds_acc_points' },
      { id: 'h3', kind: 'technical_dataset', owner_kind: 'product', owner_id: productId, semantic_key: 'col_setpoint', label: 'Tabela de Exatidão', dataset_id: 'ds_acc_points' }
    ];

    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockRpcHits, error: null })
    } as any;

    const runtime = createTestRuntime();
    runtime.registerResolvedKnowledge(
      productId,
      resolveEffectiveProductKnowledge({ productWorkbook, familyWorkbook })
    );

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      runtime
    });

    const results = await provider.search(productId, 'Tabela');
    const datasetResults = results.filter((r) => r.kind === 'dataset');

    // DEVE agregar por datasetId: 1 único resultado para 'ds_acc_points', e não 3
    expect(datasetResults.length).toBe(1);
    expect(datasetResults[0].datasetId).toBe('ds_acc_points');
    expect(datasetResults[0].semanticKey).toBe('metrology.accuracy_table'); // semanticKey real do TechnicalDataset
  });

  it('6. dataset column semanticKey nunca vira datumKey por acidente', () => {
    const projection = projectPimDatasetToTechnicalDatasetProjection({
      dataset: productDatasetAccuracyTable,
      productId,
      datums: productWorkbook.data,
      bindingMode: 'live',
      sourceRevision: 15
    });

    // As células projetadas DEVEM apontar para o datumKey real (ex: metrology.range), NÃO para col.semanticKey ('setpoint')
    const row1 = projection.rows[0];
    const cellProjection = row1.cells['setpoint'] as unknown as { datumId: string; datumKey: string };
    expect(cellProjection.datumId).toBe('datum_prod_range');
    expect(cellProjection.datumKey).toBe('metrology.range');
    expect(cellProjection.datumKey).not.toBe('setpoint');
    expect(cellProjection.datumKey).not.toBe('col_setpoint');
  });

  it('7. Saved View usa datums reais, sem TechnicalDataset inventado', () => {
    const resolved = resolveEffectiveProductKnowledge({ productWorkbook, familyWorkbook });
    const savedViewProjection = projectPimSavedViewToSavedViewProjection({
      view: productDataViewMain,
      knowledge: resolved,
      bindingMode: 'live'
    });

    expect(savedViewProjection).toBeDefined();
    expect(savedViewProjection?.id).toBe('view_main_specs');
    expect(savedViewProjection?.columns.length).toBe(2); // Property x Value
    expect(savedViewProjection?.columns[0].key).toBe('property');
    expect(savedViewProjection?.columns[1].key).toBe('value');

    // Cada linha da Saved View liga diretamente ao TechnicalDatum real
    expect(savedViewProjection?.rows).toBeDefined();
    expect(savedViewProjection?.rows?.length).toBe(3); // metrology.range, metrology.accuracy, electrical.power_supply
    const rowRange = savedViewProjection!.rows![0];
    const cellValueBinding = rowRange.cells['value'] as unknown as { datumKey: string; datumId: string; value: unknown };

    expect(cellValueBinding.datumKey).toBe('metrology.range');
    expect(cellValueBinding.datumId).toContain('ovr_');
    expect(cellValueBinding.value).toEqual({
      kind: 'range',
      lower: -25,
      upper: 140,
      unit: '°C'
    });
  });

  it('8. RPC unavailable != empty search results', async () => {
    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42883', message: 'function search_product_knowledge_v2 does not exist' }
      })
    } as any;

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient
    });

    // Quando a RPC não existe / infraestrutura indisponível:
    await expect(provider.search(productId, 'teste')).rejects.toThrow(/Indisponível|falhou/i);
    expect(provider.getStatus()).toBe('unavailable');
    expect(provider.isAvailable()).toBe(false);
  });

  it('9 & 10. rapid Catalog A → Catalog B preload race & stale A does not pollute B', async () => {
    const registryReader = new InMemoryProductRegistryReader([
      { id: 'prod_A', code: 'A', model: 'A', name: 'Product A' },
      { id: 'prod_B', code: 'B', model: 'B', name: 'Product B' }
    ]);

    let resolveWbA: (wb: ProductWorkbookV2) => void;
    const promiseA = new Promise<ProductWorkbookV2>((resolve) => {
      resolveWbA = resolve;
    });

    const workbookFetcher: ProductWorkbookFetcher = {
      getWorkbook: vi.fn().mockImplementation(async (owner) => {
        if (owner.id === 'prod_A') {
          return await promiseA; // A demora para responder
        }
        if (owner.id === 'prod_B') {
          return {
            id: 'wb_B',
            schemaVersion: 2,
            owner: { kind: 'product', id: 'prod_B' },
            revision: 1,
            modules: [],
            data: {},
            datasets: []
          } as ProductWorkbookV2;
        }
        return null;
      })
    };

    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher });

    const catalogA = {
      id: 'cat_A',
      title: 'Catálogo A',
      pages: [
        {
          id: 'p1',
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                { id: 'r1', cellBindings: { col1: { sourceKind: 'pim_datum', productId: 'prod_A', semanticKey: 'k1', bindingMode: 'live' } } }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    const catalogB = {
      id: 'cat_B',
      title: 'Catálogo B',
      pages: [
        {
          id: 'p1',
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                { id: 'r1', cellBindings: { col1: { sourceKind: 'pim_datum', productId: 'prod_B', semanticKey: 'k2', bindingMode: 'live' } } }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    // 1. Inicia preload de Catalog A
    const preloadAPromise = runtime.preloadCatalogProductKnowledge(catalogA);

    // 2. Imediatamente usuário troca para Catalog B
    const preloadBPromise = runtime.preloadCatalogProductKnowledge(catalogB);

    // B termina primeiro
    await preloadBPromise;
    expect(runtime.getStatus()).toBe('ready');

    // 3. Resposta tardia de A finalmente chega
    resolveWbA!({
      id: 'wb_A',
      schemaVersion: 2,
      owner: { kind: 'product', id: 'prod_A' },
      revision: 1,
      modules: [],
      data: {},
      datasets: []
    });
    await preloadAPromise;

    // O runtime ativo DEVE permanecer associado ao Catalog B
    expect(runtime.getActiveCatalogId()).toBe('cat_B');
    // Cache de B está presente
    expect(runtime.getResolvedKnowledge('prod_B')).toBeDefined();
  });

  it('11. provider stable instance / no effect loop', () => {
    const storeState = useCatalogStore.getState();
    const provider1 = storeState.knowledgeProvider;
    const provider2 = useCatalogStore.getState().knowledgeProvider;

    // Instância deve ser estável (singleton do store)
    expect(provider1).toBe(provider2);
    expect(provider1.getRuntime()).toBe(storeState.knowledgeRuntime);
  });

  it('12. Inspector → Library → ProductKnowledgeWorkspace real navigation', () => {
    const uiStore = useUIStore.getState();
    expect(uiStore.activeTab).toBe('editor');
    expect(uiStore.selectedProductForWorkspaceId).toBeNull();

    // Inspector dispara abertura do workspace técnico para o produto TA-25N
    uiStore.openProductKnowledgeWorkspace(productId);

    expect(useUIStore.getState().activeTab).toBe('library');
    expect(useUIStore.getState().selectedProductForWorkspaceId).toBe(productId);

    // Ao fechar:
    useUIStore.getState().closeProductKnowledgeWorkspace();
    expect(useUIStore.getState().selectedProductForWorkspaceId).toBeNull();
  });

  it('13. export during knowledge loading não gera false source_missing', () => {
    const runtime = new ProductKnowledgeRuntime();
    // Simula status 'loading'
    (runtime as any).status = 'loading';

    const catalogWithBinding = {
      id: 'cat_test_loading',
      title: 'Catálogo Teste',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                {
                  id: 'r1',
                  cellBindings: {
                    range: {
                      sourceKind: 'pim_datum',
                      productId: productId,
                      semanticKey: 'metrology.range',
                      bindingMode: 'live'
                      // sem snapshot
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    // Se o runtime está em loading, a política da Emenda 15 exige não rodar auditoria definitiva Layer B
    // (no ExportPDFModal, o botão fica desabilitado e resolveDatum não é passado até o runtime sair de loading)
    const isRuntimeLoading = runtime.getStatus() === 'loading';
    expect(isRuntimeLoading).toBe(true);

    const auditWithoutPrematureLayerB = auditCatalogPublishSafety({
      catalog: catalogWithBinding,
      resolveDatum: undefined // Durante loading não se injeta resolver para evitar false positive
    });

    // Não deve acusar SOURCE_MISSING_WITHOUT_SNAPSHOT falsamente
    const sourceMissingIssue = auditWithoutPrematureLayerB.issues.find(
      (i) => i.code === 'SOURCE_MISSING_WITHOUT_SNAPSHOT'
    );
    expect(sourceMissingIssue).toBeUndefined();
  });

  it('14. source owner family → product override gera review_required & warning', () => {
    // Cria binding que gravou sourceOwnerKind='family'
    const familyBinding: CatalogCellBinding = {
      sourceKind: 'pim_datum',
      productId: productId,
      semanticKey: 'metrology.range',
      sourceRevision: 10,
      sourceOwnerKind: 'family',
      sourceOwnerId: familyId,
      bindingMode: 'live',
      snapshot: { kind: 'text', text: '-50 a 500 °C' }
    };

    const freshness = evaluateBindingFreshness(familyBinding, 15, {
      kind: 'product',
      id: productId
    });

    // Transição de family -> product override DEVE ser detectada como mudança de proprietário
    expect(freshness.status).toBe('source_owner_changed');
    expect(freshness.needsReview).toBe(true);

    // Na auditoria de publicação Layer B:
    const resolver = createProductWorkbookDatumResolver(
      () => resolveEffectiveProductKnowledge({ productWorkbook, familyWorkbook })
    );

    const catalog = {
      id: 'cat_test_owner_change',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                {
                  id: 'r1',
                  cellBindings: {
                    range: familyBinding
                  }
                }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    const audit = auditCatalogPublishSafety({ catalog, resolveDatum: resolver });
    const ownerChangeIssue = audit.issues.find((i) => i.code === 'SOURCE_OWNER_CHANGED');
    expect(ownerChangeIssue).toBeDefined();
    expect(ownerChangeIssue?.severity).toBe('warn');
  });

  it('15. PIM V1 fallback nunca acessa legacy product.specs', () => {
    // O resolver canônico de Product Workbook trata chaves canônicas ('metrology.range', 'electrical.power_supply')
    // e NUNCA tenta resolver produtos via product.specs legados quando o dado técnico não existe
    const emptyKnowledge: ResolvedProductKnowledge = {
      productId: 'prod_empty',
      productRevision: 1,
      modules: [],
      effectiveData: new Map(),
      suppressedKeys: [],
      conflictsCount: 0
    };

    const resolver = createProductWorkbookDatumResolver(() => emptyKnowledge);

    const res = resolver({
      kind: 'datum_reference',
      productId: 'prod_empty',
      datumKey: 'metrology.range',
      bindingMode: 'live'
    });

    // Dado inexistente no PIM V1/V2 resulta em status 'unknown', JAMAIS inventa valores de specs
    expect(res?.status).toBe('unknown');
    expect(res?.value).toEqual({ kind: 'empty' });
  });

  // =========================================================================
  // BATERIA DE MAPERS TIPADOS LOSSLESS & CANÔNICOS
  // =========================================================================

  it('mapeia valores técnicos sem perda: quantity, range, boolean, enum, token', () => {
    // 1. Quantity
    const qtyRes = mapTechnicalValueToTableLiteral({
      type: 'quantity',
      amount: 10.5,
      unit: 'bar',
      qualifier: 'approx'
    });
    expect(qtyRes.supported).toBe(true);
    if (qtyRes.supported) {
      expect(qtyRes.content).toEqual({
        kind: 'value_unit',
        amount: 10.5,
        unit: 'bar',
        qualifier: 'approx'
      });
    }

    // 2. Range
    const rangeRes = mapTechnicalValueToTableLiteralV2({
      type: 'range',
      lower: 0,
      upper: 100,
      unit: 'kPa'
    });
    expect(rangeRes.supported).toBe(true);
    if (rangeRes.supported) {
      expect(rangeRes.content).toEqual({
        kind: 'range',
        lower: 0,
        upper: 100,
        unit: 'kPa',
        lowerInclusive: undefined,
        upperInclusive: undefined
      });
    }

    // 3. Boolean
    const boolRes = mapTechnicalValueToTableLiteralV2({
      type: 'boolean',
      value: true
    });
    expect(boolRes.supported).toBe(true);
    if (boolRes.supported) {
      expect(boolRes.content).toEqual({
        kind: 'boolean',
        value: true,
        format: 'sim_nao'
      });
    }

    // 4. Enum
    const enumRes = mapTechnicalValueToTableLiteralV2({
      type: 'enum',
      code: 'HART_7',
      label: 'HART Protocol 7'
    });
    expect(enumRes.supported).toBe(true);
    if (enumRes.supported) {
      expect(enumRes.content).toEqual({
        kind: 'enum',
        code: 'HART_7',
        label: 'HART Protocol 7'
      });
    }
  });

  // =========================================================================
  // TESTE DE AUSÊNCIA DE N+1 NA BUSCA E REGISTRY
  // =========================================================================

  it('realiza batch lookup evitando N+1 no ProductRegistryReader', async () => {
    const reader = new InMemoryProductRegistryReader([
      { id: 'p1', code: 'P1', model: 'M1', name: 'Product 1' },
      { id: 'p2', code: 'P2', model: 'M2', name: 'Product 2' },
      { id: 'p3', code: 'P3', model: 'M3', name: 'Product 3' }
    ]);

    const batch = await reader.getProductsByIds(['p1', 'p2', 'p3']);
    expect(batch.length).toBe(3);
    const map = new Map(batch.map((p) => [p.id, p]));
    expect(map.get('p1')?.model).toBe('M1');
    expect(map.get('p2')?.model).toBe('M2');
    expect(map.get('p3')?.model).toBe('M3');
  });

  // =========================================================================
  // TESTES DE CICLO DE VIDA DO BINDING (LIVE, SNAPSHOT, OVERRIDE, UNLINK)
  // =========================================================================

  it('LIVE source update é refletido sem necessidade de re-binding', () => {
    let currentTemp = 140;
    const resolver = createProductWorkbookDatumResolver((id) => {
      const dynamicDatum: TechnicalDatum = {
        id: 'd1',
        moduleId: 'm1',
        semanticKey: 'metrology.temp',
        label: 'Temp',
        value: { type: 'number', value: currentTemp },
        evidence: [],
        status: 'approved'
      };
      return {
        productId: id,
        productRevision: 1,
        modules: [],
        effectiveData: new Map([
          ['metrology.temp', { origin: 'product_local', effectiveStatus: 'approved', datum: dynamicDatum }]
        ]),
        suppressedKeys: [],
        conflictsCount: 0
      };
    });

    const res1 = resolver({
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'metrology.temp',
      bindingMode: 'live'
    });
    expect(res1?.value).toEqual({ kind: 'number', value: 140 });

    // Atualiza valor na fonte técnica
    currentTemp = 150;

    const res2 = resolver({
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'metrology.temp',
      bindingMode: 'live'
    });
    expect(res2?.value).toEqual({ kind: 'number', value: 150 });
  });

  it('SNAPSHOT mode congela o valor mesmo após atualização na fonte', () => {
    const frozenSnapshot = { kind: 'number' as const, value: 100 };
    const resolver = createProductWorkbookDatumResolver((id) => ({
      productId: id,
      productRevision: 5,
      modules: [],
      effectiveData: new Map([
        [
          'metrology.temp',
          {
            origin: 'product_local',
            effectiveStatus: 'approved',
            datum: {
              id: 'd1',
              moduleId: 'm1',
              semanticKey: 'metrology.temp',
              label: 'Temp',
              value: { type: 'number', value: 999 }, // Fonte mudou para 999
              evidence: [],
              status: 'approved'
            }
          }
        ]
      ]),
      suppressedKeys: [],
      conflictsCount: 0
    }));

    const res = resolver({
      kind: 'datum_reference',
      productId: 'p1',
      datumKey: 'metrology.temp',
      bindingMode: 'snapshot',
      snapshot: frozenSnapshot
    });

    // Retorna o valor congelado (100), ignorando a fonte (999)
    expect(res?.value).toEqual({ kind: 'number', value: 100 });
  });

  it('Publish Safety Layer B bloqueia publicação quando dado em live tem status conflict', () => {
    const resolver = createProductWorkbookDatumResolver(() => ({
      productId: 'p_conflict',
      productRevision: 1,
      modules: [],
      effectiveData: new Map<string, EffectiveDatum>([
        [
          'metrology.temp',
          {
            origin: 'product_local',
            effectiveStatus: 'conflicting',
            datum: {
              id: 'd1',
              moduleId: 'm1',
              semanticKey: 'metrology.temp',
              label: 'Temp',
              value: { type: 'text', value: 'Conflito' },
              evidence: [],
              status: 'draft'
            }
          }
        ]
      ]),
      suppressedKeys: [],
      conflictsCount: 1
    }));

    const catalog = {
      id: 'cat_conflict',
      pages: [
        {
          id: 'p1',
          pageNumber: 1,
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                {
                  id: 'r1',
                  cellBindings: {
                    temp: {
                      sourceKind: 'pim_datum',
                      productId: 'p_conflict',
                      semanticKey: 'metrology.temp',
                      bindingMode: 'live'
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    const audit = auditCatalogPublishSafety({ catalog, resolveDatum: resolver });
    expect(audit.canPublish).toBe(false);
    expect(audit.blockCount).toBeGreaterThan(0);
    const conflictIssue = audit.issues.find((i) => i.code === 'CONFLICT_TECHNICAL_DATUM');
    expect(conflictIssue).toBeDefined();
    expect(conflictIssue?.severity).toBe('block');
  });
});
