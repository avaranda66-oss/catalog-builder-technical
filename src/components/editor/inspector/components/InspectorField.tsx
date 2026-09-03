// src/components/editor/inspector/components/InspectorField.tsx
// Primitive canônica de Metadados de Campo para o Inspector PRESYS (CORE.E3).
// Gerencia rótulo semântico (label), vínculo de acessibilidade (htmlFor), hints e feedback de erro (Lucide AlertTriangle, ZERO emoji).

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface InspectorFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  unit?: string;
  children: React.ReactNode;
  className?: string;
}

export const InspectorField: React.FC<InspectorFieldProps> = ({
  label,
  htmlFor,
  hint,
  description,
  error,
  required = false,
  disabled = false,
  unit,
  children,
  className = ''
}) => {
  return (
    <div className={`space-y-1 ${disabled ? 'opacity-60' : ''} ${className}`}>
      {/* Linha de Rótulo e Metadados */}
      <div className="flex items-center justify-between gap-1">
        <label
          htmlFor={htmlFor}
          className="block text-[10.5px] font-semibold text-slate-700 font-sans select-none truncate"
        >
          {label}
          {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
          {unit && <span className="text-[9.5px] font-normal font-mono text-slate-400 ml-1">({unit})</span>}
        </label>
        {hint && <span className="text-[9px] text-slate-400 font-mono shrink-0 select-none">{hint}</span>}
      </div>

      {description && (
        <p className="text-[9.5px] text-slate-500 leading-tight select-none">
          {description}
        </p>
      )}

      {/* Controle/Input Filho */}
      <div>{children}</div>

      {/* Feedback de Validação com Ícone Lucide (Zero Emoji) */}
      {error && (
        <p
          role="alert"
          className="text-[9.5px] text-rose-600 font-medium flex items-center gap-1 mt-0.5 select-none"
        >
          <AlertTriangle className="w-3 h-3 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
