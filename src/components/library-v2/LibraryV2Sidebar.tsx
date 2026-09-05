// src/components/library-v2/LibraryV2Sidebar.tsx
// Menu lateral de navegação pelas 8 seções estruturadas da Library V2.

import React from 'react';
import { useLearnMode } from '../../features/guided-help';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Table2,
  FileText,
  FileCheck2,
  AlertTriangle,
  FolderTree,
  Code2,
  Sparkles
} from 'lucide-react';


export type LibraryV2SectionId =
  | 'overview'
  | 'technical-data'
  | 'technical-tables'
  | 'documents'
  | 'sources'
  | 'conflicts'
  | 'organization'
  | 'advanced';

export interface LibraryV2SidebarProps {
  activeSection: LibraryV2SectionId;
  onSelectSection: (section: LibraryV2SectionId) => void;
  metrics?: {
    productsCount?: number;
    specsCount?: number;
    tablesCount?: number;
    documentsCount?: number;
    sourcesCount?: number;
    conflictsCount?: number;
  };
}

export const LibraryV2Sidebar: React.FC<LibraryV2SidebarProps> = ({
  activeSection,
  onSelectSection,
  metrics = {}
}) => {
  const { startTour } = useLearnMode();
  const sections = [
    {
      id: 'overview' as const,
      label: 'Visão Geral',
      icon: LayoutDashboard,
      badge: typeof metrics.productsCount === 'number' ? `${metrics.productsCount} mod.` : undefined,
      tourAttr: 'v2-nav-overview'
    },
    {
      id: 'technical-data' as const,
      label: 'Informações Técnicas',
      icon: FileSpreadsheet,
      badge: typeof metrics.specsCount === 'number' ? `${metrics.specsCount}` : undefined,
      tourAttr: 'v2-nav-technical-data'
    },
    {
      id: 'technical-tables' as const,
      label: 'Tabelas Técnicas',
      icon: Table2,
      badge: typeof metrics.tablesCount === 'number' ? `${metrics.tablesCount}` : undefined,
      tourAttr: 'v2-nav-technical-tables'
    },
    {
      id: 'documents' as const,
      label: 'Documentos',
      icon: FileText,
      badge: typeof metrics.documentsCount === 'number' ? `${metrics.documentsCount}` : undefined,
      tourAttr: 'v2-nav-documents'
    },
    {
      id: 'sources' as const,
      label: 'Fontes & Evidências',
      icon: FileCheck2,
      badge: typeof metrics.sourcesCount === 'number' ? `${metrics.sourcesCount}` : undefined,
      tourAttr: 'v2-nav-sources'
    },
    {
      id: 'conflicts' as const,
      label: 'Conflitos / Revisões',
      icon: AlertTriangle,
      badge: typeof metrics.conflictsCount === 'number' ? `${metrics.conflictsCount}` : undefined,
      badgeColor: typeof metrics.conflictsCount === 'number' && metrics.conflictsCount > 0
        ? 'bg-amber-100 text-amber-900 font-bold'
        : 'bg-slate-100 text-slate-500',
      tourAttr: 'v2-nav-conflicts'
    },
    {
      id: 'organization' as const,
      label: 'Organização',
      icon: FolderTree,
      badge: undefined,
      tourAttr: 'v2-nav-organization'
    },
    {
      id: 'advanced' as const,
      label: 'Avançado',
      icon: Code2,
      badge: 'PRO',
      badgeColor: 'bg-indigo-100 text-indigo-800 font-mono text-[9px]',
      tourAttr: 'v2-nav-advanced'
    }
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
          Navegação da Biblioteca
        </span>
        <span className="text-xs font-bold text-slate-800">
          Estrutura da Biblioteca
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {sections.map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;

          return (
            <button
              key={sec.id}
              data-tour={sec.tourAttr}
              type="button"
              onClick={() => onSelectSection(sec.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span>{sec.label}</span>
              </div>

              {sec.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : sec.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {sec.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Ação de Ajuda e Tour da Tela */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/60">
        <button
          type="button"
          onClick={startTour}
          className="w-full py-2 px-3 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
          title="Iniciar o tour passo a passo guiado da interface"
        >
          <Sparkles size={13} className="text-amber-500" />
          <span>Guia Rápido da Tela</span>
        </button>
      </div>
    </aside>
  );
};
