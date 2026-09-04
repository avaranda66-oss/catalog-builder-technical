// src/labs/product-workspace-ux/components/CreateTableModal.tsx
import React, { useState } from 'react';
import { X, Table as TableIcon, Sparkles, Plus } from 'lucide-react';
import { WorkspaceSection } from '../types';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: WorkspaceSection[];
  onCreateTable: (sectionId: string, title: string, columns: string[], rows: string[][]) => void;
}

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  sections,
  onCreateTable
}) => {
  const [selectedMode, setSelectedMode] = useState<'existing' | 'empty' | 'suggested'>('existing');
  const [targetSectionId, setTargetSectionId] = useState(sections[1]?.id || sections[0]?.id || '');
  const [tableTitle, setTableTitle] = useState('Tabela de Especificações Complementares');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!tableTitle.trim()) return;

    if (selectedMode === 'empty') {
      onCreateTable(
        targetSectionId,
        tableTitle.trim(),
        ['Parâmetro', 'Valor Especificado', 'Tolerância'],
        [
          ['Estabilidade', '±0,02 °C', 'Garantido em 15 min'],
          ['Resolução', '0,01 °C', 'Full Scale']
        ]
      );
    } else {
      // Usar informações existentes
      onCreateTable(
        targetSectionId,
        tableTitle.trim(),
        ['Propriedade', 'Valor de Referência', 'Origem'],
        [
          ['Uniformidade Axial', '±0,05 °C', 'TA-25N'],
          ['Uniformidade Radial', '±0,02 °C', 'TA-25N'],
          ['Tempo de Estabilização', '15 min', 'Linha TA']
        ]
      );
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Criar nova tabela no Workspace
              </h3>
              <p className="text-xs text-slate-500">
                Agrupe informações em formato tabular legível
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Título da Tabela
            </label>
            <input
              type="text"
              value={tableTitle}
              onChange={(e) => setTableTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none font-semibold text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Seção de Destino
            </label>
            <select
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none bg-white text-xs"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-2">
              Como deseja estruturar a tabela?
            </label>
            <div className="space-y-2">
              <label
                onClick={() => setSelectedMode('existing')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedMode === 'existing'
                    ? 'border-[#003366] bg-blue-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="tableMode"
                  checked={selectedMode === 'existing'}
                  onChange={() => setSelectedMode('existing')}
                  className="mt-0.5 text-[#003366]"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    Usar informações técnicas existentes
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Selecione especificações já cadastradas para criar uma matriz Propriedade | Valor sem duplicar dados.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setSelectedMode('empty')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedMode === 'empty'
                    ? 'border-[#003366] bg-blue-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="tableMode"
                  checked={selectedMode === 'empty'}
                  onChange={() => setSelectedMode('empty')}
                  className="mt-0.5 text-[#003366]"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    Tabela em branco personalizável
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Comece com colunas e linhas editáveis diretamente na tela.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setSelectedMode('suggested')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedMode === 'suggested'
                    ? 'border-purple-600 bg-purple-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="tableMode"
                  checked={selectedMode === 'suggested'}
                  onChange={() => setSelectedMode('suggested')}
                  className="mt-0.5 text-purple-600"
                />
                <div>
                  <div className="font-bold text-purple-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Sugerir organização por IA
                  </div>
                  <div className="text-purple-800 text-[11px] mt-0.5">
                    A inteligência agrupa dados correlatos detectando colunas e unidades automaticamente.
                  </div>
                </div>
              </label>
            </div>
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
            onClick={handleCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003366] hover:bg-[#00254d] rounded-lg shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Criar tabela</span>
          </button>
        </div>
      </div>
    </div>
  );
};
