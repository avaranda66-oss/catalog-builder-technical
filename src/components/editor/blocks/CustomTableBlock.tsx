import React from 'react';
import { Grid3X3, Plus, Trash2 } from 'lucide-react';
import { ContentBlock, TableColumnConfig, CatalogTableRow } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface CustomTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const CustomTableBlock: React.FC<CustomTableBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();

  const columns: TableColumnConfig[] = block.tableColumns || [
    { key: 'col1', label: 'Item / Parâmetro', visible: true, width: 200 },
    { key: 'col2', label: 'Descrição / Valor', visible: true }
  ];

  const rows: CatalogTableRow[] = block.tableRows || [
    { id: 'crow-1', localOverrides: { col1: 'Temperatura de Operação', col2: '-40 a +85 °C' }, order: 0 },
    { id: 'crow-2', localOverrides: { col1: 'Grau de Proteção', col2: 'IP67 / NEMA 4X' }, order: 1 },
    { id: 'crow-3', localOverrides: { col1: 'Tempo de Resposta', col2: '< 100 ms' }, order: 2 }
  ];

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

  const handleAddColumn = () => {
    const customKey = `col_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: `Nova Coluna ${columns.length + 1}`,
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (columns.length <= 1) return;
    updateBlock(pageId, block.id, { tableColumns: columns.filter((c) => c.key !== colKey) });
  };

  const handleAddRow = () => {
    const newRow: CatalogTableRow = {
      id: `crow-${Date.now()}`,
      localOverrides: {},
      order: rows.length
    };
    updateBlock(pageId, block.id, { tableRows: [...rows, newRow] });
  };

  const handleRemoveRow = (rowId: string) => {
    updateBlock(pageId, block.id, { tableRows: rows.filter((r) => r.id !== rowId) });
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
          <Grid3X3 className="w-4 h-4 text-brand-600" />
          <span>{block.title || 'Tabela Customizada'}</span>
        </h3>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAddColumn();
          }}
          className="text-[10px] text-brand-700 hover:text-brand-900 font-medium px-2 py-0.5 border border-brand-200 bg-brand-50 rounded"
          title="Adicionar uma nova coluna personalizada"
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
                  <th key={col.key} className="py-2 px-2.5 border-r border-slate-200 last:border-r-0 group relative">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => handleColumnLabelBlur(col.key, e.currentTarget.innerText)}
                        className="outline-none focus:bg-amber-100 rounded px-1 block font-bold cursor-text flex-1"
                        title="Clique para renomear esta coluna"
                      >
                        {col.label}
                      </span>
                      {columns.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveColumn(col.key);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5"
                          title="Remover coluna"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
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
                        className="outline-none font-sans text-[11px] block px-1 py-0.5 rounded focus:bg-amber-50 focus:ring-1 focus:ring-amber-400"
                      >
                        {(row.localOverrides && row.localOverrides[col.key]) || 'Clique para editar'}
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
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>Inserir Linha</span>
        </button>
      </div>
    </div>
  );
};
