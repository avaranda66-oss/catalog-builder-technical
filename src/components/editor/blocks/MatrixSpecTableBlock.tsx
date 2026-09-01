import React from 'react';
import { Grid3X3, Plus, Trash2 } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface MatrixSpecTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const MatrixSpecTableBlock: React.FC<MatrixSpecTableBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const custom = block.customData || {};
  const columns: string[] = custom.columns || [
    'Parâmetro / Modelo',
    'PCON-Y18-LP (Baixa Pressão)',
    'PCON-Y18 (Média Pressão)',
    'PCON-Y18-HP (Alta Pressão)'
  ];

  const rows: Array<{ param: string; values: string[] }> = custom.rows || [
    {
      param: 'Faixa de Geração Pneumática',
      values: ['-0.9 a 2.5 bar (-13 a 36 psi)', '-0.9 a 40 bar (-13 a 600 psi)', '0 a 70 bar (0 a 1000 psi)']
    },
    {
      param: 'Exatidão Padrão (% FE)',
      values: ['±0.025% FE ou ±0.01% FE', '±0.025% FE ou ±0.01% FE', '±0.025% FE']
    },
    {
      param: 'Estabilidade de Controle',
      values: ['Melhor que 0.003% FE', 'Melhor que 0.003% FE', 'Melhor que 0.005% FE']
    },
    {
      param: 'Bomba Elétrica Integrada',
      values: ['Sim (Motor Brushless)', 'Sim (Motor Brushless)', 'Sim (Alta Pressão)']
    },
    {
      param: 'Alimentação de Loop 24Vdc',
      values: ['Sim (Isolada 1500V)', 'Sim (Isolada 1500V)', 'Sim (Isolada 1500V)']
    }
  ];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleUpdateColumnName = (colIdx: number, val: string) => {
    const updated = [...columns];
    updated[colIdx] = val.trim();
    updateBlock(pageId, block.id, {
      customData: { ...custom, columns: updated }
    });
  };

  const handleAddColumn = () => {
    const updatedCols = [...columns, `Novo Modelo ${columns.length}`];
    const updatedRows = rows.map((r) => ({
      ...r,
      values: [...r.values, '—']
    }));
    updateBlock(pageId, block.id, {
      customData: { ...custom, columns: updatedCols, rows: updatedRows }
    });
  };

  const handleRemoveColumn = (colIdx: number) => {
    if (columns.length <= 2) return;
    const updatedCols = columns.filter((_, idx) => idx !== colIdx);
    const valueIdx = colIdx - 1;
    const updatedRows = rows.map((r) => ({
      ...r,
      values: r.values.filter((_, idx) => idx !== valueIdx)
    }));
    updateBlock(pageId, block.id, {
      customData: { ...custom, columns: updatedCols, rows: updatedRows }
    });
  };

  const handleUpdateParam = (rowIdx: number, val: string) => {
    const updated = [...rows];
    updated[rowIdx] = { ...updated[rowIdx], param: val };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: updated }
    });
  };

  const handleUpdateValue = (rowIdx: number, valIdx: number, val: string) => {
    const updated = [...rows];
    const newVals = [...updated[rowIdx].values];
    newVals[valIdx] = val;
    updated[rowIdx] = { ...updated[rowIdx], values: newVals };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: updated }
    });
  };

  const handleAddRow = () => {
    const newRow = {
      param: 'Novo Parâmetro Metrológico',
      values: new Array(columns.length - 1).fill('—')
    };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: [...rows, newRow] }
    });
  };

  const handleRemoveRow = (idx: number) => {
    if (rows.length <= 1) return;
    const updated = rows.filter((_, i) => i !== idx);
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: updated }
    });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-2xl bg-white border border-slate-200 shadow-md transition-all ${
        isSelected ? 'ring-3 ring-brand-500 shadow-xl' : 'hover:border-slate-300'
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3 gap-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-amber-100 rounded px-1 flex items-center gap-2 flex-1 cursor-text"
        >
          <Grid3X3 className="w-4 h-4 text-[#003366] shrink-0" />
          <span>{block.title || 'MATRIZ COMPARATIVA DE ESPECIFICAÇÕES & FAIXAS OPERACIONAIS'}</span>
        </h3>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddColumn();
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded"
          >
            <Plus className="w-3 h-3" />
            <span>+ Coluna</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddRow();
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded"
          >
            <Plus className="w-3 h-3" />
            <span>+ Linha</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`py-2 px-2.5 border-r border-slate-200 relative group/th ${
                    idx === 0 ? 'w-1/3' : 'text-center font-mono text-slate-900'
                  }`}
                >
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleUpdateColumnName(idx, e.currentTarget.innerText)}
                    className="outline-none focus:bg-white rounded px-0.5 block cursor-text"
                  >
                    {col}
                  </span>
                  {idx > 0 && columns.length > 2 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveColumn(idx);
                      }}
                      className="absolute top-1 right-1 p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover/th:opacity-100 transition-opacity"
                      title="Excluir esta coluna"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                </th>
              ))}
              <th className="py-2 px-1 w-8 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[10px]">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="py-1.5 px-2.5 font-bold text-slate-900 border-r border-slate-200">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleUpdateParam(rIdx, e.currentTarget.innerText.trim())}
                    className="outline-none focus:bg-amber-100 px-0.5 rounded block cursor-text"
                  >
                    {row.param}
                  </span>
                </td>

                {row.values.map((val, vIdx) => (
                  <td key={vIdx} className="py-1.5 px-2.5 text-center font-mono text-slate-700 border-r border-slate-200">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleUpdateValue(rIdx, vIdx, e.currentTarget.innerText.trim())}
                      className="outline-none focus:bg-amber-50 px-0.5 rounded cursor-text"
                    >
                      {val}
                    </span>
                  </td>
                ))}

                <td className="py-1 px-1 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRow(rIdx);
                    }}
                    className="p-0.5 text-slate-300 hover:text-red-600 rounded"
                    title="Excluir esta linha"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
