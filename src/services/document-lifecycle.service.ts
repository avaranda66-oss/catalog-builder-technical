// src/services/document-lifecycle.service.ts
// Serviço Central de Domínio para Ciclo de Vida Unificado dos Documentos (Catálogo × Template × Duplicação × Variantes Localizadas)

import { Catalog, CatalogPreset } from '@/domain/catalog.schema';
import { EditorDocumentContext, useCatalogStore } from '@/stores/useCatalogStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
import { StorageService } from './storage.service';

export interface DocumentContextInvariantResult {
  isValid: boolean;
  expectedId?: string;
  actualId?: string;
  error?: string;
}

export class DocumentLifecycleService {
  /**
   * Valida o invariante estrito de consistência entre o documento ativo e o contexto do editor.
   * CATALOG: currentCatalog.id === editorContext.catalogId
   * TEMPLATE: currentCatalog.id === editorContext.templateId
   */
  static assertDocumentContextConsistency(
    catalog: Catalog | null,
    context: EditorDocumentContext
  ): DocumentContextInvariantResult {
    if (!catalog) {
      return { isValid: true };
    }

    if (context.kind === 'catalog') {
      const expectedId = context.catalogId;
      if (expectedId && catalog.id !== expectedId) {
        return {
          isValid: false,
          expectedId,
          actualId: catalog.id,
          error: `[INVARIANT_VIOLATION] Inconsistência de Catálogo: currentCatalog.id (${catalog.id}) diverge de editorContext.catalogId (${expectedId}).`
        };
      }
    } else if (context.kind === 'template') {
      const expectedId = context.templateId;
      if (expectedId && catalog.id !== expectedId) {
        return {
          isValid: false,
          expectedId,
          actualId: catalog.id,
          error: `[INVARIANT_VIOLATION] Inconsistência de Template: currentCatalog.id (${catalog.id}) diverge de editorContext.templateId (${expectedId}).`
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Sincroniza a URL do navegador com o contexto do editor ativo sem recarregar a página.
   */
  static syncBrowserUrl(context: EditorDocumentContext): void {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (context.kind === 'catalog' && context.catalogId) {
        url.searchParams.delete('template');
        url.searchParams.set('catalog', context.catalogId);
      } else if (context.kind === 'template' && context.templateId) {
        url.searchParams.delete('catalog');
        url.searchParams.set('template', context.templateId);
      }
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      console.warn('[DocumentLifecycleService] Não foi possível atualizar URL:', err);
    }
  }

  /**
   * Salva o documento ativo delegando exclusivamente para a autoridade correta (Catálogo vs Template).
   */
  static async saveActiveDocument(): Promise<{ success: boolean; error?: string }> {
    const { currentCatalog, editorContext } = useCatalogStore.getState();
    if (!currentCatalog) {
      return { success: false, error: 'Nenhum documento ativo para salvar.' };
    }

    const invariant = this.assertDocumentContextConsistency(currentCatalog, editorContext);
    if (!invariant.isValid) {
      console.error(invariant.error);
      return { success: false, error: invariant.error };
    }

    return await useCatalogStore.getState().saveActiveDocument();
  }

  /**
   * Cria um novo Catálogo independente a partir de um Template ou Preset oficial.
   * Transação completa: Flush de dirty state -> Geração de novo UUID -> Persistência -> Troca atômica de contexto -> Sincronização de URL.
   */
  static async createCatalogFromTemplate(
    templateOrPreset: CatalogPreset | Catalog,
    options?: { title?: string }
  ): Promise<{ success: boolean; catalogId?: string; error?: string }> {
    try {
      // 1. Flush de segurança se houver alterações no documento anterior
      const { isDirty } = useCatalogStore.getState();
      if (isDirty) {
        await useCatalogStore.getState().saveActiveDocument();
      }

      // 2. Extração do layout base
      const sourceCatalog: Catalog = 'catalog' in templateOrPreset && templateOrPreset.catalog
        ? templateOrPreset.catalog
        : (templateOrPreset as Catalog);

      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

      const resolvedTitle = options?.title?.trim()
        || sourceCatalog.title
        || ('name' in templateOrPreset ? templateOrPreset.name : '')
        || 'Novo Catálogo Técnico';

      // 3. Montagem da nova entidade Catálogo independente
      const newCatalog: Catalog = {
        ...structuredClone(sourceCatalog),
        id: newId,
        title: resolvedTitle,
        version: 0,
        locale: sourceCatalog.locale || 'pt-BR',
        sourceLocale: sourceCatalog.sourceLocale || 'pt-BR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 4. Persistência local inicial
      await StorageService.saveCatalog(newCatalog);
      StorageService.setActiveCatalogId(newId);

      // 5. Atualização atômica do estado do editor
      useCatalogStore.setState((state) => ({
        currentCatalog: newCatalog,
        savedCatalogs: [newCatalog, ...state.savedCatalogs.filter((c) => c.id !== newId)],
        editorContext: { kind: 'catalog', catalogId: newId },
        activePageIndex: 0,
        selectedBlockId: null,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        isDirty: true,
        syncStatus: 'dirty',
        syncError: null
      }));

      // 6. Atualização imediata da URL
      this.syncBrowserUrl({ kind: 'catalog', catalogId: newId });

      // 7. Persistência imediata na nuvem via CAS
      const saveRes = await useCatalogStore.getState().saveCurrentCatalog();
      if (!saveRes.success) {
        console.warn('[DocumentLifecycleService] Criação local bem-sucedida, mas pendente de sincronização cloud:', saveRes.error);
      }

      return { success: true, catalogId: newId };
    } catch (err: any) {
      console.error('[DocumentLifecycleService] Falha ao criar catálogo a partir de template:', err);
      return { success: false, error: err?.message || 'Erro ao criar catálogo a partir do template.' };
    }
  }

  /**
   * Salva o Catálogo atual como um novo Template Reutilizável na nuvem (`public.templates`).
   */
  static async saveCatalogAsTemplate(
    catalog: Catalog,
    options: { name: string; description?: string }
  ): Promise<{ success: boolean; templateId?: string; error?: string }> {
    try {
      if (!options.name.trim()) {
        return { success: false, error: 'O nome do template é obrigatório.' };
      }

      const res = await useTemplateStore.getState().createCustomTemplate(
        options.name.trim(),
        options.description?.trim() || 'Template criado a partir do catálogo.',
        catalog
      );

      if (!res.success || !res.data) {
        return { success: false, error: res.error || 'Não foi possível salvar o catálogo como template.' };
      }

      return { success: true, templateId: res.data.id };
    } catch (err: any) {
      console.error('[DocumentLifecycleService] Falha ao salvar catálogo como template:', err);
      return { success: false, error: err?.message || 'Erro ao salvar como template.' };
    }
  }

  /**
   * Duplica o documento ativo no mesmo domínio (Template -> Novo Template; Catálogo -> Novo Catálogo).
   */
  static async duplicateActiveDocument(options?: { newTitle?: string }): Promise<{
    success: boolean;
    newId?: string;
    documentKind?: 'catalog' | 'template';
    error?: string;
  }> {
    const { currentCatalog, editorContext } = useCatalogStore.getState();
    if (!currentCatalog) {
      return { success: false, error: 'Nenhum documento ativo para duplicar.' };
    }

    try {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

      const duplicatedTitle = options?.newTitle?.trim() || `${currentCatalog.title} (Cópia)`;

      if (editorContext.kind === 'template') {
        // Duplicação de Template -> Novo Template
        const res = await useTemplateStore.getState().createCustomTemplate(
          duplicatedTitle,
          `Cópia do template ${currentCatalog.title}`,
          { ...currentCatalog, id: newId, title: duplicatedTitle }
        );

        if (!res.success || !res.data) {
          return { success: false, error: res.error || 'Erro ao duplicar template na nuvem.' };
        }

        const newTemplateCatalog: Catalog = {
          ...structuredClone(currentCatalog),
          id: res.data.id,
          title: duplicatedTitle,
          version: 1,
          updatedAt: new Date().toISOString()
        };

        useCatalogStore.setState({
          currentCatalog: newTemplateCatalog,
          editorContext: { kind: 'template', templateId: res.data.id },
          isDirty: false,
          syncStatus: 'synced',
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0
        });

        this.syncBrowserUrl({ kind: 'template', templateId: res.data.id });
        return { success: true, newId: res.data.id, documentKind: 'template' };
      } else {
        // Duplicação de Catálogo -> Novo Catálogo
        const duplicatedCatalog: Catalog = {
          ...structuredClone(currentCatalog),
          id: newId,
          title: duplicatedTitle,
          version: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await StorageService.saveCatalog(duplicatedCatalog);
        StorageService.setActiveCatalogId(newId);

        useCatalogStore.setState((state) => ({
          currentCatalog: duplicatedCatalog,
          savedCatalogs: [duplicatedCatalog, ...state.savedCatalogs.filter((c) => c.id !== newId)],
          editorContext: { kind: 'catalog', catalogId: newId },
          isDirty: true,
          syncStatus: 'dirty',
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0
        }));

        this.syncBrowserUrl({ kind: 'catalog', catalogId: newId });

        const saveRes = await useCatalogStore.getState().saveCurrentCatalog();
        return {
          success: true,
          newId,
          documentKind: 'catalog',
          error: saveRes.success ? undefined : saveRes.error
        };
      }
    } catch (err: any) {
      console.error('[DocumentLifecycleService] Falha ao duplicar documento:', err);
      return { success: false, error: err?.message || 'Erro inesperado ao duplicar documento.' };
    }
  }

  /**
   * Cria uma variante localizada independente a partir do documento ativo.
   * Se fonte for Template -> Salva novo Template traduzido na nuvem via RPC create_translated_template_v1.
   * Se fonte for Catálogo -> Salva novo Catálogo traduzido na nuvem via RPC create_translated_catalog_v1.
   */
  static async createLocalizedVariant(params: {
    translatedDocument: Catalog;
    sourceContext: EditorDocumentContext;
    targetLocale?: string;
  }): Promise<{ success: boolean; newId?: string; documentKind?: 'catalog' | 'template'; error?: string }> {
    const { translatedDocument, sourceContext } = params;

    if (sourceContext.kind === 'template') {
      return await useCatalogStore.getState().createTranslatedTemplateVersion(translatedDocument);
    } else {
      return await useCatalogStore.getState().createTranslatedCatalogVersion(translatedDocument);
    }
  }
}
