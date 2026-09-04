// tests/domain/table-core/table-production-experience-1-2.test.tsx
// Suíte de Testes de Regressão e Validação Estrita — TABLE.PRODUCTION.EXPERIENCE1.2
// Cobre: Binding Authority, Snapshot Invariant, Saved View Real Action, Strict Binding, Fail-Safe Presentation, Publish Safety

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import {
  Catalog,
  ContentBlock,
  CatalogCellBindingSchema
} from '../../../src/domain/catalog.schema';
import {
  adaptLegacyBlockToTableCore,
  auditCatalogPublishSafety
} from '../../../src/domain/table-core';
import {
  TechnicalDatasetProjection,
  SavedViewProjection,
  TestProductKnowledgeProvider,
  createProductWorkbookDatumResolver
} from '../../../src/domain/table-binding';
import { useCatalogStore } from '../../../src/stores/useCatalogStore';
import { useUIStore, KnowledgePickerTarget } from '../../../src/stores/useUIStore';
import { ProductKnowledgePickerModal } from '../../../src/components/editor/picker/ProductKnowledgePickerModal';

describe('TABLE.PRODUCTION.EXPERIENCE1.2: Binding Authority, Snapshot & Saved View Final Closure', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container.remove();
    useUIStore.setState({
      isProductKnowledgePickerModalOpen: false,
      knowledgePickerTarget: undefined
    });
  });

  const createBaseCatalog = (block: ContentBlock): Catalog => ({
    id: 'cat-test-1-2',
    title: 'Catálogo de Produção 1.2',
    themeId: 'presys-default',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Folha 1',
        blocks: [block]
      }
    ]
  });

  // =========================================================================
  // 1. dataset LIVE insert -> zero cellValues/localOverrides -> datum_reference ativo
  // =========================================================================
  it('1. dataset LIVE insert: cria tabela com bindings limpos (zero cellValues/localOverrides) e datum_reference ativo', () => {
    const baseBlock: ContentBlock = {
      id: 'blk-placeholder',
      type: 'specs_table',
      title: 'Tabela Base'
    };
    const catalog = createBaseCatalog(baseBlock);
    useCatalogStore.setState({ currentCatalog: catalog });

    const dataset: TechnicalDatasetProjection = {
      datasetId: 'ds-ranges-live',
      productId: 'prod-ta25n',
      title: 'Faixas do TA-25N',
      bindingMode: 'live',
      sourceRevision: 1,
      columns: [
        { key: 'range', label: 'Faixa' },
        { key: 'accuracy', label: 'Exatidão' }
      ],
      rows: [
        {
          rowId: 'row-1',
          cells: {
            range: { datumId: 'd-range-1', datumKey: 'pressure.range', value: { kind: 'text', text: '0 a 10 bar' } },
            accuracy: { datumId: 'd-acc-1', datumKey: 'pressure.accuracy', value: { kind: 'number', value: 0.1 } }
          }
        }
      ]
    };

    const blockId = useCatalogStore.getState().insertTechnicalDatasetAsTable('page-1', dataset);
    const updated = useCatalogStore.getState().currentCatalog;
    const insertedBlock = updated?.pages[0].blocks?.find((b) => b.id === blockId);

    expect(insertedBlock).toBeDefined();
    expect(insertedBlock?.tableRows).toHaveLength(1);
    const row = insertedBlock!.tableRows![0];

    // Regra Blocker 1: cellValues e localOverrides devem estar vazios
    expect(row.cellValues).toEqual({});
    expect(row.localOverrides).toEqual({});

    // Bindings contêm o snapshot inicial e a referência live
    expect(row.cellBindings?.['accuracy']).toBeDefined();
    expect(row.cellBindings?.['accuracy'].bindingMode).toBe('live');
    expect(row.cellBindings?.['accuracy'].snapshot).toEqual({ kind: 'number', value: 0.1 });

    // Adaptador TableCore produz datum_reference, NÃO valor literal local
    const adaptRes = adaptLegacyBlockToTableCore(insertedBlock!);
    expect(adaptRes.supported).toBe(true);
    if (adaptRes.supported) {
      const mapping = adaptRes.bridge.getByLegacyCoordinates(row.id, 'accuracy');
      expect(mapping).toBeDefined();
      expect(mapping?.content.kind).toBe('datum_reference');
      if (mapping?.content.kind === 'datum_reference') {
        expect(mapping.content.bindingMode).toBe('live');
        expect(mapping.content.datumKey).toBe('pressure.accuracy');
      }
    }
  });

  // =========================================================================
  // 2. dataset source update changes rendered value
  // =========================================================================
  it('2. dataset source update: atualização da fonte PIM reflete no valor resolvido sem máscara local', () => {
    const lookupMap = new Map();
    lookupMap.set('prod-ta25n', {
      productId: 'prod-ta25n',
      productRevision: 2,
      effectiveData: new Map([
        [
          'pressure.accuracy',
          {
            key: 'pressure.accuracy',
            effectiveStatus: 'approved',
            datum: {
              value: { type: 'number', value: 0.2 }
            }
          }
        ]
      ])
    });

    const resolver = createProductWorkbookDatumResolver(lookupMap);
    const resolved = resolver({
      kind: 'datum_reference',
      productId: 'prod-ta25n',
      datumKey: 'pressure.accuracy',
      bindingMode: 'live',
      sourceRevision: 1,
      snapshot: { kind: 'number', value: 0.1 }
    });

    expect(resolved).toBeDefined();
    expect(resolved?.value).toEqual({ kind: 'number', value: 0.2 });
    expect(resolved?.status).toBe('approved');
  });

  // =========================================================================
  // 3. binding replaces manual cell by explicit policy
  // =========================================================================
  it('3. binding replaces manual cell: Vincular à Fonte remove valores manuais por padrão (REPLACE_WITH_SOURCE)', () => {
    const blockWithManual: ContentBlock = {
      id: 'blk-manual',
      type: 'specs_table',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão' }],
      tableRows: [
        {
          id: 'row-1',
          cellValues: {
            accuracy: { kind: 'text', text: 'Valor Manual Antigo' }
          },
          localOverrides: {
            accuracy: 'Valor Manual Antigo'
          }
        }
      ]
    };

    useCatalogStore.setState({ currentCatalog: createBaseCatalog(blockWithManual) });

    // Aplica binding com a política padrão (REPLACE_WITH_SOURCE)
    useCatalogStore.getState().setTableCellBinding(
      'blk-manual',
      'row-1',
      'accuracy',
      {
        sourceKind: 'pim_datum',
        productId: 'prod-ta25n',
        semanticKey: 'accuracy.reference',
        bindingMode: 'live',
        sourceRevision: 1,
        snapshot: { kind: 'number', value: 0.05 }
      }
    );

    const updated = useCatalogStore.getState().currentCatalog;
    const row = updated?.pages[0].blocks[0].tableRows![0];

    // cellValues e localOverrides foram limpos
    expect(row?.cellValues?.['accuracy']).toBeUndefined();
    expect(row?.localOverrides?.['accuracy']).toBeUndefined();
    expect(row?.cellBindings?.['accuracy']).toBeDefined();

    // Adapter produz datum_reference e NÃO o valor manual antigo
    const adaptRes = adaptLegacyBlockToTableCore(updated!.pages[0].blocks[0]);
    expect(adaptRes.supported).toBe(true);
    if (adaptRes.supported) {
      const mapping = adaptRes.bridge.getByLegacyCoordinates('row-1', 'accuracy');
      expect(mapping?.content.kind).toBe('datum_reference');
    }
  });

  // =========================================================================
  // 4. optional "keep as override" works only when explicitly chosen
  // =========================================================================
  it('4. keep as override: preserva valor manual apenas quando KEEP_AS_OVERRIDE for explicitamente solicitado', () => {
    const blockWithManual: ContentBlock = {
      id: 'blk-manual-2',
      type: 'specs_table',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão' }],
      tableRows: [
        {
          id: 'row-1',
          cellValues: {
            accuracy: { kind: 'text', text: 'Override Preservado' }
          },
          localOverrides: {
            accuracy: 'Override Preservado'
          }
        }
      ]
    };

    useCatalogStore.setState({ currentCatalog: createBaseCatalog(blockWithManual) });

    // Aplica binding com KEEP_AS_OVERRIDE explícito
    useCatalogStore.getState().setTableCellBinding(
      'blk-manual-2',
      'row-1',
      'accuracy',
      {
        sourceKind: 'pim_datum',
        productId: 'prod-ta25n',
        semanticKey: 'accuracy.reference',
        bindingMode: 'live',
        sourceRevision: 1
      },
      'KEEP_AS_OVERRIDE'
    );

    const updated = useCatalogStore.getState().currentCatalog;
    const row = updated?.pages[0].blocks[0].tableRows![0];

    // Valores manuais foram mantidos como override
    expect(row?.cellValues?.['accuracy']).toEqual({ kind: 'text', text: 'Override Preservado' });
    expect(row?.localOverrides?.['accuracy']).toBe('Override Preservado');
    expect(row?.cellBindings?.['accuracy']).toBeDefined();

    // Adapter reconhece como override
    const adaptRes = adaptLegacyBlockToTableCore(updated!.pages[0].blocks[0]);
    expect(adaptRes.supported).toBe(true);
    if (adaptRes.supported) {
      const mapping = adaptRes.bridge.getByLegacyCoordinates('row-1', 'accuracy');
      expect(mapping?.isOverride).toBe(true);
      expect(mapping?.content).toEqual({ kind: 'text', text: 'Override Preservado' });
    }
  });

  // =========================================================================
  // 5. snapshot without snapshot rejected by Zod
  // =========================================================================
  it('5. snapshot invariant: schema Zod rejeita bindingMode snapshot sem snapshot fornecido', () => {
    const invalidBinding = {
      sourceKind: 'pim_datum',
      productId: 'prod-ta25n',
      semanticKey: 'accuracy.value',
      bindingMode: 'snapshot'
      // snapshot ausente
    };

    const res = CatalogCellBindingSchema.safeParse(invalidBinding);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.message.includes('Snapshot is mandatory'))).toBe(true);
    }
  });

  // =========================================================================
  // 6. snapshot without snapshot never fabricates blank
  // =========================================================================
  it('6. snapshot fail-closed: legacy-table.adapter nunca fabrica snapshot vazio silenciosamente', () => {
    const malformedBlock: ContentBlock = {
      id: 'blk-malformed-snap',
      type: 'specs_table',
      tableColumns: [{ key: 'accuracy', label: 'Exatidão' }],
      tableRows: [
        {
          id: 'row-1',
          cellBindings: {
            accuracy: {
              sourceKind: 'pim_datum',
              productId: 'prod-ta25n',
              semanticKey: 'accuracy.value',
              bindingMode: 'snapshot'
              // sem snapshot
            } as any
          }
        }
      ]
    };

    const res = adaptLegacyBlockToTableCore(malformedBlock);
    expect(res.supported).toBe(true);
    if (res.supported) {
      // Deve ter gerado warning
      expect(res.warnings.some((w) => w.includes('Binding snapshot sem snapshot fornecido'))).toBe(true);
      const mapping = res.bridge.getByLegacyCoordinates('row-1', 'accuracy');
      expect(mapping?.content).toEqual({ kind: 'empty' });
      // Nunca { kind: 'text', text: '' }
      expect(mapping?.content).not.toEqual({ kind: 'text', text: '' });
    }
  });

  // =========================================================================
  // 7. publish blocks malformed snapshot binding
  // =========================================================================
  it('7. publish safety: bloqueia publicação se houver binding snapshot sem snapshot persistido', () => {
    const block: ContentBlock = {
      id: 'blk-snap-missing',
      type: 'specs_table',
      tableColumns: [{ key: 'range', label: 'Faixa' }],
      tableRows: [
        {
          id: 'row-1',
          cellBindings: {
            range: {
              sourceKind: 'pim_datum',
              productId: 'prod-ta25n',
              semanticKey: 'range.spec',
              bindingMode: 'snapshot'
              // sem snapshot
            } as any
          }
        }
      ]
    };

    const report = auditCatalogPublishSafety({ catalog: createBaseCatalog(block) });
    expect(report.canPublish).toBe(false);
    expect(report.blockCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some((i) => i.code === 'SNAPSHOT_MODE_WITHOUT_SNAPSHOT')).toBe(true);
  });

  // =========================================================================
  // 8. dataset binding requires datasetId
  // =========================================================================
  it('8. dataset binding requires datasetId: rejeita dataset sem datasetId no Zod e bloqueia na publicação', () => {
    const invalidDatasetBinding = {
      sourceKind: 'dataset',
      productId: 'prod-ta25n',
      semanticKey: 'range.spec',
      bindingMode: 'live'
      // datasetId ausente
    };

    const zodRes = CatalogCellBindingSchema.safeParse(invalidDatasetBinding);
    expect(zodRes.success).toBe(false);

    const block: ContentBlock = {
      id: 'blk-ds-missing-id',
      type: 'specs_table',
      tableColumns: [{ key: 'range', label: 'Faixa' }],
      tableRows: [
        {
          id: 'row-1',
          cellBindings: {
            range: invalidDatasetBinding as any
          }
        }
      ]
    };

    const auditRes = auditCatalogPublishSafety({ catalog: createBaseCatalog(block) });
    expect(auditRes.canPublish).toBe(false);
    expect(auditRes.issues.some((i) => i.code === 'DATASET_BINDING_MISSING_DATASET_ID')).toBe(true);
  });

  // =========================================================================
  // 9. Saved View actual action
  // =========================================================================
  it('9. Saved View actual action: insere Saved View como tabela através de projeção dedicada', () => {
    const baseBlock: ContentBlock = {
      id: 'blk-base',
      type: 'specs_table'
    };
    useCatalogStore.setState({ currentCatalog: createBaseCatalog(baseBlock) });

    const view: SavedViewProjection = {
      id: 'view-press-01',
      title: 'Visão Salva de Pressão',
      productId: 'prod-ta25n',
      bindingMode: 'live',
      sourceRevision: 3,
      columns: [
        { key: 'sensor', label: 'Sensor' },
        { key: 'range', label: 'Faixa' }
      ],
      rows: [
        {
          rowId: 'row-sv-1',
          cells: {
            sensor: { datumId: 'd-s1', datumKey: 'sensor.type', value: { kind: 'text', text: 'Piezoresistivo' } },
            range: { datumId: 'd-r1', datumKey: 'pressure.range', value: { kind: 'text', text: '0 a 100 bar' } }
          }
        }
      ]
    };

    const blockId = useCatalogStore.getState().insertSavedViewAsTable('page-1', view);
    const updated = useCatalogStore.getState().currentCatalog;
    const insertedBlock = updated?.pages[0].blocks?.find((b) => b.id === blockId);

    expect(insertedBlock).toBeDefined();
    expect(insertedBlock?.customData?.savedViewId).toBe('view-press-01');
    expect(insertedBlock?.tableColumns).toHaveLength(2);
    expect(insertedBlock?.tableRows).toHaveLength(1);
    expect(insertedBlock?.tableRows![0].cellBindings?.['sensor'].semanticKey).toBe('sensor.type');
  });

  // =========================================================================
  // 10. querySelector null regression / real click tests
  // =========================================================================
  it('10. real click test: modal responde a cliques reais com botões verificados (não-nulos)', async () => {
    const target: KnowledgePickerTarget = {
      kind: 'table',
      blockId: 'blk-target'
    };

    useUIStore.setState({
      isProductKnowledgePickerModalOpen: true,
      knowledgePickerTarget: target
    });

    const mockProvider = new TestProductKnowledgeProvider([
      {
        bindable: true,
        id: 'view-res-01',
        kind: 'saved_view',
        savedViewId: 'view-res-01',
        productId: 'prod-ta25n',
        semanticKey: 'view.press.01',
        label: 'Visão Especial TA-25N',
        status: 'approved',
        origin: 'PIM',
        sourceCount: 1,
        preview: '2 colunas'
      }
    ]);

    mockProvider.registerSavedView({
      id: 'view-res-01',
      title: 'Visão Especial TA-25N',
      productId: 'prod-ta25n',
      bindingMode: 'live',
      columns: [{ key: 'f1', label: 'Campo 1' }],
      rows: []
    });

    await act(async () => {
      root?.render(<ProductKnowledgePickerModal provider={mockProvider} />);
    });

    const btn = container.querySelector('[data-testid="picker-insert-saved-view-view-res-01"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();

    await act(async () => {
      btn!.click();
    });

    // O modal deve fechar e a ação deve ter sido executada
    expect(useUIStore.getState().isProductKnowledgePickerModalOpen).toBe(false);
  });

  // =========================================================================
  // 11. malformed custom tablePresentation fails safe
  // =========================================================================
  it('11. presentation validation: customData.tablePresentation malformado reverte para preset do sistema com warning', () => {
    const blockWithBadPres: ContentBlock = {
      id: 'blk-corrupted-pres',
      type: 'specs_table',
      tableColumns: [{ key: 'param', label: 'Parâmetro' }],
      tableRows: [{ id: 'r1' }],
      customData: {
        tablePresentation: {
          density: 'invalid_density_value',
          presetId: 99999 // número inválido
        }
      }
    };

    const res = adaptLegacyBlockToTableCore(blockWithBadPres);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.warnings.some((w) => w.includes('customData.tablePresentation malformado ignorado'))).toBe(true);
      expect(res.table.presentation.presetId).toBe('presys_clean_technical');
    }
  });

  // =========================================================================
  // 12. old catalog compatibility
  // =========================================================================
  it('12. old catalog compatibility: catálogos antigos com dados puramente textuais e sem bindings continuam válidos', () => {
    const oldBlock: ContentBlock = {
      id: 'blk-vintage',
      type: 'specs_table',
      tableColumns: [
        { key: 'item', label: 'Item' },
        { key: 'valor', label: 'Valor' }
      ],
      tableRows: [
        {
          id: 'row-v1',
          localOverrides: {
            item: 'Resolução',
            valor: '0.01 °C'
          }
        }
      ]
    };

    const res = adaptLegacyBlockToTableCore(oldBlock);
    expect(res.supported).toBe(true);
    if (res.supported) {
      expect(res.table.rows).toHaveLength(1);
      const mappingItem = res.bridge.getByLegacyCoordinates('row-v1', 'item');
      const mappingVal = res.bridge.getByLegacyCoordinates('row-v1', 'valor');
      expect(mappingItem?.content).toEqual({ kind: 'text', text: 'Resolução' });
      expect(mappingVal?.content).toEqual({ kind: 'text', text: '0.01 °C' });
    }
  });
});
