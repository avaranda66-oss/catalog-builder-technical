// src/components/library/mega-workspace/SemanticAdvancedDrawer.tsx
// Painel lateral para inspeção de identidade semântica e TechnicalValue avançado (Produção).
// Emenda F: Comunica claramente que o SemanticRegistry live ainda não possui persistência live.
// Zero explicit any.

import React, { useEffect, useRef } from 'react';
import { X, Tag, Code2, ShieldCheck, Database, Layers } from 'lucide-react';
import { ProjectedFactVM } from '../../../domain/product-workspace/view-model';

interface SemanticAdvancedDrawerProps {
  fact: ProjectedFactVM | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SemanticAdvancedDrawer: React.FC<SemanticAdvancedDrawerProps> = ({
  fact,
  isOpen,
  onClose
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !fact) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Identidade semântica avançada de ${fact.canonicalLabel}`}
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Modo Avançado de Engenharia
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Identidade Semântica Canônica
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar painel semântico"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Chave Canônica */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              <Tag className="w-3.5 h-3.5 text-[#003366]" />
              Chave Canônica (Imutável no Datum)
            </div>
            <div className="font-mono text-xs font-bold text-slate-900 break-all bg-white p-2.5 rounded-lg border border-slate-200">
              {fact.semanticKey}
            </div>
          </div>

          {/* Rótulo de Exibição */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Rótulo Humano Padrão
            </span>
            <div className="text-sm font-semibold text-slate-900">
              {fact.canonicalLabel}
            </div>
          </div>

          {/* TechnicalValue Estruturado (Lossless 10 Variantes - Emenda I) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Code2 className="w-3.5 h-3.5 text-slate-600" />
              Estrutura Técnica do Dado (TechnicalValue)
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-[11px] rounded-lg overflow-x-auto leading-relaxed">
              {JSON.stringify(fact.technicalValue, null, 2)}
            </pre>
          </div>

          {/* Escopo de Herança e Autoridade */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              Escopo de Autoridade Técnica
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Origem:</span>
              <span className="font-semibold text-slate-800">{fact.originLabel}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Estado de Origem:</span>
              <span className="font-mono text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {fact.originState}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Status de Evidência:</span>
              <span className="font-mono text-[11px] text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                {fact.evidenceState}
              </span>
            </div>
          </div>

          {/* Nota de Arquitetura (Emenda F) */}
          <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-800 leading-relaxed">
            <div className="flex items-center gap-1.5 font-semibold text-blue-900 mb-1">
              <Database className="w-3.5 h-3.5" />
              Integridade do Registro Semântico
            </div>
            A identidade canônica é mantida de forma imutável no ProductWorkbook. Nesta fase de integração,
            não há persistência separada em localStorage ou metadata, prevenindo duplicação de verdade técnica.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            PIM Domain V2
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
