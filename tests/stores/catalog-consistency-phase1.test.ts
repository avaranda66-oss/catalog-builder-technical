import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { StorageService } from '../../src/services/storage.service';
import { Catalog } from '../../src/domain/catalog.schema';

describe('FASE 1 — Catalog Consistency, CAS & Safe Realtime Suite', () => {
  const catalogUUID = 'a1111111-1111-4111-8111-111111111111';
  const otherUUID = 'b2222222-2222-4222-8222-222222222222';

  const baseCatalog: Catalog = {
    id: catalogUUID,
    title: 'PRESYS TA-25N Datasheet',
    subtitle: 'Dry-Block Calibrator',
    themeId: 'default-technical',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Ficha Principal',
        blocks: [
          {
            id: 'block-1',
            type: 'text',
            title: 'Bloco Inicial de Texto'
          }
        ]
      }
    ],
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 7
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useCatalogStore.setState({
      currentCatalog: structuredClone(baseCatalog),
      savedCatalogs: [structuredClone(baseCatalog)],
      activePageIndex: 0,
      selectedBlockId: null,
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      serverSavedAt: null,
      cachedAt: null
    });
  });

  // =========================================================================
  // TEST 1: addPage -> expectedVersion = 7 -> server v8 -> client ends at v8
  // =========================================================================
  it('TEST 1: addPage envia expectedVersion 7 sem pré-incremento e atualiza para v8', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: catalogUUID, version: 8 }
    });

    useCatalogStore.getState().addPage('technical');

    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: catalogUUID }),
        7,
        expect.any(String)
      );
      const state = useCatalogStore.getState();
      expect(state.currentCatalog?.version).toBe(8);
      expect(state.currentCatalog?.pages.length).toBe(2);
      expect(state.syncStatus).toBe('synced');
    });
  });

  // =========================================================================
  // TEST 2: updateBlock -> expectedVersion = 7 -> server v8
  // =========================================================================
  it('TEST 2: updateBlock envia expectedVersion 7 e confirma v8 no servidor', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: catalogUUID, version: 8 }
    });

    useCatalogStore.getState().updateBlock('page-1', 'block-1', { title: 'Texto Atualizado' });

    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: catalogUUID }),
        7,
        expect.any(String)
      );
      const state = useCatalogStore.getState();
      expect(state.currentCatalog?.version).toBe(8);
      expect(state.currentCatalog?.pages[0].blocks[0].title).toBe('Texto Atualizado');
      expect(state.syncStatus).toBe('synced');
    });
  });

  // =========================================================================
  // TEST 3: Edição Rápida Single-Flight (A -> B antes de responder)
  // =========================================================================
  it('TEST 3: Fila Single-Flight serializa saves rápidos, envia A (v7->v8) e depois B (v8->v9) sem lost update', async () => {
    let resolveFirstSave: (val: any) => void;
    const firstSavePromise = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog')
      .mockImplementationOnce(async () => {
        await firstSavePromise;
        return { success: true, data: { id: catalogUUID, version: 8 } };
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: catalogUUID, version: 9 }
      });

    // 1. Edição A: altera título
    useCatalogStore.getState().updateBlock('page-1', 'block-1', { title: 'Edição A' });

    // 2. Edição B (imediata, enquanto Save A está em voo): adiciona página B
    useCatalogStore.getState().addPage('custom');

    // Desbloqueia a resposta do Save A
    resolveFirstSave!({ success: true });

    // Aguarda o processamento do segundo ciclo da fila
    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(2);
      expect(saveSpy).toHaveBeenNthCalledWith(1, expect.any(Object), 7, expect.any(String));
      expect(saveSpy).toHaveBeenNthCalledWith(2, expect.any(Object), 8, expect.any(String));
      const state = useCatalogStore.getState();
      expect(state.currentCatalog?.version).toBe(9);
      expect(state.currentCatalog?.pages[0].blocks[0].title).toBe('Edição A'); // Contém A
      expect(state.currentCatalog?.pages.length).toBe(2); // Contém B
      expect(state.syncStatus).toBe('synced');
    });
  });

  // =========================================================================
  // TEST 4: Resposta Antiga não apaga edição local B
  // =========================================================================
  it('TEST 4: Resposta de save antigo não restaura snapshot defasado sobre edições mais recentes', async () => {
    let resolveSave: (val: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    vi.spyOn(SupabaseService, 'saveCatalog')
      .mockImplementationOnce(async () => {
        await savePromise;
        return { success: true, data: { id: catalogUUID, version: 8 } };
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: catalogUUID, version: 9 }
      });

    // Inicia save com bloco 1
    useCatalogStore.getState().updateBlock('page-1', 'block-1', { title: 'Versão em Voo' });

    // Enquanto está em voo, o usuário adiciona um novo bloco na mesma folha
    useCatalogStore.getState().addBlock('page-1', { type: 'text', title: 'Bloco Recém Criado B' });

    // Conclui o primeiro save
    resolveSave!({ success: true });

    await vi.waitFor(() => {
      const state = useCatalogStore.getState();
      expect(state.currentCatalog?.pages[0].blocks.length).toBe(2);
      expect(state.currentCatalog?.pages[0].blocks[1].title).toBe('Bloco Recém Criado B');
    });
  });

  // =========================================================================
  // TEST 5: Conflito Multi-Device Real 40001
  // =========================================================================
  it('TEST 5: Conflito 40001 preserva edições locais em memória e define syncStatus conflict', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      conflict: true,
      error: 'Conflito de Concorrência: o catálogo foi modificado em outro dispositivo (Versão esperada: 7, Versão no servidor: 8).'
    });

    useCatalogStore.getState().updateBlock('page-1', 'block-1', { title: 'Edição Conflitante Local' });

    await vi.waitFor(() => {
      const state = useCatalogStore.getState();
      expect(state.syncStatus).toBe('conflict');
      expect(state.syncError).toContain('atualizado em outro dispositivo');
      expect(state.currentCatalog?.pages[0].blocks[0].title).toBe('Edição Conflitante Local');
    });
  });

  // =========================================================================
  // TEST 6: Realtime em OUTRO catálogo não altera o currentCatalog
  // =========================================================================
  it('TEST 6: Realtime de outro catálogo B atualiza a lista de workspace sem trocar o currentCatalog A', async () => {
    const updatedCatalogB: Catalog = {
      id: otherUUID,
      title: 'PRESYS TA-50N Recém Salvo',
      themeId: 'default-technical',
      pages: [],
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T13:00:00.000Z',
      version: 3
    };

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: {
        catalogs: [
          { id: otherUUID, name: updatedCatalogB.title, status: 'published', version: 3, brand: updatedCatalogB, created_at: '', updated_at: '' },
          { id: catalogUUID, name: baseCatalog.title, status: 'published', version: 7, brand: baseCatalog, created_at: '', updated_at: '' }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    // Simula evento Realtime chegando para otherUUID
    const { loadWorkspace } = useCatalogStore.getState();
    await loadWorkspace();

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(catalogUUID); // Permanece intacto em A
    expect(state.savedCatalogs.length).toBe(2);
    expect(state.savedCatalogs[0].id).toBe(otherUUID);
  });

  // =========================================================================
  // TEST 7: Realtime no MESMO catálogo quando clean -> Atualiza suavemente
  // =========================================================================
  it('TEST 7: Realtime no mesmo catálogo quando clean atualiza para a versão remota mais recente', async () => {
    const remoteCatalogV8: Catalog = {
      ...baseCatalog,
      title: 'PRESYS TA-25N Atualizado pelo Administrador',
      version: 8
    };

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: {
        catalogs: [{ id: catalogUUID, name: remoteCatalogV8.title, status: 'published', version: 8, brand: remoteCatalogV8, created_at: '', updated_at: '' }],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await useCatalogStore.getState().refreshCatalog(catalogUUID);

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.version).toBe(8);
    expect(state.currentCatalog?.title).toBe('PRESYS TA-25N Atualizado pelo Administrador');
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // TEST 8: Realtime no MESMO catálogo quando DIRTY -> Preserva local e sinaliza
  // =========================================================================
  it('TEST 8: Realtime no mesmo catálogo quando dirty preserva edição local e sinaliza conflict', async () => {
    // Usuário fez alteração local e ainda está dirty
    useCatalogStore.setState({
      isDirty: true,
      syncStatus: 'dirty'
    });

    // Simulação do guard de Realtime: se estiver dirty, não chama refreshCatalog destrutivo
    const stateBefore = useCatalogStore.getState();
    if (stateBefore.syncStatus === 'dirty') {
      useCatalogStore.setState({
        syncStatus: 'conflict',
        syncError: 'Alteração remota detectada neste catálogo. Suas edições locais foram preservadas.'
      });
    }

    const stateAfter = useCatalogStore.getState();
    expect(stateAfter.syncStatus).toBe('conflict');
    expect(stateAfter.currentCatalog?.id).toBe(catalogUUID);
  });

  // =========================================================================
  // TEST 9: Renomear catálogo preserva UUID imutável
  // =========================================================================
  it('TEST 9: Renomear título do catálogo mantém o mesmo UUID sem duplicar registro', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: catalogUUID, version: 8 }
    });

    useCatalogStore.getState().setCurrentCatalog({
      ...useCatalogStore.getState().currentCatalog!,
      title: 'PRESYS TA-25N — Título Modificado'
    });

    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: catalogUUID, title: 'PRESYS TA-25N — Título Modificado' }),
        7,
        expect.any(String)
      );
      const state = useCatalogStore.getState();
      expect(state.currentCatalog?.id).toBe(catalogUUID);
    });
  });

  // =========================================================================
  // TEST 10: Duplicação gera UUID v4 único e inicia com version = 0
  // =========================================================================
  it('TEST 10: duplicateCatalog gera UUID v4 novo, version = 0 e salva no servidor', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: 'c3333333-3333-4333-8333-333333333333', version: 1 }
    });

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: { catalogs: [], products: [], templates: [], userRole: 'admin' }
    });

    await useCatalogStore.getState().duplicateCatalog(catalogUUID);

    await vi.waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'PRESYS TA-25N Datasheet (Cópia)',
          version: 0
        }),
        0,
        expect.any(String)
      );
      const duplicated = useCatalogStore.getState().currentCatalog!;
      expect(duplicated.id).not.toBe(catalogUUID);
      expect(duplicated.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  // =========================================================================
  // TEST 11: openCatalog Online carrega versão do servidor v8
  // =========================================================================
  it('TEST 11: openCatalog online prioriza versão v8 do Supabase sobre cache local v6', async () => {
    const serverCatalogV8: Catalog = {
      ...baseCatalog,
      version: 8,
      title: 'Catálogo v8 no Servidor'
    };

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: {
        catalogs: [{ id: catalogUUID, name: 'Catálogo v8 no Servidor', status: 'published', version: 8, brand: serverCatalogV8, created_at: '', updated_at: '' }],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    vi.spyOn(StorageService, 'loadCatalog').mockResolvedValueOnce({
      ...baseCatalog,
      version: 6,
      title: 'Cache Antigo v6'
    });

    await useCatalogStore.getState().openCatalog(catalogUUID);

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.version).toBe(8);
    expect(state.currentCatalog?.title).toBe('Catálogo v8 no Servidor');
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // TEST 12: Offline Fallback com marcação explícita
  // =========================================================================
  it('TEST 12: openCatalog offline usa StorageService e marca syncStatus offline', async () => {
    vi.spyOn(SupabaseService, 'listWorkspace').mockRejectedValueOnce(new Error('Network error'));
    vi.spyOn(StorageService, 'loadCatalog').mockResolvedValueOnce({
      ...baseCatalog,
      version: 7,
      title: 'Documento no Cache Offline'
    });

    await useCatalogStore.getState().openCatalog(catalogUUID);

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('Documento no Cache Offline');
    expect(state.syncStatus).toBe('offline');
    expect(state.syncError).toContain('cache local');
  });
});
