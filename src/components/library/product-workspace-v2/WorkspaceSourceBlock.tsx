// src/components/library/product-workspace-v2/WorkspaceSourceBlock.tsx
import React from 'react';
import { FileText } from 'lucide-react';
import { ProjectedSourceItem } from '../../../domain/product-workspace/types';

export interface WorkspaceSourceBlockProps {
  title?: string;
  sources: readonly ProjectedSourceItem[];
}

export const WorkspaceSourceBlock: React.FC<WorkspaceSourceBlockProps> = ({
  title,
  sources
}) => {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-3">
      {title && (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h4>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sources.map((src) => (
          <div
            key={src.id}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-start justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {src.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                  <span className="capitalize">{src.documentType}</span>
                  {src.revision && <span>• Rev: {src.revision}</span>}
                  {src.language && <span>• {src.language}</span>}
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {src.citationCount} {src.citationCount === 1 ? 'citação' : 'citações'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
