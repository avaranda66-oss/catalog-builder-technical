// src/components/editor/inspector/components/InspectorTextInput.tsx
// Input de texto corporativo PRESYS para o Inspector

import React from 'react';

interface InspectorTextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const InspectorTextInput: React.FC<InspectorTextInputProps> = ({
  hasError,
  className = '',
  ...props
}) => {
  return (
    <input
      {...props}
      className={`w-full px-2.5 py-1.5 text-xs bg-white border rounded transition-all outline-hidden ${
        hasError
          ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500/20'
          : 'border-slate-300 focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20'
      } text-slate-800 placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
    />
  );
};
