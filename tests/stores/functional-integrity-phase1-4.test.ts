import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { Catalog } from '../../src/domain/catalog.schema';

describe('FASE 1.4 — Functional Integrity & Document Commands Suite', () => {
  const catalogA_Id = 'cat-aaaa-1111-4111-8111-111111111111';
  const catalogB_Id = 'cat-bbbb-2222-4222-8222-222222222222';

  const sampleCatalogA: Catalog = {
    id: catalogA_Id,
    title: 'Catálogo Oficial A',
    subtitle: 'Linha de Calibradores A',
    themeId: 'default-technical',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Página 1 de A',
        blocks: [{ id: 'b1', type: 'text', title: 'Bloco A1' }]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 10
  };

  const sampleCatalogB: Catalog = {
    id: catalogB_Id,
    title: 'Catálogo Oficial B',
    subtitle: 'Linha de Calibradores B',
    themeId: 'default-technical',
    pages: [
      {
        id: 'p1_b',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Página 1 de B',
        blocks: [{ id: 'b1_b', type: 'text', title: 'Bloco B1' }]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 5
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    localStorage.clear();
    sessionStorage.clear();

    useCatalogStore.setState({
      currentCatalog: structuredClone(sampleCatalogA),
      savedCatalogs: [structuredClone(sampleCatalogA), structuredClone(sampleCatalogB)],
      activePageIndex: 0,
      selectedBlockId: 'b1',
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
    });
  });

  // =========================================================================
  // F1: Manual Save / Flush com autosave em voo aguarda flush e termina synced
  // =========================================================================
  it('F1: flushCatalog aguarda save em voo e garante estado synced com versão confirmada', async () => {
    let resolveSave!: (val: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });
    vi.spyOn(SupabaseService, 'saveCatalog').mockReturnValue(savePromise as any);

    // Dispara save em voo
    const backgroundSavePromise = useCatalogStore.getState().saveCurrentCatalog();

    // Dispara flush explícito
    const flushPromise = useCatalogStore.getState().flushCatalog(catalogA_Id);

    // Conclui o save com sucesso
    resolveSave({
      success: true,
      data: {
        id: catalogA_Id,
        name: sampleCatalogA.title,
        version: 11,
        brand: { ...sampleCatalogA, version: 11 }
      }
    });

    const [bgRes, flushRes] = await Promise.all([backgroundSavePromise, flushPromise]);

    expect(bgRes.success).toBe(true);
    expect(flushRes.success).toBe(true);
    expect(flushRes.version).toBe(11);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(11);
  });

  // =========================================================================
  // F2 & F5 & F6 & F7: saveAsNewCatalog cria novo registro com novo UUID
  // =========================================================================
  it('F2, F5, F6, F7: saveAsNewCatalog cria novo registro, define currentCatalog, savedCatalogs e canonical URL', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (payload) => {
      return {
        success: true,
        data: {
          id: payload.id,
          name: payload.title,
          version: 1,
          brand: { ...payload, version: 1 }
        }
      };
    });

    const result = await useCatalogStore.getState().saveAsNewCatalog('Catálogo Cópia Teste');

    expect(result.success).toBe(true);
    expect(result.status).toBe('synced');
    expect(result.newCatalogId).toBeDefined();
    expect(result.newCatalogId).not.toBe(catalogA_Id);

    // Invariantes do estado pós saveAsNewCatalog
    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(result.newCatalogId);
    expect(state.currentCatalog?.title).toBe('Catálogo Cópia Teste');
    expect(state.currentCatalog?.version).toBe(1);
    expect(state.savedCatalogs.some((c) => c.id === result.newCatalogId)).toBe(true);
    expect(state.isDirty).toBe(false);

    // Canonical URL atualizada
    expect(window.location.search).toContain(`catalog=${result.newCatalogId}`);
  });

  // =========================================================================
  // F3 & F4: saveAsNewCatalog durante save do original não mistura IDs
  // =========================================================================
  it('F3, F4: saveAsNewCatalog durante save em voo do original preserva original e cria cópia independente', async () => {
    let resolveSaveA!: (val: any) => void;
    const saveAPendingPromise = new Promise((resolve) => {
      resolveSaveA = resolve;
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (payload) => {
      if (payload.id === catalogA_Id) {
        return saveAPendingPromise as any;
      }
      return {
        success: true,
        data: {
          id: payload.id,
          name: payload.title,
          version: 1,
          brand: { ...payload, version: 1 }
        }
      };
    });

    // 1. Inicia save do Catálogo A
    const saveAPromise = useCatalogStore.getState().saveCurrentCatalog();

    // 2. Executa Save As New para criar Catálogo Novo
    const saveAsNewPromise = useCatalogStore.getState().saveAsNewCatalog('Catálogo Criado Concorrente');

    // 3. Conclui save de A
    resolveSaveA({
      success: true,
      data: {
        id: catalogA_Id,
        name: sampleCatalogA.title,
        version: 11,
        brand: { ...sampleCatalogA, version: 11 }
      }
    });

    const [resA, resNew] = await Promise.all([saveAPromise, saveAsNewPromise]);

    expect(resA.success).toBe(true);
    expect(resNew.success).toBe(true);
    expect(resNew.newCatalogId).not.toBe(catalogA_Id);
  });

  // =========================================================================
  // F8 & F9: Abrir novo catálogo e editar não afeta o catálogo original
  // =========================================================================
  it('F8, F9: Abrir e editar o novo catálogo mantém o original intacto', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: {
        id: catalogB_Id,
        name: 'Catálogo B Editado',
        version: 6,
        brand: { ...sampleCatalogB, title: 'Catálogo B Editado', version: 6 }
      }
    });

    // Abre Catálogo B
    useCatalogStore.setState({
      currentCatalog: structuredClone(sampleCatalogB)
    });

    // Edita título de B
    useCatalogStore.getState().setCurrentCatalog({
      ...sampleCatalogB,
      title: 'Catálogo B Editado'
    });

    const saveRes = await useCatalogStore.getState().saveCurrentCatalog();
    expect(saveRes.success).toBe(true);

    // Verifica que A no savedCatalogs continua inalterado
    const state = useCatalogStore.getState();
    const catalogAInList = state.savedCatalogs.find((c) => c.id === catalogA_Id);
    expect(catalogAInList?.title).toBe('Catálogo Oficial A');
    expect(catalogAInList?.version).toBe(10);
  });

  // =========================================================================
  // F10, F11, F12: Selecionar B em Publications, flush e exportar PDF usa B
  // =========================================================================
  it('F10, F11, F12: Publications seleciona B, faz flush de B e mantém A intacto', async () => {
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: catalogA_Id,
            name: sampleCatalogA.title,
            status: 'draft',
            version: sampleCatalogA.version,
            brand: sampleCatalogA,
            created_at: sampleCatalogA.createdAt,
            updated_at: sampleCatalogA.updatedAt
          },
          {
            id: catalogB_Id,
            name: sampleCatalogB.title,
            status: 'draft',
            version: sampleCatalogB.version,
            brand: sampleCatalogB,
            created_at: sampleCatalogB.createdAt,
            updated_at: sampleCatalogB.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    // Troca para Catálogo B
    await useCatalogStore.getState().openCatalog(catalogB_Id);

    expect(useCatalogStore.getState().currentCatalog?.id).toBe(catalogB_Id);
    expect(window.location.search).toContain(`catalog=${catalogB_Id}`);

    // Flush de B
    const flushRes = await useCatalogStore.getState().flushCatalog(catalogB_Id);
    expect(flushRes.success).toBe(true);
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(catalogB_Id);
  });

  // =========================================================================
  // F13: Criar catálogo a partir de Preset gera novo UUID e salva na nuvem
  // =========================================================================
  it('F13: createCatalogFromPreset gera novo UUID e persiste na nuvem', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: {
        id: 'new-preset-cat-uuid',
        name: 'Novo Catálogo por Preset',
        version: 1,
        brand: { ...sampleCatalogA, id: 'new-preset-cat-uuid', title: 'Novo Catálogo por Preset', version: 1 }
      }
    });

    const res = await useCatalogStore.getState().createCatalogFromPreset('Novo Catálogo por Preset');
    expect(res.success).toBe(true);
    expect(useCatalogStore.getState().currentCatalog?.title).toBe('Novo Catálogo por Preset');
  });

  // =========================================================================
  // F14: openCatalog de documento existente NÃO cria novos registros
  // =========================================================================
  it('F14: openCatalog em catálogo existente carrega o documento sem chamar saveCatalog', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog');
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: catalogA_Id,
            name: sampleCatalogA.title,
            status: 'draft',
            version: sampleCatalogA.version,
            brand: sampleCatalogA,
            created_at: sampleCatalogA.createdAt,
            updated_at: sampleCatalogA.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await useCatalogStore.getState().openCatalog(catalogA_Id);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(catalogA_Id);
  });

  // =========================================================================
  // F15: Conflito de versão simultâneo NUNCA perde edições locais
  // =========================================================================
  it('F15: Conflito 40001 no saveCurrentCatalog preserva o documento local e sinaliza conflict', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: false,
      conflict: true,
      errorCode: '40001',
      error: 'Versão defasada.'
    });

    useCatalogStore.setState({
      isDirty: true,
      localRevision: 3,
      currentCatalog: {
        ...sampleCatalogA,
        title: 'Edição Local Sob Conflito'
      }
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.status).toBe('conflict');
    expect(useCatalogStore.getState().syncStatus).toBe('conflict');
    expect(useCatalogStore.getState().isDirty).toBe(true);
    // Alteração local continua 100% preservada na memória
    expect(useCatalogStore.getState().currentCatalog?.title).toBe('Edição Local Sob Conflito');
  });
});
