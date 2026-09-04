// src/labs/product-workspace-ux/components/CreateTableModal.tsx
/**
 * Modal de Criação de Nova Tabela Técnica.
 * 
 * Regras & Emendas (UX1.2):
 * - Componente 100% agnóstico a produto (productName e familyLineName dinâmicos).
 * - Acessibilidade: role="dialog", aria-modal="true", foco inicial, tecla Escape e foco de retorno.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Table as TableIcon, Plus } from 'lucide-react';
import { WorkspaceSection } from '../types';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: WorkspaceSection[];
  onCreateTable: (sectionId: string, title: string, columns: string[], rows: string[][]) => void;
  productName?: string;
  familyLineName?: string;
}

export const CreateTableModal: React.FC<CreateTableModalProps> = ({
  isOpen,
  onClose,
  sections,
  onCreateTable,
  productName = 'este instrumento',
  familyLineName = 'esta linha'
}) => {
  const [tableTitle, setTableTitle] = useState('Tabela Técnica Comparativa');
  const [targetSectionId, setTargetSectionId] = useState(sections[0]?.id || '');
  const [creationMode, setCreationMode] = useState<'empty' | 'from_facts'>('empty');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      setTableTitle('Tabela Técnica Comparativa');
      setTargetSectionId(sections[0]?.id || '');
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
    } else if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen, sections]);

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
    if (!tableTitle.trim() || !targetSectionId) return;

    if (creationMode === 'empty') {
      onCreateTable(
        targetSectionId,
        tableTitle.trim(),
        ['Parâmetro', 'Valor Nominal', 'Tolerância'],
        [
          ['Parâmetro Principal', '100,0', '±0,05%'],
          ['Resolução de Amostragem', '0,01', 'Fundo de Escala']
        ]
      );
    } else {
      onCreateTable(
        targetSectionId,
        tableTitle.trim(),
        ['Propriedade Técnica', 'Valor Especificado', 'Origem da Informação'],
        [
          ['Especificação Exclusiva', 'Ativo', productName],
          ['Parâmetro de Família', 'Padronizado', familyLineName],
          ['Tempo de Resposta', '25 ms', productName]
        ]
      );
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-table-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-[#003366] rounded-lg">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 id="create-table-modal-title" className="text-base font-bold text-slate-900">
                Criar Nova Tabela Técnica
              </h3>
              <p className="text-xs text-slate-500">
                Adiciona uma tabela estruturada e editável no workspace
              </p>
            </div>
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
            <label htmlFor="create-table-title" className="block font-semibold text-slate-700 mb-1">
              Título da Tabela *
            </label>
            <input
              id="create-table-title"
              ref={titleInputRef}
              type="text"
              required
              value={tableTitle}
              onChange={(e) => setTableTitle(e.target.value)}
              placeholder="Ex: Matriz de Conexões, Faixas de Medição..."
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-sm font-semibold text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="create-table-section" className="block font-semibold text-slate-700 mb-1">
              Seção de Destino *
            </label>
            <select
              id="create-table-section"
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 focus:border-[#003366] rounded-lg outline-none text-xs"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 mb-1.5">
              Estrutura Inicial de Dados:
            </span>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="tableMode"
                  checked={creationMode === 'empty'}
                  onChange={() => setCreationMode('empty')}
                  className="text-[#003366] focus:ring-0 mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-900">Tabela em Branco (Padrão)</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Cria 3 colunas padrão (Parâmetro, Valor, Tolerância) para preenchimento manual ou importação.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="tableMode"
                  checked={creationMode === 'from_facts'}
                  onChange={() => setCreationMode('from_facts')}
                  className="text-[#003366] focus:ring-0 mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-900">Pré-preencher com Dados de Exemplo</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Preenche linhas de demonstração alinhadas ao produto ativo.
                  </div>
                </div>
              </label>
            </div>
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
              <span>Criar Tabela no Workspace</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
