// src/labs/product-workspace-ux/components/SemanticAdvancedDrawer.tsx
import React, { useState } from 'react';
import { X, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { FactItem } from '../types';

interface SemanticAdvancedDrawerProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenRenameModal: (fact: FactItem) => void;
}

export const SemanticAdvancedDrawer: React.FC<SemanticAdvancedDrawerProps> = ({
  fact,
  isOpen,
  onClose,
  onOpenRenameModal
}) => {
  const [newAliasDraft, setNewAliasDraft] = useState('');
  const [localAliases, setLocalAliases] = useState<string[]>(() => fact?.aliases || []);

  if (!isOpen || !fact) return null;

  const handleAddAlias = () => {
    if (newAliasDraft.trim()) {
      setLocalAliases([...localAliases, newAliasDraft.trim().toLowerCase()]);
      setNewAliasDraft('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-2xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Identidade Semântica & Aliases
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              {fact.label}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Chave Canônica */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
              Chave Semântica Canônica
            </label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between font-mono text-xs text-slate-800">
              <span className="font-bold">{fact.semanticKey}</span>
              <button
                onClick={() => {
                  onClose();
                  onOpenRenameModal(fact);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-[#003366] hover:underline"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Renomear chave com segurança</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Identificador único para automações, tabelas de catálogo e inteligência artificial.
            </p>
          </div>

          {/* Lista de Aliases Conhecidos */}
          <div>
            <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
              Aliases e Sinônimos Aceitos
            </label>
            <div className="space-y-1.5">
              {localAliases.map((alias, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-slate-700 font-mono text-xs"
                >
                  <span>{alias}</span>
                  <span className="text-[10px] text-slate-400 font-sans">ativo</span>
                </div>
              ))}
            </div>

            {/* Adicionar Novo Alias */}
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={newAliasDraft}
                onChange={(e) => setNewAliasDraft(e.target.value)}
                placeholder="Novo sinônimo ou alias..."
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg outline-none font-mono text-xs focus:border-[#003366]"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg shrink-0 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Alias</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Qualquer documento ou importação que contenha um dos aliases acima vinculará
              automaticamente a informação a este campo sem gerar duplicações.
            </span>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
