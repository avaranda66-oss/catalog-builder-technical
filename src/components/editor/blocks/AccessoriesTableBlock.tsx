import React from 'react';
import { Package, Plus, Columns } from 'lucide-react';
import { ContentBlock, TableColumnConfig, CatalogTableRow } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { TechnicalTable } from '../../technical-table/TechnicalTable';
import { TableVisualFamily } from '../../technical-table/table-tokens';
import { removeLegacyTableColumn } from '../../../domain/table-core';

interface AccessoriesTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const AccessoriesTableBlock: React.FC<AccessoriesTableBlockProps> = ({
  block,
  pageId,
  isSelected,
  isExport
}) => {
  const { updateBlock, setSelectedBlockId, updateCellOverride } = useCatalogStore();
  const { getProduct } = useLibraryStore();

  const columns: TableColumnConfig[] = block.tableColumns || [
    { key: 'codigo', label: 'Código do Acessório', visible: true, width: 140 },
    { key: 'descricao', label: 'Descrição do Componente', visible: true },
    { key: 'tipo', label: 'Fornecimento', visible: true, width: 120 }
  ];

  const rows: CatalogTableRow[] = block.tableRows || [
    {
      id: 'arow-1',
      localOverrides: {
        codigo: 'PRESYS-MNF-2V',
        descricao: 'Válvula Manifold de 2 Vias em Inox 316',
        tipo: 'Opcional'
      }
    }
  ];

  const family: TableVisualFamily = (block.customData?.tableFamily as TableVisualFamily) || 'family_header';

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    if (isExport) return;
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleColumnLabelBlur = (colKey: string, newLabel: string) => {
    if (isExport) return;
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleAddRow = () => {
    const newRow: CatalogTableRow = {
      id: `arow-${Date.now()}`,
      localOverrides: {
        codigo: 'PRESYS-NOVO-ACC',
        descricao: 'Novo acessório ou kit de conexão de alta pressão',
        tipo: 'Opcional'
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
      label: 'Nova Informação',
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (columns.length <= 1) return;
    updateBlock(pageId, block.id, removeLegacyTableColumn(block, columns, colKey));
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
          data-printable-field="title"
          contentEditable={!isExport}
          suppressContentEditableWarning
          onBlur={isExport ? undefined : handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5 cursor-text"
        >
          <Package className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'TABELA DE ACESSÓRIOS & OPCIONAIS PRESYS'}</span>
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
            title="Adicionar coluna técnica"
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
        onUpdateCell={
          isExport
            ? undefined
            : (rowId, colKey, newVal) => updateCellOverride(block.id, rowId, colKey, newVal)
        }
        onRemoveRow={isExport ? undefined : handleRemoveRow}
        onRemoveColumn={isExport ? undefined : handleRemoveColumn}
        onRenameColumn={isExport ? undefined : handleColumnLabelBlur}
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
            <span>+ Inserir Linha de Acessório</span>
          </button>
        </div>
      )}
    </div>
  );
};
