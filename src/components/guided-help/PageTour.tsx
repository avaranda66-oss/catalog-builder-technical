// src/components/guided-help/PageTour.tsx
// Nível 4: Tour Inicial Guiado em 7 passos com navegação por teclado e pular/concluir.

import React from 'react';
import { useLearnMode } from '../../features/guided-help';
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from 'lucide-react';

export const PageTour: React.FC = () => {
  const {
    isTourActive,
    currentTourStep,
    currentTourStepIndex,
    totalTourSteps,
    nextTourStep,
    prevTourStep,
    skipTour,
    finishTour
  } = useLearnMode();

  const isLastStep = currentTourStepIndex === totalTourSteps - 1;

  React.useEffect(() => {
    if (!isTourActive || !currentTourStep) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLastStep) {
          finishTour();
        } else {
          nextTourStep();
        }
      } else if (e.key === 'ArrowLeft' && currentTourStepIndex > 0) {
        prevTourStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourActive, currentTourStep, isLastStep, currentTourStepIndex, skipTour, nextTourStep, prevTourStep, finishTour]);

  if (!isTourActive || !currentTourStep) return null;

  return (
    <div
      className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra superior de progresso */}
        <div className="h-1.5 w-full bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300"
            style={{ width: `${((currentTourStepIndex + 1) / totalTourSteps) * 100}%` }}
          />
        </div>

        {/* Header do Card */}
        <div className="p-5 pb-3 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
              <Sparkles size={16} />
            </span>
            <div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">
                Tour Guiado — Passo {currentTourStepIndex + 1} de {totalTourSteps}
              </span>
              <h3 id="tour-step-title" className="text-base font-bold text-slate-900">
                {currentTourStep.title}
              </h3>
            </div>
          </div>
          <button
            onClick={skipTour}
            aria-label="Pular tour"
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-3">
          <p className="text-sm text-slate-700 leading-relaxed">
            {currentTourStep.content}
          </p>
        </div>

        {/* Rodapé com Navegação */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={skipTour}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1 rounded transition-colors"
          >
            Pular Tour
          </button>

          <div className="flex items-center gap-2">
            {currentTourStepIndex > 0 && (
              <button
                type="button"
                onClick={prevTourStep}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
              >
                <ArrowLeft size={13} />
                <span>Voltar</span>
              </button>
            )}

            {isLastStep ? (
              <button
                type="button"
                onClick={finishTour}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                <Check size={14} />
                <span>Concluir Tour</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={nextTourStep}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors"
              >
                <span>Próximo</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
