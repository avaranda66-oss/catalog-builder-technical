// src/components/guided-help/ContextHelpDrawer.tsx
// Nível 2: Painel Contextual ("Entenda esta área")
// Apresenta: O QUE É, PARA QUE SERVE, QUANDO USAR, EXEMPLO REAL e CUIDADOS.

import React, { useState } from 'react';
import { useLearnMode, HELP_CONCEPTS_REGISTRY, HelpConceptId } from '../../features/guided-help';
import {
  X,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  Code2,
  Sparkles
} from 'lucide-react';

export const ContextHelpDrawer: React.FC = () => {
  const {
    contextHelpId,
    activeConceptId,
    closeContextHelp,
    closeConceptDetail,
    openConceptDetail,
    openGlossary
  } = useLearnMode();

  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Exibe o conceito aberto via "Entenda esta área" ou via clique de detalhes
  const targetId = contextHelpId || activeConceptId;
  const concept = targetId ? HELP_CONCEPTS_REGISTRY[targetId] : null;

  if (!concept) return null;

  const handleClose = () => {
    if (contextHelpId) closeContextHelp();
    if (activeConceptId) closeConceptDetail();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end transition-opacity duration-200"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="context-help-title"
    >
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Drawer */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <BookOpen size={18} />
            </span>
            <div>
              <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-600 block">
                Entenda o Conceito
              </span>
              <h2 id="context-help-title" className="text-base font-bold text-slate-800">
                {concept.title}
              </h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Fechar painel de ajuda"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toggle de Explicação Simples vs Técnica */}
        <div className="px-5 py-2.5 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between text-xs">
          <span className="font-semibold text-indigo-900 flex items-center gap-1.5">
            <Sparkles size={14} className="text-indigo-600" />
            Nível de Detalhe:
          </span>
          <div className="inline-flex rounded-md bg-white p-0.5 border border-indigo-200">
            <button
              onClick={() => setShowTechnicalDetails(false)}
              className={`px-2.5 py-1 text-xs font-semibold rounded ${
                !showTechnicalDetails
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              Linguagem Simples
            </button>
            <button
              onClick={() => setShowTechnicalDetails(true)}
              className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1 ${
                showTechnicalDetails
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <Code2 size={12} />
              Detalhe Técnico
            </button>
          </div>
        </div>

        {/* Conteúdo Estruturado */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 1. O QUE É */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block" />
              O que é?
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {showTechnicalDetails ? concept.technicalExplanation : concept.simpleExplanation}
            </p>
          </section>

          {/* 2. PARA QUE SERVE */}
          <section className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Para que serve / Por que importa?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {concept.whyItMatters}
            </p>
          </section>

          {/* 3. QUANDO USAR */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block" />
              Quando usar?
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              {concept.whenToUse}
            </p>
          </section>

          {/* 4. EXEMPLO REAL */}
          <section className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/70">
            <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lightbulb size={14} className="text-amber-600" />
              Exemplo Real
            </h3>
            <p className="text-xs text-amber-950 font-medium leading-relaxed">
              {concept.example}
            </p>
          </section>

          {/* 5. CUIDADOS / AVISOS */}
          {concept.warnings && (
            <section className="bg-rose-50 p-4 rounded-xl border border-rose-200">
              <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-rose-600" />
                Cuidados e Armadilhas
              </h3>
              <p className="text-xs text-rose-950 leading-relaxed">
                {concept.warnings}
              </p>
            </section>
          )}

          {/* TERMOS RELACIONADOS */}
          {concept.relatedTerms.length > 0 && (
            <section className="pt-2 border-t border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Conceitos Relacionados
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {concept.relatedTerms.map((relatedId: HelpConceptId) => {
                  const rel = HELP_CONCEPTS_REGISTRY[relatedId];
                  if (!rel) return null;
                  return (
                    <button
                      key={relatedId}
                      onClick={() => openConceptDetail(relatedId)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-medium border border-slate-200 transition-colors"
                    >
                      <span>{rel.title}</span>
                      <ArrowRight size={11} />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Rodapé do Drawer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={() => {
              handleClose();
              openGlossary(concept.title);
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
          >
            <span>Ver no Glossário Completo</span>
            <ArrowRight size={13} />
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
