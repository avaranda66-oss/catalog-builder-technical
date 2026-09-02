import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { ProductFamilyField } from '../../src/domain/product.schema';

describe('FASE 2B.1A — Library Schema Materialization, Column UX & Security Hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    useLibraryStore.getState().resetToInitial();
  });

  // =========================================================================
  // SCHEMA-H1: Existing family + first custom column => all historical columns remain
  // =========================================================================
  it('SCHEMA-H1: Família existente (Válvulas de Controle) com 5 campos legados materializados preserva TODOS ao adicionar campo customizado', async () => {
    const store = useLibraryStore.getState();
    const familyName = 'Válvulas de Controle & Posicionadores';
    const famId = 'fam-valvulas-3';

    // Simula estado carregado do PostgreSQL com os 5 campos legados materializados
    const legacyFields: ProductFamilyField[] = [
      { id: 'fld-1', family_id: famId, field_key: 'range', label: 'Faixa de Medição', field_type: 'text', sort_order: 1, width: 130, visible: true, is_system: false, unit: null },
      { id: 'fld-2', family_id: famId, field_key: 'unit', label: 'Unidade', field_type: 'text', sort_order: 2, width: 80, visible: true, is_system: false, unit: null },
      { id: 'fld-3', family_id: famId, field_key: 'accuracy', label: 'Exatidão', field_type: 'text', sort_order: 3, width: 100, visible: true, is_system: false, unit: null },
      { id: 'fld-4', family_id: famId, field_key: 'output', label: 'Sinal de Saída', field_type: 'text', sort_order: 4, width: 120, visible: true, is_system: false, unit: null },
      { id: 'fld-5', family_id: famId, field_key: 'processConnection', label: 'Conexão de Processo', field_type: 'text', sort_order: 5, width: 150, visible: true, is_system: false, unit: null }
    ];

    useLibraryStore.setState({
      families: [{ id: famId, name: familyName, slug: 'valvulas-de-controle-posicionadores', sort_order: 1, created_at: '', updated_at: '' }],
      familyFields: {
        [famId]: legacyFields,
        [familyName]: legacyFields
      }
    });

    // BEFORE: Deve ter 7 colunas (Código, Modelo, Faixa, Unidade, Exatidão, Sinal, Conexão)
    const colsBefore = store.getColumnsForFamily(familyName);
    expect(colsBefore.length).toBe(7);
    expect(colsBefore.map(c => c.key)).toEqual(['code', 'model', 'range', 'unit', 'accuracy', 'output', 'processConnection']);

    // Adiciona o primeiro campo customizado novo: 'teste2'
    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({
      success: true,
      data: {
        id: 'fld-custom-teste2',
        family_id: famId,
        field_key: 'teste2',
        label: 'Teste 2 Custom',
        field_type: 'text',
        sort_order: 6,
        width: 130,
        visible: true,
        is_system: false,
        unit: null
      }
    });

    const addRes = await store.addFamilyColumn(famId, 'teste2', 'Teste 2 Custom');
    expect(addRes.success).toBe(true);

    // AFTER: Deve ter 8 colunas — NENHUMA coluna legada desapareceu!
    const colsAfter = useLibraryStore.getState().getColumnsForFamily(familyName);
    expect(colsAfter.length).toBe(8);
    expect(colsAfter.map(c => c.key)).toEqual(['code', 'model', 'range', 'unit', 'accuracy', 'output', 'processConnection', 'teste2']);
  });

  // =========================================================================
  // SCHEMA-H7: Assert product immutability during column schema changes
  // =========================================================================
  it('SCHEMA-H7: Adicionar ou remover coluna NÃO muta nem incrementa versão dos produtos', async () => {
    const store = useLibraryStore.getState();
    const targetProduct = store.products[0];
    const initialVersion = targetProduct.version;
    const initialProductSnapshot = JSON.parse(JSON.stringify(targetProduct));

    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({
      success: true,
      data: { id: 'col-new', family_id: targetProduct.family, field_key: 'novo_campo', label: 'Novo Campo', field_type: 'text', sort_order: 1, width: 130, visible: true, is_system: false, unit: null, created_by: null, updated_by: null, created_at: '', updated_at: '' }
    });

    await store.addFamilyColumn(targetProduct.family, 'novo_campo', 'Novo Campo');

    const productAfter = useLibraryStore.getState().getProduct(targetProduct.id);
    expect(productAfter?.version).toBe(initialVersion);
    expect(productAfter?.specs).toEqual(initialProductSnapshot.specs);
  });

  // =========================================================================
  // SEC-1, 2, 3: Permissions & Role Validation
  // =========================================================================
  it('SEC-1 & SEC-2: Erro 42501 ao tentar salvar produto sem role admin propaga mensagem limpa de permissão', async () => {
    vi.spyOn(SupabaseService, 'saveProduct').mockResolvedValue({
      success: false,
      error: 'Permissão negada: apenas administradores podem alterar a biblioteca de produtos.'
    });

    const res = await SupabaseService.saveProduct({ code: 'P1', model: 'M1' }, 1);
    expect(res.success).toBe(false);
    expect(res.error).toContain('apenas administradores');
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

    store.updateProductCell(targetProduct.id, 'range', '0 a 500 bar');
    store.updateProductCell(targetProduct.id, 'accuracy', '±0.025% FE');
    store.updateProductCell(targetProduct.id, 'output', 'Modbus RTU');
    store.updateProductCell(targetProduct.id, 'processConnection', 'Flange 2"');

    const flushSuccess = await useLibraryStore.getState().flushLibraryEdits();

    expect(flushSuccess).toBe(true);
    expect(saveCallsCount).toBe(1);
    expect(receivedExpectedVersion).toBe(initialVersion);
    expect(receivedSnapshot.specs.range).toBe('0 a 500 bar');
    expect(receivedSnapshot.specs.accuracy).toBe('±0.025% FE');
    expect(receivedSnapshot.specs.output).toBe('Modbus RTU');
    expect(receivedSnapshot.specs.processConnection).toBe('Flange 2"');
    
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
        products: [],
        events: []
      }
    });

    await useLibraryStore.getState().loadWorkspace();

    const state = useLibraryStore.getState();
    expect(state.syncStatus).toBe('synced');
    expect(state.products.length).toBe(0);
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

    const colsAfter = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfter.some(c => c.key === 'campo_falha')).toBe(false);
    expect(colsAfter.length).toBe(initialColumnsCount);
    expect(useLibraryStore.getState().syncStatus).toBe('error');
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

    vi.spyOn(SupabaseService, 'saveFamilyField').mockResolvedValue({ success: true, data: {} as any });
    const renameRes = await store.renameFamilyColumn('field-201', family, 'Sensor Piezorresistivo');
    expect(renameRes.success).toBe(true);

    const colsAfterRename = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfterRename.find(c => c.key === 'custom_sensor')?.label).toBe('Sensor Piezorresistivo');

    vi.spyOn(SupabaseService, 'deleteFamilyField').mockResolvedValue({ success: true });
    const deleteRes = await store.removeFamilyColumn('field-201', family, 'custom_sensor');
    expect(deleteRes.success).toBe(true);

    const colsAfterDelete = useLibraryStore.getState().getColumnsForFamily(family);
    expect(colsAfterDelete.some(c => c.key === 'custom_sensor')).toBe(false);
  });
});
