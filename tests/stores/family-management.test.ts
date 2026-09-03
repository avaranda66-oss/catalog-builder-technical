import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLibraryStore } from '../../src/stores/useLibraryStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { ProductFamily, Product, ProductFamilyField } from '../../src/domain/product.schema';

describe('LIB.F1 — Family Management (Rename + Safe Delete & Concurrency)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    useLibraryStore.getState().resetToInitial();
    useAuthStore.setState({ role: 'admin', userId: 'test-admin-uid' });
  });

  // =========================================================================
  // FAMILY-RENAME TESTS
  // =========================================================================

  it('FAMILY-RENAME-1: Renomear família com produtos vinculados propaga novo nome para produtos e atualiza chaves de colunas', async () => {
    const famId = 'fam-pressao-1';
    const oldName = 'Pressão Industrial';
    const newName = 'Pressão e Vácuo Avançado';

    const mockFamily: ProductFamily = {
      id: famId,
      name: oldName,
      slug: 'pressao-industrial',
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T12:00:00Z'
    };

    const mockSpecs = {
      range: '0 a 100',
      unit: 'bar',
      accuracy: '0.1%',
      output: '4-20mA',
      powerSupply: '24V',
      processConnection: '1/2 NPT',
      protectionDegree: 'IP67',
      customSpecs: {}
    };

    const mockProducts: Product[] = [
      {
        id: 'prod-1',
        family_id: famId,
        family: oldName,
        code: 'P-001',
        model: 'MOD-1',
        description: 'Sensor',
        specs: mockSpecs,
        imageUrl: '',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      },
      {
        id: 'prod-2',
        family_id: null,
        family: oldName, // legado com nome textual
        code: 'P-002',
        model: 'MOD-2',
        description: 'Transmissor',
        specs: mockSpecs,
        imageUrl: '',
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ];

    const mockFields: ProductFamilyField[] = [
      {
        id: 'fld-1',
        family_id: famId,
        field_key: 'custom_range',
        label: 'Faixa',
        field_type: 'text',
        sort_order: 1,
        width: 100,
        visible: true,
        is_system: false,
        unit: null
      }
    ];

    useLibraryStore.setState({
      families: [mockFamily],
      products: mockProducts,
      familyFields: {
        [famId]: mockFields,
        [oldName]: mockFields,
        'pressao-industrial': mockFields
      },
      selectedFamily: oldName
    });

    const confirmedServerFamily: ProductFamily = {
      ...mockFamily,
      name: newName,
      slug: 'pressao-e-vacuo-avancado',
      updated_at: '2026-01-01T12:05:00Z'
    };

    const saveSpy = vi.spyOn(SupabaseService, 'saveProductFamily').mockResolvedValue({
      success: true,
      data: confirmedServerFamily
    });

    const result = await useLibraryStore.getState().renameFamily(famId, newName);

    expect(result.success).toBe(true);
    expect(saveSpy).toHaveBeenCalledWith({
      id: famId,
      name: newName,
      expected_updated_at: '2026-01-01T12:00:00Z'
    });

    const state = useLibraryStore.getState();
    // Família atualizada
    expect(state.families[0].name).toBe(newName);
    expect(state.families[0].updated_at).toBe('2026-01-01T12:05:00Z');

    // Seleção ativa acompanhou o rename
    expect(state.selectedFamily).toBe(newName);

    // Produtos tiveram o nome da família atualizado e preservaram family_id
    expect(state.products[0].family).toBe(newName);
    expect(state.products[0].family_id).toBe(famId);
    expect(state.products[1].family).toBe(newName);
    expect(state.products[1].family_id).toBe(famId);

    // Chaves de colunas migradas: ID preservado, novo nome presente, antigo removido
    expect(state.familyFields[famId]).toEqual(mockFields);
    expect(state.familyFields[newName]).toEqual(mockFields);
    expect(state.familyFields[oldName]).toBeUndefined();
    expect(state.familyFields['pressao-industrial']).toBeUndefined();
  });

  it('FAMILY-RENAME-2: Rejeição imediata de duplicata de nome existente', async () => {
    const fam1: ProductFamily = { id: 'f-1', name: 'Manômetros', slug: 'manometros', sort_order: 1, created_at: '', updated_at: '' };
    const fam2: ProductFamily = { id: 'f-2', name: 'Termômetros', slug: 'termometros', sort_order: 2, created_at: '', updated_at: '' };

    useLibraryStore.setState({ families: [fam1, fam2] });

    const saveSpy = vi.spyOn(SupabaseService, 'saveProductFamily');

    const res = await useLibraryStore.getState().renameFamily('f-2', 'manômetros'); // case-insensitive duplicate

    expect(res.success).toBe(false);
    expect(res.error).toBe('Já existe uma família com este nome.');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().families[1].name).toBe('Termômetros');
  });

  it('FAMILY-RENAME-3: Rejeição imediata de nome vazio ou composto apenas por espaços', async () => {
    const fam1: ProductFamily = { id: 'f-1', name: 'Manômetros', slug: 'manometros', sort_order: 1, created_at: '', updated_at: '' };
    useLibraryStore.setState({ families: [fam1] });

    const saveSpy = vi.spyOn(SupabaseService, 'saveProductFamily');

    const res = await useLibraryStore.getState().renameFamily('f-1', '   ');

    expect(res.success).toBe(false);
    expect(res.error).toBe('O nome da família não pode ser vazio.');
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('FAMILY-RENAME-4: Conflito de Concorrência CAS no Rename preserva estado original', async () => {
    const fam1: ProductFamily = {
      id: 'f-1',
      name: 'Nome Original',
      slug: 'nome-original',
      sort_order: 1,
      created_at: '',
      updated_at: '2026-01-01T00:00:00Z'
    };
    useLibraryStore.setState({ families: [fam1], selectedFamily: 'Nome Original' });

    vi.spyOn(SupabaseService, 'saveProductFamily').mockResolvedValue({
      success: false,
      conflict: true,
      errorCode: '40001',
      error: 'Conflito de Concorrência: a família foi modificada em outro dispositivo. Recarregue a página.'
    });

    const res = await useLibraryStore.getState().renameFamily('f-1', 'Novo Nome Conflitante');

    expect(res.success).toBe(false);
    expect(res.error).toContain('Conflito de Concorrência');

    const state = useLibraryStore.getState();
    expect(state.families[0].name).toBe('Nome Original');
    expect(state.selectedFamily).toBe('Nome Original');
    expect(state.syncStatus).toBe('conflict');
  });

  // =========================================================================
  // FAMILY-DELETE TESTS
  // =========================================================================

  it('FAMILY-DELETE-1: Exclusão com sucesso de família vazia com resolução determinística de seleção', async () => {
    const fam1: ProductFamily = { id: 'f-1', name: 'Alpha', slug: 'alpha', sort_order: 1, created_at: '', updated_at: '2026-01-01T10:00:00Z' };
    const fam2: ProductFamily = { id: 'f-2', name: 'Beta', slug: 'beta', sort_order: 2, created_at: '', updated_at: '2026-01-01T10:00:00Z' };
    const fam3: ProductFamily = { id: 'f-3', name: 'Gamma', slug: 'gamma', sort_order: 3, created_at: '', updated_at: '2026-01-01T10:00:00Z' };

    useLibraryStore.setState({
      families: [fam1, fam2, fam3],
      products: [],
      selectedFamily: 'Beta',
      familyFields: {
        'f-2': [],
        'Beta': []
      }
    });

    const delSpy = vi.spyOn(SupabaseService, 'deleteProductFamily').mockResolvedValue({
      success: true
    });

    // Exclui Beta (meio da lista) -> próxima à direita é Gamma
    const res = await useLibraryStore.getState().deleteFamily('f-2');

    expect(res.success).toBe(true);
    expect(delSpy).toHaveBeenCalledWith('f-2', '2026-01-01T10:00:00Z');

    const state = useLibraryStore.getState();
    expect(state.families.map(f => f.name)).toEqual(['Alpha', 'Gamma']);
    expect(state.selectedFamily).toBe('Gamma'); // Próxima à direita!
    expect(state.familyFields['f-2']).toBeUndefined();
    expect(state.familyFields['Beta']).toBeUndefined();
  });

  it('FAMILY-DELETE-2: Bloqueio local e não-chamada do servidor se a família contiver produtos', async () => {
    const fam: ProductFamily = { id: 'f-1', name: 'Bombas', slug: 'bombas', sort_order: 1, created_at: '', updated_at: '' };
    const prod: Product = {
      id: 'p-1',
      family_id: 'f-1',
      family: 'Bombas',
      code: 'B-01',
      model: 'B-100',
      description: 'Bomba Centrifuga',
      specs: {
        range: '0 a 100',
        unit: 'bar',
        accuracy: '0.1%',
        output: '4-20mA',
        powerSupply: '24V',
        processConnection: '1/2 NPT',
        protectionDegree: 'IP67',
        customSpecs: {}
      },
      imageUrl: '',
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };

    useLibraryStore.setState({
      families: [fam],
      products: [prod],
      selectedFamily: 'Bombas'
    });

    const delSpy = vi.spyOn(SupabaseService, 'deleteProductFamily');

    const res = await useLibraryStore.getState().deleteFamily('f-1');

    expect(res.success).toBe(false);
    expect(res.error).toBe('Esta família contém produtos associados e não pode ser excluída.');
    expect(delSpy).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().families.length).toBe(1);
  });

  it('FAMILY-DELETE-3: Conflito de concorrência CAS no Delete preserva a família na lista', async () => {
    const fam: ProductFamily = { id: 'f-1', name: 'Calibradores', slug: 'calibradores', sort_order: 1, created_at: '', updated_at: '2026-01-01T00:00:00Z' };

    useLibraryStore.setState({
      families: [fam],
      products: [],
      selectedFamily: 'Calibradores'
    });

    vi.spyOn(SupabaseService, 'deleteProductFamily').mockResolvedValue({
      success: false,
      conflict: true,
      errorCode: '40001',
      error: 'Conflito de Concorrência: a família foi modificada em outro dispositivo. Recarregue a página.'
    });

    const res = await useLibraryStore.getState().deleteFamily('f-1');

    expect(res.success).toBe(false);
    expect(res.error).toContain('Conflito de Concorrência');

    const state = useLibraryStore.getState();
    expect(state.families.length).toBe(1);
    expect(state.syncStatus).toBe('conflict');
  });

  it('FAMILY-DELETE-4: Exclusão da última família deixa a biblioteca em estado vazio válido (Empty State)', async () => {
    const fam: ProductFamily = { id: 'f-lone', name: 'Única Família', slug: 'unica', sort_order: 1, created_at: '', updated_at: '2026-01-01T00:00:00Z' };

    useLibraryStore.setState({
      families: [fam],
      products: [],
      selectedFamily: 'Única Família'
    });

    vi.spyOn(SupabaseService, 'deleteProductFamily').mockResolvedValue({ success: true });

    const res = await useLibraryStore.getState().deleteFamily('f-lone');

    expect(res.success).toBe(true);
    const state = useLibraryStore.getState();
    expect(state.families).toEqual([]);
    expect(state.selectedFamily).toBe('');
  });

  // =========================================================================
  // PERMISSIONS & ROLES
  // =========================================================================

  it('FAMILY-PERMISSION-1: Usuário editor (não-admin) é bloqueado de renomear e excluir famílias', async () => {
    useAuthStore.setState({ role: 'editor', userId: 'editor-uid' });

    const fam: ProductFamily = { id: 'f-1', name: 'Nível', slug: 'nivel', sort_order: 1, created_at: '', updated_at: '' };
    useLibraryStore.setState({ families: [fam], products: [] });

    const saveSpy = vi.spyOn(SupabaseService, 'saveProductFamily');
    const delSpy = vi.spyOn(SupabaseService, 'deleteProductFamily');

    // Tentativa de rename por editor
    const renameRes = await useLibraryStore.getState().renameFamily('f-1', 'Novo Nível');
    expect(renameRes.success).toBe(false);
    expect(renameRes.error).toContain('Permissão negada');
    expect(saveSpy).not.toHaveBeenCalled();

    // Tentativa de delete por editor
    const deleteRes = await useLibraryStore.getState().deleteFamily('f-1');
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.error).toContain('Permissão negada');
    expect(delSpy).not.toHaveBeenCalled();
  });

  // =========================================================================
  // EMPTY CLOUD WORKSPACE
  // =========================================================================

  it('FAMILY-EMPTY-CLOUD-1: Resposta de sucesso do Cloud com zero famílias mantém families=[] e selectedFamily=""', async () => {
    vi.spyOn(SupabaseService, 'listLibraryWorkspace').mockResolvedValue({
      success: true,
      data: {
        families: [],
        fields: [],
        products: [],
        events: []
      }
    });

    await useLibraryStore.getState().loadWorkspace();

    const state = useLibraryStore.getState();
    expect(state.workspaceLoaded).toBe(true);
    expect(state.workspaceSource).toBe('cloud');
    expect(state.families).toEqual([]);
    expect(state.products).toEqual([]);
    expect(state.selectedFamily).toBe('');
    expect(state.syncStatus).toBe('synced');
  });
});
