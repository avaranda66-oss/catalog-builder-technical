import React, { useState } from 'react';
import { RotateCcw, FileText, Layers, Crop, Save, Copy, FilePlus, AlertTriangle } from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { PageThumbnailList } from './PageThumbnailList';
import { A4Canvas } from './A4Canvas';
import { PropertiesPanel } from './PropertiesPanel';
import { AddProductModal } from './AddProductModal';
import { ExportPDFModal } from './ExportPDFModal';
import { AIAssistantDrawer } from '../ai/AIAssistantDrawer';
import { PresetModal } from './PresetModal';
import { PDFImportModal } from './PDFImportModal';
import { CollaboratorPresenceBar } from './CollaboratorPresenceBar';
import { generateUniqueCatalogTitle } from '../../domain/catalog.schema';

export const EditorView: React.FC = () => {
  const {
    currentCatalog,
    setCurrentCatalog,
    createCatalogFromPreset,
    editorContext,
    saveActiveDocument,
    isDirty,
    syncStatus,
    syncError
  } = useCatalogStore();
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [isPDFImportModalOpen, setIsPDFImportModalOpen] = useState(false);

  if (!currentCatalog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-presys-navy flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Iniciar Novo Catálogo Técnico</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Crie um catálogo a partir dos modelos pré-configurados (Ficha Técnica 3 Páginas, Comparativo ou Datasheets TA-25N/35N/50N).
          </p>
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="w-full py-2.5 bg-presys-navy hover:bg-presys-dark text-white rounded-md text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-2"
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

  const isTemplateMode = editorContext?.kind === 'template';

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Banner de Conflito e Atualização Remota */}
      {syncStatus === 'conflict' && (
        <div className="bg-amber-500 text-slate-950 px-6 py-2 flex items-center justify-between font-medium text-xs shadow-2xs border-b border-amber-600 z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
            <span className="font-bold">Atualização remota aguardando resolução:</span>
            <span>{syncError || 'Uma alteração remota não pôde ser aplicada automaticamente para preservar seu conteúdo.'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void useCatalogStore.getState().resolveConflictReloadServer()}
              className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
              Usar versão do servidor
            </button>
            <button
              onClick={() => {
                if (window.confirm('A versão remota no servidor será substituída pelas suas alterações locais. Deseja continuar?')) {
                  void useCatalogStore.getState().resolveConflictKeepLocal();
                }
              }}
              className="px-2.5 py-1 bg-white border border-slate-400 text-slate-900 rounded text-xs font-semibold hover:bg-slate-100 transition-colors"
            >
              Manter minhas alterações
            </button>
          </div>
        </div>
      )}

      {/* Sub-Barra do Catálogo Fixa e Contextual */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between flex-shrink-0 relative z-30 shadow-2xs no-print">
        <div className="flex items-center gap-2.5 flex-1 max-w-xl">
          {/* Tag Discreta do Tipo de Documento */}
          {isTemplateMode ? (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded font-semibold text-[10px] uppercase tracking-wider shrink-0">
              TEMPLATE
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-slate-100 text-presys-navy border border-slate-300 rounded font-semibold text-[10px] uppercase tracking-wider shrink-0">
              CATÁLOGO
            </span>
          )}

          <input
            type="text"
            value={currentCatalog.title}
            onChange={(e) => {
              setCurrentCatalog({ ...currentCatalog, title: e.target.value });
              void saveActiveDocument();
            }}
            placeholder={isTemplateMode ? 'Nome do Template...' : 'Título do Catálogo...'}
            className="px-2.5 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-presys-blue rounded font-semibold text-xs text-slate-900 focus:ring-1 focus:ring-presys-blue flex-1 min-w-0 transition-colors"
          />

          {/* Status de Sincronização e Salvamento na Nuvem */}
          <div className="shrink-0 flex items-center">
            {syncStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Salvando...
              </span>
            )}
            {syncStatus === 'synced' && !isDirty && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Salvo (v{currentCatalog.version})
              </span>
            )}
            {isDirty && syncStatus !== 'saving' && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Alterações pendentes
              </span>
            )}
            {syncStatus === 'offline' && (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Offline
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Barra de Presença e Colaboradores em Tempo Real */}
          <CollaboratorPresenceBar />

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Botão Contextual de Salvar Documento Ativo (Flush / Ctrl+S) */}
          <button
            onClick={async () => {
              const res = await saveActiveDocument();
              if (res.success) {
                console.log(`[SAVE] ${isTemplateMode ? 'Template' : 'Catálogo'} "${currentCatalog.title}" confirmado na nuvem v${res.version}.`);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors shadow-2xs bg-presys-navy text-white hover:bg-presys-dark border border-presys-dark"
            title={`Salvar alterações na nuvem (Ctrl+S / Autosave ativo)`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar agora</span>
          </button>

          {/* Botão Contextual de Duplicação / Criação */}
          {isTemplateMode ? (
            <button
              onClick={async () => {
                const newId = typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
                const newCat = structuredClone(currentCatalog);
                newCat.id = newId;
                newCat.title = `${currentCatalog.title} (Catálogo)`;
                newCat.version = 1;
                useCatalogStore.getState().setCurrentCatalog(newCat, true);
                useCatalogStore.getState().setEditorContext({ kind: 'catalog', catalogId: newId });
                const res = await useCatalogStore.getState().saveCurrentCatalog();
                if (res.success) {
                  alert(`Novo Catálogo "${newCat.title}" criado a partir do template com sucesso.`);
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-xs font-medium transition-colors shadow-2xs"
              title="Cria um novo catálogo independente a partir deste template"
            >
              <FilePlus className="w-3.5 h-3.5 text-slate-500" />
              <span>Criar Catálogo</span>
            </button>
          ) : (
            <button
              onClick={async () => {
                const savedList = useCatalogStore.getState().savedCatalogs;
                const defaultTitle = generateUniqueCatalogTitle(`${currentCatalog.title} (Cópia)`, savedList.map((c) => c.title));
                const newTitle = prompt('Digite o nome para este novo catálogo:', defaultTitle);
                if (newTitle && newTitle.trim()) {
                  const res = await useCatalogStore.getState().saveAsNewCatalog(newTitle.trim());
                  if (res.success && res.status === 'synced') {
                    alert(`Catálogo "${newTitle.trim()}" duplicado e salvo na nuvem com sucesso.`);
                  } else {
                    alert(`Aviso: Erro ao duplicar catálogo (${res.error || 'erro'}).`);
                  }
                }
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-xs font-medium transition-colors shadow-2xs"
              title="Duplica o conteúdo atual em um novo catálogo independente"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Duplicar</span>
            </button>
          )}

          {/* Botão de Importar / Recortar PDF */}
          <button
            onClick={() => setIsPDFImportModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-xs font-medium transition-colors shadow-2xs"
            title="Importe páginas completas ou recorte gráficos e tabelas de PDFs existentes"
          >
            <Crop className="w-3.5 h-3.5 text-slate-500" />
            <span>Recortar PDF</span>
          </button>

          {/* Botão de Catálogos & Templates */}
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 text-slate-800 hover:bg-slate-100 border border-slate-300 rounded-md text-xs font-medium transition-colors shadow-2xs"
            title="Modelos Oficiais, Esqueletos e Meus Templates Corporativos"
          >
            <Layers className="w-3.5 h-3.5 text-slate-600" />
            <span>Modelos & Templates</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Deseja recarregar o preset padrão? As alterações atuais serão substituídas.')) {
                createCatalogFromPreset();
              }
            }}
            className="flex items-center gap-1 px-2 py-1.5 bg-white text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md text-[11px] font-medium transition-colors shadow-2xs"
            title="Recarregar catálogo padrão original"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
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
