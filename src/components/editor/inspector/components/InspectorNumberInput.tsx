// src/components/editor/inspector/components/InspectorNumberInput.tsx
// Primitive canônica de Input Numérico para o Contextual Inspector PRESYS (CORE.E3).
// Suporta restrições nativas min/max/step, sufixo/unidade visual e acessibilidade estrita.

import React from 'react';

export interface InspectorNumberInputProps {
  id?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  onChange?: (value: number) => void;
  disabled?: boolean;
  hasError?: boolean;
  unit?: string;
  suffix?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export const InspectorNumberInput: React.FC<InspectorNumberInputProps> = ({
  id,
  value,
  min,
  max,
  step = 'any',
  onChange,
  disabled = false,
  hasError = false,
  unit,
  suffix,
  placeholder,
  className = '',
  'aria-label': propAriaLabel,
  'aria-invalid': propAriaInvalid
}) => {
  const displayUnit = unit || suffix;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return;
    const raw = e.target.value;
    if (raw === '') return;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const inputEl = (
    <input
      type="number"
      id={id}
      value={value !== undefined ? value : ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={propAriaLabel}
      aria-invalid={propAriaInvalid ?? (hasError ? true : undefined)}
      onChange={handleChange}
      className={`w-full px-2.5 py-1.5 text-xs font-mono bg-white border rounded transition-all outline-hidden ${
        hasError
          ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20'
          : 'border-slate-300 hover:border-slate-400 focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20'
      } text-slate-800 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed ${className}`}
    />
  );

  if (!displayUnit) {
    return inputEl;
  }

  return (
    <div className="flex items-center gap-2">
      {inputEl}
      <span className="text-xs font-mono font-semibold text-slate-500 shrink-0 select-none">
        {displayUnit}
      </span>
    </div>
  );
};
