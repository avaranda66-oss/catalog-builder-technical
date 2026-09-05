// src/components/guided-help/GlossaryDrawer.tsx
// Nível 5: Glossário Global com busca em tempo real e visualização simples/técnica.

import React, { useState, useMemo } from 'react';
import {
  useLearnMode,
  HELP_CONCEPTS_REGISTRY,
  TASK_TUTORIALS_REGISTRY,
  HelpConcept,
  HelpCategory,
  TaskTutorialId
} from '../../features/guided-help';
import {
  X,
  Search,
  BookOpen,
  Code2,
  ExternalLink,
  Tag,
  GraduationCap,
  PlayCircle
} from 'lucide-react';

const CATEGORY_LABELS: Record<HelpCategory, string> = {
  hierarchy: 'Hierarquia & Organização',
  data: 'Dados & Tabelas Técnicas',
  evidence: 'Evidências & Fontes',
  architecture: 'Arquitetura & Herança',
  editorial: 'Editorial & Publicação'
};

export const GlossaryDrawer: React.FC = () => {
  const {
    isGlossaryOpen,
    closeGlossary,
    glossarySearchTerm,
    setGlossarySearchTerm,
    openConceptDetail,
    openTutorial,
    startTour
  } = useLearnMode();

  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | 'all'>('all');
  const [showTechnicalMode, setShowTechnicalMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'concepts' | 'tutorials'>('concepts');

  const conceptsList = useMemo(() => Object.values(HELP_CONCEPTS_REGISTRY), []);
  const tutorialsList = useMemo(() => Object.values(TASK_TUTORIALS_REGISTRY), []);

  React.useEffect(() => {
    if (!isGlossaryOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeGlossary();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGlossaryOpen, closeGlossary]);

  // Filtragem dinâmica de conceitos
  const filteredConcepts = useMemo(() => {
    const term = glossarySearchTerm.trim().toLowerCase();
    return conceptsList.filter((c: HelpConcept) => {
      const matchCategory = selectedCategory === 'all' || c.category === selectedCategory;
      if (!matchCategory) return false;
      if (!term) return true;

      return (
        c.title.toLowerCase().includes(term) ||
        c.shortExplanation.toLowerCase().includes(term) ||
        c.simpleExplanation.toLowerCase().includes(term) ||
        c.technicalExplanation.toLowerCase().includes(term) ||
        c.example.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    });
  }, [conceptsList, glossarySearchTerm, selectedCategory]);

  // Filtragem dinâmica de tutoriais
  const filteredTutorials = useMemo(() => {
    const term = glossarySearchTerm.trim().toLowerCase();
    if (!term) return tutorialsList;
    return tutorialsList.filter((t) =>
      t.title.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term)
    );
  }, [tutorialsList, glossarySearchTerm]);

  if (!isGlossaryOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity duration-200"
      onClick={closeGlossary}
      role="dialog"
      aria-modal="true"
      aria-labelledby="glossary-title"
    >
      <div
        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
              <BookOpen size={20} />
            </span>
            <div>
              <h2 id="glossary-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Central de Conhecimento & Glossário</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                  PIM V2
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Aprenda todos os conceitos e procedimentos sem precisar de manual externo.
              </p>
            </div>
          </div>
          <button
            onClick={closeGlossary}
            aria-label="Fechar Glossário"
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Busca e Ações Rápidas */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={glossarySearchTerm}
              onChange={(e) => setGlossarySearchTerm(e.target.value)}
              placeholder="Buscar conceito, termo ou procedimento (ex: herança, chave, tabela)..."
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all placeholder:text-slate-400"
              autoFocus
            />
            {glossarySearchTerm && (
              <button
                onClick={() => setGlossarySearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Abas e Toggle de Modo Técnico */}
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab('concepts')}
                className={`px-3 py-1.5 font-bold rounded-md transition-all ${
                  activeTab === 'concepts'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Conceitos ({filteredConcepts.length})
              </button>
              <button
                onClick={() => setActiveTab('tutorials')}
                className={`px-3 py-1.5 font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'tutorials'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlayCircle size={14} />
                Como Fazer ({filteredTutorials.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  closeGlossary();
                  startTour();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs transition-colors"
                title="Iniciar o tour visual guiado pela interface"
              >
                <GraduationCap size={14} className="text-amber-600" />
                <span>Iniciar Tour Guiado</span>
              </button>

              {activeTab === 'concepts' && (
                <button
                  onClick={() => setShowTechnicalMode(!showTechnicalMode)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    showTechnicalMode
                      ? 'bg-indigo-600 text-white border-indigo-700'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <Code2 size={13} />
                  <span>Modo Técnico</span>
                </button>
              )}
            </div>
          </div>

          {/* Filtro de Categorias (Aba Conceitos) */}
          {activeTab === 'concepts' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-100 text-indigo-800 font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas
              </button>
              {(Object.keys(CATEGORY_LABELS) as HelpCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-indigo-100 text-indigo-800 font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista Principal de Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'concepts' ? (
            filteredConcepts.length === 0 ? (
              <div className="text-center py-12">
                <Tag size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">Nenhum conceito encontrado.</p>
                <p className="text-xs text-slate-400 mt-1">Tente pesquisar por outro termo ou limpe o filtro.</p>
              </div>
            ) : (
              filteredConcepts.map((concept: HelpConcept) => (
                <div
                  key={concept.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full inline-block mb-1">
                        {CATEGORY_LABELS[concept.category]}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {concept.title}
                      </h3>
                    </div>
                    <button
                      onClick={() => {
                        closeGlossary();
                        openConceptDetail(concept.id);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity"
                    >
                      <span>Detalhes</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    {showTechnicalMode ? concept.technicalExplanation : concept.simpleExplanation}
                  </p>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                    <span className="font-semibold text-slate-700 block mb-0.5">Exemplo Prático:</span>
                    <span className="text-slate-600">{concept.example}</span>
                  </div>

                  {showTechnicalMode && (
                    <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-100/70 p-1.5 rounded">
                      Chave Canônica: <strong className="text-indigo-700">{concept.id}</strong>
                    </div>
                  )}
                </div>
              ))
            )
          ) : (
            filteredTutorials.length === 0 ? (
              <div className="text-center py-12">
                <PlayCircle size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">Nenhum tutorial encontrado.</p>
              </div>
            ) : (
              filteredTutorials.map((tut) => (
                <div
                  key={tut.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>{tut.title}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          ~{tut.estimatedMinutes} min
                        </span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">{tut.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        closeGlossary();
                        openTutorial(tut.id as TaskTutorialId);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                    >
                      Ver Passo a Passo
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>{filteredConcepts.length} conceitos catalogados no sistema</span>
          <button
            onClick={closeGlossary}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
