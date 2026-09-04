// src/labs/product-workspace-ux/components/SemanticRenameModal.tsx
import React, { useState } from 'react';
import { X, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
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
  if (!isOpen || !fact) return null;

  const [newKeyDraft, setNewKeyDraft] = useState(
    fact.semanticKey === 'temperature.stability' ? 'thermal.stability' : `${fact.semanticKey}.v2`
  );

  const handleRename = () => {
    if (newKeyDraft.trim() && newKeyDraft.trim() !== fact.semanticKey) {
      onConfirmRename(fact.semanticKey, newKeyDraft.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Renomear chave semântica com segurança
            </h3>
            <p className="text-xs text-slate-500">
              Especificação: {fact.label}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-4 text-xs">
          {/* De / Para da Chave */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 font-mono text-xs">
            <div className="bg-white px-3 py-1.5 border border-slate-300 rounded text-slate-700">
              {fact.semanticKey}
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="bg-blue-50 px-3 py-1.5 border border-blue-200 rounded text-[#003366] font-bold">
              {newKeyDraft}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nova Chave Semântica Canônica
            </label>
            <input
              type="text"
              value={newKeyDraft}
              onChange={(e) => setNewKeyDraft(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none font-mono text-xs"
            />
          </div>

          {/* Análise de Impacto Prévia */}
          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-950 font-bold">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <span>Diagnóstico de impacto no ecossistema:</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <div className="text-lg font-bold text-[#003366]">3</div>
                <div className="text-[10px] text-slate-500">Produtos</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <div className="text-lg font-bold text-[#003366]">2</div>
                <div className="text-[10px] text-slate-500">Tabelas V2</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <div className="text-lg font-bold text-[#003366]">1</div>
                <div className="text-[10px] text-slate-500">Visão Salva</div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-blue-100">
                <div className="text-lg font-bold text-[#003366]">4</div>
                <div className="text-[10px] text-slate-500">Refs de Catálogo</div>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-[11px] leading-relaxed">
              <strong>Proteção de compatibilidade garantida:</strong> A chave antiga{' '}
              <code className="font-mono font-bold">{fact.semanticKey}</code> continuará funcionando
              como <strong>alias</strong> permanente. Nenhuma tabela existente terá o vínculo quebrado.
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleRename}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Confirmar renomeação segura</span>
          </button>
        </div>
      </div>
    </div>
  );
};
