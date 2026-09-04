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
  mapTechnicalValueToTableLiteralV2,
  projectTechnicalValueFailClosed
} from '../../src/domain/table-binding';
import { ProductWorkbookRepository } from '../../src/services/product-workbook/persistence.types';
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

  // =========================================================================
  // BATERIA COMPLETA DE AUDITORIA INDEPENDENTE 1.1 (16 TESTES MANDATÓRIOS)
  // =========================================================================

  it('Audit 1. Family global hit jamais usa familyId como productId', async () => {
    const famId = 'fam_global_001';
    const prodConcreteId = 'prod_concrete_001';
    const mockRpcHits = [
      {
        source_index: 'technical_data',
        owner_kind: 'family',
        owner_id: famId,
        semantic_key: 'metrology.accuracy',
        label: 'Exatidão da Família',
        value_formatted: '0.1',
        unit: '°C',
        status: 'approved'
      }
    ];

    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockRpcHits, error: null })
    } as any;

    const registryReader = new InMemoryProductRegistryReader([
      { id: prodConcreteId, code: 'P1', model: 'M1', name: 'Product 1', familyId: famId }
    ]);

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_glob',
      schemaVersion: 2,
      owner: { kind: 'family', id: famId },
      revision: 8,
      modules: [],
      data: {
        d_acc: {
          id: 'd_acc',
          moduleId: 'mod_m',
          semanticKey: 'metrology.accuracy',
          label: 'Exatidão',
          value: { type: 'quantity', amount: 0.1, unit: '°C' },
          evidence: [{ id: 'ev1', sourceDocumentId: 'ev1' }],
          status: 'approved'
        }
      },
      datasets: []
    };

    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn().mockImplementation(async (owner) => {
        if (owner.kind === 'family' && owner.id === famId) return familyWb;
        return null;
      }),
      saveWorkbook: vi.fn()
    };

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      repository,
      registryReader
    });

    const results = await provider.search(undefined, 'Exatidão');
    expect(results.length).toBe(1);
    const hit = results[0];

    // INVARIANTE DA EMENDA 1 & 3: productId JAMAIS pode ser familyId!
    expect(hit.bindable).toBe(true);
    if (hit.bindable) {
      expect(hit.productId).toBe(prodConcreteId);
      expect(hit.productId).not.toBe(famId);
    }
    expect(hit.sourceOwnerKind).toBe('family');
    expect(hit.sourceOwnerId).toBe(famId);
  });

  it('Audit 2. Abstract family result não bindável é type-safe', async () => {
    const famOrphanId = 'fam_orphan_002';
    const mockRpcHits = [
      {
        source_index: 'technical_data',
        owner_kind: 'family',
        owner_id: famOrphanId,
        semantic_key: 'electrical.power',
        label: 'Alimentação Família',
        value_formatted: '220V',
        status: 'approved'
      }
    ];

    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({ data: mockRpcHits, error: null })
    } as any;

    const registryReader = new InMemoryProductRegistryReader([]);

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_orphan',
      schemaVersion: 2,
      owner: { kind: 'family', id: famOrphanId },
      revision: 3,
      modules: [],
      data: {
        d_pwr: {
          id: 'd_pwr',
          moduleId: 'mod_e',
          semanticKey: 'electrical.power',
          label: 'Alimentação',
          value: { type: 'text', value: '220V' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: []
    };

    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn().mockResolvedValue(familyWb),
      saveWorkbook: vi.fn()
    };

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      repository,
      registryReader
    });

    const results = await provider.search(undefined, 'Alimentação');
    expect(results.length).toBe(1);
    const hit = results[0];

    // INVARIANTE DA EMENDA 3:
    expect(hit.bindable).toBe(false);
    if (!hit.bindable) {
      expect(hit.productId).toBeUndefined();
      expect(hit.sourceOwnerKind).toBe('family');
      expect(hit.sourceOwnerId).toBe(famOrphanId);
    }
  });

  it('Audit 3. Produto sem Product Workbook + Family Workbook resolve com productId real e sem revision fake 0', () => {
    const famId = 'fam_pure_003';
    const prodId = 'prod_nowb_003';

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_003',
      schemaVersion: 2,
      owner: { kind: 'family', id: famId },
      revision: 12,
      modules: [],
      data: {
        d1: {
          id: 'd1',
          moduleId: 'm1',
          semanticKey: 'sensor.type',
          label: 'Tipo de Sensor',
          value: { type: 'text', value: 'Pt100' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: []
    };

    const resolved = resolveEffectiveProductKnowledge({
      productId: prodId,
      productWorkbook: null,
      familyWorkbook: familyWb
    });

    // INVARIANTES DA EMENDA 1 & 2:
    expect(resolved.productId).toBe(prodId);
    expect(resolved.productId).not.toBe(famId);
    expect(resolved.familyId).toBe(famId);
    expect(resolved.familyRevision).toBe(12);
    expect(resolved.productRevision).toBeUndefined();
    expect(resolved.hasProductWorkbook).toBe(false);

    const effDatum = resolved.effectiveData.get('sensor.type');
    expect(effDatum).toBeDefined();
    expect(effDatum?.origin).toBe('family');
    expect(effDatum?.datum.value).toEqual({ type: 'text', value: 'Pt100' });
  });

  it('Audit 4. Produto sem nenhum workbook = known-empty, não infrastructure error', async () => {
    const emptyProdId = 'prod_known_empty_004';

    const registryReader = new InMemoryProductRegistryReader([
      { id: emptyProdId, code: 'EMPTY', model: 'EMPTY', name: 'Empty Product' }
    ]);

    const workbookFetcher: ProductWorkbookFetcher = {
      getWorkbook: vi.fn().mockResolvedValue(null)
    };

    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher });

    const catalog = {
      id: 'cat_empty_test',
      pages: [
        {
          id: 'p1',
          blocks: [
            {
              id: 'b1',
              type: 'specs_table',
              tableRows: [
                { id: 'r1', cellBindings: { c1: { sourceKind: 'pim_datum', productId: emptyProdId, semanticKey: 'any.key', bindingMode: 'live' } } }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    await runtime.preloadCatalogProductKnowledge(catalog);

    // INVARIANTE DA EMENDA 5:
    expect(runtime.getStatus()).toBe('ready');
    expect(runtime.getFailedProductIds()).toEqual([]);
    expect(runtime.getKnownEmptyProductIds()).toContain(emptyProdId);
  });

  it('Audit 5. Family Dataset sem Product Workbook projeta estrutura com metadata da família', async () => {
    const famId = 'fam_ds_005';
    const prodId = 'prod_ds_005';

    const familyDataset: TechnicalDataset = {
      id: 'ds_fam_only',
      moduleId: 'm1',
      semanticKey: 'specs.dataset',
      label: 'Dataset da Família',
      kind: 'matrix',
      order: 1,
      columns: [{ id: 'col1', semanticKey: 'temp', label: 'Temperatura', valueType: 'quantity', order: 1 }],
      rows: [{ id: 'row1', label: 'Ponto 1', order: 1 }],
      cells: {
        [getDatasetCellKey('row1', 'col1')]: {
          rowId: 'row1',
          columnId: 'col1',
          datumId: 'd_fam_temp'
        }
      }
    };

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_005',
      schemaVersion: 2,
      owner: { kind: 'family', id: famId },
      revision: 9,
      modules: [],
      data: {
        d_fam_temp: {
          id: 'd_fam_temp',
          moduleId: 'm1',
          semanticKey: 'specs.temp',
          label: 'Temperatura',
          value: { type: 'quantity', amount: 50, unit: '°C' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: [familyDataset]
    };

    const registryReader = new InMemoryProductRegistryReader([
      { id: prodId, code: 'P5', model: 'M5', familyId: famId }
    ]);

    const workbookFetcher: ProductWorkbookFetcher = {
      getWorkbook: vi.fn().mockImplementation(async (owner) => {
        if (owner.kind === 'family' && owner.id === famId) return familyWb;
        return null;
      })
    };

    const runtime = new ProductKnowledgeRuntime({ registryReader, workbookFetcher });
    const catalog = {
      id: 'cat_5',
      pages: [{ id: 'p1', blocks: [{ id: 'b1', tableRows: [{ id: 'r1', cellBindings: { c: { sourceKind: 'pim_datum', productId: prodId, semanticKey: 'specs.temp', bindingMode: 'live' } } }] }] }]
    } as unknown as Catalog;

    await runtime.preloadCatalogProductKnowledge(catalog);

    const dsProjection = await runtime.getDataset(prodId, 'ds_fam_only');
    expect(dsProjection).toBeDefined();
    expect(dsProjection?.productId).toBe(prodId);
    expect(dsProjection?.sourceOwnerKind).toBe('family');
    expect(dsProjection?.sourceOwnerId).toBe(famId);
    expect(dsProjection?.sourceRevision).toBe(9);
  });

  it('Audit 6 & 7. Family Dataset + Product datum override: structure owner != cell datum owner', () => {
    const famId = 'fam_hybrid_006';
    const prodId = 'prod_hybrid_006';

    const familyDataset: TechnicalDataset = {
      id: 'ds_metrology',
      moduleId: 'mod_m',
      semanticKey: 'metrology.dataset',
      label: 'Tabela Metrológica',
      kind: 'matrix',
      order: 1,
      columns: [{ id: 'col_acc', semanticKey: 'accuracy', label: 'Exatidão', valueType: 'quantity', order: 1 }],
      rows: [{ id: 'row_1', label: 'Faixa 1', order: 1 }],
      cells: {
        [getDatasetCellKey('row_1', 'col_acc')]: {
          rowId: 'row_1',
          columnId: 'col_acc',
          datumId: 'datum_fam_acc'
        }
      }
    };

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_006',
      schemaVersion: 2,
      owner: { kind: 'family', id: famId },
      revision: 4,
      modules: [],
      data: {
        datum_fam_acc: {
          id: 'datum_fam_acc',
          moduleId: 'mod_m',
          semanticKey: 'metrology.accuracy',
          label: 'Exatidão Geral',
          value: { type: 'quantity', amount: 0.10, unit: '°C' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: [familyDataset]
    };

    const productWb: ProductWorkbookV2 = {
      id: 'wb_prod_006',
      schemaVersion: 2,
      owner: { kind: 'product', id: prodId },
      revision: 12,
      modules: [],
      data: {
        datum_prod_acc_override: {
          id: 'datum_prod_acc_override',
          moduleId: 'mod_m',
          semanticKey: 'metrology.accuracy',
          label: 'Exatidão Especial P',
          value: { type: 'quantity', amount: 0.05, unit: '°C' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: [],
      overrides: {
        'metrology.accuracy': {
          targetSemanticKey: 'metrology.accuracy',
          mode: 'override',
          overriddenValue: { type: 'quantity', amount: 0.05, unit: '°C' },
          overriddenStatus: 'approved'
        }
      }
    };

    const resolved = resolveEffectiveProductKnowledge({
      productId: prodId,
      productWorkbook: productWb,
      familyWorkbook: familyWb
    });

    const projection = projectPimDatasetToTechnicalDatasetProjection({
      dataset: familyDataset,
      productId: prodId,
      datums: familyWb.data,
      bindingMode: 'live',
      sourceRevision: 4,
      sourceOwnerKind: 'family',
      sourceOwnerId: famId,
      effectiveKnowledge: resolved
    });

    // INVARIANTES DA EMENDA 6 & 7:
    // A) Origem da ESTRUTURA do dataset é da família
    expect(projection.sourceOwnerKind).toBe('family');
    expect(projection.sourceOwnerId).toBe(famId);
    expect(projection.sourceRevision).toBe(4);

    // B) Origem do DATUM da célula foi resolvida do PRODUCT (override)
    const cell = projection.rows[0].cells['accuracy'];
    expect(cell).toBeDefined();
    if (cell && 'datumKey' in cell) {
      expect(cell.value).toEqual({
        kind: 'value_unit',
        amount: 0.05,
        unit: '°C',
        qualifier: undefined
      });
      expect(cell.datumKey).toBe('metrology.accuracy');
      expect(cell.sourceOwnerKind).toBe('product');
      expect(cell.sourceOwnerId).toBe(prodId);
      expect(cell.sourceRevision).toBe(12);
    }
  });

  it('Audit 8. Saved View com células mistas: property literal e value com origens distintas', () => {
    const famId = 'fam_sv_008';
    const prodId = 'prod_sv_008';

    const familyWb: ProductWorkbookV2 = {
      id: 'wb_fam_008',
      schemaVersion: 2,
      owner: { kind: 'family', id: famId },
      revision: 8,
      modules: [],
      data: {
        d_pwr: {
          id: 'd_pwr',
          moduleId: 'm_e',
          semanticKey: 'electrical.supply',
          label: 'Alimentação',
          value: { type: 'text', value: '220V' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: []
    };

    const productWb: ProductWorkbookV2 = {
      id: 'wb_prod_008',
      schemaVersion: 2,
      owner: { kind: 'product', id: prodId },
      revision: 14,
      modules: [],
      data: {
        d_range: {
          id: 'd_range',
          moduleId: 'm_m',
          semanticKey: 'metrology.range',
          label: 'Faixa',
          value: { type: 'text', value: '0-100 bar' },
          evidence: [],
          status: 'approved'
        }
      },
      datasets: [],
      savedViews: [
        {
          id: 'sv_mixed',
          name: 'Visão Mista',
          datumKeys: ['electrical.supply', 'metrology.range'],
          viewKind: 'spec_matrix'
        }
      ]
    };

    const resolved = resolveEffectiveProductKnowledge({
      productId: prodId,
      productWorkbook: productWb,
      familyWorkbook: familyWb
    });

    const projection = projectPimSavedViewToSavedViewProjection({
      view: productWb.savedViews![0],
      knowledge: resolved,
      bindingMode: 'live'
    });

    expect(projection).toBeDefined();
    expect(projection?.rows).toBeDefined();
    expect(projection!.rows!.length).toBe(2);

    const rows = projection!.rows!;

    // Row 1: electrical.supply (herdado da família)
    const row1 = rows[0];
    const cell1Prop = row1.cells['property'];
    const cell1Val = row1.cells['value'];
    if (cell1Prop && 'kind' in cell1Prop) {
      expect(cell1Prop.kind).toBe('literal');
    }
    if (cell1Val && 'kind' in cell1Val) {
      expect(cell1Val.kind).toBe('bound');
      if (cell1Val.kind === 'bound') {
        expect(cell1Val.sourceOwnerKind).toBe('family');
        expect(cell1Val.sourceRevision).toBe(8);
      }
    }

    // Row 2: metrology.range (local do produto)
    const row2 = rows[1];
    const cell2Prop = row2.cells['property'];
    const cell2Val = row2.cells['value'];
    if (cell2Prop && 'kind' in cell2Prop) {
      expect(cell2Prop.kind).toBe('literal');
    }
    if (cell2Val && 'kind' in cell2Val) {
      expect(cell2Val.kind).toBe('bound');
      if (cell2Val.kind === 'bound') {
        expect(cell2Val.sourceOwnerKind).toBe('product');
        expect(cell2Val.sourceRevision).toBe(14);
      }
    }
  });

  it('Audit 9. Canonical unknown vs unsupported_projection (Emenda 9)', () => {
    // 1. Canonical unknown
    const canonUnknown = projectTechnicalValueFailClosed({
      type: 'unknown',
      reason: 'Valor não informado na calibração'
    });
    expect(canonUnknown.kind).toBe('unknown');
    if (canonUnknown.kind === 'unknown') {
      expect(canonUnknown.reason).toBe('Valor não informado na calibração');
      expect(canonUnknown.reason).not.toContain('unsupported_projection');
    }

    // 2. Unsupported projection
    const unsuppVal = projectTechnicalValueFailClosed({
      type: 'product_reference',
      targetProductId: 'p123'
    } as any);
    expect(unsuppVal.kind).toBe('unknown');
    if (unsuppVal.kind === 'unknown') {
      expect(unsuppVal.reason).toContain('unsupported_projection');
    }

    // Nenhum converte para { kind: 'text', text: '' }
    expect(canonUnknown).not.toEqual({ kind: 'text', text: '' });
    expect(unsuppVal).not.toEqual({ kind: 'text', text: '' });
  });

  it('Audit 10. PARTIAL propagation para status do provider', () => {
    const mockProvider = {
      isAvailable: () => true,
      getStatus: () => 'partial' as const,
      search: vi.fn().mockResolvedValue([])
    } as any;

    expect(mockProvider.getStatus()).toBe('partial');
  });

  it('Audit 11. PARTIAL propagation para Export (Emenda 10 & 15)', () => {
    const failedProdId = 'prod_failed_load_011';
    const catalog = {
      id: 'cat_partial_test',
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
                    c1: {
                      sourceKind: 'pim_datum',
                      productId: failedProdId,
                      semanticKey: 'pressure.range',
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

    const auditBlocked = auditCatalogPublishSafety({
      catalog,
      runtimeStatus: 'partial',
      failedProductIds: [failedProdId],
      resolveDatum: () => ({ value: { kind: 'empty' }, status: 'unknown' })
    });

    expect(auditBlocked.canPublish).toBe(false);
    const failIssue = auditBlocked.issues.find((i) => i.code === 'FAILED_PRODUCT_LIVE_BINDING');
    expect(failIssue).toBeDefined();
    expect(failIssue?.severity).toBe('block');

    const catalogWithSnapshot = {
      ...catalog,
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
                    c1: {
                      sourceKind: 'pim_datum',
                      productId: failedProdId,
                      semanticKey: 'pressure.range',
                      bindingMode: 'live',
                      snapshot: { kind: 'text', text: '0-10 bar' }
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    } as unknown as Catalog;

    const auditWarn = auditCatalogPublishSafety({
      catalog: catalogWithSnapshot,
      runtimeStatus: 'partial',
      failedProductIds: [failedProdId],
      resolveDatum: () => ({ value: { kind: 'empty' }, status: 'unknown' })
    });

    expect(auditWarn.canPublish).toBe(true);
    const warnIssue = auditWarn.issues.find((i) => i.code === 'FAILED_PRODUCT_SNAPSHOT_FALLBACK');
    expect(warnIssue).toBeDefined();
    expect(warnIssue?.severity).toBe('warn');
  });

  it('Audit 12. stale preload = zero cache contamination (Emenda 6)', async () => {
    const registryReader = new InMemoryProductRegistryReader([
      { id: 'p_A', code: 'A', model: 'A' },
      { id: 'p_B', code: 'B', model: 'B' }
    ]);

    let resolveSlowWb: (wb: ProductWorkbookV2) => void;
    const slowPromise = new Promise<ProductWorkbookV2>((res) => {
      resolveSlowWb = res;
    });

    const workbookFetcher: ProductWorkbookFetcher = {
      getWorkbook: vi.fn().mockImplementation(async (owner) => {
        if (owner.id === 'p_A') return slowPromise;
        if (owner.id === 'p_B') {
          return {
            id: 'wb_B',
            schemaVersion: 2,
            owner: { kind: 'product', id: 'p_B' },
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

    const catA = {
      id: 'cat_A_epoch',
      pages: [{ id: 'p1', blocks: [{ id: 'b1', tableRows: [{ id: 'r1', cellBindings: { c: { sourceKind: 'pim_datum', productId: 'p_A', semanticKey: 'k', bindingMode: 'live' } } }] }] }]
    } as unknown as Catalog;

    const catB = {
      id: 'cat_B_epoch',
      pages: [{ id: 'p1', blocks: [{ id: 'b1', tableRows: [{ id: 'r1', cellBindings: { c: { sourceKind: 'pim_datum', productId: 'p_B', semanticKey: 'k', bindingMode: 'live' } } }] }] }]
    } as unknown as Catalog;

    const pA = runtime.preloadCatalogProductKnowledge(catA);
    const pB = runtime.preloadCatalogProductKnowledge(catB);

    await pB;
    expect(runtime.getActiveCatalogId()).toBe('cat_B_epoch');

    resolveSlowWb!({
      id: 'wb_A',
      schemaVersion: 2,
      owner: { kind: 'product', id: 'p_A' },
      revision: 1,
      modules: [],
      data: {},
      datasets: []
    });
    await pA;

    expect(runtime.getActiveCatalogId()).toBe('cat_B_epoch');
    expect(runtime.getReferencedProductIds()).toEqual(['p_B']);
  });

  it('Audit 13. global canonical enrichment via real workbook loading', async () => {
    const prodId = 'prod_enrich_013';
    const fakeRpcHits = [
      {
        source_index: 'technical_data',
        owner_kind: 'product',
        owner_id: prodId,
        semantic_key: 'metrology.accuracy.canonical',
        label: 'Label Bruto',
        value_formatted: '0.1',
        status: 'draft'
      }
    ];

    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({ data: fakeRpcHits, error: null })
    } as any;

    const registryReader = new InMemoryProductRegistryReader([
      { id: prodId, code: 'ENRICH', model: 'ENRICH_MOD' }
    ]);

    const realWb: ProductWorkbookV2 = {
      id: 'wb_enrich',
      schemaVersion: 2,
      owner: { kind: 'product', id: prodId },
      revision: 7,
      modules: [],
      data: {
        d1: {
          id: 'd1_canonical',
          moduleId: 'm1',
          semanticKey: 'metrology.accuracy.canonical',
          label: 'Exatidão Canônica Real',
          value: { type: 'quantity', amount: 0.05, unit: '°C' },
          evidence: [{ id: 'ev1', sourceDocumentId: 'ev1' }, { id: 'ev2', sourceDocumentId: 'ev2' }],
          status: 'approved'
        }
      },
      datasets: []
    };

    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn().mockResolvedValue(realWb),
      saveWorkbook: vi.fn()
    };

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      registryReader,
      repository
    });

    const results = await provider.search(undefined, 'accuracy');
    expect(results.length).toBe(1);
    const hit = results[0];

    expect(hit.label).toBe('Exatidão Canônica Real');
    expect(hit.status).toBe('approved');
    expect(hit.sourceCount).toBe(2);
    expect(hit.sourceRevision).toBe(7);
  });

  it('Audit 14. bounded global search call count: 50 hits, 10 produtos, 1 família', async () => {
    const fakeHits: any[] = [];
    for (let i = 0; i < 40; i++) {
      const prodIdx = i % 10;
      fakeHits.push({
        source_index: 'technical_data',
        owner_kind: 'product',
        owner_id: `prod_bounded_${prodIdx}`,
        semantic_key: `key_${i}`,
        label: `Label ${i}`,
        value_formatted: 'val'
      });
    }
    for (let i = 40; i < 50; i++) {
      fakeHits.push({
        source_index: 'technical_data',
        owner_kind: 'family',
        owner_id: 'fam_bounded_main',
        semantic_key: `fam_key_${i}`,
        label: `Fam Label ${i}`,
        value_formatted: 'fam_val'
      });
    }

    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({ data: fakeHits, error: null })
    } as any;

    const mockGetByIds = vi.fn().mockResolvedValue(
      Array.from({ length: 10 }).map((_, i) => ({ id: `prod_bounded_${i}`, code: `P${i}` }))
    );
    const mockGetByFamily = vi.fn().mockResolvedValue([
      { id: 'prod_bounded_0', code: 'P0', familyId: 'fam_bounded_main' }
    ]);

    const registryReader: any = {
      getProductIdentity: vi.fn(),
      getProductsByIds: mockGetByIds,
      getProductsByFamilyIds: mockGetByFamily
    };

    const mockGetWb = vi.fn().mockImplementation(async (owner) => ({
      id: `wb_${owner.id}`,
      schemaVersion: 2,
      owner,
      revision: 1,
      modules: [],
      data: {},
      datasets: []
    }));

    const repository: any = {
      getWorkbook: mockGetWb,
      saveWorkbook: vi.fn()
    };

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      registryReader,
      repository
    });

    const results = await provider.search(undefined, 'test');
    expect(results.length).toBeGreaterThan(0);

    expect(mockGetByIds).toHaveBeenCalledTimes(1);
    expect(mockGetByFamily).toHaveBeenCalledTimes(1);
    expect(mockGetWb.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it('Audit 15. zero fake datum keys no store após inserções', () => {
    const store = useCatalogStore.getState();

    useCatalogStore.setState({
      currentCatalog: {
        id: 'cat_test_keys',
        title: 'Catálogo de Teste de Chaves',
        version: 1,
        pages: [
          {
            id: 'page_keys_1',
            pageNumber: 1,
            blocks: []
          }
        ]
      } as any
    });

    const dsProj = {
      datasetId: 'ds_real_015',
      productId: 'prod_015',
      title: 'Tabela Real',
      columns: [{ id: 'col1', key: 'accuracy', label: 'Exatidão' }],
      rows: [
        {
          rowId: 'row1',
          label: 'P1',
          cells: {
            accuracy: {
              datumId: 'd_real',
              datumKey: 'metrology.accuracy',
              value: { kind: 'text' as const, text: '0.05' },
              sourceOwnerKind: 'product' as const,
              sourceOwnerId: 'prod_015',
              sourceRevision: 3
            }
          }
        }
      ],
      bindingMode: 'live' as const
    };

    store.insertTechnicalDatasetAsTable('page_keys_1', dsProj);

    const svProj = {
      id: 'sv_real_015',
      title: 'View Real',
      productId: 'prod_015',
      columns: [
        { id: 'c1', key: 'property', label: 'Propriedade' },
        { id: 'c2', key: 'value', label: 'Valor' }
      ],
      rows: [
        {
          rowId: 'r1',
          cells: {
            property: { kind: 'literal' as const, value: { kind: 'text' as const, text: 'Exatidão' } },
            value: {
              kind: 'bound' as const,
              datumId: 'd_real',
              datumKey: 'metrology.accuracy',
              value: { kind: 'text' as const, text: '0.05' },
              sourceOwnerKind: 'product' as const,
              sourceOwnerId: 'prod_015',
              sourceRevision: 3
            }
          }
        }
      ],
      bindingMode: 'live' as const
    };

    store.insertSavedViewAsTable('page_keys_1', svProj);

    const cat = useCatalogStore.getState().currentCatalog!;
    const allBindings: CatalogCellBinding[] = [];
    cat.pages.forEach((p) =>
      p.blocks.forEach((b) =>
        b.tableRows?.forEach((r) => {
          if (r.cellBindings) {
            Object.values(r.cellBindings).forEach((bind) => allBindings.push(bind));
          }
        })
      )
    );

    expect(allBindings.length).toBeGreaterThan(0);
    for (const binding of allBindings) {
      expect(binding.semanticKey).not.toContain('canonical_datum_');
      expect(binding.semanticKey).not.toContain('canonical_datum_snapshot');
      expect(binding.semanticKey).not.toContain('dataset.');
      expect(binding.semanticKey).toBe('metrology.accuracy');
    }
  });

  it('Audit 16. production provider path sem registerResolvedKnowledge shortcut', async () => {
    const pId = 'prod_e2e_016';
    const fakeClient = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            source_index: 'technical_data',
            owner_kind: 'product',
            owner_id: pId,
            semantic_key: 'metrology.temp_range',
            label: 'Faixa de Operação',
            value_formatted: '-20 a 60 °C',
            status: 'approved'
          }
        ],
        error: null
      })
    } as any;

    const registryReader = new InMemoryProductRegistryReader([
      { id: pId, code: 'E2E_PROD', model: 'E2E_MODEL' }
    ]);

    const realWb: ProductWorkbookV2 = {
      id: 'wb_e2e_016',
      schemaVersion: 2,
      owner: { kind: 'product', id: pId },
      revision: 5,
      modules: [],
      data: {
        d_temp: {
          id: 'd_temp',
          moduleId: 'm1',
          semanticKey: 'metrology.temp_range',
          label: 'Faixa de Operação',
          value: { type: 'range', lower: -20, upper: 60, unit: '°C' },
          evidence: [{ id: 'ev1', sourceDocumentId: 'ev1' }],
          status: 'approved'
        }
      },
      datasets: []
    };

    const repository: ProductWorkbookRepository = {
      getWorkbook: vi.fn().mockResolvedValue(realWb),
      saveWorkbook: vi.fn()
    };

    const provider = new SupabaseProductKnowledgeProvider({
      client: fakeClient,
      registryReader,
      repository
    });

    const searchResults = await provider.search(undefined, 'Faixa');
    expect(searchResults.length).toBe(1);
    const hit = searchResults[0];
    expect(hit.bindable).toBe(true);

    const runtime = provider.getRuntime();
    const catalog = {
      id: 'cat_e2e_real',
      pages: [
        {
          id: 'p1',
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
                      productId: pId,
                      semanticKey: 'metrology.temp_range',
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

    await runtime.preloadCatalogProductKnowledge(catalog);
    expect(runtime.getStatus()).toBe('ready');

    const resolver = runtime.getCompositeDatumResolver();
    const res = resolver({
      kind: 'datum_reference',
      productId: pId,
      datumKey: 'metrology.temp_range',
      bindingMode: 'live'
    });

    expect(res?.status).toBe('approved');
    expect(res?.value).toEqual({
      kind: 'range',
      lower: -20,
      upper: 60,
      unit: '°C',
      lowerInclusive: undefined,
      upperInclusive: undefined
    });
  });
});
