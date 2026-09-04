// src/components/library/product-workspace-v2/SemanticEditor.tsx
import React, { useState } from 'react';
import { X, Tag, Plus, Shield } from 'lucide-react';
import { SemanticDescriptor } from '../../../domain/product-workspace/types';

export interface SemanticEditorProps {
  isOpen: boolean;
  onClose: () => void;
  descriptor: SemanticDescriptor | null;
  onSave: (updatedDescriptor: SemanticDescriptor) => void;
}

export const SemanticEditor: React.FC<SemanticEditorProps> = ({
  isOpen,
  onClose,
  descriptor,
  onSave
}) => {
  if (!isOpen || !descriptor) return null;

  const [displayLabel, setDisplayLabel] = useState(descriptor.displayLabel);
  const [aliases, setAliases] = useState<string[]>([...descriptor.aliases]);
  const [newAlias, setNewAlias] = useState('');
  const [description, setDescription] = useState(descriptor.description || '');

  const handleAddAlias = () => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;
    if (aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return;
    if (trimmed.toLowerCase() === displayLabel.toLowerCase()) return;
    setAliases([...aliases, trimmed]);
    setNewAlias('');
  };

  const handleRemoveAlias = (index: number) => {
    setAliases(aliases.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmedLabel = displayLabel.trim();
    if (!trimmedLabel) return;

    onSave({
      ...descriptor,
      displayLabel: trimmedLabel,
      aliases,
      description: description.trim() || undefined
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                <Tag className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Identidade da Especificação
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Personalize rótulos humanos e sinônimos para busca e inteligência artificial.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Chave Canônica do Sistema (Protegida) */}
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-medium">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  Chave Canônica Estável (Sistema & IA)
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                  Protegida
                </span>
              </div>
              <div className="font-mono text-xs text-slate-800 dark:text-slate-200 font-semibold select-all">
                {descriptor.canonicalKey}
              </div>
            </div>

            {/* Nome de Exibição Humano */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nome de Exibição (Como o usuário enxerga)
              </label>
              <input
                type="text"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                placeholder="Ex: Faixa de Temperatura"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 dark:text-slate-100 font-medium"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Você pode alterar este nome livremente. Isso não afeta as integrações internas.
              </p>
            </div>

            {/* Sinônimos e Termos de Busca (Aliases) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Sinônimos & Termos para IA (Aliases)
                </label>
                <span className="text-[11px] text-slate-400">
                  {aliases.length} cadastrados
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAlias();
                    }
                  }}
                  placeholder="Novo sinônimo (ex: temperatura de trabalho)"
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAlias}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:hover:bg-blue-900 dark:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
              </div>

              {aliases.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {aliases.map((alias, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(idx)}
                        className="text-slate-400 hover:text-red-500 ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
                  Nenhum sinônimo configurado ainda.
                </p>
              )}
            </div>

            {/* Descrição contextual */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações / Descrição Semântica
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explicação adicional para enriquecer respostas da IA..."
                rows={2}
                className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
            >
              Salvar Identidade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
