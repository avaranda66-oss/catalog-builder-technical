import { useCatalogStore, debugSetCatalog } from '../stores/useCatalogStore';
import { Catalog, analyzeCatalogStructuralDelta } from '../domain/catalog.schema';

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
 * com salvaguarda estrita contra stale snapshot restore e zero requisições HTTP redundantes.
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

  // 1. Se for um DELETE no catálogo atualmente aberto
  if (payload.eventType === 'DELETE' && changedId === currentCatalog?.id) {
    store.setState({
      syncStatus: 'conflict',
      syncError: 'Este catálogo foi excluído no servidor por outro administrador.'
    });
    void state.loadWorkspace();
    return;
  }

  // 2. Se a alteração for em OUTRO catálogo diferente do que estou editando -> Atualiza lista salva sem tocar no currentCatalog
  if (currentCatalog && changedId !== currentCatalog.id) {
    if (payload.new && payload.new.id) {
      const brandData = typeof payload.new.brand === 'object' && payload.new.brand !== null ? payload.new.brand : {};
      const updatedItem: Catalog = {
        id: payload.new.id,
        title: payload.new.name || brandData.title || 'Catálogo Técnico',
        subtitle: brandData.subtitle || '',
        themeId: brandData.themeId || 'default-technical',
        pages: Array.isArray(brandData.pages) ? brandData.pages : [],
        version: Number(payload.new.version) || 1,
        createdAt: brandData.createdAt || payload.new.created_at || new Date().toISOString(),
        updatedAt: payload.new.updated_at || new Date().toISOString()
      };

      const existingIndex = state.savedCatalogs.findIndex((c) => c.id === changedId);
      const nextSaved = existingIndex >= 0
        ? state.savedCatalogs.map((c) => (c.id === changedId ? updatedItem : c))
        : [...state.savedCatalogs, updatedItem];

      store.setState({ savedCatalogs: nextSaved });
    } else {
      void state.loadWorkspace();
    }
    return;
  }

  // 3. Se a alteração for no MESMO catálogo atualmente aberto:
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

      // Se payload.new possui brand completo via REPLICA IDENTITY FULL, analisa delta e atualiza
      if (payload.new && payload.new.brand && typeof payload.new.brand === 'object') {
        const brandData = payload.new.brand;
        const updatedCatalog: Catalog = {
          id: payload.new.id || currentCatalog.id,
          title: payload.new.name || brandData.title || currentCatalog.title,
          subtitle: brandData.subtitle ?? currentCatalog.subtitle ?? '',
          themeId: brandData.themeId || currentCatalog.themeId || 'default-technical',
          pages: Array.isArray(brandData.pages) ? brandData.pages : currentCatalog.pages,
          version: remoteVersion,
          lastMutation: brandData.lastMutation,
          createdAt: brandData.createdAt || currentCatalog.createdAt || new Date().toISOString(),
          updatedAt: payload.new.updated_at || new Date().toISOString()
        };

        // Análise Defensiva de Delta Estrutural: Bloqueia snapshots que removem blocos sem REMOVE_BLOCK
        const structuralDelta = analyzeCatalogStructuralDelta(currentCatalog, updatedCatalog);
        if (structuralDelta.removedBlocks.length > 0) {
          const remoteMutation = brandData.lastMutation || updatedCatalog.lastMutation;
          const isLegitimateBlockRemoval =
            remoteMutation?.kind === 'REMOVE_BLOCK' &&
            remoteMutation?.targetId &&
            structuralDelta.removedBlocks.some((rb) => rb.blockId === remoteMutation.targetId);

          if (!isLegitimateBlockRemoval) {
            console.warn('🚨 [DEFENSIVE GUARD] Realtime rejeitou snapshot destrutivo sem evidência de REMOVE_BLOCK:', {
              delta: structuralDelta,
              remoteMutation,
              remoteVersion
            });
            store.setState({
              syncStatus: 'conflict',
              syncError: 'Uma atualização remota removeria conteúdo deste catálogo. O conteúdo local foi preservado até confirmação.'
            });
            return;
          }
        }

        if (structuralDelta.removedPages.length > 0) {
          const remoteMutation = brandData.lastMutation || updatedCatalog.lastMutation;
          const isLegitimatePageRemoval =
            remoteMutation?.kind === 'REMOVE_PAGE' &&
            remoteMutation?.targetId &&
            structuralDelta.removedPages.includes(remoteMutation.targetId);

          if (!isLegitimatePageRemoval) {
            console.warn('🚨 [DEFENSIVE GUARD] Realtime rejeitou snapshot com remoção não justificada de páginas:', {
              delta: structuralDelta,
              remoteMutation,
              remoteVersion
            });
            store.setState({
              syncStatus: 'conflict',
              syncError: 'Uma atualização remota removeria conteúdo deste catálogo. O conteúdo local foi preservado até confirmação.'
            });
            return;
          }
        }

        debugSetCatalog('handleCatalogRealtimeEvent:InstantApply', currentCatalog, updatedCatalog);

        const nextSaved = state.savedCatalogs.map((c) => (c.id === changedId ? updatedCatalog : c));

        store.setState({
          currentCatalog: updatedCatalog,
          savedCatalogs: nextSaved,
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
