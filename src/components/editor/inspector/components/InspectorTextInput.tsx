// src/components/editor/inspector/components/InspectorTextInput.tsx
// Primitive canônica de Input de Texto para o Contextual Inspector PRESYS (CORE.E3).
// Padroniza tipografia industrial, estados de foco/erro/disabled e acessibilidade nativa.

import React from 'react';

export interface InspectorTextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const InspectorTextInput: React.FC<InspectorTextInputProps> = ({
  hasError = false,
  disabled = false,
  className = '',
  id,
  'aria-invalid': propAriaInvalid,
  ...props
}) => {
  return (
    <input
      type="text"
      id={id}
      disabled={disabled}
      aria-invalid={propAriaInvalid ?? (hasError ? true : undefined)}
      {...props}
      className={`w-full px-2.5 py-1.5 text-xs font-sans bg-white border rounded transition-all outline-hidden ${
        hasError
          ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20'
          : 'border-slate-300 hover:border-slate-400 focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20'
      } text-slate-800 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
    />
  );
};
