// src/stores/useTranslationStore.ts
// Zustand Store para o Translation Center (Fase 2C.2: Full Catalog Translation Engine)
// Gerencia configuração de BYOK, progresso de lote, preview em memória, revisão humana e layout QA.

import { create } from 'zustand';
import { Catalog } from '@/domain/catalog.schema';
import {
  CredentialStorageMode,
  StoredCredentialMetadata,
  CoverageAuditResult,
  TranslationCredential,
  BatchTranslationProgress,
  LayoutQaResult,
  FullTranslationResult
} from '@/translation/types';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { CoverageAuditor } from '@/translation/coverage.auditor';
import { TranslationService, TranslationSampleResult } from '@/services/translation.service';
import { FullCatalogTranslationService } from '@/translation/full-catalog-translation.service';
import { TranslationApplierRegistry } from '@/translation/translation-applier.registry';
import { TranslationLayoutAuditor } from '@/translation/layout-qa.auditor';
import { PrintableTextRegistry } from '@/translation/printable-text.registry';

export type TranslationWorkflowStep = 'config' | 'progress' | 'review' | 'layout_qa' | 'complete';

export interface TranslationReviewItem {
  nodeId: string;
  sourceText: string;
  translatedText: string;
  originalTranslatedText: string;
  pageNumber: number;
  blockType?: string;
  kind: string;
  policy: string;
  isHumanEdited: boolean;
}

interface TranslationState {
  isModalOpen: boolean;
  activeStep: TranslationWorkflowStep;
  targetLocale: string;
  sourceLocale: string;
  credentialMeta: StoredCredentialMetadata | null;
  storageMode: CredentialStorageMode;
  isTestingKey: boolean;
  isPreviewing: boolean;
  isTranslating: boolean;
  coverage: CoverageAuditResult | null;
  sampleResults: TranslationSampleResult[];
  progress: BatchTranslationProgress | null;
  previewCatalog: Catalog | null;
  reviewItems: TranslationReviewItem[];
  layoutQaResult: LayoutQaResult | null;
  translationResultMeta: FullTranslationResult | null;
  error: string | null;
  testSuccessMessage: string | null;
  abortController: AbortController | null;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  setActiveStep: (step: TranslationWorkflowStep) => void;
  setTargetLocale: (locale: string) => void;
  setStorageMode: (mode: CredentialStorageMode) => void;
  loadCredentialStatus: (userId?: string | null) => Promise<void>;
  saveAndTestCredential: (
    userId: string,
    apiKey: string,
    storageMode: CredentialStorageMode
  ) => Promise<{ success: boolean; error?: string }>;
  removeCredential: (userId?: string | null) => Promise<void>;
  refreshCoverage: (catalog: Catalog | null) => void;
  runSamplePreview: (catalog: Catalog | null, userId?: string | null) => Promise<void>;
  startFullTranslation: (sourceCatalog: Catalog | null, userId?: string | null) => Promise<boolean>;
  cancelTranslation: () => void;
  updateReviewItem: (nodeId: string, newText: string) => void;
  runLayoutQa: (rootElement: HTMLElement | Document) => void;
  resetWorkflow: () => void;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  isModalOpen: false,
  activeStep: 'config',
  targetLocale: 'en-US',
  sourceLocale: 'pt-BR',
  credentialMeta: null,
  storageMode: 'session',
  isTestingKey: false,
  isPreviewing: false,
  isTranslating: false,
  coverage: null,
  sampleResults: [],
  progress: null,
  previewCatalog: null,
  reviewItems: [],
  layoutQaResult: null,
  translationResultMeta: null,
  error: null,
  testSuccessMessage: null,
  abortController: null,

  openModal: () => set({ isModalOpen: true, error: null, testSuccessMessage: null }),
  closeModal: () => set({ isModalOpen: false }),
  setActiveStep: (step) => set({ activeStep: step }),

  setTargetLocale: (locale: string) => {
    set({
      targetLocale: locale,
      sampleResults: [],
      previewCatalog: null,
      reviewItems: [],
      layoutQaResult: null,
      error: null
    });
  },

  setStorageMode: (mode: CredentialStorageMode) => set({ storageMode: mode }),

  loadCredentialStatus: async (userId) => {
    if (!userId) {
      set({ credentialMeta: null });
      return;
    }
    const meta = await PersonalCredentialVault.getCredentialMetadata(userId);
    set({ credentialMeta: meta, storageMode: meta?.storageMode || 'session' });
  },

  saveAndTestCredential: async (userId, apiKey, storageMode) => {
    if (!userId) return { success: false, error: 'Usuário não autenticado.' };
    if (!apiKey || apiKey.trim().length < 5) {
      return { success: false, error: 'Por favor, informe uma chave de API válida.' };
    }

    set({ isTestingKey: true, error: null, testSuccessMessage: null });

    const cred: TranslationCredential = {
      provider: 'gemini',
      apiKey: apiKey.trim(),
      storageMode,
      model: 'gemini-2.5-flash',
      validatedAt: new Date().toISOString()
    };

    try {
      const testRes = await TranslationService.testConnection(cred);
      if (!testRes.success) {
        set({ isTestingKey: false, error: 'A chave informada não foi aceita pelo provedor.' });
        return { success: false, error: 'Chave rejeitada pelo provedor.' };
      }

      await PersonalCredentialVault.saveCredential(userId, cred);
      const meta = await PersonalCredentialVault.getCredentialMetadata(userId);

      set({
        credentialMeta: meta,
        isTestingKey: false,
        testSuccessMessage: 'Chave Google Gemini validada e pronta para uso nesta sessão!'
      });

      return { success: true };
    } catch (err: any) {
      set({ isTestingKey: false, error: err?.message || 'Falha ao testar chave de API.' });
      return { success: false, error: err?.message || 'Erro de conexão com o provedor.' };
    }
  },

  removeCredential: async (userId) => {
    if (userId) {
      await PersonalCredentialVault.removeCredential(userId);
    }
    set({
      credentialMeta: null,
      sampleResults: [],
      error: null,
      testSuccessMessage: null
    });
  },

  refreshCoverage: (catalog) => {
    if (!catalog) {
      set({ coverage: null });
      return;
    }
    const coverage = CoverageAuditor.auditCatalog(catalog);
    set({ coverage });
  },

  runSamplePreview: async (catalog, userId) => {
    if (!catalog) return;
    if (!userId) {
      set({ error: 'Faça login para utilizar a tradução por IA.' });
      return;
    }

    const cred = await PersonalCredentialVault.getCredential(userId);
    if (!cred || !cred.apiKey) {
      set({ error: 'Configure sua chave pessoal do Google Gemini antes de solicitar a prévia de tradução.' });
      return;
    }

    const coverage = CoverageAuditor.auditCatalog(catalog);
    set({ coverage, isPreviewing: true, error: null });

    if (!coverage.isComplete && coverage.unclassifiedCount > 0) {
      set({
        isPreviewing: false,
        error: `Tradução bloqueada: Existem ${coverage.unclassifiedCount} elementos não classificados no documento.`
      });
      return;
    }

    try {
      const translateNodes = coverage.nodes.filter((n) => n.policy === 'translate');
      const results = await TranslationService.translateSampleNodes(
        translateNodes,
        get().targetLocale,
        cred,
        get().sourceLocale
      );

      set({
        sampleResults: results,
        isPreviewing: false
      });
    } catch (err: any) {
      set({
        isPreviewing: false,
        error: err?.message || 'Erro ao gerar amostra de tradução.'
      });
    }
  },

  startFullTranslation: async (sourceCatalog, userId) => {
    if (!sourceCatalog) return false;
    if (!userId) {
      set({ error: 'Faça login para traduzir o catálogo.' });
      return false;
    }

    const abort = new AbortController();
    set({
      isTranslating: true,
      activeStep: 'progress',
      error: null,
      abortController: abort,
      progress: {
        phase: 'preparing',
        totalNodes: 0,
        translatedNodes: 0,
        cachedNodes: 0,
        remainingNodes: 0,
        currentChunk: 0,
        totalChunks: 0,
        percent: 0,
        message: 'Iniciando pipeline de tradução...'
      }
    });

    try {
      const result = await FullCatalogTranslationService.translateCatalog(
        sourceCatalog,
        get().targetLocale,
        userId,
        (prog) => set({ progress: prog }),
        abort.signal
      );

      // Constrói os itens de revisão
      const sourceNodes = PrintableTextRegistry.extractCatalogNodes(sourceCatalog);
      const translatedNodes = PrintableTextRegistry.extractCatalogNodes(result.translatedCatalog);
      const translatedNodeMap = new Map(translatedNodes.map((n) => [n.id, n.sourceText]));

      const reviewItems: TranslationReviewItem[] = sourceNodes
        .filter((n) => n.policy === 'translate' || n.policy === 'system')
        .map((n) => {
          const trans = translatedNodeMap.get(n.id) || n.sourceText;
          const pageNum = parseInt(n.pageId.replace(/\D/g, ''), 10) || 1;
          return {
            nodeId: n.id,
            sourceText: n.sourceText,
            translatedText: trans,
            originalTranslatedText: trans,
            pageNumber: pageNum,
            blockType: n.source?.blockType,
            kind: n.kind,
            policy: n.policy,
            isHumanEdited: false
          };
        });

      set({
        isTranslating: false,
        previewCatalog: result.translatedCatalog,
        translationResultMeta: result,
        reviewItems,
        activeStep: 'review',
        abortController: null
      });

      return true;
    } catch (err: any) {
      if (err.name === 'TranslationError' && err.code === 'ABORTED') {
        set({ isTranslating: false, activeStep: 'config', error: 'Tradução cancelada.', abortController: null });
      } else {
        set({
          isTranslating: false,
          activeStep: 'config',
          error: err?.message || 'Falha na execução do pipeline de tradução.',
          abortController: null
        });
      }
      return false;
    }
  },

  cancelTranslation: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({ isTranslating: false, activeStep: 'config', error: 'Tradução interrompida pelo usuário.' });
  },

  updateReviewItem: (nodeId: string, newText: string) => {
    const { reviewItems, previewCatalog, targetLocale } = get();
    if (!previewCatalog) return;

    const updatedItems = reviewItems.map((item) => {
      if (item.nodeId === nodeId) {
        return {
          ...item,
          translatedText: newText,
          isHumanEdited: newText !== item.originalTranslatedText
        };
      }
      return item;
    });

    // Remonta o catálogo de preview em memória com a edição humana
    const transMap = new Map<string, string>();
    updatedItems.forEach((it) => transMap.set(it.nodeId, it.translatedText));

    const applierResult = TranslationApplierRegistry.applyTranslations(
      previewCatalog,
      transMap,
      targetLocale,
      previewCatalog.localizedSystemStrings
    );

    const updatedCatalog = applierResult.translatedCatalog;
    if (updatedCatalog.translationMeta) {
      updatedCatalog.translationMeta.humanEdited = updatedItems.some((i) => i.isHumanEdited);
    }

    set({
      reviewItems: updatedItems,
      previewCatalog: updatedCatalog
    });
  },

  runLayoutQa: (rootElement) => {
    const { targetLocale } = get();
    const result = TranslationLayoutAuditor.auditLayout(rootElement, targetLocale);
    set({ layoutQaResult: result });
  },

  resetWorkflow: () => {
    set({
      activeStep: 'config',
      isTranslating: false,
      progress: null,
      previewCatalog: null,
      reviewItems: [],
      layoutQaResult: null,
      translationResultMeta: null,
      error: null,
      testSuccessMessage: null
    });
  }
}));
