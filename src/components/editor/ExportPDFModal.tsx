import React, { useState } from 'react';
import { X, Download, CheckCircle2, AlertCircle, Printer, ShieldAlert } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { PDFService } from '../../services/pdf.service';
import { auditCatalogPublishSafety } from '../../domain/table-core';

export const ExportPDFModal: React.FC = () => {
  const { isExportPDFModalOpen, setExportPDFModalOpen } = useUIStore();
  const {
    currentCatalog,
    syncStatus,
    editorContext,
    saveActiveDocument,
    knowledgeRuntime,
    getTableDatumResolver,
    preloadProductKnowledge
  } = useCatalogStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);
  const [runtimeStatus, setRuntimeStatus] = useState(knowledgeRuntime.getStatus());

  React.useEffect(() => {
    setRuntimeStatus(knowledgeRuntime.getStatus());
    const unsubscribe = knowledgeRuntime.subscribe((status) => {
      setRuntimeStatus(status);
    });
    return unsubscribe;
  }, [knowledgeRuntime]);

  React.useEffect(() => {
    if (isExportPDFModalOpen && currentCatalog) {
      preloadProductKnowledge();
    }
  }, [isExportPDFModalOpen, currentCatalog?.id, preloadProductKnowledge]);

  if (!isExportPDFModalOpen || !currentCatalog) return null;

  const isTemplate = editorContext.kind === 'template';
  const docId = isTemplate ? (editorContext.templateId || currentCatalog.id) : currentCatalog.id;
  const docVersion = currentCatalog.version || 1;

  // Auditoria de segurança de publicação em 3 camadas (Emendas 15 e 16)
  const isRuntimeLoading = runtimeStatus === 'loading';
  const resolveDatum = !isRuntimeLoading ? getTableDatumResolver() : undefined;
  const auditReport = auditCatalogPublishSafety({
    catalog: currentCatalog,
    syncStatus,
    resolveDatum,
    runtimeStatus,
    failedProductIds: knowledgeRuntime.getFailedProductIds()
  });
  const isExportBlocked = isRuntimeLoading || !auditReport.canPublish;

  const handleDownloadPDF = async () => {
    if (isExportBlocked) {
      setIsSuccess(false);
      setExportMessage(`Exportação bloqueada: ${auditReport.blockCount} inconsistência(s) crítica(s) encontrada(s).`);
      return;
    }

    setIsExporting(true);
    setExportMessage(null);

    // 1. Garante que o documento está salvo e sincronizado
    const saveRes = await saveActiveDocument();
    if (!saveRes.success && saveRes.status === 'conflict') {
      setIsExporting(false);
      setIsSuccess(false);
      setExportMessage('Conflito detectado ao salvar. Resolva o conflito antes de gerar o PDF.');
      return;
    }

    const safeTitle = (currentCatalog.title || 'PRESYS_Catalog').replace(/[^a-zA-Z0-9_-]/g, '_');
    const versionStr = `v${currentCatalog.version || 1}`;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${safeTitle}_${versionStr}_${dateStr}.pdf`;

    const result = await PDFService.exportToPDF('.a4-page-container', {
      fileName,
      quality: 1.0,
      scale: 3.5
    });

    setIsExporting(false);
    if (result.success) {
      setIsSuccess(true);
      setExportMessage(`Arquivo "${fileName}" compilado com sucesso!`);
    } else {
      setIsSuccess(false);
      setExportMessage(result.message || 'Falha ao compilar o arquivo PDF.');
    }
  };

  const handleOpenCleanPrintView = async () => {
    if (isExportBlocked) {
      setIsSuccess(false);
      setExportMessage(`Exportação bloqueada: ${auditReport.blockCount} inconsistência(s) crítica(s) encontrada(s).`);
      return;
    }

    const saveRes = await saveActiveDocument();
    if (!saveRes.success && saveRes.status === 'conflict') {
      setIsSuccess(false);
      setExportMessage('Conflito detectado ao salvar. Resolva o conflito antes de gerar o PDF.');
      return;
    }

    setExportPDFModalOpen(false);

    const confirmedVer = (useCatalogStore.getState().currentCatalog?.version) || docVersion;
    const printUrl = `/?print=1&${isTemplate ? `template=${docId}` : `catalog=${docId}`}&version=${confirmedVer}`;
    window.open(printUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-none shadow-2xl border border-slate-400 max-w-lg w-full p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#003366] text-white flex items-center justify-center font-bold text-xs rounded-none shadow-xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                Exportar Catálogo Técnico para PDF
              </h2>
              <p className="text-[10px] text-slate-500 font-mono">
                Padrão Gráfico Editorial A4 (210mm × 297mm)
              </p>
            </div>
          </div>
          <button
            onClick={() => setExportPDFModalOpen(false)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5 text-xs text-slate-600">
          {/* Indicador de Runtime Loading (Emenda 15) */}
          {isRuntimeLoading && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-none flex items-center gap-2 font-mono text-[11px]" data-testid="runtime-loading-indicator">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Sincronizando conhecimento técnico do catálogo antes da validação de publicação...</span>
            </div>
          )}

          {/* Indicador de Runtime Parcial (Emenda 10) */}
          {runtimeStatus === 'partial' && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-none flex items-center gap-2 font-mono text-[11px]" data-testid="runtime-partial-indicator">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Conhecimento técnico de produtos parcialmente carregado. Células sem snapshot de contingência serão bloqueadas.</span>
            </div>
          )}

          {/* Painel de Auditoria de Publicação em 3 Camadas (Emenda 16) */}
          {auditReport.issues.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-300 space-y-2 font-mono text-[11px]" data-testid="publish-safety-panel">
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className={`w-4 h-4 ${auditReport.blockCount > 0 ? 'text-red-600' : 'text-amber-600'}`} />
                  <span>Auditoria de Publicação:</span>
                </div>
                <span className={auditReport.blockCount > 0 ? 'text-red-600' : 'text-amber-600'}>
                  {auditReport.blockCount} Bloqueio(s) • {auditReport.warnCount} Aviso(s)
                </span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {auditReport.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded border text-[10px] leading-tight ${
                      issue.severity === 'block'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <div className="font-bold uppercase tracking-wider">
                      [{issue.severity.toUpperCase()}] {issue.code}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Página: {issue.pageNumber ?? '—'} | Tabela: {issue.tableTitle || issue.tableId || '—'}
                      {issue.rowId ? ` | Linha: ${issue.rowId}` : ''}
                      {issue.colKey ? ` | Coluna: ${issue.colKey}` : ''}
                    </div>
                    <div className="mt-1 font-sans">{issue.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-1 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Documento:</span>
              <span className="font-semibold text-slate-800 truncate max-w-xs">{currentCatalog.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Versão / Tipo:</span>
              <span className="font-semibold text-slate-800">v{docVersion} • {isTemplate ? 'Template de Layout' : 'Catálogo de Produção'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Páginas:</span>
              <span className="font-semibold text-slate-800">{currentCatalog.pages.length} folha(s) A4</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Opção 1: Impressão Nativa Vetorial A4 Limpa (Primary) */}
            <div 
              onClick={handleOpenCleanPrintView}
              className={`p-3 bg-blue-50/60 hover:bg-blue-50 border-2 border-[#003366] cursor-pointer transition-all flex flex-col justify-between group ${
                isExportBlocked ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-[#003366] font-bold text-xs font-mono">
                  <Printer className="w-3.5 h-3.5" />
                  <span>Gerar PDF de Alta Qualidade</span>
                </div>
                <p className="text-[10.5px] text-slate-600 mt-1.5 leading-relaxed">
                  Exportador editorial isolado: renderização vetorial nativa Chromium, tipografia exata e zero botões de edição.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-bold text-[#003366] group-hover:underline flex items-center gap-1">
                Abrir Visualização & Impressão &rarr;
              </span>
            </div>

            {/* Opção 2: Download Direto Raster (Fallback) */}
            <div 
              onClick={handleDownloadPDF}
              className={`p-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 cursor-pointer transition-all flex flex-col justify-between group ${
                isExportBlocked ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs font-mono">
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>PDF de Compatibilidade (Raster)</span>
                </div>
                <p className="text-[10.5px] text-slate-600 mt-1.5 leading-relaxed">
                  Compilação via canvas para ambientes legados ou salvamento direto sem diálogo de impressão.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-bold text-slate-700 group-hover:underline flex items-center gap-1">
                {isExporting ? 'Compilando arquivo...' : 'Download Direto &rarr;'}
              </span>
            </div>
          </div>

          {exportMessage && (
            <div
              className={`p-3 rounded-none flex items-center gap-2 text-xs font-mono font-bold ${
                isSuccess
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                  : 'bg-red-50 text-red-900 border border-red-300'
              }`}
            >
              {isSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{exportMessage}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
          <button
            onClick={() => setExportPDFModalOpen(false)}
            disabled={isExporting}
            className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-none transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
