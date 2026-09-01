import React from 'react';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { ContentBlock, TableColumnConfig, CatalogTableRow } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface ElectricalTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const ElectricalTableBlock: React.FC<ElectricalTableBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const columns: TableColumnConfig[] = block.tableColumns || [
    { key: 'sinal', label: 'Sinal de Saída', visible: true },
    { key: 'alimentacao', label: 'Alimentação', visible: true },
    { key: 'carga', label: 'Carga Máxima', visible: true },
    { key: 'isolacao', label: 'Isolação', visible: true }
  ];

  const rows: CatalogTableRow[] = block.tableRows || [];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText });
  };

  const handleColumnLabelBlur = (colKey: string, newLabel: string) => {
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleCellBlur = (rowId: string, colKey: string, value: string) => {
    const updatedRows = rows.map((r) =>
      r.id === rowId ? { ...r, localOverrides: { ...(r.localOverrides || {}), [colKey]: value } } : r
    );
    updateBlock(pageId, block.id, { tableRows: updatedRows });
  };

  const handleAddRow = () => {
    const newRow: CatalogTableRow = {
      id: `erow-${Date.now()}`,
      localOverrides: {
        sinal: '4-20 mA Corrente',
        alimentacao: '24 Vdc',
        carga: '500 Ω',
        isolacao: '1000 Vrms'
      },
      order: rows.length
    };
    updateBlock(pageId, block.id, { tableRows: [...rows, newRow] });
  };

  const handleRemoveRow = (rowId: string) => {
    updateBlock(pageId, block.id, { tableRows: rows.filter((r) => r.id !== rowId) });
  };

  const handleAddColumn = () => {
    const customKey = `col_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: 'Nova Especificação',
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 rounded-xl border border-slate-200 bg-white shadow-sm transition-all ${
        isSelected ? 'ring-2 ring-brand-500 bg-brand-50/20' : 'hover:ring-1 hover:ring-slate-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded px-1 flex items-center gap-1.5"
        >
          <Zap className="w-4 h-4 text-amber-500" />
          <span>{block.title || 'Tabela de Sinais Elétricos & Conectividade'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddColumn();
          }}
          className="text-[10px] text-slate-600 hover:text-brand-600 font-medium px-2 py-0.5 border border-slate-200 hover:border-brand-300 rounded bg-slate-50 transition-colors"
          title="Adicionar uma nova coluna técnica"
        >
          + Coluna
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full text-left border-collapse text-[11px] font-sans">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              {columns
                .filter((c) => c.visible !== false)
                .map((col) => (
                  <th key={col.key} className="py-2 px-2.5 border-r border-slate-200 last:border-r-0">
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleColumnLabelBlur(col.key, e.currentTarget.innerText)}
                      className="outline-none focus:bg-amber-100 rounded px-1 block font-bold cursor-text"
                      title="Clique para renomear esta coluna"
                    >
                      {col.label}
                    </span>
                  </th>
                ))}
              <th className="py-2 px-1 text-center w-8 text-slate-400">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={`hover:bg-slate-50/70 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
              >
                {columns
                  .filter((c) => c.visible !== false)
                  .map((col) => (
                    <td
                      key={col.key}
                      className="py-1.5 px-2.5 border-r border-slate-100 last:border-r-0 align-middle text-slate-800"
                    >
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => handleCellBlur(row.id, col.key, e.currentTarget.innerText)}
                        className="outline-none font-mono text-[11px] block px-1 py-0.5 rounded focus:bg-amber-50 focus:ring-1 focus:ring-amber-400"
                      >
                        {(row.localOverrides && row.localOverrides[col.key]) || '—'}
                      </span>
                    </td>
                  ))}
                <td className="py-1.5 px-1 text-center align-middle">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRow(row.id);
                    }}
                    className="text-slate-300 hover:text-red-600 p-0.5 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex justify-start">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddRow();
          }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Inserir Linha Elétrica</span>
        </button>
      </div>
    </div>
  );
};
