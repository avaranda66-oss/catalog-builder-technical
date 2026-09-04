// src/components/library/product-workspace/NewDatasetModal.tsx
// Modal para criação de novas tabelas técnicas vazias (PIM.PRODUCTION.CORE1.1 - Item 7).

import React, { useState } from 'react';
import { Table, Check, X, AlertCircle } from 'lucide-react';
import {
  TechnicalModule,
  DatasetKind,
  TechnicalDataset,
  isValidSemanticKey
} from '../../../domain/product-workbook';

interface NewDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  modules: readonly TechnicalModule[];
  existingSemanticKeys: readonly string[];
  onCreateDataset: (dataset: Omit<TechnicalDataset, 'id' | 'order'>) => void;
}

export const NewDatasetModal: React.FC<NewDatasetModalProps> = ({
  isOpen,
  onClose,
  modules,
  existingSemanticKeys,
  onCreateDataset
}) => {
  const [label, setLabel] = useState('');
  const [semanticKey, setSemanticKey] = useState('');
  const [moduleId, setModuleId] = useState(modules.length > 0 ? modules[0].id : '');
  const [kind, setKind] = useState<DatasetKind>('matrix');
  const [description, setDescription] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!semanticKey || semanticKey === autoSlug(label)) {
      setSemanticKey(autoSlug(val));
    }
  };

  const autoSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 40);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedLabel = label.trim();
    const trimmedKey = semanticKey.trim().toLowerCase();

    if (!trimmedLabel) {
      setErrorMsg('Informe o nome/rótulo da tabela técnica.');
      return;
    }

    if (!trimmedKey) {
      setErrorMsg('Informe a chave semântica da tabela.');
      return;
    }

    if (!isValidSemanticKey(trimmedKey)) {
      setErrorMsg('Chave semântica inválida. Use apenas letras minúsculas, números e pontos (ex: metrology.accuracy).');
      return;
    }

    if (existingSemanticKeys.includes(trimmedKey)) {
      setErrorMsg(`A chave semântica "${trimmedKey}" já existe neste produto.`);
      return;
    }

    if (!moduleId) {
      setErrorMsg('Selecione o módulo técnico ao qual esta tabela pertence.');
      return;
    }

    onCreateDataset({
      label: trimmedLabel,
      semanticKey: trimmedKey,
      moduleId,
      kind,
      description: description.trim() || undefined,
      columns: [],
      rows: [],
      cells: {}
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-[#003366]" />
            <h3 className="text-xs font-bold text-slate-800">
              Criar Nova Tabela Técnica Vazia
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nome da Tabela *
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="Ex: Tabela de Exatidão Calibrada"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:border-[#003366] focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Chave Semântica (semanticKey) *
            </label>
            <input
              type="text"
              value={semanticKey}
              onChange={(e) => setSemanticKey(e.target.value)}
              placeholder="Ex: metrology.accuracy_table"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-xs focus:border-[#003366] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Módulo Pertencente *
              </label>
              <select
                value={moduleId}
                onChange={(e) => setModuleId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:border-[#003366] focus:outline-none"
              >
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Tipo Estrutural (Kind)
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DatasetKind)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:border-[#003366] focus:outline-none"
              >
                <option value="matrix">Matriz (Grade)</option>
                <option value="specs">Especificações</option>
                <option value="ordering">Códigos de Pedido</option>
                <option value="accessories">Acessórios</option>
                <option value="custom">Personalizada</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Descrição (opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Condições de ensaio e incertezas expandidas"
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs focus:border-[#003366] focus:outline-none"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded text-xs font-medium cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Criar Tabela Vazia</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
