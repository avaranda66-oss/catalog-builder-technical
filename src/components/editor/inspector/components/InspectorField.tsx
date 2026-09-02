// src/components/editor/inspector/components/InspectorField.tsx
// Wrapper de campo com label, indicador de obrigatoriedade e feedback de validação

import React from 'react';

interface InspectorFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}

export const InspectorField: React.FC<InspectorFieldProps> = ({
  label,
  htmlFor,
  hint,
  error,
  children
}) => {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="block text-[10.5px] font-semibold text-slate-700 font-sans"
        >
          {label}
        </label>
        {hint && <span className="text-[9px] text-slate-400 font-mono">{hint}</span>}
      </div>
      <div>{children}</div>
      {error && (
        <p className="text-[9.5px] text-rose-600 font-medium flex items-center gap-1 mt-0.5">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
};
