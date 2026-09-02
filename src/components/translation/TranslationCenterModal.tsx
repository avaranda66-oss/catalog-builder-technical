// src/components/translation/TranslationCenterModal.tsx
// Modal Principal do Translation Center (Fase 2C.2: Full Catalog Translation Engine)
// Fluxo: Seleção de Idioma -> BYOK -> Tradução Completa em Lote -> Revisão Humana -> Layout QA -> Criar Versão Independente

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Globe,
  Key,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Trash2,
  Layers,
  Sliders,
  Check,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { useTranslationStore } from '@/stores/useTranslationStore';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { LanguageRegistry } from '@/translation/language.registry';
import { CredentialStorageMode } from '@/translation/types';
import { FontManager } from '@/translation/font-manager';
import { CleanA4Document } from '../export/CleanA4Document';

export const TranslationCenterModal: React.FC = () => {
  const {
    isModalOpen,
    closeModal,
    activeStep,
    setActiveStep,
    targetLocale,
    setTargetLocale,
    credentialMeta,
    storageMode,
    isTestingKey,
    isTranslating,
    coverage,
    progress,
    previewCatalog,
    reviewItems,
    layoutQaResult,
    error,
    testSuccessMessage,
    loadCredentialStatus,
    saveAndTestCredential,
    removeCredential,
    refreshCoverage,
    startFullTranslation,
    cancelTranslation,
    updateReviewItem,
    runLayoutQa
  } = useTranslationStore();

  const currentCatalog = useCatalogStore((state) => state.currentCatalog);
  const editorContext = useCatalogStore((state) => state.editorContext);
  const isTemplateMode = editorContext?.kind === 'template';
  const userId = useAuthStore((state) => state.userId);
  const qaContainerRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<CredentialStorageMode>(storageMode);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'edited' | 'system' | 'headings'>('all');
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [confirmWarnings, setConfirmWarnings] = useState(false);

  useEffect(() => {
    if (isModalOpen) {
      refreshCoverage(currentCatalog);
      if (userId) {
        loadCredentialStatus(userId);
      }
    }
  }, [isModalOpen, userId, currentCatalog]);

  useEffect(() => {
    if (credentialMeta?.storageMode) {
      setSelectedMode(credentialMeta.storageMode);
    }
  }, [credentialMeta]);

  // Executa Layout QA real no passo layout_qa assim que o CleanA4Document estiver montado
  useEffect(() => {
    let isCancelled = false;

    if (activeStep === 'layout_qa' && previewCatalog) {
      setConfirmWarnings(false);

      const runAudit = async () => {
        try {
          await FontManager.ensureFontsLoadedForLocale(targetLocale);
          if (typeof document !== 'undefined' && document.fonts) {
            try {
              await document.fonts.ready;
            } catch {
              // Continua
            }
          }

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!isCancelled && qaContainerRef.current) {
                void runLayoutQa(qaContainerRef.current);
              }
            });
          });
        } catch (err) {
          console.error('Erro na auditoria de layout:', err);
        }
      };

      void runAudit();
    }

    return () => {
      isCancelled = true;
    };
  }, [activeStep, previewCatalog, targetLocale]);

  if (!isModalOpen) return null;

  const languages = LanguageRegistry.searchLanguages(searchQuery);
  const selectedLang = LanguageRegistry.getLanguageByCode(targetLocale);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeUserId = userId || useAuthStore.getState().userId;
    if (!activeUserId || !apiKeyInput.trim()) return;
    const res = await saveAndTestCredential(activeUserId, apiKeyInput.trim(), selectedMode);
    if (res.success) {
      setApiKeyInput('');
    }
  };

  const handleRemoveKey = async () => {
    const activeUserId = userId || useAuthStore.getState().userId;
    if (!activeUserId) return;
    await removeCredential(activeUserId);
    setApiKeyInput('');
  };

  const handleStartTranslation = async () => {
    const activeUserId = userId || useAuthStore.getState().userId;
    if (!currentCatalog || !activeUserId) return;
    setSaveErrorMessage(null);
    await startFullTranslation(currentCatalog, activeUserId);
  };

  const handleCreateVersion = async () => {
    if (!previewCatalog || !currentCatalog) return;
    setIsSavingVersion(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    try {
      // Cria a nova versão persistida na nuvem via action oficial do CatalogStore
      const result = await useCatalogStore.getState().createTranslatedCatalogVersion(previewCatalog);

      if (!result.success) {
        setSaveErrorMessage(result.error || 'Não foi possível salvar a versão traduzida na nuvem.');
        return;
      }

      setSaveSuccessMessage(
        `Nova versão localizada criada e salva na nuvem com sucesso! (ID: ${result.catalogId?.substring(0, 8)}...)`
      );
      setActiveStep('complete');
    } catch (err: any) {
      console.error('Falha ao criar versão traduzida:', err);
      setSaveErrorMessage(err?.message || 'Erro inesperado ao salvar versão traduzida.');
    } finally {
      setIsSavingVersion(false);
    }
  };

  const filteredReviewItems = reviewItems.filter((item) => {
    if (reviewFilter === 'edited') return item.isHumanEdited;
    if (reviewFilter === 'system') return item.policy === 'system' || item.kind === 'system';
    if (reviewFilter === 'headings') return item.kind === 'heading' || item.kind === 'badge';
    return true;
  });

  const isSaveBlocked =
    isTemplateMode ||
    isSavingVersion ||
    !layoutQaResult ||
    layoutQaResult.status === 'pending' ||
    layoutQaResult.status === 'error' ||
    (layoutQaResult.status === 'warning' && !confirmWarnings);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden rounded-none">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#003366] text-white border-b border-[#002244]">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-300" />
            <div>
              <h2 className="text-base font-bold tracking-tight">Translation Center — PRESYS Global Engine</h2>
              <p className="text-xs text-blue-200">
                Tradução integral não-destrutiva de 100% do PDF • Isolamento BYOK • Suporte Multiscript
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="p-1 hover:bg-white/10 rounded-none text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Step Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 text-xs font-semibold px-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveStep('config')}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
              activeStep === 'config'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Idioma & Configuração</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep('progress')}
            disabled={!previewCatalog && !isTranslating}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
              activeStep === 'progress'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>2. Tradução em Lote</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep('review')}
            disabled={!previewCatalog}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
              activeStep === 'review'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            <span>3. Revisão Comparativa ({reviewItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep('layout_qa')}
            disabled={!previewCatalog}
            className={`py-3 px-4 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap disabled:opacity-40 ${
              activeStep === 'layout_qa'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>4. Layout QA & PDF</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURAÇÃO DE IDIOMA E BYOK */}
          {activeStep === 'config' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Seleção de Idioma Alvo */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
                    Selecione o Idioma Comercial Alvo
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {languages.length} idiomas comerciais suportados
                  </span>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nome nativo, inglês ou código BCP-47..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-none bg-white outline-none focus:border-[#003366]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1 border border-slate-200 bg-white p-2">
                  {languages.map((lang) => {
                    const isSelected = targetLocale === lang.code;
                    return (
                      <div
                        key={lang.code}
                        onClick={() => setTargetLocale(lang.code)}
                        className={`p-2.5 border cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#003366] bg-blue-50/60 ring-1 ring-[#003366]'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900">{lang.nativeName}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600">
                            {lang.code}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>{lang.englishName}</span>
                          <span className="uppercase">{lang.script} • {lang.direction}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Resumo da Cobertura de Textos */}
                {coverage && (
                  <div className="p-3 bg-white border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Taxonomia Imprimível do Documento:</span>
                      <span className="text-emerald-700 font-bold font-mono">100% Mapeado</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                      <div className="p-2 bg-slate-50 border border-slate-200">
                        <span className="block text-slate-500 text-[10px]">Textos a Traduzir</span>
                        <span className="font-bold text-[#003366]">{coverage.translateCount}</span>
                      </div>
                      <div className="p-2 bg-slate-50 border border-slate-200">
                        <span className="block text-slate-500 text-[10px]">Valores Protegidos</span>
                        <span className="font-bold text-slate-700">{coverage.protectedCount}</span>
                      </div>
                      <div className="p-2 bg-slate-50 border border-slate-200">
                        <span className="block text-slate-500 text-[10px]">Strings de Sistema</span>
                        <span className="font-bold text-slate-700">{coverage.systemCount}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Painel Lateral BYOK */}
              <div className="space-y-4">
                <div className="p-4 bg-white border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                    <Key className="w-4 h-4 text-[#003366]" />
                    <span>Cofre Pessoal BYOK (Google Gemini)</span>
                  </div>

                  {credentialMeta?.isValid ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2 border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="font-bold">Chave de API ativa</p>
                          <p className="text-[10px] text-emerald-600 font-mono">
                            Modo: {credentialMeta.storageMode === 'remember' ? 'AES-GCM (persistido)' : 'Sessão volátil'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveKey}
                        className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover Chave do Cofre</span>
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveKey} className="space-y-2.5">
                      <p className="text-[11px] text-slate-500">
                        Insira sua chave pessoal do Google Gemini. Chaves nunca são salvas em texto puro nem compartilhadas.
                      </p>
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-none font-mono outline-none focus:border-[#003366]"
                      />

                      {/* Seletor Funcional de Modo de Armazenamento BYOK */}
                      <div className="space-y-1 pt-1 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-600 block uppercase">
                          Armazenamento da Chave:
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <label
                            className={`p-2 border cursor-pointer flex items-center gap-1.5 ${
                              selectedMode === 'session'
                                ? 'border-[#003366] bg-blue-50/50 font-bold text-[#003366]'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="storageMode"
                              value="session"
                              checked={selectedMode === 'session'}
                              onChange={() => setSelectedMode('session')}
                              className="accent-[#003366]"
                            />
                            <span>Somente Sessão</span>
                          </label>
                          <label
                            className={`p-2 border cursor-pointer flex items-center gap-1.5 ${
                              selectedMode === 'remember'
                                ? 'border-[#003366] bg-blue-50/50 font-bold text-[#003366]'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="storageMode"
                              value="remember"
                              checked={selectedMode === 'remember'}
                              onChange={() => setSelectedMode('remember')}
                              className="accent-[#003366]"
                            />
                            <span>Lembrar Dispositivo</span>
                          </label>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isTestingKey || !apiKeyInput.trim()}
                        className="w-full py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {isTestingKey && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Validar e Salvar Chave</span>
                      </button>
                    </form>
                  )}

                  {testSuccessMessage && (
                    <p className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 border border-emerald-200">
                      {testSuccessMessage}
                    </p>
                  )}
                </div>

                {/* Botão de Ação Primária */}
                <button
                  type="button"
                  onClick={handleStartTranslation}
                  disabled={!credentialMeta?.isValid || isTranslating}
                  className="w-full py-3 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Traduzir Catálogo para {selectedLang?.nativeName || targetLocale}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: PROGRESSO DA TRADUÇÃO */}
          {activeStep === 'progress' && (
            <div className="max-w-2xl mx-auto py-8 text-center space-y-6">
              <div className="space-y-2">
                <div className="w-12 h-12 bg-blue-100 text-[#003366] rounded-full flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Traduzindo Catálogo para {selectedLang?.nativeName} ({selectedLang?.code})
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {progress?.message || 'Processando textos e protegendo grandezas metrológicas...'}
                </p>
              </div>

              {/* Barra de Progresso */}
              <div className="space-y-1.5">
                <div className="w-full bg-slate-200 h-3 overflow-hidden rounded-none">
                  <div
                    className="bg-[#003366] h-full transition-all duration-300"
                    style={{ width: `${progress?.percent || 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>
                    {progress?.translatedNodes || 0} de {progress?.totalNodes || 0} textos processados
                  </span>
                  <span className="font-bold text-[#003366]">{progress?.percent || 0}%</span>
                </div>
              </div>

              {progress?.cachedNodes ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono text-left">
                  ⚡ <strong>Aceleração de Memória:</strong> {progress.cachedNodes} textos reutilizados instantaneamente do cache local.
                </div>
              ) : null}

              {isTranslating && (
                <button
                  type="button"
                  onClick={cancelTranslation}
                  className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                >
                  Cancelar Tradução
                </button>
              )}
            </div>
          )}

          {/* STEP 3: REVISÃO COMPARATIVA LADO A LADO */}
          {activeStep === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Filtro de Revisão:</span>
                  <div className="flex items-center gap-1">
                    {(['all', 'edited', 'system', 'headings'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setReviewFilter(filter)}
                        className={`px-2.5 py-1 text-xs border rounded-none capitalize font-mono ${
                          reviewFilter === filter
                            ? 'bg-[#003366] text-white border-[#003366]'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {filter === 'all'
                          ? `Todos (${reviewItems.length})`
                          : filter === 'edited'
                          ? `Editados Manualmente`
                          : filter === 'system'
                          ? `Strings Sistema`
                          : `Títulos/Badges`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveStep('layout_qa')}
                  className="px-4 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] flex items-center gap-1.5"
                >
                  <span>Avançar para Layout QA</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {filteredReviewItems.map((item) => (
                  <div key={item.nodeId} className="p-3 bg-white border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-b border-slate-100 pb-1">
                      <span>
                        Pág {item.pageNumber} • {item.kind} • ID: {item.nodeId}
                      </span>
                      {item.isHumanEdited && (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 font-bold">
                          Edição Humana Aplicada
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Original */}
                      <div className="bg-slate-50 p-2.5 border border-slate-200">
                        <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">
                          Original (pt-BR):
                        </span>
                        <p className="text-slate-800 leading-relaxed font-sans">{item.sourceText}</p>
                      </div>

                      {/* Tradução Editável */}
                      <div className="bg-blue-50/50 p-2.5 border border-blue-200">
                        <span className="block text-[10px] font-bold uppercase text-[#003366] mb-1 font-mono flex items-center justify-between">
                          <span>Tradução ({selectedLang?.code}):</span>
                          <span className="text-[9px] text-slate-400 font-normal">Clique para editar</span>
                        </span>
                        <textarea
                          value={item.translatedText}
                          onChange={(e) => updateReviewItem(item.nodeId, e.target.value)}
                          dir={selectedLang?.direction || 'ltr'}
                          rows={2}
                          className="w-full text-xs font-medium text-slate-900 bg-white border border-blue-200 p-1.5 outline-none focus:ring-1 focus:ring-[#003366] leading-relaxed resize-y"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: LAYOUT QA & CRIAÇÃO DE VERSÃO */}
          {activeStep === 'layout_qa' && (
            <div className="space-y-4">
              {/* Container de QA offscreen para auditoria real do CleanA4Document */}
              {previewCatalog && (
                <div
                  ref={qaContainerRef}
                  style={{ position: 'absolute', left: '-9999px', top: 0, opacity: 0, pointerEvents: 'none' }}
                >
                  <CleanA4Document document={previewCatalog} />
                </div>
              )}

              <div className="p-4 bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#003366]" />
                    <span>Auditoria de Integridade Visual do Documento</span>
                  </h3>
                  <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 font-bold font-mono">
                    Fidelidade: 100% Mapeado
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono text-center">
                  <div className="p-2.5 bg-slate-50 border border-slate-200">
                    <span className="block text-slate-500 text-[10px]">Direção do Texto</span>
                    <span className="font-bold text-slate-900 uppercase">
                      {selectedLang?.direction || 'ltr'} ({selectedLang?.script})
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200">
                    <span className="block text-slate-500 text-[10px]">Font Stack</span>
                    <span className="font-bold text-slate-900">{selectedLang?.fontProfile}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200">
                    <span className="block text-slate-500 text-[10px]">Status do Layout QA</span>
                    {!layoutQaResult ? (
                      <span className="font-bold text-slate-500 flex items-center justify-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Auditando...
                      </span>
                    ) : layoutQaResult.status === 'passed' ? (
                      <span className="font-bold text-emerald-700">PASS (0 Erros)</span>
                    ) : layoutQaResult.status === 'warning' ? (
                      <span className="font-bold text-amber-700">{layoutQaResult.issues.length} Avisos</span>
                    ) : (
                      <span className="font-bold text-rose-700">
                        {layoutQaResult.issues.filter((i) => i.severity === 'error').length} Erros Críticos
                      </span>
                    )}
                  </div>
                </div>

                {layoutQaResult?.issues && layoutQaResult.issues.length > 0 && (
                  <div className="space-y-1.5 pt-2 max-h-48 overflow-y-auto">
                    <span className="text-xs font-bold text-amber-700">Avisos e Observações de Layout:</span>
                    {layoutQaResult.issues.map((iss) => (
                      <div
                        key={iss.id}
                        className={`p-2 border text-xs ${
                          iss.severity === 'error'
                            ? 'bg-rose-50 border-rose-200 text-rose-800 font-bold'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}
                      >
                        {iss.message}
                      </div>
                    ))}
                  </div>
                )}

                {layoutQaResult?.status === 'warning' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-amber-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmWarnings}
                        onChange={(e) => setConfirmWarnings(e.target.checked)}
                        className="rounded-none text-[#003366] focus:ring-0"
                      />
                      <span>
                        Estou ciente dos {layoutQaResult.issues.length} avisos de layout e confirmo a criação da versão localizada.
                      </span>
                    </label>
                  </div>
                )}

                {saveErrorMessage && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{saveErrorMessage}</span>
                  </div>
                )}
              </div>

              {/* Botão de Criação de Versão Final / Política para Templates */}
              {isTemplateMode ? (
                <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">
                        Este documento é um Template Corporativo
                      </h4>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        A tradução pode ser revisada e auditada aqui, mas para criar uma publicação traduzida oficial na nuvem, abra ou crie um Catálogo baseado neste Template.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="px-4 py-2 text-xs font-bold bg-slate-300 text-slate-500 cursor-not-allowed whitespace-nowrap"
                  >
                    Criação bloqueada para Templates
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">
                      Pronto para criar a versão em {selectedLang?.nativeName}?
                    </h4>
                    <p className="text-[11px] text-emerald-700">
                      O catálogo original permanece 100% inalterado. Um novo catálogo independente com UUID próprio será persistido na nuvem.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateVersion}
                    disabled={isSaveBlocked}
                    className="px-5 py-2.5 text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    {isSavingVersion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>Criar Versão em {selectedLang?.nativeName || targetLocale}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: CONCLUSÃO */}
          {activeStep === 'complete' && (
            <div className="max-w-xl mx-auto py-10 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Versão em {selectedLang?.nativeName} Criada com Sucesso!
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {saveSuccessMessage || 'O novo catálogo traduzido já está disponível no seu workspace para edição e exportação em PDF.'}
              </p>
              <button
                type="button"
                onClick={closeModal}
                className="px-6 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244]"
              >
                Abrir Catálogo no Editor
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>Fase 2C.2: Motor de Tradução Completo (Original 100% Protegido)</span>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="px-4 py-1.5 font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
