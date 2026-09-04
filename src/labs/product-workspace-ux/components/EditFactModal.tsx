// src/labs/product-workspace-ux/components/EditFactModal.tsx
import React, { useState } from 'react';
import { X, FileText, Users } from 'lucide-react';
import { FactItem } from '../types';

interface EditFactModalProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (factId: string, draft: Partial<FactItem>, scopeChoice: 'model' | 'family') => void;
  onOpenSource: (fact: FactItem) => void;
}

export const EditFactModal: React.FC<EditFactModalProps> = ({
  fact,
  isOpen,
  onClose,
  onSave,
  onOpenSource
}) => {
  if (!isOpen || !fact) return null;

  const [label, setLabel] = useState(fact.label);
  const [value, setValue] = useState(fact.value);
  const [unit, setUnit] = useState(fact.unit || '');
  const [scopeChoice, setScopeChoice] = useState<'model' | 'family'>(fact.originScope);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(
      fact.id,
      {
        label: label.trim(),
        value: value.trim(),
        unit: unit.trim() || undefined
      },
      scopeChoice
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Editar informação
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {fact.semanticKey}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome da Especificação
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Valor
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Unidade
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ex: kg"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
              />
            </div>
          </div>

          {/* Diálogo Humano de Herança da Linha */}
          {fact.originScope === 'family' && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                <Users className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Esta informação é compartilhada pela Linha TA.</span>
              </div>

              <div className="space-y-1 pt-1">
                <span className="block text-[11px] font-semibold text-slate-700">Alterar:</span>
                <label className="flex items-center gap-2 p-2 bg-white border border-blue-200 rounded-lg cursor-pointer hover:border-blue-300">
                  <input
                    type="radio"
                    name="scopeEdit"
                    checked={scopeChoice === 'model'}
                    onChange={() => setScopeChoice('model')}
                    className="text-[#003366] focus:ring-0"
                  />
                  <span className="font-semibold text-slate-800">
                    Somente TA-25N
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2 bg-white border border-blue-200 rounded-lg cursor-pointer hover:border-blue-300">
                  <input
                    type="radio"
                    name="scopeEdit"
                    checked={scopeChoice === 'family'}
                    onChange={() => setScopeChoice('family')}
                    className="text-[#003366] focus:ring-0"
                  />
                  <span className="font-semibold text-slate-800">
                    Todos os modelos da Linha TA
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Fonte Oficial Vinculada */}
          {fact.source && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="font-semibold text-slate-700">{fact.source.documentCode}</div>
                  {fact.source.page && (
                    <div className="text-[11px] text-slate-500">Página {fact.source.page}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenSource(fact)}
                className="text-[#003366] hover:underline font-semibold text-xs"
              >
                Ver fonte original
              </button>
            </div>
          )}

          {/* Ações (Staged Fact Edit) */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs"
            >
              Salvar alteração no rascunho
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
