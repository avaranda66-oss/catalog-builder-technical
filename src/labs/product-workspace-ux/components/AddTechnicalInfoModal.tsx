// src/labs/product-workspace-ux/components/AddTechnicalInfoModal.tsx
import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { FactItem } from '../types';
import { TA_MANUAL_PT_SOURCE } from '../ta25n.fixture';

interface AddTechnicalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFact: (factData: Omit<FactItem, 'id'>) => void;
  sectionTitle?: string;
}

export const AddTechnicalInfoModal: React.FC<AddTechnicalInfoModalProps> = ({
  isOpen,
  onClose,
  onAddFact,
  sectionTitle
}) => {
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [scopeChoice, setScopeChoice] = useState<'model' | 'family'>('model');
  const [sourceCode, setSourceCode] = useState('EM0291-04');
  const [page, setPage] = useState('5');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customKey, setCustomKey] = useState('');

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
      originLabel: scopeChoice === 'model' ? 'TA-25N' : 'Linha TA',
      semanticKey: generatedKey,
      aliases: [label.trim().toLowerCase()],
      source: {
        ...TA_MANUAL_PT_SOURCE,
        documentCode: sourceCode,
        page: parseInt(page, 10) || 1
      }
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Adicionar informação técnica
            </h3>
            {sectionTitle && (
              <p className="text-xs text-slate-500 mt-0.5">
                Destino: Seção &quot;{sectionTitle}&quot;
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário Humano */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nome da Informação
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Tensão de Alimentação, Resolução, Peso"
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Valor
              </label>
              <input
                type="text"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ex: 10,5 ou 115 / 230"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
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
                placeholder="Ex: °C, kg, Vac"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm"
              />
            </div>
          </div>

          {/* Aplica-se a (Escopo) */}
          <div className="pt-1">
            <label className="block font-semibold text-slate-700 mb-1.5">
              Aplica-se a:
            </label>
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
                  Somente a este modelo (TA-25N)
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
                  Toda a linha (compartilhado com TA-35N, TA-50N)
                </span>
              </label>
            </div>
          </div>

          {/* Fonte Oficial */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Fonte / Documento
              </label>
              <select
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-xs bg-white"
              >
                <option value="EM0291-04">Manual de Operação PT (EM0291-04)</option>
                <option value="EM0314-01">Technical Manual EN (EM0314-01)</option>
                <option value="CAT-TA-2024-V2">Catálogo Comercial Linha TA</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Página
              </label>
              <input
                type="number"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                min="1"
                className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-xs"
              />
            </div>
          </div>

          {/* Mais Opções (Colapsável) */}
          <div className="border-t border-slate-200 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 font-semibold"
            >
              <span>Mais opções avançadas</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="mt-2.5 p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-200">
                <label className="block font-semibold text-slate-600">
                  Chave Semântica Canônica (Opcional)
                </label>
                <input
                  type="text"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="Ex: electrical.power_rating"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs bg-white"
                />
                <p className="text-[11px] text-slate-400">
                  Se omitido, o sistema gerará automaticamente uma chave canônica a partir do nome.
                </p>
              </div>
            )}
          </div>

          {/* Botões do Rodapé */}
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
              Adicionar informação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
