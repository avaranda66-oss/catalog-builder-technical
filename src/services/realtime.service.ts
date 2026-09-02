import { useCatalogStore } from '../stores/useCatalogStore';

export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new?: {
    id?: string;
    name?: string;
    version?: number;
    brand?: any;
    updated_at?: string;
  } | null;
  old?: {
    id?: string;
  } | null;
}

/**
 * Processador de eventos Supabase Realtime para a tabela 'catalogs'.
 * Isola a lógica para permitir testes unitários determinísticos de concorrência e eco de save.
 */
export async function handleCatalogRealtimeEvent(
  payload: RealtimePayload,
  store = useCatalogStore
): Promise<void> {
  const changedId = payload.new?.id || payload.old?.id;
  if (!changedId) return;

  const state = store.getState();
  const currentCatalog = state.currentCatalog;
  const inFlight = store.getState().inFlightSave;

  // 1. Sempre atualiza a lista de workspace em segundo plano
  void state.loadWorkspace();

  // 2. Se for um DELETE no catálogo atualmente aberto
  if (payload.eventType === 'DELETE' && changedId === currentCatalog?.id) {
    store.setState({
      syncStatus: 'conflict',
      syncError: 'Este catálogo foi excluído no servidor por outro administrador.'
    });
    return;
  }

  // 3. Se a alteração for em OUTRO catálogo diferente do que estou editando -> NUNCA toca no currentCatalog
  if (currentCatalog && changedId !== currentCatalog.id) {
    return;
  }

  // 4. Se a alteração for no MESMO catálogo atualmente aberto:
  if (currentCatalog && changedId === currentCatalog.id) {
    const remoteVersion = Number(payload.new?.version) || 0;
    const currentVersion = currentCatalog.version || 0;

    // A) Eco / ACK do nosso próprio save em voo:
    if (inFlight && inFlight.catalogId === changedId && (remoteVersion === inFlight.targetVersion || remoteVersion === inFlight.expectedVersion + 1)) {
      // É o eco do nosso próprio salvamento — não cria conflito!
      return;
    }

    // B) Evento antigo ou duplicado (versão remota <= versão já confirmada no cliente):
    if (remoteVersion > 0 && remoteVersion <= currentVersion) {
      return; // Ignora evento defasado
    }

    // C) Evento remoto com versão maior (outro dispositivo salvou):
    if (state.isDirty || state.isSaving) {
      // Documento local possui alterações pendentes ou save em voo -> CONFLITO REAL
      store.setState({
        syncStatus: 'conflict',
        syncError: 'Este catálogo foi atualizado em outro dispositivo. Suas alterações locais foram preservadas.'
      });
    } else {
      // Documento limpo -> Atualiza suavemente para a versão remota
      await state.refreshCatalog(currentCatalog.id);
    }
  }
}
