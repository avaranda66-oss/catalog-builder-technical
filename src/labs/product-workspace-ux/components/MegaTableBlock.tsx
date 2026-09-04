// src/labs/product-workspace-ux/components/MegaTableBlock.tsx
import React, { useState, useMemo } from 'react';
import {
  Search,
  Maximize2,
  Minimize2,
  FileText,
  Eye
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
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact');
  const [filterQuery, setFilterQuery] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    table.columns.forEach((c) => {
      initial[c.id] = c.visible !== false;
    });
    return initial;
  });
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);

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

  // Agrupamento de linhas
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

  const displayedColumns = table.columns.filter((col) => visibleColumns[col.id] !== false);

  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all ${
        isFullscreen ? 'fixed inset-4 z-50 flex flex-col shadow-2xl' : ''
      }`}
    >
      {/* Barra de Ferramentas Superior da Tabela */}
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar sensores (ex: Pt100, Tipo K, mV)..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 focus:border-[#003366] rounded-md outline-none"
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
          <div className="inline-flex bg-white border border-slate-200 rounded-md p-0.5 text-xs">
            {(['compact', 'normal', 'comfortable'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
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
          <div className="relative">
            <button
              onClick={() => setIsColumnPickerOpen(!isColumnPickerOpen)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded-md text-slate-700"
            >
              <Eye className="w-3 h-3 text-slate-400" />
              <span>Colunas</span>
            </button>

            {isColumnPickerOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-30 text-xs space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Exibir Colunas
                </div>
                {table.columns.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.id] !== false}
                      onChange={(e) =>
                        setVisibleColumns((prev) => ({ ...prev, [col.id]: e.target.checked }))
                      }
                      className="rounded text-[#003366] focus:ring-0 w-3.5 h-3.5"
                    />
                    <span className="truncate text-slate-700">{col.header}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Botão de Tela Cheia / Quase Fullscreen */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Reduzir tabela' : 'Expandir tabela (quase fullscreen)'}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Container de Tabela com Rolagem Elegante e Cabeçalho Fixo */}
      <div className={`overflow-x-auto ${isFullscreen ? 'flex-1 overflow-y-auto' : 'max-h-[520px] overflow-y-auto'}`}>
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 shadow-2xs">
            <tr>
              {displayedColumns.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className={`font-semibold text-slate-700 uppercase tracking-wider ${densityStyles.header} ${
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
                {/* Linha Divisória de Grupo */}
                <tr className="bg-slate-50/90 font-bold">
                  <td
                    colSpan={displayedColumns.length}
                    className="py-1.5 px-4 text-[11px] uppercase tracking-wider text-[#003366] border-y border-slate-200/90"
                  >
                    {groupName} ({rows.length} {rows.length === 1 ? 'item' : 'itens'})
                  </td>
                </tr>

                {/* Linhas de Dados */}
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-blue-50/40 transition-colors group"
                  >
                    {displayedColumns.map((col) => {
                      const cell = row.cells[col.id] || { value: '-' };
                      const isHighlighted = cell.highlight;

                      return (
                        <td
                          key={col.id}
                          className={`${densityStyles.cell} ${
                            col.align === 'right'
                              ? 'text-right font-mono'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          } ${isHighlighted ? 'font-bold text-[#003366]' : 'text-slate-800'}`}
                        >
                          <div
                            className={`flex items-center gap-1.5 ${
                              col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                            }`}
                          >
                            <span>{cell.value}</span>

                            {cell.unit && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                {cell.unit}
                              </span>
                            )}

                            {cell.source && (
                              <button
                                onClick={() => onOpenSourceModal && onOpenSourceModal(cell.source!)}
                                title={`Fonte: ${cell.source.documentCode} pág. ${cell.source.page}`}
                                className="p-0.5 text-slate-400 hover:text-[#003366] opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <FileText className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rodapé da Tabela */}
      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span>Exibindo {filteredRows.length} de {table.rows.length} especificações</span>
        <span className="text-[11px] text-slate-400">Suporte a normas IEC 60751, IEC 60584 e NIST 175</span>
      </div>
    </div>
  );
};
