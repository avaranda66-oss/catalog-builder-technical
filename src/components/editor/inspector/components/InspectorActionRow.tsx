// src/components/editor/inspector/components/InspectorActionRow.tsx
// Primitive canônica de Linha de Ações Secundárias e Auxiliares para o Inspector PRESYS (CORE.E3).
// Diferencia claramente ações neutras, primárias sutis e ações destrutivas/perigosas (danger).

import React from 'react';

export interface InspectorActionItem {
  id?: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'subtle' | 'danger';
  title?: string;
  'aria-label'?: string;
}

export interface InspectorActionRowProps {
  actions: InspectorActionItem[];
  className?: string;
}

export const InspectorActionRow: React.FC<InspectorActionRowProps> = ({
  actions,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-1.5 pt-1 ${className}`}>
      {actions.map((action, index) => {
        const variant = action.variant || 'default';

        let variantStyle = 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200';
        if (variant === 'primary' || variant === 'subtle') {
          variantStyle = 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200';
        } else if (variant === 'danger') {
          variantStyle = 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200 hover:border-rose-300';
        }

        return (
          <button
            key={action.id || `${action.label}-${index}`}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            title={action.title}
            aria-label={action['aria-label'] || action.label}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium border rounded transition-colors text-center cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${variantStyle}`}
          >
            {action.icon && <span className="shrink-0">{action.icon}</span>}
            <span className="truncate">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};
