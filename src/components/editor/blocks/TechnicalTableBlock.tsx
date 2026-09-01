import React from 'react';
import { Plus, Columns, Table as TableIcon } from 'lucide-react';
import { ContentBlock, TableColumnConfig } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import { TechnicalTable } from '../../technical-table/TechnicalTable';
import { TableVisualFamily } from '../../technical-table/table-tokens';

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
  const family: TableVisualFamily = (block.customData?.tableFamily as TableVisualFamily) || 'monochrome';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
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
      {/* Header Técnico da Tabela */}
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
        <h3
          contentEditable
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5"
        >
          <TableIcon className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'Tabela de Especificações Técnicas'}</span>
        </h3>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddCustomColumn();
            }}
            className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-[#003366] font-medium px-2 py-0.5 border border-slate-300 rounded-none bg-slate-50 transition-colors"
            title="Adicionar coluna personalizada"
          >
            <Columns className="w-3 h-3 text-[#003366]" />
            <span>+ Coluna</span>
          </button>
        </div>
      </div>

      {/* Motor Unificado de Tabela Técnica */}
      <TechnicalTable
        columns={columns}
        rows={rows}
        getProduct={getProduct}
        family={family}
        isEditable={true}
        onUpdateCell={(rowId, colKey, newVal) => updateCellOverride(block.id, rowId, colKey, newVal)}
        onRestoreCell={(rowId, colKey) => restoreCellToLibrary(block.id, rowId, colKey)}
        onRemoveRow={(rowId) => removeRowFromTable(block.id, rowId)}
        onRemoveColumn={handleRemoveColumn}
        onRenameColumn={handleColumnLabelBlur}
      />

      {/* Rodapé da Tabela: Inserir Produtos */}
      <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-200">
        <span className="text-[10px] text-slate-500 font-mono">
          {rows.length} modelo(s) metrológico(s) na tabela
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAddProductToTableModal(block.id);
          }}
          className="flex items-center gap-1 text-[10px] font-bold text-white bg-[#003366] hover:bg-[#002244] px-2.5 py-1 rounded-none shadow-none transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>+ Adicionar Produto da Biblioteca</span>
        </button>
      </div>
    </div>
  );
};
