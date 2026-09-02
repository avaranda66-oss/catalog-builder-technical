import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useTemplateStore } from '../../src/stores/useTemplateStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { handleCatalogRealtimeEvent } from '../../src/services/realtime.service';
import { Catalog, CatalogPreset } from '../../src/domain/catalog.schema';

describe('FASE 1.3 — Shared Workspace, Cloud Authority & Canonical Navigation Suite', () => {
  const catalogUUID = 'a1111111-1111-4111-8111-111111111111';
  const otherUUID = 'b2222222-2222-4222-8222-222222222222';
  const templateUUID = 't1111111-1111-4111-8111-111111111111';

  const baseCatalog: Catalog = {
    id: catalogUUID,
    title: 'PRESYS TA-25N Datasheet',
    subtitle: 'Calibrador de Temperatura',
    themeId: 'default-technical',
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Ficha Principal',
        blocks: [
          {
            id: 'block-1',
            type: 'text',
            title: 'Bloco Inicial'
          }
        ]
      }
    ],
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    version: 1
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    useCatalogStore.setState({
      currentCatalog: structuredClone(baseCatalog),
      savedCatalogs: [structuredClone(baseCatalog)],
      activePageIndex: 0,
      selectedBlockId: null,
      isSaving: false,
      isDirty: false,
      syncStatus: 'synced',
      syncError: null,
      serverSavedAt: null,
      cachedAt: null,
      inFlightSave: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
    });

    useTemplateStore.setState({
      customTemplates: [],
      systemTemplates: [],
      isLoading: false,
      syncStatus: 'synced',
      syncError: null
    });
  });

  // =========================================================================
  // T1: create template => persisted to Supabase
  // =========================================================================
  it('T1: createCustomTemplate salva no Supabase (public.templates) e atualiza o store', async () => {
    const mockCreatedTemplate: CatalogPreset = {
      id: templateUUID,
      name: 'Template Calibrador 3P',
      description: 'Esqueleto para calibração térmica',
      category: 'layout_template',
      isSystem: false,
      catalog: structuredClone(baseCatalog),
      createdAt: new Date().toISOString()
    };

    const createSpy = vi.spyOn(SupabaseService, 'createTemplate').mockResolvedValue({
      success: true,
      data: mockCreatedTemplate
    });

    const res = await useTemplateStore.getState().createCustomTemplate(
      'Template Calibrador 3P',
      'Esqueleto para calibração térmica',
      baseCatalog
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.data?.id).toBe(templateUUID);

    const state = useTemplateStore.getState();
    expect(state.customTemplates.length).toBe(1);
    expect(state.customTemplates[0].name).toBe('Template Calibrador 3P');
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // T2: Browser B recebe Realtime INSERT de template
  // =========================================================================
  it('T2: Evento Realtime INSERT em public.templates adiciona template no Browser B', () => {
    const remoteTemplateRow = {
      id: templateUUID,
      name: 'SYNC-TEMPLATE-A',
      template_key: `custom-${templateUUID}`,
      design_tokens: { category: 'layout_template', description: 'Criado no Browser A', isSystem: false },
      layout_config: baseCatalog,
      is_system: false,
      created_at: new Date().toISOString()
    };

    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'INSERT',
      new: remoteTemplateRow
    });

    const state = useTemplateStore.getState();
    expect(state.customTemplates.length).toBe(1);
    expect(state.customTemplates[0].id).toBe(templateUUID);
    expect(state.customTemplates[0].name).toBe('SYNC-TEMPLATE-A');
  });

  // =========================================================================
  // T3: delete template no Browser B => Browser A recebe DELETE
  // =========================================================================
  it('T3: Evento Realtime DELETE em public.templates remove template no Browser A', () => {
    useTemplateStore.setState({
      customTemplates: [
        {
          id: templateUUID,
          name: 'SYNC-TEMPLATE-A',
          description: '',
          category: 'layout_template',
          isSystem: false,
          catalog: baseCatalog,
          createdAt: new Date().toISOString()
        }
      ]
    });

    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'DELETE',
      old: { id: templateUUID }
    });

    const state = useTemplateStore.getState();
    expect(state.customTemplates.length).toBe(0);
  });

  // =========================================================================
  // T4: reload Browser C => template continua existindo (Cloud Authority)
  // =========================================================================
  it('T4: loadTemplates busca templates diretamente do Supabase', async () => {
    const cloudTemplates: CatalogPreset[] = [
      {
        id: templateUUID,
        name: 'Template Persistido Cloud',
        description: 'Vindo do PostgreSQL',
        category: 'layout_template',
        isSystem: false,
        catalog: baseCatalog,
        createdAt: new Date().toISOString()
      }
    ];

    vi.spyOn(SupabaseService, 'listTemplates').mockResolvedValue({
      success: true,
      data: cloudTemplates
    });

    await useTemplateStore.getState().loadTemplates();

    const state = useTemplateStore.getState();
    expect(state.customTemplates.length).toBe(1);
    expect(state.customTemplates[0].name).toBe('Template Persistido Cloud');
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // T5: Legado cb_custom_presets é migrado apenas uma vez
  // =========================================================================
  it('T5: Migração de localStorage cb_custom_presets executa uma única vez', async () => {
    localStorage.setItem(
      'cb_custom_presets',
      JSON.stringify([
        {
          id: 'preset-custom-12345',
          name: 'Template Legado Local',
          description: 'Estava no localStorage',
          catalog: baseCatalog
        }
      ])
    );

    const createSpy = vi.spyOn(SupabaseService, 'createTemplate').mockResolvedValue({
      success: true,
      data: {
        id: 'uuid-migrated-1',
        name: 'Template Legado Local',
        description: 'Estava no localStorage',
        category: 'layout_template',
        isSystem: false,
        catalog: baseCatalog,
        createdAt: new Date().toISOString()
      }
    });

    await useTemplateStore.getState().migrateLegacyLocalStoragePresets();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('cb_custom_presets_migrated_v1')).toBe('true');

    // Executando novamente não deve reenviar
    await useTemplateStore.getState().migrateLegacyLocalStoragePresets();
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // T7: Canonical URL ?catalog=UUID abre exatamente o documento solicitado
  // =========================================================================
  it('T7: Canonical URL ?catalog=UUID abre o catálogo correto e UUID inexistente não abre outro silenciosamente', async () => {
    const targetCatalog: Catalog = {
      ...baseCatalog,
      id: otherUUID,
      title: 'Catálogo Secundário Solicitado'
    };

    vi.spyOn(SupabaseService, 'listWorkspace').mockResolvedValue({
      success: true,
      data: {
        catalogs: [
          {
            id: catalogUUID,
            name: baseCatalog.title,
            status: 'draft',
            version: 1,
            brand: baseCatalog,
            created_at: baseCatalog.createdAt,
            updated_at: baseCatalog.updatedAt
          },
          {
            id: otherUUID,
            name: targetCatalog.title,
            status: 'draft',
            version: 1,
            brand: targetCatalog,
            created_at: targetCatalog.createdAt,
            updated_at: targetCatalog.updatedAt
          }
        ],
        products: [],
        templates: [],
        userRole: 'admin'
      }
    });

    // Simula URL com ?catalog=otherUUID
    delete (window as any).location;
    window.location = new URL(`http://localhost:5173/?catalog=${otherUUID}`) as any;

    await useCatalogStore.getState().loadLatestCatalog();

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.id).toBe(otherUUID);
    expect(state.currentCatalog?.title).toBe('Catálogo Secundário Solicitado');
    expect(state.syncStatus).toBe('synced');

    // Teste com UUID inexistente na URL
    const nonExistentUUID = '99999999-9999-4999-8999-999999999999';
    window.location = new URL(`http://localhost:5173/?catalog=${nonExistentUUID}`) as any;

    await useCatalogStore.getState().loadLatestCatalog();

    const stateAfterBadUUID = useCatalogStore.getState();
    // NÃO deve abrir silenciosamente outro catálogo
    expect(stateAfterBadUUID.currentCatalog).toBeNull();
    expect(stateAfterBadUUID.syncStatus).toBe('error');
    expect(stateAfterBadUUID.syncError).toContain('não foi encontrado no servidor');
  });

  // =========================================================================
  // T8: Browser B idle não fica dirty e recebe remote UPDATE (Folha 4 adicionada em A)
  // =========================================================================
  it('T8: Browser B em estado idle (clean) recebe UPDATE remoto com nova página (Folha 4)', async () => {
    const stateBefore = useCatalogStore.getState();
    expect(stateBefore.isDirty).toBe(false);
    expect(stateBefore.isSaving).toBe(false);
    expect(stateBefore.localRevision).toBe(0);
    expect(stateBefore.syncStatus).toBe('synced');

    const updatedWithPage4: Catalog = {
      ...baseCatalog,
      version: 2,
      pages: [
        ...baseCatalog.pages,
        {
          id: 'page-4',
          pageNumber: 2,
          pageType: 'technical',
          title: 'Folha 4 - Especificações Adicionais',
          blocks: []
        }
      ],
      lastMutation: {
        kind: 'ADD_PAGE',
        targetId: 'page-4',
        clientInstanceId: 'client-A',
        summary: 'Adicionada Folha 4',
        timestamp: new Date().toISOString()
      }
    };

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: catalogUUID,
        version: 2,
        name: updatedWithPage4.title,
        brand: updatedWithPage4,
        updated_at: new Date().toISOString()
      }
    });

    const stateAfter = useCatalogStore.getState();
    expect(stateAfter.currentCatalog?.pages.length).toBe(2);
    expect(stateAfter.currentCatalog?.pages[1].id).toBe('page-4');
    expect(stateAfter.currentCatalog?.version).toBe(2);
    expect(stateAfter.isDirty).toBe(false);
    expect(stateAfter.syncStatus).toBe('synced');
  });

  // =========================================================================
  // T9: Browser B edita título e Browser A recebe atualização remota
  // =========================================================================
  it('T9: Browser A recebe atualização remota de edição de título feita no Browser B', async () => {
    const updatedTitleCatalog: Catalog = {
      ...baseCatalog,
      title: 'PRESYS TA-25N — Calibrador de Alta Exatidão (Editado em B)',
      version: 3,
      lastMutation: {
        kind: 'UPDATE_BLOCK',
        targetId: 'block-1',
        clientInstanceId: 'client-B',
        summary: 'Atualização de título',
        timestamp: new Date().toISOString()
      }
    };

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: catalogUUID,
        version: 3,
        name: updatedTitleCatalog.title,
        brand: updatedTitleCatalog,
        updated_at: new Date().toISOString()
      }
    });

    const state = useCatalogStore.getState();
    expect(state.currentCatalog?.title).toBe('PRESYS TA-25N — Calibrador de Alta Exatidão (Editado em B)');
    expect(state.currentCatalog?.version).toBe(3);
    expect(state.isDirty).toBe(false);
    expect(state.syncStatus).toBe('synced');
  });

  // =========================================================================
  // T10: Remote UPDATE em browser com alterações não salvas (dirty) gera CONFLICT
  // =========================================================================
  it('T10: Remote UPDATE em browser com edições locais não salvas gera CONFLICT e preserva estado local', async () => {
    // Simula edição local no Browser A
    useCatalogStore.setState({
      isDirty: true,
      localRevision: 1,
      currentCatalog: {
        ...baseCatalog,
        title: 'Edição Local em Andamento'
      }
    });

    await handleCatalogRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: catalogUUID,
        version: 4,
        name: 'Edição Remota Concorrente',
        brand: {
          ...baseCatalog,
          title: 'Edição Remota Concorrente',
          version: 4
        },
        updated_at: new Date().toISOString()
      }
    });

    const state = useCatalogStore.getState();
    // Edição local foi preservada!
    expect(state.currentCatalog?.title).toBe('Edição Local em Andamento');
    expect(state.syncStatus).toBe('conflict');
    expect(state.syncError).toContain('Este catálogo foi atualizado em outro dispositivo');
  });
});
