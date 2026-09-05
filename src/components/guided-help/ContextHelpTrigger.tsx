// src/components/guided-help/ContextHelpTrigger.tsx
// Botão acionador elegante do Nível 2 ("Entenda esta área") por aba ou seção.

import React from 'react';
import { HelpConceptId, useLearnMode } from '../../features/guided-help';
import { HelpCircle, Sparkles } from 'lucide-react';

export interface ContextHelpTriggerProps {
  helpId: HelpConceptId;
  label?: string;
  variant?: 'subtle' | 'pill' | 'button';
  className?: string;
}

export const ContextHelpTrigger: React.FC<ContextHelpTriggerProps> = ({
  helpId,
  label = 'Entenda esta área',
  variant = 'pill',
  className = ''
}) => {
  const { openContextHelp, isLearnModeActive } = useLearnMode();

  if (variant === 'subtle') {
    return (
      <button
        type="button"
        onClick={() => openContextHelp(helpId)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors ${className}`}
      >
        <HelpCircle size={14} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openContextHelp(helpId)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
        isLearnModeActive
          ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs hover:bg-amber-100 ring-2 ring-amber-400/40'
          : 'bg-indigo-50/80 border-indigo-200 text-indigo-700 hover:bg-indigo-100/80 hover:border-indigo-300'
      } ${className}`}
    >
      <Sparkles size={13} className={isLearnModeActive ? 'text-amber-600' : 'text-indigo-600'} />
      <span>{label}</span>
    </button>
  );
};
