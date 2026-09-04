// src/components/library-v2/LibraryV2Sidebar.tsx
// Menu lateral de navegação pelas 8 seções estruturadas da Library V2.

import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  Table2,
  FileText,
  FileCheck2,
  AlertTriangle,
  FolderTree,
  Code2
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
    productsCount: number;
    specsCount: number;
    tablesCount: number;
    documentsCount: number;
    sourcesCount: number;
    conflictsCount: number;
  };
}

export const LibraryV2Sidebar: React.FC<LibraryV2SidebarProps> = ({
  activeSection,
  onSelectSection,
  metrics = {
    productsCount: 3,
    specsCount: 7,
    tablesCount: 1,
    documentsCount: 2,
    sourcesCount: 3,
    conflictsCount: 0
  }
}) => {
  const sections = [
    {
      id: 'overview' as const,
      label: 'Visão Geral',
      icon: LayoutDashboard,
      badge: metrics.productsCount > 0 ? `${metrics.productsCount} mod.` : undefined,
      tourAttr: 'v2-nav-overview'
    },
    {
      id: 'technical-data' as const,
      label: 'Informações Técnicas',
      icon: FileSpreadsheet,
      badge: `${metrics.specsCount}`,
      tourAttr: 'v2-nav-technical-data'
    },
    {
      id: 'technical-tables' as const,
      label: 'Tabelas Técnicas',
      icon: Table2,
      badge: `${metrics.tablesCount}`,
      tourAttr: 'v2-nav-technical-tables'
    },
    {
      id: 'documents' as const,
      label: 'Documentos',
      icon: FileText,
      badge: `${metrics.documentsCount}`,
      tourAttr: 'v2-nav-documents'
    },
    {
      id: 'sources' as const,
      label: 'Fontes & Evidências',
      icon: FileCheck2,
      badge: `${metrics.sourcesCount}`,
      tourAttr: 'v2-nav-sources'
    },
    {
      id: 'conflicts' as const,
      label: 'Conflitos / Revisões',
      icon: AlertTriangle,
      badge: metrics.conflictsCount > 0 ? `${metrics.conflictsCount}` : '0',
      badgeColor: metrics.conflictsCount > 0 ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-slate-100 text-slate-500',
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
          Estrutura Canônica
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
    </aside>
  );
};
