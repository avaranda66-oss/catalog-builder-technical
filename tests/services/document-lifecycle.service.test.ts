// tests/services/document-lifecycle.service.test.ts
// Suíte de Testes Automatizados para o DocumentLifecycleService (Fase 2C.3)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DocumentLifecycleService } from '@/services/document-lifecycle.service';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
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

describe('DocumentLifecycleService', () => {
  beforeEach(() => {
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

    vi.spyOn(useTemplateStore.getState(), 'createCustomTemplate').mockImplementation(async (name, description, catalog) => {
      const preset: CatalogPreset = {
        id: 't-new-' + Date.now(),
        name,
        description,
        category: 'layout_template',
        isSystem: false,
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
      expect(result.error).toContain('[INVARIANT_VIOLATION]');
    });

    it('DOC-LIFE-7: assertDocumentContextConsistency valida corretamente contexto de Template', () => {
      const templateCatalog = { ...mockCatalog, id: 'template-uuid-123' };
      const valid = DocumentLifecycleService.assertDocumentContextConsistency(
        templateCatalog,
        { kind: 'template', templateId: 'template-uuid-123' }
      );
      expect(valid.isValid).toBe(true);

      const invalid = DocumentLifecycleService.assertDocumentContextConsistency(
        templateCatalog,
        { kind: 'template', templateId: 'different-uuid' }
      );
      expect(invalid.isValid).toBe(false);
    });
  });

  describe('DOC-LIFE-1 & 2: Criação de Catálogo a partir de Template', () => {
    it('deve gerar novo UUID, definir editorContext como catalog e isolar o novo documento', async () => {
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
    });
  });

  describe('DOC-LIFE-4 & 5: Duplicação de Documentos', () => {
    it('DOC-LIFE-4: duplicação de Catálogo gera novo Catálogo independente', async () => {
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
  });

  describe('DOC-LIFE-6: Salvar Catálogo como Template', () => {
    it('cria novo Template na nuvem sem alterar o Catálogo ativo', async () => {
      const res = await DocumentLifecycleService.saveCatalogAsTemplate(mockCatalog, {
        name: 'Template TA-35N Oficial Master',
        description: 'Modelo extraído do catálogo do cliente'
      });

      expect(res.success).toBe(true);
      expect(res.templateId).toBeDefined();

      // O catálogo original continua aberto como catálogo
      const state = useCatalogStore.getState();
      expect(state.editorContext.kind).toBe('catalog');
      expect(state.currentCatalog?.id).toBe(mockCatalog.id);
    });
  });

  describe('LOC-VAR: Variantes Localizadas / Tradução', () => {
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
