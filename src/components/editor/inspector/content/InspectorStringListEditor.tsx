// src/components/editor/inspector/content/InspectorStringListEditor.tsx
// Componente de feature reutilizável para edição de coleções de strings (highlights e bullets).
// Suporta adicionar (string vazia segura), editar e remover itens sem scroll aninhado.

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface InspectorStringListEditorProps {
  idPrefix: string;
  items: string[];
  onChange: (items: string[]) => void;
  title?: string;
  addButtonLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
}

export const InspectorStringListEditor: React.FC<InspectorStringListEditorProps> = ({
  idPrefix,
  items,
  onChange,
  title = 'Itens de Destaque',
  addButtonLabel = '+ Adicionar Item',
  emptyLabel = 'Nenhum item cadastrado.',
  placeholder = 'Descreva o diferencial técnico...'
}) => {
  const handleAddItem = () => {
    // Insere string vazia como draft seguro para não poluir o documento com texto fictício
    onChange([...items, '']);
  };

  const handleItemChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <button
          type="button"
          onClick={handleAddItem}
          className="px-2 py-0.5 text-[11px] font-semibold text-[#003366] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>{addButtonLabel}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-1.5 px-2 bg-slate-50 border border-dashed border-slate-200 rounded">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                id={`${idPrefix}-item-${idx}`}
                type="text"
                value={item}
                onChange={(e) => handleItemChange(idx, e.target.value)}
                placeholder={placeholder}
                className="flex-1 px-2 py-1 text-xs text-slate-800 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[#003366] focus:border-[#003366]"
              />
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                title="Excluir item"
                aria-label={`Excluir item ${idx + 1}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
