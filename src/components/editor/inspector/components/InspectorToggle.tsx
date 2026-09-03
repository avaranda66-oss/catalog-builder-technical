// src/components/editor/inspector/components/InspectorToggle.tsx
// Primitive canônica de Alternância Binária (Toggle/Switch) para o Inspector PRESYS (CORE.E3).
// Implementa semântica WAI-ARIA role="switch", navegação por teclado nativa e estados acessíveis.

import React from 'react';

export interface InspectorToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const InspectorToggle: React.FC<InspectorToggleProps> = ({
  id,
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
  'aria-label': propAriaLabel
}) => {
  return (
    <div className={`flex items-center gap-2 ${disabled ? 'opacity-50' : ''} ${className}`}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={propAriaLabel || label}
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            onChange(!checked);
          }
        }}
        className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-1 focus:ring-[#003366]/40 ${
          checked ? 'bg-[#003366]' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>

      {label && (
        <span
          onClick={() => {
            if (!disabled) {
              onChange(!checked);
            }
          }}
          className={`text-xs font-sans text-slate-700 select-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-slate-900'
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
};
