// src/components/library/mega-workspace/WorkspaceSection.tsx
// Seção estruturada de conteúdo técnico para o Mega Workspace (Produção).
// Agrupa blocos de fatos, tabelas, notas textuais e grupos de fontes.
// Zero explicit any.

import React from 'react';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
  AlertCircle,
  Lightbulb,
  FileText
} from 'lucide-react';
import {
  ProjectedSectionVM,
  ProjectedFactVM,
  ProjectedSourceVM,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';
import { FactGridBlock } from './FactGridBlock';
import { MegaTableBlock } from './MegaTableBlock';

interface WorkspaceSectionProps {
  section: ProjectedSectionVM;
  factsById: Readonly<Record<string, ProjectedFactVM>>;
  sourcesById: Readonly<Record<string, ProjectedSourceVM>>;
  session: WorkspaceSessionVM;
  onOpenSourceTrace: (fact: ProjectedFactVM) => void;
  onOpenSemanticAdvanced?: (fact: ProjectedFactVM) => void;
}

export const WorkspaceSection: React.FC<WorkspaceSectionProps> = ({
  section,
  factsById,
  sourcesById,
  session,
  onOpenSourceTrace,
  onOpenSemanticAdvanced
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(section.collapsed);

  return (
    <section
      id={`section-${section.id}`}
      className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all scroll-mt-32"
    >
      {/* Header da Seção */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="px-6 py-4 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {section.title}
            </h3>
            {section.description && (
              <p className="text-xs text-slate-500 mt-0.5">
                {section.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">
            {section.blocks.length} {section.blocks.length === 1 ? 'bloco' : 'blocos'}
          </span>
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
            aria-label={isCollapsed ? 'Expandir seção' : 'Recolher seção'}
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo da Seção */}
      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {section.blocks.map((block) => {
            if (block.visibility === 'hidden') return null;

            if (block.kind === 'fact_grid' || block.kind === 'datum_list') {
              return (
                <FactGridBlock
                  key={block.id}
                  block={block}
                  factsById={factsById}
                  session={session}
                  onOpenSourceTrace={onOpenSourceTrace}
                  onOpenSemanticAdvanced={onOpenSemanticAdvanced}
                />
              );
            }

            if (block.kind === 'technical_table' || block.kind === 'dataset_view') {
              return (
                <MegaTableBlock
                  key={block.id}
                  block={block}
                  factsById={factsById}
                  session={session}
                  onOpenSourceTrace={onOpenSourceTrace}
                />
              );
            }

            if (block.kind === 'text_note') {
              const variantStyles = {
                info: 'bg-blue-50/70 border-blue-200 text-blue-900',
                warning: 'bg-amber-50/70 border-amber-200 text-amber-900',
                tip: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
                editorial: 'bg-slate-50 border-slate-200 text-slate-800'
              }[block.calloutVariant];

              const icon = {
                info: <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />,
                warning: <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />,
                tip: <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />,
                editorial: <FileText className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              }[block.calloutVariant];

              return (
                <div
                  key={block.id}
                  className={`p-4 rounded-xl border flex items-start gap-3 ${variantStyles}`}
                >
                  {icon}
                  <div>
                    {block.title && (
                      <h5 className="text-xs font-bold uppercase tracking-wider mb-1">
                        {block.title}
                      </h5>
                    )}
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">
                      {block.content}
                    </p>
                  </div>
                </div>
              );
            }

            if (block.kind === 'source_group') {
              return (
                <div key={block.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  {block.title && (
                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                      {block.title}
                    </h5>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {block.sourceIds.map((srcId) => {
                      const src = sourcesById[srcId];
                      return (
                        <div
                          key={srcId}
                          className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center gap-2 text-xs"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-medium text-slate-800 truncate">
                            {src?.title || srcId}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (block.kind === 'divider') {
              return <hr key={block.id} className="border-slate-200" />;
            }

            return null;
          })}
        </div>
      )}
    </section>
  );
};
