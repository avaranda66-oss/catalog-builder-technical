// src/labs/product-workspace-ux/components/EditFactModal.tsx
/**
 * Modal de Edição Técnica de Fato (Staged Fact Edit).
 * 
 * Regras & Emendas (AMENDMENT 8, 9 & UX1.2):
 * - Totalmente agnóstico a produto (productName e familyLineName dinâmicos).
 * - Suporta distinção entre originScope ('model' | 'family') e originKind ('product_local' | 'family' | 'product_override').
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 * - Zero termos técnicos proibidos (override interno não é exposto como jargão, CAS ou ownerKind).
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, FileText, Users, Bookmark } from 'lucide-react';
import { FactItem, DetailLevel } from '../types';

interface EditFactModalProps {
  fact: FactItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (factId: string, draft: Partial<FactItem>, scopeChoice: 'model' | 'family') => void;
  onOpenSource: (fact: FactItem) => void;
  productName?: string;
  familyLineName?: string;
  detailLevel?: DetailLevel;
}

export const EditFactModal: React.FC<EditFactModalProps> = ({
  fact,
  isOpen,
  onClose,
  onSave,
  onOpenSource,
  productName = 'este modelo',
  familyLineName = 'esta linha',
  detailLevel = 'simple'
}) => {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [scopeChoice, setScopeChoice] = useState<'model' | 'family'>('model');

  const firstInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && fact) {
      triggerRef.current = document.activeElement as HTMLElement;
      setLabel(fact.label);
      setValue(fact.value);
      setUnit(fact.unit || '');
      setScopeChoice(fact.originScope);

      // Foco inicial
      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, fact]);

  // Fechar com tecla Escape
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-fact-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="edit-fact-modal-title" className="text-base font-bold text-slate-900">
              Editar informação
            </h3>
            {detailLevel === 'advanced' && (
              <span className="text-xs text-slate-500 font-mono">
                {fact.semanticKey}
              </span>
            )}
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

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label htmlFor="edit-fact-label" className="block font-semibold text-slate-700 mb-1">
              Nome da Especificação
            </label>
            <input
              id="edit-fact-label"
              ref={firstInputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="edit-fact-value" className="block font-semibold text-slate-700 mb-1">
                Valor
              </label>
              <input
                id="edit-fact-value"
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-bold text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="edit-fact-unit" className="block font-semibold text-slate-700 mb-1">
                Unidade
              </label>
              <input
                id="edit-fact-unit"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ex: bar, °C"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
              />
            </div>
          </div>

          {/* Diálogo Humano de Herança Compartilhada (100% Dinâmico) */}
          {fact.originScope === 'family' && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                <Users className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Esta informação é compartilhada pela {familyLineName}.</span>
              </div>

              <div className="space-y-1.5 pt-1">
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
                    Somente {productName}
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
                    Todos os modelos da {familyLineName}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Badge de Override de Produto (Se aplicável) */}
          {fact.originKind === 'product_override' && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-900">
              <Bookmark className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[11px] font-medium">
                Esta informação possui especificação própria que substitui o valor padrão da linha.
              </span>
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
                className="text-[#003366] hover:underline font-semibold text-xs focus:outline-none"
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
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs transition-colors"
            >
              Salvar alteração no rascunho
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
