import { create } from 'zustand';
import { Catalog, ContentBlock } from '../domain/catalog.schema';
import { StorageService } from '../services/storage.service';
import { SYSTEM_PRESETS } from '../data/presets';

interface CatalogState {
  currentCatalog: Catalog | null;
  activePageIndex: number;
  selectedBlockId: string | null;
  isSaving: boolean;
  lastSavedAt: string | null;

  savedCatalogs: Catalog[];
  isLoading: boolean;

  // Actions principais
  setCurrentCatalog: (catalog: Catalog) => void;
  setActivePageIndex: (index: number) => void;
  setSelectedBlockId: (blockId: string | null) => void;

  // Gerenciamento de Páginas
  addPage: (type?: 'cover' | 'technical' | 'custom' | 'presentation') => void;
  removePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  setPageTitle: (pageId: string, title: string) => void;

  // Gerenciamento de Blocos
  addBlock: (pageId: string, block: Omit<ContentBlock, 'id'>) => void;
  updateBlock: (pageId: string, blockId: string, updates: Partial<ContentBlock>) => void;
  removeBlock: (pageId: string, blockId: string) => void;

  // Manipulação de Linhas e Overrides Locais em Tabelas
  updateCellOverride: (blockId: string, rowId: string, fieldKey: string, value: string) => void;
  restoreCellToLibrary: (blockId: string, rowId: string, fieldKey: string) => void;
  addRowToTable: (blockId: string, productRefId: string) => void;
  removeRowFromTable: (blockId: string, rowId: string) => void;

  // Persistência
  saveCurrentCatalog: () => Promise<void>;
  loadLatestCatalog: () => Promise<void>;
  loadAllCatalogs: () => Promise<void>;
  loadCatalogById: (id: string) => Promise<void>;
  duplicateCatalog: (id: string) => Promise<void>;
  deleteCatalog: (id: string) => Promise<void>;
  createCatalogFromPreset: (name?: string, presetId?: string) => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  currentCatalog: null,
  activePageIndex: 0,
  selectedBlockId: null,
  isSaving: false,
  lastSavedAt: null,

  savedCatalogs: [],
  isLoading: false,

  setCurrentCatalog: (currentCatalog) => set({ currentCatalog }),
  setActivePageIndex: (activePageIndex) => set({ activePageIndex }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),

  addPage: (type = 'technical') => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const newPageNumber = currentCatalog.pages.length + 1;
    const newPage = {
      id: `page-${Date.now()}`,
      pageNumber: newPageNumber,
      pageType: type,
      title: `Folha ${newPageNumber}`,
      blocks: []
    };

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: [...currentCatalog.pages, newPage],
      updatedAt: new Date().toISOString(),
      version: currentCatalog.version + 1
    };

    set({ currentCatalog: updatedCatalog, activePageIndex: currentCatalog.pages.length });
    get().saveCurrentCatalog();
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
      updatedAt: new Date().toISOString(),
      version: currentCatalog.version + 1
    };

    const nextIndex = Math.min(activePageIndex, updatedPages.length - 1);
    set({ currentCatalog: updatedCatalog, activePageIndex: nextIndex });
    get().saveCurrentCatalog();
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
      updatedAt: new Date().toISOString(),
      version: currentCatalog.version + 1
    };

    set({ currentCatalog: updatedCatalog, activePageIndex: toIndex });
    get().saveCurrentCatalog();
  },

  setPageTitle: (pageId, title) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const updatedPages = currentCatalog.pages.map((p) =>
      p.id === pageId ? { ...p, title } : p
    );

    set({ currentCatalog: { ...currentCatalog, pages: updatedPages } });
  },

  addBlock: (pageId, blockData) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const newBlock: ContentBlock = {
      ...blockData,
      id: `block-${Date.now()}`
    };

    const updatedPages = currentCatalog.pages.map((p) =>
      p.id === pageId ? { ...p, blocks: [...(p.blocks || []), newBlock] } : p
    );

    const updatedCatalog: Catalog = {
      ...currentCatalog,
      pages: updatedPages,
      updatedAt: new Date().toISOString(),
      version: currentCatalog.version + 1
    };

    set({ currentCatalog: updatedCatalog, selectedBlockId: newBlock.id });
    get().saveCurrentCatalog();
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
      }
    });
    get().saveCurrentCatalog();
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
        updatedAt: new Date().toISOString(),
        version: currentCatalog.version + 1
      },
      selectedBlockId: null
    });
    get().saveCurrentCatalog();
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
      }
    });
    get().saveCurrentCatalog();
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
      }
    });
    get().saveCurrentCatalog();
  },

  addRowToTable: (blockId, productRefId) => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    const newRow = {
      id: `row-${Date.now()}`,
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
      }
    });
    get().saveCurrentCatalog();
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
      }
    });
    get().saveCurrentCatalog();
  },

  saveCurrentCatalog: async () => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;

    set({ isSaving: true });
    try {
      // 1. Salva localmente (IndexedDB / localStorage)
      await StorageService.saveCatalog(currentCatalog);
      set({ lastSavedAt: new Date().toISOString() });

      // 2. Sincroniza com Supabase em background (fire-and-forget)
      try {
        const { SupabaseService } = await import('../services/supabase.service');
        SupabaseService.pushCatalogsToCloud([currentCatalog]).then((res) => {
          if (res.success) {
            console.log('☁️ Catálogo sincronizado na nuvem:', res.message);
          } else {
            console.warn('⚠️ Sync cloud (catálogo):', res.message);
          }
        });
      } catch {
        // Supabase offline — sem problema, salvo localmente
      }
    } finally {
      set({ isSaving: false });
    }
  },

  loadLatestCatalog: async () => {
    set({ isLoading: true });
    try {
      // 1. Tenta carregar localmente primeiro (rápido)
      const saved = await StorageService.loadCatalog();

      // 2. Tenta puxar da nuvem para sincronizar entre dispositivos
      try {
        const { SupabaseService } = await import('../services/supabase.service');
        const cloudResult = await SupabaseService.pullCatalogsFromCloud();
        if (cloudResult.success && cloudResult.catalogs.length > 0) {
          // Salva todos os catálogos da nuvem localmente
          for (const cat of cloudResult.catalogs) {
            await StorageService.saveCatalog(cat);
          }
          // Se temos um salvo localmente, verifica se a nuvem é mais recente
          const cloudLatest = cloudResult.catalogs[0];
          if (saved) {
            const localDate = new Date(saved.updatedAt).getTime();
            const cloudDate = new Date(cloudLatest.updatedAt).getTime();
            if (cloudDate > localDate) {
              set({ currentCatalog: cloudLatest });
              console.log('☁️ Catálogo mais recente carregado da nuvem.');
            } else {
              set({ currentCatalog: saved });
            }
          } else {
            set({ currentCatalog: cloudLatest });
            console.log('☁️ Catálogo carregado da nuvem (nenhum local encontrado).');
          }
        } else if (saved) {
          set({ currentCatalog: saved });
        } else {
          get().createCatalogFromPreset();
        }
      } catch {
        // Supabase offline — usa local
        if (saved) {
          set({ currentCatalog: saved });
        } else {
          get().createCatalogFromPreset();
        }
      }

      await get().loadAllCatalogs();
    } finally {
      set({ isLoading: false });
    }
  },

  loadAllCatalogs: async () => {
    try {
      const catalogs = await StorageService.loadAllCatalogs();
      set({ savedCatalogs: catalogs });
    } catch (err) {
      console.error('Erro ao carregar lista de catálogos:', err);
    }
  },

  loadCatalogById: async (id: string) => {
    set({ isLoading: true });
    try {
      const catalog = await StorageService.loadCatalog(id);
      if (catalog) {
        set({ currentCatalog: catalog, activePageIndex: 0, selectedBlockId: null });
        await StorageService.saveCatalog(catalog);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  duplicateCatalog: async (id: string) => {
    const catalog = await StorageService.loadCatalog(id);
    if (!catalog) return;

    const duplicated: Catalog = {
      ...structuredClone(catalog),
      id: `cat-${Date.now()}`,
      title: `${catalog.title} (Cópia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    await StorageService.saveCatalog(duplicated);
    await get().loadAllCatalogs();
  },

  deleteCatalog: async (id: string) => {
    await StorageService.deleteCatalog(id);
    const { currentCatalog } = get();
    if (currentCatalog && currentCatalog.id === id) {
      const remaining = await StorageService.loadAllCatalogs();
      if (remaining.length > 0) {
        set({ currentCatalog: remaining[0], activePageIndex: 0, selectedBlockId: null });
      } else {
        get().createCatalogFromPreset();
      }
    }
    await get().loadAllCatalogs();
  },

  createCatalogFromPreset: (name = 'Catálogo Oficial de Calibração & Instrumentação PRESYS 2026', presetId?: string) => {
    const basePreset = (presetId ? SYSTEM_PRESETS.find((p) => p.id === presetId) : null) || SYSTEM_PRESETS[0];
    const initialCatalog: Catalog = {
      ...structuredClone(basePreset.catalog),
      id: `cat-${Date.now()}`,
      title: name,
      updatedAt: new Date().toISOString(),
      version: 1
    };

    set({ currentCatalog: initialCatalog, activePageIndex: 0 });
    get().saveCurrentCatalog();
    get().loadAllCatalogs();
  }
}));
