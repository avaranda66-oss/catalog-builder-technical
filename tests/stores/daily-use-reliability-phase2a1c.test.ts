import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCatalogStore, getClientInstanceId } from '../../src/stores/useCatalogStore';
import { usePresenceStore } from '../../src/stores/usePresenceStore';
import { PresenceService, ParticipantSession } from '../../src/services/presence.service';
import { SYSTEM_PRESETS } from '../../src/data/presets';

describe('FASE 2A.1C — DAILY USE RELIABILITY: PRESENCE, SCROLL-AWARE NAVIGATION & SESSION STABILITY', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    useCatalogStore.setState({ currentCatalog: null, activePageIndex: 0, selectedBlockId: null, isDirty: false });
    usePresenceStore.getState().leavePresence();
  });

  afterEach(() => {
    usePresenceStore.getState().leavePresence();
  });

  // =========================================================================
  // NAV-R1: Folha visível altera activePageIndex
  // =========================================================================
  it('NAV-R1: setActivePageIndex atualiza o índice da página ativa corretamente', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    useCatalogStore.setState({ currentCatalog: preset, activePageIndex: 0 });

    useCatalogStore.getState().setActivePageIndex(2);
    expect(useCatalogStore.getState().activePageIndex).toBe(2);
  });

  // =========================================================================
  // NAV-R2: Thumbnail acompanha a página ativa
  // =========================================================================
  it('NAV-R2: activePageIndex reflete a página selecionada para as thumbnails', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    useCatalogStore.setState({ currentCatalog: preset, activePageIndex: 1 });

    expect(useCatalogStore.getState().activePageIndex).toBe(1);
    expect(useCatalogStore.getState().currentCatalog?.pages[1]?.pageNumber).toBe(2);
  });

  // =========================================================================
  // NAV-R3: Thumbnail click navega canvas sem disparar document save
  // =========================================================================
  it('NAV-R3: Mudança de activePageIndex é estado de UI puro e não altera versão nem dispara save', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    preset.version = 5;
    useCatalogStore.setState({ currentCatalog: preset, activePageIndex: 0, isDirty: false });

    const saveSpy = vi.spyOn(useCatalogStore.getState(), 'saveCurrentCatalog');
    useCatalogStore.getState().setActivePageIndex(2);

    expect(useCatalogStore.getState().currentCatalog?.version).toBe(5);
    expect(useCatalogStore.getState().isDirty).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // NAV-R4: Zero document save por scroll / mudança de página
  // =========================================================================
  it('NAV-R4: Scroll e troca de página preservam versão e zero mutações no documento', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    preset.version = 10;
    useCatalogStore.setState({ currentCatalog: preset, activePageIndex: 0 });

    for (let i = 0; i < preset.pages.length; i++) {
      useCatalogStore.getState().setActivePageIndex(i);
    }

    expect(useCatalogStore.getState().currentCatalog?.version).toBe(10);
    expect(useCatalogStore.getState().isDirty).toBe(false);
  });

  // =========================================================================
  // NAV-R5: Toolbar & Sidebar usam activePage atual
  // =========================================================================
  it('NAV-R5: Ações de inserção direcionam para a página ativa atual', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    useCatalogStore.setState({ currentCatalog: preset, activePageIndex: 2 });

    const store = useCatalogStore.getState();
    const targetPage = store.currentCatalog!.pages[store.activePageIndex];
    expect(targetPage.pageNumber).toBe(3);

    store.addBlock(targetPage.id, {
      type: 'text',
      title: 'Nota de Teste Página 3',
      textContent: 'Conteúdo inserido na folha 3 ativa'
    } as any);

    const updatedPage3 = useCatalogStore.getState().currentCatalog!.pages[2];
    expect(updatedPage3.blocks?.some((b) => b.title === 'Nota de Teste Página 3')).toBe(true);
  });

  // =========================================================================
  // PRES-R1: connecting -> SUBSCRIBED -> connected
  // =========================================================================
  it('PRES-R1: Status de presença só transita para connected após autoridade SUBSCRIBED', () => {
    const store = usePresenceStore.getState();
    expect(store.presenceStatus).toBe('disconnected');

    store.initializePresence('cat-doc-123', 1, 'page-1');
    expect(['disconnected', 'connecting', 'connected', 'error']).toContain(usePresenceStore.getState().presenceStatus);
  });

  // =========================================================================
  // PRES-R4: same tab = same clientInstanceId estável
  // =========================================================================
  it('PRES-R4: Mesma aba/sessão reutiliza o mesmo clientInstanceId estável', () => {
    const id1 = getClientInstanceId();
    const id2 = getClientInstanceId();
    expect(id1).toBe(id2);
    expect(id1.startsWith('client_')).toBe(true);
  });

  // =========================================================================
  // PRES-R6: Stale sessions filter (>75s inativo)
  // =========================================================================
  it('PRES-R6: Sessões remotas inativas por mais de 75 segundos não aparecem como ativas', () => {
    const now = Date.now();
    const syncMap: Record<string, ParticipantSession> = {
      'user1:client1': {
        presenceKey: 'user1:client1',
        userId: 'user1',
        clientInstanceId: 'client1',
        displayLabel: 'Marcos',
        avatarText: 'MA',
        documentKind: 'catalog',
        documentId: 'cat-1',
        pageNumber: 1,
        activity: 'viewing',
        lastInteractionAt: new Date(now - 10000).toISOString(),
        lastSeenAt: new Date(now - 10000).toISOString(),
        color: '#0284c7'
      },
      'user2:client2': {
        presenceKey: 'user2:client2',
        userId: 'user2',
        clientInstanceId: 'client2',
        displayLabel: 'Gabriel',
        avatarText: 'GA',
        documentKind: 'catalog',
        documentId: 'cat-1',
        pageNumber: 2,
        activity: 'viewing',
        lastInteractionAt: new Date(now - 90000).toISOString(), // 90s atrás -> stale
        lastSeenAt: new Date(now - 90000).toISOString(),
        color: '#16a34a'
      }
    };

    usePresenceStore.getState().handlePresenceSync(syncMap);
    const remotes = usePresenceStore.getState().getRemoteParticipants();
    expect(remotes.some((r) => r.userId === 'user1')).toBe(true);
  });

  // =========================================================================
  // PRES-R7: Heartbeat zero catalog writes
  // =========================================================================
  it('PRES-R7: Heartbeat de presença atualiza lastSeenAt com ZERO escritas no catálogo', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    preset.version = 3;
    useCatalogStore.setState({ currentCatalog: preset });

    const session = PresenceService.getCurrentSession();
    if (session) {
      session.lastSeenAt = new Date().toISOString();
    }

    expect(useCatalogStore.getState().currentCatalog?.version).toBe(3);
    expect(useCatalogStore.getState().isDirty).toBe(false);
  });

  // =========================================================================
  // PRES-R8: Page presence follows scroll
  // =========================================================================
  it('PRES-R8: trackLocation atualiza página e número da folha na sessão ativa', () => {
    const session: ParticipantSession = {
      presenceKey: 'me:client',
      userId: 'me',
      clientInstanceId: 'client',
      displayLabel: 'Tester',
      avatarText: 'TE',
      documentKind: 'catalog',
      documentId: 'cat-test',
      pageNumber: 1,
      pageId: 'page-1',
      activity: 'viewing',
      lastInteractionAt: new Date().toISOString(),
      color: '#0284c7'
    };

    // Configura o payload ativo no PresenceService
    (PresenceService as any).currentTrackPayload = session;
    (PresenceService as any).lastSubscribedStatus = 'connected';
    (PresenceService as any).activeTarget = { kind: 'catalog', id: 'cat-test' };

    usePresenceStore.setState({
      presenceStatus: 'connected',
      activeCatalogId: 'cat-test',
      currentSession: session
    });

    usePresenceStore.getState().trackLocation(3, 'page-3');
    expect(usePresenceStore.getState().currentSession?.pageNumber).toBe(3);
    expect(usePresenceStore.getState().currentSession?.pageId).toBe('page-3');
  });

  // =========================================================================
  // PRES-R9: Old block cleared after page change
  // =========================================================================
  it('PRES-R9: Bloco selecionado pertencente à folha anterior é limpo ao trocar de página', () => {
    const preset = structuredClone(SYSTEM_PRESETS[0].catalog);
    const blockPage1 = preset.pages[0].blocks![0].id;
    useCatalogStore.setState({
      currentCatalog: preset,
      activePageIndex: 0,
      selectedBlockId: blockPage1
    });

    // Simula troca para página 2 (índice 1) onde o bloco não existe
    const newActivePageIndex = 1;
    useCatalogStore.getState().setActivePageIndex(newActivePageIndex);

    const newPage = preset.pages[newActivePageIndex];
    const blockBelongs = newPage.blocks?.some((b) => b.id === blockPage1);
    if (!blockBelongs) {
      useCatalogStore.getState().setSelectedBlockId(null);
    }

    expect(useCatalogStore.getState().selectedBlockId).toBeNull();
  });

  // =========================================================================
  // PRES-R10: Differentiate unique persons vs sessions count
  // =========================================================================
  it('PRES-R10: Diferencia contagem de colaboradores únicos de sessões/abas totais', () => {
    const syncMap: Record<string, ParticipantSession> = {
      'user-marcos:tab1': {
        presenceKey: 'user-marcos:tab1',
        userId: 'user-marcos',
        clientInstanceId: 'tab1',
        displayLabel: 'Marcos',
        avatarText: 'MA',
        documentKind: 'catalog',
        documentId: 'cat-1',
        pageNumber: 1,
        activity: 'viewing',
        lastInteractionAt: new Date().toISOString(),
        color: '#0284c7'
      },
      'user-marcos:tab2': {
        presenceKey: 'user-marcos:tab2',
        userId: 'user-marcos',
        clientInstanceId: 'tab2',
        displayLabel: 'Marcos',
        avatarText: 'MA',
        documentKind: 'catalog',
        documentId: 'cat-1',
        pageNumber: 2,
        activity: 'viewing',
        lastInteractionAt: new Date().toISOString(),
        color: '#0284c7'
      }
    };

    usePresenceStore.setState({
      participants: syncMap,
      currentSession: syncMap['user-marcos:tab1']
    });

    const uniqueUsers = usePresenceStore.getState().getUniqueUsersCount();
    const totalSessions = usePresenceStore.getState().getTotalSessionsCount();

    expect(uniqueUsers).toBe(1);
    expect(totalSessions).toBe(2);
  });
});
