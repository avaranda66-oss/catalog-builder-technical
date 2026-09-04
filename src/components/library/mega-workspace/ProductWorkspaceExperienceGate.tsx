// src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx
// Gate de experiência entre o Workspace Legado Mutável e o Mega Workspace Read-Only (Emendas C & M).
// Padrão: Legacy. Opt-in: Mega Workspace Beta (suporta ?workspace=mega na URL e toggle em tela).
// Zero explicit any.

import React, { useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ProductKnowledgeWorkspace } from '../product-workspace/ProductKnowledgeWorkspace';
import {
  MegaWorkspaceReadOnlyContainer,
  ProductWorkbookReadRepository,
  ProductSourceDocumentReadRepository
} from './MegaWorkspaceReadOnlyContainer';

export interface ProductWorkspaceExperienceGateProps {
  product: Product;
  family?: ProductFamily;
  onClose: () => void;
  availableProducts?: readonly Product[];
  forcedExperience?: 'legacy' | 'mega';
  workbookRepo?: ProductWorkbookReadRepository;
  sourceRepo?: ProductSourceDocumentReadRepository;
}

export const ProductWorkspaceExperienceGate: React.FC<ProductWorkspaceExperienceGateProps> = ({
  product,
  family,
  onClose,
  availableProducts = [],
  forcedExperience,
  workbookRepo,
  sourceRepo
}) => {
  const [experience, setExperience] = useState<'legacy' | 'mega'>(() => {
    if (forcedExperience) return forcedExperience;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('workspace') === 'mega') return 'mega';
    }

    // Padrão de homologação: Sempre Legacy em nova abertura (Emenda Blocker 11)
    return 'legacy';
  });

  const handleSwitchToMega = () => {
    setExperience('mega');
  };

  const handleSwitchToLegacy = () => {
    setExperience('legacy');
  };

  if (experience === 'mega') {
    return (
      <MegaWorkspaceReadOnlyContainer
        product={product}
        family={family}
        onClose={onClose}
        onSwitchToLegacy={handleSwitchToLegacy}
        workbookRepo={workbookRepo}
        sourceRepo={sourceRepo}
      />
    );
  }

  return (
    <div className="relative">
      {/* Banner de Opt-in discreto para o Mega Workspace Beta sobre o workspace legado */}
      <div className="fixed top-3 right-20 z-60 pointer-events-auto">
        <button
          onClick={handleSwitchToMega}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95"
          title="Experimentar a nova interface unificada do Mega Workspace"
        >
          <span>✨ Testar Mega Workspace</span>
          <span className="bg-white/20 text-[10px] px-1 rounded font-mono">BETA</span>
        </button>
      </div>

      <ProductKnowledgeWorkspace
        product={product}
        family={family}
        onClose={onClose}
        availableProducts={availableProducts}
      />
    </div>
  );
};
