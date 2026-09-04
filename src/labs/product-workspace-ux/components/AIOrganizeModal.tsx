// src/labs/product-workspace-ux/components/AIOrganizeModal.tsx
/**
 * Modal de Sugestão de Organização por Inteligência Artificial.
 * 
 * Regras & Emendas (UX1.2):
 * - Componente 100% agnóstico a produto (productName e factsCount dinâmicos).
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 */

import React, { useEffect, useRef } from 'react';
import { X, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { AIOrganizeDiff } from '../types';

interface AIOrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => AIOrganizeDiff;
  productName?: string;
  factsCount?: number;
}

export const AIOrganizeModal: React.FC<AIOrganizeModalProps> = ({
  isOpen,
  onClose,
  onApply,
  productName = 'este instrumento',
  factsCount = 100
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        confirmButtonRef.current?.focus();
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

  const handleConfirm = () => {
    onApply();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-organize-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 id="ai-organize-modal-title" className="text-base font-bold text-slate-900">
                Organização Inteligente de Visualização
              </h3>
              <p className="text-xs text-slate-500">
                Otimização da hierarquia visual de {productName}
              </p>
            </div>
          </div>
          <button
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
          <p className="text-slate-600 leading-relaxed">
            Analisamos a densidade e o tipo das {factsCount} especificações técnicas registradas e
            estruturamos uma organização visual com priorização de dados críticos:
          </p>

          {/* Resumo em Números */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <div className="text-xl font-bold text-purple-700">Top</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Resumo Geral</div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="text-xl font-bold text-[#003366]">Prioritária</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Tabela Principal</div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <div className="text-xl font-bold text-emerald-700">100%</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Dados Preservados</div>
            </div>
          </div>

          {/* Lista de Ações Planejadas */}
          <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="font-bold text-slate-700 text-xs">Ajustes a serem aplicados:</div>
            <ul className="space-y-1.5 text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Posicionar Resumo Executivo e destaques na primeira seção</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Consolidar parâmetros tabulares nas tabelas de maior densidade</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Preservar todos os dados e chaves semânticas sem qualquer alteração técnica</span>
              </li>
            </ul>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
            <strong>Totalmente reversível:</strong> Você poderá desfazer esta organização a qualquer momento usando a função de Desfazer (Ctrl+Z ou botão Desfazer).
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <span>Aplicar Organização</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
