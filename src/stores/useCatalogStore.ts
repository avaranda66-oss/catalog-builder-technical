import { create } from 'zustand';
import {
  Catalog,
  ContentBlock,
  CatalogPage,
  CatalogTableRow,
  TableColumnConfig,
  MutationMetadata,
  MutationKind,
  generateUniqueCatalogTitle,
  analyzeCatalogStructuralDelta,
  EditorDocumentContext
} from '../domain/catalog.schema';
import { StorageService } from '../services/storage.service';
import { SupabaseService, templateRowToCatalogPreset } from '../services/supabase.service';
import { useTemplateStore } from './useTemplateStore';
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

export function updateCanonicalUrlDocument(context: EditorDocumentContext) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (context.kind === 'catalog') {
      if (url.searchParams.get('catalog') !== context.catalogId) {
        url.searchParams.set('catalog', context.catalogId);
      }
      url.searchParams.delete('template');
    } else if (context.kind === 'template') {
      if (url.searchParams.get('template') !== context.templateId) {
        url.searchParams.set('template', context.templateId);
      }
      url.searchParams.delete('catalog');
    }
    window.history.replaceState({}, '', url.toString());
  } catch (e) {
    console.warn('Erro ao atualizar URL canônica do documento:', e);
  }
}

export function updateCanonicalUrlCatalogId(catalogId: string) {
  updateCanonicalUrlDocument({ kind: 'catalog', catalogId });
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

  // Manipulação de Linhas, Colunas e Overrides Locais em Tabelas
  commitDocumentMutation: (
    updater: (draft: Catalog) => Catalog | void,
    mutationKind: MutationKind,
    details?: {
      targetId?: string;
      targetPageId?: string;
      targetRowId?: string;
      fieldKey?: string;
      summary?: string;
    }
  ) => void;
  updateCellOverride: (blockId: string, rowId: string, fieldKey: string, value: string) => void;
  restoreCellToLibrary: (blockId: string, rowId: string, fieldKey: string) => void;
  addRowToTable: (blockId: string, productRefId: string) => void;
  removeRowFromTable: (blockId: string, rowId: string) => void;
  addTableColumn: (blockId: string, column: TableColumnConfig) => void;
  removeTableColumn: (blockId: string, columnKey: string) => void;
  renameTableColumn: (blockId: string, columnKey: string, newLabel: string) => void;
  updateTableColumn: (blockId: string, columnKey: string, updates: Partial<TableColumnConfig>) => void;

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
  editorContext: EditorDocumentContext;
  setEditorContext: (ctx: EditorDocumentContext) => void;
  openTemplateForEditing: (templateId: string) => Promise<void>;
  saveActiveDocument: () => Promise<SaveResult>;
  flushCatalog: (catalogId?: string) => Promise<SaveResult>;
  handleTemplateFlushAck: (templateId: string, confirmedVersion: number, error?: string) => void;
  createCatalogFromPreset: (name?: string, presetId?: string) => Promise<SaveResult>;
  createTranslatedCatalogVersion: (translatedCatalog: Catalog) => Promise<{ success: boolean; catalogId?: string; error?: string }>;
  resolveConflictKeepLocal: () => Promise<SaveResult>;
  resolveConflictReloadServer: () => Promise<void>;
  resetWorkspaceForIdentityChange: () => void;
  handleRealtimeTemplateChange: (payload: { eventType: string; new?: any; old?: any }) => void;
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
  editorContext: { kind: 'catalog', catalogId: '' },
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

  setEditorContext: (editorContext) => set({ editorContext }),

  saveActiveDocument: async (): Promise<SaveResult> => {
    const { editorContext, currentCatalog } = get();
    if (!currentCatalog) return { success: false, status: 'error', error: 'Nenhum documento ativo' };

    if (editorContext.kind === 'catalog') {
      return await get().flushCatalog(editorContext.catalogId || currentCatalog?.id);
    } else if (editorContext.kind === 'template') {
      const templateId = editorContext.templateId || currentCatalog.id;
      if (!templateId) {
        return { success: false, status: 'error', error: 'ID do template ausente' };
      }
      if (currentCatalog) {
        await useTemplateStore.getState().updateCustomTemplate(
          templateId,
          currentCatalog,
          currentCatalog.version,
          currentCatalog.title
        );
      }
      const res = await useTemplateStore.getState().flushTemplate(templateId);
      if (res.success && res.data) {
        const confirmedVersion = res.data.version || (currentCatalog.version ? currentCatalog.version + 1 : 1);
        if (get().currentCatalog) {
          get().setCurrentCatalog({
            ...get().currentCatalog!,
            version: confirmedVersion
          }, false);
        }
        set({
          isDirty: false,
          isSaving: false,
          syncStatus: 'synced',
          syncError: null,
          serverSavedAt: new Date().toISOString(),
          lastSavedAt: new Date().toISOString(),
          lastAcknowledgedLocalRevision: get().localRevision
        });
        return { success: true, status: 'synced', version: confirmedVersion };
      }
      if (res.conflict) {
        set({ isDirty: true, isSaving: false, syncStatus: 'conflict', syncError: res.error });
        return {
          success: false,
          status: 'conflict',
          errorCode: '40001',
          error: res.error
        };
      }
      set({ isDirty: true, isSaving: false, syncStatus: 'error', syncError: res.error });
      return {
        success: false,
        status: 'error',
        error: res.error
      };
    }
    return { success: false, status: 'error', error: 'Contexto de documento desconhecido' };
  },

  openTemplateForEditing: async (templateId: string) => {
    set({ isLoading: true });
    try {
      // 1. Flush de documento anterior se dirty
      const currentCtx = get().editorContext;
      if (currentCtx.kind === 'catalog' && get().isDirty) {
        await get().flushCatalog(currentCtx.catalogId);
      } else if (currentCtx.kind === 'template' && get().isDirty) {
        await useTemplateStore.getState().flushTemplate(currentCtx.templateId);
      }

      // 2. Localiza template na store ou no Supabase
      let template = useTemplateStore.getState().customTemplates.find((t) => t.id === templateId);
      if (!template) {
        const res = await SupabaseService.getTemplate(templateId);
        if (res.success && res.data) {
          template = res.data;
        }
      }

      if (!template) {
        set({
          syncStatus: 'error',
          syncError: `O template solicitado (${templateId}) não foi encontrado.`
        });
        return;
      }

      // 3. Carrega o clone do layout do template para o Studio
      const templateCatalog = structuredClone(template.catalog);
      templateCatalog.id = template.id;
      templateCatalog.title = template.name;
      templateCatalog.version = template.version || 1;

      debugSetCatalog('openTemplateForEditing', get().currentCatalog, templateCatalog);

      set({
        currentCatalog: templateCatalog,
        editorContext: { kind: 'template', templateId: template.id },
        activePageIndex: 0,
        selectedBlockId: null,
        isDirty: false,
        isSaving: false,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        inFlightSave: null,
        syncStatus: 'synced',
        syncError: null
      });

      updateCanonicalUrlDocument({ kind: 'template', templateId: template.id });

      // 4. Conecta presença no canal do template
      try {
        const { usePresenceStore } = await import('./usePresenceStore');
        usePresenceStore.getState().initializePresence(template.id, 1, undefined, 'template');
      } catch (e) {
        console.warn('Erro ao conectar presença de template:', e);
      }
    } finally {
      set({ isLoading: false });
    }
  },

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

  // =========================================================================
  // FASE P0.4: PIPELINE UNIFICADO DE MUTAÇÃO DOCUMENTAL (UNIVERSAL PERSISTENCE)
  // =========================================================================

  commitDocumentMutation: (updater, mutationKind, details) => {
    const { currentCatalog, localRevision, editorContext } = get();
    if (!currentCatalog) return;

    const draft = structuredClone(currentCatalog);
    const updated = updater(draft) || draft;
    updated.updatedAt = new Date().toISOString();

    const nextRev = localRevision + 1;
    const clientId = getClientInstanceId();
    const mutation: MutationMetadata = {
      kind: mutationKind,
      clientInstanceId: clientId,
      targetId: details?.targetId,
      targetPageId: details?.targetPageId,
      targetRowId: details?.targetRowId,
      fieldKey: details?.fieldKey,
      summary: details?.summary || `Mutation ${mutationKind} on ${currentCatalog.id}`,
      timestamp: new Date().toISOString()
    };

    updated.lastMutation = mutation;

    const isDebug = typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('debugRealtime') === '1' ||
      import.meta.env.DEV
    );

    if (isDebug) {
      console.log('[MUTATION]', {
        kind: mutationKind,
        documentKind: editorContext.kind,
        documentId: currentCatalog.id,
        revision: nextRev,
        pageId: details?.targetPageId,
        blockId: details?.targetId,
        rowId: details?.targetRowId,
        fieldKey: details?.fieldKey,
        summary: mutation.summary
      });
    }

    debugSetCatalog(mutationKind, currentCatalog, updated, { localRevision: nextRev });

    set({
      currentCatalog: updated,
      localRevision: nextRev,
      lastMutation: mutation,
      isDirty: true,
      syncStatus: 'dirty'
    });

    void get().saveCurrentCatalog();
  },

  addPage: (type = 'technical') => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;
    const newPageNumber = currentCatalog.pages.length + 1;
    const newPageId = `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newPage: CatalogPage = {
      id: newPageId,
      pageNumber: newPageNumber,
      pageType: type,
      title: `Folha ${newPageNumber}`,
      blocks: []
    };

    get().commitDocumentMutation(
      (draft) => {
        draft.pages.push(newPage);
      },
      'ADD_PAGE',
      { targetId: newPageId, summary: `Adicionada Folha ${newPageNumber} (${type})` }
    );
    set({ activePageIndex: currentCatalog.pages.length });
  },

  removePage: (pageId) => {
    const { currentCatalog, activePageIndex } = get();
    if (!currentCatalog || currentCatalog.pages.length <= 1) return;

    get().commitDocumentMutation(
      (draft) => {
        draft.pages = draft.pages
          .filter((p) => p.id !== pageId)
          .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
      },
      'REMOVE_PAGE',
      { targetId: pageId, summary: `Removida página ${pageId}` }
    );
    const updatedCount = get().currentCatalog?.pages.length || 1;
    set({ activePageIndex: Math.min(activePageIndex, updatedCount - 1) });
  },

  reorderPages: (fromIndex, toIndex) => {
    get().commitDocumentMutation(
      (draft) => {
        const pages = [...draft.pages];
        const [moved] = pages.splice(fromIndex, 1);
        pages.splice(toIndex, 0, moved);
        draft.pages = pages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
      },
      'REORDER_PAGES',
      { summary: `Reordenadas páginas da posição ${fromIndex + 1} para ${toIndex + 1}` }
    );
    set({ activePageIndex: toIndex });
  },

  setPageTitle: (pageId, title) => {
    get().commitDocumentMutation(
      (draft) => {
        draft.pages = draft.pages.map((p) => (p.id === pageId ? { ...p, title } : p));
      },
      'EDIT_TEXT',
      { targetId: pageId, summary: `Título da página ${pageId} alterado para "${title}"` }
    );
  },

  addBlock: (pageId, blockData) => {
    const newBlockId = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newBlock: ContentBlock = {
      ...blockData,
      id: newBlockId
    };

    get().commitDocumentMutation(
      (draft) => {
        const page = draft.pages.find((p) => p.id === pageId);
        if (page) {
          page.blocks = [...(page.blocks || []), newBlock];
        }
      },
      'ADD_BLOCK',
      { targetId: newBlockId, targetPageId: pageId, summary: `Adicionado bloco ${newBlock.type} "${newBlock.title || ''}" à página ${pageId}` }
    );
    set({ selectedBlockId: newBlockId });
  },

  updateBlock: (pageId, blockId, updates) => {
    get().commitDocumentMutation(
      (draft) => {
        const page = draft.pages.find((p) => p.id === pageId);
        if (page) {
          page.blocks = (page.blocks || []).map((b) => (b.id === blockId ? { ...b, ...updates } : b));
        }
      },
      'UPDATE_BLOCK',
      { targetId: blockId, targetPageId: pageId, summary: `Atualizado bloco ${blockId} na página ${pageId}` }
    );
  },

  removeBlock: (pageId, blockId) => {
    get().commitDocumentMutation(
      (draft) => {
        const page = draft.pages.find((p) => p.id === pageId);
        if (page) {
          page.blocks = (page.blocks || []).filter((b) => b.id !== blockId);
        }
      },
      'REMOVE_BLOCK',
      { targetId: blockId, targetPageId: pageId, summary: `Removido bloco ${blockId} da página ${pageId}` }
    );
    set({ selectedBlockId: null });
  },

  updateCellOverride: (blockId, rowId, fieldKey, value) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableRows) {
            block.tableRows = block.tableRows.map((r) => {
              if (r.id !== rowId) return r;
              return {
                ...r,
                localOverrides: {
                  ...(r.localOverrides || {}),
                  [fieldKey]: value
                }
              };
            });
            break;
          }
        }
      },
      'UPDATE_TABLE_CELL',
      { targetId: blockId, targetRowId: rowId, fieldKey, summary: `Override na célula [row=${rowId}, col=${fieldKey}] alterado para "${value}"` }
    );
  },

  restoreCellToLibrary: (blockId, rowId, fieldKey) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableRows) {
            block.tableRows = block.tableRows.map((r) => {
              if (r.id !== rowId || !r.localOverrides) return r;
              const updatedOverrides = { ...r.localOverrides };
              delete updatedOverrides[fieldKey];
              return {
                ...r,
                localOverrides: updatedOverrides
              };
            });
            break;
          }
        }
      },
      'RESTORE_TABLE_CELL',
      { targetId: blockId, targetRowId: rowId, fieldKey, summary: `Célula [row=${rowId}, col=${fieldKey}] restaurada para o padrão` }
    );
  },

  addRowToTable: (blockId, productRefId) => {
    const rowId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block) {
            const currentRows = block.tableRows || [];
            const newRow: CatalogTableRow = {
              id: rowId,
              productRefId,
              localOverrides: {},
              customNotes: '',
              order: currentRows.length
            };
            block.tableRows = [...currentRows, newRow];
            break;
          }
        }
      },
      'ADD_TABLE_ROW',
      { targetId: blockId, targetRowId: rowId, summary: `Adicionado produto ${productRefId} (row: ${rowId}) ao bloco ${blockId}` }
    );
  },

  removeRowFromTable: (blockId, rowId) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableRows) {
            block.tableRows = block.tableRows.filter((r) => r.id !== rowId);
            break;
          }
        }
      },
      'REMOVE_TABLE_ROW',
      { targetId: blockId, targetRowId: rowId, summary: `Removida linha ${rowId} do bloco ${blockId}` }
    );
  },

  addTableColumn: (blockId, column) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block) {
            block.tableColumns = [...(block.tableColumns || []), column];
            break;
          }
        }
      },
      'ADD_TABLE_COLUMN',
      { targetId: blockId, fieldKey: column.key, summary: `Adicionada coluna "${column.label}" ao bloco ${blockId}` }
    );
  },

  removeTableColumn: (blockId, columnKey) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableColumns) {
            block.tableColumns = block.tableColumns.filter((c) => c.key !== columnKey);
            break;
          }
        }
      },
      'REMOVE_TABLE_COLUMN',
      { targetId: blockId, fieldKey: columnKey, summary: `Removida coluna "${columnKey}" do bloco ${blockId}` }
    );
  },

  renameTableColumn: (blockId, columnKey, newLabel) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableColumns) {
            block.tableColumns = block.tableColumns.map((c) =>
              c.key === columnKey ? { ...c, label: newLabel } : c
            );
            break;
          }
        }
      },
      'RENAME_TABLE_COLUMN',
      { targetId: blockId, fieldKey: columnKey, summary: `Coluna "${columnKey}" renomeada para "${newLabel}" no bloco ${blockId}` }
    );
  },

  updateTableColumn: (blockId, columnKey, updates) => {
    get().commitDocumentMutation(
      (draft) => {
        for (const page of draft.pages) {
          const block = page.blocks?.find((b) => b.id === blockId);
          if (block && block.tableColumns) {
            block.tableColumns = block.tableColumns.map((c) =>
              c.key === columnKey ? { ...c, ...updates } : c
            );
            break;
          }
        }
      },
      'UPDATE_BLOCK',
      { targetId: blockId, fieldKey: columnKey, summary: `Coluna "${columnKey}" atualizada no bloco ${blockId}` }
    );
  },

  handleTemplateFlushAck: (templateId: string, confirmedVersion: number, error?: string) => {
    const { editorContext, currentCatalog } = get();
    if (editorContext.kind !== 'template' || !currentCatalog) return;
    if (editorContext.templateId !== templateId && currentCatalog.id !== templateId) return;

    if (error) {
      set({ isSaving: false, syncStatus: 'error', syncError: error });
      return;
    }

    const nextCatalog = { ...currentCatalog, version: confirmedVersion };
    set({
      currentCatalog: nextCatalog,
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      serverSavedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString(),
      lastAcknowledgedLocalRevision: get().localRevision
    });
  },

  // =========================================================================
  // FASE P0.4: FILA SINGLE-FLIGHT UNIFICADA PARA CATALOG E TEMPLATE
  // =========================================================================

  saveCurrentCatalog: async (): Promise<SaveResult> => {
    const { currentCatalog, editorContext } = get();
    if (!currentCatalog) {
      return { success: false, status: 'error', error: 'Nenhum documento ativo para salvar.' };
    }

    // MODO TEMPLATE: Agendamento de persistência debounced no TemplateStore
    if (editorContext.kind === 'template') {
      const templateId = editorContext.templateId || currentCatalog.id;
      const expectedVer = currentCatalog.version ?? 1;
      set({ isSaving: true, syncStatus: 'saving', isDirty: true });
      void useTemplateStore.getState().updateCustomTemplate(
        templateId,
        currentCatalog,
        expectedVer,
        currentCatalog.title
      );
      return { success: true, status: 'saving', version: expectedVer };
    }

    // MODO CATÁLOGO: Fila Single-Flight por catálogo
    const queue = getCatalogQueue(currentCatalog.id);

    if (queue.isSaving) {
      queue.hasPending = true;
      if (queue.inFlightPromise) {
        return queue.inFlightPromise;
      }
      return { success: true, status: 'saving' };
    }

    queue.isSaving = true;

    // Watchdog Timer de 10s para garantir que saving nunca trave
    let watchdogTimer: any = null;
    const watchdogPromise = new Promise<{ timeout: boolean }>((resolve) => {
      watchdogTimer = setTimeout(() => {
        resolve({ timeout: true });
      }, 10000);
    });

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

          // 1. Salva em Cache Local
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

          const isDebug = typeof window !== 'undefined' && (
            new URLSearchParams(window.location.search).get('debugRealtime') === '1' ||
            import.meta.env.DEV
          );

          if (isDebug) {
            console.log('[SAVE SCHEDULED]', {
              documentKind: 'catalog',
              documentId: catalogSnapshot.id,
              expectedVersion,
              capturedRevision,
              mutationKind: mutation?.kind || 'MANUAL_EDIT'
            });
          }

          const payloadToSend: Catalog = {
            ...catalogSnapshot,
            lastMutation: mutation || {
              kind: 'MANUAL_EDIT',
              clientInstanceId: clientId,
              summary: 'Salvamento de catálogo',
              timestamp: new Date().toISOString()
            }
          };

          const remoteRes = await SupabaseService.saveCatalog(
            payloadToSend,
            expectedVersion,
            summaryText
          );

          if (remoteRes.success && remoteRes.data) {
            const confirmedVersion = Number(remoteRes.data.version) || targetVersion;
            const nowIso = new Date().toISOString();

            if (isDebug) {
              console.log('[SAVE ACK]', {
                documentKind: 'catalog',
                documentId: catalogSnapshot.id,
                confirmedVersion,
                capturedRevision
              });
            }

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

            const currentRev = get().localRevision;
            if (currentRev === capturedRevision && !queue.hasPending) {
              set({ isDirty: false, syncStatus: 'synced', syncError: null, isSaving: false });
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
              isDirty: true,
              isSaving: false
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
              isDirty: true,
              isSaving: false
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
              isDirty: true,
              isSaving: false
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
              isDirty: true,
              isSaving: false
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
              syncError: 'Operando em modo offline. Alterações salvas no cache local.',
              isSaving: false
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
              syncError: remoteRes.error || 'Erro ao salvar no servidor.',
              isDirty: true,
              isSaving: false
            });
            break;
          }
        }
      } finally {
        if (watchdogTimer) clearTimeout(watchdogTimer);
        queue.isSaving = false;
        queue.inFlightPromise = null;
        set({ isSaving: false, inFlightSave: null });
      }
      return finalResult;
    })();

    queue.inFlightPromise = Promise.race([savePromise, watchdogPromise.then((wd) => {
      if (wd && (wd as any).timeout) {
        set({ isSaving: false, syncStatus: 'error', syncError: 'Tempo limite de salvamento excedido (watchdog 10s).' });
        return { success: false, status: 'error' as const, error: 'Tempo limite de salvamento excedido.' };
      }
      return savePromise;
    })]);

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
            editorContext: { kind: 'catalog', catalogId: id },
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
          updateCanonicalUrlDocument({ kind: 'catalog', catalogId: id });
          try {
            const { usePresenceStore } = await import('./usePresenceStore');
            usePresenceStore.getState().initializePresence(id, 1, undefined, 'catalog');
          } catch (e) {
            console.warn('Erro ao conectar presença no catálogo:', e);
          }
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
          editorContext: { kind: 'catalog', catalogId: id },
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
        updateCanonicalUrlDocument({ kind: 'catalog', catalogId: id });
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
    const urlParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    const urlTemplateId = urlParams.get('template');
    const urlCatalogId = urlParams.get('catalog');

    // 1. Se a URL possui ?template=<id>, abre o template diretamente para edição
    if (urlTemplateId) {
      await get().openTemplateForEditing(urlTemplateId);
      return;
    }

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
              editorContext: { kind: 'catalog', catalogId: matched.id },
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
            updateCanonicalUrlDocument({ kind: 'catalog', catalogId: matched.id });
            try {
              const { usePresenceStore } = await import('./usePresenceStore');
              usePresenceStore.getState().initializePresence(matched.id, 1, undefined, 'catalog');
            } catch (e) {
              console.warn('Erro ao conectar presença:', e);
            }
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
            editorContext: { kind: 'catalog', catalogId: targetCatalog.id },
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
          updateCanonicalUrlDocument({ kind: 'catalog', catalogId: targetCatalog.id });
          try {
            const { usePresenceStore } = await import('./usePresenceStore');
            usePresenceStore.getState().initializePresence(targetCatalog.id, 1, undefined, 'catalog');
          } catch (e) {
            console.warn('Erro ao conectar presença:', e);
          }
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
  },

  createTranslatedCatalogVersion: async (
    translatedCatalog: Catalog
  ): Promise<{ success: boolean; catalogId?: string; error?: string }> => {
    try {
      // 1. Verificação Estrita de Source Drift antes de criar/salvar
      const meta = translatedCatalog.translationMeta;
      if (meta?.sourceCatalogId && meta?.sourceCatalogVersion !== undefined && meta?.sourceContentHash) {
        let currentSource: Catalog | null = null;
        try {
          const res = await SupabaseService.getCatalog(meta.sourceCatalogId);
          if (res.success && res.data) {
            currentSource = res.data;
          }
        } catch {
          // Fallback para memória local
        }
        if (!currentSource) {
          const { savedCatalogs } = get();
          currentSource = savedCatalogs.find((c) => c.id === meta.sourceCatalogId) || null;
        }

        if (currentSource) {
          const { FullCatalogTranslationService } = await import('../translation/full-catalog-translation.service');
          const hasDrift = await FullCatalogTranslationService.verifySourceDrift(
            currentSource,
            meta.sourceCatalogVersion,
            meta.sourceContentHash
          );

          if (hasDrift) {
            console.error('🚨 [TRANSLATION DRIFT GUARD] Salvamento bloqueado: o catálogo original foi alterado concorrentemente.');
            return {
              success: false,
              error: 'O catálogo original foi modificado durante o processo de tradução. A versão traduzida não pode ser salva para evitar inconsistências (SOURCE_CHANGED_DURING_TRANSLATION).'
            };
          }
        }
      }

      // 2. Criação da nova entidade com novo UUID
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

      const newCatalogToSave: Catalog = {
        ...structuredClone(translatedCatalog),
        id: newId,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 3. Persistência real na nuvem via SupabaseService
      const saveRes = await SupabaseService.saveCatalog(newCatalogToSave, 0, 'Criação de versão traduzida');
      if (!saveRes.success || !saveRes.data) {
        return {
          success: false,
          error: saveRes.error || 'Não foi possível salvar a versão traduzida na nuvem.'
        };
      }

      const confirmedCatalog: Catalog = {
        ...newCatalogToSave,
        version: saveRes.data.version || 1,
        updatedAt: saveRes.data.updated_at || new Date().toISOString()
      };

      // 4. Atualização segura do StorageService local
      await StorageService.saveCatalog(confirmedCatalog);
      StorageService.setActiveCatalogId(newId);

      // 5. Atualização atômica do Zustand State e Contexto do Editor
      debugSetCatalog('createTranslatedCatalogVersion', get().currentCatalog, confirmedCatalog);
      set((state) => ({
        currentCatalog: confirmedCatalog,
        savedCatalogs: [confirmedCatalog, ...state.savedCatalogs.filter((c) => c.id !== newId)],
        editorContext: { kind: 'catalog', catalogId: newId },
        activePageIndex: 0,
        selectedBlockId: null,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        isDirty: false,
        isSaving: false,
        syncStatus: 'synced',
        syncError: null,
        lastSavedAt: new Date().toISOString()
      }));

      // 6. Atualiza URL Canônica
      updateCanonicalUrlCatalogId(newId);

      // 7. Conecta presença em background se disponível
      try {
        const { usePresenceStore } = await import('./usePresenceStore');
        usePresenceStore.getState().initializePresence(newId, 1, undefined, 'catalog');
      } catch (e) {
        console.warn('Erro ao conectar presença na versão traduzida:', e);
      }

      return {
        success: true,
        catalogId: newId
      };
    } catch (err: any) {
      console.error('Erro ao criar versão traduzida:', err);
      return {
        success: false,
        error: err?.message || 'Erro inesperado ao salvar versão traduzida.'
      };
    }
  },

  handleRealtimeTemplateChange: (payload) => {
    const { editorContext, currentCatalog, isDirty, localRevision, lastAcknowledgedLocalRevision } = get();
    if (editorContext.kind !== 'template' || !currentCatalog) return;

    const changedId = payload.new?.id || payload.old?.id;
    if (changedId !== editorContext.templateId && changedId !== currentCatalog.id) return;

    if (payload.eventType === 'UPDATE' && payload.new) {
      const updatedPreset = templateRowToCatalogPreset(payload.new);
      const remoteVer = updatedPreset.version || 0;
      const currentVer = currentCatalog.version || 0;

      if (remoteVer > currentVer) {
        const isLocalDirty = isDirty || localRevision > lastAcknowledgedLocalRevision;
        if (!isLocalDirty) {
          const remoteCatalog = structuredClone(updatedPreset.catalog);
          remoteCatalog.id = updatedPreset.id;
          remoteCatalog.title = updatedPreset.name;
          remoteCatalog.version = remoteVer;
          get().setCurrentCatalog(remoteCatalog, false);
          set({ syncStatus: 'synced', syncError: null });
        } else {
          set({
            syncStatus: 'conflict',
            syncError: 'Uma nova versão deste template foi publicada por outro usuário enquanto você editava. Suas alterações locais foram mantidas.'
          });
        }
      }
    }
  }
}));

// Subscrição unidirecional para sincronizar ACK de flush do TemplateStore sem dependência circular
useTemplateStore.subscribe((templateState, prevTemplateState) => {
  if (prevTemplateState.syncStatus === 'saving' && templateState.syncStatus === 'synced') {
    const activeCtx = useCatalogStore.getState().editorContext;
    if (activeCtx.kind === 'template') {
      const activeCat = useCatalogStore.getState().currentCatalog;
      const matching = templateState.customTemplates.find(
        (t) => t.id === activeCtx.templateId || t.id === activeCat?.id
      );
      if (matching && activeCat) {
        useCatalogStore.getState().handleTemplateFlushAck(
          matching.id,
          matching.version || (activeCat.version ? activeCat.version + 1 : 1)
        );
      }
    }
  } else if (prevTemplateState.syncStatus === 'saving' && templateState.syncStatus === 'conflict') {
    const activeCtx = useCatalogStore.getState().editorContext;
    if (activeCtx.kind === 'template') {
      useCatalogStore.setState({
        isSaving: false,
        syncStatus: 'conflict',
        syncError: templateState.syncError || 'Conflito detectado no salvamento do template.'
      });
    }
  }
});


