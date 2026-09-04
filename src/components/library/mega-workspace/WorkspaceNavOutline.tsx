// src/components/library/mega-workspace/WorkspaceNavOutline.tsx
// Navegação rápida lateral e sumário estruturado de seções para o Mega Workspace (Produção).
// Zero explicit any.

import React from 'react';
import { ChevronRight, Bookmark } from 'lucide-react';
import { ProjectedSectionVM } from '../../../domain/product-workspace/view-model';

interface WorkspaceNavOutlineProps {
  sections: readonly ProjectedSectionVM[];
  activeSectionId?: string;
  onSelectSection: (sectionId: string) => void;
}

export const WorkspaceNavOutline: React.FC<WorkspaceNavOutlineProps> = ({
  sections,
  activeSectionId,
  onSelectSection
}) => {
  if (sections.length <= 1) return null;

  return (
    <nav
      className="w-56 shrink-0 hidden lg:block sticky top-28 self-start space-y-1 bg-white/70 backdrop-blur-xs p-3 rounded-xl border border-slate-200/80 shadow-2xs"
      aria-label="Sumário de seções técnicas"
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <Bookmark className="w-3.5 h-3.5 text-slate-400" />
        Seções Técnicas
      </div>

      <div className="space-y-0.5 max-h-[calc(100vh-180px)] overflow-y-auto">
        {sections.map((sec) => {
          const isActive = activeSectionId === sec.id;
          // Conta total de blocos da seção
          const totalBlocks = sec.blocks.length;

          return (
            <button
              key={sec.id}
              onClick={() => onSelectSection(sec.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-all text-left ${
                isActive
                  ? 'bg-[#003366] text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
              }`}
            >
              <span className="truncate mr-2">{sec.title}</span>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {totalBlocks}
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 ${
                    isActive ? 'text-white' : 'text-slate-400'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
