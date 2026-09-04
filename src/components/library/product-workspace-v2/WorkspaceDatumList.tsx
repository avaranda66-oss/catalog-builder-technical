// src/components/library/product-workspace-v2/WorkspaceDatumList.tsx
import React from 'react';
import { BookOpen, Edit2 } from 'lucide-react';
import { ProjectedFactItem, WorkspaceMode } from '../../../domain/product-workspace/types';

export interface WorkspaceDatumListProps {
  title?: string;
  items: readonly ProjectedFactItem[];
  mode?: WorkspaceMode;
  onTraceSource?: (datumId: string) => void;
  onEditSemantics?: (canonicalKey: string) => void;
}

export const WorkspaceDatumList: React.FC<WorkspaceDatumListProps> = ({
  title,
  items,
  mode = 'simple',
  onTraceSource,
  onEditSemantics
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {title && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h4>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 shadow-sm">
        {items.map((item) => (
          <div
            key={item.datumId}
            className="group flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {item.displayLabel}
              </div>
              {mode === 'advanced' && (
                <div className="font-mono text-[10px] text-slate-400">
                  {item.canonicalSemanticKey}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {item.formattedValue}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEditSemantics && (
                  <button
                    type="button"
                    onClick={() => onEditSemantics(item.canonicalSemanticKey)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Editar semântica"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {onTraceSource && (
                  <button
                    type="button"
                    onClick={() => onTraceSource(item.datumId)}
                    className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Ver documento oficial"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
