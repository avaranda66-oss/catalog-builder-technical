// tests/services/document-lifecycle.service.test.ts
// Suíte de Testes Automatizados para o DocumentLifecycleService (Fase 2C.3 - Atomicidade Cloud-First, Dirty Gate & Context Drift)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentLifecycleService, getDocumentCapabilities } from '@/services/document-lifecycle.service';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
import { SupabaseService } from '@/services/supabase.service';
import { Catalog, CatalogPreset } from '@/domain/catalog.schema';

const mockCatalog: Catalog = {
  id: 'a0000000-0000-0000-0000-000000000001',
  title: 'Calibrador TA-35N Master',
  subtitle: 'Calibrador de Temperatura de Alta Exatidão',
  themeId: 'default-technical',
  locale: 'pt-BR',
  sourceLocale: 'pt-BR',
  pages: [
    {
      id: 'p1',
      pageNumber: 1,
      pageType: 'cover',
      blocks: [
        {
          id: 'b1',
          type: 'hero_banner',
          title: 'TA-35N',
          textContent: 'O melhor calibrador industrial',
          customData: {
            bulletList: ['Alta estabilidade', 'Display touch']
          }
        }
      ]
    }
  ],
  version: 1,
  createdAt: '2026-09-02T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z'
};

const mockPreset: CatalogPreset = {
  id: 't0000000-0000-0000-0000-000000000001',
  name: 'Template TA-35N',
  description: 'Template corporativo padrão para a linha de temperatura',
  category: 'layout_template',
  isSystem: false,
  version: 1,
  catalog: {
    ...mockCatalog,
    id: 't0000000-0000-0000-0000-000000000001',
    title: 'Template TA-35N'
  },
  createdAt: '2026-09-02T10:00:00Z',
  updatedAt: '2026-09-02T10:00:00Z'
};

describe('DocumentLifecycleService (Fase 2C.3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    useCatalogStore.setState({
      currentCatalog: structuredClone(mockCatalog),
      editorContext: { kind: 'catalog', catalogId: mockCatalog.id },
      savedCatalogs: [structuredClone(mockCatalog)],
      isDirty: false,
      syncStatus: 'synced',
      syncError: null
    });

    useTemplateStore.setState({
      customTemplates: [structuredClone(mockPreset)],
      systemTemplates: []
    });

    vi.spyOn(SupabaseService, 'saveCatalog').mockImplementation(async (catalog) => {
      return {
        success: true,
        data: {
          id: catalog.id,
          title: catalog.title,
          version: (catalog.version || 0) + 1,
          updated_at: new Date().toISOString()
        } as any
      };
    });

    vi.spyOn(useTemplateStore.getState(), 'createCustomTemplate').mockImplementation(async (name, description, catalog) => {
      const preset: CatalogPreset = {
        id: 't-new-' + Date.now(),
        name,
        description,
        category: 'layout_template',
        isSystem: false,
        version: 1,
        catalog: structuredClone(catalog),
        createdAt: new Date().toISOString()
      };
      return { success: true, data: preset };
    });
  });

  describe('DOC-LIFE Invariants & Context', () => {
    it('DOC-LIFE-7: assertDocumentContextConsistency aprova quando catalogId coincide', () => {
      const result = DocumentLifecycleService.assertDocumentContextConsistency(
        mockCatalog,
        { kind: 'catalog', catalogId: mockCatalog.id }
      );
      expect(result.isValid).toBe(true);
    });

    it('DOC-LIFE-7: assertDocumentContextConsistency rejeita com erro quando há divergência de ID', () => {
      const result = DocumentLifecycleService.assertDocumentContextConsistency(
        mockCatalog,
        { kind: 'catalog', catalogId: 'other-id' }
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('INVARIANT_VIOLATION');
    });
  });

  describe('DOC-LIFE-1 & 2: Criação de Catálogo Cloud-First', () => {
    it('DOC-LIFE-1: criação com sucesso persiste na nuvem antes e atualiza contexto para catalog', async () => {
      const res = await DocumentLifecycleService.createCatalogFromTemplate(mockPreset, {
        title: 'TA-35N Teste52'
      });

      expect(res.success).toBe(true);
      expect(res.catalogId).toBeDefined();
      expect(res.catalogId).not.toBe(mockPreset.id);

      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('catalog');
      if (state.editorContext.kind === 'catalog') {
        expect(state.editorContext.catalogId).toBe(res.catalogId);
      }
      expect(state.currentCatalog?.id).toBe(res.catalogId);
      expect(state.currentCatalog?.title).toBe('TA-35N Teste52');
      expect(state.isDirty).toBe(false);
      expect(state.syncStatus).toBe('synced');
    });

    it('DOC-LIFE-FAIL-1: se persistência cloud falhar, ZERO context switch e documento original é preservado', async () => {
      // Abre o Template T1 no editor
      useCatalogStore.setState({
        currentCatalog: structuredClone(mockPreset.catalog),
        editorContext: { kind: 'template', templateId: mockPreset.id },
        isDirty: false
      });

      // Simula falha no Supabase
      vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
        success: false,
        error: 'Network connection lost / 500 Internal Error'
      });

      const res = await DocumentLifecycleService.createCatalogFromTemplate(mockPreset, {
        title: 'TA-35N Falha'
      });

      // Deve retornar falha explícita, NUNCA success: true
      expect(res.success).toBe(false);
      expect(res.error).toContain('Network connection lost');

      // O editor DEVE permanecer 100% no Template original
      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('template');
      if (state.editorContext.kind === 'template') {
        expect(state.editorContext.templateId).toBe(mockPreset.id);
      }
      expect(state.currentCatalog?.id).toBe(mockPreset.id);
      expect(state.currentCatalog?.title).toBe(mockPreset.catalog.title);
    });

    it('DOC-LIFE-DIRTY-1: se o documento fonte estiver dirty e falhar ao salvar, criação é abortada', async () => {
      useCatalogStore.setState({
        currentCatalog: structuredClone(mockPreset.catalog),
        editorContext: { kind: 'template', templateId: mockPreset.id },
        isDirty: true
      });

      // Simula falha no salvamento do documento dirty original
      vi.spyOn(useCatalogStore.getState(), 'saveActiveDocument').mockResolvedValue({
        success: false,
        status: 'error',
        error: 'Conflito de versão no documento original'
      });

      const res = await DocumentLifecycleService.createCatalogFromTemplate(mockPreset);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Não foi possível salvar as alterações do documento original');

      // Contexto não foi alterado
      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('template');
    });
  });

  describe('DOC-LIFE-4 & 5: Duplicação de Documentos Cloud-First', () => {
    it('DOC-LIFE-4: duplicação de Catálogo gera novo Catálogo independente após confirmação cloud', async () => {
      const res = await DocumentLifecycleService.duplicateActiveDocument({
        newTitle: 'TA-35N Cliente Cópia'
      });

      expect(res.success).toBe(true);
      expect(res.documentKind).toBe('catalog');
      expect(res.newId).toBeDefined();
      expect(res.newId).not.toBe(mockCatalog.id);

      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('catalog');
      if (state.editorContext.kind === 'catalog') {
        expect(state.editorContext.catalogId).toBe(res.newId);
      }
      expect(state.currentCatalog?.title).toBe('TA-35N Cliente Cópia');
    });

    it('DOC-LIFE-FAIL-2: se duplicação de catálogo na nuvem falhar, mantém catálogo original intacto', async () => {
      vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
        success: false,
        error: 'Erro de cota ou permissão'
      });

      const res = await DocumentLifecycleService.duplicateActiveDocument({
        newTitle: 'Cópia Falha'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Erro de cota ou permissão');

      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('catalog');
      if (state.editorContext.kind === 'catalog') {
        expect(state.editorContext.catalogId).toBe(mockCatalog.id);
      }
      expect(state.currentCatalog?.id).toBe(mockCatalog.id);
    });

    it('DOC-LIFE-5: duplicação de Template gera novo Template na nuvem', async () => {
      useCatalogStore.setState({
        currentCatalog: { ...mockCatalog, id: 'template-id-99', title: 'Template Alpha' },
        editorContext: { kind: 'template', templateId: 'template-id-99' }
      });

      const res = await DocumentLifecycleService.duplicateActiveDocument({
        newTitle: 'Template Alpha Duplicado'
      });

      expect(res.success).toBe(true);
      expect(res.documentKind).toBe('template');
      expect(res.newId).toBeDefined();

      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('template');
      if (state.editorContext.kind === 'template') {
        expect(state.editorContext.templateId).toBe(res.newId);
      }
    });

    it('DOC-TEMPLATE-ID-1: identidade canônica de template é alinhada em row id, layout_config.id e editorContext', async () => {
      useCatalogStore.setState({
        currentCatalog: { ...mockCatalog, id: 'template-canon-1', title: 'Template Canon' },
        editorContext: { kind: 'template', templateId: 'template-canon-1' }
      });

      const res = await DocumentLifecycleService.duplicateActiveDocument({
        newTitle: 'Template Canon Duplicado'
      });

      expect(res.success).toBe(true);
      const state = useCatalogStore.getState();
      if (state.editorContext.kind === 'template') {
        expect(state.editorContext.templateId).toBe(res.newId);
        expect(state.currentCatalog?.id).toBe(res.newId);
      }
    });
  });

  describe('DOC-LIFE-6: Salvar Catálogo como Template', () => {
    it('cria novo Template na nuvem sem alterar o Catálogo ativo', async () => {
      const res = await DocumentLifecycleService.saveCatalogAsTemplate(mockCatalog, {
        name: 'Template TA-35N Oficial Master',
        description: 'Modelo extraído do catálogo do cliente'
      });

      expect(res.success).toBe(true);
      expect(res.templateId).toBeDefined();

      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('catalog');
      expect(state.currentCatalog?.id).toBe(mockCatalog.id);
    });
  });

  describe('LOC-VAR & Translation Drift & Permissions', () => {
    it('PERM-PREFLIGHT-1: getDocumentCapabilities concede permissões corretas para admin/editor', () => {
      const adminCaps = getDocumentCapabilities('admin');
      expect(adminCaps.canCreateCatalog).toBe(true);
      expect(adminCaps.canTranslateCatalog).toBe(true);
      expect(adminCaps.canTranslateTemplate).toBe(true);

      const editorCaps = getDocumentCapabilities('editor');
      expect(editorCaps.canCreateCatalog).toBe(true);
      expect(editorCaps.canTranslateCatalog).toBe(true);
      expect(editorCaps.canTranslateTemplate).toBe(true);

      const anonCaps = getDocumentCapabilities(null);
      expect(anonCaps.canCreateCatalog).toBe(false);
      expect(anonCaps.canTranslateCatalog).toBe(false);
      expect(anonCaps.canTranslateTemplate).toBe(false);
    });

    it('LOC-CONTEXT-1: bloqueia criação de versão traduzida se o documento ativo foi alterado durante o processo', async () => {
      const snapshot = {
        sourceDocumentId: 'catalog-orig-1',
        sourceDocumentKind: 'catalog' as const,
        sourceVersion: 1
      };

      // Usuário trocou de documento no editor para outro catálogo enquanto o modal estava aberto
      useCatalogStore.setState({
        currentCatalog: { ...mockCatalog, id: 'catalog-drifted-2' },
        editorContext: { kind: 'catalog', catalogId: 'catalog-drifted-2' }
      });

      const res = await DocumentLifecycleService.createLocalizedVariant({
        translatedDocument: { ...mockCatalog, id: 'catalog-orig-1', title: 'Catalog TH', locale: 'th-TH' },
        sourceContext: { kind: 'catalog', catalogId: 'catalog-orig-1' },
        sourceSnapshot: snapshot,
        targetLocale: 'th-TH'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('SOURCE_CONTEXT_CHANGED');
    });

    it('LOC-VAR-3: Tradução de Template preserva kind como template', async () => {
      useCatalogStore.setState({
        currentCatalog: { ...mockCatalog, id: 'template-orig-1', title: 'Template PT' },
        editorContext: { kind: 'template', templateId: 'template-orig-1' }
      });

      const spy = vi.spyOn(useCatalogStore.getState(), 'createTranslatedTemplateVersion')
        .mockResolvedValue({ success: true, templateId: 'template-thai-2' });

      const res = await DocumentLifecycleService.createLocalizedVariant({
        translatedDocument: { ...mockCatalog, title: 'Template TH', locale: 'th-TH' },
        sourceContext: { kind: 'template', templateId: 'template-orig-1' },
        targetLocale: 'th-TH'
      });

      expect(spy).toHaveBeenCalled();
      expect(res.success).toBe(true);
    });

    it('LOC-VAR-3: Tradução de Catálogo preserva kind como catalog', async () => {
      useCatalogStore.setState({
        currentCatalog: { ...mockCatalog, id: 'catalog-orig-1', title: 'Catalog PT' },
        editorContext: { kind: 'catalog', catalogId: 'catalog-orig-1' }
      });

      const spy = vi.spyOn(useCatalogStore.getState(), 'createTranslatedCatalogVersion')
        .mockResolvedValue({ success: true, catalogId: 'catalog-thai-2' });

      const res = await DocumentLifecycleService.createLocalizedVariant({
        translatedDocument: { ...mockCatalog, title: 'Catalog TH', locale: 'th-TH' },
        sourceContext: { kind: 'catalog', catalogId: 'catalog-orig-1' },
        targetLocale: 'th-TH'
      });

      expect(spy).toHaveBeenCalled();
      expect(res.success).toBe(true);
    });
  });
});
