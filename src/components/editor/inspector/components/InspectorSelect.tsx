// src/components/editor/inspector/components/InspectorSelect.tsx
// Select estilizado para tokens de configuração no Inspector

import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface InspectorSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  hasError?: boolean;
}

export const InspectorSelect: React.FC<InspectorSelectProps> = ({
  options,
  hasError,
  className = '',
  ...props
}) => {
  return (
    <select
      {...props}
      className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded transition-all outline-hidden ${
        hasError
          ? 'border-rose-400 focus:border-rose-600'
          : 'border-slate-300 focus:border-[#003366]'
      } text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
