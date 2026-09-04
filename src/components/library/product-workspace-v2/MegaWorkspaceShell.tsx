// src/components/library/product-workspace-v2/MegaWorkspaceShell.tsx
import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Plus,
  Layers,
  Search
} from 'lucide-react';
import {
  WorkspaceProjection,
  WorkspaceMode,
  SemanticDescriptor,
  ProjectedSourceTrace,
  AiProductKnowledgeEnvelope
} from '../../../domain/product-workspace/types';
import { WorkspaceSection } from './WorkspaceSection';
import { WorkspaceSearch } from './WorkspaceSearch';
import { SourceTraceDrawer } from './SourceTraceDrawer';
import { SemanticEditor } from './SemanticEditor';
import { AiKnowledgeInspector } from './AiKnowledgeInspector';

export interface MegaWorkspaceShellProps {
  projection: WorkspaceProjection;
  activeTrace: ProjectedSourceTrace | null;
  selectedDescriptor: SemanticDescriptor | null;
  aiEnvelope: AiProductKnowledgeEnvelope | null;
  onSelectTrace: (datumId: string | null) => void;
  onSelectSemantics: (canonicalKey: string | null) => void;
  onSaveDescriptor: (updated: SemanticDescriptor) => void;
  onRenameSection?: (sectionId: string, newTitle: string) => void;
  onAddInformation?: (type: 'editorial_note' | 'technical_spec') => void;
}

export const MegaWorkspaceShell: React.FC<MegaWorkspaceShellProps> = ({
  projection,
  activeTrace,
  selectedDescriptor,
  aiEnvelope,
  onSelectTrace,
  onSelectSemantics,
  onSaveDescriptor,
  onRenameSection,
  onAddInformation
}) => {
  const [mode, setMode] = useState<WorkspaceMode>(projection.mode || 'simple');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filtra seções com base na busca
  const filteredSections = projection.sections.filter((sec) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (sec.title.toLowerCase().includes(q)) return true;
    // Checa se algum bloco contém o termo
    return sec.blocks.some((b) => {
      if (b.kind === 'fact_grid' || b.kind === 'datum_list') {
        return b.items.some(
          (i) =>
            i.displayLabel.toLowerCase().includes(q) ||
            i.formattedValue.toLowerCase().includes(q) ||
            i.aliases.some((a) => a.toLowerCase().includes(q))
        );
      }
      if (b.kind === 'technical_table' || b.kind === 'dataset_view') {
        return b.table.title.toLowerCase().includes(q);
      }
      if (b.kind === 'text_note') {
        return b.content.toLowerCase().includes(q);
      }
      return false;
    });
  });

  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-24">
      {/* Top Navigation / App Bar */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Product Title & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {projection.title}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {projection.stats.totalDatums} especificações
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ficha Técnica Unificada • Separação estrita entre verdade de dados e apresentação humana
              </p>
            </div>
          </div>

          {/* Action Tools & Search Bar */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <WorkspaceSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
              matchesCount={searchQuery ? filteredSections.length : undefined}
            />

            {/* Simple / Advanced Toggle */}
            <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setMode('simple')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  mode === 'simple'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setMode('advanced')}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  mode === 'advanced'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Avançado
              </button>
            </div>

            {/* AI Knowledge Envelope Button */}
            <button
              type="button"
              onClick={() => setIsAiDrawerOpen(true)}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:hover:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1.5 transition-colors"
              title="Inspecionar visão consumida por IA"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">Visão de IA</span>
            </button>

            {/* Add Information Button */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Informação</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 pt-6 space-y-8">
        {/* Executive Highlights Bar (Top Facts) */}
        {projection.summaryFacts.length > 0 && !searchQuery && (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/60 border border-slate-200/90 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Destaques Principais
                </h2>
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {projection.stats.inheritedDatums} herdados da família • {projection.stats.localDatums} locais
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {projection.summaryFacts.map((fact) => (
                <div
                  key={fact.datumId}
                  onClick={() => onSelectTrace(fact.datumId)}
                  className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-blue-400 dark:hover:border-blue-600 transition-all cursor-pointer group"
                >
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 line-clamp-1">
                    {fact.displayLabel}
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {fact.formattedValue}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workspace Sections List */}
        <div className="space-y-6">
          {filteredSections.map((section) => (
            <WorkspaceSection
              key={section.id}
              section={section}
              mode={mode}
              onTraceSource={(datumId) => onSelectTrace(datumId)}
              onEditSemantics={(key) => onSelectSemantics(key)}
              onRenameSection={onRenameSection}
            />
          ))}

          {filteredSections.length === 0 && (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-400" />
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Nenhuma especificação encontrada para "{searchQuery}"
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tente buscar por termos mais genéricos ou limpe a busca.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Drawers & Modals Integrados */}
      <SourceTraceDrawer
        isOpen={Boolean(activeTrace)}
        onClose={() => onSelectTrace(null)}
        trace={activeTrace}
        mode={mode}
      />

      <SemanticEditor
        isOpen={Boolean(selectedDescriptor)}
        onClose={() => onSelectSemantics(null)}
        descriptor={selectedDescriptor}
        onSave={onSaveDescriptor}
      />

      <AiKnowledgeInspector
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        envelope={aiEnvelope}
      />

      {/* Add Information Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsAddModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Adicionar Nova Informação
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha se deseja adicionar uma anotação editorial livre ou uma nova especificação técnica canônica.
            </p>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  onAddInformation?.('editorial_note');
                }}
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-all group"
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600">
                  Nota / Informação Editorial
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Anotações de aplicação, avisos comerciais ou observações de vendas. Não contamina a verdade técnica do produto.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  onAddInformation?.('technical_spec');
                }}
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left transition-all group"
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600">
                  Especificação Técnica Canônica
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cria um TechnicalDatum formal com tipo estrito, unidade e vínculo a evidência documental.
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
