// src/components/library/product-workspace-v2/WorkspaceTextBlock.tsx
import React from 'react';
import { Info, AlertTriangle, Lightbulb, FileText } from 'lucide-react';

export interface WorkspaceTextBlockProps {
  title?: string;
  content: string;
  calloutVariant?: 'info' | 'warning' | 'tip' | 'editorial';
}

export const WorkspaceTextBlock: React.FC<WorkspaceTextBlockProps> = ({
  title,
  content,
  calloutVariant = 'info'
}) => {
  const variantConfig = {
    info: {
      border: 'border-blue-200 dark:border-blue-900/60',
      bg: 'bg-blue-50/50 dark:bg-blue-950/20',
      icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />
    },
    warning: {
      border: 'border-amber-200 dark:border-amber-900/60',
      bg: 'bg-amber-50/50 dark:bg-amber-950/20',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
    },
    tip: {
      border: 'border-emerald-200 dark:border-emerald-900/60',
      bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
      icon: <Lightbulb className="w-4 h-4 text-emerald-500 shrink-0" />
    },
    editorial: {
      border: 'border-slate-200 dark:border-slate-800',
      bg: 'bg-slate-50/50 dark:bg-slate-900/40',
      icon: <FileText className="w-4 h-4 text-slate-500 shrink-0" />
    }
  }[calloutVariant];

  return (
    <div
      className={`p-4 rounded-xl border ${variantConfig.border} ${variantConfig.bg} space-y-1.5`}
    >
      {title && (
        <div className="flex items-center gap-2 font-semibold text-xs text-slate-900 dark:text-slate-100">
          {variantConfig.icon}
          <span>{title}</span>
        </div>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
};
