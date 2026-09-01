import React, { useState } from 'react';
import { Plus, Trash2, FileText, Image, Table, LayoutTemplate } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { SidebarBlockLibrary } from './SidebarBlockLibrary';

export const PageThumbnailList: React.FC = () => {
  const {
    currentCatalog,
    activePageIndex,
    setActivePageIndex,
    addPage,
    removePage
  } = useCatalogStore();

  const [sidebarTab, setSidebarTab] = useState<'pages' | 'blocks'>('pages');

  if (!currentCatalog) return null;

  const handleSelectPage = (index: number, pageId: string) => {
    setActivePageIndex(index);
    const element = document.getElementById(`page-container-${pageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-300 flex flex-col h-full shadow-sm flex-shrink-0 select-none text-xs z-10">
      {/* Abas Superiores da Barra Lateral */}
      <div className="flex border-b border-slate-300 bg-slate-100 p-1 flex-shrink-0">
        <button
          onClick={() => setSidebarTab('pages')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
            sidebarTab === 'pages'
              ? 'bg-[#003366] text-white shadow-2xs'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Folhas A4 ({currentCatalog.pages.length})</span>
        </button>

        <button
          onClick={() => setSidebarTab('blocks')}
          className={`flex-1 py-1.5 px-2 text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors ${
            sidebarTab === 'blocks'
              ? 'bg-[#003366] text-white shadow-2xs'
              : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
          }`}
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          <span>Estruturas</span>
        </button>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {sidebarTab === 'blocks' ? (
        <SidebarBlockLibrary />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Header do Navegador de Páginas */}
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Folhas A4 ({currentCatalog.pages.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => addPage('cover')}
                className="px-2 py-0.5 text-slate-700 hover:text-[#003366] bg-white hover:bg-slate-100 border border-slate-300 rounded text-[11px] font-semibold"
                title="Adicionar Página de Capa"
              >
                + Capa
              </button>
              <button
                onClick={() => addPage('technical')}
                className="px-2 py-0.5 text-slate-700 hover:text-[#003366] bg-white hover:bg-slate-100 border border-slate-300 rounded text-[11px] font-semibold"
                title="Adicionar Folha Técnica"
              >
                + Técnica
              </button>
            </div>
          </div>

          {/* Lista de Miniaturas das Páginas */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {currentCatalog.pages.map((page, index) => {
              const isActive = index === activePageIndex;

              return (
                <div
                  key={page.id}
                  onClick={() => handleSelectPage(index, page.id)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                    isActive
                      ? 'border-[#003366] bg-blue-50/50 shadow-sm ring-2 ring-[#003366]'
                      : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Folha {page.pageNumber}: {page.title || `Página ${page.pageNumber}`}
                    </span>
                    {currentCatalog.pages.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePage(page.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Excluir esta folha A4"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Miniatura visual esquemática */}
                  <div className="w-full h-24 bg-white border border-slate-300 rounded-lg p-2 flex flex-col gap-1 overflow-hidden pointer-events-none shadow-2xs">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">
                      {page.pageType === 'cover' ? 'Capa / Apresentação' : 'Folha Técnica'}
                    </div>
                    <div className="flex-1 flex flex-col gap-1 justify-center">
                      {(page.blocks || []).slice(0, 3).map((b, bIdx) => (
                        <div
                          key={bIdx}
                          className="h-4 bg-slate-100 rounded px-1.5 flex items-center gap-1 text-[8.5px] text-slate-600 overflow-hidden font-mono"
                        >
                          {b.type === 'text' && <FileText className="w-2.5 h-2.5 flex-shrink-0" />}
                          {b.type === 'image' && <Image className="w-2.5 h-2.5 flex-shrink-0" />}
                          {['table', 'electrical_table', 'accessories_table', 'custom_table'].includes(b.type) && (
                            <Table className="w-2.5 h-2.5 flex-shrink-0" />
                          )}
                          <span className="truncate">{b.title || b.textContent || b.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Botão Inferior de Adicionar Folha */}
          <div className="p-3 border-t border-slate-300 bg-slate-50 flex-shrink-0">
            <button
              onClick={() => addPage('technical')}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#003366] hover:bg-[#002244] text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Inserir Nova Folha A4</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
