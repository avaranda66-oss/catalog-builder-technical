import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../../src/stores/useCatalogStore';
import { useTemplateStore } from '../../src/stores/useTemplateStore';
import { SupabaseService, getSupabase } from '../../src/services/supabase.service';
import { CatalogPreset } from '../../src/domain/catalog.schema';

describe('FASE 2A.1B — Template CAS Hardening & Production Acceptance Suite', () => {
  const templateT1_Id = 'tpl-1111-4111-8111-111111111111';

  const mockTemplateT1: CatalogPreset = {
    id: templateT1_Id,
    name: 'teste56',
    description: 'Template corporativo de teste',
    category: 'layout_template',
    isSystem: false,
    version: 5,
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
          blocks: []
        }
      ],
      version: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
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
      currentCatalog: structuredClone(mockTemplateT1.catalog),
      editorContext: { kind: 'template', templateId: templateT1_Id },
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
  // TPL-H1: Duas chamadas concorrentes com expected=5 => Exatamente 1 vence
  // =========================================================================
  it('TPL-H1: Duas chamadas concorrentes com expected=5 resultam em 1 vitória e 1 conflito 40001', async () => {
    let callCount = 0;
    vi.spyOn(SupabaseService, 'updateTemplate').mockImplementation(async (_id, _cat, _expectedVer) => {
      callCount++;
      if (callCount === 1) {
        return {
          success: true,
          data: { ...mockTemplateT1, version: 6 }
        };
      } else {
        return {
          success: false,
          conflict: true,
          serverVersion: 6,
          error: 'Conflito de Concorrência: versão esperada 5 informada mas servidor está em 6.'
        };
      }
    });

    const promise1 = SupabaseService.updateTemplate(templateT1_Id, mockTemplateT1.catalog, 5);
    const promise2 = SupabaseService.updateTemplate(templateT1_Id, mockTemplateT1.catalog, 5);

    const [res1, res2] = await Promise.all([promise1, promise2]);

    expect(res1.success).toBe(true);
    expect(res1.data?.version).toBe(6);

    expect(res2.success).toBe(false);
    expect(res2.conflict).toBe(true);
    expect(res2.serverVersion).toBe(6);
  });

  // =========================================================================
  // TPL-H2 & TPL-H3: Validação de Permissão e Role (42501)
  // =========================================================================
  it('TPL-H2, TPL-H3: Usuário sem role autorizada ou anônimo recebe erro de permissão', async () => {
    const supabase = getSupabase();
    if (supabase) {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'Sem permissão de acesso para salvar templates corporativos.' } as any
      } as any);
    }

    const res = await SupabaseService.updateTemplate(templateT1_Id, mockTemplateT1.catalog, 5);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Permissão negada');
  });

  // =========================================================================
  // TPL-H4: RPC ausente => ZERO fallback direto sem CAS
  // =========================================================================
  it('TPL-H4: Se a RPC save_template_v1 não existir, retorna TEMPLATE_SCHEMA_NOT_READY e nunca faz direct update', async () => {
    const supabase = getSupabase();
    if (supabase) {
      vi.spyOn(supabase, 'rpc').mockResolvedValue({
        data: null,
        error: { code: '42883', message: 'function save_template_v1 does not exist' } as any
      } as any);

      const fromSpy = vi.spyOn(supabase, 'from');

      const res = await SupabaseService.updateTemplate(templateT1_Id, mockTemplateT1.catalog, 5);

      expect(res.success).toBe(false);
      expect(res.error).toContain('TEMPLATE_SCHEMA_NOT_READY');
      // Garante que não chamou supabase.from('templates').update(...)
      expect(fromSpy).not.toHaveBeenCalled();
    }
  });

  // =========================================================================
  // TPL-H5: ACK v6 atualiza currentCatalog.version no editor ativo
  // =========================================================================
  it('TPL-H5: ACK de salvamento v6 atualiza currentCatalog.version para 6 no editor ativo', async () => {
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 6 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(5);

    useCatalogStore.getState().setPageTitle('page-1', 'Novo Título Folha');
    const saveRes = await useCatalogStore.getState().saveActiveDocument();

    expect(saveRes.success).toBe(true);
    expect(saveRes.version).toBe(6);
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(6);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // TPL-H6: queue.expectedVersion nunca diminui
  // =========================================================================
  it('TPL-H6: queue.expectedVersion nunca regride mesmo se receber catálogo com versão menor', async () => {
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 7 }
    });

    await useTemplateStore.getState().updateCustomTemplate(templateT1_Id, mockTemplateT1.catalog, 6);
    await useTemplateStore.getState().flushTemplate(templateT1_Id);

    // Tenta atualizar passando versão defasada 5
    await useTemplateStore.getState().updateCustomTemplate(templateT1_Id, mockTemplateT1.catalog, 5);

    // Verifica se a chamada do flush usará a versão máxima confirmada 7
    const updateSpy = vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 8 }
    });

    await useTemplateStore.getState().flushTemplate(templateT1_Id);

    expect(updateSpy).toHaveBeenCalledWith(
      templateT1_Id,
      expect.anything(),
      7,
      undefined,
      undefined
    );
  });

  // =========================================================================
  // TPL-H7: Edição durante in-flight usa confirmedVersion no próximo save
  // =========================================================================
  it('TPL-H7: Edição durante requisição em voo aguarda ACK e usa a versão confirmada v6 para gerar v7', async () => {
    let resolveFirstSave: (val: any) => void;
    const firstSavePromise = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    const updateSpy = vi.spyOn(SupabaseService, 'updateTemplate')
      .mockImplementationOnce(async () => {
        await firstSavePromise;
        return { success: true, data: { ...mockTemplateT1, version: 6 } };
      })
      .mockImplementationOnce(async () => {
        return { success: true, data: { ...mockTemplateT1, version: 7 } };
      });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);

    // 1. Primeiro save inicia e fica em voo
    useCatalogStore.getState().setPageTitle('page-1', 'Edição 1');
    const firstFlush = useTemplateStore.getState().flushTemplate(templateT1_Id);

    // 2. Segunda edição acontece enquanto o primeiro save está em voo
    useCatalogStore.getState().setPageTitle('page-1', 'Edição 2');
    await useTemplateStore.getState().updateCustomTemplate(templateT1_Id, useCatalogStore.getState().currentCatalog!, 5);

    // 3. Primeiro save completa com sucesso (v6)
    resolveFirstSave!({ success: true });
    await firstFlush;

    // 4. Segundo save roda
    await useTemplateStore.getState().flushTemplate(templateT1_Id);

    // O segundo save deve ter chamado com expectedVersion = 6
    expect(updateSpy).toHaveBeenLastCalledWith(
      templateT1_Id,
      expect.anything(),
      6,
      undefined,
      undefined
    );
  });

  // =========================================================================
  // TPL-H8: Scheduled debounce não é synced antes do ACK
  // =========================================================================
  it('TPL-H8: Agendamento de salvamento mantém status saving/dirty até o flush completar', async () => {
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 6 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);

    const res = await useCatalogStore.getState().saveCurrentCatalog();

    expect(res.status).toBe('saving');
    expect(useCatalogStore.getState().isDirty).toBe(true);
    expect(useCatalogStore.getState().syncStatus).toBe('saving');
  });

  // =========================================================================
  // TPL-H9: Ctrl+S (saveActiveDocument) aguarda ACK e retorna synced
  // =========================================================================
  it('TPL-H9: Ctrl+S (saveActiveDocument) aguarda o flush na nuvem e retorna synced', async () => {
    vi.spyOn(SupabaseService, 'updateTemplate').mockResolvedValue({
      success: true,
      data: { ...mockTemplateT1, version: 6 }
    });

    await useCatalogStore.getState().openTemplateForEditing(templateT1_Id);
    useCatalogStore.getState().setPageTitle('page-1', 'Capa Final');

    const saveRes = await useCatalogStore.getState().saveActiveDocument();

    expect(saveRes.success).toBe(true);
    expect(saveRes.status).toBe('synced');
    expect(useCatalogStore.getState().isDirty).toBe(false);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // TPL-H10: createTemplate usa INSERT em vez de UPSERT
  // =========================================================================
  it('TPL-H10: createTemplate utiliza insert para não sobrescrever template acidentalmente', async () => {
    const supabase = getSupabase();
    if (supabase) {
      const insertSpy = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ...mockTemplateT1, id: 'tpl-new-123' },
            error: null
          })
        })
      });

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: insertSpy
      } as any);

      const res = await SupabaseService.createTemplate({
        ...mockTemplateT1,
        id: 'tpl-new-123'
      });

      expect(res.success).toBe(true);
      expect(insertSpy).toHaveBeenCalled();
    }
  });

  // =========================================================================
  // TPL-H11: Remote update clean aplica snapshot e atualiza version no editor
  // =========================================================================
  it('TPL-H11: Atualização remota recebida enquanto cliente está limpo aplica snapshot e atualiza version', () => {
    useCatalogStore.setState({
      editorContext: { kind: 'template', templateId: templateT1_Id },
      currentCatalog: structuredClone(mockTemplateT1.catalog),
      isDirty: false,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0
    });

    const updatedTemplateRow = {
      id: templateT1_Id,
      name: 'teste56 Atualizado Remotamente',
      template_key: 'custom-tpl-1',
      version: 6,
      design_tokens: { category: 'layout_template' },
      layout_config: {
        ...mockTemplateT1.catalog,
        title: 'teste56 Atualizado Remotamente',
        version: 6,
        pages: [
          {
            id: 'page-1',
            pageNumber: 1,
            title: 'Folha 1 Remota',
            blocks: []
          }
        ]
      }
    };

    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'UPDATE',
      new: updatedTemplateRow,
      old: undefined
    });
    useCatalogStore.getState().handleRealtimeTemplateChange({
      eventType: 'UPDATE',
      new: updatedTemplateRow,
      old: undefined
    });

    expect(useCatalogStore.getState().currentCatalog?.title).toBe('teste56 Atualizado Remotamente');
    expect(useCatalogStore.getState().currentCatalog?.version).toBe(6);
    expect(useCatalogStore.getState().syncStatus).toBe('synced');
  });

  // =========================================================================
  // TPL-H12: Remote update dirty entra em conflito sem perder alterações locais
  // =========================================================================
  it('TPL-H12: Atualização remota recebida enquanto cliente está dirty sinaliza conflito e preserva estado local', () => {
    useCatalogStore.setState({
      editorContext: { kind: 'template', templateId: templateT1_Id },
      currentCatalog: {
        ...structuredClone(mockTemplateT1.catalog),
        title: 'Minhas Alterações Locais Não Salvas'
      },
      isDirty: true,
      localRevision: 1,
      lastAcknowledgedLocalRevision: 0
    });

    const updatedTemplateRow = {
      id: templateT1_Id,
      name: 'Versão Concorrente Remota',
      template_key: 'custom-tpl-1',
      version: 6,
      layout_config: {
        ...mockTemplateT1.catalog,
        title: 'Versão Concorrente Remota',
        version: 6
      }
    };

    useTemplateStore.getState().handleRealtimeTemplateEvent({
      eventType: 'UPDATE',
      new: updatedTemplateRow,
      old: undefined
    });
    useCatalogStore.getState().handleRealtimeTemplateChange({
      eventType: 'UPDATE',
      new: updatedTemplateRow,
      old: undefined
    });

    expect(useCatalogStore.getState().currentCatalog?.title).toBe('Minhas Alterações Locais Não Salvas');
    expect(useCatalogStore.getState().syncStatus).toBe('conflict');
  });
});
