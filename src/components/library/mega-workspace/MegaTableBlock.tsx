// src/components/library/mega-workspace/MegaTableBlock.tsx
// Bloco de Mega Tabela Técnica para o Mega Workspace (Produção).
// Integra busca local de linhas, alternância de densidade e referências diretas a factsById.
// Zero explicit any.

import React, { useState, useMemo } from 'react';
import {
  Search,
  Table as TableIcon,
  Maximize2,
  Minimize2,
  FileText,
  AlertTriangle,
  FileQuestion,
  CheckCircle2
} from 'lucide-react';
import {
  MegaTableBlockVM,
  ProjectedFactVM,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';

interface MegaTableBlockProps {
  block: MegaTableBlockVM;
  factsById: Readonly<Record<string, ProjectedFactVM>>;
  session?: WorkspaceSessionVM;
  onOpenSourceTrace: (fact: ProjectedFactVM) => void;
}

export const MegaTableBlock: React.FC<MegaTableBlockProps> = ({
  block,
  factsById,
  session: _session,
  onOpenSourceTrace
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filtro de linhas em tempo real
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return block.rows;

    return block.rows.filter((row) => {
      if (row.label && row.label.toLowerCase().includes(q)) return true;

      for (const col of block.columns) {
        const cell = row.cells[col.id];
        if (!cell) continue;

        if (cell.type === 'fact_ref' && cell.factId) {
          const fact = factsById[cell.factId];
          if (fact) {
            if (fact.formattedValue.toLowerCase().includes(q)) return true;
            if (fact.canonicalLabel.toLowerCase().includes(q)) return true;
          }
        } else if (cell.value && cell.value.toLowerCase().includes(q)) {
          return true;
        }
      }
      return false;
    });
  }, [block.rows, block.columns, factsById, searchQuery]);

  const renderFactCell = (factId: string, displayOverride?: string) => {
    const fact = factsById[factId];
    if (!fact) return <span>—</span>;

    const textToDisplay = displayOverride || fact.formattedValue;

    return (
      <div className="flex items-center justify-between gap-1.5 group/cell">
        <span
          className={`truncate font-medium ${
            fact.hasConflict ? 'text-amber-800 font-semibold' : 'text-slate-900'
          }`}
        >
          {textToDisplay}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenSourceTrace(fact);
          }}
          title={
            fact.hasConflict
              ? 'Conflito de fontes detectado'
              : `Fonte técnica (${fact.sourceDocumentIds.length} fontes)`
          }
          className="p-1 rounded text-slate-300 opacity-60 group-hover/cell:opacity-100 hover:text-[#003366] hover:bg-slate-100 transition-all shrink-0"
        >
          {fact.hasConflict ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          ) : fact.evidenceState === 'multiple_agreeing' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          ) : fact.evidenceState === 'no_source' ? (
            <FileQuestion className="w-3.5 h-3.5 text-slate-300" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    );
  };

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-white p-6 flex flex-col'
    : 'border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden';

  return (
    <div className={containerClasses}>
      {/* Header da Tabela */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
            <TableIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {block.title || 'Tabela Técnica'}
            </h4>
            {block.description && (
              <p className="text-xs text-slate-500 mt-0.5">
                {block.description}
              </p>
            )}
          </div>
        </div>

        {/* Controles de Busca e Visualização */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar dados da tabela..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003366] focus:border-[#003366] w-44 sm:w-56"
            />
          </div>

          <button
            onClick={() => setIsCompact(!isCompact)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              isCompact
                ? 'bg-slate-200 border-slate-300 text-slate-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Alternar densidade de linhas"
          >
            {isCompact ? 'Expandir' : 'Compacto'}
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title={isFullscreen ? 'Sair da tela cheia' : 'Visualizar em tela cheia'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Grid Tabular */}
      <div className="flex-1 overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <th className="py-2.5 px-4 font-bold text-slate-700 w-44 shrink-0">
                Item / Parâmetro
              </th>
              {block.columns.map((col) => (
                <th
                  key={col.id}
                  className={`py-2.5 px-4 font-bold text-slate-700 ${
                    col.align === 'center'
                      ? 'text-center'
                      : col.align === 'right'
                      ? 'text-right'
                      : 'text-left'
                  }`}
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={block.columns.length + 1}
                  className="py-8 text-center text-slate-400"
                >
                  Nenhum dado encontrado para &quot;{searchQuery}&quot;.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/70 transition-colors"
                >
                  <td
                    className={`px-4 font-medium text-slate-700 ${
                      isCompact ? 'py-1.5' : 'py-3'
                    }`}
                  >
                    {row.label || row.id}
                  </td>
                  {block.columns.map((col) => {
                    const cell = row.cells[col.id];
                    return (
                      <td
                        key={col.id}
                        className={`px-4 ${isCompact ? 'py-1.5' : 'py-3'} ${
                          col.align === 'center'
                            ? 'text-center'
                            : col.align === 'right'
                            ? 'text-right'
                            : 'text-left'
                        }`}
                      >
                        {cell ? (
                          cell.type === 'fact_ref' && cell.factId ? (
                            renderFactCell(cell.factId, cell.displayOverride)
                          ) : (
                            <span className="text-slate-600">
                              {cell.value || '—'}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer com contagem */}
      <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Mostrando {filteredRows.length} de {block.rows.length} linhas
        </span>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-[#003366] hover:underline font-medium"
          >
            Limpar filtro
          </button>
        )}
      </div>
    </div>
  );
};
