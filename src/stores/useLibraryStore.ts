import { create } from 'zustand';
import { Product, LibraryColumn } from '../domain/product.schema';
import { INITIAL_PRODUCTS } from '../data/initialProducts';
import { StorageService } from '../services/storage.service';

const DEFAULT_FAMILY_COLUMNS: Record<string, LibraryColumn[]> = {
  'Transmissores de Pressão Relativa': [
    { key: 'code', label: 'Código', visible: true, width: 110 },
    { key: 'model', label: 'Modelo', visible: true, width: 130 },
    { key: 'range', label: 'Faixa de Medição', visible: true, width: 130 },
    { key: 'unit', label: 'Unidade', visible: true, width: 70 },
    { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
    { key: 'output', label: 'Sinal de Saída', visible: true, width: 120 },
    { key: 'processConnection', label: 'Conexão de Processo', visible: true, width: 150 }
  ],
  'Transmissores de Pressão Diferencial': [
    { key: 'code', label: 'Código', visible: true, width: 110 },
    { key: 'model', label: 'Modelo', visible: true, width: 130 },
    { key: 'range', label: 'Faixa Diferencial', visible: true, width: 130 },
    { key: 'unit', label: 'Unidade', visible: true, width: 70 },
    { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
    { key: 'maxStaticPressure', label: 'Pressão Estática Máx.', visible: true, width: 140, isCustom: true },
    { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
  ],
  'Válvulas de Controle & Posicionadores': [
    { key: 'code', label: 'Código', visible: true, width: 110 },
    { key: 'model', label: 'Modelo da Válvula', visible: true, width: 140 },
    { key: 'range', label: 'Classe de Pressão', visible: true, width: 120 },
    { key: 'accuracy', label: 'Banda Morta / Exatidão', visible: true, width: 130 },
    { key: 'processConnection', label: 'Conexão Flange', visible: true, width: 140 },
    { key: 'leakageClass', label: 'Classe de Estanqueidade', visible: true, width: 150, isCustom: true }
  ],
  'Transmissores de Temperatura': [
    { key: 'code', label: 'Código', visible: true, width: 110 },
    { key: 'model', label: 'Modelo', visible: true, width: 130 },
    { key: 'range', label: 'Faixa de Temperatura', visible: true, width: 140 },
    { key: 'unit', label: 'Unid.', visible: true, width: 60 },
    { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
    { key: 'rtdSupport', label: 'Sensor Suportado', visible: true, width: 140, isCustom: true },
    { key: 'output', label: 'Sinal Saída', visible: true, width: 120 }
  ]
};

interface LibraryState {
  products: Product[];
  familyColumns: Record<string, LibraryColumn[]>;
  isAdmin: boolean;
  selectedProductId: string | null;
  searchQuery: string;
  selectedFamily: string;
  
  // Actions de Navegação
  setAdmin: (isAdmin: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSelectedFamily: (family: string) => void;
  setSelectedProduct: (id: string | null) => void;
  
  // CRUD de Produtos
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  updateProductCell: (productId: string, fieldKey: string, value: string) => void;
  deleteProduct: (id: string) => void;
  getProduct: (id: string) => Product | undefined;
  
  // Gerenciamento de Colunas por Família
  getColumnsForFamily: (family: string) => LibraryColumn[];
  renameFamilyColumn: (family: string, columnKey: string, newLabel: string) => void;
  addFamilyColumn: (family: string, columnKey: string, label: string) => void;
  removeFamilyColumn: (family: string, columnKey: string) => void;
  
  // Persistência
  loadProducts: () => Promise<void>;
  resetToInitial: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  products: INITIAL_PRODUCTS,
  familyColumns: DEFAULT_FAMILY_COLUMNS,
  isAdmin: true,
  selectedProductId: null,
  searchQuery: '',
  selectedFamily: 'Transmissores de Pressão Relativa',

  setAdmin: (isAdmin) => set({ isAdmin }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedFamily: (selectedFamily) => set({ selectedFamily }),
  setSelectedProduct: (selectedProductId) => set({ selectedProductId }),

  getColumnsForFamily: (family) => {
    const { familyColumns } = get();
    if (familyColumns[family]) return familyColumns[family];

    return [
      { key: 'code', label: 'Código', visible: true, width: 110 },
      { key: 'model', label: 'Modelo', visible: true, width: 130 },
      { key: 'range', label: 'Faixa de Medição', visible: true, width: 130 },
      { key: 'unit', label: 'Unidade', visible: true, width: 70 },
      { key: 'accuracy', label: 'Exatidão', visible: true, width: 100 },
      { key: 'output', label: 'Sinal de Saída', visible: true, width: 120 }
    ];
  },

  renameFamilyColumn: (family, columnKey, newLabel) => {
    set((state) => {
      const currentCols = state.getColumnsForFamily(family);
      const updated = currentCols.map((c) => (c.key === columnKey ? { ...c, label: newLabel } : c));
      const newFamilyCols = { ...state.familyColumns, [family]: updated };
      localStorage.setItem('cb_family_columns', JSON.stringify(newFamilyCols));
      return { familyColumns: newFamilyCols };
    });
  },

  addFamilyColumn: (family, columnKey, label) => {
    set((state) => {
      const currentCols = state.getColumnsForFamily(family);
      const newCol: LibraryColumn = {
        key: columnKey,
        label,
        visible: true,
        isCustom: true
      };
      const newFamilyCols = { ...state.familyColumns, [family]: [...currentCols, newCol] };
      localStorage.setItem('cb_family_columns', JSON.stringify(newFamilyCols));
      return { familyColumns: newFamilyCols };
    });
  },

  removeFamilyColumn: (family, columnKey) => {
    set((state) => {
      const currentCols = state.getColumnsForFamily(family);
      const updated = currentCols.filter((c) => c.key !== columnKey);
      const newFamilyCols = { ...state.familyColumns, [family]: updated };
      localStorage.setItem('cb_family_columns', JSON.stringify(newFamilyCols));
      return { familyColumns: newFamilyCols };
    });
  },

  addProduct: (productData) => {
    const newProduct: Product = {
      ...productData,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    set((state) => {
      const updated = [newProduct, ...state.products];
      StorageService.saveProducts(updated);
      return { products: updated };
    });
  },

  updateProduct: (id, updates) => {
    set((state) => {
      const updated = state.products.map((p) =>
        p.id === id
          ? { ...p, ...updates, updatedAt: new Date().toISOString(), version: (p.version || 1) + 1 }
          : p
      );
      StorageService.saveProducts(updated);
      return { products: updated };
    });
  },

  updateProductCell: (productId, fieldKey, value) => {
    set((state) => {
      const updated = state.products.map((p) => {
        if (p.id !== productId) return p;

        if (['code', 'model', 'family', 'description', 'imageUrl'].includes(fieldKey)) {
          return { ...p, [fieldKey]: value, updatedAt: new Date().toISOString() };
        }

        const standardSpecKeys = [
          'range',
          'unit',
          'accuracy',
          'output',
          'powerSupply',
          'processConnection',
          'protectionDegree'
        ];

        if (standardSpecKeys.includes(fieldKey)) {
          return {
            ...p,
            specs: {
              ...p.specs,
              [fieldKey]: value
            },
            updatedAt: new Date().toISOString()
          };
        }

        // Custom spec da família
        return {
          ...p,
          specs: {
            ...p.specs,
            customSpecs: {
              ...(p.specs.customSpecs || {}),
              [fieldKey]: value
            }
          },
          updatedAt: new Date().toISOString()
        };
      });

      StorageService.saveProducts(updated);
      return { products: updated };
    });
  },

  deleteProduct: (id) => {
    set((state) => {
      const updated = state.products.filter((p) => p.id !== id);
      StorageService.saveProducts(updated);
      return { products: updated };
    });
  },

  getProduct: (id) => {
    return get().products.find((p) => p.id === id);
  },

  loadProducts: async () => {
    // Carrega colunas customizadas salvas
    if (typeof window !== 'undefined') {
      const savedCols = localStorage.getItem('cb_family_columns');
      if (savedCols) {
        try {
          set({ familyColumns: JSON.parse(savedCols) });
        } catch (e) {
          console.error(e);
        }
      }
    }

    // 1. Carrega local primeiro
    const saved = await StorageService.loadProducts();

    // 2. Tenta puxar da nuvem para sincronizar entre dispositivos
    try {
      const { SupabaseService } = await import('../services/supabase.service');
      const cloudResult = await SupabaseService.pullProductsFromCloud();
      if (cloudResult.success && cloudResult.products.length > 0) {
        // Merge: usa os produtos da nuvem + locais que não existem na nuvem
        const cloudIds = new Set(cloudResult.products.map((p) => p.id));
        const localOnly = (saved || []).filter((p) => !cloudIds.has(p.id));
        const merged = [...cloudResult.products, ...localOnly];

        await StorageService.saveProducts(merged);
        set({ products: merged });
        console.log(`☁️ ${cloudResult.products.length} produtos sincronizados da nuvem.`);

        // Push local-only products back to cloud
        if (localOnly.length > 0) {
          SupabaseService.pushProductsToCloud(localOnly).catch(() => {});
        }
        return;
      }
    } catch {
      // Supabase offline — usa local
    }

    if (saved && saved.length > 0) {
      set({ products: saved });
    } else {
      await StorageService.saveProducts(INITIAL_PRODUCTS);
      set({ products: INITIAL_PRODUCTS });
    }
  },

  resetToInitial: () => {
    StorageService.saveProducts(INITIAL_PRODUCTS);
    set({ products: INITIAL_PRODUCTS, familyColumns: DEFAULT_FAMILY_COLUMNS });
    localStorage.removeItem('cb_family_columns');
  }
}));
