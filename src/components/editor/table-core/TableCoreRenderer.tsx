// src/components/editor/table-core/TableCoreRenderer.tsx
// Renderizador Canônico Compartilhado de Tabelas Técnicas (Table Core V2 - Fase CORE.T2A.1).
// Suporta modos 'editor' e 'export' sem duplicação de lógica nem mutações de estado.
// Zero unsafe casts, tratamento exaustivo com assertNever(), diagnósticos puros e divisor explícito.
// Zero explicit any.

import React from 'react';
import {
  TableCoreModel,
  TableCellContent,
  TableCellLiteralContent,
  TableCellModel,
  TableColumnModel,
  TableRowModel,
  TableCellTextContent,
  getCellKey
} from '../../../domain/table-core/table.types';
import { resolveColumnWidthsMm } from '../../../domain/table-core/table.geometry';
import {
  TableCoreRendererProps,
  TableAssetResolver,
  TableDatumResolver,
  TableCoreRendererMode,
  TableRenderDiagnostic
} from './table-renderer.types';
import {
  getBackgroundColorClass,
  getTextColorClass,
  getDensityClasses,
  getBorderClasses,
  getStripeClass,
  getBadgeVariantClasses
} from './table-tokens';

/**
 * Helper para garantia de exaustividade em tempo de compilação e execução.
 */
function assertNever(x: never): never {
  throw new Error(`Unhandled TableCellContent kind: ${JSON.stringify(x)}`);
}

/**
 * Coleta diagnósticos puros de renderização sem causar efeitos colaterais.
 */
export function collectTableRenderDiagnostics(
  table: TableCoreModel,
  resolveAsset?: TableAssetResolver,
  resolveDatum?: TableDatumResolver
): TableRenderDiagnostic[] {
  const diagnostics: TableRenderDiagnostic[] = [];

  // 1. Diagnóstico de geometria física
  const geometryResult = resolveColumnWidthsMm(table);
  if (!geometryResult.valid) {
    diagnostics.push({
      code: 'INVALID_GEOMETRY',
      severity: 'error',
      tableId: table.id,
      message: geometryResult.error || 'A largura física total da tabela é inválida.'
    });
  } else if (geometryResult.warnings.length > 0) {
    diagnostics.push({
      code: 'INVALID_GEOMETRY',
      severity: 'warning',
      tableId: table.id,
      message: geometryResult.warnings.join('; ')
    });
  }

  // 2. Diagnóstico sobre células
  for (const [cellKey, cell] of Object.entries(table.cells)) {
    const { content } = cell;

    if (content.kind === 'asset_reference') {
      const resolved = resolveAsset ? resolveAsset(content.assetId) : undefined;
      if (!resolved || !resolved.url) {
        diagnostics.push({
          code: 'UNRESOLVED_ASSET',
          severity: 'warning',
          tableId: table.id,
          cellId: cell.id,
          message: `Asset de mídia '${content.assetId}' na célula ${cellKey} não pôde ser resolvido.`
        });
      }
    } else if (content.kind === 'datum_reference') {
      if (content.bindingMode === 'live') {
        const resolved = resolveDatum ? resolveDatum(content) : undefined;
        if (!resolved && !content.snapshot) {
          diagnostics.push({
            code: 'UNRESOLVED_LIVE_DATUM',
            severity: 'warning',
            tableId: table.id,
            cellId: cell.id,
            message: `Dado vinculado ao vivo '${content.datumKey}' na célula ${cellKey} não foi resolvido e não possui snapshot.`
          });
        }
      } else if (content.bindingMode === 'review_required' && !content.snapshot) {
        diagnostics.push({
          code: 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT',
          severity: 'warning',
          tableId: table.id,
          cellId: cell.id,
          message: `Dado na célula ${cellKey} requer revisão ('${content.datumKey}'), mas não possui snapshot anterior.`
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Renderiza o conteúdo literal de uma célula de forma pura e exaustiva.
 */
function renderLiteralContent(
  content: TableCellLiteralContent,
  mode: TableCoreRendererMode,
  resolveAsset?: TableAssetResolver,
  onDiagnostic?: (diag: TableRenderDiagnostic) => void,
  tableId?: string,
  cellId?: string
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
      const badgeColorClasses = getBadgeVariantClasses(content.variant);
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

      onDiagnostic?.({
        code: 'UNRESOLVED_ASSET',
        severity: 'warning',
        tableId: tableId ?? '',
        cellId,
        message: `Mídia referenciada '${content.assetId}' não pôde ser resolvida.`
      });

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

    default:
      return assertNever(content);
  }
}

/**
 * Renderizador exaustivo de conteúdo de célula com tratamento discriminado de bindings e literais.
 * Zero unsafe cast.
 */
function renderCellContent(
  content: TableCellContent,
  mode: TableCoreRendererMode,
  resolveAsset?: TableAssetResolver,
  resolveDatum?: TableDatumResolver,
  tableId?: string,
  cellId?: string,
  onDiagnostic?: (diag: TableRenderDiagnostic) => void
): React.ReactNode {
  switch (content.kind) {
    case 'empty':
    case 'text':
    case 'number':
    case 'value_unit':
    case 'badge':
    case 'asset_reference':
      return renderLiteralContent(content, mode, resolveAsset, onDiagnostic, tableId, cellId);

    case 'datum_reference': {
      switch (content.bindingMode) {
        case 'snapshot': {
          if (content.snapshot) {
            return renderLiteralContent(content.snapshot, mode, resolveAsset, onDiagnostic, tableId, cellId);
          }

          onDiagnostic?.({
            code: 'UNRESOLVED_LIVE_DATUM',
            severity: 'warning',
            tableId: tableId ?? '',
            cellId,
            message: `Dado vinculado em modo snapshot sem snapshot materializado para '${content.datumKey}'.`
          });

          if (mode === 'editor') {
            return (
              <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[9px] border border-amber-200 font-mono">
                [Snapshot ausente: {content.datumKey}]
              </span>
            );
          }
          return null;
        }

        case 'live': {
          const resolved = resolveDatum ? resolveDatum(content) : undefined;
          if (resolved) {
            return renderLiteralContent(resolved.value, mode, resolveAsset, onDiagnostic, tableId, cellId);
          }

          onDiagnostic?.({
            code: 'UNRESOLVED_LIVE_DATUM',
            severity: 'warning',
            tableId: tableId ?? '',
            cellId,
            message: `Dado vinculado ao vivo não resolvido para '${content.datumKey}'.`
          });

          if (mode === 'editor') {
            return (
              <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[9px] border border-amber-200 font-mono">
                [Pendente: {content.datumKey}]
              </span>
            );
          }
          return content.snapshot
            ? renderLiteralContent(content.snapshot, mode, resolveAsset, onDiagnostic, tableId, cellId)
            : null;
        }

        case 'review_required': {
          if (content.snapshot) {
            return (
              <span className={mode === 'editor' ? 'relative' : ''}>
                {renderLiteralContent(content.snapshot, mode, resolveAsset, onDiagnostic, tableId, cellId)}
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

          onDiagnostic?.({
            code: 'REVIEW_REQUIRED_WITHOUT_SNAPSHOT',
            severity: 'warning',
            tableId: tableId ?? '',
            cellId,
            message: `Dado marcado como review_required sem snapshot anterior para '${content.datumKey}'.`
          });

          if (mode === 'editor') {
            return (
              <span className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded text-[9px] border border-amber-200 font-mono">
                [Revisão pendente: {content.datumKey}]
              </span>
            );
          }
          return null;
        }

        default:
          return assertNever(content);
      }
    }

    default:
      return assertNever(content);
  }
}

export const TableCoreRenderer: React.FC<TableCoreRendererProps> = ({
  table,
  mode,
  selectedCellId,
  onSelectCell,
  resolveAsset,
  resolveDatum,
  onDiagnostic,
  renderTitle = false,
  className = '',
  getCellPrintableField,
  getHeaderPrintableField
}) => {
  // 1. Resolução geométrica pura em mm
  const geometryResult = resolveColumnWidthsMm(table);
  const columnWidthMap = new Map<string, number>(
    geometryResult.columns.map((c) => [c.columnId, c.widthMm])
  );

  // Emissão de diagnóstico de geometria se inválida
  if (!geometryResult.valid && onDiagnostic) {
    onDiagnostic({
      code: 'INVALID_GEOMETRY',
      severity: 'error',
      tableId: table.id,
      message: geometryResult.error || 'Largura física da tabela excede o espaço disponível.'
    });
  }

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
  const bodyRows = table.rows.filter(
    (r) => !r.isHeader && r.kind !== 'header' && r.kind !== 'footer'
  );
  const footerRows = table.rows.filter((r) => r.kind === 'footer');

  // Renderiza uma célula individual respeitando merges e overrides
  const renderCell = (
    cell: TableCellModel,
    row: TableRowModel,
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
    const printableField = isHeaderCell
      ? getHeaderPrintableField
        ? getHeaderPrintableField(col)
        : col.semanticKey
        ? `col_${col.semanticKey}_label`
        : undefined
      : getCellPrintableField
      ? getCellPrintableField(cell, row, col)
      : undefined;

    return (
      <Tag
        key={cell.id}
        id={mode === 'editor' ? `cell-${cell.id}` : undefined}
        colSpan={colSpan}
        rowSpan={rowSpan}
        scope={isHeaderCell ? 'col' : undefined}
        data-printable-field={printableField}
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
        {renderCellContent(
          cell.content,
          mode,
          resolveAsset,
          resolveDatum,
          table.id,
          cell.id,
          onDiagnostic
        )}
      </Tag>
    );
  };

  const renderRow = (row: TableRowModel, isHeaderRow: boolean) => {
    // A5: Tratamento explícito de Linha Divisora (kind === 'divider')
    if (row.kind === 'divider') {
      const firstColId = table.columns[0]?.id;
      const firstKey = firstColId ? getCellKey(row.id, firstColId) : '';
      const dividerCell = table.cells[firstKey];
      const dividerText =
        dividerCell && dividerCell.content.kind === 'text'
          ? (dividerCell.content as TableCellTextContent).text
          : null;

      return (
        <tr
          key={row.id}
          role="separator"
          className="border-b border-t border-slate-300 bg-slate-100/80 font-medium"
          data-row-id={mode === 'editor' ? row.id : undefined}
          data-row-kind="divider"
        >
          <td
            colSpan={table.columns.length}
            className="py-1 px-2.5 text-[9px] text-slate-600 tracking-wide"
          >
            {dividerText}
          </td>
        </tr>
      );
    }

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
          return renderCell(cell, row, col, isHeaderRow);
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
      {/* A6: Aviso visual discreto de geometria inválida no editor */}
      {mode === 'editor' && (!geometryResult.valid || geometryResult.warnings.length > 0) && (
        <div
          role="alert"
          className="mb-1.5 px-2 py-1 bg-rose-50 border border-rose-200 rounded text-rose-700 text-[9px] flex items-center gap-1 font-sans"
        >
          <span className="font-bold">Aviso de Geometria:</span>
          <span>{geometryResult.error || geometryResult.warnings.join('; ')}</span>
        </div>
      )}

      <table
        role="table"
        aria-label={table.title || 'Tabela Técnica'}
        className={`w-full border-collapse ${borders.tableBorder} ${density.fontSize}`}
        style={{ tableLayout: 'fixed' }}
      >
        {/* A7: Título opcional interno via caption para não duplicar cabeçalhos externos */}
        {renderTitle && table.title && (
          <caption className="caption-top text-left font-semibold text-slate-800 pb-1 text-xs">
            {table.title}
          </caption>
        )}

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
                  data-printable-field={
                    getHeaderPrintableField
                      ? getHeaderPrintableField(col)
                      : col.semanticKey
                      ? `col_${col.semanticKey}_label`
                      : undefined
                  }
                >
                  <span>{col.defaultLabel}</span>
                </th>
              ))}
            </tr>
          )}
        </thead>

        {/* Corpo principal de dados (tbody) */}
        <tbody>{bodyRows.map((row) => renderRow(row, false))}</tbody>

        {/* Rodapé estrutural (tfoot) */}
        {footerRows.length > 0 && (
          <tfoot>{footerRows.map((row) => renderRow(row, false))}</tfoot>
        )}
      </table>
    </div>
  );
};
