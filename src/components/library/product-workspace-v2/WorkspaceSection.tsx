// src/components/library/product-workspace-v2/WorkspaceSection.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, Table, List, BookOpen } from 'lucide-react';
import { ProjectedSection, WorkspaceMode } from '../../../domain/product-workspace/types';
import { WorkspaceFactGrid } from './WorkspaceFactGrid';
import { WorkspaceDatumList } from './WorkspaceDatumList';
import { WorkspaceTechnicalTable } from './WorkspaceTechnicalTable';
import { WorkspaceTextBlock } from './WorkspaceTextBlock';
import { WorkspaceSourceBlock } from './WorkspaceSourceBlock';

export interface WorkspaceSectionProps {
  section: ProjectedSection;
  mode?: WorkspaceMode;
  onTraceSource?: (datumId: string) => void;
  onEditSemantics?: (canonicalKey: string) => void;
  onRenameSection?: (sectionId: string, newTitle: string) => void;
}

export const WorkspaceSection: React.FC<WorkspaceSectionProps> = ({
  section,
  mode = 'simple',
  onTraceSource,
  onEditSemantics,
  onRenameSection
}) => {
  const [isCollapsed, setIsCollapsed] = useState(section.collapsed);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(section.title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue !== section.title && onRenameSection) {
      onRenameSection(section.id, titleValue.trim());
    }
  };

  const renderIcon = () => {
    switch (section.icon) {
      case 'sparkles':
        return <Sparkles className="w-4 h-4 text-blue-500" />;
      case 'table':
        return <Table className="w-4 h-4 text-emerald-500" />;
      case 'list':
        return <List className="w-4 h-4 text-purple-500" />;
      case 'book':
        return <BookOpen className="w-4 h-4 text-amber-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-sm overflow-hidden transition-all">
      {/* Section Header */}
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/60"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {renderIcon()}

          {isEditingTitle ? (
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') {
                  setTitleValue(section.title);
                  setIsEditingTitle(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="text-base font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-blue-500 outline-none"
            />
          ) : (
            <h3
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              title="Dê duplo clique para renomear a seção"
            >
              {section.title}
            </h3>
          )}

          {section.description && (
            <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500 font-normal">
              • {section.description}
            </span>
          )}
        </div>

        <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
          {section.blocks.length} {section.blocks.length === 1 ? 'bloco' : 'blocos'}
        </div>
      </div>

      {/* Section Content */}
      {!isCollapsed && (
        <div className="p-6 space-y-6">
          {section.blocks.map((block) => {
            switch (block.kind) {
              case 'fact_grid':
                return (
                  <WorkspaceFactGrid
                    key={block.id}
                    title={block.title}
                    items={block.items}
                    columns={block.columns}
                    mode={mode}
                    onTraceSource={onTraceSource}
                    onEditSemantics={onEditSemantics}
                  />
                );

              case 'datum_list':
                return (
                  <WorkspaceDatumList
                    key={block.id}
                    title={block.title}
                    items={block.items}
                    mode={mode}
                    onTraceSource={onTraceSource}
                    onEditSemantics={onEditSemantics}
                  />
                );

              case 'technical_table':
              case 'dataset_view':
                return (
                  <WorkspaceTechnicalTable
                    key={block.id}
                    table={block.table}
                    mode={mode}
                    onTraceSource={onTraceSource}
                  />
                );

              case 'text_note':
                return (
                  <WorkspaceTextBlock
                    key={block.id}
                    title={block.title}
                    content={block.content}
                    calloutVariant={block.calloutVariant}
                  />
                );

              case 'source_group':
                return (
                  <WorkspaceSourceBlock
                    key={block.id}
                    title={block.title}
                    sources={block.sources}
                  />
                );

              case 'divider':
                return (
                  <hr
                    key={block.id}
                    className="border-slate-100 dark:border-slate-800"
                  />
                );

              default:
                return null;
            }
          })}
        </div>
      )}
    </div>
  );
};
