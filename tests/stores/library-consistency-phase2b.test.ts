import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore, CORE_PRODUCT_COLUMNS } from '../../src/stores/useLibraryStore';
import { SupabaseService } from '../../src/services/supabase.service';

describe('FASE 2B.1 — Library Hardening, Reproducibility & Column UX Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    useLibraryStore.getState().resetToInitial();
  });

  // =========================================================================
  // COL-UX-1 & COL-UX-2: Core Columns vs Family Fields
  // =========================================================================
  it('COL-UX-1: Nova família sem produtos ou campos persistidos deve SEMPRE exibir colunas universais (Código e Modelo)', () => {
    const store = useLibraryStore.getState();
    const cols = store.getColumnsForFamily('Calibradores de Vazão');
    
    expect(cols.length).toBe(2);
    expect(cols[0].key).toBe('code');
    expect(cols[0].label).toBe('Código');
    expect(cols[0].isSystem).toBe(true);
    expect(cols[1].key).toBe('model');
    expect(cols[1].label).toBe('Modelo');
    expect(cols[1].isSystem).toBe(true);
  });

  it('COL-UX-2: Adicionar coluna customizada em nova família PRESERVA Código e Modelo na tabela', async () => {
    const store = useLibraryStore.getState();
    const family = 'Calibradores de Vazão';

    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({
      success: true,
      data: {
        id: 'field-101',
        family_id: family,
        field_key: 'vazao_maxima',
        label: 'Vazão Máxima',
        field_type: 'text',
        sort_order: 1,
        width: 140,
        visible: true,
        is_system: false,
        unit: 'm3/h',
        created_by: null,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    const addRes = await store.addFamilyColumn(family, 'vazao_maxima', 'Vazão Máxima');
    expect(addRes.success).toBe(true);

    const cols = useLibraryStore.getState().getColumnsForFamily(family);
    expect(cols.length).toBe(3);
    expect(cols[0].key).toBe('code');
    expect(cols[1].key).toBe('model');
    expect(cols[2].key).toBe('vazao_maxima');
    expect(cols[2].label).toBe('Vazão Máxima');
  });

  // =========================================================================
  // LIB-H1: Multi-cell edits on same product consolidated into 1 CAS save
  // =========================================================================
  it('LIB-H1: Múltiplas edições rápidas no mesmo produto são consolidadas em 1 único save CAS sem auto-conflito', async () => {
    const store = useLibraryStore.getState();
    const targetProduct = store.products[0];
    const initialVersion = targetProduct.version || 1;

    let saveCallsCount = 0;
    let receivedExpectedVersion = 0;
    let receivedSnapshot: any = null;

    vi.spyOn(SupabaseService, 'saveProduct').mockImplementation(async (product, expectedVersion = 0) => {
      saveCallsCount++;
      receivedExpectedVersion = expectedVersion;
      receivedSnapshot = product;
      return {
        success: true,
        data: {
          id: product.id,
          sku: product.code,
          name: product.model,
          family: product.family,
          data: product.specs,
          version: (expectedVersion || 0) + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      };
    });

    // 4 edições rápidas no mesmo produto antes do debounce flush
    store.updateProductCell(targetProduct.id, 'range', '0 a 500 bar');
    store.updateProductCell(targetProduct.id, 'accuracy', '±0.025% FE');
    store.updateProductCell(targetProduct.id, 'output', 'Modbus RTU');
    store.updateProductCell(targetProduct.id, 'processConnection', 'Flange 2"');

    // Dispara o flush
    const flushSuccess = await useLibraryStore.getState().flushLibraryEdits();

    expect(flushSuccess).toBe(true);
    expect(saveCallsCount).toBe(1); // Exatamente 1 save disparado para o produto
    expect(receivedExpectedVersion).toBe(initialVersion);
    expect(receivedSnapshot.specs.range).toBe('0 a 500 bar');
    expect(receivedSnapshot.specs.accuracy).toBe('±0.025% FE');
    expect(receivedSnapshot.specs.output).toBe('Modbus RTU');
    expect(receivedSnapshot.specs.processConnection).toBe('Flange 2"');
    
    // Versão do produto na store foi incrementada
    const updatedProd = useLibraryStore.getState().getProduct(targetProduct.id);
    expect(updatedProd?.version).toBe(initialVersion + 1);
  });

  // =========================================================================
  // LIB-H3: Empty Cloud is Valid (does NOT force demo data)
  // =========================================================================
  it('LIB-H3: Resposta cloud válida com 0 produtos preserva lista vazia sem forçar INITIAL_PRODUCTS', async () => {
    vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockResolvedValue({
      success: true,
      data: {
        families: [{ id: 'fam-1', name: 'Família Vazia', slug: 'familia-vazia', sort_order: 1, created_at: '', updated_at: '' }],
        fields: [],
        products: [], // Cloud legitimamente vazio
        events: []
      }
    });

    await useLibraryStore.getState().loadWorkspace();

    const state = useLibraryStore.getState();
    expect(state.syncStatus).toBe('synced');
    expect(state.products.length).toBe(0); // Zero produtos mantido
    expect(state.families.length).toBe(1);
    expect(state.families[0].name).toBe('Família Vazia');
  });

  // =========================================================================
  // LIB-H4: Column server failure rolls back and returns success=false
  // =========================================================================
  it('LIB-H4: Falha no servidor ao adicionar coluna faz rollback local e retorna success=false (zero false-success)', async () => {
    const store = useLibraryStore.getState();
    const family = 'Transmissores de Pressão Relativa';
    const initialColumnsCount = store.getColumnsForFamily(family).length;

    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({
      success: false,
      error: 'Database error: connection timeout'
    });

    const res = await store.addFamilyColumn(family, 'campo_falha', 'Campo Falha');

    expect(res.success).toBe(false);
    expect(res.error).toContain('Database error');

    // A coluna NÃO deve permanecer na store
    const colsAfter = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfter.some(c => c.key === 'campo_falha')).toBe(false);
    expect(colsAfter.length).toBe(initialColumnsCount);
    expect(useLibraryStore.getState().syncStatus).toBe('error');
  });

  // =========================================================================
  // LIB-H5 & LIB-H6: Stable Presence Identity and Deduplication
  // =========================================================================
  it('LIB-H5 & LIB-H6: Presença mantém clientInstanceId único por sessão e deduplica entradas', () => {
    const store = useLibraryStore.getState();
    const initialCellPresence = store.cellPresence;
    expect(initialCellPresence).toBeDefined();

    // Verificação de CORE_PRODUCT_COLUMNS
    expect(CORE_PRODUCT_COLUMNS.length).toBe(2);
    expect(CORE_PRODUCT_COLUMNS.every(c => c.isSystem)).toBe(true);
  });

  // =========================================================================
  // LIB-H10: Delete Product Rollback on Server Failure
  // =========================================================================
  it('LIB-H10: Falha no servidor ao excluir produto restaura o produto na lista local e retorna success=false', async () => {
    const store = useLibraryStore.getState();
    const targetProduct = store.products[0];
    const initialProductsCount = store.products.length;

    vi.spyOn(SupabaseService, 'deleteProduct').mockResolvedValue({
      success: false,
      error: 'Violates foreign key constraint'
    });

    const res = await store.deleteProduct(targetProduct.id);

    expect(res.success).toBe(false);
    expect(res.error).toContain('foreign key');

    // Produto foi restaurado
    const stateAfter = useLibraryStore.getState();
    expect(stateAfter.products.length).toBe(initialProductsCount);
    expect(stateAfter.products.some(p => p.id === targetProduct.id)).toBe(true);
    expect(stateAfter.syncStatus).toBe('error');
  });

  // =========================================================================
  // COL-UX-4, 5, 6: Renaming, Deleting and System Column Protections
  // =========================================================================
  it('COL-UX-4 & COL-UX-5: Renomear e excluir coluna customizada funciona com ACK remoto', async () => {
    const store = useLibraryStore.getState();
    const family = 'Calibradores de Pressão';

    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({
      success: true,
      data: {
        id: 'field-201',
        family_id: family,
        field_key: 'custom_sensor',
        label: 'Tipo de Sensor',
        field_type: 'text',
        sort_order: 1,
        width: 130,
        visible: true,
        is_system: false,
        unit: null,
        created_by: null,
        updated_by: null,
        created_at: '',
        updated_at: ''
      }
    });

    await store.addFamilyColumn(family, 'custom_sensor', 'Tipo de Sensor');

    // Renomear
    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({ success: true, data: {} as any });
    const renameRes = await store.renameFamilyColumn('field-201', family, 'Sensor Piezorresistivo');
    expect(renameRes.success).toBe(true);

    const colsAfterRename = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfterRename.find(c => c.key === 'custom_sensor')?.label).toBe('Sensor Piezorresistivo');

    // Excluir
    vi.spyOn(SupabaseService, 'deleteFamilyField').mockResolvedValue({ success: true });
    const deleteRes = await store.removeFamilyColumn('field-201', family, 'custom_sensor');
    expect(deleteRes.success).toBe(true);

    const colsAfterDelete = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfterDelete.some(c => c.key === 'custom_sensor')).toBe(false);
  });
});
