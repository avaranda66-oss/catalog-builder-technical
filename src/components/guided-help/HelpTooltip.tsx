// src/components/guided-help/HelpTooltip.tsx
// Nível 1: Micro-tooltip contextual acessível por mouse e teclado (Esc fecha).
// Renderiza o título e explicação curta de 1 a 2 frases do HelpConcept.

import React, { useState, useRef, useEffect } from 'react';
import { HelpConceptId, HELP_CONCEPTS_REGISTRY, useLearnMode } from '../../features/guided-help';
import { HelpCircle, ExternalLink } from 'lucide-react';

export interface HelpTooltipProps {
  helpId: HelpConceptId;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  showIcon?: boolean;
  className?: string;
  forceVisibleInLearnMode?: boolean;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  helpId,
  children,
  position = 'top',
  showIcon = true,
  className = '',
  forceVisibleInLearnMode = true
}) => {
  const concept = HELP_CONCEPTS_REGISTRY[helpId];
  const { isLearnModeActive, openConceptDetail } = useLearnMode();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Fecha com a tecla Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!concept) {
    return <span className={className}>{children}</span>;
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }[position];

  const handleLearnMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    openConceptDetail(helpId);
  };

  const isHotspot = forceVisibleInLearnMode && isLearnModeActive;

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center gap-1 group ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {children}

      {showIcon && (
        <button
          type="button"
          aria-label={`Ajuda sobre ${concept.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          className={`inline-flex items-center justify-center transition-all rounded-full p-0.5 ${
            isHotspot
              ? 'bg-amber-400/20 text-amber-600 hover:bg-amber-400/40 ring-2 ring-amber-400/50 animate-pulse'
              : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <HelpCircle size={14} />
        </button>
      )}

      {/* Popover do Tooltip */}
      {isOpen && (
        <span
          role="tooltip"
          className={`absolute z-50 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl pointer-events-auto transition-all ${positionClasses}`}
        >
          <span className="font-bold text-slate-100 mb-1 flex items-center justify-between">
            <span>{concept.title}</span>
            {isHotspot && (
              <span className="text-[10px] uppercase font-mono px-1 py-0.2 bg-amber-500/30 text-amber-300 rounded">
                Modo Aprender
              </span>
            )}
          </span>
          <span className="block text-slate-300 leading-relaxed mb-2 font-normal">
            {concept.shortExplanation}
          </span>
          <button
            type="button"
            onClick={handleLearnMore}
            className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 font-semibold underline underline-offset-2 transition-colors"
          >
            <span>Ver explicação completa</span>
            <ExternalLink size={11} />
          </button>
        </span>
      )}
    </span>
  );
};
