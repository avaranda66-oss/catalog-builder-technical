// src/components/library/mega-workspace/MegaWorkspaceReadOnlyContainer.tsx
// Container de Produção do Mega Workspace com isolamento arquitetural Read-Only (Emenda C).
// Tipagem restrita a Pick<Repository, 'getWorkbook'> e Pick<SourceRepo, 'getSourceDocument' | 'listSourceDocuments'>.
// Impossível salvar por construção (Zero mutação).
// Zero explicit any.

import React, { useState, useEffect } from 'react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import {
  ProductWorkbookRepository,
  ProductSourceDocumentRepository
} from '../../../services/product-workbook/persistence.types';
import { SupabaseProductWorkbookRepository } from '../../../services/product-workbook/product-workbook.repository';
import { SupabaseProductSourceDocumentRepository } from '../../../services/product-workbook/source-document.repository';
import { getSupabase } from '../../../services/supabase.service';
import {
  buildMegaWorkspaceViewModel,
  collectReferencedSourceDocumentIds,
  MegaWorkspaceViewModel,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';
import { resolveEffectiveProductKnowledge } from '../../../domain/product-workbook/inheritance.engine';
import { ProductWorkbookV2, SourceDocument } from '../../../domain/product-workbook/types';
import { MegaWorkspace } from './MegaWorkspace';
import { HumanFriendlyErrorBanner } from '../../common/HumanFriendlyErrorBanner';

export type ProductWorkbookReadRepository = Pick<ProductWorkbookRepository, 'getWorkbook'>;
export type ProductSourceDocumentReadRepository = Pick<
  ProductSourceDocumentRepository,
  'getSourceDocument' | 'listSourceDocuments'
>;

export interface MegaWorkspaceReadOnlyContainerProps {
  product: Product;
  family?: ProductFamily;
  onClose: () => void;
  onSwitchToLegacy?: () => void;
  workbookRepo?: ProductWorkbookReadRepository;
  sourceRepo?: ProductSourceDocumentReadRepository;
}

export const MegaWorkspaceReadOnlyContainer: React.FC<MegaWorkspaceReadOnlyContainerProps> = ({
  product,
  family,
  onClose,
  onSwitchToLegacy,
  workbookRepo,
  sourceRepo
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [productWorkbook, setProductWorkbook] = useState<ProductWorkbookV2 | null>(null);
  const [familyWorkbook, setFamilyWorkbook] = useState<ProductWorkbookV2 | null>(null);
  const [sourceDocuments, setSourceDocuments] = useState<readonly SourceDocument[]>([]);
  const [session, setSession] = useState<WorkspaceSessionVM>({
    interactionMode: 'view',
    detailLevel: 'simple'
  });

  const effectiveWorkbookRepo: ProductWorkbookReadRepository = React.useMemo(() => {
    return workbookRepo || new SupabaseProductWorkbookRepository(getSupabase());
  }, [workbookRepo]);

  const effectiveSourceRepo: ProductSourceDocumentReadRepository = React.useMemo(() => {
    return sourceRepo || new SupabaseProductSourceDocumentRepository(getSupabase());
  }, [sourceRepo]);

  useEffect(() => {
    let isCancelled = false;

    async function loadWorkspaceData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        // 1. Carrega Workbook do Produto
        const prodWb = await effectiveWorkbookRepo.getWorkbook({
          kind: 'product',
          id: product.id
        });

        // 2. Carrega Workbook da Família (se houver)
        let famWb: ProductWorkbookV2 | null = null;
        if (family?.id || product.family_id) {
          const famId = family?.id || product.family_id!;
          famWb = (await effectiveWorkbookRepo.getWorkbook({
            kind: 'family',
            id: famId
          })) as ProductWorkbookV2 | null;
        }

        // 3. Resolve Conhecimento Preliminar para identificar Fontes Referenciadas (Emenda D)
        const preliminaryKnowledge = resolveEffectiveProductKnowledge({
          productId: product.id,
          familyWorkbook: famWb,
          productWorkbook: prodWb as ProductWorkbookV2 | null,
          policy: 'effective_for_publishing'
        });

        const referencedDocIds = collectReferencedSourceDocumentIds(preliminaryKnowledge);

        // 4. Carrega EXATAMENTE os IDs referenciados (Emenda D: Nunca listSourceDocuments() sem filtro)
        let loadedSources: SourceDocument[] = [];
        if (referencedDocIds.length > 0) {
          loadedSources = await effectiveSourceRepo.listSourceDocuments([...referencedDocIds]);
        }

        if (!isCancelled) {
          setProductWorkbook(prodWb as ProductWorkbookV2 | null);
          setFamilyWorkbook(famWb);
          setSourceDocuments(loadedSources);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('[MegaWorkspaceReadOnlyContainer] Erro ao carregar dados:', err);
          const msg = err instanceof Error ? err.message : 'Falha ao carregar o Mega Workspace.';
          setErrorMessage(msg);
          setIsLoading(false);
        }
      }
    }

    loadWorkspaceData();

    return () => {
      isCancelled = true;
    };
  }, [product.id, product.family_id, family?.id, effectiveWorkbookRepo, effectiveSourceRepo]);

  const handleUpdateSession = (patch: Partial<WorkspaceSessionVM>) => {
    setSession((prev) => ({ ...prev, ...patch }));
  };

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 z-50 bg-slate-100/90 backdrop-blur-xs flex flex-col items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-12 h-12 border-4 border-slate-200 border-t-[#003366] rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">
          Carregando Mega Workspace de {product.model || product.id}...
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Resolvendo conhecimento canônico e rastreabilidade de fontes
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-red-200">
          <HumanFriendlyErrorBanner
            message="Não foi possível abrir o Mega Workspace"
            details={errorMessage}
          />
          <div className="mt-6 flex justify-end gap-3">
            {onSwitchToLegacy && (
              <button
                onClick={onSwitchToLegacy}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Abrir no Workspace Clássico
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Constrói o ViewModel normalizado em tempo de execução
  const viewModel: MegaWorkspaceViewModel = buildMegaWorkspaceViewModel({
    product: {
      id: product.id,
      model: product.model,
      code: product.code,
      family_id: product.family_id
    },
    family: family ? { id: family.id, name: family.name } : null,
    productWorkbook,
    familyWorkbook,
    sourceDocuments,
    session
  });

  return (
    <MegaWorkspace
      viewModel={viewModel}
      onUpdateSession={handleUpdateSession}
      onClose={onClose}
      onSwitchToLegacy={onSwitchToLegacy}
    />
  );
};
