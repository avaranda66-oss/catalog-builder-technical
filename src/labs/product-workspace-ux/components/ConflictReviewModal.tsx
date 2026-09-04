// src/labs/product-workspace-ux/components/ConflictReviewModal.tsx
import React, { useState } from 'react';
import { X, AlertTriangle, Check, FileText } from 'lucide-react';
import { FactItem } from '../types';

interface ConflictReviewModalProps {
  conflict: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve: (factId: string, chosenValue: string, chosenUnit?: string) => void;
}

export const ConflictReviewModal: React.FC<ConflictReviewModalProps> = ({
  conflict,
  isOpen,
  onClose,
  onResolve
}) => {
  if (!isOpen || !conflict || !conflict.conflict) return null;

  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);

  const handleConfirm = () => {
    const chosen = conflict.conflict!.options[selectedOptionIndex];
    onResolve(conflict.id, chosen.extractedValue, chosen.unit);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Revisar divergência entre fontes
              </h3>
              <p className="text-xs text-slate-600">
                Especificação: <strong className="text-slate-900">{conflict.label}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Identificamos valores diferentes nos manuais oficiais para esta especificação.
            Selecione qual valor deve prevalecer na ficha técnica deste produto:
          </p>

          <div className="space-y-3">
            {conflict.conflict.options.map((opt, idx) => (
              <label
                key={idx}
                onClick={() => setSelectedOptionIndex(idx)}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedOptionIndex === idx
                    ? 'border-[#003366] bg-blue-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="conflictOption"
                  checked={selectedOptionIndex === idx}
                  onChange={() => setSelectedOptionIndex(idx)}
                  className="mt-1 text-[#003366] focus:ring-0"
                />

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">
                      {opt.extractedValue} {opt.unit || ''}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {opt.sourceCode} · pág. {opt.page}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Fonte: {opt.sourceTitle}
                  </p>

                  <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ver trecho original no documento</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500">
            A conciliação será registrada na rastreabilidade do produto. A outra fonte continuará arquivada para histórico técnico.
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
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Salvar conciliação</span>
          </button>
        </div>
      </div>
    </div>
  );
};
