// src/labs/product-workspace-ux/components/WorkspaceNavOutline.tsx
import React from 'react';
import {
  Sparkles,
  Scale,
  Thermometer,
  Cpu,
  Box,
  Zap,
  Radio,
  FileText,
  AlertTriangle,
  ChevronsDown,
  ChevronsUp
} from 'lucide-react';
import { WorkspaceSection } from '../types';

interface WorkspaceNavOutlineProps {
  sections: WorkspaceSection[];
  activeSectionId: string | null;
  onScrollToSection: (sectionId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-3.5 h-3.5" />,
  Scale: <Scale className="w-3.5 h-3.5" />,
  Thermometer: <Thermometer className="w-3.5 h-3.5" />,
  Cpu: <Cpu className="w-3.5 h-3.5" />,
  Box: <Box className="w-3.5 h-3.5" />,
  Zap: <Zap className="w-3.5 h-3.5" />,
  Radio: <Radio className="w-3.5 h-3.5" />,
  FileText: <FileText className="w-3.5 h-3.5" />,
  AlertTriangle: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
};

export const WorkspaceNavOutline: React.FC<WorkspaceNavOutlineProps> = ({
  sections,
  activeSectionId,
  onScrollToSection,
  onExpandAll,
  onCollapseAll
}) => {
  return (
    <>
      {/* Desktop Navigation Rail */}
      <aside className="hidden lg:block w-64 shrink-0 py-6 pr-4 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-3 mb-3">
          <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Índice de Seções
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onExpandAll}
              title="Expandir todas as seções"
              className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
            >
              <ChevronsDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onCollapseAll}
              title="Recolher todas as seções"
              className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
            >
              <ChevronsUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <nav className="space-y-1">
          {sections.map((sec, idx) => {
            const isActive = activeSectionId === sec.id;
            const icon = (sec.icon && SECTION_ICONS[sec.icon]) || <span className="text-xs font-mono">{idx + 1}</span>;
            const hasConflicts = sec.id === 'sec-conflitos';

            return (
              <button
                key={sec.id}
                onClick={() => onScrollToSection(sec.id)}
                className={`w-full px-3 py-2 text-xs font-medium text-left rounded-lg flex items-center justify-between transition-all group ${
                  isActive
                    ? 'bg-[#003366] text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className={`${isActive ? 'text-blue-200' : 'text-slate-400 group-hover:text-slate-600'}`}>
                    {icon}
                  </span>
                  <span className="truncate">{sec.title}</span>
                </div>
                {hasConflicts && (
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                    1
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Horizontal Quick Navigation Bar */}
      <div className="lg:hidden sticky top-[73px] z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 py-2 overflow-x-auto flex items-center gap-2 no-scrollbar">
        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => onScrollToSection(sec.id)}
            className={`px-2.5 py-1 text-xs whitespace-nowrap rounded-full font-medium transition-colors ${
              activeSectionId === sec.id
                ? 'bg-[#003366] text-white font-semibold'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {sec.title}
          </button>
        ))}
      </div>
    </>
  );
};
