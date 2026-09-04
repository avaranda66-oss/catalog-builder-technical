// src/components/library/product-workspace-v2/SourceTraceDrawer.tsx
import React, { useState } from 'react';
import {
  X,
  BookOpen,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { ProjectedSourceTrace } from '../../../domain/product-workspace/types';

export interface SourceTraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trace: ProjectedSourceTrace | null;
  mode?: 'simple' | 'advanced';
}

export const SourceTraceDrawer: React.FC<SourceTraceDrawerProps> = ({
  isOpen,
  onClose,
  trace,
  mode = 'simple'
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(mode === 'advanced');

  if (!isOpen || !trace) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                  <BookOpen className="w-4 h-4" />
                </span>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Rastreamento de Origem
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Documentação oficial e evidências comprovando este dado técnico.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Especificação Selecionada */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Especificação
              </div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {trace.displayLabel}
              </div>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {trace.currentValueFormatted}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                  {trace.originText}
                </span>
              </div>
            </div>

            {/* Alerta de Conflito Documental (se houver) */}
            {trace.hasConflict && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Divergência Documental Identificada</span>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-300/90 leading-relaxed">
                  {trace.conflictMessage ||
                    'Diferentes edições ou idiomas do manual técnico informam valores distintos para esta propriedade.'}
                </p>
                {trace.canonicalDecisionRationale && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Decisão de Engenharia: </span>
                    {trace.canonicalDecisionRationale}
                  </div>
                )}
              </div>
            )}

            {/* Lista de Evidências Oficiais */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  Fontes Documentadas ({trace.items.length})
                </h4>
              </div>

              {trace.items.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500">
                  Nenhum documento ou página citada diretamente para este dado.
                </div>
              ) : (
                <div className="space-y-3">
                  {trace.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.sourceTitle}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            {item.revision && <span>Rev: {item.revision}</span>}
                            {item.page && <span>Pág. {item.page}</span>}
                            {item.section && <span>Seção: {item.section}</span>}
                          </div>
                        </div>
                        {item.isConsensus && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="w-3 h-3" />
                            Consenso
                          </span>
                        )}
                      </div>

                      {item.observedValueText && (
                        <div className="text-xs bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg text-slate-700 dark:text-slate-300">
                          <span className="text-slate-400 font-medium">Valor declarado: </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.observedValueText}
                          </span>
                        </div>
                      )}

                      {item.excerpt && (
                        <div className="text-xs italic text-slate-500 dark:text-slate-400 pl-2.5 border-l-2 border-slate-200 dark:border-slate-700">
                          "{item.excerpt}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle de Detalhes de Auditoria Técnica */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-medium transition-colors"
              >
                {showTechnicalDetails ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>Detalhes Técnicos & Identificadores de Sistema</span>
              </button>

              {showTechnicalDetails && (
                <div className="mt-3 p-3 rounded-lg bg-slate-950 text-slate-300 font-mono text-[11px] space-y-1.5 overflow-x-auto">
                  <div>
                    <span className="text-slate-500">semanticKey: </span>
                    <span className="text-emerald-400">{trace.canonicalKey}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">datumId: </span>
                    <span className="text-blue-400">{trace.datumId}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
