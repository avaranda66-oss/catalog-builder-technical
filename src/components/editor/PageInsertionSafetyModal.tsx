// src/components/editor/PageInsertionSafetyModal.tsx
// Modal Presys de Prevenção e Segurança de Workflow para Capa Inteira (Fase 3A.6)
// Garante conformidade de acessibilidade (dialog, aria-modal, escape handler, zero emojis)
// e impede sobreposição invisível entre capas full-page e blocos de fluxo.

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { CompositionSafetyResult } from '../../domain/page-composition-policy';

export interface PageInsertionSafetyModalProps {
  isOpen: boolean;
  reason?: Exclude<CompositionSafetyResult, { isSafe: true }>['reason'];
  itemTitle?: string;
  onConfirmNewPage: () => void;
  onCancel: () => void;
}

export const PageInsertionSafetyModal: React.FC<PageInsertionSafetyModalProps> = ({
  isOpen,
  reason,
  itemTitle,
  onConfirmNewPage,
  onCancel
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Foco inicial seguro no botão Cancelar
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isIncomingCover = reason === 'INCOMING_COVER_ON_NON_EMPTY_PAGE';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-insertion-safety-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm no-print editor-only"
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200 shadow-2xl rounded-none flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Corporativo Presys */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5 text-amber-800">
            <div className="w-7 h-7 rounded-none bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <h2 id="page-insertion-safety-title" className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Composição de Página Incompatível
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo Contextual */}
        <div className="p-5 flex flex-col gap-3 text-xs text-slate-600 leading-relaxed">
          {isIncomingCover ? (
            <p>
              A <strong className="text-slate-800">Capa de Página Inteira</strong> ocupa 100% da área física da folha A4 e não pode ser inserida em uma página que já possui outros blocos de conteúdo.
            </p>
          ) : (
            <p>
              Esta folha contém uma <strong className="text-slate-800">Capa de Página Inteira</strong>. Blocos adicionais inseridos nesta página ficariam sobrepostos ou inacessíveis para edição.
            </p>
          )}

          {itemTitle && (
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-mono">
              Elemento selecionado: <span className="font-semibold text-slate-900">{itemTitle}</span>
            </div>
          )}

          <p className="font-medium text-slate-800 pt-1">
            Deseja adicionar o novo conteúdo em uma nova folha imediatamente após esta?
          </p>
        </div>

        {/* Ações de Decisão */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-none transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmNewPage}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#003366] hover:bg-[#002244] rounded-none transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Criar em nova página
          </button>
        </div>
      </div>
    </div>
  );
};
