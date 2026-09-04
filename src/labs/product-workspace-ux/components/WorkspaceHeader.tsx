// src/labs/product-workspace-ux/components/WorkspaceHeader.tsx
/**
 * Cabeçalho Sticky Global do Human-First Mega Product Workspace.
 * 
 * Regras & Emendas (AMENDMENT 2, 3, 8 & UX1.2):
 * - Seletor de produto dinâmico baseado em registry de fixtures.
 * - Identidade 100% dinâmica via ProductWorkspaceMetadata (zero hardcode de produto).
 * - Contagens derivadas em tempo real (derivedCounts.factsCount) sem drift.
 * - Marker explícito de fixture sintética: "LAB — dados de demonstração".
 * - Versões de revisão desacopladas e condicionadas ao modo avançado/engenharia:
 *   - "Versão da organização: vX"
 *   - "Versão dos dados técnicos: vY"
 *   - Totalmente ocultas no modo simples de visualização.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Layers,
  ChevronDown,
  FileText,
  Table as TableIcon,
  Tag,
  X,
  Database,
  LayoutGrid,
  FlaskConical,
  Pencil
} from 'lucide-react';
import {
  WorkspaceMode,
  WorkspacePerspective,
  InteractionMode,
  DetailLevel,
  SearchResultItem,
  ProductWorkspaceMetadata
} from '../types';

interface WorkspaceHeaderProps {
  productMetadata: ProductWorkspaceMetadata;
  availableProducts: ProductWorkspaceMetadata[];
  activeProductId: string;
  onSelectProduct: (id: string) => void;
  derivedCounts: {
    factsCount: number;
    tablesCount: number;
    sourcesCount: number;
    conflictsCount: number;
    uniqueFactsCount?: number;
    visibleUniqueFactsCount?: number;
    visibleFactOccurrences?: number;
    tableFactReferencesCount?: number;
    knowledgeFactsCount?: number;
  };
  lastSearchDurationMs?: number;
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  perspective: WorkspacePerspective;
  setPerspective: (perspective: WorkspacePerspective) => void;
  interactionMode?: InteractionMode;
  setInteractionMode?: (m: InteractionMode) => void;
  detailLevel?: DetailLevel;
  setDetailLevel?: (d: DetailLevel) => void;
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
  productMetadata,
  availableProducts,
  activeProductId,
  onSelectProduct,
  derivedCounts,
  lastSearchDurationMs,
  mode,
  setMode,
  perspective,
  setPerspective,
  interactionMode,
  setInteractionMode,
  detailLevel,
  setDetailLevel,
  searchQuery,
  setSearchQuery,
  searchResults,
  onSelectSearchResult,
  onOpenAddModal,
  onOpenAIOrganize,
  onOpenAIImport,
  onOpenCreateTable
}) => {
  const [isProductMenuOpen, setIsProductMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const effectiveInteractionMode: InteractionMode =
    interactionMode || (mode === 'edit_workspace' ? 'edit_layout' : 'view');
  const effectiveDetailLevel: DetailLevel =
    detailLevel || (perspective === 'engineering' ? 'advanced' : 'simple');
  const isAdvanced = effectiveDetailLevel === 'advanced';

  const productMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Fecha menus ao clicar fora ou ao pressionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productMenuRef.current && !productMenuRef.current.contains(e.target as Node)) {
        setIsProductMenuOpen(false);
      }
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProductMenuOpen(false);
        setIsAddMenuOpen(false);
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 shadow-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Lado Esquerdo: Identidade do Produto, Seletor e Metadados */}
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Categoria do Produto */}
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-blue-50 text-[#003366] border border-blue-200 rounded-sm">
              {productMetadata.category}
            </span>

            {/* Família e Departamento */}
            <span className="text-xs text-slate-500 font-medium">
              {productMetadata.familyLine} · {productMetadata.department}
            </span>

            {/* Badge de Dados Sintéticos (Amendment 8) */}
            {productMetadata.isSynthetic && (
              <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-amber-600" />
                <span>LAB — dados de demonstração</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {/* Seletor de Produtos Registrados (Amendment 3) */}
            <div ref={productMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsProductMenuOpen(!isProductMenuOpen)}
                aria-haspopup="listbox"
                aria-expanded={isProductMenuOpen}
                className="text-2xl font-bold text-slate-900 tracking-tight hover:text-[#003366] flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#003366] rounded-md px-1 -ml-1"
              >
                <span>{productMetadata.name}</span>
                <ChevronDown className="w-5 h-5 text-slate-400" />
              </button>

              {isProductMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Produtos para demonstração"
                  className="absolute left-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 text-xs"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    Alternar Produto no Laboratório
                  </div>
                  {availableProducts.map((p) => (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={p.id === activeProductId}
                      onClick={() => {
                        onSelectProduct(p.id);
                        setIsProductMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-2.5 text-left flex items-start gap-2.5 hover:bg-slate-50 transition-colors ${
                        p.id === activeProductId ? 'bg-blue-50/70 border-l-4 border-[#003366]' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 flex items-center justify-between">
                          <span className="truncate">{p.name}</span>
                          {p.isSynthetic && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                              Sintético
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 text-[11px] truncate mt-0.5">
                          {p.category} · {p.familyLine}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Contador de Especificações Técnicas Únicas */}
            <span
              title={`Fatos únicos visíveis: ${derivedCounts.visibleUniqueFactsCount ?? derivedCounts.uniqueFactsCount ?? derivedCounts.factsCount} · Ocorrências: ${derivedCounts.visibleFactOccurrences ?? derivedCounts.factsCount} · Tabelas: ${derivedCounts.tablesCount} · Fontes: ${derivedCounts.sourcesCount} · Conflitos: ${derivedCounts.conflictsCount}`}
              className="text-xs font-normal text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 cursor-help"
            >
              {derivedCounts.visibleUniqueFactsCount ?? derivedCounts.uniqueFactsCount ?? derivedCounts.factsCount} informações técnicas
            </span>

            {/* Revisões Desacopladas (Visíveis APENAS em Modo Avançado) */}
            {isAdvanced && (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-600 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-200">
                <span className="inline-flex items-center gap-1" title="Versão da organização visual do layout">
                  <LayoutGrid className="w-3 h-3 text-slate-400" />
                  <span>Versão da organização: <strong>v{productMetadata.layoutRevision}</strong></span>
                </span>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1" title="Versão dos dados e fatos técnicos">
                  <Database className="w-3 h-3 text-slate-400" />
                  <span>Versão dos dados técnicos: <strong>v{productMetadata.dataRevision}</strong></span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Lado Central: Barra de Busca com Resposta Rápida e Benchmark */}
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
              aria-label="Buscar neste produto"
              placeholder={`Buscar em ${productMetadata.name}... (ex: pressão, exatidão, código)`}
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-300 focus:border-[#003366] rounded-md transition-all outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                aria-label="Limpar busca"
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
                  <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between items-center">
                    <span>
                      Resultados ({searchResults.length})
                      {lastSearchDurationMs !== undefined && lastSearchDurationMs > 0 && (
                        <span className="ml-1.5 text-[10px] text-slate-400 font-mono font-normal">
                          ({lastSearchDurationMs} ms)
                        </span>
                      )}
                    </span>
                    <span>Clique para navegar</span>
                  </div>
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectSearchResult(item);
                        setIsSearchOpen(false);
                      }}
                      className="w-full px-3 py-2.5 text-left hover:bg-blue-50/50 flex items-start gap-2.5 transition-colors group"
                    >
                      <div className="mt-0.5">
                        {item.type === 'table_row' && <TableIcon className="w-4 h-4 text-blue-600" />}
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

        {/* Lado Direito: Nível de Detalhe e Modo de Ação Ortogonais (Amendment 5) */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Eixo 1: Nível de Detalhe (Simples vs Avançado) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (setDetailLevel) setDetailLevel('simple');
                setPerspective('standard');
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                !isAdvanced
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simples
            </button>
            <button
              type="button"
              onClick={() => {
                if (setDetailLevel) setDetailLevel('advanced');
                setPerspective('engineering');
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                isAdvanced
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Avançado
            </button>
          </div>

          {/* Eixo 2: Modo de Interação (Visualizar vs Organizar Layout vs Editar Dados) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (setInteractionMode) setInteractionMode('view');
                setMode('view');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                effectiveInteractionMode === 'view'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Visualizar
            </button>
            <button
              type="button"
              onClick={() => {
                if (setInteractionMode) setInteractionMode('edit_layout');
                setMode('edit_workspace');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                effectiveInteractionMode === 'edit_layout'
                  ? 'bg-white text-amber-900 shadow-2xs font-bold border border-amber-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3 h-3 text-amber-600" />
              <span>Organizar Layout</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (setInteractionMode) setInteractionMode('edit_data');
                setMode('view');
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                effectiveInteractionMode === 'edit_data'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Pencil className="w-3 h-3 text-blue-600" />
              <span>Editar Dados</span>
            </button>
          </div>

          {/* Menu Dropdown de Ações Técnicas */}
          <div ref={addMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              aria-expanded={isAddMenuOpen}
              className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#00254d] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
            </button>

            {isAddMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onOpenAddModal();
                    setIsAddMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                  <span>Nova Informação Técnica</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenCreateTable();
                    setIsAddMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <TableIcon className="w-4 h-4 text-blue-600" />
                  <span>Nova Tabela Técnica</span>
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  type="button"
                  onClick={() => {
                    onOpenAIOrganize();
                    setIsAddMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-purple-700 font-medium"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Organizar com IA</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAIImport();
                    setIsAddMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                >
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>Importar Fatos de Manual (IA)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
