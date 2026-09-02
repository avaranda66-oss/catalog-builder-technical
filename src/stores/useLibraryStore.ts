import { create } from 'zustand';
import {
  Product,
  LibraryColumn,
  ProductFamily,
  ProductFamilyField,
  LibraryChangeEvent,
  LibraryPresenceUser
} from '../domain/product.schema';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { StorageService } from '../services/storage.service';
import { SupabaseService, getSupabase } from '../services/supabase.service';
import { useAuthStore } from './useAuthStore';
import { RealtimeChannel } from '@supabase/supabase-js';

export type SyncStatus = 'synced' | 'dirty' | 'saving' | 'conflict' | 'error' | 'offline';

export interface PendingProductEdit {
  productId: string;
  latestProductSnapshot: Product;
  expectedVersion: number;
  changedFields: Set<string>;
  timestamp: number;
}

interface LibraryState {
  products: Product[];
  families: ProductFamily[];
  familyFields: Record<string, ProductFamilyField[]>; // keyed by family_id and family name
  familyColumns?: Record<string, LibraryColumn[]>; // backward compat alias
  changeEvents: LibraryChangeEvent[];
  selectedProductId: string | null;
  searchQuery: string;
  selectedFamily: string; // family name or slug
  
  // Status de Sincronização
  syncStatus: SyncStatus;
  syncError: string | null;
  isDirty: boolean;
  isSaving: boolean;
  
  // Realtime & Presence
  cellPresence: Record<string, LibraryPresenceUser[]>; // key: `${productId}:${colKey}`
  familyPresence: Record<string, LibraryPresenceUser[]>; // key: `${familyId}`
  recentEditedCells: Record<string, { editorName: string; timestamp: number }>;
  
  // Actions de Navegação
  setSearchQuery: (query: string) => void;
  setSelectedFamily: (family: string) => void;
  setSelectedProduct: (id: string | null) => void;
  
  // Presence Actions
  setFocusedCell: (productId: string | null, columnKey: string | null, isEditing?: boolean) => void;
  
  // CRUD de Famílias
  createFamily: (name: string, description?: string) => Promise<{ success: boolean; data?: ProductFamily; error?: string }>;
  renameFamily: (familyId: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  deleteFamily: (familyId: string) => Promise<{ success: boolean; error?: string }>;
  
  // CRUD de Colunas
  getColumnsForFamily: (family: string) => LibraryColumn[];
  addFamilyColumn: (familyIdOrName: string, fieldKey: string, label: string, fieldType?: string) => Promise<{ success: boolean; data?: ProductFamilyField; error?: string }>;
  renameFamilyColumn: (fieldId: string, familyIdOrName: string, newLabel: string) => Promise<{ success: boolean; error?: string }>;
  removeFamilyColumn: (fieldId: string, familyIdOrName: string, fieldKey?: string) => Promise<{ success: boolean; error?: string }>;
  
  // CRUD de Produtos
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => Promise<{ success: boolean; data?: Product; error?: string }>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  updateProductCell: (productId: string, fieldKey: string, value: string, immediateFlush?: boolean) => void;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  getProduct: (id: string) => Product | undefined;
  
  // Flush & Persistência
  flushLibraryEdits: () => Promise<boolean>;
  loadWorkspace: () => Promise<void>;
  loadProducts: () => Promise<void>;
  initRealtimeSubscription: () => () => void;
  resetToInitial: () => void;
}

// 1. Identidade de Sessão Única e Estável por Aba
function getStableLibraryClientId(): string {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    let id = window.sessionStorage.getItem('cb_client_instance_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).slice(2, 9);
      window.sessionStorage.setItem('cb_client_instance_id', id);
    }
    return id;
  }
  return 'client_' + Math.random().toString(36).slice(2, 9);
}

const libraryClientInstanceId = getStableLibraryClientId();

// 2. Fila de Edições Consolidada por Produto
let debounceTimer: any = null;
const pendingProductEdits = new Map<string, PendingProductEdit>();
let isFlushingEdits = false;
let hasPendingSubsequentFlush = false;

let libraryRealtimeChannel: RealtimeChannel | null = null;
let libraryPresenceChannel: RealtimeChannel | null = null;

// 3. Colunas Estruturais Obrigatórias de Todo Produto
export const CORE_PRODUCT_COLUMNS: LibraryColumn[] = [
  { key: 'code', label: 'Código', visible: true, width: 110, isSystem: true, isCustom: false },
  { key: 'model', label: 'Modelo', visible: true, width: 130, isSystem: true, isCustom: false }
];

export const DEFAULT_FALLBACK_COLUMNS: LibraryColumn[] = [
  { key: 'code', label: 'Código', visible: true, width: 110, isSystem: true, isCustom: false },
  { key: 'model', label: 'Modelo', visible: true, width: 130, isSystem: true, isCustom: false },
  { key: 'range', label: 'Faixa de Medição', visible: true, width: 130, isCustom: false },
  { key: 'unit', label: 'Unidade', visible: true, width: 70, isCustom: false },
  { key: 'accuracy', label: 'Exatidão', visible: true, width: 100, isCustom: false },
  { key: 'output', label: 'Sinal de Saída', visible: true, width: 120, isCustom: false },
  { key: 'processConnection', label: 'Conexão de Processo', visible: true, width: 150, isCustom: false }
];

export const useLibraryStore = create<LibraryState>((set, get) => ({
  products: INITIAL_PRODUCTS,
  families: [],
  familyFields: {},
  familyColumns: {},
  changeEvents: [],
  selectedProductId: null,
  searchQuery: '',
  selectedFamily: 'Transmissores de Pressão Relativa',
  
  syncStatus: 'synced',
  syncError: null,
  isDirty: false,
  isSaving: false,
  
  cellPresence: {},
  familyPresence: {},
  recentEditedCells: {},

  loadProducts: async () => {
    await get().loadWorkspace();
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  
  setSelectedFamily: (selectedFamily) => {
    set({ selectedFamily });
    const current = get();
    const famObj = current.families.find(f => f.name === selectedFamily || f.slug === selectedFamily || f.id === selectedFamily);
    if (famObj && libraryPresenceChannel) {
      const user = useAuthStore.getState();
      const actorName = user.email ? user.email.split('@')[0] : 'Colaborador';
      void libraryPresenceChannel.track({
        userId: user.userId || 'anon',
        clientInstanceId: libraryClientInstanceId,
        userName: actorName,
        userEmail: user.email || '',
        familyId: famObj.id,
        activity: 'viewing',
        lastSeenAt: Date.now()
      });
    }
  },
  
  setSelectedProduct: (selectedProductId) => set({ selectedProductId }),

  setFocusedCell: (productId, columnKey, isEditing = false) => {
    if (!libraryPresenceChannel) return;
    const user = useAuthStore.getState();
    const actorName = user.email ? user.email.split('@')[0] : 'Colaborador';
    const currentFam = get().families.find(f => f.name === get().selectedFamily || f.slug === get().selectedFamily);
    
    void libraryPresenceChannel.track({
      userId: user.userId || 'anon',
      clientInstanceId: libraryClientInstanceId,
      userName: actorName,
      userEmail: user.email || '',
      familyId: currentFam?.id || null,
      productId: productId || null,
      columnKey: columnKey || null,
      activity: isEditing ? 'editing' : 'viewing',
      lastSeenAt: Date.now()
    });
  },

  createFamily: async (name, description = '') => {
    const tempId = 'fam_' + Date.now();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tempFam: ProductFamily = {
      id: tempId,
      name,
      slug,
      description,
      sort_order: get().families.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const previousFamilies = get().families;
    set((state) => ({
      families: [...state.families, tempFam],
      selectedFamily: name,
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.saveProductFamily({ name, description });
    if (res.success && res.data) {
      const confirmed: ProductFamily = res.data;
      set((state) => ({
        families: state.families.map(f => f.id === tempId ? confirmed : f),
        selectedFamily: confirmed.name,
        syncStatus: 'synced',
        syncError: null
      }));
      return { success: true, data: confirmed };
    }

    // Rollback em caso de falha no servidor
    set({
      families: previousFamilies,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao criar família no servidor'
    });
    return { success: false, error: res.error || 'Falha ao salvar família no servidor' };
  },

  renameFamily: async (familyId, newName) => {
    const previousFamilies = get().families;
    set((state) => ({
      families: state.families.map(f => f.id === familyId ? { ...f, name: newName } : f),
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.saveProductFamily({ id: familyId, name: newName });
    if (res.success && res.data) {
      set({ syncStatus: 'synced', syncError: null });
      return { success: true };
    }

    set({
      families: previousFamilies,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao renomear família'
    });
    return { success: false, error: res.error || 'Falha ao renomear família no servidor' };
  },

  deleteFamily: async (familyId) => {
    const previousFamilies = get().families;
    set((state) => ({
      families: state.families.filter(f => f.id !== familyId),
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.deleteProductFamily(familyId);
    if (res.success) {
      set({ syncStatus: 'synced', syncError: null });
      return { success: true };
    }

    set({
      families: previousFamilies,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao excluir família'
    });
    return { success: false, error: res.error || 'Falha ao excluir família no servidor' };
  },

  getColumnsForFamily: (family: string) => {
    const famObj = get().families.find(f => f.name === family || f.slug === family || f.id === family);
    const familyKey = famObj?.id || family;
    const customFields = get().familyFields[familyKey] || (famObj ? get().familyFields[famObj.name] : []) || [];
    
    const familyCols: LibraryColumn[] = customFields.map(f => ({
      id: f.id,
      key: f.field_key,
      label: f.label,
      visible: f.visible,
      width: f.width || 130,
      isSystem: f.is_system,
      isCustom: !f.is_system,
      fieldType: (f.field_type as any) || 'text'
    }));

    // Se já existem campos customizados persistidos para a família:
    // Garante que Código e Modelo NUNCA desapareçam
    if (familyCols.length > 0) {
      const coreKeys = new Set(CORE_PRODUCT_COLUMNS.map(c => c.key));
      const nonCoreFamilyCols = familyCols.filter(c => !coreKeys.has(c.key));
      return [...CORE_PRODUCT_COLUMNS, ...nonCoreFamilyCols];
    }

    // Se é uma das famílias padrão iniciais de demonstração
    if (family === 'Transmissores de Pressão Relativa' || family === 'Transmissores de Pressão Diferencial' || family === 'Válvulas de Controle' || family === 'Transmissores de Temperatura') {
      return DEFAULT_FALLBACK_COLUMNS;
    }

    // Nova família vazia: retorna obrigatoriamente as colunas universais (Código + Modelo)
    return [...CORE_PRODUCT_COLUMNS];
  },

  addFamilyColumn: async (familyIdOrName, fieldKey, label, fieldType = 'text') => {
    const famObj = get().families.find(f => f.id === familyIdOrName || f.name === familyIdOrName || f.slug === familyIdOrName);
    const familyKey = famObj?.id || familyIdOrName;
    const previousFields = get().familyFields[familyKey] || [];
    const tempFieldId = 'col_' + Date.now();
    
    const newField: ProductFamilyField = {
      id: tempFieldId,
      family_id: familyKey,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      unit: null,
      sort_order: previousFields.length + 1,
      width: 130,
      visible: true,
      is_system: false
    };

    // Atualização otimista local
    set((state) => {
      const existing = state.familyFields[familyKey] || [];
      const updated = existing.some(f => f.field_key === fieldKey) ? existing : [...existing, newField];
      return {
        familyFields: {
          ...state.familyFields,
          [familyKey]: updated,
          ...(famObj ? { [famObj.name]: updated } : {})
        },
        syncStatus: 'saving'
      };
    });

    const res = await SupabaseService.saveFamilyField({
      family_id: famObj?.id || familyKey,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      sort_order: newField.sort_order,
      width: 130,
      visible: true,
      is_system: false
    });

    if (res.success && res.data) {
      const confirmed: ProductFamilyField = res.data;
      set((state) => {
        const existing = state.familyFields[familyKey] || [];
        const updated = existing.map(f => f.id === tempFieldId ? confirmed : f);
        return {
          familyFields: {
            ...state.familyFields,
            [familyKey]: updated,
            ...(famObj ? { [famObj.name]: updated } : {})
          },
          syncStatus: 'synced',
          syncError: null
        };
      });
      return { success: true, data: confirmed };
    }

    // Rollback em caso de erro no servidor
    set((state) => ({
      familyFields: {
        ...state.familyFields,
        [familyKey]: previousFields,
        ...(famObj ? { [famObj.name]: previousFields } : {})
      },
      syncStatus: 'error',
      syncError: res.error || 'Erro ao salvar coluna no servidor'
    }));
    return { success: false, error: res.error || 'Falha ao salvar coluna no servidor' };
  },

  renameFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, newLabel) => {
    let familyKey = fieldIdOrFamily;
    let targetKey = familyOrFieldKey;
    let labelVal = newLabel;

    if (newLabel === undefined) {
      labelVal = familyOrFieldKey;
    }

    const previousFields = { ...get().familyFields };

    set((state) => {
      const newFields = { ...state.familyFields };
      for (const [fKey, list] of Object.entries(newFields)) {
        newFields[fKey] = list.map(f => {
          if (f.id === fieldIdOrFamily || f.field_key === familyOrFieldKey || f.id === familyOrFieldKey || (f.field_key === targetKey && fKey === familyKey)) {
            return { ...f, label: labelVal };
          }
          return f;
        });
      }
      return { familyFields: newFields, syncStatus: 'saving' };
    });

    const res = await SupabaseService.saveFamilyField({ id: fieldIdOrFamily, label: labelVal });
    if (res.success) {
      set({ syncStatus: 'synced', syncError: null });
      return { success: true };
    }

    // Rollback em caso de falha no servidor
    set({
      familyFields: previousFields,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao renomear coluna no servidor'
    });
    return { success: false, error: res.error || 'Falha ao renomear coluna no servidor' };
  },

  removeFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, fieldKey) => {
    const targetKey = fieldKey || familyOrFieldKey;
    const targetId = fieldIdOrFamily;
    const previousFields = { ...get().familyFields };

    set((state) => {
      const newFields = { ...state.familyFields };
      for (const [fKey, list] of Object.entries(newFields)) {
        newFields[fKey] = list.filter(f => f.id !== targetId && f.field_key !== targetKey && f.id !== targetKey);
      }
      return { familyFields: newFields, syncStatus: 'saving' };
    });

    const res = await SupabaseService.deleteFamilyField(targetId);
    if (res.success) {
      set({ syncStatus: 'synced', syncError: null });
      return { success: true };
    }

    // Rollback em caso de falha no servidor
    set({
      familyFields: previousFields,
      syncStatus: 'error',
      syncError: res.error || 'Erro ao excluir coluna no servidor'
    });
    return { success: false, error: res.error || 'Falha ao excluir coluna no servidor' };
  },

  addProduct: async (productData) => {
    const tempId = 'prod_' + Date.now();
    const newProduct: Product = {
      ...productData,
      id: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    set((state) => ({
      products: [newProduct, ...state.products],
      isDirty: false,
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.saveProduct(newProduct, 0, undefined, `Criação do produto ${newProduct.model}`);
    if (res.success && res.data) {
      const confirmed: Product = {
        id: res.data.id,
        family_id: res.data.family_id,
        code: res.data.sku,
        model: res.data.name,
        family: res.data.family,
        description: res.data.data?.description || res.data.name,
        specs: res.data.data?.specs || res.data.data || {},
        imageUrl: res.data.data?.imageUrl || '',
        version: res.data.version || 1,
        createdAt: res.data.created_at,
        updatedAt: res.data.updated_at
      };

      set((state) => ({
        products: state.products.map(p => p.id === tempId ? confirmed : p),
        syncStatus: 'synced',
        syncError: null
      }));
      void StorageService.saveProducts(get().products);
      return { success: true, data: confirmed };
    }

    // Rollback se falhar no servidor
    set((state) => ({
      products: state.products.filter(p => p.id !== tempId),
      syncStatus: 'error',
      syncError: res.error || 'Erro ao salvar produto no servidor'
    }));
    return { success: false, error: res.error || 'Falha ao salvar produto no servidor' };
  },

  updateProduct: async (id, updates) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;

    const updatedProd: Product = {
      ...current,
      ...updates,
      specs: {
        ...current.specs,
        ...(updates.specs || {})
      },
      updatedAt: new Date().toISOString()
    };

    set((state) => ({
      products: state.products.map(p => p.id === id ? updatedProd : p),
      isDirty: true,
      syncStatus: 'dirty',
      syncError: null
    }));

    const existingPending = pendingProductEdits.get(id);
    if (existingPending) {
      existingPending.latestProductSnapshot = updatedProd;
      existingPending.timestamp = Date.now();
    } else {
      pendingProductEdits.set(id, {
        productId: id,
        latestProductSnapshot: updatedProd,
        expectedVersion: current.version || 1,
        changedFields: new Set(Object.keys(updates)),
        timestamp: Date.now()
      });
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void get().flushLibraryEdits();
    }, 500);
  },

  updateProductCell: (productId, fieldKey, value, immediateFlush = false) => {
    const currentProd = get().products.find(p => p.id === productId);
    if (!currentProd) return;

    const isStandardProp = ['code', 'model', 'description', 'family', 'imageUrl'].includes(fieldKey);
    const updatedProd: Product = {
      ...currentProd,
      ...(isStandardProp ? { [fieldKey]: value } : {}),
      specs: {
        ...currentProd.specs,
        ...(!isStandardProp ? { [fieldKey]: value } : {}),
        customSpecs: {
          ...(currentProd.specs?.customSpecs || {}),
          ...(!isStandardProp && !['range', 'unit', 'accuracy', 'output', 'powerSupply', 'processConnection', 'protectionDegree'].includes(fieldKey) ? { [fieldKey]: value } : {})
        }
      },
      updatedAt: new Date().toISOString()
    };

    set((state) => ({
      products: state.products.map(p => p.id === productId ? updatedProd : p),
      isDirty: true,
      syncStatus: 'dirty',
      syncError: null
    }));

    // Consolida na fila por PRODUTO (evitando auto-conflito de expectedVersion)
    const existingPending = pendingProductEdits.get(productId);
    if (existingPending) {
      existingPending.latestProductSnapshot = updatedProd;
      existingPending.changedFields.add(fieldKey);
      existingPending.timestamp = Date.now();
    } else {
      pendingProductEdits.set(productId, {
        productId,
        latestProductSnapshot: updatedProd,
        expectedVersion: currentProd.version || 1,
        changedFields: new Set([fieldKey]),
        timestamp: Date.now()
      });
    }

    if (immediateFlush) {
      if (debounceTimer) clearTimeout(debounceTimer);
      void get().flushLibraryEdits();
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void get().flushLibraryEdits();
    }, 500);
  },

  flushLibraryEdits: async () => {
    if (pendingProductEdits.size === 0) {
      set({ isDirty: false, syncStatus: 'synced' });
      return true;
    }

    if (isFlushingEdits) {
      hasPendingSubsequentFlush = true;
      return true;
    }

    isFlushingEdits = true;
    set({ isSaving: true, syncStatus: 'saving' });

    // Extrai o snapshot consolidado de cada produto editado
    const batch = Array.from(pendingProductEdits.entries());
    pendingProductEdits.clear();

    let allSuccess = true;
    for (const [prodId, edit] of batch) {
      const changedFieldNames = Array.from(edit.changedFields).join(', ');
      const res = await SupabaseService.saveProduct(
        edit.latestProductSnapshot,
        edit.expectedVersion,
        Array.from(edit.changedFields)[0],
        `Edição em ${edit.latestProductSnapshot.model}: ${changedFieldNames}`
      );

      if (res.success && res.data) {
        const nextVersion = res.data.version || (edit.expectedVersion + 1);
        set((state) => ({
          products: state.products.map(p => p.id === prodId ? { ...p, version: nextVersion } : p)
        }));
      } else {
        allSuccess = false;
        if (res.conflict) {
          set({
            syncStatus: 'conflict',
            syncError: `Conflito no produto ${edit.latestProductSnapshot.model}: alterado em outro dispositivo.`
          });
        } else {
          set({
            syncStatus: 'error',
            syncError: res.error || 'Erro ao persistir alteração na biblioteca.'
          });
        }
      }
    }

    isFlushingEdits = false;
    set({
      isSaving: false,
      isDirty: !allSuccess || pendingProductEdits.size > 0,
      syncStatus: allSuccess ? 'synced' : (get().syncStatus === 'conflict' ? 'conflict' : 'error')
    });

    void StorageService.saveProducts(get().products);

    if (hasPendingSubsequentFlush || pendingProductEdits.size > 0) {
      hasPendingSubsequentFlush = false;
      return await get().flushLibraryEdits();
    }

    return allSuccess;
  },

  deleteProduct: async (id) => {
    const previousProducts = get().products;
    set((state) => ({
      products: state.products.filter(p => p.id !== id),
      isSaving: true,
      syncStatus: 'saving'
    }));

    const res = await SupabaseService.deleteProduct(id);
    if (res.success) {
      set({ isSaving: false, syncStatus: 'synced', syncError: null });
      void StorageService.saveProducts(get().products);
      return { success: true };
    } else {
      // Rollback se falhar no servidor
      set({
        products: previousProducts,
        isSaving: false,
        syncStatus: 'error',
        syncError: res.error || 'Erro ao excluir produto no servidor'
      });
      return { success: false, error: res.error };
    }
  },

  getProduct: (id) => {
    return get().products.find(p => p.id === id);
  },

  loadWorkspace: async () => {
    try {
      const res = await SupabaseService.listLibraryWorkspace();
      if (res.success && res.data) {
        const { families = [], fields = [], products = [], events = [] } = res.data;
        
        const fieldMap: Record<string, ProductFamilyField[]> = {};
        fields.forEach((fld: any) => {
          const fid = fld.family_id;
          if (!fieldMap[fid]) fieldMap[fid] = [];
          fieldMap[fid].push(fld);
          
          const parentFam = families.find((f: any) => f.id === fid);
          if (parentFam) {
            if (!fieldMap[parentFam.name]) fieldMap[parentFam.name] = [];
            fieldMap[parentFam.name].push(fld);
          }
        });

        const remoteProducts: Product[] = products.map((rp: any) => ({
          id: rp.id,
          family_id: rp.family_id,
          code: rp.sku,
          model: rp.name,
          family: rp.family || 'Geral',
          description: rp.data?.description || rp.name,
          specs: rp.data?.specs || rp.data || {},
          imageUrl: rp.data?.imageUrl || '',
          version: rp.version || 1,
          createdAt: rp.created_at,
          updatedAt: rp.updated_at
        }));

        const activeFam = families[0]?.name || get().selectedFamily || 'Transmissores de Pressão Relativa';

        // EMPTY CLOUD É VÁLIDO: se o servidor respondeu com sucesso, mantém exatamente os produtos do cloud (mesmo se vazio)
        set({
          families,
          familyFields: fieldMap,
          products: remoteProducts,
          changeEvents: events,
          selectedFamily: activeFam,
          syncStatus: 'synced',
          syncError: null
        });

        void StorageService.saveProducts(remoteProducts);
        return;
      }
    } catch (e) {
      console.warn('Falha na consulta cloud da biblioteca, usando cache:', e);
    }

    // Fallback OFFLINE somente em caso de falha de conexão com Supabase
    const saved = await StorageService.loadProducts();
    if (saved && saved.length > 0) {
      set({ products: saved, syncStatus: 'offline', syncError: 'Modo Offline: exibindo cache local' });
    } else {
      set({ products: INITIAL_PRODUCTS, syncStatus: 'offline', syncError: 'Modo Offline: dados de demonstração' });
    }
  },

  initRealtimeSubscription: () => {
    const supabase = getSupabase();
    if (!supabase || typeof supabase.channel !== 'function') return () => {};

    if (libraryRealtimeChannel && typeof supabase.removeChannel === 'function') {
      supabase.removeChannel(libraryRealtimeChannel);
      libraryRealtimeChannel = null;
    }
    if (libraryPresenceChannel && typeof supabase.removeChannel === 'function') {
      supabase.removeChannel(libraryPresenceChannel);
      libraryPresenceChannel = null;
    }

    // 1. Canal de Dados Postgres Changes para Biblioteca
    libraryRealtimeChannel = supabase.channel('realtime:library')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        set((state) => {
          if (eventType === 'INSERT') {
            if (state.products.some(p => p.id === newRec.id)) return state;
            const added: Product = {
              id: newRec.id,
              family_id: newRec.family_id,
              code: newRec.sku,
              model: newRec.name,
              family: newRec.family || 'Geral',
              description: newRec.data?.description || newRec.name,
              specs: newRec.data?.specs || newRec.data || {},
              imageUrl: newRec.data?.imageUrl || '',
              version: newRec.version || 1,
              createdAt: newRec.created_at,
              updatedAt: newRec.updated_at
            };
            return { products: [added, ...state.products] };
          }

          if (eventType === 'UPDATE') {
            const updated: Product = {
              id: newRec.id,
              family_id: newRec.family_id,
              code: newRec.sku,
              model: newRec.name,
              family: newRec.family || 'Geral',
              description: newRec.data?.description || newRec.name,
              specs: newRec.data?.specs || newRec.data || {},
              imageUrl: newRec.data?.imageUrl || '',
              version: newRec.version || 1,
              createdAt: newRec.created_at,
              updatedAt: newRec.updated_at
            };

            const editorName = newRec.updated_by ? 'Colaborador' : 'Servidor';
            return {
              products: state.products.map(p => p.id === newRec.id ? updated : p),
              recentEditedCells: {
                ...state.recentEditedCells,
                [newRec.id]: { editorName, timestamp: Date.now() }
              }
            };
          }

          if (eventType === 'DELETE') {
            return { products: state.products.filter(p => p.id !== oldRec.id) };
          }

          return state;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_families' }, (payload) => {
        const eventType = payload.eventType;
        const newFam = payload.new as any;
        const oldFam = payload.old as any;
        set((state) => {
          if (eventType === 'INSERT') {
            if (state.families.some(f => f.id === newFam.id)) return state;
            return { families: [...state.families, newFam as ProductFamily] };
          }
          if (eventType === 'UPDATE') {
            return { families: state.families.map(f => f.id === newFam.id ? (newFam as ProductFamily) : f) };
          }
          if (eventType === 'DELETE') {
            return { families: state.families.filter(f => f.id !== oldFam.id) };
          }
          return state;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_family_fields' }, (payload) => {
        const eventType = payload.eventType;
        const newFld = payload.new as any;
        const oldFld = payload.old as any;
        set((state) => {
          const familyId = (newFld?.family_id || oldFld?.family_id) as string;
          if (!familyId) return state;

          const currentList = state.familyFields[familyId] || [];
          let updatedList = currentList;

          if (eventType === 'INSERT') {
            if (!currentList.some(f => f.id === newFld.id)) {
              updatedList = [...currentList, newFld as ProductFamilyField];
            }
          } else if (eventType === 'UPDATE') {
            updatedList = currentList.map(f => f.id === newFld.id ? (newFld as ProductFamilyField) : f);
          } else if (eventType === 'DELETE') {
            updatedList = currentList.filter(f => f.id !== oldFld.id);
          }

          return {
            familyFields: {
              ...state.familyFields,
              [familyId]: updatedList
            }
          };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'library_change_events' }, (payload) => {
        const newEvent = payload.new as LibraryChangeEvent;
        set((state) => ({
          changeEvents: [newEvent, ...state.changeEvents.slice(0, 99)]
        }));
      })
      .subscribe();

    // 2. Canal de Presença com Chave de Sessão Estável (userId:clientInstanceId)
    const currentUserId = useAuthStore.getState().userId || 'anon';
    libraryPresenceChannel = supabase.channel('presence:library', {
      config: { presence: { key: `${currentUserId}:${libraryClientInstanceId}` } }
    });

    libraryPresenceChannel.on('presence', { event: 'sync' }, () => {
      const state = libraryPresenceChannel?.presenceState() || {};
      const newCellPresence: Record<string, LibraryPresenceUser[]> = {};
      const newFamilyPresence: Record<string, LibraryPresenceUser[]> = {};

      Object.values(state).forEach((presences: any) => {
        presences.forEach((p: LibraryPresenceUser) => {
          if (p.productId && p.columnKey) {
            const cellKey = `${p.productId}:${p.columnKey}`;
            if (!newCellPresence[cellKey]) newCellPresence[cellKey] = [];
            // Deduplica presença por userId e clientInstanceId
            if (!newCellPresence[cellKey].some(item => item.clientInstanceId === p.clientInstanceId)) {
              newCellPresence[cellKey].push(p);
            }
          }
          if (p.familyId) {
            if (!newFamilyPresence[p.familyId]) newFamilyPresence[p.familyId] = [];
            if (!newFamilyPresence[p.familyId].some(item => item.clientInstanceId === p.clientInstanceId)) {
              newFamilyPresence[p.familyId].push(p);
            }
          }
        });
      });

      set({ cellPresence: newCellPresence, familyPresence: newFamilyPresence });
    });

    libraryPresenceChannel.subscribe();

    return () => {
      if (libraryRealtimeChannel && typeof supabase.removeChannel === 'function') supabase.removeChannel(libraryRealtimeChannel);
      if (libraryPresenceChannel && typeof supabase.removeChannel === 'function') supabase.removeChannel(libraryPresenceChannel);
      libraryRealtimeChannel = null;
      libraryPresenceChannel = null;
    };
  },

  resetToInitial: () => {
    StorageService.saveProducts(INITIAL_PRODUCTS);
    set({ products: INITIAL_PRODUCTS, syncStatus: 'synced' });
  }
}));
