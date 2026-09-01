import React, { useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Download,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { Product } from '../../domain/product.schema';

export const LibraryView: React.FC = () => {
  const {
    products,
    familyColumns,
    selectedFamily,
    setSelectedFamily,
    addProduct,
    deleteProduct,
    addFamilyColumn,
    renameFamilyColumn,
    removeFamilyColumn,
    updateProductCell
  } = useLibraryStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCellInfo, setActiveCellInfo] = useState<{ rowIdx: number; colKey: string; value: string } | null>(null);

  // Estados de edição de coluna
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [editingColKey, setEditingColKey] = useState<string | null>(null);
  const [editingColLabel, setEditingColLabel] = useState('');

  // Lista de famílias existentes
  const families = Array.from(new Set(products.map((p) => p.family || 'Geral')));
  if (!families.includes('Calibradores de Temperatura')) families.unshift('Calibradores de Temperatura');
  if (!families.includes('Transmissores de Pressão Relativa')) families.unshift('Transmissores de Pressão Relativa');

  const currentFamily = selectedFamily || families[0];
  const columnsForFamily = familyColumns[currentFamily] || [
    { key: 'code', label: 'Código' },
    { key: 'model', label: 'Modelo Comercial' },
    { key: 'range', label: 'Faixa de Operação' },
    { key: 'unit', label: 'Unidade' },
    { key: 'accuracy', label: 'Exatidão Metrológica' },
    { key: 'output', label: 'Sinais / Saída' }
  ];

  // Produtos filtrados da família ativa
  const familyProducts = products.filter(
    (p) =>
      p.family === currentFamily &&
      (p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Inserir Nova Linha de Produto
  const handleAddNewRow = () => {
    const nextNum = products.length + 1;
    const newProd: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
      code: `PRESYS-${nextNum.toString().padStart(3, '0')}`,
      family: currentFamily,
      model: `MOD-${nextNum}`,
      description: `Instrumento PRESYS #${nextNum}`,
      specs: {
        range: '0 a 100',
        unit: 'bar',
        accuracy: '±0.05% FE',
        output: '4-20 mA + HART',
        powerSupply: '24 Vdc',
        processConnection: '1/2" NPT',
        protectionDegree: 'IP67',
        customSpecs: {}
      },
      imageUrl: ''
    };
    addProduct(newProd);
  };

  // Criar Nova Coluna Técnica para esta família
  const handleConfirmAddColumn = () => {
    if (!newColumnLabel.trim()) return;
    const key = `spec_${Date.now()}`;
    addFamilyColumn(currentFamily, key, newColumnLabel.trim());
    setNewColumnLabel('');
    setIsAddingColumn(false);
  };

  // Renomear Coluna
  const handleConfirmRenameColumn = () => {
    if (!editingColKey || !editingColLabel.trim()) return;
    renameFamilyColumn(currentFamily, editingColKey, editingColLabel.trim());
    setEditingColKey(null);
    setEditingColLabel('');
  };

  // Excluir Coluna da Família (Direto e Instantâneo)
  const handleDeleteColumn = (colKey: string) => {
    if (columnsForFamily.length <= 1) return;
    removeFamilyColumn(currentFamily, colKey);
  };

  // Exportar Tabela da Família como CSV
  const handleExportCSV = () => {
    const headers = ['#', ...columnsForFamily.map((c) => c.label)];
    const rows = familyProducts.map((p, idx) => [
      idx + 1,
      ...columnsForFamily.map((c) => {
        if (c.key in p) return (p as any)[c.key] || '';
        if (c.key in p.specs) return (p.specs as any)[c.key] || '';
        return p.specs.customSpecs?.[c.key] || '';
      })
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `presys_biblioteca_${currentFamily.toLowerCase().replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden text-xs">
      {/* 1. Barra de Fórmulas / Célula Ativa Estilo Excel */}
      <div className="h-9 bg-[#f8fafc] border-b border-slate-300 px-3 flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 border border-slate-300 rounded text-[11px] shrink-0">
            {activeCellInfo ? `R${activeCellInfo.rowIdx + 1}:${activeCellInfo.colKey}` : 'A1'}
          </span>
          <span className="text-slate-400 font-mono text-[11px]">|</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-slate-300 rounded px-2 py-0.5">
            <span className="text-slate-400 text-[10px] font-mono shrink-0">fx:</span>
            <span className="text-slate-800 font-mono text-[11px] truncate">
              {activeCellInfo?.value !== undefined ? activeCellInfo.value : 'Click on any cell to edit directly'}
            </span>
          </div>
        </div>

        {/* Busca e Ações Rápidas */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search code or model..."
              className="pl-7 pr-2 py-0.5 text-xs bg-white border border-slate-300 rounded-none focus:border-[#003366] focus:outline-none w-48 font-sans"
            />
          </div>

          <button
            onClick={() => setIsAddingColumn(true)}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-none transition-colors shadow-2xs"
            title="Create new specification column for this family"
          >
            <Plus className="w-3 h-3 text-[#003366]" />
            <span>+ Column</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-none transition-colors shadow-2xs"
            title="Export this family table to CSV format"
          >
            <Download className="w-3 h-3 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleAddNewRow}
            className="flex items-center gap-1 px-3 py-1 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-none shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Product</span>
          </button>
        </div>
      </div>

      {/* Modal / Formulário Inline para Nova Coluna */}
      {isAddingColumn && (
        <div className="bg-blue-50/80 border-b border-blue-200 px-4 py-2 flex items-center gap-3">
          <span className="font-semibold text-blue-900 text-xs">Nome da Nova Coluna Técnica:</span>
          <input
            type="text"
            value={newColumnLabel}
            onChange={(e) => setNewColumnLabel(e.target.value)}
            placeholder="Ex: Estabilidade Térmica, Conexão Elétrica..."
            className="px-2 py-1 text-xs border border-blue-300 rounded bg-white w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmAddColumn();
              if (e.key === 'Escape') setIsAddingColumn(false);
            }}
          />
          <button
            onClick={handleConfirmAddColumn}
            className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded text-xs"
          >
            Adicionar Coluna
          </button>
          <button
            onClick={() => setIsAddingColumn(false)}
            className="text-slate-500 hover:text-slate-700 text-xs"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* 2. Grade Tabular Estilo Excel com Linhas Finas */}
      <div className="flex-1 overflow-auto bg-slate-100/50">
        <table className="w-full border-collapse text-xs text-left spreadsheet-grid bg-white">
          <thead>
            {/* Linha das Letras da Planilha (A, B, C, D...) */}
            <tr className="bg-[#f1f5f9] text-slate-400 font-mono text-[10px] text-center select-none border-b border-slate-300">
              <th className="w-10 p-1 border-r border-slate-300 font-normal"> </th>
              {columnsForFamily.map((_, colIdx) => (
                <th key={colIdx} className="p-1 border-r border-slate-300 font-normal">
                  {String.fromCharCode(65 + colIdx)}
                </th>
              ))}
              <th className="w-10 p-1 font-normal"> </th>
            </tr>

            {/* Cabeçalho dos Nomes das Colunas Técnicas */}
            <tr className="bg-[#003366] text-white font-semibold sticky top-0 z-10 shadow-xs">
              <th className="p-2 border-r border-[#002244] w-10 text-center font-mono text-[11px] text-slate-300">
                #
              </th>

              {columnsForFamily.map((col) => {
                const isEditingThis = editingColKey === col.key;
                return (
                  <th
                    key={col.key}
                    className="p-2 border-r border-[#002244] font-semibold text-xs tracking-tight group"
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingColLabel}
                          onChange={(e) => setEditingColLabel(e.target.value)}
                          className="px-1 py-0.5 text-xs text-slate-900 bg-white rounded border border-white focus:outline-none w-full"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmRenameColumn();
                            if (e.key === 'Escape') setEditingColKey(null);
                          }}
                        />
                        <button
                          onClick={handleConfirmRenameColumn}
                          className="p-0.5 text-emerald-300 hover:text-emerald-100"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingColKey(null)}
                          className="p-0.5 text-red-300 hover:text-red-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{col.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingColKey(col.key);
                              setEditingColLabel(col.label);
                            }}
                            className="p-0.5 text-slate-300 hover:text-white rounded"
                            title="Renomear coluna"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          {columnsForFamily.length > 1 && (
                            <button
                              onClick={() => handleDeleteColumn(col.key)}
                              className="p-0.5 text-red-300 hover:text-red-100 rounded"
                              title="Excluir esta coluna"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}

              <th className="p-2 w-10 text-center text-slate-300">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 font-sans">
            {familyProducts.map((product, rowIdx) => (
              <tr key={product.id} className="hover:bg-blue-50/40 transition-colors">
                {/* Índice da Linha (1, 2, 3...) */}
                <td className="p-2 border-r border-slate-200 text-center font-mono text-[11px] text-slate-400 bg-slate-50/80">
                  {rowIdx + 1}
                </td>

                {/* Células de Dados Editáveis Estilo Planilha */}
                {columnsForFamily.map((col) => {
                  let currentValue = '';
                  if (col.key in product) {
                    currentValue = (product as any)[col.key] || '';
                  } else if (col.key in product.specs) {
                    currentValue = (product.specs as any)[col.key] || '';
                  } else if (product.specs.customSpecs) {
                    currentValue = product.specs.customSpecs[col.key] || '';
                  }

                  return (
                    <td
                      key={col.key}
                      className="p-0 border-r border-slate-200"
                      onClick={() =>
                        setActiveCellInfo({
                          rowIdx,
                          colKey: col.key,
                          value: currentValue
                        })
                      }
                    >
                      <input
                        type="text"
                        value={currentValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateProductCell(product.id, col.key, val);
                          setActiveCellInfo({ rowIdx, colKey: col.key, value: val });
                        }}
                        onFocus={() =>
                          setActiveCellInfo({
                            rowIdx,
                            colKey: col.key,
                            value: currentValue
                          })
                        }
                        className={`w-full h-full px-2.5 py-1.5 bg-transparent border border-transparent focus:border-[#003366] focus:bg-white focus:outline-none text-xs text-slate-800 ${
                          col.key === 'code' || col.key === 'model'
                            ? 'font-bold font-mono text-slate-900'
                            : 'font-normal'
                        }`}
                      />
                    </td>
                  );
                })}

                {/* Excluir Linha */}
                <td className="p-1.5 text-center">
                  <button
                    onClick={() => {
                      deleteProduct(product.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                    title="Excluir produto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            {familyProducts.length === 0 && (
              <tr>
                <td
                  colSpan={columnsForFamily.length + 2}
                  className="p-8 text-center text-slate-400 italic text-xs"
                >
                  Nenhum produto cadastrado nesta família. Clique em "+ Inserir Linha" para cadastrar o primeiro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Barra Inferior com Abas de Famílias Estilo Excel / Google Sheets */}
      <div className="h-8 bg-[#f1f5f9] border-t border-slate-300 px-2 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-1 overflow-x-auto h-full py-0.5">
          {families.map((fam) => {
            const isActive = fam === currentFamily;
            return (
              <button
                key={fam}
                onClick={() => setSelectedFamily(fam)}
                className={`px-3 py-1 text-xs font-semibold rounded-t border-t border-l border-r transition-all ${
                  isActive
                    ? 'bg-white text-[#003366] border-slate-300 shadow-2xs -mb-1 z-10'
                    : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 border-transparent'
                }`}
              >
                {fam}
              </button>
            );
          })}

          <button
            onClick={() => {
              const newFamName = prompt('Nome da nova família de produtos (ex: Válvulas de Controle):');
              if (newFamName && newFamName.trim()) {
                setSelectedFamily(newFamName.trim());
              }
            }}
            className="px-2 py-0.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded text-xs font-bold flex items-center gap-0.5 ml-1"
            title="Adicionar nova família de produtos"
          >
            <Plus className="w-3 h-3" />
            <span>Nova Família</span>
          </button>
        </div>

        <div className="text-[10px] text-slate-500 font-mono pr-2">
          Total: {familyProducts.length} itens listados
        </div>
      </div>
    </div>
  );
};
