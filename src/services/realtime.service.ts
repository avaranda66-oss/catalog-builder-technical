import { useCatalogStore, debugSetCatalog } from '../stores/useCatalogStore';
import { Catalog } from '../domain/catalog.schema';

export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new?: {
    id?: string;
    name?: string;
    status?: string;
    version?: number;
    brand?: any;
    updated_at?: string;
    created_at?: string;
  } | null;
  old?: {
    id?: string;
  } | null;
}

/**
 * Processador de eventos Supabase Realtime para a tabela 'catalogs'.
 * Aplica atualizações remotas instantaneamente a partir do payload WAL (REPLICA IDENTITY FULL)
 * com salvaguarda estrita contra stale snapshot restore.
 */
export async function handleCatalogRealtimeEvent(
  payload: RealtimePayload,
  store = useCatalogStore
): Promise<void> {
  const changedId = payload.new?.id || payload.old?.id;
  if (!changedId) return;

  console.log('[REALTIME CATALOG EVENT]', {
    eventType: payload.eventType,
    newId: payload.new?.id,
    newVersion: payload.new?.version,
    oldId: payload.old?.id
  });

  const state = store.getState();
  const currentCatalog = state.currentCatalog;
  const inFlight = state.inFlightSave;

  // 1. Atualiza lista de workspace em segundo plano
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
    if (
      inFlight &&
      inFlight.catalogId === changedId &&
      (remoteVersion === inFlight.targetVersion || remoteVersion === inFlight.expectedVersion + 1)
    ) {
      console.log('[REALTIME] Ignorando eco do próprio salvamento em voo v' + remoteVersion);
      return;
    }

    // B) Evento antigo ou duplicado (versão remota <= versão já confirmada no cliente):
    if (remoteVersion > 0 && remoteVersion <= currentVersion) {
      console.log('[REALTIME] Ignorando evento defasado/duplicado v' + remoteVersion + ' <= local v' + currentVersion);
      return;
    }

    // C) Evento remoto com versão maior (outro dispositivo salvou):
    const hasUnsavedLocalEdits = state.isDirty || state.isSaving || state.localRevision > state.lastAcknowledgedLocalRevision;

    if (hasUnsavedLocalEdits) {
      console.warn('[REALTIME] Conflito detectado: alteração remota v' + remoteVersion + ' enquanto local possui edições não salvas (rev: ' + state.localRevision + ')');
      store.setState({
        syncStatus: 'conflict',
        syncError: 'Este catálogo foi atualizado em outro dispositivo. Suas alterações locais foram preservadas.'
      });
    } else {
      console.log('[REALTIME] Aplicando atualização remota instantânea v' + remoteVersion + ' no catálogo ' + changedId);

      // Se payload.new possui brand completo via REPLICA IDENTITY FULL, atualiza instantaneamente
      if (payload.new && payload.new.brand && typeof payload.new.brand === 'object') {
        const brandData = payload.new.brand;
        const updatedCatalog: Catalog = {
          id: payload.new.id || currentCatalog.id,
          title: payload.new.name || brandData.title || currentCatalog.title,
          subtitle: brandData.subtitle ?? currentCatalog.subtitle ?? '',
          themeId: brandData.themeId || currentCatalog.themeId || 'default-technical',
          pages: Array.isArray(brandData.pages) ? brandData.pages : currentCatalog.pages,
          version: remoteVersion,
          createdAt: brandData.createdAt || currentCatalog.createdAt || new Date().toISOString(),
          updatedAt: payload.new.updated_at || new Date().toISOString()
        };

        debugSetCatalog('handleCatalogRealtimeEvent:InstantApply', currentCatalog, updatedCatalog);

        store.setState({
          currentCatalog: updatedCatalog,
          isDirty: false,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0,
          syncStatus: 'synced',
          syncError: null,
          serverSavedAt: payload.new.updated_at || new Date().toISOString()
        });
      } else {
        await state.refreshCatalog(currentCatalog.id);
      }
    }
  }
}
