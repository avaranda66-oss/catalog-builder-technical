import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useTemplateStore, reconcileSystemTemplates } from '../../src/stores/useTemplateStore';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { SYSTEM_PRESETS } from '../../src/data/presets';
import { SupabaseService } from '../../src/services/supabase.service';
import { StorageService } from '../../src/services/storage.service';
import { DocumentLifecycleService } from '../../src/services/document-lifecycle.service';
import { CatalogPreset } from '../../src/domain/catalog.schema';

describe('PRESYS.R3 — System Template Discovery Regression Matrix (R3-T1 to R3-T15)', () => {
  const dummyCatalog = SYSTEM_PRESETS[0].catalog;

  const mockCloudSystemTemplate: CatalogPreset = {
    id: 'cloud-system-tpl-c',
    name: 'Cloud Custom System Template C',
    description: 'Template de sistema hospedado no Supabase',
    category: 'layout_template',
    isSystem: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    catalog: dummyCatalog
  };

  const mockCloudCustomUserTemplate: CatalogPreset = {
    id: 'user-custom-tpl-1',
    name: 'Meu Template Customizado',
    description: 'Criado pelo usuário',
    category: 'layout_template',
    isSystem: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    catalog: dummyCatalog
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    useTemplateStore.setState({
      customTemplates: [],
      systemTemplates: SYSTEM_PRESETS,
      isLoading: false,
      syncStatus: 'synced',
      syncError: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // R3-T1: Proven Red behavior document - with reconcileSystemTemplates, built-ins are never masked
  it('R3-T1: reconcileSystemTemplates ensures local built-ins are not masked when cloud returns templates', () => {
    const reconciled = reconcileSystemTemplates(SYSTEM_PRESETS, [mockCloudSystemTemplate]);
    const hasTA25N = reconciled.some((t) => t.id === 'preset-presys-ta-25n-datasheet');
    expect(hasTA25N).toBe(true);
  });

  // R3-T2: cloud + local are reconciled
  it('R3-T2: cloud and local system templates are reconciled together in runtime state', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: [mockCloudSystemTemplate, mockCloudCustomUserTemplate]
    });

    await useTemplateStore.getState().loadTemplates();

    const systemTemplates = useTemplateStore.getState().systemTemplates;
    expect(systemTemplates.some((t) => t.id === 'cloud-system-tpl-c')).toBe(true);
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-25n-datasheet')).toBe(true);
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-35n-datasheet')).toBe(true);
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-50n-datasheet')).toBe(true);
  });

  // R3-T3: TA-25N visible after cloud load
  it('R3-T3: TA-25N is discoverable after loadTemplates with cloud data', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: [mockCloudSystemTemplate]
    });

    await useTemplateStore.getState().loadTemplates();

    const ta25n = useTemplateStore.getState().systemTemplates.find((t) => t.id === 'preset-presys-ta-25n-datasheet');
    expect(ta25n).toBeDefined();
    expect(ta25n?.name).toBe('PRESYS TA-25N — Datasheet Técnico');
    expect(ta25n?.catalog.pages).toHaveLength(6);
  });

  // R3-T4: TA-35N visible after cloud load
  it('R3-T4: TA-35N is discoverable after loadTemplates with cloud data', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: [mockCloudSystemTemplate]
    });

    await useTemplateStore.getState().loadTemplates();

    const ta35n = useTemplateStore.getState().systemTemplates.find((t) => t.id === 'preset-presys-ta-35n-datasheet');
    expect(ta35n).toBeDefined();
    expect(ta35n?.name).toBe('PRESYS TA-35N — Datasheet Técnico');
    expect(ta35n?.catalog.pages).toHaveLength(6);
  });

  // R3-T5: TA-50N visible after cloud load
  it('R3-T5: TA-50N is discoverable after loadTemplates with cloud data', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: [mockCloudSystemTemplate]
    });

    await useTemplateStore.getState().loadTemplates();

    const ta50n = useTemplateStore.getState().systemTemplates.find((t) => t.id === 'preset-presys-ta-50n-datasheet');
    expect(ta50n).toBeDefined();
    expect(ta50n?.name).toBe('PRESYS TA-50N — Datasheet Técnico');
    expect(ta50n?.catalog.pages).toHaveLength(6);
  });

  // R3-T6: cloud-only system template retained
  it('R3-T6: cloud-only system templates are retained after reconciliation', () => {
    const cloudOnly: CatalogPreset = {
      id: 'cloud-unique-template-x',
      name: 'Template Especial Nuvem',
      description: 'Template especial da nuvem',
      category: 'layout_template',
      isSystem: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      catalog: dummyCatalog
    };

    const reconciled = reconcileSystemTemplates(SYSTEM_PRESETS, [cloudOnly]);
    expect(reconciled.some((t) => t.id === 'cloud-unique-template-x')).toBe(true);
  });

  // R3-T7: duplicate ID deduped
  it('R3-T7: duplicate IDs appear only once in the reconciled list', () => {
    const duplicateCloudTemplate: CatalogPreset = {
      id: 'preset-presys-ta-25n-datasheet',
      name: 'Stale Cloud Copy of TA-25N',
      description: 'Stale cloud copy',
      category: 'official_product_catalog',
      isSystem: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      catalog: dummyCatalog
    };

    const reconciled = reconcileSystemTemplates(SYSTEM_PRESETS, [duplicateCloudTemplate, duplicateCloudTemplate]);
    const matches = reconciled.filter((t) => t.id === 'preset-presys-ta-25n-datasheet');
    expect(matches).toHaveLength(1);
  });

  // R3-T8: defined same-ID precedence proven (local repository built-in wins)
  it('R3-T8: local repository built-in preset wins when a cloud template has the same ID', () => {
    const staleCloudCopy: CatalogPreset = {
      id: 'preset-presys-ta-25n-datasheet',
      name: 'Stale Cloud Copy',
      description: 'Stale description',
      category: 'official_product_catalog',
      isSystem: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      catalog: { ...dummyCatalog, title: 'Stale Title' }
    };

    const reconciled = reconcileSystemTemplates(SYSTEM_PRESETS, [staleCloudCopy]);
    const ta25n = reconciled.find((t) => t.id === 'preset-presys-ta-25n-datasheet')!;
    expect(ta25n.name).toBe('PRESYS TA-25N — Datasheet Técnico');
    expect(ta25n.description).toContain('6 páginas');
  });

  // R3-T9: custom templates unaffected
  it('R3-T9: custom user templates remain separate in customTemplates state', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: [mockCloudSystemTemplate, mockCloudCustomUserTemplate]
    });

    await useTemplateStore.getState().loadTemplates();

    const custom = useTemplateStore.getState().customTemplates;
    expect(custom).toHaveLength(1);
    expect(custom[0].id).toBe('user-custom-tpl-1');
    expect(custom[0].isSystem).toBe(false);
  });

  // R3-T10: offline local presets unaffected
  it('R3-T10: when Supabase fails or is offline, built-in SYSTEM_PRESETS remain intact', async () => {
    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: false,
      error: 'Network failure'
    });

    await useTemplateStore.getState().loadTemplates();

    const systemTemplates = useTemplateStore.getState().systemTemplates;
    expect(systemTemplates.length).toBeGreaterThanOrEqual(SYSTEM_PRESETS.length);
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-25n-datasheet')).toBe(true);
    expect(useTemplateStore.getState().syncStatus).toBe('offline');
  });

  // R3-T11: PresetModal/category displays official_product_catalog
  it('R3-T11: official_product_catalog category contains all 3 PRESYS models', () => {
    const reconciled = reconcileSystemTemplates(SYSTEM_PRESETS, [mockCloudSystemTemplate]);
    const officialCatalogs = reconciled.filter((p) => p.category === 'official_product_catalog');

    expect(officialCatalogs.some((p) => p.id === 'preset-presys-ta-25n-datasheet')).toBe(true);
    expect(officialCatalogs.some((p) => p.id === 'preset-presys-ta-35n-datasheet')).toBe(true);
    expect(officialCatalogs.some((p) => p.id === 'preset-presys-ta-50n-datasheet')).toBe(true);
  });

  // R3-T12: applying TA-25N creates correct model
  it('R3-T12: applying TA-25N preset creates a 6-page catalog with exact specs', async () => {
    const ta25Preset = SYSTEM_PRESETS.find((p) => p.id === 'preset-presys-ta-25n-datasheet')!;
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { version: 1, updated_at: new Date().toISOString() } as any
    });
    vi.spyOn(StorageService, 'saveCatalog').mockResolvedValue();
    vi.spyOn(StorageService, 'setActiveCatalogId').mockReturnValue();

    const res = await DocumentLifecycleService.createCatalogFromTemplate(ta25Preset, { title: 'TA-25N Produção' });
    expect(res.success).toBe(true);

    const activeCatalog = useCatalogStore.getState().currentCatalog;
    expect(activeCatalog).not.toBeNull();
    expect(activeCatalog?.pages).toHaveLength(6);
    expect(activeCatalog?.title).toBe('TA-25N Produção');
    // Verifica poço e faixa do TA-25N
    const heroSpec = activeCatalog?.pages[3].blocks.find((b) => b.id.includes('hero-specs'));
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '-25 °C to +155 °C')).toBe(true);
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '200 W')).toBe(true);
  });

  // R3-T13: applying TA-35N creates correct model
  it('R3-T13: applying TA-35N preset creates a 6-page catalog with exact specs', async () => {
    const ta35Preset = SYSTEM_PRESETS.find((p) => p.id === 'preset-presys-ta-35n-datasheet')!;
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { version: 1, updated_at: new Date().toISOString() } as any
    });
    vi.spyOn(StorageService, 'saveCatalog').mockResolvedValue();
    vi.spyOn(StorageService, 'setActiveCatalogId').mockReturnValue();

    const res = await DocumentLifecycleService.createCatalogFromTemplate(ta35Preset, { title: 'TA-35N Produção' });
    expect(res.success).toBe(true);

    const activeCatalog = useCatalogStore.getState().currentCatalog;
    expect(activeCatalog?.pages).toHaveLength(6);
    const heroSpec = activeCatalog?.pages[3].blocks.find((b) => b.id.includes('hero-specs'));
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '-35 °C to +155 °C')).toBe(true);
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '300 W')).toBe(true);
  });

  // R3-T14: applying TA-50N creates correct model
  it('R3-T14: applying TA-50N preset creates a 6-page catalog with exact specs', async () => {
    const ta50Preset = SYSTEM_PRESETS.find((p) => p.id === 'preset-presys-ta-50n-datasheet')!;
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { version: 1, updated_at: new Date().toISOString() } as any
    });
    vi.spyOn(StorageService, 'saveCatalog').mockResolvedValue();
    vi.spyOn(StorageService, 'setActiveCatalogId').mockReturnValue();

    const res = await DocumentLifecycleService.createCatalogFromTemplate(ta50Preset, { title: 'TA-50N Produção' });
    expect(res.success).toBe(true);

    const activeCatalog = useCatalogStore.getState().currentCatalog;
    expect(activeCatalog?.pages).toHaveLength(6);
    const heroSpec = activeCatalog?.pages[3].blocks.find((b) => b.id.includes('hero-specs'));
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '-50 °C to +155 °C')).toBe(true);
    expect(heroSpec?.tableRows?.some((r) => r.localOverrides?.value === '400 W')).toBe(true);
  });

  // R3-T15: realtime cannot erase local built-in presets
  it('R3-T15: realtime template events cannot erase built-in presets', () => {
    // 1. Simula INSERT de template de sistema
    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'INSERT',
      new: {
        id: 'realtime-system-1',
        name: 'Realtime System Template',
        is_system: true,
        catalog_snapshot: dummyCatalog
      }
    });

    let systemTemplates = useTemplateStore.getState().systemTemplates;
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-25n-datasheet')).toBe(true);
    expect(systemTemplates.some((t) => t.id === 'realtime-system-1')).toBe(true);

    // 2. Simula DELETE de template embutido (deve ser protegido contra remoção remota)
    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'DELETE',
      old: {
        id: 'preset-presys-ta-25n-datasheet'
      }
    });

    systemTemplates = useTemplateStore.getState().systemTemplates;
    expect(systemTemplates.some((t) => t.id === 'preset-presys-ta-25n-datasheet')).toBe(true);
  });
});
