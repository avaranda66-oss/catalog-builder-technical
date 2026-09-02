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
  addFamilyColumn: (familyIdOrName: string, fieldKey: string, label: string, fieldType?: string) => Promise<{ success: boolean; error?: string }>;
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

let debounceTimer: any = null;
const pendingCellEdits = new Map<string, { product: Product; expectedVersion: number; fieldKey: string; timestamp: number }>();
let libraryRealtimeChannel: RealtimeChannel | null = null;
let libraryPresenceChannel: RealtimeChannel | null = null;

const DEFAULT_FALLBACK_COLUMNS: LibraryColumn[] = [
  { key: 'code', label: 'Código', visible: true, width: 110, isSystem: true },
  { key: 'model', label: 'Modelo', visible: true, width: 130, isSystem: true },
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
        clientInstanceId: 'client_' + Math.random().toString(36).slice(2, 9),
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
      clientInstanceId: 'client_' + Math.random().toString(36).slice(2, 9),
      userName: actorName,
      userEmail: user.email || '',
      familyId: currentFam?.id,
      productId: productId || undefined,
      columnKey: columnKey || undefined,
      activity: isEditing ? 'editing' : 'viewing',
      lastSeenAt: Date.now()
    });
  },

  getColumnsForFamily: (family) => {
    const { families, familyFields } = get();
    const famObj = families.find(f => f.name === family || f.slug === family || f.id === family);
    const fields = famObj ? (familyFields[famObj.id] || familyFields[famObj.name]) : familyFields[family];
    
    if (fields && fields.length > 0) {
      return fields.map(fld => ({
        id: fld.id,
        key: fld.field_key,
        label: fld.label,
        fieldType: (fld.field_type as any) || 'text',
        unit: fld.unit,
        visible: fld.visible,
        width: fld.width,
        isCustom: !fld.is_system,
        isSystem: fld.is_system,
        sortOrder: fld.sort_order
      }));
    }

    return DEFAULT_FALLBACK_COLUMNS;
  },

  createFamily: async (name, description) => {
    const res = await SupabaseService.saveProductFamily({ name, description });
    if (res.success && res.data) {
      const created: ProductFamily = res.data;
      set((state) => ({
        families: [...state.families, created],
        selectedFamily: created.name
      }));
      return { success: true, data: created };
    }
    return { success: false, error: res.error };
  },

  renameFamily: async (familyId, newName) => {
    const res = await SupabaseService.saveProductFamily({ id: familyId, name: newName });
    if (res.success && res.data) {
      set((state) => ({
        families: state.families.map(f => f.id === familyId ? { ...f, name: newName } : f)
      }));
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  deleteFamily: async (familyId) => {
    const res = await SupabaseService.deleteProductFamily(familyId);
    if (res.success) {
      set((state) => {
        const remaining = state.families.filter(f => f.id !== familyId);
        return {
          families: remaining,
          selectedFamily: remaining[0]?.name || 'Geral'
        };
      });
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  addFamilyColumn: async (familyIdOrName, fieldKey, label, fieldType = 'text') => {
    const famObj = get().families.find(f => f.id === familyIdOrName || f.name === familyIdOrName || f.slug === familyIdOrName);
    const familyKey = famObj?.id || familyIdOrName;
    const tempFieldId = 'col_' + Date.now();
    
    const newField: ProductFamilyField = {
      id: tempFieldId,
      family_id: familyKey,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      unit: null,
      sort_order: (get().familyFields[familyKey]?.length || 0) + 1,
      width: 130,
      visible: true,
      is_system: false
    };

    set((state) => {
      const existing = state.familyFields[familyKey] || [];
      const updated = existing.some(f => f.field_key === fieldKey) ? existing : [...existing, newField];
      return {
        familyFields: {
          ...state.familyFields,
          [familyKey]: updated,
          ...(famObj ? { [famObj.name]: updated } : {}),
          ...(familyIdOrName !== familyKey ? { [familyIdOrName]: updated } : {})
        }
      };
    });

    try {
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
            }
          };
        });
        return { success: true };
      }
    } catch {
      // Offline fallback: already updated in state
    }
    return { success: true };
  },

  renameFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, newLabel) => {
    // Suporta assinatura (fieldId, familyId, newLabel) e (family, fieldKey, newLabel)
    let familyKey = fieldIdOrFamily;
    let targetKey = familyOrFieldKey;
    let labelVal = newLabel;

    if (newLabel === undefined) {
      // Chamado com 2 args ou reordenação
      labelVal = familyOrFieldKey;
    }

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
      return { familyFields: newFields };
    });

    try {
      await SupabaseService.saveFamilyField({ id: fieldIdOrFamily, label: labelVal });
    } catch {
      // Ignora erro em offline
    }
    return { success: true };
  },

  removeFamilyColumn: async (fieldIdOrFamily, familyOrFieldKey, fieldKey) => {
    const targetKey = fieldKey || familyOrFieldKey;
    const targetId = fieldIdOrFamily;

    set((state) => {
      const newFields = { ...state.familyFields };
      for (const [fKey, list] of Object.entries(newFields)) {
        newFields[fKey] = list.filter(f => f.id !== targetId && f.field_key !== targetKey && f.id !== targetKey);
      }
      return { familyFields: newFields };
    });

    try {
      await SupabaseService.deleteFamilyField(targetId);
    } catch {
      // Ignora erro em offline
    }
    return { success: true };
  },

  addProduct: async (productData) => {
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'prod-' + Date.now();
    const famObj = get().families.find(f => f.name === productData.family || f.slug === productData.family);
    
    const newProduct: Product = {
      ...productData,
      id: tempId,
      family_id: famObj?.id || null,
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
        syncStatus: 'synced'
      }));
      void StorageService.saveProducts(get().products);
      return { success: true, data: confirmed };
    } else {
      set({ syncStatus: 'error', syncError: res.error || 'Erro ao criar produto' });
      return { success: false, error: res.error };
    }
  },

  updateProduct: async (id, updates) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;

    const updatedProd: Product = { ...current, ...updates, updatedAt: new Date().toISOString() };
    set((state) => ({
      products: state.products.map(p => p.id === id ? updatedProd : p),
      isDirty: true,
      syncStatus: 'dirty'
    }));

    pendingCellEdits.set(id, {
      product: updatedProd,
      expectedVersion: current.version || 1,
      fieldKey: '',
      timestamp: Date.now()
    });

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

    pendingCellEdits.set(`${productId}:${fieldKey}`, {
      product: updatedProd,
      expectedVersion: currentProd.version || 1,
      fieldKey,
      timestamp: Date.now()
    });

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
    if (pendingCellEdits.size === 0) {
      set({ isDirty: false, syncStatus: 'synced' });
      return true;
    }

    set({ isSaving: true, syncStatus: 'saving' });
    const editsToFlush = Array.from(pendingCellEdits.entries());
    pendingCellEdits.clear();

    let allSuccess = true;
    for (const [, edit] of editsToFlush) {
      const res = await SupabaseService.saveProduct(
        edit.product,
        edit.expectedVersion,
        edit.fieldKey,
        `Edição do campo ${edit.fieldKey || 'especificação'}`
      );

      if (res.success && res.data) {
        const nextVersion = res.data.version || (edit.expectedVersion + 1);
        set((state) => ({
          products: state.products.map(p => p.id === edit.product.id ? { ...p, version: nextVersion } : p)
        }));
      } else {
        allSuccess = false;
        if (res.conflict) {
          set({
            syncStatus: 'conflict',
            syncError: `Conflito no produto ${edit.product.model}: alterado em outro dispositivo.`
          });
        } else {
          set({
            syncStatus: 'error',
            syncError: res.error || 'Erro ao persistir alteração na biblioteca.'
          });
        }
      }
    }

    set({
      isSaving: false,
      isDirty: !allSuccess,
      syncStatus: allSuccess ? 'synced' : (get().syncStatus === 'conflict' ? 'conflict' : 'error')
    });

    void StorageService.saveProducts(get().products);
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
      set({ isSaving: false, syncStatus: 'synced' });
      void StorageService.saveProducts(get().products);
      return { success: true };
    } else {
      set({
        products: previousProducts,
        isSaving: false,
        syncStatus: 'error',
        syncError: res.error || 'Erro ao excluir produto do servidor'
      });
      return { success: false, error: res.error };
    }
  },

  getProduct: (id) => {
    return get().products.find((p) => p.id === id);
  },

  loadWorkspace: async () => {
    try {
      const res = await SupabaseService.listLibraryWorkspace();
      if (res.success && res.data) {
        const { families = [], fields = [], products = [], events = [] } = res.data;
        
        // Mapear campos por família
        const fieldMap: Record<string, ProductFamilyField[]> = {};
        fields.forEach((fld: any) => {
          if (!fieldMap[fld.family_id]) fieldMap[fld.family_id] = [];
          fieldMap[fld.family_id].push(fld);
        });

        // Mapear produtos
        const remoteProducts: Product[] = products.map((rp: any) => {
          const specData = rp.data?.specs || rp.data || {};
          return {
            id: rp.id,
            family_id: rp.family_id,
            code: rp.sku,
            model: rp.name,
            family: rp.family || 'Geral',
            description: rp.data?.description || rp.name,
            specs: specData,
            imageUrl: rp.data?.imageUrl || '',
            version: rp.version || 1,
            createdAt: rp.created_at,
            updatedAt: rp.updated_at
          };
        });

        const activeFam = families[0]?.name || get().selectedFamily || 'Transmissores de Pressão Relativa';

        set({
          families,
          familyFields: fieldMap,
          products: remoteProducts.length > 0 ? remoteProducts : INITIAL_PRODUCTS,
          changeEvents: events,
          selectedFamily: activeFam,
          syncStatus: 'synced',
          syncError: null
        });

        void StorageService.saveProducts(remoteProducts.length > 0 ? remoteProducts : INITIAL_PRODUCTS);
        return;
      }
    } catch (e) {
      console.warn('Fallback para cache local de produtos:', e);
    }

    const saved = await StorageService.loadProducts();
    if (saved && saved.length > 0) {
      set({ products: saved, syncStatus: 'offline' });
    } else {
      await StorageService.saveProducts(INITIAL_PRODUCTS);
      set({ products: INITIAL_PRODUCTS, syncStatus: 'offline' });
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
            const updated = state.products.map(p => {
              if (p.id !== newRec.id) return p;
              // Se tiver edição pendente local deste produto, não sobrescreve
              if (pendingCellEdits.has(p.id) || Array.from(pendingCellEdits.keys()).some(k => k.startsWith(p.id))) {
                return p;
              }
              return {
                ...p,
                family_id: newRec.family_id,
                code: newRec.sku,
                model: newRec.name,
                family: newRec.family || 'Geral',
                description: newRec.data?.description || newRec.name,
                specs: newRec.data?.specs || newRec.data || {},
                imageUrl: newRec.data?.imageUrl || '',
                version: newRec.version || 1,
                updatedAt: newRec.updated_at
              };
            });

            // Registra highlight recente
            const recent = { ...state.recentEditedCells };
            recent[newRec.id] = { editorName: 'Outro colaborador', timestamp: Date.now() };

            return { products: updated, recentEditedCells: recent };
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

    // 2. Canal de Presença da Biblioteca
    libraryPresenceChannel = supabase.channel('presence:library', {
      config: { presence: { key: (useAuthStore.getState().userId || 'anon') + ':' + Math.random().toString(36).slice(2, 7) } }
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
            newCellPresence[cellKey].push(p);
          }
          if (p.familyId) {
            if (!newFamilyPresence[p.familyId]) newFamilyPresence[p.familyId] = [];
            newFamilyPresence[p.familyId].push(p);
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

if (typeof window !== 'undefined') {
  const isDebugE2E = import.meta.env.DEV || (new URLSearchParams(window.location.search).get('debugE2E') === '1' && window.sessionStorage.getItem('e2e_allowed') === '1');
  if (isDebugE2E) {
    (window as any).useLibraryStore = useLibraryStore;
  }
}
