import React, { useState } from 'react';
import { RotateCcw, FileText, Layers, Crop } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { PageThumbnailList } from './PageThumbnailList';
import { A4Canvas } from './A4Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { AddProductModal } from './AddProductModal';
import { ExportPDFModal } from './ExportPDFModal';
import { AIAssistantDrawer } from '../ai/AIAssistantDrawer';
import { PresetModal } from './PresetModal';
import { PDFImportModal } from './PDFImportModal';
import { generateUniqueCatalogTitle } from '../../domain/catalog.schema';

export const EditorView: React.FC = () => {
  const { currentCatalog, setCurrentCatalog, createCatalogFromPreset } = useCatalogStore();
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isPDFImportModalOpen, setIsPDFImportModalOpen] = useState(false);

  if (!currentCatalog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Iniciar Novo Catálogo Técnico</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Crie um catálogo a partir dos modelos pré-configurados (Ficha Técnica 3 Páginas, Comparativo ou Datasheets TA-25N/35N/50N).
          </p>
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <Layers className="w-4 h-4" />
            <span>Escolher Modelo / Preset Industrial</span>
          </button>
        </div>
        {isPresetModalOpen && (
          <PresetModal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Sub-Barra do Catálogo Fixa */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center justify-between flex-shrink-0 z-10 shadow-2xs no-print">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <input
            type="text"
            value={currentCatalog.title}
            onChange={(e) => {
              setCurrentCatalog({ ...currentCatalog, title: e.target.value });
              void useCatalogStore.getState().saveCurrentCatalog();
            }}
            placeholder="Título do Catálogo..."
            className="px-2.5 py-1 bg-white border border-slate-300 rounded font-bold text-xs text-slate-900 focus:ring-1 focus:ring-brand-500 flex-1"
          />
          <input
            type="text"
            value={currentCatalog.subtitle || ''}
            onChange={(e) => {
              setCurrentCatalog({ ...currentCatalog, subtitle: e.target.value });
              void useCatalogStore.getState().saveCurrentCatalog();
            }}
            placeholder="Subtítulo descritivo..."
            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-600 focus:ring-1 focus:ring-brand-500 flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Salvar no Supabase / Nuvem */}
          <button
            onClick={() => void useCatalogStore.getState().saveCurrentCatalog()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#003366] text-white hover:bg-[#002244] border border-[#002244] rounded text-xs font-bold transition-colors shadow-xs"
            title="Salva o catálogo atual imediatamente no banco Supabase na nuvem"
          >
            <span>💾 Salvar Catálogo (Nuvem)</span>
          </button>

          {/* Botão de Salvar Como Novo Catálogo */}
          <button
            onClick={async () => {
              const savedList = useCatalogStore.getState().savedCatalogs;
              const defaultTitle = generateUniqueCatalogTitle(`${currentCatalog.title} (Cópia)`, savedList.map((c) => c.title));
              const newTitle = prompt('Digite o nome para este novo catálogo:', defaultTitle);
              if (newTitle && newTitle.trim()) {
                const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
                const cloned = {
                  ...structuredClone(currentCatalog),
                  id: newId,
                  title: newTitle.trim(),
                  version: 0,
                  updatedAt: new Date().toISOString()
                };
                useCatalogStore.getState().setCurrentCatalog(cloned);
                const res = await useCatalogStore.getState().saveCurrentCatalog();
                if (res.success && res.status === 'synced') {
                  alert(`Catálogo "${newTitle.trim()}" criado e salvo na nuvem com sucesso!`);
                } else if (res.status === 'conflict') {
                  alert(`Não foi possível salvar na nuvem: conflito de versão detectado.`);
                } else {
                  alert(`Aviso: Catálogo criado localmente, mas não foi sincronizado na nuvem (${res.error || 'erro'}).`);
                }
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded text-xs font-semibold transition-colors shadow-2xs"
            title="Salva o conteúdo atual como um novo catálogo independente"
          >
            <span>➕ Salvar Como Novo</span>
          </button>

          {/* Botão de Importar / Recortar PDF */}
          <button
            onClick={() => setIsPDFImportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 rounded text-xs font-semibold transition-colors shadow-2xs"
            title="Importe páginas completas ou recorte gráficos e tabelas de PDFs existentes"
          >
            <Crop className="w-3.5 h-3.5 text-amber-600" />
            <span>Recortar PDF</span>
          </button>

          {/* Botão de Templates & Catálogos Prontos */}
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-[#003366] hover:bg-blue-100 border border-blue-200 rounded text-xs font-bold transition-colors shadow-2xs"
            title="Escolha entre Templates de Estrutura em Branco ou Catálogos de Produtos Prontos"
          >
            <Layers className="w-3.5 h-3.5 text-[#003366]" />
            <span>Catálogos & Modelos</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Deseja recarregar o preset padrão? As alterações atuais serão substituídas.')) {
                createCatalogFromPreset();
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-slate-500 hover:text-slate-800 border border-slate-200 rounded text-[11px] font-medium transition-colors shadow-2xs"
            title="Recarregar catálogo padrão original"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Resetar</span>
          </button>
        </div>
      </div>

      {/* Workspace Triplo: Miniaturas (Esq) | Canvas A4 com Scroll (Centro) | Propriedades Fixas (Dir) */}
      <div className="flex-1 min-h-0 flex overflow-hidden a4-editor-workspace">
        <PageThumbnailList />
        <A4Canvas />
        <PropertiesPanel />
      </div>

      {/* Modais e Gavetas */}
      <AddProductModal />
      <ExportPDFModal />
      {isPresetModalOpen && (
        <PresetModal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} />
      )}
      {isPDFImportModalOpen && (
        <PDFImportModal isOpen={isPDFImportModalOpen} onClose={() => setIsPDFImportModalOpen(false)} />
      )}
      <AIAssistantDrawer />
    </div>
  );
};
