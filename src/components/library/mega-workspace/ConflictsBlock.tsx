// src/components/library/mega-workspace/ConflictsBlock.tsx
// Bloco de exibição neutra de divergências técnicas no Mega Workspace (Produção).
// Tom neutro de engenharia (zero "erro de sistema", tratando divergência como fato oficial).
// Zero explicit any.

import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import {
  ProjectedConflictVM,
  ProjectedFactVM
} from '../../../domain/product-workspace/view-model';

interface ConflictsBlockProps {
  conflictsByFactId: Readonly<Record<string, ProjectedConflictVM>>;
  factsById: Readonly<Record<string, ProjectedFactVM>>;
  onOpenSourceTrace: (fact: ProjectedFactVM) => void;
}

export const ConflictsBlock: React.FC<ConflictsBlockProps> = ({
  conflictsByFactId,
  factsById,
  onOpenSourceTrace
}) => {
  const conflictsList = Object.values(conflictsByFactId);
  if (conflictsList.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 sm:p-5 space-y-3 shadow-2xs">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-900">
            Divergências Técnicas Oficiais ({conflictsList.length})
          </h4>
          <p className="text-xs text-amber-700 mt-0.5">
            Documentos técnicos oficiais contêm valores divergentes para estes itens.
            Inspecione as fontes para alinhamento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {conflictsList.map((conflict) => {
          const fact = factsById[conflict.factId];

          return (
            <div
              key={conflict.factId}
              onClick={() => fact && onOpenSourceTrace(fact)}
              className="group p-3.5 rounded-lg bg-white border border-amber-200/70 hover:border-amber-400 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 mb-1">
                  <span>{conflict.displayLabel}</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  {conflict.canonicalKey}
                </div>

                {conflict.candidateValues.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {conflict.candidateValues.map((val, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 text-[11px] font-medium bg-amber-50 text-amber-800 rounded border border-amber-200/60"
                      >
                        {val}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-amber-800 font-medium">
                <span>Ver evidências divergentes</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
