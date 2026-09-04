// src/labs/product-workspace-ux/MegaWorkspaceLab.tsx
import React, { useState } from 'react';
import { useMegaWorkspaceState } from './useMegaWorkspaceState';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { WorkspaceNavOutline } from './components/WorkspaceNavOutline';
import { WorkspaceSectionComponent } from './components/WorkspaceSection';
import { TransformCardsSuggestionBanner } from './components/TransformCardsSuggestionBanner';
import { AddTechnicalInfoModal } from './components/AddTechnicalInfoModal';
import { EditFactModal } from './components/EditFactModal';
import { SourceDrawer } from './components/SourceDrawer';
import { ConflictReviewModal } from './components/ConflictReviewModal';
import { SemanticRenameModal } from './components/SemanticRenameModal';
import { SemanticAdvancedDrawer } from './components/SemanticAdvancedDrawer';
import { AIOrganizeModal } from './components/AIOrganizeModal';
import { AIImportModal } from './components/AIImportModal';
import { CreateTableModal } from './components/CreateTableModal';
import { MegaTableBlock } from './components/MegaTableBlock';
import { UndoToast } from './components/UndoToast';
import { SearchResultItem } from './types';

export const MegaWorkspaceLab: React.FC = () => {
  const state = useMegaWorkspaceState();
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Scroll suave até a seção
  const handleScrollToSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectSearchResult = (result: SearchResultItem) => {
    handleScrollToSection(result.sectionId);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col antialiased selection:bg-blue-100 selection:text-[#003366]">
      {/* Header Sticky Global */}
      <WorkspaceHeader
        mode={state.mode}
        setMode={state.setMode}
        perspective={state.perspective}
        setPerspective={state.setPerspective}
        searchQuery={state.searchQuery}
        setSearchQuery={state.setSearchQuery}
        searchResults={state.searchResults}
        onSelectSearchResult={handleSelectSearchResult}
        onOpenAddModal={() => {
          state.setTargetSectionForAdd(null);
          state.setIsAddModalOpen(true);
        }}
        onOpenAIOrganize={() => state.setIsAIOrganizeModalOpen(true)}
        onOpenAIImport={() => state.setIsAIImportModalOpen(true)}
        onOpenCreateTable={() => state.setIsCreateTableModalOpen(true)}
      />

      {/* Barra de Notificação de Modo de Organização Ativo */}
      {state.mode === 'edit_workspace' && (
        <div className="bg-amber-500 text-white text-xs font-semibold py-2 px-4 shadow-xs sticky top-[73px] z-20 flex items-center justify-between">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>
              <strong>Modo de Organização Ativo:</strong> Arraste seções e blocos, renomeie títulos e redimensione tabelas. A edição de dados continua protegida.
            </span>
            <button
              onClick={() => state.setMode('view')}
              className="ml-auto px-2.5 py-1 bg-white text-amber-900 font-bold rounded hover:bg-amber-50 transition-colors"
            >
              Concluir Organização
            </button>
          </div>
        </div>
      )}

      {/* Conteúdo Central e Navigation Rail */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-8">
        {/* Navigation Rail Lateral Fixo */}
        <WorkspaceNavOutline
          sections={state.sections}
          activeSectionId={activeSectionId}
          onScrollToSection={handleScrollToSection}
          onExpandAll={state.expandAllSections}
          onCollapseAll={state.collapseAllSections}
        />

        {/* Coluna Principal do Workspace Editorial */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* Banner Inteligente de Sugestão de Tabela */}
          <TransformCardsSuggestionBanner
            show={state.showTransformSuggestion}
            onDismiss={() => state.setShowTransformSuggestion(false)}
            onPreviewTransform={() => {
              state.transformSelectedFactsIntoTable(
                'sec-metrologia',
                ['f-metro-axial', 'f-metro-radial', 'f-metro-stab-time'],
                'Matriz de Uniformidade e Estabilidade'
              );
            }}
          />

          {/* Renderização de Cada Seção */}
          {state.sections.map((section, sIdx) => (
            <WorkspaceSectionComponent
              key={section.id}
              section={section}
              mode={state.mode}
              onToggleCollapse={() => state.toggleSectionCollapse(section.id)}
              onRenameSection={(newTitle) => state.renameSection(section.id, newTitle)}
              onMoveUp={sIdx > 0 ? () => state.moveSection(sIdx, sIdx - 1) : undefined}
              onMoveDown={sIdx < state.sections.length - 1 ? () => state.moveSection(sIdx, sIdx + 1) : undefined}
              onMoveBlockUp={(blockId) => state.moveBlockUp(section.id, blockId)}
              onMoveBlockDown={(blockId) => state.moveBlockDown(section.id, blockId)}
              onResizeBlock={(blockId, sz) => state.resizeBlock(section.id, blockId, sz)}
              onHideBlock={(blockId) => state.hideBlock(section.id, blockId)}
              onDeleteBlock={(blockId) => state.deleteBlock(section.id, blockId)}
              onAddFactToSection={() => {
                state.setTargetSectionForAdd(section.id);
                state.setIsAddModalOpen(true);
              }}
              onEditFact={(fact) => state.setSelectedFactForEdit(fact)}
              onOpenSource={(fact) => state.setSelectedFactForSource(fact)}
              onOpenSemantic={(fact) => state.setSelectedSemanticForRename(fact)}
              onReviewConflict={(conflict) => state.setSelectedConflictForReview(conflict)}
              onToggleMegaTableFullscreen={(block) => state.setExpandedMegaTable(block)}
              onToggleFactVisibility={(factId) => state.toggleFactVisibility(factId)}
            />
          ))}
        </main>
      </div>

      {/* Modais e Drawers Interativos */}
      <AddTechnicalInfoModal
        isOpen={state.isAddModalOpen}
        onClose={() => state.setIsAddModalOpen(false)}
        sectionTitle={state.sections.find((s) => s.id === state.targetSectionForAdd)?.title}
        onAddFact={(factData) => {
          const target = state.targetSectionForAdd || state.sections[0].id;
          state.addFact(target, factData);
        }}
      />

      <EditFactModal
        fact={state.selectedFactForEdit}
        isOpen={Boolean(state.selectedFactForEdit)}
        onClose={() => state.setSelectedFactForEdit(null)}
        onSave={(id, draft, scope) => state.stageFactEdit(id, draft, scope)}
        onOpenSource={(fact) => state.setSelectedFactForSource(fact)}
      />

      <SourceDrawer
        fact={state.selectedFactForSource}
        isOpen={Boolean(state.selectedFactForSource)}
        onClose={() => state.setSelectedFactForSource(null)}
        onOpenConflictReview={(fact) => state.setSelectedConflictForReview(fact)}
      />

      <ConflictReviewModal
        conflict={state.selectedConflictForReview}
        isOpen={Boolean(state.selectedConflictForReview)}
        onClose={() => state.setSelectedConflictForReview(null)}
        onResolve={(factId, val, unid) => state.resolveConflict(factId, val, unid)}
      />

      <SemanticRenameModal
        fact={state.selectedSemanticForRename}
        isOpen={Boolean(state.selectedSemanticForRename)}
        onClose={() => state.setSelectedSemanticForRename(null)}
        onConfirmRename={(oldK, newK) => state.performSafeSemanticRename(oldK, newK)}
      />

      <SemanticAdvancedDrawer
        fact={state.selectedSemanticForRename}
        isOpen={false} // Ativado pelo modal de semântica quando necessário
        onClose={() => state.setSelectedSemanticForRename(null)}
        onOpenRenameModal={(fact) => state.setSelectedSemanticForRename(fact)}
      />

      <AIOrganizeModal
        isOpen={state.isAIOrganizeModalOpen}
        onClose={() => state.setIsAIOrganizeModalOpen(false)}
        onApply={state.applyAIOrganization}
      />

      <AIImportModal
        isOpen={state.isAIImportModalOpen}
        onClose={() => state.setIsAIImportModalOpen(false)}
      />

      <CreateTableModal
        isOpen={state.isCreateTableModalOpen}
        onClose={() => state.setIsCreateTableModalOpen(false)}
        sections={state.sections}
        onCreateTable={(secId, title, cols, rows) => state.createNewTable(secId, title, cols, rows)}
      />

      {/* Modal de Tabela Quase Fullscreen */}
      {state.expandedMegaTable && state.expandedMegaTable.data.kind === 'mega_table' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="w-full h-full max-w-7xl max-h-[92vh] flex flex-col">
            <MegaTableBlock
              table={state.expandedMegaTable.data.table}
              mode={state.mode}
              isFullscreen={true}
              onToggleFullscreen={() => state.setExpandedMegaTable(null)}
            />
          </div>
        </div>
      )}

      {/* Toast de Desfazer Local */}
      <UndoToast
        message={state.undoToastMessage}
        onUndo={state.undo}
        onDismiss={state.dismissUndoToast}
      />
    </div>
  );
};
