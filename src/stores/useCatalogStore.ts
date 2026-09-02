import { create } from 'zustand';
import { Catalog, ContentBlock, generateUniqueCatalogTitle } from '../domain/catalog.schema';
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
}

interface CatalogState {
  currentCatalog: Catalog | null;
  activePageIndex: number;
  selectedBlockId: string | null;

  // Status de Sincronização & Persistência (Fase 1 & 1.1)
  isSaving: boolean;
  isDirty: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  serverSavedAt: string | null;
  cachedAt: string | null;
  lastSavedAt: string | null;
  inFlightSave: InFlightSaveInfo | null;

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
  createCatalogFromPreset: (name?: string, presetId?: string) => Promise<SaveResult>;
  resolveConflictKeepLocal: () => Promise<SaveResult>;
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
  inFlightSave: null,

  savedCatalogs: [],
  isLoading: false,

  // FASE 1.1 — Item 1: setCurrentCatalog é um SETTER PURO DE ESTADO sem side-effects de rede
  setCurrentCatalog: (currentCatalog, markDirty = true) => {
    set({
      currentCatalog,
      isDirty: markDirty,
      syncStatus: markDirty ? 'dirty' : 'synced'
    });
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
  // FASE 1B, 1C & 1.1: FILA SINGLE-FLIGHT, ERROR CLASSIFICATION & IN-FLIGHT TRACKING
  // =========================================================================

  saveCurrentCatalog: async (): Promise<SaveResult> => {
    const { currentCatalog } = get();
    if (!currentCatalog) {
      return { success: false, status: 'error', error: 'Nenhum catálogo ativo para salvar.' };
    }

    if (isSaveInFlight) {
      hasPendingSave = true;
      return { success: true, status: 'saving' };
    }

    isSaveInFlight = true;
    let finalResult: SaveResult = { success: false, status: 'saving' };

    try {
      while (true) {
        hasPendingSave = false;
        const catalogSnapshot = get().currentCatalog;
        if (!catalogSnapshot) break;

        const expectedVersion = catalogSnapshot.version ?? 0;
        const targetVersion = expectedVersion === 0 ? 1 : expectedVersion + 1;

        // Rastreia voo para resolução de eco do Realtime (Fase 1.1 Item 4)
        set({
          isSaving: true,
          syncStatus: 'saving',
          syncError: null,
          inFlightSave: {
            catalogId: catalogSnapshot.id,
            expectedVersion,
            targetVersion
          }
        });

        // 1. Salva em Cache Local (IndexedDB / localStorage backup — sem mudar active ID)
        try {
          await StorageService.cacheCatalog(catalogSnapshot);
          set({ cachedAt: new Date().toISOString() });
        } catch (storageErr) {
          console.warn('Erro ao atualizar cache local:', storageErr);
        }

        // 2. Envia para o Supabase via save_catalog_v3 com expectedVersion estrito
        const remoteRes = await SupabaseService.saveCatalog(
          catalogSnapshot,
          expectedVersion,
          `Salvamento de "${catalogSnapshot.title}"`
        );

        if (remoteRes.success && remoteRes.data) {
          const confirmedVersion = Number(remoteRes.data.version) || targetVersion;
          const nowIso = new Date().toISOString();

          // Atualiza EXCLUSIVAMENTE a version confirmada sobre o estado corrente
          const activeCurrent = get().currentCatalog;
          if (activeCurrent && activeCurrent.id === catalogSnapshot.id) {
            set({
              currentCatalog: { ...activeCurrent, version: confirmedVersion },
              serverSavedAt: nowIso,
              lastSavedAt: nowIso
            });
          }

          finalResult = {
            success: true,
            status: 'synced',
            version: confirmedVersion
          };

          if (!hasPendingSave) {
            set({ isDirty: false, syncStatus: 'synced', syncError: null });
            break;
          }
        } else if (remoteRes.conflict || remoteRes.errorCode === '40001') {
          // FASE 1C / 1.1: Conflito Real 40001
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
          // FASE 1.1: Erro de Unique Name
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
          // FASE 1.1: Erro de Validação de Payload
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
          // FASE 1.1: Permissão Negada
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
          // FASE 1.1: Erro Genuíno de Rede / Offline
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
          // Outro erro PostgreSQL / Servidor
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
      isSaveInFlight = false;
      set({ isSaving: false, inFlightSave: null });
    }

    return finalResult;
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
      syncStatus: 'dirty',
      syncError: null
    });
    return await get().saveCurrentCatalog();
  },

  resolveConflictReloadServer: async (): Promise<void> => {
    const { currentCatalog } = get();
    if (!currentCatalog) return;
    await get().refreshCatalog(currentCatalog.id);
  },

  // =========================================================================
  // FASE 1G & 1.1: WORKSPACE, CACHE & SEPARAÇÃO DE ACTIVE CATALOG PREFERENCE
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

        // FASE 1.1 Item 3: Atualiza cache de conteúdo SEM alterar cb_active_catalog_id
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
      // 1. Tenta carregar do workspace remoto
      const workspaceRes = await get().loadWorkspace();
      if (workspaceRes.success) {
        const targetRemote = workspaceRes.catalogs.find((c) => c.id === id);
        if (targetRemote) {
          set({
            currentCatalog: targetRemote,
            activePageIndex: 0,
            selectedBlockId: null,
            isDirty: false,
            syncStatus: 'synced',
            syncError: null
          });
          StorageService.setActiveCatalogId(id);
          return;
        }
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
        StorageService.setActiveCatalogId(id);
      }
    } finally {
      set({ isLoading: false });
    }
  },

  refreshCatalog: async (id: string) => {
    const workspaceRes = await get().loadWorkspace();
    const targetRemote = workspaceRes.catalogs.find((c) => c.id === id);
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
      const workspaceRes = await get().loadWorkspace();

      if (workspaceRes.success) {
        if (workspaceRes.catalogs.length > 0) {
          const preferredId = StorageService.getActiveCatalogId();
          const targetCatalog = (preferredId ? workspaceRes.catalogs.find((c) => c.id === preferredId) : null) || workspaceRes.catalogs[0];

          set({
            currentCatalog: targetCatalog,
            activePageIndex: 0,
            selectedBlockId: null,
            isDirty: false,
            syncStatus: 'synced',
            syncError: null
          });
          StorageService.setActiveCatalogId(targetCatalog.id);
          return;
        } else {
          // FASE 1.1 Item 9: Workspace online legitimamente vazio -> cria novo sem ressuscitar cache obsoleto
          await get().createCatalogFromPreset();
          return;
        }
      }

      // Fallback offline genuíno (quando workspaceRes.success é false)
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
        await get().createCatalogFromPreset();
      }
    } catch (err) {
      console.warn('Fallback offline no bootstrap:', err);
      const cached = await StorageService.loadCatalog();
      if (cached) {
        set({ currentCatalog: cached, syncStatus: 'offline' });
      } else {
        await get().createCatalogFromPreset();
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

  duplicateCatalog: async (id: string): Promise<SaveResult | null> => {
    const { savedCatalogs } = get();
    const source = savedCatalogs.find((c) => c.id === id) || (await StorageService.loadCatalog(id));
    if (!source) return null;

    // FASE 1.1 Item 7: Título único inteligente para evitar violação de 23505
    const existingTitles = savedCatalogs.map((c) => c.title);
    const uniqueTitle = generateUniqueCatalogTitle(source.title, existingTitles);

    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
    const duplicated: Catalog = {
      ...structuredClone(source),
      id: newId,
      title: uniqueTitle,
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

    const result = await get().saveCurrentCatalog();
    if (result.success) {
      StorageService.setActiveCatalogId(newId);
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
        set({ currentCatalog: remaining[0], activePageIndex: 0, selectedBlockId: null, isDirty: false, syncStatus: 'synced' });
        StorageService.setActiveCatalogId(remaining[0].id);
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

    set({
      currentCatalog: newCatalog,
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: true,
      syncStatus: 'saving'
    });

    const result = await get().saveCurrentCatalog();
    if (result.success) {
      StorageService.setActiveCatalogId(newId);
    }
    return result;
  }
}));
