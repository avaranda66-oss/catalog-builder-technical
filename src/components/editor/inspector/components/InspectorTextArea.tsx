// src/components/editor/inspector/components/InspectorTextArea.tsx
// Primitive canônica de Textarea para o Contextual Inspector PRESYS (CORE.E3).
// Padroniza tipografia industrial, redimensionamento vertical e acessibilidade.

import React from 'react';

export interface InspectorTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const InspectorTextArea: React.FC<InspectorTextAreaProps> = ({
  hasError = false,
  disabled = false,
  className = '',
  rows = 3,
  id,
  'aria-invalid': propAriaInvalid,
  ...props
}) => {
  return (
    <textarea
      id={id}
      rows={rows}
      disabled={disabled}
      aria-invalid={propAriaInvalid ?? (hasError ? true : undefined)}
      {...props}
      className={`w-full px-2.5 py-1.5 text-xs font-sans bg-white border rounded transition-all outline-hidden resize-y ${
        hasError
          ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20'
          : 'border-slate-300 hover:border-slate-400 focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20'
      } text-slate-800 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
    />
  );
};
