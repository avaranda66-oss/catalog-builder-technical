// src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx
// FASE 10-17: Workspace de Conhecimento Técnico Canônico (PIM Core V1)
// Interface profissional, estritamente tipada e com controle de concorrência CAS.

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Table,
  FileText,
  Save,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Cpu,
  Image as ImageIcon
} from 'lucide-react';
import { Product, ProductFamily } from '../../../domain/product.schema';
import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  createWorkbook,
  ensureWorkbookV2,
  resolveEffectiveProductKnowledge
} from '../../../domain/product-workbook';
import {
  SupabaseProductWorkbookRepository
} from '../../../services/product-workbook';
import { getSupabase } from '../../../services/supabase.service';
import { useWorkbookDraftStore } from '@/stores/useWorkbookDraftStore';
import { activeEditingContext, createWorkbookSaveTarget } from '@/stores/activeEditingContext';
import { useUIStore } from '@/stores/useUIStore';

import { WorkspaceSummaryTab } from './WorkspaceSummaryTab';
import { WorkspaceTechnicalDataTab } from './WorkspaceTechnicalDataTab';
import { WorkspaceTechnicalTablesTab } from './WorkspaceTechnicalTablesTab';
import { WorkspaceDocumentsEvidenceTab } from './WorkspaceDocumentsEvidenceTab';
import { ProductAssetManager } from '../ProductAssetManager';
import { HumanFriendlyErrorBanner } from '../../common/HumanFriendlyErrorBanner';

interface ProductKnowledgeWorkspaceProps {
  product: Product;
  family?: ProductFamily;
  onClose: () => void;
  availableProducts?: readonly Product[];
}

type WorkspaceTab =
  | 'summary'
  | 'technical_data'
  | 'technical_tables'
  | 'accessories'
  | 'ordering'
  | 'documents'
  | 'assets'
  | 'history';

export const ProductKnowledgeWorkspace: React.FC<ProductKnowledgeWorkspaceProps> = ({
  product,
  family,
  onClose,
  availableProducts = []
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('summary');
  const owner = useMemo(() => ({ kind: 'product' as const, id: product.id }), [product.id]);
  const familyOwner = useMemo(
    () => product.family_id ? ({ kind: 'family' as const, id: product.family_id }) : null,
    [product.family_id]
  );
  const repository = useMemo(() => new SupabaseProductWorkbookRepository(getSupabase()), []);
  const session = useWorkbookDraftStore((state) => state.getSession(owner));
  const familySession = useWorkbookDraftStore((state) => familyOwner ? state.getSession(familyOwner) : undefined);
  const loadDraft = useWorkbookDraftStore((state) => state.load);
  const refreshDraft = useWorkbookDraftStore((state) => state.refresh);
  const editDraft = useWorkbookDraftStore((state) => state.edit);
  const saveDraft = useWorkbookDraftStore((state) => state.save);
  const discardWithRefresh = useWorkbookDraftStore((state) => state.discardWithRefresh);
  const navigationEpoch = useUIStore((state) => state.navigationEpoch);

  const fallbackWorkbook = useMemo(() => ensureWorkbookV2(createWorkbook({ owner, revision: 0 })), [owner]);
  const workbook = session?.draft || fallbackWorkbook;
  const familyWorkbook = familySession?.verified && (familySession.baseRevision ?? 0) > 0
    ? familySession.draft
    : undefined;
  const isDirty = Boolean(session && session.localGeneration > session.acknowledgedGeneration);
  const isSaving = Boolean(session?.inFlight);
  const isLoading = Boolean(session?.isLoading || familySession?.isLoading);
  const conflict = session?.conflict || null;
  const reconciliation = session?.reconciliationRequired || null;
  const familyError = familySession?.loadError || null;
  const isResolvingConflict = Boolean(session?.discardToken);
  const isSaveBlocked = Boolean(conflict || reconciliation);
  const errorMessage = session?.failure?.message || session?.loadError || familyError;
  const technicalErrorDetails = errorMessage;

  useEffect(() => {
    void loadDraft(owner, repository);
  }, [loadDraft, owner, repository]);

  useEffect(() => {
    if (familyOwner) void loadDraft(familyOwner, repository);
  }, [familyOwner, loadDraft, repository]);

  useEffect(() => {
    const generation = activeEditingContext.activateWorkbook(product.id, createWorkbookSaveTarget(owner, repository));
    return () => activeEditingContext.release(generation);
  }, [owner, product.id, repository]);

  // Resolve conhecimento efetivo herdado
  const effectiveKnowledge: ResolvedProductKnowledge = resolveEffectiveProductKnowledge({
    productWorkbook: workbook,
    familyWorkbook
  });

  const handleUpdateWorkbook = (updated: ProductWorkbookV2) => {
    editDraft(owner, updated);
  };

  const handleSave = async () => {
    await saveDraft(owner, repository);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden font-sans text-slate-800 select-none">
      {/* 1. Header do Workspace */}
      <header className="h-14 bg-[#002244] text-white px-4 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Voltar à Biblioteca"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm font-mono tracking-tight">{product.model}</span>
              <span className="text-[11px] text-blue-200">({product.code})</span>
              {family && (
                <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full text-blue-100 font-medium">
                  {family.name}
                </span>
              )}
            </div>
            <div className="text-[10px] text-blue-300 flex items-center gap-2">
              <span>PIM Workspace Canônico V2</span>
              <span>·</span>
              <span>Revisão Persistida: {workbook.revision}</span>
              {isDirty && (
                <span className="text-amber-400 font-bold">● Rascunho mantido nesta sessão (não salvo)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1.5 text-xs text-blue-200 mr-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Sincronizando...</span>
            </div>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={isSaving || !isDirty || isSaveBlocked}
            title={
              conflict
                ? 'Salvar bloqueado até descartar o rascunho local e recarregar o servidor.'
                : reconciliation
                  ? 'Salvar bloqueado até descartar o rascunho local e recarregar o servidor.'
                  : undefined
            }
            className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs ${
              isDirty && !isSaveBlocked
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Salvando CAS...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Conhecimento</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Alerta de Conflito CAS */}
      {conflict && (
        <div role="alert" className="bg-rose-50 border-b border-rose-200 p-3 flex items-center justify-between gap-4 text-xs text-rose-900 shrink-0">
          <div id="workbook-conflict-state" className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="space-y-0.5">
              <p>
                <strong>Alterações não salvas — conflito CAS.</strong>{' '}
                {conflict.remoteDeletion
                  ? 'O workbook foi removido no servidor enquanto este rascunho local ainda tinha alterações.'
                  : `Outro usuário atualizou este produto (revisão atual: ${conflict.actualRevision ?? 'desconhecida'}).`}
              </p>
              <p>
                <strong>Ação permitida:</strong> descarte o rascunho local e recarregue o servidor. Salvar ou tentar novamente permanece bloqueado; não há mesclagem automática.
              </p>
            </div>
          </div>
          <button
            onClick={() => void discardWithRefresh(owner, repository, navigationEpoch)}
            disabled={isResolvingConflict}
            className="px-3 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 shrink-0"
          >
            {isResolvingConflict ? 'Recarregando servidor...' : 'Descartar rascunho local e recarregar servidor'}
          </button>
        </div>
      )}

      {reconciliation && (
        <div role="alert" className="bg-amber-50 border-b border-amber-200 p-3 text-xs text-amber-900 shrink-0 flex items-center justify-between gap-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="space-y-0.5">
              <p><strong>Alterações não confirmadas — reconciliação necessária.</strong> {reconciliation.message}</p>
              <p><strong>Ação permitida:</strong> descarte o rascunho local e recarregue o servidor. Salvar permanece bloqueado; não há mesclagem automática.</p>
            </div>
          </div>
          <button
            onClick={() => void discardWithRefresh(owner, repository, navigationEpoch)}
            disabled={isResolvingConflict}
            className="px-3 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 shrink-0"
          >
            {isResolvingConflict ? 'Recarregando servidor...' : 'Descartar rascunho local e recarregar servidor'}
          </button>
        </div>
      )}

      {errorMessage && (
        <HumanFriendlyErrorBanner
          title={session?.failure ? 'Falha ao salvar conhecimento do produto' : 'Falha ao carregar conhecimento do produto'}
          message={errorMessage}
          details={technicalErrorDetails as string | Record<string, unknown> | Error | null}
          onRetry={async () => {
            if (session?.failure) {
              await saveDraft(owner, repository);
            } else if (familyError && familyOwner) {
              await refreshDraft(familyOwner, repository);
            } else {
              await refreshDraft(owner, repository);
            }
          }}
        />
      )}

      {/* 2. Barra de Abas do Workspace (Fases 10-17) */}
      <nav className="bg-white border-b border-slate-200 px-4 flex items-center gap-1 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab('summary')}
          className={`py-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'summary'
              ? 'border-[#003366] text-[#003366]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Resumo Técnico</span>
        </button>

        <button
          onClick={() => setActiveTab('technical_data')}
          className={`py-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'technical_data'
              ? 'border-[#003366] text-[#003366]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Dados Técnicos ({Array.from(effectiveKnowledge.effectiveData.values()).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('technical_tables')}
          className={`py-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'technical_tables'
              ? 'border-[#003366] text-[#003366]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Tabelas Técnicas ({workbook.datasets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`py-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'documents'
              ? 'border-[#003366] text-[#003366]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Documentos & Evidências</span>
        </button>

        <button
          onClick={() => setActiveTab('assets')}
          className={`py-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'assets'
              ? 'border-[#003366] text-[#003366]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Assets & Fotos</span>
        </button>
      </nav>

      {/* 3. Conteúdo da Aba Ativa */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
        {activeTab === 'summary' && (
          <WorkspaceSummaryTab
            product={product}
            family={family}
            workbook={workbook}
            effectiveKnowledge={effectiveKnowledge}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
            onUpdateWorkbook={handleUpdateWorkbook}
          />
        )}

        {activeTab === 'technical_data' && (
          <WorkspaceTechnicalDataTab
            workbook={workbook}
            effectiveKnowledge={effectiveKnowledge}
            onUpdateWorkbook={handleUpdateWorkbook}
          />
        )}

        {activeTab === 'technical_tables' && (
          <WorkspaceTechnicalTablesTab
            product={product}
            workbook={workbook}
            effectiveKnowledge={effectiveKnowledge}
            onUpdateWorkbook={handleUpdateWorkbook}
            availableProducts={availableProducts}
            repository={repository}
          />
        )}

        {activeTab === 'documents' && (
          <WorkspaceDocumentsEvidenceTab
            workbook={workbook}
            effectiveKnowledge={effectiveKnowledge}
            onUpdateWorkbook={handleUpdateWorkbook}
            product={product}
            repository={repository}
          />
        )}

        {activeTab === 'assets' && (
          <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
            <ProductAssetManager
              product={product}
              onClose={() => setActiveTab('summary')}
            />
          </div>
        )}
      </main>
    </div>
  );
};
