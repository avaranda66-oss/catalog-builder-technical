// src/labs/product-workspace-ux/components/AIImportModal.tsx
/**
 * Modal de Importação e Extração via IA com Política de Verdade.
 * 
 * Regras & Emendas (UX1.2):
 * - Componente 100% agnóstico a produto (documentName e productName dinâmicos).
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 */

import React, { useEffect, useRef } from 'react';
import { X, FileText, CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, ShieldCheck } from 'lucide-react';

interface AIImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string;
  documentName?: string;
  documentCode?: string;
}

export const AIImportModal: React.FC<AIImportModalProps> = ({
  isOpen,
  onClose,
  productName = 'este instrumento',
  documentName,
  documentCode = 'DOC-OFICIAL-01'
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const displayDocName = documentName || `Manual de Operação e Especificações - ${productName}.pdf`;

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

  // Fechar com Escape
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-import-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="ai-import-modal-title" className="text-base font-bold text-slate-900">
              Extração Técnica & Política de Verdade da IA
            </h3>
            <p className="text-xs text-slate-500">
              Documento analisado para: {productName}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
            <FileText className="w-8 h-8 text-[#003366] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 text-sm truncate">
                {displayDocName}
              </div>
              <div className="text-slate-500 text-xs truncate">
                Código: {documentCode} · Processado com OCR e conferência de evidências
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
              Classificação por Política de Verdade:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 1. FACTS */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Fatos Verificados</span>
                  <span className="text-xs px-1.5 py-0.2 bg-emerald-200/80 text-emerald-900 rounded-full font-mono font-bold">84</span>
                </div>
                <div className="text-emerald-950 font-bold text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Alta Confiança</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-snug">
                  Citações com tabela, página e número explícito no documento.
                </p>
              </div>

              {/* 2. CONFLICTS */}
              <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Conflitos Oficiais</span>
                  <span className="text-xs px-1.5 py-0.2 bg-amber-200/80 text-amber-900 rounded-full font-mono font-bold">1</span>
                </div>
                <div className="text-amber-950 font-bold text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Divergência Real</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Fontes oficiais em desacordo. Não assumido como fato verificado.
                </p>
              </div>

              {/* 3. REVIEW CANDIDATES */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-blue-800 tracking-wider">Candidatos a Revisão</span>
                  <span className="text-xs px-1.5 py-0.2 bg-blue-200/80 text-blue-900 rounded-full font-mono font-bold">12</span>
                </div>
                <div className="text-blue-950 font-bold text-xs flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                  <span>Proposta de IA</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-snug">
                  Inferências de linguagem natural pendentes de validação humana.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-slate-700 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[#003366] shrink-0 mt-0.5" />
            <span>
              <strong>Diretriz Arquitetural:</strong> Apenas fatos verificados com lastro documental direto recebem o selo verde de evidência homologada. Candidatos a revisão e conflitos nunca são promovidos automaticamente para o catálogo sem homologação de engenharia.
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              alert('Fatos verificados importados com sucesso para o rascunho de staging.');
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <span>Importar Fatos Verificados</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
