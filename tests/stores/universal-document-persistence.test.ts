import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useTemplateStore } from '../../src/stores/useTemplateStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { Catalog, CatalogPreset } from '../../src/domain/catalog.schema';

describe('P0.4 — Universal Document Mutation Persistence Suite', () => {
  const testTemplateId = 'tpl-persist-0000-0000-000000000001';
  const testCatalogId = 'cat-persist-0000-0000-000000000001';

  const baseTemplateData: CatalogPreset = {
    id: testTemplateId,
    name: 'E2E-DOCUMENT-PERSISTENCE',
    description: 'Template para validação universal de mutações',
    category: 'layout_template',
    isSystem: false,
    version: 1,
    catalog: {
      id: testTemplateId,
      title: 'E2E-DOCUMENT-PERSISTENCE',
      subtitle: 'Subtítulo',
      themeId: 'default-technical',
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Folha Técnica 1',
          blocks: [
            {
              id: 'block-table-1',
              type: 'table',
              title: 'Tabela Principal de Sensores',
              tableColumns: [
                { key: 'model', label: 'Modelo', visible: true, isCustom: false },
                { key: 'range', label: 'Faixa', visible: true, isCustom: false },
                { key: 'accuracy', label: 'Exatidão', visible: true, isCustom: false }
              ],
              tableRows: [
                {
                  id: 'row-1',
                  productRefId: 'PCON-500',
                  localOverrides: {},
                  customNotes: '',
                  order: 0
                }
              ]
            }
          ]
        }
      ],
      version: 1,
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z'
    },
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z'
  };

  const baseCatalogData: Catalog = {
    id: testCatalogId,
    title: 'Catálogo de Produção 2026',
    subtitle: 'Instrumentação',
    themeId: 'default-technical',
    pages: structuredClone(baseTemplateData.catalog.pages),
    version: 1,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useCatalogStore.setState({
      currentCatalog: null,
      savedCatalogs: [],
      editorContext: { kind: 'catalog', catalogId: '' },
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: false,
      isSaving: false,
      syncStatus: 'synced',
      syncError: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
    });
    useTemplateStore.setState({
      customTemplates: [structuredClone(baseTemplateData)],
      syncStatus: 'synced',
      syncError: null
    });
  });

  // =========================================================================
  // TBL-1: Adição de Linha de Produto na Tabela
  // =========================================================================
  it('TBL-1: addRowToTable persiste a nova linha no snapshot e incrementa versão', async () => {
    let savedVersion = 1;
    let savedCatalogSnapshot: Catalog | null = null;

    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedVersion = (expectedVer || 1) + 1;
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: savedVersion, catalog: { ...catalog, version: savedVersion } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    // Browser A adiciona produto PCON-Y18 à tabela
    useCatalogStore.getState().addRowToTable('block-table-1', 'PCON-Y18');

    const stateAfterAdd = useCatalogStore.getState();
    const tableBlock = stateAfterAdd.currentCatalog?.pages[0].blocks[0];
    expect(tableBlock?.tableRows?.length).toBe(2);
    expect(tableBlock?.tableRows?.[1].productRefId).toBe('PCON-Y18');
    expect(stateAfterAdd.isDirty).toBe(true);

    // Ctrl+S / Flush
    const saveRes = await useCatalogStore.getState().saveActiveDocument();
    expect(saveRes.success).toBe(true);
    expect(saveRes.status).toBe('synced');
    expect(saveRes.version).toBe(2);

    expect(savedCatalogSnapshot).not.toBeNull();
    const serverRows = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0].tableRows;
    expect(serverRows?.length).toBe(2);
    expect(serverRows?.[1].productRefId).toBe('PCON-Y18');
  });

  // =========================================================================
  // TBL-2: Adição de Coluna Personalizada
  // =========================================================================
  it('TBL-2: addTableColumn adiciona nova coluna e persiste no banco', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: (expectedVer || 1) + 1, catalog: { ...catalog, version: (expectedVer || 1) + 1 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    useCatalogStore.getState().addTableColumn('block-table-1', {
      key: 'max_pressure',
      label: 'PRESSÃO MÁXIMA',
      visible: true,
      isCustom: true
    });

    await useCatalogStore.getState().saveActiveDocument();

    const serverCols = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0].tableColumns;
    expect(serverCols?.some((c) => c.key === 'max_pressure' && c.label === 'PRESSÃO MÁXIMA')).toBe(true);
  });

  // =========================================================================
  // TBL-3: Override de Célula (Local Override)
  // =========================================================================
  it('TBL-3: updateCellOverride grava override de célula sem corromper outros dados', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: (expectedVer || 1) + 1, catalog: { ...catalog, version: (expectedVer || 1) + 1 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    useCatalogStore.getState().updateCellOverride('block-table-1', 'row-1', 'accuracy', '0.015% FE');

    await useCatalogStore.getState().saveActiveDocument();

    const serverRow = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0].tableRows?.[0];
    expect(serverRow?.localOverrides?.['accuracy']).toBe('0.015% FE');
  });

  // =========================================================================
  // TBL-4: Renomeação de Coluna
  // =========================================================================
  it('TBL-4: renameTableColumn altera o label e persiste', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: (expectedVer || 1) + 1, catalog: { ...catalog, version: (expectedVer || 1) + 1 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    useCatalogStore.getState().renameTableColumn('block-table-1', 'accuracy', 'EXATIDÃO GLOBAL');

    await useCatalogStore.getState().saveActiveDocument();

    const serverCol = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0].tableColumns?.find((c) => c.key === 'accuracy');
    expect(serverCol?.label).toBe('EXATIDÃO GLOBAL');
  });

  // =========================================================================
  // TBL-5 & TBL-6: Remoção de Linha e Coluna
  // =========================================================================
  it('TBL-5, TBL-6: removeRowFromTable e removeTableColumn atualizam o snapshot com sucesso', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: (expectedVer || 1) + 1, catalog: { ...catalog, version: (expectedVer || 1) + 1 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    useCatalogStore.getState().removeRowFromTable('block-table-1', 'row-1');
    useCatalogStore.getState().removeTableColumn('block-table-1', 'range');

    await useCatalogStore.getState().saveActiveDocument();

    const serverTable = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0];
    expect(serverTable.tableRows?.length).toBe(0);
    expect(serverTable.tableColumns?.some((c) => c.key === 'range')).toBe(false);
  });

  // =========================================================================
  // TBL-7: Mutações Rápidas Consolidadas
  // =========================================================================
  it('TBL-7: Mutações rápidas consolidam snapshot completo sem perda de dados', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog);
      return {
        success: true,
        data: { ...baseTemplateData, version: (expectedVer || 1) + 1, catalog: { ...catalog, version: (expectedVer || 1) + 1 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    useCatalogStore.getState().addRowToTable('block-table-1', 'PROD-A');
    useCatalogStore.getState().addTableColumn('block-table-1', { key: 'col_b', label: 'Coluna B', visible: true });
    useCatalogStore.getState().setPageTitle('page-1', 'Folha Consolidada');

    await useCatalogStore.getState().saveActiveDocument();

    const snap = savedCatalogSnapshot as unknown as Catalog;
    expect(snap?.pages[0].title).toBe('Folha Consolidada');
    expect(snap?.pages[0].blocks[0].tableRows?.length).toBe(2);
    expect(snap?.pages[0].blocks[0].tableColumns?.length).toBe(4);
  });

  // =========================================================================
  // TBL-8: Mutação Durante Requisição em Voo
  // =========================================================================
  it('TBL-8: Mutação durante save in-flight preserva dirty e salva próxima revisão', async () => {
    let resolveFirstSave: (val: any) => void;
    const firstSavePromise = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    let callCount = 0;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, catalog) => {
      callCount++;
      if (callCount === 1) {
        await firstSavePromise;
        return {
          success: true,
          data: { ...baseTemplateData, version: 2, catalog: { ...catalog, version: 2 } }
        };
      }
      return {
        success: true,
        data: { ...baseTemplateData, version: 3, catalog: { ...catalog, version: 3 } }
      };
    });

    await useCatalogStore.getState().openTemplateForEditing(testTemplateId);

    // 1. Inicia primeiro save
    useCatalogStore.getState().addRowToTable('block-table-1', 'PROD-1');
    const firstFlush = useCatalogStore.getState().saveActiveDocument();

    // 2. Segunda mutação ocorre antes do ACK
    useCatalogStore.getState().addRowToTable('block-table-1', 'PROD-2');
    expect(useCatalogStore.getState().isDirty).toBe(true);

    // 3. Libera primeiro save
    resolveFirstSave!({ success: true });
    await firstFlush;

    // 4. Salva segunda mutação
    const secondFlush = await useCatalogStore.getState().saveActiveDocument();
    expect(secondFlush.success).toBe(true);
    expect(secondFlush.version).toBe(3);
    expect(useCatalogStore.getState().currentCatalog?.pages[0].blocks[0].tableRows?.length).toBe(3);
  });

  // =========================================================================
  // CAT-1..4: Persistência Universal em Modo Catálogo
  // =========================================================================
  it('CAT-1..4: Persistência de tabela, coluna e overrides em modo catálogo', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog) as Catalog;
      return {
        success: true,
        data: { ...catalog, version: (expectedVer || 0) + 1 } as Catalog
      };
    });

    useCatalogStore.setState({
      currentCatalog: structuredClone(baseCatalogData),
      editorContext: { kind: 'catalog', catalogId: testCatalogId },
      isDirty: false,
      syncStatus: 'synced'
    });

    // CAT-1: Add row
    useCatalogStore.getState().addRowToTable('block-table-1', 'PCON-CAT-1');
    // CAT-2: Add column
    useCatalogStore.getState().addTableColumn('block-table-1', { key: 'status_col', label: 'Status', visible: true });
    // CAT-3: Cell override
    useCatalogStore.getState().updateCellOverride('block-table-1', 'row-1', 'accuracy', '0.005% FE');

    const res = await useCatalogStore.getState().saveActiveDocument();
    expect(res.success).toBe(true);
    expect(res.status).toBe('synced');
    expect(res.version).toBeGreaterThanOrEqual(2);

    const savedTable = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0];
    expect(savedTable.tableRows?.length).toBe(2);
    expect(savedTable.tableRows?.[1].productRefId).toBe('PCON-CAT-1');
    expect(savedTable.tableColumns?.some((c) => c.key === 'status_col')).toBe(true);
    expect(savedTable.tableRows?.[0].localOverrides?.['accuracy']).toBe('0.005% FE');
  });

  // =========================================================================
  // STRUCT-1..5: Outras Estruturas (Features, Legend, Cover Layers, Ordering)
  // =========================================================================
  it('STRUCT-1..5: Persistência de legendas, features e propriedades customizadas', async () => {
    let savedCatalogSnapshot: Catalog | null = null;
    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (catalog, expectedVer) => {
      savedCatalogSnapshot = structuredClone(catalog) as Catalog;
      return {
        success: true,
        data: { ...catalog, version: (expectedVer || 0) + 1 } as Catalog
      };
    });

    useCatalogStore.setState({
      currentCatalog: structuredClone(baseCatalogData),
      editorContext: { kind: 'catalog', catalogId: testCatalogId },
      isDirty: false,
      syncStatus: 'synced'
    });

    // Atualiza customData e legend
    useCatalogStore.getState().updateBlock('page-1', 'block-table-1', {
      customData: {
        showLegend: true,
        legendTitle: 'LEGENDA OFICIAL:',
        legendLabels: { standard: 'Item Padrão', optional: 'Opcional sob consulta' }
      },
      features: [
        { id: 'feat-1', title: 'Alta Precisão Térmica', icon: 'CheckCircle2' }
      ]
    });

    await useCatalogStore.getState().saveActiveDocument();

    const savedBlock = (savedCatalogSnapshot as unknown as Catalog).pages[0].blocks[0];
    expect(savedBlock.customData?.showLegend).toBe(true);
    expect(savedBlock.customData?.legendTitle).toBe('LEGENDA OFICIAL:');
    expect(savedBlock.features?.[0].title).toBe('Alta Precisão Térmica');
  });
});
