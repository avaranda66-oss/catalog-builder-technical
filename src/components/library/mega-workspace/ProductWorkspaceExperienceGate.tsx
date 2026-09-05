// src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx
// Gate de experiência entre o Workspace Legado Mutável e o Mega Workspace Read-Only (Emendas C & M).
// Padrão: Legacy. Opt-in: Mega Workspace Beta (suporta ?workspace=mega na URL e toggle em tela).
// Zero explicit any.

import React, { useMemo, useState } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import { ProductKnowledgeWorkspace } from '../product-workspace/ProductKnowledgeWorkspace';
import {
  MegaWorkspaceReadOnlyContainer,
  ProductWorkbookReadRepository,
  ProductSourceDocumentReadRepository
} from './MegaWorkspaceReadOnlyContainer';
import { SupabaseProductWorkbookRepository } from '@/services/product-workbook';
import { getSupabase } from '@/services/supabase.service';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';
import { useUIStore } from '@/stores/useUIStore';

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
  const owner = useMemo(() => ({ kind: 'product' as const, id: product.id }), [product.id]);
  const saveRepository = useMemo(() => new SupabaseProductWorkbookRepository(getSupabase()), []);
  const session = useWorkbookDraftStore((state) => state.getSession(owner));
  const saveDraft = useWorkbookDraftStore((state) => state.save);
  const discardDraft = useWorkbookDraftStore((state) => state.discardWithRefresh);
  const advanceNavigationEpoch = useUIStore((state) => state.advanceNavigationEpoch);
  const hasRetainedDraft = Boolean(session && (
    session.localGeneration > session.acknowledgedGeneration
    || session.inFlight
    || session.failure
    || session.conflict
    || session.reconciliationRequired
  ));
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
    advanceNavigationEpoch();
    setExperience('mega');
  };

  const handleSwitchToLegacy = () => {
    advanceNavigationEpoch();
    setExperience('legacy');
  };

  const handleSaveAndSwitchToMega = async () => {
    const navigationToken = advanceNavigationEpoch();
    const saved = await saveDraft(owner, saveRepository);
    const currentSession = useWorkbookDraftStore.getState().getSession(owner);
    const navigationStillCurrent = useUIStore.getState().navigationEpoch === navigationToken;
    const clean = Boolean(currentSession && currentSession.localGeneration === currentSession.acknowledgedGeneration
      && !currentSession.inFlight
      && !currentSession.failure
      && !currentSession.conflict
      && !currentSession.reconciliationRequired);
    if (saved && clean && navigationStillCurrent) setExperience('mega');
  };

  const handleDiscardAndSwitchToMega = async () => {
    const navigationToken = advanceNavigationEpoch();
    const discarded = await discardDraft(owner, saveRepository, navigationToken);
    if (discarded && useUIStore.getState().navigationEpoch === navigationToken) setExperience('mega');
  };

  if (experience === 'mega') {
    return (
      <>
        {hasRetainedDraft && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-70 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-900 shadow-sm">
            Rascunho do Classic mantido nesta sessão. Volte ao Classic para continuar ou salvar.
          </div>
        )}
        <MegaWorkspaceReadOnlyContainer
          product={product}
          family={family}
          onClose={onClose}
          onSwitchToLegacy={handleSwitchToLegacy}
          workbookRepo={workbookRepo}
          sourceRepo={sourceRepo}
        />
      </>
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
          <span>{hasRetainedDraft ? '✨ Abrir Mega · preservar rascunho' : '✨ Testar Mega Workspace'}</span>
          <span className="bg-white/20 text-[10px] px-1 rounded font-mono">BETA</span>
        </button>
      </div>

      {hasRetainedDraft && (
        <div className="fixed top-12 right-4 z-60 flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[10px] shadow-md">
          <span className="font-semibold text-amber-800">Rascunho mantido nesta sessão</span>
          <button
            type="button"
            onClick={() => void handleSaveAndSwitchToMega()}
            disabled={Boolean(session?.inFlight || session?.conflict || session?.reconciliationRequired)}
            className="rounded bg-emerald-600 px-2 py-1 font-bold text-white disabled:opacity-50"
          >
            Salvar e abrir Mega
          </button>
          <button
            type="button"
            onClick={() => void handleDiscardAndSwitchToMega()}
            disabled={Boolean(session?.inFlight)}
            className="rounded border border-rose-300 px-2 py-1 font-bold text-rose-700 disabled:opacity-50"
          >
            Descartar e abrir Mega
          </button>
          <button type="button" className="rounded px-2 py-1 font-bold text-slate-600">
            Cancelar
          </button>
        </div>
      )}

      <ProductKnowledgeWorkspace
        product={product}
        family={family}
        onClose={onClose}
        availableProducts={availableProducts}
      />
    </div>
  );
};
