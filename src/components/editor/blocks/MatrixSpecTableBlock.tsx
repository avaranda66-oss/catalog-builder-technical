import React from 'react';
import { Grid3X3, Plus, Trash2, Columns } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { TechnicalCell } from '../../technical-table/TechnicalCell';
import { TechnicalLegend } from '../../technical-table/TechnicalLegend';

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
    'PCON-Y18-LP',
    'PCON-Y18',
    'PCON-Y18-HP'
  ];

  const rows: Array<{ param: string; values: string[] }> = custom.rows || [
    {
      param: 'Faixa de Geração Pneumática',
      values: ['-0.9 a 2.5 bar', '-0.9 a 40 bar', '0 a 70 bar']
    },
    {
      param: 'Exatidão Padrão (% FE)',
      values: ['±0.025% FE', '±0.025% FE', '±0.025% FE']
    },
    {
      param: 'Estabilidade de Controle',
      values: ['< 0.003% FE', '< 0.003% FE', '< 0.005% FE']
    },
    {
      param: 'Bomba Elétrica Integrada',
      values: ['■', '■', '■']
    },
    {
      param: 'Alimentação de Loop 24Vdc Isolada',
      values: ['■', '■', '■']
    },
    {
      param: 'Comunicação HART / Modbus',
      values: ['■', '■', '□']
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
    const newColNum = columns.length;
    const updatedCols = [...columns, `Modelo ${newColNum}`];
    const updatedRows = rows.map((r) => ({
      ...r,
      values: [...r.values, '—']
    }));
    updateBlock(pageId, block.id, {
      customData: { ...custom, columns: updatedCols, rows: updatedRows }
    });
  };

  const handleRemoveColumn = (colIdx: number) => {
    if (columns.length <= 2 || colIdx === 0) return;
    const updatedCols = columns.filter((_, idx) => idx !== colIdx);
    const updatedRows = rows.map((r) => ({
      ...r,
      values: r.values.filter((_, idx) => idx !== colIdx - 1)
    }));
    updateBlock(pageId, block.id, {
      customData: { ...custom, columns: updatedCols, rows: updatedRows }
    });
  };

  const handleUpdateParam = (rowIdx: number, val: string) => {
    const updated = [...rows];
    updated[rowIdx] = { ...updated[rowIdx], param: val.trim() };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: updated }
    });
  };

  const handleUpdateValue = (rowIdx: number, valIdx: number, val: string) => {
    const updated = [...rows];
    const newVals = [...updated[rowIdx].values];
    newVals[valIdx] = val.trim();
    updated[rowIdx] = { ...updated[rowIdx], values: newVals };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: updated }
    });
  };

  const handleAddRow = () => {
    const newRow = {
      param: 'Nova Especificação Técnica',
      values: columns.slice(1).map(() => '—')
    };
    updateBlock(pageId, block.id, {
      customData: { ...custom, rows: [...rows, newRow] }
    });
  };

  const handleRemoveRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    const updated = rows.filter((_, idx) => idx !== rowIdx);
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
      className={`relative p-2 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected ? 'ring-2 ring-blue-600' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico */}
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
        >
          <Grid3X3 className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'MATRIZ COMPARATIVA DE MODELOS & ESPECIFICAÇÕES'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddColumn();
          }}
          className="flex items-center gap-1 text-[9px] font-bold text-slate-700 hover:text-[#003366] px-2 py-0.5 border border-slate-300 rounded-none bg-slate-50 transition-colors no-print"
          data-editor-action="true"
          title="Adicionar coluna de modelo"
        >
          <Columns className="w-3 h-3" />
          <span>+ Coluna</span>
        </button>
      </div>

      {/* Grade de Precisão Industrial (Cantos Retos, 0.25pt/0.75pt) */}
      <div className="overflow-x-auto border border-slate-700 bg-white rounded-none shadow-none">
        <table className="w-full text-left border-collapse text-[11px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b-2 border-slate-900 text-slate-950 font-bold uppercase tracking-wider text-[10px]">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`py-2 px-2.5 border-r border-slate-300 last:border-r-0 group relative select-none ${
                    idx === 0 ? 'w-1/3' : 'text-center'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleUpdateColumnName(idx, e.currentTarget.innerText)}
                      className="outline-none focus:bg-amber-100 rounded-none px-0.5 block cursor-text flex-1"
                    >
                      {col}
                    </span>
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveColumn(idx);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 no-print"
                        data-editor-action="true"
                        title="Remover coluna"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="py-2 px-1 text-center w-8 text-slate-400 text-[9px] no-print" data-editor-action="true">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`transition-colors group hover:bg-slate-100/50 ${
                  rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                }`}
              >
                <td className="py-1.5 px-2.5 border-r border-slate-200 font-bold text-slate-900 align-middle">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleUpdateParam(rIdx, e.currentTarget.innerText)}
                    className="outline-none focus:bg-amber-100 rounded-none px-0.5 block cursor-text font-sans"
                  >
                    {row.param}
                  </span>
                </td>

                {row.values.map((val, vIdx) => (
                  <td
                    key={vIdx}
                    className="py-1.5 px-2.5 border-r border-slate-200 last:border-r-0 text-center align-middle"
                  >
                    <TechnicalCell
                      value={val}
                      isEditable={true}
                      onBlur={(newVal) => handleUpdateValue(rIdx, vIdx, newVal)}
                    />
                  </td>
                ))}

                <td className="py-1.5 px-1 text-center w-8 align-middle no-print" data-editor-action="true">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRow(rIdx);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 transition-opacity no-print"
                    data-editor-action="true"
                    title="Excluir especificação"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda Técnica */}
      <TechnicalLegend />

      {/* Rodapé de Ações do Editor */}
      <div className="mt-1.5 flex items-center justify-end no-print" data-editor-action="true">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddRow();
          }}
          className="flex items-center gap-1 text-[10px] font-bold text-white bg-[#003366] hover:bg-[#002244] px-2.5 py-1 rounded-none transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>+ Inserir Especificação</span>
        </button>
      </div>
    </div>
  );
};
