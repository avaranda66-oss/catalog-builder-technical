// src/components/editor/inspector/components/InspectorSelect.tsx
// Primitive canônica de Select para o Contextual Inspector PRESYS (CORE.E3).
// Suporta options tipadas, estados visuais padronizados e acessibilidade nativa.

import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface InspectorSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  hasError?: boolean;
}

export const InspectorSelect: React.FC<InspectorSelectProps> = ({
  options,
  hasError = false,
  disabled = false,
  className = '',
  id,
  'aria-invalid': propAriaInvalid,
  ...props
}) => {
  return (
    <select
      id={id}
      disabled={disabled}
      aria-invalid={propAriaInvalid ?? (hasError ? true : undefined)}
      {...props}
      className={`w-full px-2.5 py-1.5 text-xs font-sans bg-white border rounded transition-all outline-hidden cursor-pointer ${
        hasError
          ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20'
          : 'border-slate-300 hover:border-slate-400 focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20'
      } text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
