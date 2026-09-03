import React, { useState, useEffect } from 'react';
import {
  Printer,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  Trash2,
  Eye,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { PDFService } from '../../services/pdf.service';
import { AIService } from '../../services/ai.service';
import { Catalog } from '../../domain/catalog.schema';
import { isTableLikeBlock } from '../../domain/compliance-coverage';
import { PresetModal } from '../editor/PresetModal';

export const PublicationsView: React.FC = () => {
  const {
    currentCatalog,
    savedCatalogs,
    loadAllCatalogs,
    loadCatalogById,
    duplicateCatalog,
    deleteCatalog,
    setActivePageIndex
  } = useCatalogStore();
  const { products } = useLibraryStore();
  const { setActiveTab, openAIAssistant } = useUIStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  useEffect(() => {
    loadAllCatalogs();
  }, [loadAllCatalogs]);

  if (!currentCatalog) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 text-slate-500 font-mono text-xs">
        Carregando publicações...
      </div>
    );
  }

  // Preflight Metrológico & Inspeção
  const complianceReport = AIService.checkCatalogCompliance(currentCatalog, products);
  const totalBlocks = currentCatalog.pages.reduce((acc, p) => acc + (p.blocks?.length || 0), 0);
  const totalTables = currentCatalog.pages.reduce(
    (acc, p) => acc + (p.blocks?.filter((b) => isTableLikeBlock(b.type)).length || 0),
    0
  );
  const totalImages = currentCatalog.pages.reduce(
    (acc, p) => acc + (p.blocks?.filter((b) => b.type === 'image' || b.type === 'image_gallery' || b.type === 'full_page_cover' || b.type === 'hero_banner' || b.type === 'additel_two_col_hero' || b.type === 'fluke_header').length || 0),
    0
  );

  const handleExportPDF = async () => {
    setIsExporting(true);
    setExportStatus(null);

    // 1. Garante que qualquer alteração pendente foi confirmada na nuvem antes do PDF
    const flushRes = await useCatalogStore.getState().flushCatalog(currentCatalog.id);
    if (!flushRes.success && flushRes.status !== 'offline') {
      setIsExporting(false);
      setExportStatus({
        success: false,
        message: `Não foi possível confirmar a última versão na nuvem antes de exportar (${flushRes.error || 'erro de rede'}).`
      });
      return;
    }

    const currentConfirmed = useCatalogStore.getState().currentCatalog || currentCatalog;
    console.log('[PDF EXPORT METADATA]', {
      catalogId: currentConfirmed.id,
      catalogVersion: currentConfirmed.version,
      catalogTitle: currentConfirmed.title,
      pagesCount: currentConfirmed.pages.length,
      timestamp: new Date().toISOString()
    });

    const safeTitle = (currentConfirmed.title || 'Catalogo_Presys')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeTitle}_v${currentConfirmed.version}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const result = await PDFService.exportToPDF('.a4-page-container', {
      fileName,
      quality: 0.95
    });

    setIsExporting(false);
    if (result.success) {
      setExportStatus({ success: true, message: `PDF "${fileName}" exportado e baixado com sucesso!` });
    } else {
      setExportStatus({ success: false, message: result.message || 'Falha ao processar exportação do PDF.' });
    }
  };

  const handleOpenInStudio = (pageIndex: number = 0) => {
    setActivePageIndex(pageIndex);
    setActiveTab('editor');
  };

  const handleSwitchCatalog = async (cat: Catalog) => {
    await loadCatalogById(cat.id);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100 p-4 sm:p-6 space-y-6">
      {/* Header do Ambiente */}
      <div className="bg-white rounded-none border border-slate-300 p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#003366] text-white rounded-none flex items-center justify-center shadow-xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2 font-mono">
                <span>Publications, Catalogs & PDF Export</span>
                <span className="px-2 py-0.5 bg-blue-50 text-[#003366] text-[10px] font-mono font-bold rounded-none border border-blue-200">
                  Preflight Active
                </span>
              </h1>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-xs text-slate-500">Documento Ativo:</span>
                <span className="text-xs font-mono font-bold text-[#003366] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {currentCatalog.title} (ID: {currentCatalog.id.slice(0, 8)}... | v{currentCatalog.version})
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-600" />
            <span>Templates & Presets</span>
          </button>

          <button
            onClick={() => handleOpenInStudio(0)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-none shadow-2xs transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-slate-600" />
            <span>Open in A4 Studio</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] disabled:bg-slate-400 rounded-none shadow-xs transition-colors"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export High-Resolution PDF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {exportStatus && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            exportStatus.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {exportStatus.success ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{exportStatus.message}</span>
          </div>
          <button
            onClick={() => setExportStatus(null)}
            className="text-slate-500 hover:text-slate-700 text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Grid Principal: Documento Ativo + Preflight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel do Documento Ativo (2 colunas) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-300 p-5 shadow-xs space-y-5">
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block font-semibold">
                Documento Ativo para Exportação
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">{currentCatalog.title}</h2>
              {currentCatalog.subtitle && (
                <p className="text-xs text-slate-600 mt-0.5">{currentCatalog.subtitle}</p>
              )}
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-xs font-semibold rounded-md border border-slate-200">
                {currentCatalog.pages.length} Folha(s) A4
              </span>
              <span className="block text-[10px] text-slate-400 font-mono mt-1">
                Versão {currentCatalog.version}
              </span>
            </div>
          </div>

          {/* Cards de Métricas do Documento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Páginas A4</span>
              <span className="text-lg font-extrabold text-slate-900 font-mono">
                {currentCatalog.pages.length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Blocos Editoriais</span>
              <span className="text-lg font-extrabold text-slate-900 font-mono">
                {totalBlocks}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Tabelas Técnicas</span>
              <span className="text-lg font-extrabold text-[#003366] font-mono">
                {totalTables}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] text-slate-500 font-medium block">Imagens / Diagramas</span>
              <span className="text-lg font-extrabold text-slate-900 font-mono">
                {totalImages}
              </span>
            </div>
          </div>

          {/* Miniaturas de Folhas A4 do Catálogo */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#003366]" />
                <span>Sequência de Folhas A4 do Catálogo</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                Clique na folha para editar no Studio
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {currentCatalog.pages.map((page, idx) => (
                <div
                  key={page.id}
                  onClick={() => handleOpenInStudio(idx)}
                  className="group cursor-pointer bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-[#003366] rounded-xl p-3 transition-all flex flex-col justify-between space-y-2 shadow-2xs hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 bg-[#003366] text-white text-[9px] font-mono font-bold rounded">
                        PÁG. {page.pageNumber}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400 capitalize">
                        {page.pageType || 'técnica'}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#003366] transition-colors mt-2 line-clamp-1">
                      {page.title || `Folha ${page.pageNumber}`}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                      {page.blocks?.length || 0} bloco(s): {page.blocks?.map((b) => b.type).slice(0, 3).join(', ')}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[10px] font-semibold text-[#003366]">
                    <span>Editar no Studio</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Painel de Preflight Metrológico & Auditoria (1 coluna) */}
        <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs space-y-5">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#003366]" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                Preflight Metrológico
              </h3>
            </div>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${
                complianceReport.isFullyCompliant
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {complianceReport.isFullyCompliant ? '100% Homologado' : `${complianceReport.divergenceCount} Divergência(s)`}
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Item 1: Integridade da Biblioteca */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-slate-800 block">Vínculo com a Biblioteca Oficial</span>
                <span className="text-[11px] text-slate-600">
                  {complianceReport.totalRowsChecked} produtos e especificações conferidos contra a base PRESYS.
                </span>
              </div>
            </div>

            {/* Item 2: Overrides Locais */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
              {complianceReport.divergenceCount === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <span className="font-semibold text-slate-800 block">Edições Locais do Catálogo</span>
                <span className="text-[11px] text-slate-600">
                  {complianceReport.divergenceCount === 0
                    ? 'Nenhum override conflitante detectado.'
                    : `${complianceReport.divergenceCount} campo(s) possuem personalização pontual preservada.`}
                </span>
              </div>
            </div>

            {/* Item 3: Padrão Gráfico e Dimensões */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-slate-800 block">Padrão Geométrico A4 (ISO 216)</span>
                <span className="text-[11px] text-slate-600">
                  210 × 297 mm em escala 2x com fidelidade vetorial e tipografia técnica.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-2">
            <button
              onClick={() => openAIAssistant()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Abrir Auditoria Factual de IA</span>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Exportar PDF deste Catálogo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gerenciador de Catálogos & Publicações Salvas */}
      <div className="bg-white rounded-xl border border-slate-300 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#003366]" />
              <span>Acervo de Catálogos Salvos ({savedCatalogs.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Documentos persistidos no banco de dados local com versionamento e histórico
            </p>
          </div>

          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#003366] border border-blue-200 rounded-lg text-xs font-bold shadow-2xs transition-colors"
          >
            <span>+ Criar Novo Catálogo</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Título do Catálogo</th>
                <th className="py-2.5 px-3">Tema / Identidade</th>
                <th className="py-2.5 px-3">Páginas</th>
                <th className="py-2.5 px-3">Última Atualização</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {savedCatalogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-mono">
                    Nenhum catálogo adicional encontrado no banco local.
                  </td>
                </tr>
              ) : (
                savedCatalogs.map((cat) => {
                  const isActive = currentCatalog.id === cat.id;
                  return (
                    <tr
                      key={cat.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isActive ? 'bg-blue-50/40 font-medium' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-[#003366] shrink-0" title="Ativo" />
                          )}
                          <div>
                            <span className="font-bold text-slate-900 block">{cat.title}</span>
                            {cat.subtitle && (
                              <span className="text-[10px] text-slate-500 block truncate max-w-sm">
                                {cat.subtitle}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {cat.themeId}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-800">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-semibold border border-slate-200">
                          {cat.pages?.length || 1} folha(s)
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>
                            {new Date(cat.updatedAt || Date.now()).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(cat.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isActive ? (
                            <button
                              onClick={() => handleOpenInStudio(0)}
                              className="px-2.5 py-1 bg-[#003366] text-white hover:bg-[#002244] rounded text-[11px] font-bold shadow-2xs"
                            >
                              Editar
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSwitchCatalog(cat)}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold"
                            >
                              Ativar
                            </button>
                          )}

                          <button
                            onClick={() => duplicateCatalog(cat.id)}
                            title="Duplicar Catálogo"
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {savedCatalogs.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(`Deseja realmente excluir o catálogo "${cat.title}"?`)) {
                                  deleteCatalog(cat.id);
                                }
                              }}
                              title="Excluir Catálogo"
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PresetModal isOpen={isPresetModalOpen} onClose={() => setIsPresetModalOpen(false)} />
    </div>
  );
};
