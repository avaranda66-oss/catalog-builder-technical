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
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-blue-900 font-bold">
                <Users className="w-4 h-4 text-blue-700" />
                <span>Esta informação é compartilhada com outros modelos da linha</span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Ao alterar este valor, você pode aplicar apenas a este modelo específico ou propagar a alteração para todos os calibradores da família.
              </p>

              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 p-1.5 bg-white border border-blue-200 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="scopeEdit"
                    checked={scopeChoice === 'model'}
                    onChange={() => setScopeChoice('model')}
                    className="text-[#003366] focus:ring-0"
                  />
                  <span className="font-semibold text-slate-800">
                    Alterar somente no TA-25N
                  </span>
                </label>

                <label className="flex items-center gap-2 p-1.5 bg-white border border-blue-200 rounded-lg cursor-pointer">
                  <input
                    type="radio"
                    name="scopeEdit"
                    checked={scopeChoice === 'family'}
                    onChange={() => setScopeChoice('family')}
                    className="text-[#003366] focus:ring-0"
                  />
                  <span className="font-semibold text-slate-800">
                    Alterar em todos os modelos desta linha
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
                  <div className="text-[11px] text-slate-500">Página {fact.source.page}</div>
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

          {/* Ações */}
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
              Salvar alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
