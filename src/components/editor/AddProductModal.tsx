import React, { useState } from 'react';
import { X, Search, Check } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useCatalogStore } from '../../stores/useCatalogStore';

export const AddProductModal: React.FC = () => {
  const { isAddProductToTableModalOpen, targetTableBlockId, closeAddProductToTableModal } = useUIStore();
  const { products } = useLibraryStore();
  const { addRowToTable } = useCatalogStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamilyFilter, setSelectedFamilyFilter] = useState<string>('all');

  if (!isAddProductToTableModalOpen || !targetTableBlockId) return null;

  const families = ['all', ...Array.from(new Set(products.map((p) => p.family).filter(Boolean)))];

  const filtered = products.filter((p) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesFamily = selectedFamilyFilter === 'all' || p.family === selectedFamilyFilter;
    const matchesSearch =
      !q ||
      p.code.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q) ||
      p.family.toLowerCase().includes(q) ||
      p.specs.range.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q);

    return matchesFamily && matchesSearch;
  });

  const handleSelect = (productId: string) => {
    addRowToTable(targetTableBlockId, productId);
    closeAddProductToTableModal();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-2xl w-full p-5 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-[#003366]">Selecionar Produto da Biblioteca Oficial</h2>
            <p className="text-xs text-slate-500">
              Escolha um instrumento cadastrado na biblioteca ({products.length} itens disponíveis).
            </p>
          </div>
          <button onClick={closeAddProductToTableModal} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

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
            {families.filter((f) => f !== 'all').map((f) => (
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
              onClick={() => handleSelect(prod.id)}
              className="p-3 border border-slate-200 hover:border-[#003366] hover:bg-blue-50/40 rounded-lg cursor-pointer transition-all flex items-center justify-between group bg-white shadow-2xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-[#003366] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {prod.code}
                  </span>
                  <span className="text-xs font-bold text-slate-900">{prod.model}</span>
                  <span className="text-[10px] text-slate-500 font-normal">({prod.family})</span>
                </div>
                <p className="text-[11px] font-mono text-slate-700">
                  Faixa: <span className="font-semibold">{prod.specs.range} {prod.specs.unit}</span> | Exatidão: <span className="font-semibold">{prod.specs.accuracy}</span> | Saída: {prod.specs.output}
                </p>
              </div>

              <button
                type="button"
                className="px-3 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Selecionar</span>
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
