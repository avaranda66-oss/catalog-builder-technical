import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { StorageService } from '../../src/services/storage.service';
import { handleCatalogRealtimeEvent } from '../../src/services/realtime.service';
import { Catalog, generateUniqueCatalogTitle } from '../../src/domain/catalog.schema';

describe('FASE 1 & 1.1 — Catalog Consistency, Hardening & Safe Realtime Suite', () => {
  const catalogUUID = 'a1111111-1111-4111-8111-111111111111';
  const otherUUID = 'b2222222-2222-4222-8222-222222222222';
  const thirdUUID = 'c3333333-3333-4333-8333-333333333333';

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
    StorageService.setActiveCatalogId(catalogUUID);
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
      cachedAt: null,
      inFlightSave: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
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
      expect(state.currentCatalog?.pages[0].blocks[0].title).toBe('Edição A');
      expect(state.currentCatalog?.pages.length).toBe(2);
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
      errorCode: '40001',
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

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: otherUUID, version: 3, name: updatedCatalogB.title }
    });

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(catalogUUID);
    expect(state.savedCatalogs.length).toBe(2);
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

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [{ id: catalogUUID, name: remoteCatalogV8.title, status: 'published', version: 8, brand: remoteCatalogV8, created_at: '', updated_at: '' }],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: catalogUUID,
        version: 8,
        name: remoteCatalogV8.title,
        brand: remoteCatalogV8
      }
    });

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.version).toBe(8);
    expect(state.currentCatalog?.title).toBe('PRESYS TA-25N Atualizado pelo Administrador');
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // TEST 8: Realtime no MESMO catálogo quando DIRTY -> Preserva local e sinaliza
  // =========================================================================
  it('TEST 8: Realtime no mesmo catálogo quando dirty preserva edição local e sinaliza conflict', async () => {
    useCatalogStore.setState({
      isDirty: true,
      syncStatus: 'dirty'
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogUUID, version: 8, name: 'Versão Remota Inesperada' }
    });

    const state = useCatalogStore.getState();
    expect(state.syncStatus).toBe('conflict');
    expect(state.currentCatalog?.id).toBe(catalogUUID);
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
    void useCatalogStore.getState().saveCurrentCatalog();

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

  // =========================================================================
  // TEST 13: PresetModal cria catálogo: save RPC exatamente 1 vez, version = 1
  // =========================================================================
  it('TEST 13: createCatalogFromPreset chama save_catalog_v3 exatamente 1 vez e termina na versão 1', async () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: true,
      data: { id: 'd4444444-4444-4444-8444-444444444444', version: 1 }
    });

    const result = await useCatalogStore.getState().createCatalogFromPreset('Catálogo Criado via Preset');

    expect(result.success).toBe(true);
    expect(result.status).toBe('synced');
    expect(result.version).toBe(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith(expect.any(Object), 0, expect.any(String));
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(1);
  });

  // =========================================================================
  // TEST 14: Salvar Como Novo: não mostra sucesso antes do RPC resolver
  // =========================================================================
  it('TEST 14: saveCurrentCatalog retorna SaveResult explícito apenas após resposta do servidor', async () => {
    let resolveRPC: (val: any) => void;
    const rpcPromise = new Promise((resolve) => {
      resolveRPC = resolve;
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementationOnce(async () => {
      await rpcPromise;
      return { success: true, data: { id: catalogUUID, version: 8 } };
    });

    const savePromise = useCatalogStore.getState().saveCurrentCatalog();
    expect(useCatalogStore.getState().syncStatus).toBe('saving');

    resolveRPC!({ success: true });
    const result = await savePromise;

    expect(result.success).toBe(true);
    expect(result.status).toBe('synced');
    expect(result.version).toBe(8);
  });

  // =========================================================================
  // TEST 15: Salvar Como Novo com RPC falhando: retorna erro e não alega sucesso
  // =========================================================================
  it('TEST 15: saveCurrentCatalog com falha remota retorna success: false e status de erro', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      errorCode: '500',
      error: 'Erro interno no banco'
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.success).toBe(false);
    expect(result.status).toBe('error');
    expect(useCatalogStore.getState().syncStatus).toBe('error');
  });

  // =========================================================================
  // TEST 16: loadWorkspace faz cache de B/C/A: cb_active_catalog_id não muda
  // =========================================================================
  it('TEST 16: loadWorkspace atualiza cache de múltiplos documentos sem alterar cb_active_catalog_id', async () => {
    StorageService.setActiveCatalogId(catalogUUID);

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: {
        catalogs: [
          { id: otherUUID, name: 'Catálogo B', status: 'published', version: 1, brand: {}, created_at: '', updated_at: '' },
          { id: thirdUUID, name: 'Catálogo C', status: 'published', version: 1, brand: {}, created_at: '', updated_at: '' },
          { id: catalogUUID, name: 'Catálogo A', status: 'published', version: 7, brand: baseCatalog, created_at: '', updated_at: '' }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await useCatalogStore.getState().loadWorkspace();

    expect(StorageService.getActiveCatalogId()).toBe(catalogUUID);
  });

  // =========================================================================
  // TEST 17: self realtime echo durante save: não vira conflict
  // =========================================================================
  it('TEST 17: self realtime echo durante save em voo (v7 -> v8) não cria falso conflito', async () => {
    useCatalogStore.setState({
      inFlightSave: {
        catalogId: catalogUUID,
        expectedVersion: 7,
        targetVersion: 8,
        capturedRevision: 0
      },
      isSaving: true,
      syncStatus: 'saving'
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogUUID, version: 8, name: baseCatalog.title }
    });

    const state = useCatalogStore.getState();
    expect(state.syncStatus).toBe('saving'); // Permanece no fluxo normal de saving sem virar conflict
  });

  // =========================================================================
  // TEST 18: self realtime echo com versão confirmada não vira conflict
  // =========================================================================
  it('TEST 18: self realtime echo com versão já confirmada no cliente (v8) é ignorado sem conflito', async () => {
    useCatalogStore.setState({
      currentCatalog: { ...baseCatalog, version: 8 },
      syncStatus: 'synced',
      isDirty: false
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogUUID, version: 8, name: baseCatalog.title }
    });

    const state = useCatalogStore.getState();
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // TEST 19: realtime remoto inesperado dirty vira conflict
  // =========================================================================
  it('TEST 19: realtime remoto com versão 9 quando cliente está em v7 dirty gera conflito real', async () => {
    useCatalogStore.setState({
      currentCatalog: { ...baseCatalog, version: 7 },
      isDirty: true,
      syncStatus: 'dirty'
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogUUID, version: 9, name: 'Versão Modificada por Outro' }
    });

    const state = useCatalogStore.getState();
    expect(state.syncStatus).toBe('conflict');
    expect(state.syncError).toContain('atualizado em outro dispositivo');
  });

  // =========================================================================
  // TEST 20: realtime stale/duplicado é ignorado
  // =========================================================================
  it('TEST 20: evento realtime com versão antiga (v6) quando cliente está em v7 é descartado', async () => {
    const refreshSpy = vi.spyOn(useCatalogStore.getState(), 'refreshCatalog');

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: { id: catalogUUID, version: 6, name: 'Versão Velha' }
    });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // TEST 21: 23505 vira syncStatus='error', NÃO 'offline'
  // =========================================================================
  it('TEST 21: erro de título duplicado 23505 define syncStatus error (e não offline)', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      errorCode: '23505',
      error: 'duplicate key value violates unique constraint "catalogs_name_idx"'
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('23505');
    expect(useCatalogStore.getState().syncStatus).toBe('error');
    expect(useCatalogStore.getState().syncError).toContain('Já existe um catálogo com este título');
  });

  // =========================================================================
  // TEST 22: 42501 vira syncStatus='error', NÃO 'offline'
  // =========================================================================
  it('TEST 22: erro de permissão negada 42501 define syncStatus error (e não offline)', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      errorCode: '42501',
      error: 'permission denied for function save_catalog_v3'
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('42501');
    expect(useCatalogStore.getState().syncStatus).toBe('error');
    expect(useCatalogStore.getState().syncError).toContain('Permissão negada');
  });

  // =========================================================================
  // TEST 23: network failure vira syncStatus='offline'
  // =========================================================================
  it('TEST 23: falha genuína de rede define syncStatus offline', async () => {
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValueOnce({
      success: false,
      errorCode: 'NETWORK_ERROR',
      error: 'Failed to fetch'
    });

    const result = await useCatalogStore.getState().saveCurrentCatalog();

    expect(result.status).toBe('offline');
    expect(result.errorCode).toBe('NETWORK_ERROR');
    expect(useCatalogStore.getState().syncStatus).toBe('offline');
    expect(useCatalogStore.getState().syncError).toContain('modo offline');
  });

  // =========================================================================
  // TEST 24: duas duplicações geram nomes únicos e UUIDs distintos
  // =========================================================================
  it('TEST 24: generateUniqueCatalogTitle e duplicateCatalog produzem nomes e UUIDs únicos sem colisão', async () => {
    const existingTitles = ['PRESYS TA-25N', 'PRESYS TA-25N (Cópia)'];
    const title1 = generateUniqueCatalogTitle('PRESYS TA-25N', ['PRESYS TA-25N']);
    const title2 = generateUniqueCatalogTitle('PRESYS TA-25N', existingTitles);

    expect(title1).toBe('PRESYS TA-25N (Cópia)');
    expect(title2).toBe('PRESYS TA-25N (Cópia 2)');

    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { id: 'dup-1', version: 1 }
    });

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          { id: catalogUUID, name: baseCatalog.title, status: 'published', version: 7, brand: baseCatalog, created_at: '', updated_at: '' },
          { id: 'dup-1', name: 'PRESYS TA-25N Datasheet (Cópia)', status: 'published', version: 1, brand: {}, created_at: '', updated_at: '' }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await useCatalogStore.getState().duplicateCatalog(catalogUUID);
    const firstDup = useCatalogStore.getState().currentCatalog!;
    expect(firstDup.title).toBe('PRESYS TA-25N Datasheet (Cópia)');

    await useCatalogStore.getState().duplicateCatalog(catalogUUID);
    const secondDup = useCatalogStore.getState().currentCatalog!;
    expect(secondDup.title).toBe('PRESYS TA-25N Datasheet (Cópia 2)');
    expect(firstDup.id).not.toBe(secondDup.id);
  });

  // =========================================================================
  // TEST 25: workspace remoto vazio e online não restaura cache antigo
  // =========================================================================
  it('TEST 25: workspace remoto online vazio cria novo catálogo sem restaurar cache obsoleto', async () => {
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValueOnce({
      success: true,
      data: {
        catalogs: [],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    vi.spyOn(StorageService, 'loadCatalog').mockResolvedValueOnce({
      ...baseCatalog,
      title: 'Catálogo Obsoleto no Cache'
    });

    const createSpy = vi.spyOn(useCatalogStore.getState(), 'createCatalogFromPreset');

    await useCatalogStore.getState().loadLatestCatalog();

    expect(createSpy).toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.title).not.toBe('Catálogo Obsoleto no Cache');
  });

  // =========================================================================
  // TEST 26: Proteção contra Stale Snapshot Restore (A 4ª página nunca é perdida)
  // =========================================================================
  it('TEST 26: Adição de página local (3 -> 4) nunca é revertida por snapshot remoto defasado de 3 páginas', async () => {
    const threePageCatalog: Catalog = {
      ...baseCatalog,
      version: 10,
      pages: [
        { id: 'p1', pageNumber: 1, pageType: 'cover', title: 'Pág 1', blocks: [] },
        { id: 'p2', pageNumber: 2, pageType: 'technical', title: 'Pág 2', blocks: [] },
        { id: 'p3', pageNumber: 3, pageType: 'technical', title: 'Pág 3', blocks: [] }
      ]
    };

    useCatalogStore.setState({
      currentCatalog: structuredClone(threePageCatalog),
      savedCatalogs: [structuredClone(threePageCatalog)],
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0,
      isDirty: false,
      syncStatus: 'synced'
    });

    // Mock do save inicial que atrasa a resposta
    let resolveSave: (val: any) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementationOnce(async () => {
      await savePromise;
      return { success: true, data: { id: catalogUUID, version: 11 } };
    });

    // 1. Usuário adiciona a Folha 4
    useCatalogStore.getState().addPage('technical');

    const stateAfterAdd = useCatalogStore.getState();
    expect(stateAfterAdd.currentCatalog?.pages.length).toBe(4);
    expect(stateAfterAdd.localRevision).toBe(1);
    expect(stateAfterAdd.isDirty).toBe(true);

    // 2. Simula evento Realtime / Snapshot antigo do servidor (v10 com apenas 3 páginas) chegando enquanto a 4ª página está ativa
    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: catalogUUID,
        version: 10, // Versão antiga
        name: threePageCatalog.title,
        brand: {
          title: threePageCatalog.title,
          pages: threePageCatalog.pages // Apenas 3 páginas
        }
      }
    });

    // Verifica que o Realtime NÃO sobrescreveu a 4ª página
    expect(useCatalogStore.getState().currentCatalog?.pages.length).toBe(4);

    // 3. Simula chamada assíncrona a refreshCatalog com snapshot de 3 páginas
    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: catalogUUID,
            name: threePageCatalog.title,
            status: 'published',
            version: 10,
            brand: threePageCatalog,
            created_at: '',
            updated_at: ''
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await useCatalogStore.getState().refreshCatalog(catalogUUID);

    // Proteção de segurança: refreshCatalog DEVE ser bloqueado e a 4ª página DEVE continuar intacta
    expect(useCatalogStore.getState().currentCatalog?.pages.length).toBe(4);

    // 4. Conclui o salvamento legítimo no servidor
    resolveSave!({ success: true });

    await vi.waitFor(() => {
      const finalState = useCatalogStore.getState();
      expect(finalState.currentCatalog?.pages.length).toBe(4); // Folha 4 PRESERVADA
      expect(finalState.currentCatalog?.version).toBe(11);
      expect(finalState.syncStatus).toBe('synced');
    });
  });
});
