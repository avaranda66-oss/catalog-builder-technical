import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useTemplateStore } from '../../src/stores/useTemplateStore';
import { SupabaseService } from '../../src/services/supabase.service';
import { Catalog, CatalogPreset } from '../../src/domain/catalog.schema';

describe('FASE 1.5 — Document Context & Unified Save Experience Suite', () => {
  const templateT1_Id = 'tpl-1111-4111-8111-111111111111';
  const catalogC1_Id = 'cat-2222-4222-8222-222222222222';

  const mockTemplateT1: CatalogPreset = {
    id: templateT1_Id,
    name: 'teste56',
    description: 'Template corporativo de teste',
    category: 'layout_template',
    isSystem: false,
    version: 3,
    catalog: {
      id: templateT1_Id,
      title: 'teste56',
      subtitle: 'Subtítulo do template',
      themeId: 'default-technical',
      pages: [
        {
          id: 'page-1',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Folha 1',
          blocks: [
            {
              id: 'block-1',
              type: 'text',
              title: 'Título Original do Bloco',
              textContent: 'Conteúdo Original',
              position: { x: 0, y: 0, width: 714, height: 100, zIndex: 1 }
            }
          ]
        }
      ],
      version: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockCatalogC1: Catalog = {
    id: catalogC1_Id,
    title: 'PCON Series Oficial',
    subtitle: 'Calibrador de Pressão',
    themeId: 'default-technical',
    pages: [
      {
        id: 'page-c1',
        pageNumber: 1,
        pageType: 'technical',
        title: 'Folha 1',
        blocks: []
      }
    ],
    version: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();

    useTemplateStore.setState({
      customTemplates: [structuredClone(mockTemplateT1)],
      isLoading: false,
      syncStatus: 'synced',
      syncError: null
    });

    useCatalogStore.setState({
      currentCatalog: structuredClone(mockCatalogC1),
      editorContext: { kind: 'catalog', catalogId: catalogC1_Id },
      savedCatalogs: [structuredClone(mockCatalogC1)],
      activePageIndex: 0,
      selectedBlockId: null,
      isDirty: false,
      isSaving: false,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0,
      syncStatus: 'synced',
      syncError: null
    });
  });

  // =========================================================================
  // DOC-1 & DOC-2: Editar template existente não cria Catalog e mantém mesmo ID
  // =========================================================================
  it('DOC-1, DOC-2: Editar template existente abre T1 sem criar Catalog e preserva UUID', async () => {
    const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog');
    const updateTemplateSpy = vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 4 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);

    const state = useCatalogStore.getState();
    expect(state.editorContext.kind).toBe('template');
    if (state.editorContext.kind === 'template') {
      expect(state.editorContext.templateId).toBe(templateT1_Id);
    }
    expect(state.currentCatalog?.id).toBe(templateT1_Id);
    expect(state.currentCatalog?.title).toBe('teste56');

    // Executa mutação e save
    useCatalogStore.getState().setPageTitle('page-1', 'Folha 1 Atualizada');
    await useCatalogStore.getState().saveActiveDocument();

    expect(saveCatalogSpy).not.toHaveBeenCalled();
    expect(updateTemplateSpy).toHaveBeenCalledWith(
      templateT1_Id,
      expect.anything(),
      3,
      expect.anything(),
      undefined
    );
  });

  // =========================================================================
  // DOC-3 & DOC-4: Autosave de template persiste e mantém layout
  // =========================================================================
  it('DOC-3, DOC-4: Autosave em template atualiza layout na nuvem in-place', async () => {
    vi.useFakeTimers();
    const updateTemplateSpy = vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 4 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);

    // Adiciona bloco
    useCatalogStore.getState().addBlock('page-1', {
      type: 'table',
      title: 'Tabela de Exatidão',
      position: { x: 0, y: 100, width: 714, height: 150, zIndex: 1 }
    });

    expect(useTemplateStore.getState().syncStatus).toBe('saving');

    // Avança o debounce (600ms)
    vi.advanceTimersByTime(700);

    expect(updateTemplateSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // =========================================================================
  // DOC-5 & DOC-6: Ctrl+S roteia corretamente conforme o contexto do documento
  // =========================================================================
  it('DOC-5: Ctrl+S em modo template chama flushTemplate e ZERO saveCatalog', async () => {
    const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog');
    const updateTemplateSpy = vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 4 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);
    useCatalogStore.getState().setPageTitle('page-1', 'Nova Capa');

    const saveRes = await useCatalogStore.getState().saveActiveDocument();

    expect(saveRes.success).toBe(true);
    expect(saveCatalogSpy).not.toHaveBeenCalled();
    expect(updateTemplateSpy).toHaveBeenCalled();
  });

  it('DOC-6: Ctrl+S em modo catalog chama flushCatalog e ZERO saveTemplate', async () => {
    const updateTemplateSpy = vi.spyOn(SupabaseService, 'updateTemplate');
    const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { ...mockCatalogC1, version: 11 }
    });

    useCatalogStore.setState({
      editorContext: { kind: 'catalog', catalogId: catalogC1_Id }
    });

    useCatalogStore.getState().setPageTitle('page-c1', 'Capa Catálogo');

    const saveRes = await useCatalogStore.getState().saveActiveDocument();

    expect(saveRes.success).toBe(true);
    expect(updateTemplateSpy).not.toHaveBeenCalled();
    expect(saveCatalogSpy).toHaveBeenCalled();
  });

  // =========================================================================
  // DOC-7 & DOC-8: Criar Template a partir de Catalog gera novo T2
  // =========================================================================
  it('DOC-7, DOC-8: Criar template a partir de catálogo cria novo T2 e edição subsequente mantém contagem', async () => {
    const newT2_Id = 'tpl-2222-4222-8222-222222222222';
    vi.spyOn(SupabaseService, 'createTemplate').mockResolvedValue({
      success: true,
      data: {
        ...mockTemplateT1,
        id: newT2_Id,
        name: 'Novo Template Criado'
      }
    });

    const createRes = await useTemplateStore.getState().createCustomTemplate(
      'Novo Template Criado',
      'Descrição',
      mockCatalogC1
    );

    expect(createRes.success).toBe(true);
    expect(useTemplateStore.getState().customTemplates.length).toBe(2);

    // Edita T2
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: {
        ...mockTemplateT1,
        id: newT2_Id,
        name: 'Novo Template Criado',
        version: 2
      }
    });

    await useTemplateStore.getState().updateCustomTemplate(newT2_Id, mockCatalogC1, 1);
    await useTemplateStore.getState().flushTemplate(newT2_Id);

    // A contagem permanece 2 (não adiciona duplicata)
    expect(useTemplateStore.getState().customTemplates.length).toBe(2);
  });

  // =========================================================================
  // DOC-9, DOC-10, DOC-11: Criar Catalog de Template é clone independente
  // =========================================================================
  it('DOC-9, DOC-10, DOC-11: Criar Catálogo a partir de T1 gera C1 independente e alterações mútuas não colidem', async () => {
    const saveCatalogSpy = vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { ...mockCatalogC1, id: 'cat-new-clone', version: 1 }
    });

    // Simula "Criar Catálogo a partir de T1"
    const newCatalogId = 'cat-new-clone';
    const clonedCatalog: Catalog = {
      ...structuredClone(mockTemplateT1.catalog),
      id: newCatalogId,
      title: 'Catálogo Derivado de teste56',
      version: 1
    };

    useCatalogStore.getState().setCurrentCatalog(clonedCatalog, true);
    useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId: newCatalogId });

    await useCatalogStore.getState().saveCurrentCatalog();

    expect(saveCatalogSpy).toHaveBeenCalled();
    expect(useCatalogStore.getState().editorContext.kind).toBe('catalog');
    expect(useCatalogStore.getState().currentCatalog?.id).toBe(newCatalogId);

    // Confirma que T1 na template store permaneceu inalterado
    const originalT1 = useTemplateStore.getState().customTemplates.find((t) => t.id === templateT1_Id);
    expect(originalT1?.catalog.title).toBe('teste56');
  });

  // =========================================================================
  // DOC-15: Conflito de concorrência em template preserva dados locais
  // =========================================================================
  it('DOC-15: Conflito de versão no template sinaliza status conflict e preserva modificações em tela', async () => {
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: false,
      conflict: true,
      serverVersion: 5,
      error: 'Conflito de concorrência detectado.'
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);
    useCatalogStore.getState().setPageTitle('page-1', 'Título Local Modificado');

    const saveRes = await useCatalogStore.getState().saveActiveDocument();

    expect(saveRes.success).toBe(false);
    expect(saveRes.status).toBe('conflict');
    expect(useTemplateStore.getState().syncStatus).toBe('conflict');
    expect(useCatalogStore.getState().currentCatalog?.pages[0].title).toBe('Título Local Modificado');
  });
});
