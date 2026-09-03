// src/components/editor/table-core/TableCoreRenderer.tsx
// Renderizador Canônico Compartilhado de Tabelas Técnicas (Table Core V2 - Fase CORE.T2A).
// Suporta modos 'editor' e 'export' sem duplicação de lógica nem mutações de estado.
// Zero explicit any.

import React from 'react';
import {
  TableCellContent,
  TableCellLiteralContent,
  TableCellModel,
  TableColumnModel,
  TableRowModel,
  getCellKey
} from '../../../domain/table-core/table.types';
import { resolveColumnWidthsMm } from '../../../domain/table-core/table.geometry';
import {
  TableCoreRendererProps,
  TableAssetResolver,
  TableDatumResolver,
  TableCoreRendererMode
} from './table-renderer.types';
import {
  getBackgroundColorClass,
  getTextColorClass,
  getDensityClasses,
  getBorderClasses,
  getStripeClass
} from './table-tokens';

/**
 * Renderiza o conteúdo literal de uma célula de forma pura.
 */
function renderLiteralContent(
  content: TableCellLiteralContent,
  mode: TableCoreRendererMode,
  resolveAsset?: TableAssetResolver
): React.ReactNode {
  switch (content.kind) {
    case 'empty':
      return null;

    case 'text':
      return <span>{content.text}</span>;

    case 'number': {
      const decimals = content.format?.decimals;
      const formattedNumber =
        typeof decimals === 'number'
          ? content.value.toFixed(decimals)
          : String(content.value);
      const prefix = content.format?.prefix ?? '';
      const suffix = content.format?.suffix ?? '';
      return <span>{`${prefix}${formattedNumber}${suffix}`}</span>;
    }

    case 'value_unit': {
      const qualifier = content.qualifier ? `${content.qualifier} ` : '';
      return <span>{`${qualifier}${content.amount} ${content.unit}`}</span>;
    }

    case 'badge': {
      let badgeColorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
      if (content.variant === 'info') {
        badgeColorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
      } else if (content.variant === 'success') {
        badgeColorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      } else if (content.variant === 'warning') {
        badgeColorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (content.variant === 'critical') {
        badgeColorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
      }

      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${badgeColorClasses}`}
        >
          {content.label}
        </span>
      );
    }

    case 'asset_reference': {
      const resolved = resolveAsset ? resolveAsset(content.assetId) : undefined;
      if (resolved && resolved.url) {
        const alt = content.altText || content.caption || resolved.altText || '';
        const style: React.CSSProperties = {};
        if (content.targetWidthMm) style.maxWidth = `${content.targetWidthMm}mm`;
        if (content.targetHeightMm) style.maxHeight = `${content.targetHeightMm}mm`;

        return (
          <img
            src={resolved.url}
            alt={alt}
            style={style}
            className="inline-block object-contain"
          />
        );
      }

      // Se o asset não foi resolvido, NUNCA renderizar tag <img> quebrada
      if (mode === 'editor') {
        return (
          <span className="text-slate-400 italic text-[9px]">
            [Mídia: {content.assetId}]
          </span>
        );
      }
      return null;
    }
  }
}

/**
 * Renderizador de conteúdo de célula com suporte a bindings e literais.
 */
function renderCellContent(
  content: TableCellContent,
  mode: TableCoreRendererMode,
  resolveAsset?: TableAssetResolver,
  resolveDatum?: TableDatumResolver
): React.ReactNode {
  if (content.kind === 'datum_reference') {
    if (content.bindingMode === 'snapshot' && content.snapshot) {
      return renderLiteralContent(content.snapshot, mode, resolveAsset);
    }

    if (content.bindingMode === 'live') {
      const resolved = resolveDatum ? resolveDatum(content) : undefined;
      if (resolved) {
        return renderLiteralContent(resolved.value, mode, resolveAsset);
      }

      // Unresolved fallback
      if (mode === 'editor') {
        return (
          <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[9px] border border-amber-200 font-mono">
            [Pendente: {content.datumKey}]
          </span>
        );
      }
      return content.snapshot
        ? renderLiteralContent(content.snapshot, mode, resolveAsset)
        : null;
    }

    if (content.bindingMode === 'review_required') {
      if (content.snapshot) {
        return (
          <span className={mode === 'editor' ? 'relative' : ''}>
            {renderLiteralContent(content.snapshot, mode, resolveAsset)}
            {mode === 'editor' && (
              <span
                title="Revisão necessária para este dado"
                className="ml-1 text-[8px] text-amber-500 font-bold"
              >
                *
              </span>
            )}
          </span>
        );
      }
    }
  }

  return renderLiteralContent(content as TableCellLiteralContent, mode, resolveAsset);
}

export const TableCoreRenderer: React.FC<TableCoreRendererProps> = ({
  table,
  mode = 'editor',
  resolveAsset,
  resolveDatum,
  selectedCellId,
  onSelectCell,
  className = ''
}) => {
  // 1. Resolução geométrica pura em mm
  const geometryResult = resolveColumnWidthsMm(table);
  const columnWidthMap = new Map<string, number>(
    geometryResult.columns.map((c) => [c.columnId, c.widthMm])
  );

  // 2. Extração e mapeamento de estilos de apresentação
  const { presentation } = table;
  const headerBgClass = getBackgroundColorClass(presentation.headerBackgroundToken);
  const headerTextClass = getTextColorClass(presentation.headerTextColorToken);
  const density = getDensityClasses(presentation.density);
  const borders = getBorderClasses(presentation.borderStyle);
  const stripe = getStripeClass(presentation.stripeStyle);

  // 3. Largura total do container da tabela
  const tableContainerStyle: React.CSSProperties = {
    boxSizing: 'border-box'
  };
  if (presentation.tableWidth.mode === 'fixed_mm') {
    tableContainerStyle.width = `${presentation.tableWidth.widthMm}mm`;
  } else {
    tableContainerStyle.width = '100%';
  }

  // 4. Separação de linhas estruturais
  const explicitHeaderRows = table.rows.filter(
    (r) => r.isHeader === true || r.kind === 'header'
  );
  const dataRows = table.rows.filter(
    (r) => !r.isHeader && r.kind !== 'header' && r.kind !== 'footer'
  );
  const footerRows = table.rows.filter((r) => r.kind === 'footer');

  // Renderiza uma célula individual respeitando merges e overrides
  const renderCell = (
    cell: TableCellModel,
    col: TableColumnModel,
    isHeaderCell: boolean
  ) => {
    // Invariante de Mesclagem: Células cobertas NÃO renderizam <td> duplicado
    if (cell.coveredBy) {
      return null;
    }

    const isSelected = mode === 'editor' && selectedCellId === cell.id;
    const colSpan = cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined;
    const rowSpan = cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined;

    // Alinhamento
    const align = cell.styleOverride?.align ?? col.align ?? 'left';
    let alignClass = 'text-left';
    if (align === 'center') alignClass = 'text-center';
    else if (align === 'right') alignClass = 'text-right';

    // Vertical align
    const vAlign = cell.styleOverride?.verticalAlign ?? 'middle';
    let vAlignClass = 'align-middle';
    if (vAlign === 'top') vAlignClass = 'align-top';
    else if (vAlign === 'bottom') vAlignClass = 'align-bottom';

    // Tipografia e Overrides de estilo
    let fontStyleClass = '';
    if (cell.styleOverride?.bold) fontStyleClass += ' font-bold';
    if (cell.styleOverride?.italic) fontStyleClass += ' italic';

    const cellTextTokenClass = getTextColorClass(cell.styleOverride?.textColorToken);
    const cellBgTokenClass = getBackgroundColorClass(cell.styleOverride?.backgroundColorToken);

    // Classes de seleção no Editor
    const selectionClass = isSelected
      ? 'outline outline-2 outline-blue-500 -outline-offset-1 z-10 relative bg-blue-50/20'
      : '';

    const Tag = isHeaderCell ? 'th' : 'td';

    return (
      <Tag
        key={cell.id}
        id={mode === 'editor' ? `cell-${cell.id}` : undefined}
        colSpan={colSpan}
        rowSpan={rowSpan}
        scope={isHeaderCell ? 'col' : undefined}
        onClick={
          mode === 'editor' && onSelectCell
            ? (e) => {
                e.stopPropagation();
                onSelectCell(cell.id);
              }
            : undefined
        }
        className={`${density.cellPadding} ${borders.cellBorder} ${alignClass} ${vAlignClass} ${fontStyleClass} ${cellTextTokenClass} ${cellBgTokenClass} ${selectionClass}`}
        data-cell-id={mode === 'editor' ? cell.id : undefined}
        data-row-id={mode === 'editor' ? cell.rowId : undefined}
        data-column-id={mode === 'editor' ? cell.columnId : undefined}
      >
        {renderCellContent(cell.content, mode, resolveAsset, resolveDatum)}
      </Tag>
    );
  };

  const renderRow = (row: TableRowModel, isHeaderRow: boolean) => {
    const rowStyle: React.CSSProperties = {};
    if (row.minHeightMm) {
      rowStyle.minHeight = `${row.minHeightMm}mm`;
    }

    return (
      <tr
        key={row.id}
        style={rowStyle}
        className={isHeaderRow ? `${headerBgClass} ${headerTextClass}` : stripe}
        data-row-id={mode === 'editor' ? row.id : undefined}
        data-row-kind={row.kind}
      >
        {table.columns.map((col) => {
          const key = getCellKey(row.id, col.id);
          const cell = table.cells[key];
          if (!cell) return null;
          return renderCell(cell, col, isHeaderRow);
        })}
      </tr>
    );
  };

  return (
    <div
      style={tableContainerStyle}
      className={`relative select-text ${className}`}
      data-table-id={mode === 'editor' ? table.id : undefined}
      data-table-mode={mode}
      data-geometry-valid={geometryResult.valid ? 'true' : 'false'}
      data-geometry-warnings={
        geometryResult.warnings.length > 0 ? geometryResult.warnings.join('; ') : undefined
      }
    >
      <table
        role="table"
        aria-label={table.title || 'Tabela Técnica'}
        className={`w-full border-collapse ${borders.tableBorder} ${density.fontSize}`}
        style={{ tableLayout: 'fixed' }}
      >
        {/* Definição física de larguras das colunas em mm */}
        <colgroup>
          {table.columns.map((col) => {
            const widthMm = columnWidthMap.get(col.id);
            return (
              <col
                key={col.id}
                style={{ width: widthMm ? `${widthMm}mm` : 'auto' }}
                data-col-id={mode === 'editor' ? col.id : undefined}
                data-semantic-key={col.semanticKey}
              />
            );
          })}
        </colgroup>

        {/* Cabeçalhos (thead) */}
        <thead>
          {explicitHeaderRows.length > 0 ? (
            explicitHeaderRows.map((row) => renderRow(row, true))
          ) : (
            // Linha canônica de cabeçalho padrão com defaultLabel de cada coluna
            <tr className={`${headerBgClass} ${headerTextClass}`}>
              {table.columns.map((col) => (
                <th
                  key={`header-${col.id}`}
                  scope="col"
                  className={`${density.cellPadding} ${borders.cellBorder} font-semibold ${
                    col.align === 'center'
                      ? 'text-center'
                      : col.align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  }`}
                  data-column-header={col.semanticKey}
                >
                  <span>{col.defaultLabel}</span>
                </th>
              ))}
            </tr>
          )}
        </thead>

        {/* Corpo principal de dados (tbody) */}
        <tbody>{dataRows.map((row) => renderRow(row, false))}</tbody>

        {/* Rodapé estrutural (tfoot) */}
        {footerRows.length > 0 && (
          <tfoot>{footerRows.map((row) => renderRow(row, false))}</tfoot>
        )}
      </table>
    </div>
  );
};
