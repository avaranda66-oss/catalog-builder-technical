import React, { useState } from 'react';
import { X, Search, Check, AlertTriangle, Database, WifiOff, Sparkles } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useLibraryStore, LibraryDataProvenance } from '../../stores/useLibraryStore';
import { useCatalogStore } from '../../stores/useCatalogStore';

export const AddProductModal: React.FC = () => {
  const { isAddProductToTableModalOpen, targetTableBlockId, closeAddProductToTableModal } = useUIStore();
  const { products, dataProvenance } = useLibraryStore();
  const { addRowToTable } = useCatalogStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');

  if (!isAddProductToTableModalOpen || !targetTableBlockId) return null;

  const families = ['all', ...Array.from(new Set(products.map((p) => p.family).filter(Boolean)))];

  const filtered = products.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesFamily = selectedFamilyFilter === 'all' || p.family === selectedFamilyFilter;

    const code = (p.code || '').toLowerCase();
    const model = (p.model || '').toLowerCase();
    const family = (p.family || '').toLowerCase();
    const range = (p.specs?.range || '').toLowerCase();
    const accuracy = (p.specs?.accuracy || '').toLowerCase();
    const output = (p.specs?.output || '').toLowerCase();
    const description = (p.description || '').toLowerCase();

    const matchesSearch =
      !q ||
      code.includes(q) ||
      model.includes(q) ||
      family.includes(q) ||
      range.includes(q) ||
      accuracy.includes(q) ||
      output.includes(q) ||
      description.includes(q);

    return matchesFamily && matchesSearch;
  });

  const isDemo = dataProvenance === 'demo_seed';

  const handleSelect = (productId: string) => {
    if (dataProvenance === 'demo_seed') return;
    addRowToTable(targetTableBlockId, productId);
    closeAddProductToTableModal();
  };

  const getProvenanceConfig = (provenance: LibraryDataProvenance) => {
    switch (provenance) {
      case 'cloud_official':
        return {
          title: 'Biblioteca Oficial — Nuvem',
          subtitle: `Instrumentos cadastrados na base corporativa oficial (${products.length} disponíveis).`,
          badgeLabel: 'Nuvem Oficial',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: <Database className="w-3.5 h-3.5 text-emerald-700" />,
          isDemo: false
        };
      case 'offline_cache':
        return {
          title: 'Biblioteca — Cache Offline',
          subtitle: `Exibindo cópia em cache local. Pode estar desatualizado em relação à base oficial (${products.length} disponíveis).`,
          badgeLabel: 'Cache Local (Offline)',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: <WifiOff className="w-3.5 h-3.5 text-amber-700" />,
          isDemo: false
        };
      case 'demo_seed':
      default:
        return {
          title: 'Dados de Demonstração',
          subtitle: `Atenção: exibindo instrumentos de demonstração. Não representam dados oficiais da Presys (${products.length} disponíveis).`,
          badgeLabel: 'Demonstração / Teste',
          badgeClass: 'bg-slate-200 text-slate-800 border-slate-300',
          icon: <Sparkles className="w-3.5 h-3.5 text-slate-700" />,
          isDemo: true
        };
    }
  };

  const prov = getProvenanceConfig(dataProvenance);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-2xl w-full p-5 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#003366]">{prov.title}</h2>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${prov.badgeClass}`}
              >
                {prov.icon}
                <span>{prov.badgeLabel}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{prov.subtitle}</p>
          </div>
          <button onClick={closeAddProductToTableModal} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerta de Fail-Closed / Aviso quando dados forem Demonstração */}
        {prov.isDemo && (
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug">
              <strong>Aviso de Proveniência:</strong> Esta sessão está exibindo dados mockados de demonstração.
              Nenhum dado mockado possui certificação metrológica oficial.
            </p>
          </div>
        )}

        {/* Barra de Filtros e Busca */}
        <div className="flex items-center gap-2 mt-3 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, modelo, faixa..."
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-[#003366] focus:border-[#003366]"
            />
          </div>

          <select
            value={selectedFamilyFilter}
            onChange={(e) => setSelectedFamilyFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white text-slate-700 focus:outline-none"
          >
            <option value="all">Todas as Famílias</option>
            {families
              .filter((f) => f !== 'all')
              .map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
          </select>
        </div>

        {/* Lista de Produtos da Biblioteca */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.map((prod) => (
            <div
              key={prod.id}
              onClick={isDemo ? undefined : () => handleSelect(prod.id)}
              className={`p-3 border rounded-lg transition-all flex items-center justify-between group shadow-2xs ${
                isDemo
                  ? 'border-slate-200 opacity-80 cursor-not-allowed bg-slate-50/50'
                  : 'border-slate-200 hover:border-[#003366] hover:bg-blue-50/40 cursor-pointer bg-white'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[#003366] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {prod.code}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{prod.model}</span>
                  <span className="text-[10px] text-slate-500 font-normal">({prod.family})</span>
                  {prov.isDemo && (
                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1 py-0.2 rounded">DEMO</span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-700 flex flex-wrap gap-x-3 gap-y-0.5">
                  {prod.specs?.range ? (
                    <span>
                      Faixa: <span className="font-semibold">{prod.specs.range} {prod.specs?.unit || ''}</span>
                    </span>
                  ) : null}
                  {prod.specs?.accuracy ? (
                    <span>
                      Exatidão: <span className="font-semibold">{prod.specs.accuracy}</span>
                    </span>
                  ) : null}
                  {prod.specs?.output ? (
                    <span>
                      Saída: <span className="font-semibold">{prod.specs.output}</span>
                    </span>
                  ) : null}
                  {!prod.specs?.range && !prod.specs?.accuracy && !prod.specs?.output && (
                    <span className="text-slate-400 italic font-sans text-[10.5px]">
                      Sem especificações técnicas registradas
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={isDemo}
                onClick={
                  isDemo
                    ? (e) => e.stopPropagation()
                    : (e) => {
                        e.stopPropagation();
                        handleSelect(prod.id);
                      }
                }
                className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors ${
                  isDemo
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                    : 'bg-[#003366] hover:bg-[#002244] text-white cursor-pointer'
                }`}
              >
                {isDemo ? (
                  <span>Indisponível para vínculo</span>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Selecionar</span>
                  </>
                )}
              </button>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              Nenhum produto cadastrado na biblioteca corresponde ao filtro.
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={closeAddProductToTableModal}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
