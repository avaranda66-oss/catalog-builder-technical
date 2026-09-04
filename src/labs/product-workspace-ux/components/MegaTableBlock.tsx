// src/labs/product-workspace-ux/components/MegaTableBlock.tsx
/**
 * Componente de Tabela Técnica de Alta Densidade (Mega Table).
 * 
 * Regras e Hardening (AMENDMENT 6 & UX1.2):
 * - Roving tabindex real para navegação via teclado por células (setas direcionais).
 * - Suporta 20, 50 e 100 linhas; 5, 10 e 15 colunas sem travar.
 * - Suporta colunas ocultas, linhas filtradas e ignora linhas de cabeçalho de grupo.
 * - Tecla Enter abre fonte técnica se a célula possuir lastro.
 * - Tecla Escape sai do fullscreen com restauração de foco no botão disparador.
 * - Cabeçalho fixo (sticky header) e rolagem horizontal suave.
 * - Semântica de tabela nativa: <th scope="col"> (sem adicionar role="grid" incompleto).
 * - Componente 100% agnóstico a produto (sem citações fixas a sensores térmicos ou normas particulares).
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Maximize2,
  Minimize2,
  FileText,
  Eye,
  Sliders
} from 'lucide-react';
import { MegaTableData, WorkspaceMode, FactSource } from '../types';

interface MegaTableBlockProps {
  table: MegaTableData;
  mode?: WorkspaceMode;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSourceModal?: (source: FactSource) => void;
}

export const MegaTableBlock: React.FC<MegaTableBlockProps> = ({
  table,
  mode: _mode,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSourceModal
}) => {
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>(
    table.defaultDensity || 'compact'
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    table.columns.forEach((c) => {
      initial[c.id] = c.visible !== false;
    });
    return initial;
  });
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

  // Roving Tabindex State para Células
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);

  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const columnPickerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Fecha column picker com clique externo ou Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setIsColumnPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtragem local in-table
  const filteredRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return table.rows;

    return table.rows.filter((row) => {
      const matchGroup = row.group?.toLowerCase().includes(q);
      const matchCell = Object.values(row.cells).some((cell) =>
        cell.value.toLowerCase().includes(q)
      );
      return matchGroup || matchCell;
    });
  }, [table.rows, filterQuery]);

  // Colunas visíveis
  const displayedColumns = useMemo(() => {
    return table.columns.filter((col) => visibleColumns[col.id] !== false);
  }, [table.columns, visibleColumns]);

  // Agrupamento de linhas filtradas
  const groupedRows = useMemo(() => {
    const map = new Map<string, typeof filteredRows>();
    for (const row of filteredRows) {
      const groupKey = row.group || 'Geral';
      if (!map.has(groupKey)) map.set(groupKey, []);
      map.get(groupKey)!.push(row);
    }
    return map;
  }, [filteredRows]);

  // Classes de densidade
  const densityStyles = {
    compact: {
      cell: 'py-1.5 px-3 text-xs',
      header: 'py-2 px-3 text-[11px]'
    },
    normal: {
      cell: 'py-2.5 px-4 text-xs',
      header: 'py-2.5 px-4 text-xs'
    },
    comfortable: {
      cell: 'py-3.5 px-5 text-sm',
      header: 'py-3 px-5 text-xs'
    }
  }[density];

  // Foco no elemento da célula quando focusedCell mudar
  useEffect(() => {
    if (focusedCell) {
      const key = `${focusedCell.rowIdx}_${focusedCell.colIdx}`;
      const elem = cellRefs.current.get(key);
      if (elem) {
        elem.focus();
      }
    }
  }, [focusedCell]);

  // Navegação por teclado roving tabindex
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number, cellSource?: FactSource) => {
      const maxRows = filteredRows.length;
      const maxCols = displayedColumns.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedCell({
            rowIdx: Math.min(maxRows - 1, rowIdx + 1),
            colIdx
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedCell({
            rowIdx: Math.max(0, rowIdx - 1),
            colIdx
          });
          break;
        case 'ArrowRight':
          e.preventDefault();
          setFocusedCell({
            rowIdx,
            colIdx: Math.min(maxCols - 1, colIdx + 1)
          });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedCell({
            rowIdx,
            colIdx: Math.max(0, colIdx - 1)
          });
          break;
        case 'Enter':
          if (cellSource && onOpenSourceModal) {
            e.preventDefault();
            onOpenSourceModal(cellSource);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (isFullscreen && onToggleFullscreen) {
            onToggleFullscreen();
            fullscreenButtonRef.current?.focus();
          } else if (isColumnPickerOpen) {
            setIsColumnPickerOpen(false);
          }
          break;
        default:
          break;
      }
    },
    [filteredRows.length, displayedColumns.length, isFullscreen, onToggleFullscreen, onOpenSourceModal, isColumnPickerOpen]
  );

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 flex flex-col shadow-2xl border-slate-300' : ''
      }`}
      role="region"
      aria-label="Tabela de especificações técnicas"
    >
      {/* Barra de Ferramentas Superior */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => {
                setFilterQuery(e.target.value);
                setFocusedCell(null);
              }}
              placeholder="Filtrar linhas da tabela (ex: valor, faixa, descrição)..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 focus:border-[#003366] rounded-md outline-none transition-colors"
              aria-label="Filtrar dados da tabela"
            />
          </div>
          {filterQuery && (
            <span className="text-[11px] text-slate-500 font-medium shrink-0">
              {filteredRows.length} de {table.rows.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Alternador de Densidade */}
          <div
            className="inline-flex bg-white border border-slate-200 rounded-md p-0.5 text-xs shadow-2xs"
            role="group"
            aria-label="Densidade da tabela"
          >
            {(['compact', 'normal', 'comfortable'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                aria-pressed={density === d}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  density === d
                    ? 'bg-[#003366] text-white font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {d === 'compact' ? 'Compacta' : d === 'normal' ? 'Normal' : 'Confortável'}
              </button>
            ))}
          </div>

          {/* Seletor de Colunas Visíveis */}
          <div ref={columnPickerRef} className="relative">
            <button
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              aria-expanded={isColumnPickerOpen}
              aria-label="Selecionar colunas visíveis"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded-md text-slate-700 shadow-2xs transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span>Colunas ({displayedColumns.length}/{table.columns.length})</span>
            </button>

            {isColumnPickerOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl p-2.5 z-30 text-xs space-y-1"
                role="dialog"
                aria-label="Seletor de colunas visíveis"
              >
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Exibir Colunas</span>
                  <Sliders className="w-3 h-3 text-slate-400" />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {table.columns.map((col) => (
                    <label
                      key={col.id}
                      className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer select-none text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col.id] !== false}
                        onChange={(e) =>
                          setVisibleColumns((prev) => ({ ...prev, [col.id]: e.target.checked }))
                        }
                        className="rounded text-[#003366] focus:ring-0 w-3.5 h-3.5"
                      />
                      <span className="truncate text-xs font-medium">{col.header}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Botão de Tela Cheia com retorno de foco */}
          {onToggleFullscreen && (
            <button
              ref={fullscreenButtonRef}
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Reduzir tabela para tamanho padrão' : 'Expandir tabela para tela cheia'}
              title={isFullscreen ? 'Reduzir tabela (Esc)' : 'Expandir tabela'}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-600 transition-colors shadow-2xs"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Container de Tabela com Cabeçalho Fixo e Scroll Horizontal */}
      <div
        ref={tableContainerRef}
        className={`overflow-x-auto ${isFullscreen ? 'flex-1 overflow-y-auto' : 'max-h-[560px] overflow-y-auto'}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isFullscreen && onToggleFullscreen) {
            onToggleFullscreen();
            fullscreenButtonRef.current?.focus();
          }
        }}
      >
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 shadow-2xs">
            <tr>
              {displayedColumns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  style={{ width: col.width }}
                  className={`font-semibold text-slate-700 uppercase tracking-wider select-none ${densityStyles.header} ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/70">
            {Array.from(groupedRows.entries()).map(([groupName, rows]) => (
              <React.Fragment key={groupName}>
                {/* Linha Divisória de Grupo (Não focável por roving tabindex) */}
                <tr className="bg-slate-50/90 font-bold select-none">
                  <td
                    colSpan={displayedColumns.length}
                    className="py-1.5 px-4 text-[11px] uppercase tracking-wider text-[#003366] border-y border-slate-200/90"
                  >
                    {groupName} ({rows.length} {rows.length === 1 ? 'item' : 'itens'})
                  </td>
                </tr>

                {/* Linhas de Dados */}
                {rows.map((row) => {
                  const globalRowIdx = filteredRows.findIndex((r) => r.id === row.id);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-blue-50/40 transition-colors group"
                    >
                      {displayedColumns.map((col, colIdx) => {
                        const cell = row.cells[col.id] || { value: '-' };
                        const isHighlighted = cell.highlight;
                        const cellKey = `${globalRowIdx}_${colIdx}`;
                        const isFocused =
                          focusedCell?.rowIdx === globalRowIdx && focusedCell?.colIdx === colIdx;

                        return (
                          <td
                            key={col.id}
                            ref={(el) => {
                              if (el) cellRefs.current.set(cellKey, el);
                              else cellRefs.current.delete(cellKey);
                            }}
                            tabIndex={isFocused ? 0 : -1}
                            onClick={() => setFocusedCell({ rowIdx: globalRowIdx, colIdx })}
                            onKeyDown={(e) => handleCellKeyDown(e, globalRowIdx, colIdx, cell.source)}
                            className={`${densityStyles.cell} outline-none cursor-pointer focus:ring-2 focus:ring-[#003366] focus:bg-blue-50/70 ${
                              col.align === 'right'
                                ? 'text-right font-mono'
                                : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                            } ${isHighlighted ? 'font-bold text-[#003366]' : 'text-slate-800'}`}
                          >
                            <div
                              className={`flex items-center gap-1.5 ${
                                col.align === 'right'
                                  ? 'justify-end'
                                  : col.align === 'center'
                                  ? 'justify-center'
                                  : 'justify-start'
                              }`}
                            >
                              <span className="truncate">{cell.value}</span>

                              {cell.unit && (
                                <span className="text-[10px] text-slate-400 font-normal shrink-0">
                                  {cell.unit}
                                </span>
                              )}

                              {cell.source && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenSourceModal) onOpenSourceModal(cell.source!);
                                  }}
                                  title={`Fonte: ${cell.source.documentCode} pág. ${cell.source.page}`}
                                  aria-label={`Ver fonte ${cell.source.documentCode}`}
                                  className="p-0.5 text-slate-400 hover:text-[#003366] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                >
                                  <FileText className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rodapé Dinâmico e Agnóstico */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span>
          Exibindo {filteredRows.length} de {table.rows.length} itens registrados
        </span>
        <span className="text-[11px] text-slate-400">
          Navegue com as setas do teclado · Enter para fonte · Esc para fechar
        </span>
      </div>
    </div>
  );
};
