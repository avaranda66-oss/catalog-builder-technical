// src/components/editor/inspector/components/InspectorSection.tsx
// Primitive canônica de Agrupamento Colapsável para o Contextual Inspector PRESYS (CORE.E3).
// Suporta disclosures independentes, semântica WAI-ARIA estrita, navegação por teclado nativa e densidade compacta.

import React, { useState, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface InspectorSectionProps {
  id?: string;
  title: string;
  icon?: React.ReactNode;
  description?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export const InspectorSection: React.FC<InspectorSectionProps> = ({
  id: propId,
  title,
  icon,
  description,
  badge,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className = ''
}) => {
  const generatedId = useId();
  const sectionId = propId || `inspector-section-${generatedId}`;
  const headerButtonId = `${sectionId}-header`;
  const contentRegionId = `${sectionId}-content`;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleToggle = () => {
    const nextState = !isOpen;
    if (!isControlled) {
      setUncontrolledOpen(nextState);
    }
    onOpenChange?.(nextState);
  };

  return (
    <div
      id={sectionId}
      data-inspector-section
      data-state={isOpen ? 'open' : 'closed'}
      className={`border border-slate-200/90 rounded-lg bg-white overflow-hidden transition-all shadow-2xs ${className}`}
    >
      {/* Header Colapsável com Botão Nativo Acessível */}
      <button
        type="button"
        id={headerButtonId}
        aria-expanded={isOpen}
        aria-controls={contentRegionId}
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-slate-50/70 hover:bg-slate-100/80 transition-colors cursor-pointer select-none focus:outline-hidden focus:ring-1 focus:ring-[#003366]/40"
      >
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          {icon && <span className="text-[#003366] shrink-0">{icon}</span>}
          <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider font-mono truncate">
            {title}
          </span>
          {badge !== undefined && (
            <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-slate-200/80 text-slate-600 shrink-0">
              {badge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {description && (
            <span className="text-[9px] text-slate-400 font-mono hidden sm:inline">
              {description}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-150 ${
              isOpen ? 'transform rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Região de Conteúdo Expansível */}
      {isOpen && (
        <div
          id={contentRegionId}
          role="region"
          aria-labelledby={headerButtonId}
          className="p-3 border-t border-slate-200/60 bg-white space-y-2.5"
        >
          {children}
        </div>
      )}
    </div>
  );
};
