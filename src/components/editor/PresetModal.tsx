import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, ArrowRight, LayoutTemplate, Package, Bookmark, Layers, Trash2, Loader2, Pencil, FilePlus, Plus } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { SYSTEM_PRESETS } from '../../data/presets';
import { CatalogPreset, Catalog } from '../../domain/catalog.schema';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PresetModal: React.FC<PresetModalProps> = ({ isOpen, onClose }) => {
  const { currentCatalog, setCurrentCatalog, saveCurrentCatalog } = useCatalogStore();
  const {
    customTemplates,
    systemTemplates,
    isLoading: isTemplatesLoading,
    loadTemplates,
    createCustomTemplate,
    deleteCustomTemplate
  } = useTemplateStore();

  const [activeTab, setActiveTab] = useState<'layout_templates' | 'official_catalogs' | 'custom' | 'save'>('official_catalogs');
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadTemplates();
    }
  }, [isOpen, loadTemplates]);

  if (!isOpen) return null;

  const layoutTemplates = (systemTemplates.length > 0 ? systemTemplates : SYSTEM_PRESETS).filter(
    (p) => p.category === 'layout_template' || !p.category
  );
  const officialCatalogs = (systemTemplates.length > 0 ? systemTemplates : SYSTEM_PRESETS).filter(
    (p) => p.category === 'official_product_catalog'
  );

  const handleApplyPreset = async (preset: CatalogPreset) => {
    const isTemplate = preset.category === 'layout_template';
    const actionLabel = isTemplate
      ? `Criar um novo catálogo a partir do esqueleto de layout "${preset.name}"?`
      : `Criar uma cópia editável do catálogo "${preset.name}"?`;

    if (confirm(actionLabel)) {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const newCatalog: Catalog = {
        ...structuredClone(preset.catalog),
        id: newId,
        title: preset.name,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        version: 0,
        lastMutation: {
          kind: 'CREATE_COPY',
          clientInstanceId: typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage.getItem('cb_client_instance_id') || 'client' : 'client',
          summary: `Criado a partir do preset "${preset.name}"`,
          timestamp: new Date().toISOString()
        }
      };
      setCurrentCatalog(newCatalog);
      const res = await saveCurrentCatalog();
      if (res.success) {
        void useCatalogStore.getState().loadWorkspace();
      }
      onClose();
    }
  };

  const handleSaveCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCatalog || !presetName.trim()) return;

    setIsSaving(true);
    const res = await createCustomTemplate(presetName, presetDesc, currentCatalog);
    setIsSaving(false);

    if (res.success) {
      setMessage(`Template "${presetName}" salvo na nuvem com sucesso!`);
      setPresetName('');
      setPresetDesc('');
    } else {
      setMessage(`Erro ao salvar template: ${res.error || 'Falha de conexão'}`);
    }
  };

  const handleDeleteCustomPreset = async (id: string) => {
    if (confirm('Deseja excluir este template corporativo da nuvem?')) {
      await deleteCustomTemplate(id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-5xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#003366] text-white rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Catálogos Oficiais & Esqueletos de Estrutura</h2>
              <p className="text-xs text-slate-500">
                Selecione um catálogo oficial pronto com fotos reais ou comece por uma estrutura em branco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback / Mensagens de Alerta */}
        {message && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Abas de Navegação */}
        <div className="flex border-b border-slate-200 px-6 gap-2 pt-2 bg-slate-50/50">
          <button
            onClick={() => { setActiveTab('official_catalogs'); setMessage(null); }}
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'official_catalogs'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-4 h-4 text-emerald-600" />
            <span>Catálogos Oficiais da Linha ({officialCatalogs.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('layout_templates'); setMessage(null); }}
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'layout_templates'
                ? 'border-blue-600 text-blue-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutTemplate className="w-4 h-4 text-blue-600" />
            <span>Templates em Branco ({layoutTemplates.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('custom'); setMessage(null); }}
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'custom'
                ? 'border-presys-navy text-presys-navy'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bookmark className="w-4 h-4 text-slate-600" />
            <span>Meus Templates Nuvem ({customTemplates.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('save'); setMessage(null); }}
            className={`pb-3 px-4 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ml-auto ${
              activeTab === 'save'
                ? 'border-presys-navy text-presys-navy'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Plus className="w-4 h-4 text-slate-600" />
            <span>Criar Template</span>
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ========================================================================= */}
          {/* ABA 1: CATÁLOGOS OFICIAIS COMPLETOS (PRESYS OFICIAL COM DADOS REAIS) */}
          {/* ========================================================================= */}
          {activeTab === 'official_catalogs' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
                <Package className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Catálogos Técnicos Oficiais Prontos:</strong> Cada modelo abaixo já contém todas as fotos reais, especificações de engenharia, tabelas de precisão e códigos de encomenda configurados no padrão corporativo da PRESYS.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {officialCatalogs.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-white border border-slate-200 hover:border-emerald-500 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px] tracking-wide uppercase flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          Catálogo de Produto Oficial
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {preset.catalog.pages.length} página(s) A4
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {preset.description}
                      </p>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                        {preset.catalog.pages.map((p, idx) => (
                          <span key={p.id} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Pág {idx + 1}: {p.title || p.pageType}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => void handleApplyPreset(preset)}
                      className="mt-4 w-full py-2 bg-presys-navy group-hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <span>Criar cópia editável deste catálogo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: ESQUELETOS EM BRANCO PARA CUSTOMIZAÇÃO LIVRE */}
          {/* ========================================================================= */}
          {activeTab === 'layout_templates' && (
            <div className="space-y-4">
              <div className="bg-blue-50/70 border border-blue-200 p-3 rounded-xl flex items-start gap-2 text-xs text-blue-900">
                <LayoutTemplate className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Esqueletos de Estrutura em Branco:</strong> Modelos pré-moldados sem nenhum produto amarrado. Escolha uma estrutura de 1, 2 ou 3 páginas para você preencher livremente e vincular qualquer equipamento da Biblioteca Oficial.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {layoutTemplates.map((preset) => (
                  <div
                    key={preset.id}
                    className="bg-white border border-slate-200 hover:border-blue-500 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px] tracking-wide uppercase flex items-center gap-1">
                          <LayoutTemplate className="w-3 h-3" />
                          Esqueleto em Branco
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {preset.catalog.pages.length} página(s) A4
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                        {preset.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        {preset.description}
                      </p>

                      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                        {preset.catalog.pages.map((p, idx) => (
                          <span key={p.id} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Pág {idx + 1}: {p.title || p.pageType}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => void handleApplyPreset(preset)}
                      className="mt-4 w-full py-2 bg-slate-900 group-hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <span>Criar catálogo a partir deste esqueleto</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 3: MEUS TEMPLATES SALVOS NA NUVEM */}
          {/* ========================================================================= */}
          {activeTab === 'custom' && (
            <div>
              {isTemplatesLoading ? (
                <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
                  <p className="text-xs font-medium text-slate-600">Sincronizando templates com a nuvem...</p>
                </div>
              ) : customTemplates.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Bookmark className="w-12 h-12 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-xs font-medium text-slate-600">Nenhum template personalizado salvo na nuvem</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Você pode salvar a estrutura do catálogo ativo a qualquer momento na aba "Criar Template".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customTemplates.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-4 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold text-[10px] uppercase">
                            Template Corporativo v{preset.version || 1}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {preset.catalog.pages.length} folha(s)
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm">{preset.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{preset.description}</p>
                      </div>

                      <div className="flex flex-col gap-2 mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {/* 1. EDITAR TEMPLATE DIRETAMENTE (SEM CLONE) */}
                          <button
                            onClick={async () => {
                              await useCatalogStore.getState().openTemplateForEditing(preset.id);
                              onClose();
                            }}
                            className="flex-1 py-1.5 bg-presys-navy hover:bg-presys-dark text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                            title="Abre o template original para edição e sincronização direta"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar Template</span>
                          </button>

                          {/* 2. CRIAR NOVO CATÁLOGO A PARTIR DO TEMPLATE (CLONE INDEPENDENTE) */}
                          <button
                            onClick={() => void handleApplyPreset(preset)}
                            className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                            title="Cria um novo catálogo de produto independente a partir deste modelo"
                          >
                            <FilePlus className="w-3.5 h-3.5 text-slate-600" />
                            <span>Criar Catálogo</span>
                          </button>

                          {/* 3. EXCLUIR */}
                          <button
                            onClick={() => void handleDeleteCustomPreset(preset.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Excluir Template da Nuvem"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 4: CRIAR NOVO TEMPLATE CORPORATIVO */}
          {/* ========================================================================= */}
          {activeTab === 'save' && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Criar Novo Template Corporativo
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Crie um novo modelo compartilhado no Supabase usando a estrutura de páginas, tabelas e cabeçalhos do documento atual.
              </p>

              {message && (
                <div className={`p-3 mb-4 rounded-lg text-xs flex items-center gap-2 ${message.startsWith('Erro') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              <form onSubmit={handleSaveCustomPreset} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Template *
                  </label>
                  <input
                    type="text"
                    required
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Ex: Template Calibradores Portáteis (2 Folhas)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Descrição Técnica (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    value={presetDesc}
                    onChange={(e) => setPresetDesc(e.target.value)}
                    placeholder="Ex: Layout limpo com tabela de exatidão e diagrama de bornes para instrumentos de bancada."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{isSaving ? 'Salvando na Nuvem...' : 'Salvar como Novo Template Corporativo'}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
