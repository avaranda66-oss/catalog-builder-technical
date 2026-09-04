// src/components/library/product-workspace/NewModuleModal.tsx
// Modal para criação de novos módulos técnicos com templates estruturais livres de fatos (PIM.PRODUCTION.CORE1.1).

import React, { useState } from 'react';
import { Layers, Sparkles, X, Plus } from 'lucide-react';
import {
  ProductWorkbookV2,
  ModuleKind,
  addModule
} from '../../../domain/product-workbook';

interface NewModuleModalProps {
  workbook: ProductWorkbookV2;
  isOpen: boolean;
  onClose: () => void;
  onUpdateWorkbook: (updated: ProductWorkbookV2) => void;
}

export const MODULE_STRUCTURE_TEMPLATES: ReadonlyArray<{
  readonly idSuffix: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly kind: ModuleKind;
  readonly description: string;
}> = [
  {
    idSuffix: 'metrology',
    semanticKey: 'metrology.specs',
    label: 'Especificações Metrológicas',
    kind: 'key_value',
    description: 'Faixas operacionais, exatidão, estabilidade e resolução térmica/pressão.'
  },
  {
    idSuffix: 'electrical',
    semanticKey: 'electrical.signals',
    label: 'Sinais Elétricos e Termometria',
    kind: 'key_value',
    description: 'Entradas/saídas de mA, mV, RTDs, termopares e alimentação de loop 24V.'
  },
  {
    idSuffix: 'mechanical',
    semanticKey: 'mechanical.dimensions',
    label: 'Dimensões Físicas & Mecânica',
    kind: 'key_value',
    description: 'Peso, dimensões externas, poço térmico e conexões de processo.'
  },
  {
    idSuffix: 'accessories',
    semanticKey: 'accessories.catalog',
    label: 'Acessórios Inclusos e Opcionais',
    kind: 'collection',
    description: 'Maletas, cabos, insertos de calibração e pontas de prova.'
  },
  {
    idSuffix: 'ordering',
    semanticKey: 'ordering.matrix',
    label: 'Codificação e Pedido',
    kind: 'ordering',
    description: 'Matriz de seleção de opcionais, códigos de encomenda e montagem de Part Number.'
  },
  {
    idSuffix: 'ambient',
    semanticKey: 'ambient.conditions',
    label: 'Condições de Operação & Ambiente',
    kind: 'key_value',
    description: 'Temperatura e umidade de operação, índice de proteção e isolação.'
  }
];

export const NewModuleModal: React.FC<NewModuleModalProps> = ({
  workbook,
  isOpen,
  onClose,
  onUpdateWorkbook
}) => {
  const [semanticKey, setSemanticKey] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ModuleKind>('key_value');
  const [order, setOrder] = useState<number>(workbook.modules.length);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyTemplate = (tmpl: typeof MODULE_STRUCTURE_TEMPLATES[number]) => {
    setSemanticKey(tmpl.semanticKey);
    setLabel(tmpl.label);
    setKind(tmpl.kind);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!semanticKey.trim() || !label.trim()) {
      setError('A chave semântica e o rótulo são obrigatórios.');
      return;
    }

    try {
      const newModuleId = `mod_${Math.random().toString(36).substring(2, 10)}`;
      const updated = addModule(workbook, {
        id: newModuleId,
        semanticKey: semanticKey.trim(),
        label: label.trim(),
        kind,
        order: Number(order) || 0
      }) as ProductWorkbookV2;

      onUpdateWorkbook(updated);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar módulo técnico.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
            <Layers className="w-4 h-4 text-[#003366]" />
            <span>Criar Novo Módulo Técnico (PIM Core V1.1)</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Templates Rápidos Estruturais (Zero Fatos) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Templates Estruturais Prontos (Sem fatos técnicos sintéticos):</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_STRUCTURE_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.idSuffix}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="p-2 border border-slate-200 rounded hover:border-[#003366] hover:bg-slate-50 transition-colors text-left text-[11px] space-y-0.5 cursor-pointer"
                >
                  <div className="font-bold text-slate-900 truncate">{tmpl.label}</div>
                  <div className="font-mono text-[9px] text-slate-400">{tmpl.semanticKey}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded text-[11px]">
              {error}
            </div>
          )}

          {/* Formulário Manual */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Rótulo de Exibição (Label)
              </label>
              <input
                type="text"
                placeholder="Ex: Especificações Metrológicas"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Chave Semântica (namespace.segment)
              </label>
              <input
                type="text"
                placeholder="Ex: metrology.specs"
                value={semanticKey}
                onChange={(e) => setSemanticKey(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-[11px] focus:border-[#003366] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo de Módulo (Kind)</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ModuleKind)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                >
                  <option value="key_value">Chave-Valor (Especificações)</option>
                  <option value="matrix">Matriz / Grade</option>
                  <option value="collection">Coleção / Acessórios</option>
                  <option value="ordering">Códigos de Pedido</option>
                  <option value="rich_notes">Notas Ricas</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ordem de Exibição</label>
                <input
                  type="number"
                  value={order}
                  onChange={(e) => setOrder(Number(e.target.value))}
                  min={0}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded focus:border-[#003366] focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#003366] hover:bg-[#002244] text-white font-bold rounded flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Módulo</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
