// src/components/library-v2/LibraryV2Header.tsx
// Cabeçalho da Library V2 com breadcrumbs, busca, alternador do Modo Aprender e acesso ao Glossário.

import React from 'react';
import { Product } from '../../domain/product.schema';
import { LearnModeToggle } from '../guided-help/index';
import { useLearnMode } from '../../features/guided-help/index';
import {
  Search,
  ArrowLeft,
  ChevronRight,
  Layers,
  HelpCircle
} from 'lucide-react';

export interface LibraryV2HeaderProps {
  currentFamily: string;
  selectedProduct: Product | null;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onSwitchToClassic: () => void;
  onClearProductSelection: () => void;
}

export const LibraryV2Header: React.FC<LibraryV2HeaderProps> = ({
  currentFamily,
  selectedProduct,
  searchTerm,
  onSearchTermChange,
  onSwitchToClassic,
  onClearProductSelection
}) => {
  const { openGlossary } = useLearnMode();

  return (
    <header
      data-tour="v2-header"
      className="bg-white border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 shadow-xs"
    >
      {/* Breadcrumb de Contexto */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 flex-wrap">
        <button
          type="button"
          onClick={onClearProductSelection}
          className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
        >
          <Layers size={14} className="text-indigo-600" />
          <span>Biblioteca</span>
        </button>

        <ChevronRight size={13} className="text-slate-400" />

        <span className="text-slate-800 font-bold">
          Família: {currentFamily || 'Geral'}
        </span>

        {selectedProduct && (
          <>
            <ChevronRight size={13} className="text-slate-400" />
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
              {selectedProduct.model || selectedProduct.code}
            </span>
          </>
        )}
      </div>

      {/* Ações e Controles Centrais */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Campo de Busca Rápida */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            placeholder="Buscar modelo ou especificação..."
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white w-48 sm:w-64 transition-all"
          />
        </div>

        {/* Nível 3: Toggle do Modo Aprender */}
        <LearnModeToggle />

        {/* Nível 5: Botão Global de Ajuda / Glossário */}
        <button
          data-tour="v2-help-button"
          type="button"
          onClick={() => openGlossary()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 text-xs font-bold transition-colors"
          title="Abrir Central de Conhecimento e Glossário"
        >
          <HelpCircle size={14} className="text-indigo-600" />
          <span>Ajuda & Glossário</span>
        </button>

        {/* Comutador de Retorno à Library Classic */}
        <button
          type="button"
          onClick={onSwitchToClassic}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-colors"
          title="Retornar à interface tabular Classic / Pro"
        >
          <ArrowLeft size={13} />
          <span>Voltar para Classic</span>
        </button>
      </div>
    </header>
  );
};
