import { create } from 'zustand';
import { Catalog } from '@/domain/catalog.schema';
import {
  CredentialStorageMode,
  StoredCredentialMetadata,
  CoverageAuditResult,
  TranslationCredential
} from '@/translation/types';
import { PersonalCredentialVault } from '@/translation/credential-vault';
import { CoverageAuditor } from '@/translation/coverage.auditor';
import { TranslationService, TranslationSampleResult } from '@/services/translation.service';

interface TranslationState {
  isModalOpen: boolean;
  targetLocale: string;
  sourceLocale: string;
  credentialMeta: StoredCredentialMetadata | null;
  storageMode: CredentialStorageMode;
  isTestingKey: boolean;
  isPreviewing: boolean;
  coverage: CoverageAuditResult | null;
  sampleResults: TranslationSampleResult[];
  error: string | null;
  testSuccessMessage: string | null;

  // Actions
  openModal: () => void;
  closeModal: () => void;
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
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  isModalOpen: false,
  targetLocale: 'en-US',
  sourceLocale: 'pt-BR',
  credentialMeta: null,
  storageMode: 'session',
  isTestingKey: false,
  isPreviewing: false,
  coverage: null,
  sampleResults: [],
  error: null,
  testSuccessMessage: null,

  openModal: () => set({ isModalOpen: true, error: null, testSuccessMessage: null }),
  closeModal: () => set({ isModalOpen: false }),

  setTargetLocale: (locale: string) => {
    set({ targetLocale: locale, sampleResults: [], error: null });
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
      // 1. Testa a chave antes de persistir
      const testRes = await TranslationService.testConnection(cred);
      if (!testRes.success) {
        set({ isTestingKey: false, error: 'A chave informada não foi aceita pelo provedor.' });
        return { success: false, error: 'Chave rejeitada pelo provedor.' };
      }

      // 2. Salva no cofre pessoal
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
      // Nós elegíveis para tradução
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
  }
}));
