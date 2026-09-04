// src/labs/product-workspace-ux/components/ConflictsBlock.tsx
import React from 'react';
import { AlertTriangle, CheckCircle2, SplitSquareVertical } from 'lucide-react';
import { FactItem } from '../types';

interface ConflictsBlockProps {
  conflicts: FactItem[];
  onReviewConflict: (conflict: FactItem) => void;
}

export const ConflictsBlock: React.FC<ConflictsBlockProps> = ({
  conflicts,
  onReviewConflict
}) => {
  if (conflicts.length === 0) {
    return (
      <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 text-center flex flex-col items-center justify-center">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-1.5" />
        <h4 className="text-sm font-bold text-emerald-900">
          Nenhuma divergência pendente
        </h4>
        <p className="text-xs text-emerald-700 mt-0.5">
          Todas as especificações técnicas estão consistentes e conciliadas entre os manuais.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conflicts.map((item) => (
        <div
          key={item.id}
          className="bg-amber-50/50 border border-amber-200 rounded-xl p-4.5 transition-all hover:border-amber-300 shadow-2xs"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Precisa de revisão
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {item.label}
                </span>
              </div>

              {item.conflict && (
                <p className="text-xs text-slate-600 mt-1.5 max-w-2xl">
                  {item.conflict.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onReviewConflict(item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors shadow-2xs"
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Comparar fontes & Revisar</span>
              </button>
            </div>
          </div>

          {/* Comparativo de Opções Lado a Lado */}
          {item.conflict && (
            <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-amber-200/60">
              {item.conflict.options.map((opt, idx) => (
                <div
                  key={idx}
                  className="bg-white/90 border border-amber-100 rounded-lg p-3 flex flex-col justify-between text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">{opt.sourceTitle}</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {opt.sourceCode} · pág. {opt.page}
                    </span>
                  </div>
                  <div className="mt-2 text-base font-bold text-slate-900 font-mono">
                    {opt.extractedValue} {opt.unit || ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
