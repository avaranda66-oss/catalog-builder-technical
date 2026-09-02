import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseService } from '../../src/services/supabase.service';
import { MOCK_PRODUCTS, MOCK_CATALOG } from '../fixtures/mockData';
import { mockSupabaseClient } from '../setup';

describe('SupabaseService v2 (RPCs com CAS e Isolamento Total)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista workspace compartilhado via RPC list_workspace_v2', async () => {
    const mockWorkspace = {
      catalogs: [{ id: 'cat-1', name: 'Catálogo Presys', status: 'published', version: 1, brand: {} }],
      products: [{ id: 'prod-1', sku: 'TA-25N', name: 'TA-25N', family: 'Calibradores', version: 1, data: {} }],
      templates: [],
      userRole: 'admin'
    };

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockWorkspace, error: null });

    const result = await SupabaseService.listWorkspace();
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockWorkspace);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('list_workspace_v2');
  });

  it('salva produto oficial com controle de versão otimista (CAS)', async () => {
    const mockSavedProduct = {
      id: 'prod-uuid-1',
      sku: 'TA-25N',
      name: 'TA-25N Calibrador',
      version: 2
    };

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockSavedProduct, error: null });

    const result = await SupabaseService.saveOfficialProduct(MOCK_PRODUCTS[0], 1);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockSavedProduct);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('save_official_product_v2', {
      p_product: MOCK_PRODUCTS[0],
      p_expected_version: 1
    });
  });

  it('trata conflito de concorrência 40001 ao salvar produto desatualizado', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'Conflito de Concorrência: o produto foi modificado em outro dispositivo' }
    });

    const result = await SupabaseService.saveOfficialProduct(MOCK_PRODUCTS[0], 1);
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.error).toContain('Conflito de Concorrência');
  });

  it('salva catálogo compartilhado com controle de versão otimista (CAS)', async () => {
    const mockSavedCatalog = {
      id: 'cat-uuid-1',
      name: 'Catálogo TA-25N',
      version: 3
    };

    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: mockSavedCatalog, error: null });

    const result = await SupabaseService.saveCatalog(MOCK_CATALOG, 2, 'Atualização de blocos');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockSavedCatalog);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('save_catalog_v3', {
      p_catalog: MOCK_CATALOG,
      p_expected_version: 2,
      p_summary: 'Atualização de blocos'
    });
  });

  it('trata conflito de concorrência 40001 ao salvar catálogo desatualizado', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'Conflito de Concorrência: o catálogo foi modificado em outro dispositivo' }
    });

    const result = await SupabaseService.saveCatalog(MOCK_CATALOG, 1);
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
  });

  it('exclui catálogo compartilhado via RPC delete_catalog_v2', async () => {
    mockSupabaseClient.rpc.mockResolvedValueOnce({ data: true, error: null });

    const result = await SupabaseService.deleteCatalog('cat-uuid-1');
    expect(result.success).toBe(true);
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('delete_catalog_v2', {
      p_catalog_id: 'cat-uuid-1'
    });
  });

  it('bloqueia e impede chamadas de rede externas de produção durante testes', async () => {
    await expect(async () => {
      await fetch('https://example.test/any-network-call');
    }).rejects.toThrow(/Network call prohibited in unit test suite/);
  });
});
