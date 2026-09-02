import { create } from 'zustand';
import { PresenceService, ParticipantSession, PresenceConnectionStatus } from '../services/presence.service';
import { getClientInstanceId } from './useCatalogStore';

export interface PresenceState {
  presenceStatus: PresenceConnectionStatus;
  activeCatalogId: string | null;
  documentKind: 'catalog' | 'template';
  currentSession: ParticipantSession | null;
  participants: Record<string, ParticipantSession>;
  error: string | null;
  editingTimeoutId: any | null;

  // Actions
  initializePresence: (
    documentId: string,
    pageNumber?: number,
    pageId?: string,
    kind?: 'catalog' | 'template'
  ) => void;
  trackLocation: (pageNumber: number, pageId?: string, blockId?: string | null, blockType?: string | null) => void;
  markEditing: (pageNumber: number, pageId?: string, blockId?: string | null, blockType?: string | null) => void;
  handlePresenceSync: (syncMap: Record<string, ParticipantSession>) => void;
  leavePresence: () => void;

  // Selectors
  getRemoteParticipants: () => ParticipantSession[];
  getParticipantsOnPage: (pageNumber: number) => ParticipantSession[];
  getParticipantsOnBlock: (blockId: string) => ParticipantSession[];
  getUniqueUsersCount: () => number;
  getTotalSessionsCount: () => number;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presenceStatus: 'disconnected',
  activeCatalogId: null,
  documentKind: 'catalog',
  currentSession: null,
  participants: {},
  error: null,
  editingTimeoutId: null,

  initializePresence: (
    documentId: string,
    pageNumber: number = 1,
    pageId?: string,
    kind: 'catalog' | 'template' = 'catalog'
  ) => {
    if (!documentId) return;

    // Se já está conectado no mesmo documento, apenas sincroniza localização
    if (
      get().activeCatalogId === documentId &&
      get().documentKind === kind &&
      get().presenceStatus === 'connected'
    ) {
      get().trackLocation(pageNumber, pageId);
      return;
    }

    // Se estava em outro documento, faz leave anterior
    if (get().activeCatalogId && (get().activeCatalogId !== documentId || get().documentKind !== kind)) {
      get().leavePresence();
    }

    set({ presenceStatus: 'connecting', activeCatalogId: documentId, documentKind: kind, error: null });

    PresenceService.subscribeToDocument(
      { kind, id: documentId },
      pageNumber,
      pageId,
      (syncedParticipants) => {
        get().handlePresenceSync(syncedParticipants);
      },
      (status) => {
        set({
          presenceStatus: status,
          currentSession: PresenceService.getCurrentSession()
        });
      }
    );

    set({
      currentSession: PresenceService.getCurrentSession()
    });
  },

  trackLocation: (pageNumber: number, pageId?: string, blockId?: string | null, blockType?: string | null) => {
    const { presenceStatus, activeCatalogId } = get();
    if ((presenceStatus !== 'connected' && presenceStatus !== 'connecting') || !activeCatalogId) return;

    // Cancela qualquer timer de edição pendente se o bloco mudou
    const currentTimer = get().editingTimeoutId;
    if (currentTimer) {
      clearTimeout(currentTimer);
      set({ editingTimeoutId: null });
    }

    void PresenceService.updateLocation(pageNumber, pageId, blockId, blockType, 'viewing');
    const updated = PresenceService.getCurrentSession();
    if (updated) {
      set({ currentSession: updated });
    }
  },

  markEditing: (pageNumber: number, pageId?: string, blockId?: string | null, blockType?: string | null) => {
    const { presenceStatus, activeCatalogId } = get();
    if (presenceStatus !== 'connected' || !activeCatalogId) return;

    // Limpa timer anterior
    const prevTimer = get().editingTimeoutId;
    if (prevTimer) {
      clearTimeout(prevTimer);
    }

    // Envia presença com activity='editing'
    void PresenceService.updateLocation(pageNumber, pageId, blockId, blockType, 'editing');
    const updated = PresenceService.getCurrentSession();
    if (updated) {
      set({ currentSession: updated });
    }

    // Após 12 segundos sem nova edição, retorna automaticamente para 'viewing'
    const newTimer = setTimeout(() => {
      const current = get().currentSession;
      if (current) {
        void PresenceService.updateLocation(
          current.pageNumber,
          current.pageId,
          current.blockId,
          current.blockType,
          'viewing'
        );
        set({
          currentSession: PresenceService.getCurrentSession() || {
            ...current,
            activity: 'viewing'
          },
          editingTimeoutId: null
        });
      }
    }, 12000);

    set({ editingTimeoutId: newTimer });
  },

  handlePresenceSync: (syncMap: Record<string, ParticipantSession>) => {
    const clientId = getClientInstanceId();
    // Encontra a própria sessão no mapa para manter displayLabel e chave consistente
    let mySession = get().currentSession;
    for (const session of Object.values(syncMap)) {
      if (session.clientInstanceId === clientId) {
        mySession = session;
        break;
      }
    }

    set({
      participants: syncMap,
      currentSession: mySession || get().currentSession
    });
  },

  leavePresence: () => {
    const timer = get().editingTimeoutId;
    if (timer) {
      clearTimeout(timer);
    }
    void PresenceService.leave();
    set({
      presenceStatus: 'disconnected',
      activeCatalogId: null,
      currentSession: null,
      participants: {},
      editingTimeoutId: null,
      error: null
    });
  },

  getRemoteParticipants: () => {
    const { participants, currentSession } = get();
    const myKey = currentSession?.presenceKey;
    const myClientId = getClientInstanceId();

    return Object.values(participants || {}).filter((p) => {
      if (!p) return false;
      if (myKey && p.presenceKey === myKey) return false;
      if (p.clientInstanceId === myClientId) return false;
      return true;
    });
  },

  getParticipantsOnPage: (pageNumber: number) => {
    const remotes = get().getRemoteParticipants();
    return remotes.filter((p) => p && p.pageNumber === pageNumber);
  },

  getParticipantsOnBlock: (blockId: string) => {
    if (!blockId) return [];
    const remotes = get().getRemoteParticipants();
    return remotes.filter((p) => p && p.blockId === blockId);
  },

  getUniqueUsersCount: () => {
    const { currentSession } = get();
    const remotes = get().getRemoteParticipants();
    const all = currentSession ? [currentSession, ...remotes] : remotes;
    const userIds = all.map((s) => s?.userId).filter(Boolean);
    return new Set(userIds).size;
  },

  getTotalSessionsCount: () => {
    const { currentSession } = get();
    const remotes = get().getRemoteParticipants();
    return (currentSession ? 1 : 0) + remotes.length;
  }
}));
