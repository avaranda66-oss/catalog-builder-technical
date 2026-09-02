import React, { useState } from 'react';
import { TableColumnConfig, CatalogTableRow } from '../../domain/catalog.schema';
import { TABLE_VISUAL_FAMILIES, TableVisualFamily } from './table-tokens';
import { TechnicalCell } from './TechnicalCell';
import { TechnicalLegend, TableLegendConfig } from './TechnicalLegend';
import { getEffectiveValue, getFieldDivergence } from '../../domain/divergence';
import { Product } from '../../domain/product.schema';
import { Trash2, BookOpen } from 'lucide-react';

export interface ColumnGroupConfig {
  id: string;
  title: string;
  colSpan: number;
}

interface TechnicalTableProps {
  columns: TableColumnConfig[];
  rows: CatalogTableRow[];
  getProduct: (id: string) => Product | undefined;
  family?: TableVisualFamily;
  columnGroups?: ColumnGroupConfig[];
  legendConfig?: TableLegendConfig;
  isEditable?: boolean;
  onUpdateCell?: (rowId: string, colKey: string, newVal: string) => void;
  onRestoreCell?: (rowId: string, colKey: string) => void;
  onRemoveRow?: (rowId: string) => void;
  onRemoveColumn?: (colKey: string) => void;
  onRenameColumn?: (colKey: string, newLabel: string) => void;
  onToggleLegend?: (show: boolean) => void;
  onUpdateLegendItem?: (markerType: any, newLabel: string) => void;
  onUpdateLegendTitle?: (newTitle: string) => void;
  className?: string;
}

export const TechnicalTable: React.FC<TechnicalTableProps> = ({
  columns,
  rows,
  getProduct,
  family = 'monochrome',
  columnGroups,
  legendConfig,
  isEditable = true,
  onUpdateCell,
  onRestoreCell,
  onRemoveRow,
  onRemoveColumn,
  onRenameColumn,
  onToggleLegend,
  onUpdateLegendItem,
  onUpdateLegendTitle,
  className = ''
}) => {
  const tokens = TABLE_VISUAL_FAMILIES[family] || TABLE_VISUAL_FAMILIES.monochrome;
  const visibleColumns = columns.filter((c) => c.visible !== false);

  // Legenda é opcional — o estado inicial vem do config externo (default: oculta)
  const [showLegend, setShowLegend] = useState(legendConfig?.showLegend ?? false);

  const handleToggleLegend = () => {
    const next = !showLegend;
    setShowLegend(next);
    onToggleLegend?.(next);
  };

  return (
    <div className={`w-full overflow-hidden rounded-none select-none ${className}`}>
      <div className={`overflow-x-auto ${tokens.borderOuter} bg-white rounded-none shadow-none`}>
        <table className="w-full text-left border-collapse text-[11px] font-sans">
          {/* Cabeçalho de Grupos Superiores (Opcional) */}
          {columnGroups && columnGroups.length > 0 && (
            <thead>
              <tr className="bg-slate-200/90 border-b border-slate-300 text-slate-900 font-black text-[9px] uppercase tracking-wider text-center">
                {columnGroups.map((grp) => (
                  <th
                    key={grp.id}
                    colSpan={grp.colSpan}
                    className="py-1 px-2 border-r border-slate-300 last:border-r-0"
                  >
                    {grp.title}
                  </th>
                ))}
                {isEditable && onRemoveRow && <th className="w-8 border-l border-slate-300"></th>}
              </tr>
            </thead>
          )}

          {/* Cabeçalho Principal de Colunas */}
          <thead>
            <tr className={`${tokens.headerBg} ${tokens.borderHeader} ${tokens.headerTextColor} ${tokens.headerFontWeight} text-[10px]`}>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className="py-2 px-2.5 border-r border-slate-300/80 last:border-r-0 group relative select-none"
                  style={{ width: col.width ? `${col.width}px` : 'auto' }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      data-printable-field={`col:${col.key}`}
                      contentEditable={isEditable && Boolean(onRenameColumn)}
                      suppressContentEditableWarning
                      onBlur={(e) => onRenameColumn?.(col.key, e.currentTarget.innerText.trim())}
                      className="outline-none focus:bg-white/20 px-1 rounded-none select-text cursor-text"
                    >
                      {col.label}
                    </span>
                    {isEditable && col.isCustom && onRemoveColumn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveColumn(col.key);
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
              {isEditable && onRemoveRow && (
                <th className="py-2 px-1 text-center w-8 text-slate-400 text-[9px]">#</th>
              )}
            </tr>
          </thead>

          {/* Linhas de Dados */}
          <tbody className="divide-y divide-slate-200">
            {rows.map((row, idx) => {
              const product = row.productRefId ? getProduct(row.productRefId) : undefined;
              const isEven = idx % 2 === 0;

              return (
                <tr
                  key={row.id}
                  className={`transition-colors group hover:bg-slate-100/50 ${
                    isEven ? 'bg-white' : tokens.zebraBg
                  }`}
                >
                  {visibleColumns.map((col) => {
                    const effectiveVal = getEffectiveValue(row, product, col.key);
                    const divergence = getFieldDivergence(row, product, col.key);

                    return (
                      <td
                        key={col.key}
                        data-printable-field={`cell:${row.id}:${col.key}`}
                        className="py-1.5 px-2.5 border-r border-slate-200 last:border-r-0 align-middle"
                      >
                        <TechnicalCell
                          value={effectiveVal}
                          divergence={divergence || undefined}
                          isEditable={isEditable}
                          onBlur={(newVal) => onUpdateCell?.(row.id, col.key, newVal)}
                          onRestoreDivergence={() => onRestoreCell?.(row.id, col.key)}
                        />
                      </td>
                    );
                  })}

                  {/* Ação de exclusão de linha */}
                  {isEditable && onRemoveRow && (
                    <td className="py-1.5 px-1 text-center w-8 align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveRow(row.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-0.5 transition-opacity"
                        title="Remover esta linha da tabela"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda Técnica — Opcional e Togglável */}
      <div className="flex items-center justify-between mt-1">
        {showLegend ? (
          <TechnicalLegend
            config={{ ...legendConfig, showLegend: true }}
            onUpdateLegendItem={onUpdateLegendItem}
            onUpdateLegendTitle={onUpdateLegendTitle}
            isEditable={isEditable}
          />
        ) : (
          <div />
        )}

        {isEditable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleLegend();
            }}
            className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-none border transition-colors no-print ${
              showLegend
                ? 'text-[#003366] bg-blue-50 border-blue-300 hover:bg-blue-100'
                : 'text-slate-500 bg-slate-50 border-slate-300 hover:bg-slate-100'
            }`}
            data-editor-action="true"
            title={showLegend ? 'Ocultar legenda de marcadores' : 'Exibir legenda de marcadores'}
          >
            <BookOpen className="w-3 h-3" />
            <span>{showLegend ? 'Ocultar Legenda' : 'Exibir Legenda'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
