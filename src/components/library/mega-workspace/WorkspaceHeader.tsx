// src/components/library/mega-workspace/WorkspaceHeader.tsx
// Cabeçalho institucional e controles de navegação para o Mega Workspace (Produção).
// Apresenta eixos ortogonais (InteractionMode x DetailLevel), métricas canônicas e busca.
// Zero explicit any.

import React from 'react';
import {
  Search,
  X,
  Layers,
  Sparkles,
  Shield,
  FileText,
  AlertTriangle,
  Database,
  ArrowRightLeft
} from 'lucide-react';
import {
  ProductPresentationVM,
  WorkspaceMetricsVM,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';

interface WorkspaceHeaderProps {
  product: ProductPresentationVM;
  metrics: WorkspaceMetricsVM;
  session: WorkspaceSessionVM;
  onUpdateSession: (patch: Partial<WorkspaceSessionVM>) => void;
  onClose: () => void;
  onSwitchToLegacy?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  product,
  metrics,
  session,
  onUpdateSession,
  onClose,
  onSwitchToLegacy
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-2xs">
      {/* Top Bar: Identificação & Ações Primárias */}
      <div className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Esquerda: Identidade do Produto & Família */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#003366] text-white flex items-center justify-center font-bold text-base shadow-xs">
            {product.displayName.slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {product.displayName}
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                {product.code}
              </span>

              {product.isFamilyOnly ? (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60" title="Produto sem workbook local próprio: herda 100% dos fatos da família">
                  Herança da Família (Family-Only)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  {product.productRevision ? `Rev. ${product.productRevision}` : 'Modelo Individual'}
                </span>
              )}

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                <Sparkles className="w-3 h-3" />
                Mega Workspace Beta
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
              {product.familyLabel && (
                <span className="flex items-center gap-1 font-medium text-slate-600">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  {product.familyLabel}
                </span>
              )}
              <span className="flex items-center gap-1 text-slate-400">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                Read-Only Seguro
              </span>
            </div>
          </div>
        </div>

        {/* Direita: Eixos Ortogonais, Busca & Controles */}
        <div className="flex items-center gap-3">
          {/* Busca em Tempo Real */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar fatos e tabelas..."
              value={session.searchQuery || ''}
              onChange={(e) => onUpdateSession({ searchQuery: e.target.value })}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003366] focus:border-[#003366] w-48 sm:w-64 transition-all"
            />
          </div>

          {/* Eixo Ortogonal: Nível de Detalhe (Simple vs Advanced) */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
            <button
              onClick={() => onUpdateSession({ detailLevel: 'simple' })}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                session.detailLevel === 'simple'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simples
            </button>
            <button
              onClick={() => onUpdateSession({ detailLevel: 'advanced' })}
              className={`px-3 py-1 font-semibold rounded-md transition-all ${
                session.detailLevel === 'advanced'
                  ? 'bg-white text-[#003366] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Avançado
            </button>
          </div>

          {/* Botão de Alternância para Workspace Legado */}
          {onSwitchToLegacy && (
            <button
              onClick={onSwitchToLegacy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
              title="Alternar para o Workspace Clássico"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Workspace Clássico</span>
            </button>
          )}

          {/* Fechar */}
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors ml-1"
            title="Fechar Workspace"
            aria-label="Fechar Workspace"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sub Bar: Métricas Canônicas do Produto */}
      <div className="px-6 py-2 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-4 sm:gap-6">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Database className="w-3.5 h-3.5 text-[#003366]" />
            <strong className="text-slate-900">
              {metrics.knowledgeFactsCount ?? 0}
            </strong>{' '}
            fatos canônicos
          </span>

          <span className="inline-flex items-center gap-1.5 font-medium">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <strong className="text-slate-900">{metrics.tablesCount}</strong> tabelas
          </span>

          <span className="inline-flex items-center gap-1.5 font-medium">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <strong className="text-slate-900">{metrics.sourcesCount}</strong> fontes documentais
          </span>

          {metrics.knowledgeConflictsCount !== undefined && metrics.knowledgeConflictsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-md border border-amber-200/60">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              {metrics.knowledgeConflictsCount} divergência{metrics.knowledgeConflictsCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-400 hidden md:block">
          {session.detailLevel === 'simple'
            ? 'Visualização human-first para publicação segura'
            : 'Visualização de engenharia com chaves semânticas'}
        </div>
      </div>
    </header>
  );
};
