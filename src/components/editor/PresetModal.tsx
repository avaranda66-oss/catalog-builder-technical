import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, ArrowRight, LayoutTemplate, Package, Bookmark, Layers, Trash2, Loader2 } from 'lucide-react';
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

  const handleApplyPreset = (preset: CatalogPreset) => {
    const isTemplate = preset.category === 'layout_template';
    const actionLabel = isTemplate
      ? `Carregar o esqueleto de layout "${preset.name}"? As páginas atuais serão substituídas pela estrutura em branco deste modelo.`
      : `Carregar o catálogo oficial "${preset.name}" com todos os dados técnicos e fotos reais pré-configurados?`;

    if (confirm(actionLabel)) {
      const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
      const newCatalog: Catalog = {
        ...structuredClone(preset.catalog),
        id: newId,
        updatedAt: new Date().toISOString(),
        version: 0
      };
      setCurrentCatalog(newCatalog);
      void saveCurrentCatalog();
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
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#003366] text-white rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Central de Estruturas & Catálogos de Produtos
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                Diferencie entre <strong>Esqueletos em Branco</strong> (templates sem produto) e <strong>Catálogos Prontos</strong> (com dados oficiais)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Superiores de Navegação */}
        <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-100/70 p-1.5 gap-1.5 text-xs font-semibold">
          {/* Aba 1: Catálogos Oficiais Prontos */}
          <button
            onClick={() => { setActiveTab('official_catalogs'); setMessage(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'official_catalogs'
                ? 'bg-white text-[#003366] shadow-sm font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Package className="w-4 h-4 text-emerald-600" />
            <span>📦 Catálogos Prontos ({officialCatalogs.length})</span>
          </button>

          {/* Aba 2: Templates de Estrutura em Branco */}
          <button
            onClick={() => { setActiveTab('layout_templates'); setMessage(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'layout_templates'
                ? 'bg-white text-[#003366] shadow-sm font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <LayoutTemplate className="w-4 h-4 text-blue-600" />
            <span>🏗️ Templates em Branco ({layoutTemplates.length})</span>
          </button>

          {/* Aba 3: Meus Templates Salvos */}
          <button
            onClick={() => { setActiveTab('custom'); setMessage(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'custom'
                ? 'bg-white text-[#003366] shadow-sm font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Bookmark className="w-4 h-4 text-amber-600" />
            <span>💾 Meus Templates ({customTemplates.length})</span>
          </button>

          {/* Aba 4: Salvar Atual como Template */}
          <button
            onClick={() => { setActiveTab('save'); setMessage(null); }}
            className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'save'
                ? 'bg-white text-[#003366] shadow-sm font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <Save className="w-4 h-4 text-slate-600" />
            <span>➕ Salvar Catálogo Atual</span>
          </button>
        </div>

        {/* Conteúdo das Abas */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {message && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{message}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 1: CATÁLOGOS OFICIAIS PRONTOS (COM DADOS E FOTOS REAIS) */}
          {/* ========================================================================= */}
          {activeTab === 'official_catalogs' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl flex items-start gap-2 text-xs text-emerald-900">
                <Package className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Catálogos de Produtos Oficiais Prontos:</strong> Estes documentos já vêm 100% populados com fotos reais de laboratório, especificações completas de engenharia (manuais PRESYS EM0314-01 / EM0291-04), tabelas de bornes e códigos de inserts.
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
                          Produto Oficial
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
                      onClick={() => handleApplyPreset(preset)}
                      className="mt-4 w-full py-2 bg-slate-900 group-hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <span>Abrir este Catálogo Completo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 2: TEMPLATES / ESQUELETOS DE ESTRUTURA EM BRANCO (SEM PRODUTO FIXO) */}
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
                      onClick={() => handleApplyPreset(preset)}
                      className="mt-4 w-full py-2 bg-slate-900 group-hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <span>Usar este Esqueleto de Layout</span>
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
                  <Bookmark className="w-12 h-12 mx-auto mb-2 opacity-40 text-amber-500" />
                  <p className="text-xs font-medium text-slate-600">Nenhum template personalizado salvo na nuvem</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Você pode salvar a estrutura do catálogo ativo a qualquer momento na aba "Salvar Catálogo Atual".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customTemplates.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-white border border-slate-200 hover:border-amber-400 rounded-xl p-4 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px] uppercase">
                            Nuvem / Compartilhado
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {preset.catalog.pages.length} folha(s)
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm">{preset.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{preset.description}</p>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => handleApplyPreset(preset)}
                          className="flex-1 py-1.5 bg-slate-900 hover:bg-amber-600 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span>Carregar</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => void handleDeleteCustomPreset(preset.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Excluir Template da Nuvem"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ABA 4: SALVAR ATUAL COMO TEMPLATE NA NUVEM */}
          {/* ========================================================================= */}
          {activeTab === 'save' && (
            <div className="max-w-xl mx-auto bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Salvar Estrutura do Catálogo na Nuvem
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Guarde a composição de páginas, tabelas e cabeçalhos do catálogo que você está editando no Supabase para reutilizar em toda a equipe.
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
