import React from 'react';
import { Plus, Trash2, Columns, Table as TableIcon } from 'lucide-react';
import { ContentBlock, TableColumnConfig } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import { getEffectiveValue, getFieldDivergence } from '../../../domain/divergence';
import { DivergenceBadge } from '../../common/DivergenceBadge';

interface TechnicalTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const TechnicalTableBlock: React.FC<TechnicalTableBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const {
    setSelectedBlockId,
    updateBlock,
    updateCellOverride,
    restoreCellToLibrary,
    removeRowFromTable
  } = useCatalogStore();

  const { getProduct } = useLibraryStore();
  const { openAddProductToTableModal } = useUIStore();

  const columns: TableColumnConfig[] = block.tableColumns || [];
  const rows = block.tableRows || [];

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText });
  };

  const handleColumnLabelBlur = (colKey: string, newLabel: string) => {
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleAddCustomColumn = () => {
    const customKey = `custom_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: 'Nova Coluna',
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (columns.length <= 1) return;
    updateBlock(pageId, block.id, { tableColumns: columns.filter((c) => c.key !== colKey) });
  };

  const handleCellBlur = (
    rowId: string,
    fieldKey: string,
    e: React.FocusEvent<HTMLSpanElement>
  ) => {
    const text = e.currentTarget.innerText.trim();
    updateCellOverride(block.id, rowId, fieldKey, text);
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
      {/* Header da Tabela Técnica */}
      <div className="flex items-center justify-between mb-2">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded px-1 flex items-center gap-1.5"
        >
          <TableIcon className="w-4 h-4 text-brand-600" />
          <span>{block.title || 'Tabela de Especificações Técnicas'}</span>
        </h3>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddCustomColumn();
            }}
            className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-brand-700 font-medium px-2 py-0.5 border border-slate-200 hover:border-brand-300 rounded bg-slate-50 transition-colors"
            title="Adicionar coluna personalizada para este catálogo"
          >
            <Columns className="w-3 h-3 text-brand-600" />
            <span>+ Coluna</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-slate-300 shadow-sm bg-white">
        <table className="w-full text-left border-collapse text-[11px] font-sans">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              {columns
                .filter((c) => c.visible !== false)
                .map((col) => (
                  <th
                    key={col.key}
                    className="py-2 px-2.5 border-r border-slate-200 last:border-r-0 group relative"
                    style={{ width: col.width ? `${col.width}px` : 'auto' }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => handleColumnLabelBlur(col.key, e.currentTarget.innerText)}
                        className="outline-none focus:bg-amber-100 rounded px-1 block font-bold cursor-text flex-1"
                        title="Clique para renomear o cabeçalho desta coluna"
                      >
                        {col.label}
                      </span>
                      {col.isCustom && (
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
              <th className="py-2 px-2 text-center w-10 text-slate-400">#</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, idx) => {
              const product = row.productRefId ? getProduct(row.productRefId) : undefined;

              return (
                <tr
                  key={row.id}
                  className={`hover:bg-slate-50/70 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                  }`}
                >
                  {columns
                    .filter((c) => c.visible !== false)
                    .map((col) => {
                      const effectiveVal = getEffectiveValue(row, product, col.key);
                      const divergence = getFieldDivergence(row, product, col.key);

                      return (
                        <td
                          key={col.key}
                          className="py-1.5 px-2.5 border-r border-slate-200 last:border-r-0 align-middle text-slate-900 group relative"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => handleCellBlur(row.id, col.key, e)}
                              className={`outline-none font-mono text-[11px] flex-1 px-1 py-0.5 rounded focus:bg-amber-50 focus:ring-1 focus:ring-amber-400 ${
                                divergence?.hasDivergence ? 'font-semibold text-amber-900' : ''
                              }`}
                            >
                              {effectiveVal || '—'}
                            </span>

                            {divergence && (
                              <DivergenceBadge
                                divergence={divergence}
                                onRestore={() => restoreCellToLibrary(block.id, row.id, col.key)}
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}

                  <td className="py-1.5 px-1 text-center align-middle">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRowFromTable(block.id, row.id);
                      }}
                      className="text-slate-300 hover:text-red-600 p-1 rounded transition-colors"
                      title="Remover linha da tabela"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-6 text-center text-slate-400 italic text-xs"
                >
                  Nenhum produto inserido nesta tabela. Clique no botão abaixo para selecionar da biblioteca.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex justify-start">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAddProductToTableModal(block.id);
          }}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Inserir Produto da Biblioteca</span>
        </button>
      </div>
    </div>
  );
};
