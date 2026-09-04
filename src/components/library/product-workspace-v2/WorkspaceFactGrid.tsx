// src/components/library/product-workspace-v2/WorkspaceFactGrid.tsx
import React from 'react';
import { BookOpen, Edit2, AlertCircle } from 'lucide-react';
import { ProjectedFactItem, WorkspaceMode } from '../../../domain/product-workspace/types';

export interface WorkspaceFactGridProps {
  title?: string;
  items: readonly ProjectedFactItem[];
  columns?: number;
  mode?: WorkspaceMode;
  onTraceSource?: (datumId: string) => void;
  onEditSemantics?: (canonicalKey: string) => void;
}

export const WorkspaceFactGrid: React.FC<WorkspaceFactGridProps> = ({
  title,
  items,
  columns = 3,
  mode = 'simple',
  onTraceSource,
  onEditSemantics
}) => {
  if (items.length === 0) return null;

  const colClass =
    columns === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="space-y-3">
      {title && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h4>
      )}

      <div className={`grid ${colClass} gap-3`}>
        {items.map((fact) => (
          <div
            key={fact.datumId}
            className={`group relative p-4 rounded-xl border transition-all duration-200 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md ${
              fact.hasConflict
                ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20'
                : 'border-slate-200/90 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700'
            }`}
          >
            {/* Header com Label Humano e Ações Rápidas */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 line-clamp-1">
                {fact.displayLabel}
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEditSemantics && (
                  <button
                    type="button"
                    onClick={() => onEditSemantics(fact.canonicalSemanticKey)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Editar nome ou sinônimos"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onTraceSource && (
                  <button
                    type="button"
                    onClick={() => onTraceSource(fact.datumId)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Ver documento de origem"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Valor Formatado em Destaque */}
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {fact.formattedValue}
              </span>
            </div>

            {/* Badges e Modo Avançado */}
            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
              <div className="flex items-center gap-1.5">
                {fact.origin === 'family' && (
                  <span className="text-slate-400 dark:text-slate-500 font-medium">
                    Origem: Família
                  </span>
                )}
                {fact.isOverride && (
                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                    Sobrescrita Local
                  </span>
                )}
                {fact.hasConflict && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    Conflito
                  </span>
                )}
              </div>

              {fact.sourcesCount > 0 && (
                <button
                  type="button"
                  onClick={() => onTraceSource?.(fact.datumId)}
                  className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>{fact.sourcesCount}</span>
                </button>
              )}
            </div>

            {/* Chave Canônica (Modo Avançado) */}
            {mode === 'advanced' && (
              <div className="mt-2 pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-800 font-mono text-[10px] text-slate-400 select-all truncate">
                {fact.canonicalSemanticKey}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
