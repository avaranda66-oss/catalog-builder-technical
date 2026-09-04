// src/labs/product-workspace-ux/components/SemanticRenameModal.tsx
/**
 * Modal de Renomeação Semântica Canônica Controlada.
 * 
 * Regras & Emendas (AMENDMENT 9, 11 & UX1.2):
 * - Copy alinhada rigorosamente à governança semântica canônica:
 *   1. Nome exibido -> workspace (totalmente editável localmente).
 *   2. Sinônimos da informação -> camada semântica canônica (aliases do produto, não do layout).
 *   3. Chave canônica -> operação controlada (identificador técnico do dado no catálogo).
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, Escape e retorno de foco.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ShieldCheck, RefreshCw, Layers, Database, Sparkles } from 'lucide-react';
import { FactItem } from '../types';

interface SemanticRenameModalProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmRename: (oldKey: string, newKey: string) => void;
}

export const SemanticRenameModal: React.FC<SemanticRenameModalProps> = ({
  fact,
  isOpen,
  onClose,
  onConfirmRename
}) => {
  const [newKeyDraft, setNewKeyDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && fact) {
      triggerRef.current = document.activeElement as HTMLElement;
      setNewKeyDraft(
        fact.semanticKey.endsWith('.v2')
          ? fact.semanticKey
          : `${fact.semanticKey}.v2`
      );
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, fact]);

  // Tecla Escape para fechar
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

  const handleRename = () => {
    if (newKeyDraft.trim() && newKeyDraft.trim() !== fact.semanticKey) {
      onConfirmRename(fact.semanticKey, newKeyDraft.trim());
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="semantic-rename-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="semantic-rename-modal-title" className="text-base font-bold text-slate-900">
              Operação Controlada: Chave Semântica Canônica
            </h3>
            <p className="text-xs text-slate-500">
              Especificação técnica: <strong>{fact.label}</strong>
            </p>
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

        {/* Corpo do Modal */}
        <div className="p-6 space-y-4 text-xs">
          {/* Quadro Didático de Governança Semântica */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-slate-700">
            <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider">
              Níveis de Nomenclatura e Governança:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <div className="font-bold text-[#003366] flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  Nome exibido
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Camada do Workspace: totalmente editável a qualquer momento.
                </div>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <div className="font-bold text-purple-700 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Sinônimos
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Camada Semântica Canônica: aliases mantidos no catálogo.
                </div>
              </div>

              <div className="p-2 bg-blue-50/80 rounded-lg border border-blue-200">
                <div className="font-bold text-blue-900 flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  Chave canônica
                </div>
                <div className="text-blue-700 text-[10px] mt-0.5">
                  Identificador técnico único gerenciado com rastreabilidade.
                </div>
              </div>
            </div>
          </div>

          {/* De / Para da Chave */}
          <div className="p-3.5 bg-slate-100/70 rounded-xl border border-slate-200 flex items-center justify-between gap-3 font-mono text-xs">
            <div className="bg-white px-3 py-1.5 border border-slate-300 rounded text-slate-700 truncate">
              {fact.semanticKey}
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="bg-blue-50 px-3 py-1.5 border border-blue-200 rounded text-[#003366] font-bold truncate">
              {newKeyDraft}
            </div>
          </div>

          <div>
            <label htmlFor="canonical-key-input" className="block font-semibold text-slate-700 mb-1">
              Nova Chave Canônica Técnica
            </label>
            <input
              id="canonical-key-input"
              ref={inputRef}
              type="text"
              value={newKeyDraft}
              onChange={(e) => setNewKeyDraft(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none font-mono text-xs"
            />
          </div>

          {/* Análise de Impacto Prévia */}
          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <span>Diagnóstico de impacto controlado no catálogo:</span>
            </div>

            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-[11px] leading-relaxed">
              <strong>Garantia de compatibilidade reversa:</strong> A chave anterior{' '}
              <code className="font-mono font-bold">{fact.semanticKey}</code> continuará sendo preservada
              como <strong>sinônimo canônico permanente (alias)</strong>. Tabelas técnicas e consultas automáticas não serão corrompidas.
            </div>
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
            type="button"
            onClick={handleRename}
            disabled={!newKeyDraft.trim() || newKeyDraft.trim() === fact.semanticKey}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] disabled:opacity-50 rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Confirmar Alteração de Chave</span>
          </button>
        </div>
      </div>
    </div>
  );
};
