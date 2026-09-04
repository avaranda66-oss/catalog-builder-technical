// src/components/library/mega-workspace/FactGridBlock.tsx
// Bloco de visualização em grade de fatos técnicos para o Mega Workspace (Produção).
// Reutiliza e exibe fatos do factsById normalizado (Zero Second Truth).
// Zero explicit any.

import React from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  Tag,
  Building,
  Clock
} from 'lucide-react';
import {
  FactGridBlockVM,
  ProjectedFactVM,
  WorkspaceSessionVM
} from '../../../domain/product-workspace/view-model';

interface FactGridBlockProps {
  block: FactGridBlockVM;
  factsById: Readonly<Record<string, ProjectedFactVM>>;
  session: WorkspaceSessionVM;
  onOpenSourceTrace: (fact: ProjectedFactVM) => void;
  onOpenSemanticAdvanced?: (fact: ProjectedFactVM) => void;
}

export const FactGridBlock: React.FC<FactGridBlockProps> = ({
  block,
  factsById,
  session,
  onOpenSourceTrace,
  onOpenSemanticAdvanced
}) => {
  const isAdvanced = session.detailLevel === 'advanced';
  const columnsClass =
    block.columns === 3
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
      : block.columns === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-2';

  const renderSourceBadge = (fact: ProjectedFactVM) => {
    switch (fact.evidenceState) {
      case 'no_source':
        return (
          <button
            onClick={() => onOpenSourceTrace(fact)}
            title="Sem fonte técnica vinculada"
            className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors"
          >
            <FileQuestion className="w-3.5 h-3.5" />
          </button>
        );
      case 'conflicting_sources':
        return (
          <button
            onClick={() => onOpenSourceTrace(fact)}
            title="Atenção: Fontes divergentes identificadas"
            className="p-1 text-amber-600 hover:text-amber-700 bg-amber-50 rounded transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
          </button>
        );
      case 'multiple_agreeing':
        return (
          <button
            onClick={() => onOpenSourceTrace(fact)}
            title={`${fact.sourceDocumentIds.length} fontes técnicas concordam com este dado`}
            className="inline-flex items-center gap-0.5 p-1 text-emerald-700 hover:bg-emerald-50 rounded transition-colors font-mono text-[10px] font-bold"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{fact.sourceDocumentIds.length}</span>
          </button>
        );
      case 'single_source':
      default:
        return (
          <button
            onClick={() => onOpenSourceTrace(fact)}
            title="Ver documento comprobatório"
            className="p-1 text-slate-400 hover:text-[#003366] hover:bg-slate-100 rounded transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        );
    }
  };

  return (
    <div className="space-y-3">
      {block.title && (
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {block.title}
        </h4>
      )}

      <div className={`grid ${columnsClass} gap-3`}>
        {block.factIds.map((factId) => {
          const fact = factsById[factId];
          if (!fact) return null;

          return (
            <div
              key={factId}
              className={`group p-4 rounded-xl border transition-all bg-white hover:border-slate-300 hover:shadow-xs flex flex-col justify-between ${
                fact.hasConflict
                  ? 'border-amber-200 bg-amber-50/20'
                  : 'border-slate-200/80'
              }`}
            >
              {/* Header do Card */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-slate-500 truncate block">
                    {fact.canonicalLabel}
                  </span>
                  {isAdvanced && (
                    <span
                      onClick={() => onOpenSemanticAdvanced?.(fact)}
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-[#003366] cursor-pointer mt-0.5"
                      title="Ver chave semântica canônica no registro"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {fact.semanticKey}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {renderSourceBadge(fact)}
                </div>
              </div>

              {/* Valor Principal */}
              <div className="mt-2.5">
                <div className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {fact.formattedValue}
                </div>

                {/* Indicador de Override Pendente (Emenda G) */}
                {fact.isPendingOverride && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded-md border border-blue-200/60">
                    <Clock className="w-3 h-3 text-blue-600 shrink-0" />
                    <span>Existe uma alteração em revisão</span>
                  </div>
                )}
              </div>

              {/* Footer do Card */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 truncate" title={fact.originLabel}>
                  <Building className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{fact.originLabel}</span>
                </span>

                {fact.provenanceIncomplete && (
                  <span className="text-amber-600 text-[10px] font-medium">
                    Fonte indisponível
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
