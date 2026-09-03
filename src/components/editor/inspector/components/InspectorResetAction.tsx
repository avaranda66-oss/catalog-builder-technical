// src/components/editor/inspector/components/InspectorResetAction.tsx
// Primitive canônica de Ação de Restauração (Reset) para o Inspector PRESYS (CORE.E3).
// Apresenta ação de restauração contextual. O caller fornece os valores e lógica de reset.

import React from 'react';
import { RotateCcw } from 'lucide-react';

export interface InspectorResetActionProps {
  label?: string;
  onReset: () => void;
  disabled?: boolean;
  title?: string;
  showIcon?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const InspectorResetAction: React.FC<InspectorResetActionProps> = ({
  label = 'Restaurar padrão',
  onReset,
  disabled = false,
  title,
  showIcon = true,
  className = '',
  'aria-label': propAriaLabel
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onReset}
      title={title || label}
      aria-label={propAriaLabel || label}
      className={`inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded transition-colors text-center cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {showIcon && <RotateCcw className="w-3 h-3 text-slate-500 shrink-0" aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </button>
  );
};
