// src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx
// FASE 10-17: Workspace de Conhecimento Técnico Canônico (PIM Core V1)
// Interface profissional, estritamente tipada e com controle de concorrência CAS.

import React, { useState, useEffect } from 'react';
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
  SupabaseProductWorkbookRepository,
  WorkbookConflictError
} from '../../../services/product-workbook';
import { getSupabase } from '../../../services/supabase.service';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<WorkbookConflictError | null>(null);

  const [workbook, setWorkbook] = useState<ProductWorkbookV2>(() => {
    const base = createWorkbook({
      owner: { kind: 'product', id: product.id },
      revision: 0
    });
    return ensureWorkbookV2(base);
  });

  const [familyWorkbook, setFamilyWorkbook] = useState<ProductWorkbookV2 | undefined>(undefined);
  const repository = new SupabaseProductWorkbookRepository(getSupabase());

  // Carrega workbook do produto e opcionalmente da família
  const loadWorkbooks = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setConflictError(null);

    try {
      // 1. Carrega workbook do produto
      const prodWb = await repository.getWorkbook({ kind: 'product', id: product.id });
      if (prodWb) {
        setWorkbook(ensureWorkbookV2(prodWb));
      } else {
        // Inicializa vazio limpo (Sem defaults sintéticos — EMENDA 11)
        const empty = createWorkbook({
          owner: { kind: 'product', id: product.id },
          revision: 0
        });
        setWorkbook(ensureWorkbookV2(empty));
      }

      // 2. Carrega workbook da família se existir
      if (product.family_id) {
        const famWb = await repository.getWorkbook({ kind: 'family', id: product.family_id });
        if (famWb) {
          setFamilyWorkbook(ensureWorkbookV2(famWb));
        }
      }

      setIsDirty(false);
    } catch (err: any) {
      console.error('Erro ao carregar workbooks:', err);
      setErrorMessage(err.message || 'Falha ao carregar workbook técnico do produto.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbooks();
  }, [product.id, product.family_id]);

  // Resolve conhecimento efetivo herdado
  const effectiveKnowledge: ResolvedProductKnowledge = resolveEffectiveProductKnowledge({
    productWorkbook: workbook,
    familyWorkbook
  });

  const handleUpdateWorkbook = (updated: ProductWorkbookV2) => {
    setWorkbook(updated);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setConflictError(null);

    try {
      const result = await repository.saveWorkbook({
        workbook,
        expectedRevision: workbook.revision
      });

      setWorkbook(ensureWorkbookV2(result.workbook));
      setIsDirty(false);
      alert('Conhecimento técnico salvo com sucesso!');
    } catch (err: any) {
      if (err instanceof WorkbookConflictError) {
        setConflictError(err);
      } else {
        setErrorMessage(err.message || 'Falha ao salvar workbook.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col overflow-hidden font-sans text-slate-800 select-none">
      {/* 1. Header do Workspace */}
      <header className="h-14 bg-[#002244] text-white px-4 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isDirty && !confirm('Você possui alterações não salvas. Deseja realmente sair?')) {
                return;
              }
              onClose();
            }}
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
                <span className="text-amber-400 font-bold">● Alterações não salvas</span>
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
            disabled={isSaving || !isDirty}
            className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs ${
              isDirty
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
      {conflictError && (
        <div className="bg-rose-50 border-b border-rose-200 p-3 flex items-center justify-between text-xs text-rose-900 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Conflito de Concorrência (CAS):</strong> Outro usuário atualizou este produto (Revisão atual: {conflictError.actualRevision ?? 'desconhecida'}).
            </span>
          </div>
          <button
            onClick={() => void loadWorkbooks()}
            className="px-3 py-1 bg-rose-600 text-white rounded font-bold hover:bg-rose-700 cursor-pointer"
          >
            Recarregar Dados Mais Recentes
          </button>
        </div>
      )}

      {errorMessage && (
        <HumanFriendlyErrorBanner
          title="Falha ao carregar conhecimento do produto"
          message={errorMessage}
          details={errorMessage}
          onRetry={async () => {
            await loadWorkbooks();
          }}
          onDismiss={() => setErrorMessage(null)}
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
