import React, { useState, useEffect } from 'react';
import { X, Save, CheckCircle2, FileText, ArrowRight, LayoutTemplate } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { SYSTEM_PRESETS } from '../../data/presets';
import { CatalogPreset, Catalog } from '../../domain/catalog.schema';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PresetModal: React.FC<PresetModalProps> = ({ isOpen, onClose }) => {
  const { currentCatalog, setCurrentCatalog, saveCurrentCatalog } = useCatalogStore();
  const [activeTab, setActiveTab] = useState<'system' | 'save' | 'custom'>('system');
  const [customPresets, setCustomPresets] = useState<CatalogPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('cb_custom_presets');
      if (raw) {
        try {
          setCustomPresets(JSON.parse(raw));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: CatalogPreset) => {
    if (confirm(`Deseja carregar o modelo "${preset.name}"? As páginas atuais do catálogo serão substituídas pela estrutura deste modelo.`)) {
      const newCatalog: Catalog = {
        ...structuredClone(preset.catalog),
        id: `cat-${Date.now()}`,
        updatedAt: new Date().toISOString(),
        version: 1
      };
      setCurrentCatalog(newCatalog);
      saveCurrentCatalog();
      onClose();
    }
  };

  const handleSaveCustomPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCatalog || !presetName.trim()) return;

    const newPreset: CatalogPreset = {
      id: `preset-custom-${Date.now()}`,
      name: presetName.trim(),
      description: presetDesc.trim() || 'Modelo personalizado criado pelo usuário.',
      isSystem: false,
      catalog: structuredClone(currentCatalog),
      createdAt: new Date().toISOString()
    };

    const updated = [newPreset, ...customPresets];
    setCustomPresets(updated);
    localStorage.setItem('cb_custom_presets', JSON.stringify(updated));
    setMessage(`Modelo "${presetName}" salvo com sucesso!`);
    setPresetName('');
    setPresetDesc('');
  };

  const handleDeleteCustomPreset = (id: string) => {
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('cb_custom_presets', JSON.stringify(updated));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 max-w-4xl w-full flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-[#003366]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Galeria de Modelos & Presets de Catálogo</h2>
              <p className="text-[11px] text-slate-500 font-mono">Estruturas editoriais homologadas para catálogos técnicos, fichas e datasheets</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1">
          <button
            onClick={() => { setActiveTab('system'); setMessage(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'system' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Modelos de Fábrica Homologados ({SYSTEM_PRESETS.length})
          </button>
          <button
            onClick={() => { setActiveTab('save'); setMessage(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'save' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Salvar Documento Atual como Modelo
          </button>
          <button
            onClick={() => { setActiveTab('custom'); setMessage(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'custom' ? 'bg-white text-[#003366] shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meus Modelos Salvos ({customPresets.length})
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs bg-slate-50/50">
          {activeTab === 'system' && (
            <div className="space-y-4">
              <p className="text-slate-600 leading-relaxed text-[11px]">
                Selecione uma estrutura editorial completa. As páginas, capas, tabelas e diagramas serão configurados automaticamente no editor A4.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SYSTEM_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    className="p-4 border border-slate-200 hover:border-[#003366] rounded-xl bg-white hover:shadow-lg transition-all flex flex-col justify-between group space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-900 text-xs group-hover:text-[#003366] transition-colors leading-tight">
                          {preset.name}
                        </h3>
                        <span className="px-2 py-0.5 bg-blue-50 text-[#003366] font-mono text-[9px] font-bold rounded-full border border-blue-200 shrink-0">
                          {preset.catalog.pages.length} pág(s) A4
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {preset.description}
                      </p>

                      {/* Miniaturas de Páginas */}
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        {preset.catalog.pages.map((p, pIdx) => (
                          <span
                            key={p.id || pIdx}
                            className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-mono border border-slate-200"
                          >
                            Pág. {p.pageNumber}: {p.title || 'Seções'}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Tema: {preset.catalog.themeId}
                      </span>
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs shadow-2xs transition-colors"
                      >
                        <span>Usar este Modelo</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'save' && (
            <form onSubmit={handleSaveCustomPreset} className="space-y-4 max-w-lg mx-auto bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-xs">
                  <Save className="w-4 h-4 text-[#003366]" />
                  <span>Salvar Estrutura como Modelo Corporativo</span>
                </p>
                <p className="text-[11px] leading-relaxed text-slate-700">
                  O layout atual com <strong>{currentCatalog?.pages.length || 0} página(s)</strong>, blocos, tabelas e estilização será salvo na sua biblioteca pessoal para reutilização rápida.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Modelo *</label>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Ex: Catálogo Oficial Linha PCON 2026"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#003366]"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição / Finalidade</label>
                <textarea
                  rows={3}
                  value={presetDesc}
                  onChange={(e) => setPresetDesc(e.target.value)}
                  placeholder="Ex: Modelo de 3 páginas para propostas técnicas com transmissores e manifolds."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-[#003366]"
                />
              </div>

              {message && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{message}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold shadow-sm transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Modelo no Workspace</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-3">
              {customPresets.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2 bg-white rounded-xl border border-dashed border-slate-200">
                  <FileText className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Você ainda não salvou nenhum modelo personalizado.</p>
                  <p className="text-[11px] text-slate-500">
                    Use a aba "Salvar Documento Atual como Modelo" para criar templates reutilizáveis.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="p-4 border border-slate-200 rounded-xl bg-white flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <h3 className="font-bold text-slate-900 text-xs">{preset.name}</h3>
                        <p className="text-[11px] text-slate-600 mt-1">{preset.description}</p>
                        <span className="text-[10px] text-slate-400 font-mono mt-2 block">
                          Criado em: {new Date(preset.createdAt || Date.now()).toLocaleDateString('pt-BR')} ({preset.catalog.pages.length} páginas)
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleDeleteCustomPreset(preset.id)}
                          className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded text-xs font-medium"
                        >
                          Excluir
                        </button>
                        <button
                          onClick={() => handleApplyPreset(preset)}
                          className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded-lg font-bold text-xs shadow-2xs"
                        >
                          Aplicar Modelo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 flex justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
