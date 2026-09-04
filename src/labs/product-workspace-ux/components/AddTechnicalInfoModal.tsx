// src/labs/product-workspace-ux/components/AddTechnicalInfoModal.tsx
/**
 * Modal de Adição de Informação Técnica.
 * 
 * Regras & Emendas (UX1.2):
 * - Componente 100% agnóstico a produto (productName e familyLineName dinâmicos).
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Info } from 'lucide-react';
import { FactItem } from '../types';

interface AddTechnicalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionTitle?: string;
  onAddFact: (factData: Omit<FactItem, 'id'>) => void;
  productName?: string;
  familyLineName?: string;
}

export const AddTechnicalInfoModal: React.FC<AddTechnicalInfoModalProps> = ({
  isOpen,
  onClose,
  sectionTitle,
  onAddFact,
  productName = 'este modelo',
  familyLineName = 'esta linha'
}) => {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [scopeChoice, setScopeChoice] = useState<'model' | 'family'>('model');
  const [sourceCode, setSourceCode] = useState('DOC-OFICIAL-01');
  const [page, setPage] = useState('1');

  const firstInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setLabel('');
      setValue('');
      setUnit('');
      setCustomKey('');
      setScopeChoice('model');
      setPage('1');
      setTimeout(() => {
        firstInputRef.current?.focus();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !value.trim()) return;

    const generatedKey = customKey.trim() || label.trim().toLowerCase().replace(/\s+/g, '.');

    onAddFact({
      label: label.trim(),
      value: value.trim(),
      unit: unit.trim() || undefined,
      originScope: scopeChoice,
      originKind: scopeChoice === 'model' ? 'product_local' : 'family',
      originLabel: scopeChoice === 'model' ? productName : familyLineName,
      semanticKey: generatedKey,
      aliases: [label.trim().toLowerCase()],
      source: {
        documentId: `doc-${Date.now()}`,
        documentTitle: `Documento Técnico Homologado (${sourceCode})`,
        documentCode: sourceCode,
        page: parseInt(page, 10) || 1,
        excerpt: `Especificação de ${label.trim()}: ${value.trim()} ${unit.trim()}`,
        verifiedStatus: 'verified'
      }
    });

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-info-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 id="add-info-modal-title" className="text-base font-bold text-slate-900">
              Nova Informação Técnica
            </h3>
            {sectionTitle && (
              <p className="text-xs text-slate-500">
                Adicionando em: <span className="font-semibold text-slate-700">{sectionTitle}</span>
              </p>
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
            <label htmlFor="new-fact-label" className="block font-semibold text-slate-700 mb-1">
              Nome da Especificação *
            </label>
            <input
              id="new-fact-label"
              ref={firstInputRef}
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Faixa de Operação, Estabilidade, Consumo..."
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label htmlFor="new-fact-value" className="block font-semibold text-slate-700 mb-1">
                Valor *
              </label>
              <input
                id="new-fact-value"
                type="text"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ex: 0 a 70, ±0,015..."
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-bold text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="new-fact-unit" className="block font-semibold text-slate-700 mb-1">
                Unidade
              </label>
              <input
                id="new-fact-unit"
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ex: bar, °C, mA"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="new-fact-key" className="font-semibold text-slate-700">
                Chave Semântica Canônica
              </label>
              <span className="text-[10px] text-slate-400">Opcional (gerada automaticamente)</span>
            </div>
            <input
              id="new-fact-key"
              type="text"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              placeholder={label ? label.toLowerCase().replace(/\s+/g, '.') : 'ex: pressure.range'}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none font-mono text-xs text-slate-600"
            />
          </div>

          {/* Escopo de Herança (100% Dinâmico) */}
          <div className="pt-1">
            <span className="block font-semibold text-slate-700 mb-1.5">
              Aplica-se a:
            </span>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeChoice === 'model'}
                  onChange={() => setScopeChoice('model')}
                  className="text-[#003366] focus:ring-0"
                />
                <span className="font-medium text-slate-800">
                  Somente a este modelo ({productName})
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={scopeChoice === 'family'}
                  onChange={() => setScopeChoice('family')}
                  className="text-[#003366] focus:ring-0"
                />
                <span className="font-medium text-slate-800">
                  Toda a linha ({familyLineName})
                </span>
              </label>
            </div>
          </div>

          {/* Fonte Oficial */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="col-span-2">
              <label htmlFor="new-fact-source" className="block font-semibold text-slate-700 mb-1">
                Fonte / Documento
              </label>
              <input
                id="new-fact-source"
                type="text"
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                placeholder="Ex: MP-Y18, EM0291-04"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-xs font-mono"
              />
            </div>
            <div>
              <label htmlFor="new-fact-page" className="block font-semibold text-slate-700 mb-1">
                Página
              </label>
              <input
                id="new-fact-page"
                type="number"
                min="1"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-xs font-mono"
              />
            </div>
          </div>

          {/* Nota Explicativa */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-2 text-blue-900 text-[11px] leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Ao adicionar, a nova informação entrará na fila de rascunho (staged) e ficará imediatamente disponível para visualização e organização no workspace.
            </span>
          </div>

          {/* Ações */}
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
              className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar ao Rascunho</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
