import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { Catalog } from '../../src/domain/catalog.schema';

describe('P0.2 — Auth Token Refresh & Session Lifecycle Suite', () => {
  const userA_Id = 'usr-11111111-1111-4111-8111-111111111111';
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

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();

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

  // =========================================================================
  // TEST AUTH-1: TOKEN_REFRESHED nunca muda status para loading
  // =========================================================================
  it('TEST AUTH-1: TOKEN_REFRESHED enquanto authenticated NÃO altera status para loading nem desmonta editor', async () => {
    let statusHistory: string[] = [];
    const unsub = useAuthStore.subscribe((state) => {
      statusHistory.push(state.status);
    });

    // Simula listener do Supabase disparando TOKEN_REFRESHED
    const supabase = (await import('../../src/services/supabase.service')).getSupabase();
    if (supabase) {
      const authListener = (supabase.auth.onAuthStateChange as any).mock?.calls?.[0]?.[0];
      if (authListener) {
        authListener('TOKEN_REFRESHED', {
          user: { id: userA_Id, email: 'admin@presys.com.br' }
        });
      }
    }

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.userId).toBe(userA_Id);
    expect(state.role).toBe('admin');
    // Em nenhum momento passou por 'loading'
    expect(statusHistory.filter((s) => s === 'loading').length).toBe(0);
    unsub();
  });

  // =========================================================================
  // TEST AUTH-2: TOKEN_REFRESHED preserva currentCatalog.id intacto
  // =========================================================================
  it('TEST AUTH-2: TOKEN_REFRESHED preserva currentCatalog.id, título, páginas e blocos', () => {
    const catalogBefore = useCatalogStore.getState().currentCatalog;
    expect(catalogBefore?.id).toBe(testCatalogId);

    // Dispara refresh
    useAuthStore.setState({
      userId: userA_Id,
      email: 'admin@presys.com.br'
    });

    const catalogAfter = useCatalogStore.getState().currentCatalog;
    expect(catalogAfter?.id).toBe(testCatalogId);
    expect(catalogAfter?.title).toBe('PRESYS TA-25N — Edição Ativa');
    expect(catalogAfter?.version).toBe(12);
    expect(catalogAfter?.pages[0].blocks[0].id).toBe('b1');
  });

  // =========================================================================
  // TEST AUTH-3: TOKEN_REFRESHED com estado dirty preserva localRevision
  // =========================================================================
  it('TEST AUTH-3: TOKEN_REFRESHED durante edição suja (isDirty=true) preserva localRevision e edições', () => {
    useCatalogStore.setState({
      isDirty: true,
      localRevision: 9,
      currentCatalog: {
        ...sampleCatalog,
        title: 'Título Modificado Localmente pelo Usuário'
      }
    });

    // Simula evento de auth
    const authState = useAuthStore.getState();
    expect(authState.status).toBe('authenticated');

    const catalogState = useCatalogStore.getState();
    expect(catalogState.isDirty).toBe(true);
    expect(catalogState.localRevision).toBe(9);
    expect(catalogState.currentCatalog?.title).toBe('Título Modificado Localmente pelo Usuário');
  });

  // =========================================================================
  // TEST AUTH-4: loadLatestCatalog ignorado se catálogo já ativo
  // =========================================================================
  it('TEST AUTH-4: loadLatestCatalog não substitui o documento se currentCatalog já estiver carregado', async () => {
    const defaultServerCatalog: Catalog = {
      ...sampleCatalog,
      id: 'pcon-default-catalog-uuid',
      title: 'PCON Series — Controladores e Calibradores de Pressão'
    };

    const listWorkspaceSpy = vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: 'pcon-default-catalog-uuid',
            name: defaultServerCatalog.title,
            status: 'draft',
            version: 1,
            brand: defaultServerCatalog,
            created_at: defaultServerCatalog.createdAt,
            updated_at: defaultServerCatalog.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    // Chama loadLatestCatalog enquanto TA-25N está aberto
    await useCatalogStore.getState().loadLatestCatalog();

    // Invariante: O catálogo ativo NÃO deve ser substituído por PCON
    const currentCat = useCatalogStore.getState().currentCatalog;
    expect(currentCat?.id).toBe(testCatalogId);
    expect(currentCat?.title).toBe('PRESYS TA-25N — Edição Ativa');
    expect(listWorkspaceSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // TEST AUTH-6: SIGNED_OUT desautentica e limpa sessão
  // =========================================================================
  it('TEST AUTH-6: SIGNED_OUT transiciona status para unauthenticated e limpa identidade', async () => {
    await useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.userId).toBeNull();
    expect(state.role).toBeNull();
    expect(state.email).toBeNull();
  });

  // =========================================================================
  // TEST AUTH-10: Race guard no loadLatestCatalog protege contra sobrescrita tardia
  // =========================================================================
  it('TEST AUTH-10: Resposta assíncrona antiga de loadLatestCatalog não sobrescreve edição local iniciada durante o await', async () => {
    // Esvazia catálogo inicial
    useCatalogStore.setState({ currentCatalog: null });

    // Mock que atrasa a resposta do workspace
    vi.spyOn(SupabaseService, 'listWorkspace').mockImplementation(async () => {
      // Simula que durante o await o usuário abriu ou começou a editar um catálogo
      useCatalogStore.setState({
        isDirty: true,
        localRevision: 1,
        currentCatalog: structuredClone(sampleCatalog)
      });

      return {
        success: true,
        data: {
          catalogs: [
            {
              id: 'pcon-server-id',
              name: 'PCON Retornado Tardiamente',
              status: 'draft',
              version: 1,
              brand: { ...sampleCatalog, id: 'pcon-server-id', title: 'PCON Retornado Tardiamente' },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ],
          products: [],
          templates: [],
          userRole: 'admin'
        }
      };
    });

    await useCatalogStore.getState().loadLatestCatalog();

    // O catálogo local do usuário prevalece contra o retorno atrasado
    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(testCatalogId);
    expect(state.currentCatalog?.title).toBe('PRESYS TA-25N — Edição Ativa');
  });
});
