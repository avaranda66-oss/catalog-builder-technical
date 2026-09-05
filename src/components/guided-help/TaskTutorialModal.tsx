// src/components/guided-help/TaskTutorialModal.tsx
// Nível 6: Modal com tutorial passo a passo para execução de tarefas práticas.

import React from 'react';
import { useLearnMode } from '../../features/guided-help';
import { PlayCircle, X, Lightbulb, Clock, CheckCircle2 } from 'lucide-react';

export const TaskTutorialModal: React.FC = () => {
  const { activeTutorial, closeTutorial } = useLearnMode();

  React.useEffect(() => {
    if (!activeTutorial) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeTutorial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTutorial, closeTutorial]);

  if (!activeTutorial) return null;

  return (
    <div
      className="fixed inset-0 z-60 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200"
      onClick={closeTutorial}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <PlayCircle size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                  Tutorial Prático
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock size={12} />
                  ~{activeTutorial.estimatedMinutes} min
                </span>
              </div>
              <h2 id="tutorial-modal-title" className="text-base font-bold text-slate-900">
                {activeTutorial.title}
              </h2>
            </div>
          </div>
          <button
            onClick={closeTutorial}
            aria-label="Fechar tutorial"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Descrição */}
        <div className="p-5 pb-3 border-b border-slate-100">
          <p className="text-xs text-slate-600 leading-relaxed">
            {activeTutorial.description}
          </p>
        </div>

        {/* Passos */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTutorial.steps.map((step) => (
            <div
              key={step.stepNumber}
              className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-200 transition-all flex gap-3"
            >
              <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                {step.stepNumber}
              </span>
              <div className="space-y-1.5 flex-1">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{step.title}</span>
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {step.instruction}
                </p>
                {step.tip && (
                  <div className="bg-amber-50 p-2 rounded-lg border border-amber-200/70 text-[11px] text-amber-900 flex items-start gap-1.5">
                    <Lightbulb size={13} className="text-amber-600 shrink-0 mt-0.5" />
                    <span>{step.tip}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <CheckCircle2 size={14} className="text-emerald-600" />
            {activeTutorial.steps.length} passos guiados
          </span>
          <button
            type="button"
            onClick={closeTutorial}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Entendido, vou aplicar!
          </button>
        </div>
      </div>
    </div>
  );
};
