import React from 'react';
import { Plus, Columns, Table as TableIcon } from 'lucide-react';
import { ContentBlock, TableColumnConfig } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { useUIStore } from '../../../stores/useUIStore';
import { TechnicalTable } from '../../technical-table/TechnicalTable';
import { TechnicalLegend } from '../../technical-table/TechnicalLegend';
import { TableVisualFamily } from '../../technical-table/table-tokens';
import { adaptLegacyBlockToTableCore } from '../../../domain/table-core';
import { isTableRowVisuallyEmpty } from '../../../domain/table-core/table.empty-row-policy';
import { TableCoreRenderer } from '../table-core';

interface TechnicalTableBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const TechnicalTableBlock: React.FC<TechnicalTableBlockProps> = ({
  block,
  pageId,
  isExport
}) => {
  const {
    selectedBlockId,
    selectedChildId,
    selectEditorElement,
    updateBlock,
    updateCellOverride,
    restoreCellToLibrary,
    removeRowFromTable,
    getTableDatumResolver
  } = useCatalogStore();

  const { getProduct } = useLibraryStore();
  const { openAddProductToTableModal, tablePresentationDraft } = useUIStore();

  const columns: TableColumnConfig[] = block.tableColumns || [];
  const rows = block.tableRows || [];
  const family: TableVisualFamily = (block.style?.family as TableVisualFamily) || 'monochrome';

  // Pilot Table Core V2 para specs_table (CORE.T2B.1 / CORE.T2C.1)
  const isPilotSpecsTable = block.type === 'specs_table';
  const pilotAdaptResult = isPilotSpecsTable ? adaptLegacyBlockToTableCore(block) : null;
  const adaptedTable = (pilotAdaptResult && pilotAdaptResult.supported) ? pilotAdaptResult.table : null;
  if (adaptedTable && tablePresentationDraft && tablePresentationDraft.blockId === block.id) {
    adaptedTable.presentation = tablePresentationDraft.presentation;
  }
  const useTableCorePilot = Boolean(isPilotSpecsTable && adaptedTable);
  const isSelected = selectedBlockId === block.id;
  const selectedCellId = isSelected && !isExport ? selectedChildId : undefined;

  const resolveDatum = getTableDatumResolver();
  const hasVisibleRows = adaptedTable
    ? adaptedTable.rows
        .filter((r) => !r.isHeader && r.kind !== 'header' && r.kind !== 'footer')
        .some((r) => !isTableRowVisuallyEmpty(r, adaptedTable.columns, adaptedTable.cells, resolveDatum))
    : rows.length > 0;

  // Emenda 3: No EXPORT/PDF, se não existem rows semanticamente visíveis, omitir a tabela vazia
  if (isExport && !hasVisibleRows && useTableCorePilot) {
    return null;
  }

  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    if (isExport) return;
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleColumnLabelBlur = (colKey: string, newLabel: string) => {
    if (isExport) return;
    const updated = columns.map((c) => (c.key === colKey ? { ...c, label: newLabel } : c));
    updateBlock(pageId, block.id, { tableColumns: updated });
  };

  const handleAddCustomColumn = () => {
    if (isExport) return;
    const customKey = `custom_${Date.now()}`;
    const newCol: TableColumnConfig = {
      key: customKey,
      label: 'NOVA COLUNA',
      visible: true,
      isCustom: true
    };
    updateBlock(pageId, block.id, { tableColumns: [...columns, newCol] });
  };

  const handleRemoveColumn = (colKey: string) => {
    if (isExport || columns.length <= 1) return;
    updateBlock(pageId, block.id, { tableColumns: columns.filter((c) => c.key !== colKey) });
  };

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        selectEditorElement({ blockId: block.id, childId: null });
      }}
      className={`relative p-2 bg-white rounded-none border border-slate-300 transition-all ${
        isSelected && !isExport ? 'ring-2 ring-blue-600' : isExport ? 'shadow-none' : 'hover:border-slate-400'
      }`}
    >
      {/* Header Técnico da Tabela */}
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
        <h3
          data-printable-field="title"
          contentEditable={!isExport}
          suppressContentEditableWarning
          onBlur={handleTitleBlur}
          className="text-xs font-bold text-slate-900 uppercase tracking-wider outline-none focus:bg-slate-100 rounded-none px-1 flex items-center gap-1.5"
        >
          <TableIcon className="w-3.5 h-3.5 text-[#003366]" />
          <span>{block.title || 'Tabela de Especificações Técnicas'}</span>
        </h3>

        {!isExport && (
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
        )}
      </div>

      {/* Motor de Tabela: Table Core V2 Pilot para specs_table, fallback seguro para TechnicalTable */}
      {useTableCorePilot && adaptedTable && pilotAdaptResult?.supported ? (
        <div className="w-full">
          <TableCoreRenderer
            table={pilotAdaptResult.table}
            mode={isExport ? 'export' : 'editor'}
            suppressEmptyRows={true}
            selectedCellId={selectedCellId ?? undefined}
            onSelectCell={
              isExport
                ? undefined
                : (cellId) => {
                    selectEditorElement({ blockId: block.id, childId: cellId });
                  }
            }
            resolveDatum={getTableDatumResolver()}
            getHeaderPrintableField={(col) => `col_${col.semanticKey}_label`}
            getCellPrintableField={(_cell, row, col) => {
              const mapping = pilotAdaptResult.bridge.getByCoordinates(row.id, col.id);
              if (!mapping) return undefined;
              return `row_${mapping.legacyRowId}_ov_${mapping.legacyColKey}`;
            }}
          />
          {!hasVisibleRows && !isExport && (
            <div
              data-testid="zero-visible-rows-placeholder"
              className="my-3 py-6 px-4 text-center bg-slate-50 border border-dashed border-slate-300 rounded text-slate-500"
            >
              <p className="text-xs font-semibold text-slate-700">Nenhuma linha preenchida</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Adicione uma linha no painel lateral.</p>
            </div>
          )}
          {block.customData?.showLegend && (
            <TechnicalLegend
              config={{
                showLegend: true,
                title: block.customData?.legendTitle || 'LEGEND:',
                items: block.customData?.legendLabels
                  ? Object.entries(block.customData.legendLabels).map(([type, label]) => ({
                      type: type as any,
                      label: String(label)
                    }))
                  : undefined
              }}
              isEditable={!isExport}
              onUpdateLegendTitle={(newTitle) =>
                updateBlock(pageId, block.id, {
                  customData: { ...(block.customData || {}), legendTitle: newTitle }
                })
              }
              onUpdateLegendItem={(markerType, newLabel) => {
                const currentLabels = block.customData?.legendLabels || {
                  filled_square: 'Item included in standard configuration',
                  empty_square: 'Item not selected / available as optional',
                  asterisk: 'Refer to technical footnote (*)',
                  dash: 'Not applicable for this model'
                };
                updateBlock(pageId, block.id, {
                  customData: {
                    ...(block.customData || {}),
                    legendLabels: {
                      ...currentLabels,
                      [markerType]: newLabel
                    }
                  }
                });
              }}
            />
          )}
        </div>
      ) : (
        <TechnicalTable
          columns={columns}
          rows={rows}
          getProduct={getProduct}
          family={family}
          isEditable={!isExport}
          legendConfig={{
            showLegend: block.customData?.showLegend ?? true,
            title: block.customData?.legendTitle || 'LEGEND:',
            items: block.customData?.legendLabels
              ? Object.entries(block.customData.legendLabels).map(([type, label]) => ({
                  type: type as any,
                  label: String(label)
                }))
              : undefined
          }}
          onToggleLegend={(show) =>
            updateBlock(pageId, block.id, {
              customData: { ...(block.customData || {}), showLegend: show }
            })
          }
          onUpdateLegendTitle={(newTitle) =>
            updateBlock(pageId, block.id, {
              customData: { ...(block.customData || {}), legendTitle: newTitle }
            })
          }
          onUpdateLegendItem={(markerType, newLabel) => {
            const currentLabels = block.customData?.legendLabels || {
              filled_square: 'Item included in standard configuration',
              empty_square: 'Item not selected / available as optional',
              asterisk: 'Refer to technical footnote (*)',
              dash: 'Not applicable for this model'
            };
            updateBlock(pageId, block.id, {
              customData: {
                ...(block.customData || {}),
                legendLabels: {
                  ...currentLabels,
                  [markerType]: newLabel
                }
              }
            });
          }}
          onUpdateCell={(rowId, colKey, newVal) => updateCellOverride(block.id, rowId, colKey, newVal)}
          onRestoreCell={(rowId, colKey) => restoreCellToLibrary(block.id, rowId, colKey)}
          onRemoveRow={(rowId) => removeRowFromTable(block.id, rowId)}
          onRemoveColumn={handleRemoveColumn}
          onRenameColumn={handleColumnLabelBlur}
        />
      )}

      {/* Rodapé da Tabela: Inserir Produtos (Apenas no Modo Editor) */}
      {!isExport && (
        <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-200 no-print" data-editor-action="true">
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
      )}
    </div>
  );
};
