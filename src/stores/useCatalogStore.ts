import { create } from 'zustand';
import {
  Catalog,
  ContentBlock,
  generateUniqueCatalogTitle,
  MutationMetadata,
  analyzeCatalogStructuralDelta
} from '../domain/catalog.schema';
import { StorageService } from '../services/storage.service';
import { SupabaseService } from '../services/supabase.service';
import { SYSTEM_PRESETS } from '../data/presets';

export type SyncStatus = 'synced' | 'saving' | 'dirty' | 'conflict' | 'error' | 'offline';

export interface SaveResult {
  success: boolean;
  status: SyncStatus;
  version?: number;
  errorCode?: string;
  error?: string;
}

export interface InFlightSaveInfo {
  catalogId: string;
  expectedVersion: number;
  targetVersion: number;
  capturedRevision: number;
}

export function updateCanonicalUrlCatalogId(catalogId: string) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('catalog') !== catalogId) {
      url.searchParams.set('catalog', catalogId);
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {
    console.warn('Erro ao atualizar URL canônica:', e);
  }
}

// Client Instance ID persistente na sessão do navegador
export function getClientInstanceId(): string {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    let id = window.sessionStorage.getItem('cb_client_instance_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).slice(2, 9);
      window.sessionStorage.setItem('cb_client_instance_id', id);
    }
    return id;
  }
  return 'client_node';
}

// Estrutura de Fingerprint Estrutural do Catálogo (Páginas e Blocos)
export interface CatalogStructuralFingerprint {
  pagesCount: number;
  totalBlocks: number;
  pages: Array<{ pageId: string; pageNumber: number; blockCount: number; blockIds: string[]; blockTypes: string[] }>;
}

export function getCatalogStructuralFingerprint(cat: Catalog | null): CatalogStructuralFingerprint {
  if (!cat || !cat.pages) return { pagesCount: 0, totalBlocks: 0, pages: [] };
  return {
    pagesCount: cat.pages.length,
    totalBlocks: cat.pages.reduce((acc, p) => acc + (p.blocks?.length || 0), 0),
    pages: cat.pages.map((p, idx) => ({
      pageId: p.id,
      pageNumber: p.pageNumber ?? (idx + 1),
      blockCount: p.blocks?.length || 0,
      blockIds: (p.blocks || []).map((b) => b.id),
      blockTypes: (p.blocks || []).map((b) => b.type)
    }))
  };
}

// Helper de Diagnóstico e Rastreamento de Estado com Fingerprint de Blocos
export function debugSetCatalog(
  source: string,
  previous: Catalog | null,
  next: Catalog | null,
  extra?: Record<string, any>
) {
  const prevCount = previous?.pages?.length ?? 0;
  const nextCount = next?.pages?.length ?? 0;
  const prevBlocksTotal = previous?.pages?.reduce((acc, p) => acc + (p.blocks?.length || 0), 0) ?? 0;
  const nextBlocksTotal = next?.pages?.reduce((acc, p) => acc + (p.blocks?.length || 0), 0) ?? 0;
  const clientId = getClientInstanceId();

  console.log(`[DEBUG-CATALOG-STATE] [${source}] [${clientId}]`, {
    timestamp: new Date().toISOString(),
    id: next?.id,
    prevVersion: previous?.version,
    nextVersion: next?.version,
    prevPagesCount: prevCount,
    nextPagesCount: nextCount,
    prevBlocksTotal,
    nextBlocksTotal,
    prevTitle: previous?.title,
    nextTitle: next?.title,
    ...extra
  });

  if (previous && next && nextCount < prevCount) {
    console.warn(`🚨 [PAGES DROPPED] Source "${source}" reduziu páginas de ${prevCount} para ${nextCount}!`, {
      prevCatalog: previous,
      nextCatalog: next
    });
    console.trace();
  }

  // Verificação de Perda de Blocos em Páginas Existentes
  if (previous && next) {
    for (const prevPage of previous.pages) {
      const nextPage = next.pages.find((p) => p.id === prevPage.id);
      if (nextPage) {
        const prevBlockList = prevPage.blocks || [];
        const nextBlockList = nextPage.blocks || [];
        if (nextBlockList.length < prevBlockList.length) {
          const nextIds = new Set(nextBlockList.map((b) => b.id));
          const droppedBlocks = prevBlockList.filter((b) => !nextIds.has(b.id));
          console.warn(`🚨 [BLOCKS DROPPED] Source "${source}" reduziu blocos na página ${prevPage.id} de ${prevBlockList.length} para ${nextBlockList.length}!`, {
            pageId: prevPage.id,
            droppedBlocks,
            prevBlocks: prevBlockList,
            nextBlocks: nextBlockList
          });
          console.trace();
        }
      }
    }
  }
}

interface CatalogState {
  currentCatalog: Catalog | null;
  activePageIndex: number;
  selectedBlockId: string | null;

  // Status de Sincronização, Revisão Local & Persistência (Fase 1.2)
  isSaving: boolean;
  isDirty: boolean;
  localRevision: number;
  lastAcknowledgedLocalRevision: number;
  lastMutation: MutationMetadata | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  serverSavedAt: string | null;
  cachedAt: string | null;
  lastSavedAt: string | null;
  inFlightSave: InFlightSaveInfo | null;
  realtimeStatus: string;

  savedCatalogs: Catalog[];
  isLoading: boolean;

  // Actions principais (Setters puros de estado)
  setCurrentCatalog: (catalog: Catalog, markDirty?: boolean) => void;
  setActivePageIndex: (index: number) => void;
  setSelectedBlockId: (blockId: string | null) => void;

  // Gerenciamento de Páginas (Sem pré-incremento de versão no cliente)
  addPage: (type?: 'cover' | 'technical' | 'custom' | 'presentation') => void;
  removePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  setPageTitle: (pageId: string, title: string) => void;

  // Gerenciamento de Blocos (Sem pré-incremento de versão no cliente)
  addBlock: (pageId: string, block: Omit<ContentBlock, 'id'>) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<ContentBlock>) => void;
  removeBlock: (pageId: string, blockId: string) => void;

  // Manipulação de Linhas e Overrides Locais em Tabelas
  updateCellOverride: (blockId: string, rowId: string, fieldKey: string, value: string) => void;
  restoreCellToLibrary: (blockId: string, rowId: string, fieldKey: string) => void;
  addRowToTable: (blockId: string, productRefId: string) => void;
  removeRowFromTable: (blockId: string, rowId: string) => void;

  // Persistência & Fila Single-Flight com Retorno Explícito de Resultado
  saveCurrentCatalog: () => Promise<SaveResult>;
  loadWorkspace: () => Promise<{ success: boolean; catalogs: Catalog[]; errorType?: 'offline' | 'server'; error?: string }>;
  openCatalog: (id: string) => Promise<void>;
  refreshCatalog: (id: string) => Promise<void>;
  loadLatestCatalog: () => Promise<void>;
  loadAllCatalogs: () => Promise<void>;
  loadCatalogById: (id: string) => Promise<void>;
  duplicateCatalog: (id: string) => Promise<SaveResult | null>;
  deleteCatalog: (id: string) => Promise<void>;
  saveAsNewCatalog: (newTitle: string) => Promise<SaveResult & { newCatalogId?: string }>;
  flushCatalog: (catalogId?: string) => Promise<SaveResult>;
  createCatalogFromPreset: (name?: string, presetId?: string) => Promise<SaveResult>;
  resolveConflictKeepLocal: () => Promise<SaveResult>;
  resolveConflictReloadServer: () => Promise<void>;
  resetWorkspaceForIdentityChange: () => void;
}

// Controle de Fila por Catálogo (Per-Catalog Save Queue)
interface CatalogSaveQueue {
  isSaving: boolean;
  hasPending: boolean;
  inFlightPromise: Promise<SaveResult> | null;
}

const catalogSaveQueues = new Map<string, CatalogSaveQueue>();

function getCatalogQueue(catalogId: string): CatalogSaveQueue {
  let q = catalogSaveQueues.get(catalogId);
  if (!q) {
    q = { isSaving: false, hasPending: false, inFlightPromise: null };
    catalogSaveQueues.set(catalogId, q);
  }
  return q;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  currentCatalog: null,
  activePageIndex: 0,
  selectedBlockId: null,

  isSaving: false,
  isDirty: false,
  localRevision: 0,
  lastAcknowledgedLocalRevision: 0,
  lastMutation: null,
  syncStatus: 'synced',
  syncError: null,
  serverSavedAt: null,
  cachedAt: null,
  lastSavedAt: null,
  inFlightSave: null,
  realtimeStatus: 'INITIALIZING',

  savedCatalogs: [],
  isLoading: false,

  resetWorkspaceForIdentityChange: () => {
    console.log('🧹 [IDENTITY RESET] Limpando workspace em memória por troca/saída de identidade.');
    set({
      currentCatalog: null,
      savedCatalogs: [],
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: false,
      isSaving: false,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0,
      inFlightSave: null,
      syncStatus: 'synced',
      syncError: null,
      serverSavedAt: null,
      cachedAt: null
    });
  },

  // FASE 1.1: setCurrentCatalog é um SETTER PURO sem side-effects de rede
  setCurrentCatalog: (nextCatalog, markDirty = true) => {
    const prev = get().currentCatalog;
    debugSetCatalog('setCurrentCatalog', prev, nextCatalog, { markDirty });
    const nextRev = markDirty ? get().localRevision + 1 : get().localRevision;
    const mutation: MutationMetadata | null = markDirty
      ? {
          kind: 'MANUAL_EDIT',
          clientInstanceId: getClientInstanceId(),
          summary: `Catálogo alterado para "${nextCatalog.title}"`,
          timestamp: new Date().toISOString()
        }
      : null;

    set({
      currentCatalog: nextCatalog,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: markDirty,
      syncStatus: markDirty ? 'dirty' : 'synced'
    });
  },

  setActivePageIndex: (activePageIndex) => set({ activePageIndex }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),

  // =========================================================================
  // FASE 1A & 1.2: MUTAÇÕES LOCAIS COM INCREMENTO DE LOCAL REVISION E METADATA
  // =========================================================================

  addPage: (type = 'technical') => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const newPageNumber = currentCatalog.pages.length + 1;
    const newPage = {
      id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pageNumber: newPageNumber,
      pageType: type,
      title: `Folha ${newPageNumber}`,
      blocks: []
    };

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: [...currentCatalog.pages, newPage],
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'ADD_PAGE',
      clientInstanceId: getClientInstanceId(),
      targetId: newPage.id,
      summary: `Adicionada Folha ${newPageNumber} (${type})`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('addPage', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      activePageIndex: currentCatalog.pages.length,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removePage: (pageId) => {
    const { currentCatalog, activePageIndex, localRevision } = get();
    if (!currentCatalog || currentCatalog.pages.length <= 1) return;

    const updatedPages = currentCatalog.pages
      .filter((p) => p.id !== pageId)
      .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextIndex = Math.min(activePageIndex, updatedPages.length - 1);
    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'REMOVE_PAGE',
      clientInstanceId: getClientInstanceId(),
      targetId: pageId,
      summary: `Removida página ${pageId}`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('removePage', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      activePageIndex: nextIndex,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  reorderPages: (fromIndex, toIndex) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const pages = [...currentCatalog.pages];
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);

    const reorderedPages = pages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: reorderedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'REORDER_PAGES',
      clientInstanceId: getClientInstanceId(),
      summary: `Reordenadas páginas da posição ${fromIndex + 1} para ${toIndex + 1}`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('reorderPages', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      activePageIndex: toIndex,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  setPageTitle: (pageId, title) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) =>
      p.id === pageId ? { ...p, title } : p
    );

    const updatedCatalog = { ...currentCatalog, pages: updatedPages, updatedAt: new Date().toISOString() };
    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'EDIT_TEXT',
      clientInstanceId: getClientInstanceId(),
      targetId: pageId,
      summary: `Título da página ${pageId} alterado para "${title}"`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('setPageTitle', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  addBlock: (pageId, blockData) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const newBlock: ContentBlock = {
      ...blockData,
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    };

    const updatedPages = currentCatalog.pages.map((p) =>
      p.id === pageId ? { ...p, blocks: [...(p.blocks || []), newBlock] } : p
    );

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'ADD_BLOCK',
      clientInstanceId: getClientInstanceId(),
      targetId: newBlock.id,
      targetPageId: pageId,
      summary: `Adicionado bloco ${newBlock.type} "${newBlock.title || ''}" à página ${pageId}`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('addBlock', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      selectedBlockId: newBlock.id,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  updateBlock: (pageId, blockId, updates) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: (p.blocks || []).map((b) => (b.id === blockId ? { ...b, ...updates } : b))
      };
    });

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'UPDATE_BLOCK',
      clientInstanceId: getClientInstanceId(),
      targetId: blockId,
      targetPageId: pageId,
      summary: `Atualizado bloco ${blockId} na página ${pageId}`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('updateBlock', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removeBlock: (pageId, blockId) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: (p.blocks || []).filter((b) => b.id !== blockId)
      };
    });

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    const mutation: MutationMetadata = {
      kind: 'REMOVE_BLOCK',
      clientInstanceId: getClientInstanceId(),
      targetId: blockId,
      targetPageId: pageId,
      summary: `Removido bloco ${blockId} da página ${pageId}`,
      timestamp: new Date().toISOString()
    };

    debugSetCatalog('removeBlock', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      selectedBlockId: null,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  updateCellOverride: (blockId, rowId, fieldKey, value) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => {
        if (b.id !== blockId || !b.tableRows) return b;
        return {
          ...b,
          tableRows: b.tableRows.map((r) => {
            if (r.id !== rowId) return r;
            return {
              ...r,
              localOverrides: {
                ...(r.localOverrides || {}),
                [fieldKey]: value
              }
            };
          })
        };
      })
    }));

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    debugSetCatalog('updateCellOverride', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  restoreCellToLibrary: (blockId, rowId, fieldKey) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => {
        if (b.id !== blockId || !b.tableRows) return b;
        return {
          ...b,
          tableRows: b.tableRows.map((r) => {
            if (r.id !== rowId || !r.localOverrides) return r;
            const updatedOverrides = { ...r.localOverrides };
            delete updatedOverrides[fieldKey];
            return {
              ...r,
              localOverrides: updatedOverrides
            };
          })
        };
      })
    }));

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    debugSetCatalog('restoreCellToLibrary', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  addRowToTable: (blockId, productRefId) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const newRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productRefId,
      localOverrides: {},
      customNotes: '',
      order: 0
    };

    const updatedPages = currentCatalog.pages.map((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => {
        if (b.id !== blockId) return b;
        const currentRows = b.tableRows || [];
        return {
          ...b,
          tableRows: [...currentRows, { ...newRow, order: currentRows.length }]
        };
      })
    }));

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    debugSetCatalog('addRowToTable', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removeRowFromTable: (blockId, rowId) => {
    const { currentCatalog, localRevision } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => ({
      ...p,
      blocks: (p.blocks || []).map((b) => {
        if (b.id !== blockId || !b.tableRows) return b;
        return {
          ...b,
          tableRows: b.tableRows.filter((r) => r.id !== rowId)
        };
      })
    }));

    const updatedCatalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
    };

    const nextRev = localRevision + 1;
    debugSetCatalog('removeRowFromTable', currentCatalog, updatedCatalog, { localRevision: nextRev });

    set({
      currentCatalog: updatedCatalog,
      localRevision: nextRev,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  // =========================================================================
  // FASE 1.4: FILA PER-CATALOG, SAVE AS NEW, FLUSH & REVISION ACK
  // =========================================================================

  saveCurrentCatalog: async (): Promise<SaveResult> => {
    const { currentCatalog } = get();
    if (!currentCatalog) {
      return { success: false, status: 'error', error: 'Nenhum catálogo ativo para salvar.' };
    }

    const queue = getCatalogQueue(currentCatalog.id);

    if (queue.isSaving) {
      queue.hasPending = true;
      if (queue.inFlightPromise) {
        return queue.inFlightPromise;
      }
      return { success: true, status: 'saving' };
    }

    queue.isSaving = true;
    const savePromise = (async () => {
      let finalResult: SaveResult = { success: false, status: 'saving' };
      try {
        while (true) {
          queue.hasPending = false;
          const catalogSnapshot = get().currentCatalog;
          if (!catalogSnapshot || catalogSnapshot.id !== currentCatalog.id) break;

          const capturedRevision = get().localRevision;
          const expectedVersion = catalogSnapshot.version ?? 0;
          const targetVersion = expectedVersion === 0 ? 1 : expectedVersion + 1;

          set({
            isSaving: true,
            syncStatus: 'saving',
            syncError: null,
            inFlightSave: {
              catalogId: catalogSnapshot.id,
              expectedVersion,
              targetVersion,
              capturedRevision
            }
          });

          // 1. Salva em Cache Local (IndexedDB / localStorage backup)
          try {
            await StorageService.cacheCatalog(catalogSnapshot);
            set({ cachedAt: new Date().toISOString() });
          } catch (storageErr) {
            console.warn('Erro ao atualizar cache local:', storageErr);
          }

          const mutation = get().lastMutation;
          const clientId = getClientInstanceId();
          const summaryText = mutation
            ? `[client=${clientId}] [kind=${mutation.kind}] [target=${mutation.targetId || 'all'}] ${mutation.summary}`
            : `[client=${clientId}] [kind=MANUAL_EDIT] [target=all] Salvamento de "${catalogSnapshot.title}" (rev: ${capturedRevision})`;

          console.log('[CATALOG SAVE ORIGIN]', {
            clientInstanceId: clientId,
            catalogId: catalogSnapshot.id,
            expectedVersion,
            localRevision: capturedRevision,
            mutationKind: mutation?.kind || 'MANUAL_EDIT',
            mutationSummary: mutation?.summary || 'Salvamento de catálogo',
            pageStructure: getCatalogStructuralFingerprint(catalogSnapshot),
            timestamp: new Date().toISOString()
          });

          const payloadToSend: Catalog = {
            ...catalogSnapshot,
            lastMutation: mutation || {
              kind: 'MANUAL_EDIT',
              clientInstanceId: clientId,
              summary: 'Salvamento de catálogo',
              timestamp: new Date().toISOString()
            }
          };

          // 2. Envia para o Supabase via save_catalog_v3 com expectedVersion estrito
          const remoteRes = await SupabaseService.saveCatalog(
            payloadToSend,
            expectedVersion,
            summaryText
          );

          if (remoteRes.success && remoteRes.data) {
            const confirmedVersion = Number(remoteRes.data.version) || targetVersion;
            const nowIso = new Date().toISOString();

            // REGRA DE SEGURANÇA: Atualiza EXCLUSIVAMENTE a version confirmada sobre o estado corrente!
            const activeCurrent = get().currentCatalog;
            if (activeCurrent && activeCurrent.id === catalogSnapshot.id) {
              const nextCatalog = { ...activeCurrent, version: confirmedVersion };
              debugSetCatalog('saveCurrentCatalog:ACK', activeCurrent, nextCatalog, { confirmedVersion, capturedRevision });

              set({
                currentCatalog: nextCatalog,
                serverSavedAt: nowIso,
                lastSavedAt: nowIso,
                lastAcknowledgedLocalRevision: capturedRevision
              });
            }

            finalResult = {
              success: true,
              status: 'synced',
              version: confirmedVersion
            };

            // Verifica se ocorreram novas edições locais enquanto o save estava em voo
            const currentRev = get().localRevision;
            if (currentRev === capturedRevision && !queue.hasPending) {
              set({ isDirty: false, syncStatus: 'synced', syncError: null });
              break;
            }
          } else if (remoteRes.conflict || remoteRes.errorCode === '40001') {
            finalResult = {
              success: false,
              status: 'conflict',
              errorCode: '40001',
              error: remoteRes.error || 'Este catálogo foi atualizado em outro dispositivo.'
            };
            set({
              syncStatus: 'conflict',
              syncError: 'Este catálogo foi atualizado em outro dispositivo. Suas alterações locais foram preservadas.',
              isDirty: true
            });
            break;
          } else if (remoteRes.errorCode === '23505') {
            finalResult = {
              success: false,
              status: 'error',
              errorCode: '23505',
              error: 'Já existe um catálogo com este título no servidor.'
            };
            set({
              syncStatus: 'error',
              syncError: 'Já existe um catálogo com este título no servidor. Altere o nome.',
              isDirty: true
            });
            break;
          } else if (remoteRes.errorCode === '22023') {
            finalResult = {
              success: false,
              status: 'error',
              errorCode: '22023',
              error: remoteRes.error || 'Payload de catálogo inválido.'
            };
            set({
              syncStatus: 'error',
              syncError: 'Erro de validação: verifique a estrutura do catálogo.',
              isDirty: true
            });
            break;
          } else if (remoteRes.errorCode === '42501') {
            finalResult = {
              success: false,
              status: 'error',
              errorCode: '42501',
              error: 'Permissão negada para salvar catálogo.'
            };
            set({
              syncStatus: 'error',
              syncError: 'Permissão negada: sessão expirada ou perfil sem acesso.',
              isDirty: true
            });
            break;
          } else if (remoteRes.errorCode === 'CLIENT_OFFLINE' || remoteRes.errorCode === 'NETWORK_ERROR') {
            finalResult = {
              success: false,
              status: 'offline',
              errorCode: remoteRes.errorCode,
              error: remoteRes.error || 'Sem conexão com a nuvem.'
            };
            set({
              syncStatus: 'offline',
              syncError: 'Operando em modo offline. Alterações salvas no cache local.'
            });
            break;
          } else {
            finalResult = {
              success: false,
              status: 'error',
              errorCode: remoteRes.errorCode || 'UNKNOWN_ERROR',
              error: remoteRes.error || 'Erro ao salvar no servidor.'
            };
            set({
              syncStatus: 'error',
              syncError: remoteRes.error || 'Erro ao salvar no servidor.'
            });
            break;
          }
        }
      } finally {
        queue.isSaving = false;
        queue.inFlightPromise = null;
        set({ isSaving: false, inFlightSave: null });
      }
      return finalResult;
    })();

    queue.inFlightPromise = savePromise;
    return savePromise;
  },

  flushCatalog: async (catalogId?: string): Promise<SaveResult> => {
    const targetId = catalogId || get().currentCatalog?.id;
    if (!targetId) {
      return { success: false, status: 'error', error: 'Nenhum catálogo ativo para flush.' };
    }

    const queue = getCatalogQueue(targetId);
    if (queue.isSaving && queue.inFlightPromise) {
      await queue.inFlightPromise;
    }

    const current = get();
    if (
      current.currentCatalog &&
      current.currentCatalog.id === targetId &&
      (current.isDirty || current.localRevision > current.lastAcknowledgedLocalRevision)
    ) {
      return await get().saveCurrentCatalog();
    }

    return {
      success: true,
      status: 'synced',
      version: current.currentCatalog?.version
    };
  },

  saveAsNewCatalog: async (newTitle: string): Promise<SaveResult & { newCatalogId?: string }> => {
    const { currentCatalog, savedCatalogs } = get();
    if (!currentCatalog) {
      return { success: false, status: 'error', error: 'Nenhum catálogo ativo para duplicar/salvar como novo.' };
    }

    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      return { success: false, status: 'error', error: 'O título do novo catálogo não pode ser vazio.' };
    }

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

    const newCatalog: Catalog = {
      ...structuredClone(currentCatalog),
      id: newId,
      title: trimmedTitle,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMutation: {
        kind: 'CREATE_COPY',
        clientInstanceId: getClientInstanceId(),
        summary: `Criado como novo catálogo "${trimmedTitle}"`,
        timestamp: new Date().toISOString()
      }
    };

    set({ isSaving: true, syncStatus: 'saving', syncError: null });

    const summaryText = `[client=${getClientInstanceId()}] [kind=CREATE_COPY] Salvar como novo catálogo "${trimmedTitle}"`;
    const remoteRes = await SupabaseService.saveCatalog(newCatalog, 0, summaryText);

    if (remoteRes.success && remoteRes.data) {
      const confirmedVersion = Number(remoteRes.data.version) || 1;
      const createdCatalog: Catalog = {
        ...newCatalog,
        version: confirmedVersion
      };

      const updatedSavedList = [
        createdCatalog,
        ...savedCatalogs.filter((c) => c.id !== newId)
      ];

      debugSetCatalog('saveAsNewCatalog', currentCatalog, createdCatalog);
      set({
        currentCatalog: createdCatalog,
        savedCatalogs: updatedSavedList,
        activePageIndex: 0,
        selectedBlockId: null,
        isDirty: false,
        isSaving: false,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        inFlightSave: null,
        syncStatus: 'synced',
        syncError: null,
        serverSavedAt: new Date().toISOString(),
        lastSavedAt: new Date().toISOString()
      });

      StorageService.setActiveCatalogId(newId);
      updateCanonicalUrlCatalogId(newId);
      try {
        await StorageService.cacheCatalog(createdCatalog);
      } catch (e) {
        console.warn('Erro ao salvar cache:', e);
      }

      return {
        success: true,
        status: 'synced',
        version: confirmedVersion,
        newCatalogId: newId
      };
    } else {
      set({
        isSaving: false,
        syncStatus: 'error',
        syncError: remoteRes.error || 'Erro ao salvar como novo catálogo na nuvem.'
      });
      return {
        success: false,
        status: 'error',
        errorCode: remoteRes.errorCode,
        error: remoteRes.error || 'Erro ao salvar como novo catálogo.'
      };
    }
  },

  resolveConflictKeepLocal: async (): Promise<SaveResult> => {
    const { currentCatalog } = get();
    if (!currentCatalog) {
      return { success: false, status: 'error', error: 'Nenhum catálogo ativo.' };
    }
    const remoteRes = await get().loadWorkspace();
    const serverCat = remoteRes.catalogs.find((c) => c.id === currentCatalog.id);
    const serverVersion = serverCat ? serverCat.version : currentCatalog.version;

    set({
      currentCatalog: { ...currentCatalog, version: serverVersion },
      isDirty: true,
      syncStatus: 'dirty',
      syncError: null
    });
    return await get().saveCurrentCatalog();
  },

  resolveConflictReloadServer: async (): Promise<void> => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;
    const workspaceRes = await get().loadWorkspace();
    const targetRemote = workspaceRes.catalogs.find((c) => c.id === currentCatalog.id);
    if (targetRemote) {
      debugSetCatalog('resolveConflictReloadServer', currentCatalog, targetRemote);
      set({
        currentCatalog: targetRemote,
        isDirty: false,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        syncStatus: 'synced',
        syncError: null
      });
    }
  },

  // =========================================================================
  // FASE 1G & 1.2: WORKSPACE & REFRESH COM GUARDS DE SEGURANÇA
  // =========================================================================

  loadWorkspace: async () => {
    set({ isLoading: true });
    try {
      const remote = await SupabaseService.listWorkspace();
      if (remote.success && remote.data?.catalogs) {
        const remoteCatalogs: Catalog[] = remote.data.catalogs.map((rc: any) => {
          const brandData = typeof rc.brand === 'object' && rc.brand !== null ? rc.brand : {};
          return {
            id: rc.id,
            title: rc.name || brandData.title || 'Catálogo Técnico',
            subtitle: brandData.subtitle || '',
            themeId: brandData.themeId || 'default-technical',
            pages: Array.isArray(brandData.pages) ? brandData.pages : [],
            version: Number(rc.version) || 1,
            createdAt: rc.created_at,
            updatedAt: rc.updated_at
          };
        });

        set({ savedCatalogs: remoteCatalogs });

        for (const cat of remoteCatalogs) {
          void StorageService.cacheCatalog(cat);
        }
        return { success: true, catalogs: remoteCatalogs };
      }

      return {
        success: false,
        catalogs: [],
        errorType: 'server',
        error: remote.error || 'Falha ao obter workspace'
      };
    } catch (err: any) {
      console.warn('Erro ao carregar workspace remoto:', err);
      return {
        success: false,
        catalogs: [],
        errorType: 'offline',
        error: err.message || 'Erro de rede'
      };
    } finally {
      set({ isLoading: false });
    }
  },

  openCatalog: async (id: string) => {
    set({ isLoading: true });
    try {
      const workspaceRes = await get().loadWorkspace();
      if (workspaceRes.success) {
        const targetRemote = workspaceRes.catalogs.find((c) => c.id === id);
        if (targetRemote) {
          const prev = get().currentCatalog;
          debugSetCatalog('openCatalog:Remote', prev, targetRemote);
          set({
            currentCatalog: targetRemote,
            activePageIndex: 0,
            selectedBlockId: null,
            isDirty: false,
            isSaving: false,
            localRevision: 0,
            lastAcknowledgedLocalRevision: 0,
            syncStatus: 'synced',
            syncError: null
          });
          StorageService.setActiveCatalogId(id);
          updateCanonicalUrlCatalogId(id);
          return;
        } else {
          set({
            syncStatus: 'error',
            syncError: `O catálogo solicitado (${id}) não foi encontrado no servidor.`
          });
          return;
        }
      }

      // Fallback offline no StorageService
      const cached = await StorageService.loadCatalog(id);
      if (cached) {
        const prev = get().currentCatalog;
        debugSetCatalog('openCatalog:Cached', prev, cached);
        set({
          currentCatalog: cached,
          activePageIndex: 0,
          selectedBlockId: null,
          isDirty: false,
          isSaving: false,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0,
          syncStatus: 'offline',
          syncError: 'Catálogo carregado do cache local.'
        });
        StorageService.setActiveCatalogId(id);
        updateCanonicalUrlCatalogId(id);
      } else {
        set({
          syncStatus: 'error',
          syncError: `O catálogo solicitado (${id}) não foi encontrado.`
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  refreshCatalog: async (id: string) => {
    const stateAtStart = get();
    const catalogIdAtStart = stateAtStart.currentCatalog?.id;
    const revisionAtStart = stateAtStart.localRevision;
    const versionAtStart = stateAtStart.currentCatalog?.version ?? 0;

    // Guard inicial antes da chamada assíncrona
    if (
      stateAtStart.isDirty ||
      stateAtStart.isSaving ||
      stateAtStart.localRevision > stateAtStart.lastAcknowledgedLocalRevision
    ) {
      console.warn(`🛡️ [SAFETY GUARD] refreshCatalog(${id}) bloqueado no início para proteger alterações locais.`);
      set({
        syncStatus: 'conflict',
        syncError: 'Alteração remota detectada enquanto você editava. Suas alterações locais foram mantidas.'
      });
      return;
    }

    const workspaceRes = await get().loadWorkspace();
    const targetRemote = workspaceRes.catalogs.find((c) => c.id === id);

    // TOCTOU GUARD PÓS-AWAIT: Relê o estado em memória imediatamente antes de qualquer set()
    const currentState = get();
    const currentCatalog = currentState.currentCatalog;

    if (
      targetRemote &&
      currentCatalog &&
      currentCatalog.id === catalogIdAtStart &&
      currentState.localRevision === revisionAtStart &&
      !currentState.isDirty &&
      !currentState.isSaving &&
      currentState.localRevision <= currentState.lastAcknowledgedLocalRevision &&
      targetRemote.version > versionAtStart
    ) {
      // Análise Defensiva de Delta Estrutural contra perda injustificada de blocos
      const delta = analyzeCatalogStructuralDelta(currentCatalog, targetRemote);
      if (delta.removedBlocks.length > 0) {
        const remoteMutation = targetRemote.lastMutation;
        const isLegitimateBlockRemoval =
          remoteMutation?.kind === 'REMOVE_BLOCK' &&
          remoteMutation?.targetId &&
          delta.removedBlocks.some((rb) => rb.blockId === remoteMutation.targetId);

        if (!isLegitimateBlockRemoval) {
          console.warn('🚨 [DEFENSIVE GUARD] refreshCatalog rejeitou snapshot destrutivo sem evidência de REMOVE_BLOCK:', {
            delta,
            remoteMutation
          });
          set({
            syncStatus: 'conflict',
            syncError: 'Uma atualização remota removeria conteúdo deste catálogo. O conteúdo local foi preservado até confirmação.'
          });
          return;
        }
      }

      if (delta.removedPages.length > 0) {
        const remoteMutation = targetRemote.lastMutation;
        const isLegitimatePageRemoval =
          remoteMutation?.kind === 'REMOVE_PAGE' &&
          remoteMutation?.targetId &&
          delta.removedPages.includes(remoteMutation.targetId);

        if (!isLegitimatePageRemoval) {
          console.warn('🚨 [DEFENSIVE GUARD] refreshCatalog rejeitou snapshot com remoção não justificada de páginas:', {
            delta,
            remoteMutation
          });
          set({
            syncStatus: 'conflict',
            syncError: 'Uma atualização remota removeria conteúdo deste catálogo. O conteúdo local foi preservado até confirmação.'
          });
          return;
        }
      }

      debugSetCatalog('refreshCatalog:SafeApply', currentCatalog, targetRemote);
      set({
        currentCatalog: targetRemote,
        isDirty: false,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        syncStatus: 'synced',
        syncError: null
      });
    } else {
      console.warn(`🛡️ [TOCTOU GUARD] refreshCatalog(${id}) bloqueado pós-await: mutação local durante requisição ou snapshot defasado.`);
      if (currentState.isDirty || currentState.localRevision > revisionAtStart) {
        set({
          syncStatus: 'conflict',
          syncError: 'Edição local em andamento durante atualização remota. Suas alterações foram preservadas.'
        });
      }
    }
  },

  loadLatestCatalog: async () => {
    const initialCatalog = get().currentCatalog;
    const urlCatalogId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('catalog')
      : null;

    // Se já temos um catálogo ativo e não há parâmetro de URL exigindo outro catálogo:
    if (initialCatalog && !urlCatalogId) {
      console.log(`🛡️ [BOOTSTRAP GUARD] loadLatestCatalog ignorado: catálogo "${initialCatalog.title}" (${initialCatalog.id}) já ativo.`);
      return;
    }

    // Se já estamos com o catálogo solicitado na URL aberto:
    if (initialCatalog && urlCatalogId && initialCatalog.id === urlCatalogId) {
      console.log(`🛡️ [BOOTSTRAP GUARD] loadLatestCatalog ignorado: catálogo solicitado (${urlCatalogId}) já aberto.`);
      return;
    }

    set({ isLoading: true });
    try {
      const workspaceRes = await get().loadWorkspace();

      // Guard pós-await: se o usuário já editou algo enquanto a requisição rodava:
      const stateAfterAwait = get();
      if (stateAfterAwait.isDirty || stateAfterAwait.localRevision > 0) {
        console.warn(`🛡️ [BOOTSTRAP RACE GUARD] loadLatestCatalog bloqueado: edição local em andamento.`);
        return;
      }

      if (workspaceRes.success) {
        if (urlCatalogId) {
          const matched = workspaceRes.catalogs.find((c) => c.id === urlCatalogId);
          if (matched) {
            debugSetCatalog('loadLatestCatalog:UrlParam', get().currentCatalog, matched);
            set({
              currentCatalog: matched,
              activePageIndex: 0,
              selectedBlockId: null,
              isDirty: false,
              isSaving: false,
              localRevision: 0,
              lastAcknowledgedLocalRevision: 0,
              syncStatus: 'synced',
              syncError: null
            });
            StorageService.setActiveCatalogId(matched.id);
            updateCanonicalUrlCatalogId(matched.id);
            return;
          } else {
            console.error(`🚨 [CANONICAL URL] Catálogo com ID "${urlCatalogId}" não existe no workspace remoto.`);
            set({
              currentCatalog: null,
              syncStatus: 'error',
              syncError: `O catálogo solicitado na URL ("${urlCatalogId}") não foi encontrado no servidor.`
            });
            return;
          }
        }

        if (workspaceRes.catalogs.length > 0) {
          const preferredId = StorageService.getActiveCatalogId();
          const targetCatalog = (preferredId ? workspaceRes.catalogs.find((c) => c.id === preferredId) : null) || workspaceRes.catalogs[0];

          debugSetCatalog('loadLatestCatalog:Remote', get().currentCatalog, targetCatalog);
          set({
            currentCatalog: targetCatalog,
            activePageIndex: 0,
            selectedBlockId: null,
            isDirty: false,
            isSaving: false,
            localRevision: 0,
            lastAcknowledgedLocalRevision: 0,
            syncStatus: 'synced',
            syncError: null
          });
          StorageService.setActiveCatalogId(targetCatalog.id);
          updateCanonicalUrlCatalogId(targetCatalog.id);
          return;
        } else {
          await get().createCatalogFromPreset();
          return;
        }
      }

      // Fallback offline
      const cached = await StorageService.loadCatalog(urlCatalogId || undefined);
      if (cached) {
        debugSetCatalog('loadLatestCatalog:Cached', get().currentCatalog, cached);
        set({
          currentCatalog: cached,
          activePageIndex: 0,
          selectedBlockId: null,
          isDirty: false,
          isSaving: false,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0,
          syncStatus: 'offline',
          syncError: 'Operando em modo offline com cache local.'
        });
        updateCanonicalUrlCatalogId(cached.id);
      } else {
        if (urlCatalogId) {
          set({
            currentCatalog: null,
            syncStatus: 'error',
            syncError: `O catálogo com ID "${urlCatalogId}" não foi encontrado em cache nem no servidor.`
          });
        } else {
          await get().createCatalogFromPreset();
        }
      }
    } catch (err: any) {
      console.warn('Erro no bootstrap loadLatestCatalog:', err);
      set({
        syncStatus: 'error',
        syncError: err?.message || 'Erro ao inicializar catálogo.'
      });
    } finally {
      set({ isLoading: false });
    }
  },

  loadAllCatalogs: async () => {
    await get().loadWorkspace();
  },

  loadCatalogById: async (id: string) => {
    await get().openCatalog(id);
  },

  duplicateCatalog: async (id: string): Promise<SaveResult | null> => {
    const { savedCatalogs } = get();
    const source = savedCatalogs.find((c) => c.id === id) || (await StorageService.loadCatalog(id));
    if (!source) return null;

    const existingTitles = savedCatalogs.map((c) => c.title);
    const uniqueTitle = generateUniqueCatalogTitle(source.title, existingTitles);

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
    const duplicated: Catalog = {
      ...structuredClone(source),
      id: newId,
      title: uniqueTitle,
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    debugSetCatalog('duplicateCatalog', get().currentCatalog, duplicated);
    set({
      currentCatalog: duplicated,
      activePageIndex: 0,
      selectedBlockId: null,
      localRevision: 1,
      lastAcknowledgedLocalRevision: 0,
      isDirty: true,
      syncStatus: 'saving'
    });

    const result = await get().saveCurrentCatalog();
    if (result.success) {
      StorageService.setActiveCatalogId(newId);
      updateCanonicalUrlCatalogId(newId);
    }
    await get().loadWorkspace();
    return result;
  },

  deleteCatalog: async (id: string) => {
    try {
      await SupabaseService.deleteCatalog(id);
    } catch (e) {
      console.warn('Erro ao excluir no Supabase:', e);
    }
    await StorageService.deleteCatalog(id);

    const workspaceRes = await get().loadWorkspace();
    const remaining = workspaceRes.catalogs;
    const { currentCatalog } = get();

    if (currentCatalog && currentCatalog.id === id) {
      if (remaining.length > 0) {
        debugSetCatalog('deleteCatalog:Remaining', currentCatalog, remaining[0]);
        set({
          currentCatalog: remaining[0],
          activePageIndex: 0,
          selectedBlockId: null,
          isDirty: false,
          isSaving: false,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0,
          syncStatus: 'synced'
        });
        StorageService.setActiveCatalogId(remaining[0].id);
        updateCanonicalUrlCatalogId(remaining[0].id);
      } else {
        await get().createCatalogFromPreset();
      }
    }
  },

  createCatalogFromPreset: async (name = 'Novo Catálogo Técnico PRESYS', presetId?: string): Promise<SaveResult> => {
    const basePreset = (presetId ? SYSTEM_PRESETS.find((p) => p.id === presetId) : null) || SYSTEM_PRESETS[0];
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

    const newCatalog: Catalog = {
      ...structuredClone(basePreset.catalog),
      id: newId,
      title: name,
      version: 0,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    debugSetCatalog('createCatalogFromPreset', get().currentCatalog, newCatalog);
    set({
      currentCatalog: newCatalog,
      activePageIndex: 0,
      selectedBlockId: null,
      localRevision: 1,
      lastAcknowledgedLocalRevision: 0,
      isDirty: true,
      syncStatus: 'saving'
    });

    const result = await get().saveCurrentCatalog();
    if (result.success) {
      StorageService.setActiveCatalogId(newId);
      updateCanonicalUrlCatalogId(newId);
    }
    return result;
  }
}));
