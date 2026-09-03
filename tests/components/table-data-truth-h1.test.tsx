// tests/components/table-data-truth-h1.test.tsx
// Suíte de Testes da Missão TABLE.DATA.H1 — PRODUCTION DATA TRUTH HOTFIX
// Valida a eliminação de dados técnicos sintéticos e a integridade de proveniência:
// 1. Criação de produtos sem defaults técnicos sintéticos
// 2. ProductDrawer sanitizado (sem pre-fills fictícios)
// 3. AddProductModal com provenance badges (cloud_official, offline_cache, demo_seed)
// 4. Demo seed NUNCA exibido como "Biblioteca Oficial"
// 5. Robustez a campos técnicos vazios e ausentes (busca e render sem crash)
// 6. Transições de proveniência na store useLibraryStore (Cloud, Cache, Demo)
// 7. Demonstração de regressão do Drift de Autoridade de Família (FASE 8)

import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { AddProductModal } from '../../src/components/editor/AddProductModal';
import { useUIStore } from '../../src/stores/useUIStore';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { StorageService } from '../../src/services/storage.service';
import { INITIAL_PRODUCTS } from '../../src/data/initialProducts';
import { Product } from '../../src/domain/product.schema';
import { createLegacyProductFieldResolver } from '../../src/domain/table-binding';

// Mock de localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('MISSÃO TABLE.DATA.H1 — Data Truth & Provenance Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorageMock.clear();
    vi.clearAllMocks();

    // Reset stores
    useUIStore.setState({
      isAddProductToTableModalOpen: false,
      targetTableBlockId: null
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. CRIAÇÃO DE PRODUTOS SEM DEFAULTS SINTÉTICOS
  // ==========================================================================
  describe('FASE 2 — Synthetic Creation Stop', () => {
    it('novo produto adicionado não contém especificações técnicas sintéticas inventadas', async () => {
      const store = useLibraryStore.getState();
      vi.spyOn(SupabaseService, 'saveProduct').mockResolvedValue({
        success: true,
        data: {
          id: 'test-created-prod-id',
          sku: 'TA-TEST-01',
          name: 'TA-TEST-01-Model',
          family: 'Transmissores',
          data: { specs: {} },
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as any
      });

      const result = await store.addProduct({
        code: 'TA-TEST-01',
        model: 'TA-TEST-01-Model',
        family: 'Transmissores',
        description: '',
        specs: {
          range: '',
          unit: '',
          accuracy: '',
          output: '',
          powerSupply: '',
          processConnection: '',
          protectionDegree: '',
          customSpecs: {}
        },
        imageUrl: ''
      });

      expect(result.success).toBe(true);
      const added = store.getProduct('test-created-prod-id');
      expect(added).toBeDefined();

      // Prova ausência de strings sintéticas proibidas
      const forbiddenStrings = [
        '0 a 100',
        'bar',
        '±0.05% FE',
        '4-20 mA + HART',
        '24 Vdc',
        '1/2" NPT',
        'IP67'
      ];
      forbiddenStrings.forEach((forbidden) => {
        expect(added?.specs.range).not.toBe(forbidden);
        expect(added?.specs.unit).not.toBe(forbidden);
        expect(added?.specs.accuracy).not.toBe(forbidden);
        expect(added?.specs.output).not.toBe(forbidden);
        expect(added?.specs.powerSupply).not.toBe(forbidden);
        expect(added?.specs.processConnection).not.toBe(forbidden);
        expect(added?.specs.protectionDegree).not.toBe(forbidden);
      });
    });
  });

  // ==========================================================================
  // 2. PROVENANCE MODEL & STORE TRANSITIONS
  // ==========================================================================
  describe('FASE 4 — Data Provenance Model in Store', () => {
    it('inicia com proveniência demo_seed antes do loadWorkspace', () => {
      useLibraryStore.setState({
        workspaceLoaded: false,
        dataProvenance: 'demo_seed',
        products: INITIAL_PRODUCTS
      });
      expect(useLibraryStore.getState().dataProvenance).toBe('demo_seed');
    });

    it('cloud success define dataProvenance como cloud_official e substitui INITIAL_PRODUCTS', async () => {
      const mockCloudProducts = [
        {
          id: 'cloud-p1',
          sku: 'PCON-CLOUD',
          name: 'PCON Cloud Official',
          family: 'Pressão',
          data: { specs: { range: '0 a 20 bar' } },
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockResolvedValue({
        success: true,
        data: {
          families: [{ id: 'fam-1', name: 'Pressão', slug: 'pressao', sort_order: 0 }],
          fields: [],
          products: mockCloudProducts,
          events: []
        }
      });
      vi.spyOn(StorageService, 'saveProducts').mockResolvedValue();

      await useLibraryStore.getState().loadWorkspace();

      const state = useLibraryStore.getState();
      expect(state.dataProvenance).toBe('cloud_official');
      expect(state.workspaceSource).toBe('cloud');
      expect(state.products.length).toBe(1);
      expect(state.products[0].code).toBe('PCON-CLOUD');
    });

    it('cloud failure com cache IndexedDB existente define dataProvenance como offline_cache', async () => {
      vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockRejectedValue(new Error('Network offline'));
      const cachedProducts: Product[] = [
        {
          id: 'cached-p1',
          code: 'CACHE-01',
          model: 'Cache Model',
          family: 'Geral',
          description: '',
          specs: { range: '', unit: '', accuracy: '', output: '', powerSupply: '', processConnection: '', protectionDegree: '', customSpecs: {} },
          imageUrl: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1
        }
      ];
      vi.spyOn(StorageService, 'loadProducts').mockResolvedValue(cachedProducts);

      await useLibraryStore.getState().loadWorkspace();

      const state = useLibraryStore.getState();
      expect(state.dataProvenance).toBe('offline_cache');
      expect(state.workspaceSource).toBe('offline');
      expect(state.products[0].code).toBe('CACHE-01');
    });

    it('cloud failure com cache IndexedDB vazio define dataProvenance como demo_seed e usa INITIAL_PRODUCTS', async () => {
      vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockRejectedValue(new Error('Network offline'));
      vi.spyOn(StorageService, 'loadProducts').mockResolvedValue([]);

      await useLibraryStore.getState().loadWorkspace();

      const state = useLibraryStore.getState();
      expect(state.dataProvenance).toBe('demo_seed');
      expect(state.workspaceSource).toBe('offline');
      expect(state.products.length).toBe(INITIAL_PRODUCTS.length);
    });
  });

  // ==========================================================================
  // 3. ADD PRODUCT MODAL PROVENANCE BADGES & DEMO INTEGRITY
  // ==========================================================================
  describe('FASE 5 — AddProductModal Provenance Badges', () => {
    it('renderiza título "Biblioteca Oficial — Nuvem" e badge "Nuvem Oficial" em cloud_official', async () => {
      useLibraryStore.setState({
        dataProvenance: 'cloud_official',
        products: [
          {
            id: 'p-cloud',
            code: 'OFFICIAL-1',
            model: 'Modelo Oficial',
            family: 'Pressão',
            description: '',
            specs: { range: '0 a 10', unit: 'bar', accuracy: '0.1%', output: '', powerSupply: '', processConnection: '', protectionDegree: '', customSpecs: {} },
            imageUrl: '',
            createdAt: '',
            updatedAt: '',
            version: 1
          }
        ]
      });
      useUIStore.setState({
        isAddProductToTableModalOpen: true,
        targetTableBlockId: 'table-block-1'
      });

      await act(async () => {
        root.render(<AddProductModal />);
      });

      expect(container.textContent).toContain('Biblioteca Oficial — Nuvem');
      expect(container.textContent).toContain('Nuvem Oficial');
      expect(container.textContent).not.toContain('Demonstração / Teste');
      expect(container.textContent).not.toContain('Aviso de Proveniência');
    });

    it('renderiza "Biblioteca — Cache Offline" e badge "Cache Local (Offline)" em offline_cache', async () => {
      useLibraryStore.setState({
        dataProvenance: 'offline_cache',
        products: [
          {
            id: 'p-cache',
            code: 'CACHED-1',
            model: 'Modelo em Cache',
            family: 'Pressão',
            description: '',
            specs: { range: '0 a 10', unit: 'bar', accuracy: '0.1%', output: '', powerSupply: '', processConnection: '', protectionDegree: '', customSpecs: {} },
            imageUrl: '',
            createdAt: '',
            updatedAt: '',
            version: 1
          }
        ]
      });
      useUIStore.setState({
        isAddProductToTableModalOpen: true,
        targetTableBlockId: 'table-block-1'
      });

      await act(async () => {
        root.render(<AddProductModal />);
      });

      expect(container.textContent).toContain('Biblioteca — Cache Offline');
      expect(container.textContent).toContain('Cache Local (Offline)');
      expect(container.textContent).not.toContain('Biblioteca Oficial — Nuvem');
    });

    it('NUNCA exibe a expressão "Biblioteca Oficial" para INITIAL_PRODUCTS / demo_seed', async () => {
      useLibraryStore.setState({
        dataProvenance: 'demo_seed',
        products: INITIAL_PRODUCTS
      });
      useUIStore.setState({
        isAddProductToTableModalOpen: true,
        targetTableBlockId: 'table-block-1'
      });

      await act(async () => {
        root.render(<AddProductModal />);
      });

      // REGRA INVIOLÁVEL: NUNCA usar "Biblioteca Oficial" para demo_seed
      expect(container.textContent).not.toContain('Biblioteca Oficial');
      expect(container.textContent).toContain('Dados de Demonstração');
      expect(container.textContent).toContain('Demonstração / Teste');
      expect(container.textContent).toContain('Aviso de Proveniência');
      expect(container.textContent).toContain('DEMO');
    });
  });

  // ==========================================================================
  // 4. NULL / EMPTY SAFETY
  // ==========================================================================
  describe('FASE 6 — Null & Empty Safety in AddProductModal', () => {
    it('produto com technical fields vazios não quebra busca nem render', async () => {
      useLibraryStore.setState({
        dataProvenance: 'cloud_official',
        products: [
          {
            id: 'p-empty-specs',
            code: 'EMPTY-01',
            model: 'Modelo Vazio',
            family: 'Família Teste',
            description: '',
            specs: {
              range: '',
              unit: '',
              accuracy: '',
              output: '',
              powerSupply: '',
              processConnection: '',
              protectionDegree: '',
              customSpecs: {}
            },
            imageUrl: '',
            createdAt: '',
            updatedAt: '',
            version: 1
          }
        ]
      });
      useUIStore.setState({
        isAddProductToTableModalOpen: true,
        targetTableBlockId: 'table-block-1'
      });

      await act(async () => {
        root.render(<AddProductModal />);
      });

      expect(container.textContent).toContain('EMPTY-01');
      expect(container.textContent).toContain('Sem especificações técnicas registradas');

      // Testar busca sem crash
      const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'EMPTY' } });
      });

      expect(container.textContent).toContain('EMPTY-01');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'XYZ_INEXISTENTE' } });
      });

      expect(container.textContent).toContain('Nenhum produto cadastrado na biblioteca corresponde ao filtro.');
    });

    it('produto com technical fields parcialmente ausentes (undefined specs) não lança TypeError', async () => {
      const incompleteProduct = {
        id: 'p-incomplete',
        code: 'INC-99',
        model: 'Modelo Incompleto',
        family: 'Geral',
        description: 'Sem range definido',
        specs: {} as any, // range e accuracy undefined
        imageUrl: '',
        createdAt: '',
        updatedAt: '',
        version: 1
      } as Product;

      useLibraryStore.setState({
        dataProvenance: 'cloud_official',
        products: [incompleteProduct]
      });
      useUIStore.setState({
        isAddProductToTableModalOpen: true,
        targetTableBlockId: 'table-block-1'
      });

      await act(async () => {
        root.render(<AddProductModal />);
      });

      expect(container.textContent).toContain('INC-99');

      // Testar busca que examina specs.range undefined
      const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'teste' } });
      });

      // Deve executar perfeitamente sem TypeError
      expect(container.querySelector('div')).toBeTruthy();
    });
  });

  // ==========================================================================
  // 5. FASE 8: DEMONSTRAÇÃO DE DRIFT DE AUTORIDADE DE FAMÍLIA
  // ==========================================================================
  describe('FASE 8 — Family Authority Drift Demonstration', () => {
    it('registra o drift atual: Table V2 resolve campo presente no JSON do produto mesmo quando ausente em product_family_fields', () => {
      // Simulação: Família "Acessórios" possui apenas "codigo" e "descricao" nos campos de família
      const familyFields = [
        { id: 'fld-1', family_id: 'fam-acc', field_key: 'code', label: 'Código', field_type: 'text', sort_order: 0, width: 100, visible: true, is_system: true },
        { id: 'fld-2', family_id: 'fam-acc', field_key: 'description', label: 'Descrição', field_type: 'text', sort_order: 1, width: 200, visible: true, is_system: false }
      ];

      // O produto no JSON possui um campo residual "range: 0 a 100" que NÃO pertence à família
      const productWithResidualSpecs: Product = {
        id: 'prod-drift-1',
        code: 'ACC-01',
        model: 'Válvula Manifold',
        family: 'Acessórios',
        description: 'Válvula de 2 vias',
        specs: {
          range: '0 a 100', // Campo órfão/residual
          unit: 'bar',
          accuracy: '',
          output: '',
          powerSupply: '',
          processConnection: '',
          protectionDegree: '',
          customSpecs: {}
        },
        imageUrl: '',
        createdAt: '',
        updatedAt: '',
        version: 1
      };

      // Na UI da Biblioteca, as colunas são calculadas estritamente por familyFields:
      const libraryVisibleKeys = familyFields.map((f) => f.field_key);
      expect(libraryVisibleKeys).not.toContain('range'); // 'range' está invisível na Biblioteca!

      // Porém, o Table Core V2 Legacy Resolver lê diretamente o JSON do produto:
      const resolver = createLegacyProductFieldResolver((id) =>
        id === 'prod-drift-1' ? productWithResidualSpecs : undefined
      );

      const resolutionResult = resolver({
        kind: 'datum_reference',
        productId: 'prod-drift-1',
        datumKey: 'legacy.product_field.range',
        bindingMode: 'live'
      });

      // REGRESSÃO IDENTIFICADA: A Table V2 resolve "0 a 100" porque ignora product_family_fields
      expect(resolutionResult).toBeDefined();
      expect(resolutionResult?.status).toBe('approved');
      if (resolutionResult?.value.kind === 'text') {
        expect(resolutionResult.value.text).toBe('0 a 100');
      }

      // Este teste formaliza a especificação de que TABLE.V2.PIM1 deverá substituir
      // essa autoridade desvinculada pelo Product Workbook canônico.
    });
  });
});
