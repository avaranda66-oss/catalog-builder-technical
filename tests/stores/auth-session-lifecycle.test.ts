import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService, getSupabase } from '../../src/services/supabase.service';
import { Catalog } from '../../src/domain/catalog.schema';

describe('P0.2B — Auth Token Refresh, Channel Lifecycle & Account Isolation Suite', () => {
  const userA_Id = 'usr-11111111-1111-4111-8111-111111111111';
  const userB_Id = 'usr-22222222-2222-4222-8222-222222222222';
  const testCatalogId = 'cat-ta25n-1111-4111-8111-111111111111';

  const sampleCatalog: Catalog = {
    id: testCatalogId,
    title: 'PRESYS TA-25N — Edição Ativa',
    subtitle: 'Calibrador de Bloco Seco',
    themeId: 'default-technical',
    pages: [
      {
        id: 'p1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Capa e Resumo',
        blocks: [{ id: 'b1', type: 'text', title: 'Bloco Ativo' }]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 12
  };

  let capturedAuthCallback: ((event: string, session: any) => Promise<void> | void) | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).location;
    window.location = new URL('http://localhost:5173/') as any;
    localStorage.clear();
    sessionStorage.clear();
    capturedAuthCallback = null;

    useAuthStore.setState({
      status: 'authenticated',
      userId: userA_Id,
      role: 'admin',
      email: 'admin@presys.com.br',
      errorMessage: null
    });

    useCatalogStore.setState({
      currentCatalog: structuredClone(sampleCatalog),
      savedCatalogs: [structuredClone(sampleCatalog)],
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

  // Helper para inicializar useAuthStore e capturar o callback real do onAuthStateChange
  const setupRealAuthListener = async () => {
    const supabase = getSupabase();
    expect(supabase).not.toBeNull();

    if (!(supabase as any).removeChannel) {
      (supabase as any).removeChannel = vi.fn();
    }
    if (!(supabase as any).channel) {
      (supabase as any).channel = vi.fn().mockReturnValue({
        on: () => ({ on: () => ({ on: () => ({ subscribe: vi.fn() }) }) }),
        subscribe: vi.fn()
      });
    }

    const mockSubscription = { unsubscribe: vi.fn() };
    const onAuthSpy = vi.spyOn(supabase!.auth, 'onAuthStateChange').mockImplementation((cb: any) => {
      capturedAuthCallback = cb;
      return { data: { subscription: mockSubscription } } as any;
    });

    vi.spyOn(supabase!.auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          user: { id: userA_Id, email: 'admin@presys.com.br' },
          expires_at: 9999999999
        } as any
      },
      error: null
    });

    // Mock do profile
    vi.spyOn(supabase!, 'from').mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: userA_Id, role: 'admin', is_active: true },
                error: null
              })
            })
          })
        } as any;
      }
      return {} as any;
    });

    await useAuthStore.getState().initialize();
    expect(onAuthSpy).toHaveBeenCalledTimes(1);
    expect(capturedAuthCallback).not.toBeNull();
    return capturedAuthCallback!;
  };

  // =========================================================================
  // AUTH-11: Callback TOKEN_REFRESHED real mockado => status NUNCA passa por loading
  // =========================================================================
  it('AUTH-11: Callback TOKEN_REFRESHED real NÃO altera status para loading nem causa desmonte', async () => {
    const callback = await setupRealAuthListener();

    const statusHistory: string[] = [];
    const unsub = useAuthStore.subscribe((state) => {
      statusHistory.push(state.status);
    });

    // Dispara TOKEN_REFRESHED via callback real
    await callback('TOKEN_REFRESHED', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.userId).toBe(userA_Id);
    expect(state.role).toBe('admin');
    // Em nenhum momento passou por 'loading'
    expect(statusHistory.filter((s) => s === 'loading').length).toBe(0);
    unsub();
  });

  // =========================================================================
  // AUTH-12: TOKEN_REFRESHED real preserva catálogo X intacto
  // =========================================================================
  it('AUTH-12: TOKEN_REFRESHED real preserva catálogo, versão, páginas e blocos', async () => {
    const callback = await setupRealAuthListener();

    await callback('TOKEN_REFRESHED', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    const catalog = useCatalogStore.getState().currentCatalog;
    expect(catalog?.id).toBe(testCatalogId);
    expect(catalog?.title).toBe('PRESYS TA-25N — Edição Ativa');
    expect(catalog?.version).toBe(12);
    expect(catalog?.pages[0].blocks[0].id).toBe('b1');
    expect(useCatalogStore.getState().selectedBlockId).toBe('b1');
  });

  // =========================================================================
  // AUTH-13: TOKEN_REFRESHED real dirty preserva edição local e localRevision
  // =========================================================================
  it('AUTH-13: TOKEN_REFRESHED real durante edição suja preserva isDirty, localRevision e edições', async () => {
    const callback = await setupRealAuthListener();

    useCatalogStore.setState({
      isDirty: true,
      localRevision: 9,
      currentCatalog: {
        ...sampleCatalog,
        title: 'Edição Local em Andamento'
      }
    });

    await callback('TOKEN_REFRESHED', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    const catalogState = useCatalogStore.getState();
    expect(catalogState.isDirty).toBe(true);
    expect(catalogState.localRevision).toBe(9);
    expect(catalogState.currentCatalog?.title).toBe('Edição Local em Andamento');
  });

  // =========================================================================
  // AUTH-14: TOKEN_REFRESHED não recria nem remove channel Realtime
  // =========================================================================
  it('AUTH-14: TOKEN_REFRESHED não chama removeChannel nem recria subscription', async () => {
    const supabase = getSupabase();
    expect(supabase).not.toBeNull();

    const removeChannelSpy = vi.spyOn(supabase!, 'removeChannel');
    const channelSpy = vi.spyOn(supabase!, 'channel');

    const callback = await setupRealAuthListener();

    // Limpa contadores após inicialização
    removeChannelSpy.mockClear();
    channelSpy.mockClear();

    await callback('TOKEN_REFRESHED', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    expect(removeChannelSpy).not.toHaveBeenCalled();
    expect(channelSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // AUTH-15: SIGNED_OUT limpa workspace em memória (Account Isolation)
  // =========================================================================
  it('AUTH-15: SIGNED_OUT limpa currentCatalog e savedCatalogs da memória', async () => {
    const callback = await setupRealAuthListener();

    await callback('SIGNED_OUT', null);

    const authState = useAuthStore.getState();
    expect(authState.status).toBe('unauthenticated');
    expect(authState.userId).toBeNull();
    expect(authState.email).toBeNull();

    const catalogState = useCatalogStore.getState();
    expect(catalogState.currentCatalog).toBeNull();
    expect(catalogState.savedCatalogs.length).toBe(0);
    expect(catalogState.isDirty).toBe(false);
  });

  // =========================================================================
  // AUTH-16: A logout -> B login => B NUNCA vê catálogo de A
  // =========================================================================
  it('AUTH-16: Usuário A faz logout e Usuário B faz login => B nunca recebe o catálogo de A', async () => {
    const callback = await setupRealAuthListener();

    // 1. User A está logado e com TA-25N aberto
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(testCatalogId);

    // 2. User A faz logout
    await callback('SIGNED_OUT', null);
    expect(useCatalogStore.getState().currentCatalog).toBeNull();

    // 3. Mock do workspace do User B
    const catalogB: Catalog = {
      ...sampleCatalog,
      id: 'cat-user-b-uuid',
      title: 'Catálogo Oficial do Usuário B'
    };

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: 'cat-user-b-uuid',
            name: catalogB.title,
            status: 'draft',
            version: 1,
            brand: catalogB,
            created_at: catalogB.createdAt,
            updated_at: catalogB.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'editor'
      }
    });

    // 4. User B faz login
    await callback('SIGNED_IN', {
      user: { id: userB_Id, email: 'userb@presys.com.br' },
      expires_at: 9999999999
    });

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().userId).toBe(userB_Id);

    // 5. Bootstrap do User B
    await useCatalogStore.getState().loadLatestCatalog();

    const finalCatalog = useCatalogStore.getState().currentCatalog;
    expect(finalCatalog?.id).toBe('cat-user-b-uuid');
    expect(finalCatalog?.title).toBe('Catálogo Oficial do Usuário B');
    expect(finalCatalog?.id).not.toBe(testCatalogId);
  });

  // =========================================================================
  // AUTH-17: A logout -> A login => novo bootstrap remoto executado
  // =========================================================================
  it('AUTH-17: Usuário A faz logout e depois login novamente => executa novo bootstrap limpo', async () => {
    const callback = await setupRealAuthListener();

    // Logout
    await callback('SIGNED_OUT', null);
    expect(useCatalogStore.getState().currentCatalog).toBeNull();

    // Login novamente
    const listSpy = vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: testCatalogId,
            name: sampleCatalog.title,
            status: 'draft',
            version: 1,
            brand: sampleCatalog,
            created_at: sampleCatalog.createdAt,
            updated_at: sampleCatalog.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    await callback('SIGNED_IN', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    await useCatalogStore.getState().loadLatestCatalog();
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(testCatalogId);
  });

  // =========================================================================
  // AUTH-18: SIGNED_IN duplicado para o mesmo usuário => ZERO reset
  // =========================================================================
  it('AUTH-18: Evento SIGNED_IN duplicado para o mesmo usuário já logado não reseta workspace', async () => {
    const callback = await setupRealAuthListener();

    const resetSpy = vi.spyOn(useCatalogStore.getState(), 'resetWorkspaceForIdentityChange');

    // Emite SIGNED_IN duplicado com o mesmo userA_Id
    await callback('SIGNED_IN', {
      user: { id: userA_Id, email: 'admin@presys.com.br' },
      expires_at: 9999999999
    });

    expect(resetSpy).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(testCatalogId);
  });

  // =========================================================================
  // AUTH-19: Troca direta A -> B limpa workspace antes do bootstrap
  // =========================================================================
  it('AUTH-19: Transição direta de usuário A para B via SIGNED_IN limpa workspace de A', async () => {
    const callback = await setupRealAuthListener();

    const resetSpy = vi.spyOn(useCatalogStore.getState(), 'resetWorkspaceForIdentityChange');

    // Emite SIGNED_IN direto com userB_Id
    await callback('SIGNED_IN', {
      user: { id: userB_Id, email: 'userb@presys.com.br' },
      expires_at: 9999999999
    });

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().userId).toBe(userB_Id);
  });
});
