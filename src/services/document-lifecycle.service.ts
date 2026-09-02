// src/services/document-lifecycle.service.ts
// Serviço Central de Domínio para Ciclo de Vida Unificado dos Documentos (Catálogo × Template × Duplicação × Variantes Localizadas)

import { Catalog, CatalogPreset } from '@/domain/catalog.schema';
import { EditorDocumentContext, useCatalogStore } from '@/stores/useCatalogStore';
import { useTemplateStore } from '@/stores/useTemplateStore';
import { StorageService } from './storage.service';
import { SupabaseService } from './supabase.service';

export interface DocumentContextInvariantResult {
  isValid: boolean;
  expectedId?: string;
  actualId?: string;
  error?: string;
}

export interface DocumentCapabilities {
  canCreateCatalog: boolean;
  canCreateTemplate: boolean;
  canUpdateCatalog: boolean;
  canUpdateTemplate: boolean;
  canDuplicateCatalog: boolean;
  canDuplicateTemplate: boolean;
  canTranslateCatalog: boolean;
  canTranslateTemplate: boolean;
}

export interface TranslationSourceSnapshot {
  sourceDocumentId: string;
  sourceDocumentKind: 'catalog' | 'template';
  sourceVersion: number;
  sourceContentHash?: string;
}

/**
 * Deriva as permissões/capabilities ativas com base na role do usuário autenticado no Supabase.
 * Exige 'admin' ou 'editor' para ações persistentes na nuvem.
 */
export function getDocumentCapabilities(userRole: string | null | undefined): DocumentCapabilities {
  const isAuthorized = userRole === 'admin' || userRole === 'editor';
  return {
    canCreateCatalog: isAuthorized,
    canCreateTemplate: isAuthorized,
    canUpdateCatalog: isAuthorized,
    canUpdateTemplate: isAuthorized,
    canDuplicateCatalog: isAuthorized,
    canDuplicateTemplate: isAuthorized,
    canTranslateCatalog: isAuthorized,
    canTranslateTemplate: isAuthorized
  };
}

export class DocumentLifecycleService {
  /**
   * Obtém as capacidades de documento autorizadas diretamente pelo servidor PostgreSQL (Server Authoritative Preflight).
   * Elimina divergências entre o role local e o team_role() da RPC.
   */
  static async getServerCapabilities(): Promise<{
    success: boolean;
    role: 'admin' | 'editor' | 'viewer' | null;
    capabilities: DocumentCapabilities;
    error?: string;
  }> {
    const roleRes = await SupabaseService.getServerTeamRole();
    if (!roleRes.success || !roleRes.role) {
      return {
        success: false,
        role: null,
        capabilities: getDocumentCapabilities(null),
        error: roleRes.error || 'Sessão não autorizada no servidor.'
      };
    }

    return {
      success: true,
      role: roleRes.role,
      capabilities: getDocumentCapabilities(roleRes.role)
    };
  }

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
  static async saveActiveDocument(): Promise<{ success: boolean; version?: number; error?: string }> {
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
   * CLOUD-FIRST: Monta entidade em memória -> Persiste na Nuvem -> Aguarda Confirmação -> Troca Contexto.
   * Se a persistência falhar: ZERO context switch. O documento original permanece ativo e intacto.
   */
  static async createCatalogFromTemplate(
    templateOrPreset: CatalogPreset | Catalog,
    options?: { title?: string }
  ): Promise<{ success: boolean; catalogId?: string; error?: string }> {
    try {
      const { currentCatalog, editorContext, isDirty } = useCatalogStore.getState();

      // 1. Invariante de consistência prévia
      const invariant = this.assertDocumentContextConsistency(currentCatalog, editorContext);
      if (!invariant.isValid) {
        return { success: false, error: invariant.error };
      }

      // 2. Flush de segurança: Se o documento fonte possui alterações, exige confirmação prévia
      if (isDirty) {
        const saveSourceRes = await useCatalogStore.getState().saveActiveDocument();
        if (!saveSourceRes.success) {
          return {
            success: false,
            error: `Não foi possível salvar as alterações do documento original antes de derivar o novo catálogo: ${saveSourceRes.error || 'Erro de persistência'}`
          };
        }
      }

      // 3. Extração do layout base
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

      // 4. Montagem da entidade candidata em memória (sem alterar o estado global do editor)
      const candidateCatalog: Catalog = {
        ...structuredClone(sourceCatalog),
        id: newId,
        title: resolvedTitle,
        version: 0,
        locale: sourceCatalog.locale || 'pt-BR',
        sourceLocale: sourceCatalog.sourceLocale || 'pt-BR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 5. PERSISTÊNCIA CLOUD-FIRST: Envia para o Supabase ANTES de trocar o contexto do editor
      const cloudRes = await SupabaseService.saveCatalog(candidateCatalog, 0);
      if (!cloudRes.success || !cloudRes.data) {
        console.error('[DocumentLifecycleService] Falha ao persistir catálogo na nuvem. Contexto do editor mantido inalterado:', cloudRes.error);
        return {
          success: false,
          error: cloudRes.error || 'Falha ao persistir novo catálogo no servidor.'
        };
      }

      // 6. Confirmação autoritativa da nuvem recebida com sucesso
      const confirmedCatalog: Catalog = {
        ...candidateCatalog,
        version: Number(cloudRes.data.version) || 1,
        updatedAt: cloudRes.data.updated_at || new Date().toISOString()
      };

      // 7. Persistência no armazenamento local seguro
      await StorageService.saveCatalog(confirmedCatalog);
      StorageService.setActiveCatalogId(newId);

      // 8. Troca atômica do estado do editor e contexto
      useCatalogStore.setState((state) => ({
        currentCatalog: confirmedCatalog,
        savedCatalogs: [confirmedCatalog, ...state.savedCatalogs.filter((c) => c.id !== newId)],
        editorContext: { kind: 'catalog', catalogId: newId },
        activePageIndex: 0,
        selectedBlockId: null,
        localRevision: 0,
        lastAcknowledgedLocalRevision: 0,
        isDirty: false,
        syncStatus: 'synced',
        syncError: null,
        lastSavedAt: new Date().toISOString()
      }));

      // 9. Atualização imediata da URL canônica
      this.syncBrowserUrl({ kind: 'catalog', catalogId: newId });

      return { success: true, catalogId: newId };
    } catch (err: any) {
      console.error('[DocumentLifecycleService] Falha ao criar catálogo a partir de template:', err);
      return { success: false, error: err?.message || 'Erro inesperado ao criar catálogo a partir do template.' };
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

      const { currentCatalog, editorContext, isDirty } = useCatalogStore.getState();
      const invariant = this.assertDocumentContextConsistency(currentCatalog, editorContext);
      if (!invariant.isValid) {
        return { success: false, error: invariant.error };
      }

      // Se o catálogo ativo está dirty, salva antes de gerar o template
      if (isDirty) {
        const saveRes = await useCatalogStore.getState().saveActiveDocument();
        if (!saveRes.success) {
          return {
            success: false,
            error: `Não foi possível salvar as alterações do catálogo antes de criar o template: ${saveRes.error || 'Erro de persistência'}`
          };
        }
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
   * CLOUD-FIRST: Persiste a cópia na nuvem antes de realizar a troca de contexto.
   * Se falhar: O documento original continua aberto com zero efeitos colaterais.
   */
  static async duplicateActiveDocument(options?: { newTitle?: string }): Promise<{
    success: boolean;
    newId?: string;
    documentKind?: 'catalog' | 'template';
    error?: string;
  }> {
    const { currentCatalog, editorContext, isDirty } = useCatalogStore.getState();
    if (!currentCatalog) {
      return { success: false, error: 'Nenhum documento ativo para duplicar.' };
    }

    const invariant = this.assertDocumentContextConsistency(currentCatalog, editorContext);
    if (!invariant.isValid) {
      return { success: false, error: invariant.error };
    }

    // Flush de segurança se documento atual estiver dirty
    if (isDirty) {
      const saveRes = await useCatalogStore.getState().saveActiveDocument();
      if (!saveRes.success) {
        return {
          success: false,
          error: `Não foi possível salvar as alterações do documento antes de duplicar: ${saveRes.error || 'Erro de persistência'}`
        };
      }
    }

    try {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;

      const duplicatedTitle = options?.newTitle?.trim() || `${currentCatalog.title} (Cópia)`;

      if (editorContext.kind === 'template') {
        // Duplicação de Template -> Novo Template (Cloud-First via useTemplateStore)
        const res = await useTemplateStore.getState().createCustomTemplate(
          duplicatedTitle,
          `Cópia do template ${currentCatalog.title}`,
          { ...currentCatalog, id: newId, title: duplicatedTitle }
        );

        if (!res.success || !res.data) {
          return { success: false, error: res.error || 'Erro ao duplicar template na nuvem.' };
        }

        const confirmedTemplateId = res.data.id;
        const newTemplateCatalog: Catalog = {
          ...structuredClone(currentCatalog),
          id: confirmedTemplateId,
          title: duplicatedTitle,
          version: res.data.version || 1,
          updatedAt: new Date().toISOString()
        };

        useCatalogStore.setState({
          currentCatalog: newTemplateCatalog,
          editorContext: { kind: 'template', templateId: confirmedTemplateId },
          isDirty: false,
          syncStatus: 'synced',
          syncError: null,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0
        });

        this.syncBrowserUrl({ kind: 'template', templateId: confirmedTemplateId });
        return { success: true, newId: confirmedTemplateId, documentKind: 'template' };
      } else {
        // Duplicação de Catálogo -> Novo Catálogo (Cloud-First via SupabaseService)
        const candidateCatalog: Catalog = {
          ...structuredClone(currentCatalog),
          id: newId,
          title: duplicatedTitle,
          version: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const cloudRes = await SupabaseService.saveCatalog(candidateCatalog, 0);
        if (!cloudRes.success || !cloudRes.data) {
          return {
            success: false,
            error: cloudRes.error || 'Falha ao duplicar catálogo na nuvem.'
          };
        }

        const confirmedCatalog: Catalog = {
          ...candidateCatalog,
          version: Number(cloudRes.data.version) || 1,
          updatedAt: cloudRes.data.updated_at || new Date().toISOString()
        };

        await StorageService.saveCatalog(confirmedCatalog);
        StorageService.setActiveCatalogId(newId);

        useCatalogStore.setState((state) => ({
          currentCatalog: confirmedCatalog,
          savedCatalogs: [confirmedCatalog, ...state.savedCatalogs.filter((c) => c.id !== newId)],
          editorContext: { kind: 'catalog', catalogId: newId },
          isDirty: false,
          syncStatus: 'synced',
          syncError: null,
          localRevision: 0,
          lastAcknowledgedLocalRevision: 0
        }));

        this.syncBrowserUrl({ kind: 'catalog', catalogId: newId });
        return { success: true, newId, documentKind: 'catalog' };
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
   * Inclui verificação de drift de contexto da tradução.
   */
  static async createLocalizedVariant(params: {
    translatedDocument: Catalog;
    sourceContext: EditorDocumentContext;
    sourceSnapshot?: TranslationSourceSnapshot;
    targetLocale?: string;
  }): Promise<{ success: boolean; newId?: string; documentKind?: 'catalog' | 'template'; error?: string }> {
    const { translatedDocument, sourceContext, sourceSnapshot } = params;

    // Verificação de Drift de Contexto
    if (sourceSnapshot) {
      const activeContext = useCatalogStore.getState().editorContext;
      const activeId = activeContext.kind === 'catalog' ? activeContext.catalogId : activeContext.templateId;
      if (activeContext.kind !== sourceSnapshot.sourceDocumentKind || activeId !== sourceSnapshot.sourceDocumentId) {
        return {
          success: false,
          error: 'SOURCE_CONTEXT_CHANGED: O documento ativo foi trocado durante o processo de tradução. A criação foi cancelada por segurança.'
        };
      }
    }

    if (sourceContext.kind === 'template') {
      return await useCatalogStore.getState().createTranslatedTemplateVersion(translatedDocument);
    } else {
      return await useCatalogStore.getState().createTranslatedCatalogVersion(translatedDocument);
    }
  }
}
