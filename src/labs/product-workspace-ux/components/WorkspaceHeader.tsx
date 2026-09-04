// src/labs/product-workspace-ux/components/WorkspaceHeader.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Eye,
  Layers,
  ChevronDown,
  FileText,
  Table as TableIcon,
  Tag,
  X
} from 'lucide-react';
import { WorkspaceMode, WorkspacePerspective, SearchResultItem } from '../types';

interface WorkspaceHeaderProps {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  perspective: WorkspacePerspective;
  setPerspective: (perspective: WorkspacePerspective) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: SearchResultItem[];
  onSelectSearchResult: (result: SearchResultItem) => void;
  onOpenAddModal: () => void;
  onOpenAIOrganize: () => void;
  onOpenAIImport: () => void;
  onOpenCreateTable: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  mode,
  setMode,
  perspective,
  setPerspective,
  searchQuery,
  setSearchQuery,
  searchResults,
  onSelectSearchResult,
  onOpenAddModal,
  onOpenAIOrganize,
  onOpenAIImport,
  onOpenCreateTable
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Fecha menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Lado Esquerdo: Identidade do Produto e Status */}
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-[#003366] border border-blue-200 rounded-sm">
              Calibrador Bloco Seco
            </span>
            <span className="text-xs text-slate-500 font-medium">
              Linha TA · Metrologia Industrial
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
            PRESYS TA-25N
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              129 especificações ativas
            </span>
          </h1>
        </div>

        {/* Lado Central: Barra de Busca Confortável */}
        <div ref={searchContainerRef} className="relative flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Buscar neste produto... (ex: Pt100, exatidão, peso)"
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-300 focus:border-[#003366] rounded-md transition-all outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dropdown de Resultados da Busca */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto z-50 divide-y divide-slate-100">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  Nenhum resultado encontrado para &quot;{searchQuery}&quot;.
                </div>
              ) : (
                <>
                  <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
                    <span>Resultados ({searchResults.length})</span>
                    <span>Clique para navegar</span>
                  </div>
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectSearchResult(item);
                        setIsSearchOpen(false);
                      }}
                      className="w-full px-3 py-2.5 text-left hover:bg-blue-50/50 flex items-start gap-2.5 transition-colors group"
                    >
                      <div className="mt-0.5">
                        {item.type === 'sensor' && <TableIcon className="w-4 h-4 text-blue-600" />}
                        {item.type === 'fact' && <SlidersHorizontal className="w-4 h-4 text-emerald-600" />}
                        {item.type === 'alias' && <Tag className="w-4 h-4 text-amber-600" />}
                        {item.type === 'document' && <FileText className="w-4 h-4 text-purple-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 group-hover:text-[#003366] flex items-center justify-between">
                          <span className="truncate">{item.title}</span>
                          <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.sectionTitle}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-0.5">{item.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Lado Direito: Ações Principais e Modos */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Perspectiva */}
          <div className="relative inline-flex items-center">
            <select
              value={perspective}
              onChange={(e) => setPerspective(e.target.value as WorkspacePerspective)}
              className="text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:border-slate-400 rounded-md px-2.5 py-1.5 pr-7 appearance-none cursor-pointer focus:outline-none focus:border-[#003366]"
            >
              <option value="standard">Visualização Padrão</option>
              <option value="engineering">Engenharia Metrológica</option>
              <option value="commercial">Comercial & Vendas</option>
              <option value="documentation">Documentação & Auditoria</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 pointer-events-none" />
          </div>

          {/* Botão de Organização Automática com IA */}
          <button
            onClick={onOpenAIOrganize}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 rounded-md transition-colors"
            title="Sugerir layout inteligente sem alterar os dados"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Organizar com IA</span>
          </button>

          {/* Menu Dropdown: + Adicionar */}
          <div ref={addMenuRef} className="relative">
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#003366] hover:bg-[#002850] rounded-md transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
            </button>

            {isAddMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-xs text-slate-700">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  O que deseja adicionar?
                </div>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddModal();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-medium"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#003366]" />
                  Informação técnica
                </button>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenCreateTable();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-medium"
                >
                  <TableIcon className="w-3.5 h-3.5 text-emerald-600" />
                  Tabela
                </button>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAIImport();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 font-medium text-purple-700"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Importar documento com IA
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddModal();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-600"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  Nova seção
                </button>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddModal();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-600"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Documento ou manual
                </button>
              </div>
            )}
          </div>

          {/* Toggle Fundamental: Modo Leitura vs Editar Workspace */}
          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            <button
              onClick={() => setMode('view')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-all ${
                mode === 'view'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Modo de visualização limpo e focado no conteúdo"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Modo Leitura</span>
            </button>
            <button
              onClick={() => setMode('edit_workspace')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-all ${
                mode === 'edit_workspace'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Permite reorganizar blocos, renomear seções e redimensionar tabelas"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Editar Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
