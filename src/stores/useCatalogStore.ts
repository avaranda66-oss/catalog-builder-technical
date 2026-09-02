import { create } from 'zustand';
import { Catalog, ContentBlock } from '../domain/catalog.schema';
import { StorageService } from '../services/storage.service';
import { SupabaseService } from '../services/supabase.service';
import { SYSTEM_PRESETS } from '../data/presets';

export type SyncStatus = 'synced' | 'saving' | 'dirty' | 'conflict' | 'error' | 'offline';

interface CatalogState {
  currentCatalog: Catalog | null;
  activePageIndex: number;
  selectedBlockId: string | null;

  // Status de Sincronização & Persistência (Fase 1B/1C)
  isSaving: boolean;
  isDirty: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  serverSavedAt: string | null;
  cachedAt: string | null;
  lastSavedAt: string | null; // Compatibilidade de UI

  savedCatalogs: Catalog[];
  isLoading: boolean;

  // Actions principais
  setCurrentCatalog: (catalog: Catalog) => void;
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

  // Persistência & Fila Single-Flight
  saveCurrentCatalog: () => Promise<void>;
  loadWorkspace: () => Promise<Catalog[]>;
  openCatalog: (id: string) => Promise<void>;
  refreshCatalog: (id: string) => Promise<void>;
  loadLatestCatalog: () => Promise<void>;
  loadAllCatalogs: () => Promise<void>;
  loadCatalogById: (id: string) => Promise<void>;
  duplicateCatalog: (id: string) => Promise<void>;
  deleteCatalog: (id: string) => Promise<void>;
  createCatalogFromPreset: (name?: string, presetId?: string) => void;
  resolveConflictKeepLocal: () => Promise<void>;
  resolveConflictReloadServer: () => Promise<void>;
}

// Controle de Fila Single-Flight em nível de módulo
let isSaveInFlight = false;
let hasPendingSave = false;

export const useCatalogStore = create<CatalogState>((set, get) => ({
  currentCatalog: null,
  activePageIndex: 0,
  selectedBlockId: null,

  isSaving: false,
  isDirty: false,
  syncStatus: 'synced',
  syncError: null,
  serverSavedAt: null,
  cachedAt: null,
  lastSavedAt: null,

  savedCatalogs: [],
  isLoading: false,

  setCurrentCatalog: (currentCatalog) => {
    set({ currentCatalog, isDirty: true, syncStatus: 'dirty' });
    void get().saveCurrentCatalog();
  },

  setActivePageIndex: (activePageIndex) => set({ activePageIndex }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),

  // =========================================================================
  // FASE 1A: MUTAÇÕES LOCAIS — NENHUMA INCREMENTA VERSION POR CONTA PRÓPRIA
  // =========================================================================

  addPage: (type = 'technical') => {
    const { currentCatalog } = get();
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
      // version mantida intacta
    };

    set({
      currentCatalog: updatedCatalog,
      activePageIndex: currentCatalog.pages.length,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removePage: (pageId) => {
    const { currentCatalog, activePageIndex } = get();
    if (!currentCatalog || currentCatalog.pages.length <= 1) return;

    const updatedPages = currentCatalog.pages
      .filter((p) => p.id !== pageId)
      .map((p, idx) => ({ ...p, pageNumber: idx + 1 }));

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString()
      // version mantida intacta
    };

    const nextIndex = Math.min(activePageIndex, updatedPages.length - 1);
    set({
      currentCatalog: updatedCatalog,
      activePageIndex: nextIndex,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  reorderPages: (fromIndex, toIndex) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const pages = [...currentCatalog.pages];
    const [moved] = pages.splice(fromIndex, 1);
    pages.splice(toIndex, 0, moved);

    const reorderedPages = pages.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: reorderedPages,
      updatedAt: new Date().toISOString()
      // version mantida intacta
    };

    set({
      currentCatalog: updatedCatalog,
      activePageIndex: toIndex,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  setPageTitle: (pageId, title) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) =>
      p.id === pageId ? { ...p, title } : p
    );

    set({
      currentCatalog: { ...currentCatalog, pages: updatedPages, updatedAt: new Date().toISOString() },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  addBlock: (pageId, blockData) => {
    const { currentCatalog } = get();
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
      // version mantida intacta
    };

    set({
      currentCatalog: updatedCatalog,
      selectedBlockId: newBlock.id,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  updateBlock: (pageId, blockId, updates) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: (p.blocks || []).map((b) => (b.id === blockId ? { ...b, ...updates } : b))
      };
    });

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removeBlock: (pageId, blockId) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: (p.blocks || []).filter((b) => b.id !== blockId)
      };
    });

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      selectedBlockId: null,
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  updateCellOverride: (blockId, rowId, fieldKey, value) => {
    const { currentCatalog } = get();
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

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  restoreCellToLibrary: (blockId, rowId, fieldKey) => {
    const { currentCatalog } = get();
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

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  addRowToTable: (blockId, productRefId) => {
    const { currentCatalog } = get();
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

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  removeRowFromTable: (blockId, rowId) => {
    const { currentCatalog } = get();
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

    set({
      currentCatalog: {
        ...currentCatalog,
        pages: updatedPages,
        updatedAt: new Date().toISOString()
      },
      isDirty: true,
      syncStatus: 'dirty'
    });
    void get().saveCurrentCatalog();
  },

  // =========================================================================
  // FASE 1B & 1C: FILA DE SALVAMENTO SINGLE-FLIGHT & TRATAMENTO DE CONFLITO
  // =========================================================================

  saveCurrentCatalog: async () => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    if (isSaveInFlight) {
      hasPendingSave = true;
      return;
    }

    isSaveInFlight = true;
    set({ isSaving: true, syncStatus: 'saving', syncError: null });

    try {
      while (true) {
        hasPendingSave = false;
        const catalogSnapshot = get().currentCatalog;
        if (!catalogSnapshot) break;

        // 1. Salva em Cache Local (IndexedDB / localStorage)
        try {
          await StorageService.saveCatalog(catalogSnapshot);
          set({ cachedAt: new Date().toISOString() });
        } catch (storageErr) {
          console.warn('Erro ao atualizar cache local:', storageErr);
        }

        // 2. Envia para o Supabase usando save_catalog_v3 com expectedVersion estrito
        const remoteRes = await SupabaseService.saveCatalog(
          catalogSnapshot,
          catalogSnapshot.version,
          `Salvamento de "${catalogSnapshot.title}"`
        );

        if (remoteRes.success && remoteRes.data) {
          const confirmedVersion = Number(remoteRes.data.version) || catalogSnapshot.version + 1;
          const nowIso = new Date().toISOString();

          // Preserva edições feitas enquanto a requisição estava em voo:
          // Atualiza EXCLUSIVAMENTE a version confirmada sobre o estado corrente!
          const activeCurrent = get().currentCatalog;
          if (activeCurrent && activeCurrent.id === catalogSnapshot.id) {
            set({
              currentCatalog: { ...activeCurrent, version: confirmedVersion },
              serverSavedAt: nowIso,
              lastSavedAt: nowIso
            });
          }

          if (!hasPendingSave) {
            set({ isDirty: false, syncStatus: 'synced', syncError: null });
            break;
          }
          // Se houve novas alterações locais durante a requisição, continua o loop
        } else if (remoteRes.conflict) {
          // FASE 1C: Conflito Real 40001 (outro dispositivo atualizou antes)
          set({
            syncStatus: 'conflict',
            syncError: 'Este catálogo foi atualizado em outro dispositivo. Suas alterações locais foram preservadas.',
            isDirty: true
          });
          break; // Não tenta novamente em loop para não sobrescrever
        } else {
          // Erro de rede ou offline
          set({
            syncStatus: 'offline',
            syncError: remoteRes.error || 'Operando em modo offline. Alterações salvas no cache local.'
          });
          break;
        }
      }
    } finally {
      isSaveInFlight = false;
      set({ isSaving: false });
    }
  },

  resolveConflictKeepLocal: async () => {
    // Força sobrescrita com base na versão remota atualizada
    const { currentCatalog } = get();
    if (!currentCatalog) return;
    const remoteList = await get().loadWorkspace();
    const serverCat = remoteList.find((c) => c.id === currentCatalog.id);
    const serverVersion = serverCat ? serverCat.version : currentCatalog.version;

    set({
      currentCatalog: { ...currentCatalog, version: serverVersion },
      syncStatus: 'dirty',
      syncError: null
    });
    void get().saveCurrentCatalog();
  },

  resolveConflictReloadServer: async () => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;
    await get().refreshCatalog(currentCatalog.id);
  },

  // =========================================================================
  // FASE 1G & 1H: BOOT, WORKSPACE REMOTO & IDENTIDADE IMUTÁVEL
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
        // Salva cópia de leitura no cache local
        for (const cat of remoteCatalogs) {
          void StorageService.saveCatalog(cat);
        }
        return remoteCatalogs;
      }
      return [];
    } catch (err) {
      console.warn('Erro ao carregar workspace remoto:', err);
      return [];
    } finally {
      set({ isLoading: false });
    }
  },

  openCatalog: async (id: string) => {
    set({ isLoading: true });
    try {
      // 1. Tenta carregar do workspace remoto
      const workspaceCatalogs = await get().loadWorkspace();
      const targetRemote = workspaceCatalogs.find((c) => c.id === id);

      if (targetRemote) {
        set({
          currentCatalog: targetRemote,
          activePageIndex: 0,
          selectedBlockId: null,
          isDirty: false,
          syncStatus: 'synced',
          syncError: null
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('cb_active_catalog_id', id);
        }
        return;
      }

      // 2. Fallback offline no StorageService
      const cached = await StorageService.loadCatalog(id);
      if (cached) {
        set({
          currentCatalog: cached,
          activePageIndex: 0,
          selectedBlockId: null,
          syncStatus: 'offline',
          syncError: 'Catálogo carregado do cache local.'
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('cb_active_catalog_id', id);
        }
      }
    } finally {
      set({ isLoading: false });
    }
  },

  refreshCatalog: async (id: string) => {
    const workspaceCatalogs = await get().loadWorkspace();
    const targetRemote = workspaceCatalogs.find((c) => c.id === id);
    if (targetRemote) {
      set({
        currentCatalog: targetRemote,
        isDirty: false,
        syncStatus: 'synced',
        syncError: null
      });
    }
  },

  loadLatestCatalog: async () => {
    set({ isLoading: true });
    try {
      const remoteCatalogs = await get().loadWorkspace();

      if (remoteCatalogs.length > 0) {
        const preferredId = typeof window !== 'undefined' ? localStorage.getItem('cb_active_catalog_id') : null;
        const targetCatalog = (preferredId ? remoteCatalogs.find((c) => c.id === preferredId) : null) || remoteCatalogs[0];

        set({
          currentCatalog: targetCatalog,
          activePageIndex: 0,
          selectedBlockId: null,
          isDirty: false,
          syncStatus: 'synced',
          syncError: null
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('cb_active_catalog_id', targetCatalog.id);
        }
        return;
      }

      // Fallback offline
      const cached = await StorageService.loadCatalog();
      if (cached) {
        set({
          currentCatalog: cached,
          activePageIndex: 0,
          selectedBlockId: null,
          syncStatus: 'offline',
          syncError: 'Operando em modo offline com cache local.'
        });
      } else {
        get().createCatalogFromPreset();
      }
    } catch (err) {
      console.warn('Fallback offline no bootstrap:', err);
      const cached = await StorageService.loadCatalog();
      if (cached) {
        set({ currentCatalog: cached, syncStatus: 'offline' });
      } else {
        get().createCatalogFromPreset();
      }
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

  duplicateCatalog: async (id: string) => {
    const { savedCatalogs } = get();
    const source = savedCatalogs.find((c) => c.id === id) || (await StorageService.loadCatalog(id));
    if (!source) return;

    // FASE 1D: UUID Imutável e version = 0 para criação
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
    const duplicated: Catalog = {
      ...structuredClone(source),
      id: newId,
      title: `${source.title} (Cópia)`,
      version: 0, // Novo documento não confirmado
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    set({
      currentCatalog: duplicated,
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: true,
      syncStatus: 'saving'
    });

    await get().saveCurrentCatalog();
    await get().loadWorkspace();
  },

  deleteCatalog: async (id: string) => {
    try {
      await SupabaseService.deleteCatalog(id);
    } catch (e) {
      console.warn('Erro ao excluir no Supabase:', e);
    }
    await StorageService.deleteCatalog(id);

    const remaining = await get().loadWorkspace();
    const { currentCatalog } = get();

    if (currentCatalog && currentCatalog.id === id) {
      if (remaining.length > 0) {
        set({ currentCatalog: remaining[0], activePageIndex: 0, selectedBlockId: null, isDirty: false, syncStatus: 'synced' });
        if (typeof window !== 'undefined') {
          localStorage.setItem('cb_active_catalog_id', remaining[0].id);
        }
      } else {
        get().createCatalogFromPreset();
      }
    }
  },

  createCatalogFromPreset: (name = 'Novo Catálogo Técnico PRESYS', presetId?: string) => {
    const basePreset = (presetId ? SYSTEM_PRESETS.find((p) => p.id === presetId) : null) || SYSTEM_PRESETS[0];
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

    const newCatalog: Catalog = {
      ...structuredClone(basePreset.catalog),
      id: newId,
      title: name,
      version: 0, // Inicia em 0 para insert via RPC
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    set({
      currentCatalog: newCatalog,
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: true,
      syncStatus: 'saving'
    });

    void get().saveCurrentCatalog();
  }
}));
