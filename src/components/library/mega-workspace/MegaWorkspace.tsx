// src/components/library/mega-workspace/MegaWorkspace.tsx
// Casca visual principal de produção do Mega Workspace (PIM.MEGA.WORKSPACE.INTEGRATION1).
// Integra Header, NavOutline, Seções, Blocos e Drawers em arquitetura estritamente read-only.
// Zero explicit any.

import React, { useState } from 'react';
import {
  MegaWorkspaceViewModel,
  ProjectedFactVM,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceNavOutline } from './WorkspaceNavOutline';
import { WorkspaceSection } from './WorkspaceSection';
import { ConflictsBlock } from './ConflictsBlock';
import { SourceDrawer } from './SourceDrawer';
import { SemanticAdvancedDrawer } from './SemanticAdvancedDrawer';
import { EmptyStateBlock } from './EmptyStateBlock';

export interface MegaWorkspaceProps {
  viewModel: MegaWorkspaceViewModel;
  onUpdateSession: (patch: Partial<WorkspaceSessionVM>) => void;
  onClose: () => void;
  onSwitchToLegacy?: () => void;
}

export const MegaWorkspace: React.FC<MegaWorkspaceProps> = ({
  viewModel,
  onUpdateSession,
  onClose,
  onSwitchToLegacy
}) => {
  const [selectedFactForSource, setSelectedFactForSource] = useState<ProjectedFactVM | null>(null);
  const [selectedFactForSemantic, setSelectedFactForSemantic] = useState<ProjectedFactVM | null>(null);

  const handleSelectSection = (sectionId: string) => {
    onUpdateSession({ activeSectionId: sectionId });
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150"
      role="main"
      aria-label={`Mega Workspace de ${viewModel.product.displayName}`}
    >
      {/* Header Institucional & Controles de Eixos */}
      <WorkspaceHeader
        product={viewModel.product}
        metrics={viewModel.metrics}
        session={viewModel.session}
        onUpdateSession={onUpdateSession}
        onClose={onClose}
        onSwitchToLegacy={onSwitchToLegacy}
      />

      {/* Corpo do Workspace */}
      <div className="flex-1 overflow-y-auto">
        {viewModel.isEmptyState ? (
          <EmptyStateBlock product={viewModel.product} onClose={onClose} />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Bloco de Divergências Oficiais (se houver) */}
            {Object.keys(viewModel.conflictsByFactId).length > 0 && (
              <div className="mb-6">
                <ConflictsBlock
                  conflictsByFactId={viewModel.conflictsByFactId}
                  factsById={viewModel.factsById}
                  onOpenSourceTrace={(fact) => setSelectedFactForSource(fact)}
                />
              </div>
            )}

            {/* Layout Principal: Nav Lateral + Seções Contínuas */}
            <div className="flex items-start gap-8">
              <WorkspaceNavOutline
                sections={viewModel.sections}
                activeSectionId={viewModel.session.activeSectionId}
                onSelectSection={handleSelectSection}
              />

              <div className="flex-1 min-w-0 space-y-6">
                {viewModel.sections.map((section) => (
                  <WorkspaceSection
                    key={section.id}
                    section={section}
                    factsById={viewModel.factsById}
                    sourcesById={viewModel.sourcesById}
                    session={viewModel.session}
                    onOpenSourceTrace={(fact) => setSelectedFactForSource(fact)}
                    onOpenSemanticAdvanced={(fact) => setSelectedFactForSemantic(fact)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer de Evidências e Fontes */}
      <SourceDrawer
        fact={selectedFactForSource}
        sourcesById={viewModel.sourcesById}
        isOpen={Boolean(selectedFactForSource)}
        onClose={() => setSelectedFactForSource(null)}
        onOpenSemanticAdvanced={(fact) => {
          setSelectedFactForSource(null);
          setSelectedFactForSemantic(fact);
        }}
      />

      {/* Drawer de Identidade Semântica Avançada (Modo Engenharia) */}
      <SemanticAdvancedDrawer
        fact={selectedFactForSemantic}
        isOpen={Boolean(selectedFactForSemantic)}
        onClose={() => setSelectedFactForSemantic(null)}
      />
    </div>
  );
};
