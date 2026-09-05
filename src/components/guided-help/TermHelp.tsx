// src/components/guided-help/TermHelp.tsx
// Componente inline que destaca um termo técnico com sublinhado pontilhado e tooltip contextual.

import React from 'react';
import { HelpConceptId, HELP_CONCEPTS_REGISTRY } from '../../features/guided-help';
import { HelpTooltip } from './HelpTooltip';

export interface TermHelpProps {
  helpId: HelpConceptId;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export const TermHelp: React.FC<TermHelpProps> = ({
  helpId,
  label,
  showIcon = false,
  className = ''
}) => {
  const concept = HELP_CONCEPTS_REGISTRY[helpId];
  const displayLabel = label || concept?.title || helpId;

  return (
    <HelpTooltip helpId={helpId} showIcon={showIcon} className={className}>
      <span className="border-b border-dotted border-indigo-400/80 cursor-help hover:text-indigo-600 transition-colors font-medium">
        {displayLabel}
      </span>
    </HelpTooltip>
  );
};
