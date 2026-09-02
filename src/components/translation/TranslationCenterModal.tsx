import React, { useState, useEffect } from 'react';
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
  Lock,
  Trash2,
  Layers
} from 'lucide-react';
import { useTranslationStore } from '@/stores/useTranslationStore';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { LanguageRegistry } from '@/translation/language.registry';
import { CredentialStorageMode } from '@/translation/types';

export const TranslationCenterModal: React.FC = () => {
  const {
    isModalOpen,
    closeModal,
    targetLocale,
    setTargetLocale,
    credentialMeta,
    storageMode,
    isTestingKey,
    isPreviewing,
    coverage,
    sampleResults,
    error,
    testSuccessMessage,
    loadCredentialStatus,
    saveAndTestCredential,
    removeCredential,
    refreshCoverage,
    runSamplePreview
  } = useTranslationStore();

  const currentCatalog = useCatalogStore((state) => state.currentCatalog);
  const userId = useAuthStore((state) => state.userId);

  const [activeTab, setActiveTab] = useState<'language' | 'credentials' | 'preview'>('language');
  const [searchQuery, setSearchQuery] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<CredentialStorageMode>(storageMode);

  useEffect(() => {
    if (isModalOpen) {
      refreshCoverage(currentCatalog);
      if (userId) {
        loadCredentialStatus(userId);
      }
    }
  }, [isModalOpen, userId, currentCatalog]);

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

  const handleRunPreview = () => {
    const activeUserId = userId || useAuthStore.getState().userId;
    if (!currentCatalog || !activeUserId) return;
    runSamplePreview(currentCatalog, activeUserId);
    setActiveTab('preview');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden rounded-none">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#003366] text-white border-b border-[#002244]">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-blue-300" />
            <div>
              <h2 className="text-base font-bold tracking-tight">Translation Center — PRESYS Global</h2>
              <p className="text-xs text-blue-200">
                Cobertura editorial de 100% do PDF • Isolamento pessoal BYOK • Suporte Multiscript
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="text-blue-200 hover:text-white p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('language')}
            className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'language'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>1. Idioma & Cobertura</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'credentials'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>2. Credencial Pessoal (BYOK)</span>
            {credentialMeta?.isValid && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Chave configurada e válida" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'preview'
                ? 'border-[#003366] text-[#003366] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>3. Amostra de Preview</span>
            {sampleResults.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-[#003366] font-bold">
                {sampleResults.length}
              </span>
            )}
          </button>
        </div>

        {/* Global Alert / Status */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {testSuccessMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{testSuccessMessage}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: IDIOMA & COBERTURA */}
          {activeTab === 'language' && (
            <div className="space-y-6">
              {/* Coverage Stats Box */}
              <div className="bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#003366]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Auditoria de Cobertura do Catálogo Atual
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Cobertura: {coverage?.isComplete ? '100%' : 'Incompleta'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  <div className="bg-white p-2.5 border border-slate-200 shadow-2xs">
                    <div className="text-lg font-bold text-slate-900">{coverage?.printableTextCount || 0}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Nós Imprimíveis</div>
                  </div>
                  <div className="bg-white p-2.5 border border-slate-200 shadow-2xs">
                    <div className="text-lg font-bold text-[#003366]">{coverage?.translateCount || 0}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Para Tradução</div>
                  </div>
                  <div className="bg-white p-2.5 border border-slate-200 shadow-2xs">
                    <div className="text-lg font-bold text-amber-700">{coverage?.protectedCount || 0}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Protegidos / Fatos</div>
                  </div>
                  <div className="bg-white p-2.5 border border-slate-200 shadow-2xs">
                    <div className="text-lg font-bold text-slate-700">{coverage?.systemCount || 0}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Sistema / Rodapés</div>
                  </div>
                  <div className="bg-white p-2.5 border border-slate-200 shadow-2xs">
                    <div
                      className={`text-lg font-bold ${
                        (coverage?.unclassifiedCount || 0) > 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {coverage?.unclassifiedCount || 0}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">Não Classificados</div>
                  </div>
                </div>
              </div>

              {/* Language Search and Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Selecionar Idioma de Destino:
                  </label>
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, país ou código..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 text-xs border border-slate-300 focus:outline-none focus:border-[#003366]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-200 bg-slate-50/50">
                  {languages.map((lang) => {
                    const isSelected = lang.code === targetLocale;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => setTargetLocale(lang.code)}
                        className={`p-2.5 text-left border transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/80 border-[#003366] shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-xs font-bold text-slate-900">{lang.nativeName}</div>
                            <div className="text-[11px] text-slate-500">{lang.englishName}</div>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                            {lang.code}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] px-1 bg-slate-200 text-slate-700 font-medium">
                            {lang.script}
                          </span>
                          <span className="text-[9px] px-1 bg-slate-200 text-slate-700 font-medium uppercase">
                            {lang.direction}
                          </span>
                          {lang.layoutSupport === 'experimental' && (
                            <span className="text-[9px] px-1 bg-amber-100 text-amber-800 font-medium">
                              Layout RTL Exp.
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    Idioma ativo:{' '}
                    <strong>
                      {selectedLang?.nativeName} ({selectedLang?.code})
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRunPreview}
                  disabled={isPreviewing || !credentialMeta?.isValid}
                  className="px-4 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50 flex items-center gap-2 transition-colors"
                >
                  {isPreviewing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-blue-300" />
                  )}
                  <span>Testar Amostra de Tradução (Sem Salvar)</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CREDENCIAIS BYOK */}
          {activeTab === 'credentials' && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#003366]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Cofre de Credenciais Pessoais (BYOK)
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">auth.uid: {userId?.slice(0, 8)}...</span>
                </div>

                {credentialMeta?.isValid ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Chave Google Gemini Configurada e Pronta</span>
                      </div>
                      <div className="text-xs text-emerald-700">
                        Modo de armazenamento:{' '}
                        <strong>
                          {credentialMeta.storageMode === 'remember'
                            ? 'Lembrar neste dispositivo (Cifrado local)'
                            : 'Apenas nesta sessão (Memória temporária)'}
                        </strong>
                      </div>
                      {credentialMeta.validatedAt && (
                        <div className="text-[11px] text-emerald-600 font-mono">
                          Última validação: {new Date(credentialMeta.validatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveKey}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-700 border border-red-300 bg-white hover:bg-red-50 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover Chave</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSaveKey} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Google Gemini API Key (Pessoal):
                      </label>
                      <input
                        type="password"
                        placeholder="Insira sua chave de API (ex: AIza...)"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 font-mono focus:outline-none focus:border-[#003366]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-700">Modo de Armazenamento Local:</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          className={`p-3 border flex items-start gap-2.5 cursor-pointer transition-all ${
                            selectedMode === 'session'
                              ? 'bg-blue-50/60 border-[#003366]'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="storageMode"
                            checked={selectedMode === 'session'}
                            onChange={() => setSelectedMode('session')}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-900">Somente esta sessão</div>
                            <div className="text-[11px] text-slate-500">
                              Chave mantida estritamente na memória volátil. Limpa ao sair da página.
                            </div>
                          </div>
                        </label>

                        <label
                          className={`p-3 border flex items-start gap-2.5 cursor-pointer transition-all ${
                            selectedMode === 'remember'
                              ? 'bg-blue-50/60 border-[#003366]'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="storageMode"
                            checked={selectedMode === 'remember'}
                            onChange={() => setSelectedMode('remember')}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-900">Lembrar neste dispositivo</div>
                            <div className="text-[11px] text-slate-500">
                              Cifrada via Web Crypto (AES-GCM) no IndexedDB isolada para seu usuário.
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isTestingKey || !apiKeyInput.trim()}
                        className="px-4 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50 flex items-center gap-2 transition-colors"
                      >
                        {isTestingKey ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                        <span>Testar & Salvar Credencial</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Informative Security Notice */}
              <div className="p-4 bg-slate-100 border border-slate-200 text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Lock className="w-4 h-4 text-slate-600" />
                  <span>Política de Isolamento e Segurança de Chaves</span>
                </div>
                <p>
                  Esta aplicação opera sob o modelo <strong>BYOK estrito (Zero Chave Global)</strong>. Sua chave de
                  API nunca é gravada em bancos de dados do servidor, catálogos compartilhados ou logs públicos.
                </p>
                <p className="text-[11px] text-slate-500">
                  * Nota de integridade: Esta chave fica protegida neste perfil do navegador. Pessoas com controle
                  técnico completo deste navegador/dispositivo podem possuir meios de acessar dados locais.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: AMOSTRA DE PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Amostra de Tradução em Tempo Real
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Origem: <strong>Português (pt-BR)</strong> → Destino:{' '}
                    <strong>
                      {selectedLang?.nativeName} ({selectedLang?.code})
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunPreview}
                  disabled={isPreviewing || !credentialMeta?.isValid}
                  className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 flex items-center gap-1.5 transition-colors"
                >
                  {isPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[#003366]" />}
                  <span>Atualizar Amostra</span>
                </button>
              </div>

              {isPreviewing ? (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#003366]" />
                  <p className="text-xs font-medium text-slate-600">
                    Processando tradução de alta precisão metrológica com o Google Gemini...
                  </p>
                </div>
              ) : sampleResults.length === 0 ? (
                <div className="py-10 text-center bg-slate-50 border border-dashed border-slate-300 p-6">
                  <Globe className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 mb-1">Nenhuma amostra gerada ainda</p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                    Gere uma amostra rápida para verificar como o Google Gemini traduz a terminologia técnica para o
                    idioma selecionado com proteção de tokens.
                  </p>
                  <button
                    type="button"
                    onClick={handleRunPreview}
                    disabled={!credentialMeta?.isValid}
                    className="px-4 py-2 text-xs font-bold bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50"
                  >
                    Gerar Amostra de Preview
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sampleResults.map((item, idx) => (
                    <div key={item.id} className="p-3 bg-white border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-b border-slate-100 pb-1">
                        <span>
                          Nó #{idx + 1}: {item.id}
                        </span>
                        {item.tokensProtected.length > 0 && (
                          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-sans font-bold">
                            {item.tokensProtected.length} token(s) técnico(s) preservado(s)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-50 p-2.5 border border-slate-100">
                          <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1 font-mono">
                            Original (pt-BR):
                          </span>
                          <p className="text-slate-800 leading-relaxed">{item.sourceText}</p>
                        </div>

                        <div className="bg-blue-50/50 p-2.5 border border-blue-100">
                          <span className="block text-[10px] font-bold uppercase text-[#003366] mb-1 font-mono">
                            Tradução ({selectedLang?.code}):
                          </span>
                          <p
                            className="text-slate-900 font-medium leading-relaxed"
                            dir={selectedLang?.direction || 'ltr'}
                          >
                            {item.translatedText}
                          </p>
                        </div>
                      </div>

                      {item.tokensProtected.length > 0 && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="font-semibold text-slate-700">Fatos protegidos:</span>
                          {item.tokensProtected.map((t, tIdx) => (
                            <span
                              key={tIdx}
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 font-mono text-[10px]"
                            >
                              {t.original}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>Fase 2C.1: Fundação & Preview (Zero alteração do catálogo original)</span>
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
