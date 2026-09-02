import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePresenceStore } from '../../src/stores/usePresenceStore';
import { PresenceService, ParticipantSession } from '../../src/services/presence.service';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SupabaseService } from '../../src/services/supabase.service';

describe('FASE 2A — Presence & Collaborator Awareness Suite', () => {
  const catalogA_Id = 'cat-aaaa-1111-4111-8111-111111111111';

  const sessionUserA: ParticipantSession = {
    presenceKey: 'user-1:client_aaa',
    userId: 'user-1',
    clientInstanceId: 'client_aaa',
    displayLabel: 'Gabriel',
    avatarText: 'GA',
    documentKind: 'catalog',
    documentId: catalogA_Id,
    catalogId: catalogA_Id,
    pageNumber: 1,
    pageId: 'page-1',
    blockId: 'block-1',
    blockType: 'full_page_cover',
    activity: 'viewing',
    lastInteractionAt: new Date().toISOString(),
    color: '#003366'
  };

  const sessionUserB: ParticipantSession = {
    presenceKey: 'user-2:client_bbb',
    userId: 'user-2',
    clientInstanceId: 'client_bbb',
    displayLabel: 'Marcos',
    avatarText: 'MA',
    documentKind: 'catalog',
    documentId: catalogA_Id,
    catalogId: catalogA_Id,
    pageNumber: 2,
    pageId: 'page-2',
    blockId: 'block-2',
    blockType: 'table',
    activity: 'viewing',
    lastInteractionAt: new Date().toISOString(),
    color: '#16a34a'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('cb_client_instance_id', 'client_aaa');

    usePresenceStore.setState({
      presenceStatus: 'disconnected',
      activeCatalogId: null,
      currentSession: null,
      participants: {},
      error: null,
      editingTimeoutId: null
    });

    useCatalogStore.setState({
      currentCatalog: {
        id: catalogA_Id,
        title: 'PRESYS TA-25N Datasheet',
        themeId: 'default-technical',
        pages: [],
        version: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      isSaving: false,
      isDirty: false
    });
  });

  // =========================================================================
  // PRES-1 & PRES-11: Mesmo catalog.id, duas sessões distintas
  // =========================================================================
  it('PRES-1, PRES-11: Duas sessões conectadas no mesmo catálogo são mapeadas por presenceKey sem colisão', () => {
    // Simula sincronização com 2 sessões
    usePresenceStore.getState().handlePresenceSync({
      [sessionUserA.presenceKey]: sessionUserA,
      [sessionUserB.presenceKey]: sessionUserB
    });

    usePresenceStore.setState({ currentSession: sessionUserA, presenceStatus: 'connected', activeCatalogId: catalogA_Id });

    const state = usePresenceStore.getState();
    expect(Object.keys(state.participants).length).toBe(2);

    const remotes = state.getRemoteParticipants();
    expect(remotes.length).toBe(1);
    expect(remotes[0].displayLabel).toBe('Marcos');
  });

  // =========================================================================
  // PRES-2: A na Folha 1, B na Folha 2
  // =========================================================================
  it('PRES-2: Page awareness identifica corretamente quais colaboradores estão em cada folha', () => {
    usePresenceStore.setState({
      currentSession: sessionUserA,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id,
      participants: {
        [sessionUserA.presenceKey]: sessionUserA,
        [sessionUserB.presenceKey]: sessionUserB
      }
    });

    const participantsPage1 = usePresenceStore.getState().getParticipantsOnPage(1);
    const participantsPage2 = usePresenceStore.getState().getParticipantsOnPage(2);

    // Na página 1 não há remotos (User A é local)
    expect(participantsPage1.length).toBe(0);
    // Na página 2 está User B (Marcos)
    expect(participantsPage2.length).toBe(1);
    expect(participantsPage2[0].displayLabel).toBe('Marcos');
  });

  // =========================================================================
  // PRES-3: B seleciona bloco X
  // =========================================================================
  it('PRES-3: Block awareness localiza o bloco específico onde o colaborador remoto está focado', () => {
    usePresenceStore.setState({
      currentSession: sessionUserA,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id,
      participants: {
        [sessionUserA.presenceKey]: sessionUserA,
        [sessionUserB.presenceKey]: sessionUserB
      }
    });

    const onBlock1 = usePresenceStore.getState().getParticipantsOnBlock('block-1');
    const onBlock2 = usePresenceStore.getState().getParticipantsOnBlock('block-2');

    expect(onBlock1.length).toBe(0);
    expect(onBlock2.length).toBe(1);
    expect(onBlock2[0].displayLabel).toBe('Marcos');
  });

  // =========================================================================
  // PRES-4: B edita bloco X -> activity = 'editing'
  // =========================================================================
  it('PRES-4: Activity awareness reflete o status editing quando o colaborador executa alterações', () => {
    const sessionBEditing: ParticipantSession = {
      ...sessionUserB,
      activity: 'editing'
    };

    usePresenceStore.setState({
      currentSession: sessionUserA,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id,
      participants: {
        [sessionUserA.presenceKey]: sessionUserA,
        [sessionUserB.presenceKey]: sessionBEditing
      }
    });

    const onBlock2 = usePresenceStore.getState().getParticipantsOnBlock('block-2');
    expect(onBlock2[0].activity).toBe('editing');
  });

  // =========================================================================
  // PRES-5: Debounce de inatividade reverte editing para viewing
  // =========================================================================
  it('PRES-5: markEditing eleva atividade e reverte para viewing sem disparar save', async () => {
    vi.useFakeTimers();
    const updateLocationSpy = vi.spyOn(PresenceService, 'updateLocation').mockResolvedValue();

    usePresenceStore.setState({
      currentSession: sessionUserA,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id
    });

    usePresenceStore.getState().markEditing(1, 'page-1', 'block-1', 'full_page_cover');

    expect(updateLocationSpy).toHaveBeenCalledWith(1, 'page-1', 'block-1', 'full_page_cover', 'editing');

    // Avança 13 segundos (debounce > 12s)
    vi.advanceTimersByTime(13000);

    expect(updateLocationSpy).toHaveBeenLastCalledWith(1, 'page-1', 'block-1', 'full_page_cover', 'viewing');
    vi.useRealTimers();
  });

  // =========================================================================
  // PRES-6 & PRES-7: Leave & Troca de catálogo limpa estado de presença
  // =========================================================================
  it('PRES-6, PRES-7: leavePresence remove canal, limpa participantes e desconecta com segurança', () => {
    const leaveSpy = vi.spyOn(PresenceService, 'leave');

    usePresenceStore.setState({
      currentSession: sessionUserA,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id,
      participants: { [sessionUserA.presenceKey]: sessionUserA }
    });

    usePresenceStore.getState().leavePresence();

    expect(leaveSpy).toHaveBeenCalled();
    expect(usePresenceStore.getState().presenceStatus).toBe('disconnected');
    expect(usePresenceStore.getState().activeCatalogId).toBeNull();
    expect(Object.keys(usePresenceStore.getState().participants).length).toBe(0);
  });

  // =========================================================================
  // PRES-9 & PRES-10: Invariante Crítico - Zero saves de catálogo por Presence
  // =========================================================================
  it('PRES-9, PRES-10: Interações de Presence JAMAIS invocam save_catalog_v3 nem alteram catalog.version', () => {
    const saveSpy = vi.spyOn(SupabaseService, 'saveCatalog');
    vi.spyOn(PresenceService, 'subscribeToCatalog').mockReturnValue(null as any);
    vi.spyOn(PresenceService, 'updateLocation').mockResolvedValue();
    const versionBefore = useCatalogStore.getState().currentCatalog?.version;

    // Dispara múltiplas operações de presença
    usePresenceStore.getState().initializePresence(catalogA_Id, 1);
    usePresenceStore.getState().trackLocation(2, 'page-2', 'block-2', 'table');
    usePresenceStore.getState().markEditing(2, 'page-2', 'block-2', 'table');
    usePresenceStore.getState().handlePresenceSync({
      [sessionUserA.presenceKey]: sessionUserA,
      [sessionUserB.presenceKey]: sessionUserB
    });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(versionBefore);
    expect(useCatalogStore.getState().isDirty).toBe(false);
  });

  // =========================================================================
  // PRES-11: Mesma conta em dois navegadores com clientInstanceId diferentes
  // =========================================================================
  it('PRES-11: Mesma conta em 2 abas/browsers coexiste como 2 colaboradores independentes', () => {
    const sameAccountSession1: ParticipantSession = {
      presenceKey: 'marcpresys@gmail.com:client_tab_1',
      userId: 'user-marc',
      clientInstanceId: 'client_tab_1',
      displayLabel: 'Marcos Presys',
      avatarText: 'MP',
      documentKind: 'catalog',
      documentId: catalogA_Id,
      catalogId: catalogA_Id,
      pageNumber: 1,
      activity: 'viewing',
      lastInteractionAt: new Date().toISOString(),
      color: '#003366'
    };

    const sameAccountSession2: ParticipantSession = {
      presenceKey: 'marcpresys@gmail.com:client_tab_2',
      userId: 'user-marc',
      clientInstanceId: 'client_tab_2',
      displayLabel: 'Marcos Presys (Sessão 2)',
      avatarText: 'MP',
      documentKind: 'catalog',
      documentId: catalogA_Id,
      catalogId: catalogA_Id,
      pageNumber: 3,
      activity: 'editing',
      lastInteractionAt: new Date().toISOString(),
      color: '#0284c7'
    };

    sessionStorage.setItem('cb_client_instance_id', 'client_tab_1');

    usePresenceStore.setState({
      currentSession: sameAccountSession1,
      presenceStatus: 'connected',
      activeCatalogId: catalogA_Id,
      participants: {
        [sameAccountSession1.presenceKey]: sameAccountSession1,
        [sameAccountSession2.presenceKey]: sameAccountSession2
      }
    });

    const remotes = usePresenceStore.getState().getRemoteParticipants();
    expect(remotes.length).toBe(1);
    expect(remotes[0].clientInstanceId).toBe('client_tab_2');
    expect(remotes[0].pageNumber).toBe(3);
  });
});
