import React from 'react';
import { Grid3X3, Plus, Columns } from 'lucide-react';
import { ContentBlock, TableColumnConfig, CatalogTableRow } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { TechnicalTable } from '../../technical-table/TechnicalTable';
import { TableVisualFamily } from '../../technical-table/table-tokens';

interface CustomTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const CustomTableBlock: React.FC<CustomTableBlockProps> = ({
  block,
  pageId,
  isSelected,
  isExport
}) => {
  const { updateBlock, setSelectedBlockId, updateCellOverride } = useCatalogStore();
  const { getProduct } = useLibraryStore();

  const columns: TableColumnConfig[] = block.tableColumns || [
    { key: 'col1', label: 'Item / Parâmetro', visible: true, width: 200 },
    { key: 'col2', label: 'Descrição / Especificação', visible: true }
  ];

  const rows: CatalogTableRow[] = block.tableRows || [
    { id: 'crow-1', localOverrides: { col1: 'Temperatura de Operação', col2: '-40 a +85 °C' }, order: 0 },
    { id: 'crow-2', localOverrides: { col1: 'Grau de Proteção', col2: 'IP67 / NEMA 4X' }, order: 1 },
    { id: 'crow-3', localOverrides: { col1: 'Tempo de Resposta', col2: '< 100 ms' }, order: 2 }
  ];

  const family: TableVisualFamily = (block.customData?.tableFamily as TableVisualFamily) || 'monochrome';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    if (isExport) return;
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleColumnLabelBlur = (colKey: string, newLabel: string) => {
    if (isExport) return;
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleAddColumn = () => {
    if (isExport) return;
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
    if (isExport || columns.length <= 1) return;
    updateBlock(pageId, block.id, { tableColumns: columns.filter((c) => c.key !== colKey) });
  };

  const handleAddRow = () => {
    if (isExport) return;
    const newRow: CatalogTableRow = {
      id: `crow-${Date.now()}`,
      localOverrides: {
        col1: 'Novo Parâmetro',
        col2: 'Valor ou Especificação'
      },
      order: rows.length
    };
    updateBlock(pageId, block.id, { tableRows: [...rows, newRow] });
  };

  const handleRemoveRow = (rowId: string) => {
    if (isExport) return;
    updateBlock(pageId, block.id, { tableRows: rows.filter((r) => r.id !== rowId) });
  };

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-2 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected && !isExport ? 'ring-2 ring-blue-600' : isExport ? 'shadow-none' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico */}
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
        <h3
          contentEditable={!isExport}
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
        >
          <Grid3X3 className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'TABELA PERSONALIZADA DE ESPECIFICAÇÕES'}</span>
        </h3>

        {!isExport && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAddColumn();
            }}
            className="flex items-center gap-1 text-[9px] font-bold text-slate-700 hover:text-[#003366] px-2 py-0.5 border border-slate-300 rounded-none bg-slate-50 transition-colors no-print"
            data-editor-action="true"
            title="Adicionar coluna"
          >
            <Columns className="w-3 h-3" />
            <span>+ Coluna</span>
          </button>
        )}
      </div>

      {/* Motor Unificado de Tabela */}
      <TechnicalTable
        columns={columns}
        rows={rows}
        getProduct={getProduct}
        family={family}
        isEditable={!isExport}
        onUpdateCell={(rowId, colKey, newVal) => updateCellOverride(block.id, rowId, colKey, newVal)}
        onRemoveRow={handleRemoveRow}
        onRemoveColumn={handleRemoveColumn}
        onRenameColumn={handleColumnLabelBlur}
      />

      {/* Rodapé de Ações do Editor */}
      {!isExport && (
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
            <span>+ Inserir Linha</span>
          </button>
        </div>
      )}
    </div>
  );
};
