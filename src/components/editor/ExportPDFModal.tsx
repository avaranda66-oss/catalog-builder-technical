import React, { useState } from 'react';
import { X, Download, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { PDFService } from '../../services/pdf.service';

export const ExportPDFModal: React.FC = () => {
  const { isExportPDFModalOpen, setExportPDFModalOpen } = useUIStore();
  const { currentCatalog, syncStatus, editorContext, saveActiveDocument } = useCatalogStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);

  if (!isExportPDFModalOpen || !currentCatalog) return null;

  const isConflict = syncStatus === 'conflict';
  const isTemplate = editorContext.kind === 'template';
  const docId = isTemplate ? (editorContext.templateId || currentCatalog.id) : currentCatalog.id;
  const docVersion = currentCatalog.version || 1;

  const handleDownloadPDF = async () => {
    if (isConflict) {
      setIsSuccess(false);
      setExportMessage('Exportação bloqueada: resolva o conflito de sincronização antes de exportar.');
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
    if (isConflict) {
      setIsSuccess(false);
      setExportMessage('Exportação bloqueada: resolva o conflito de sincronização antes de exportar.');
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
          {isConflict && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 font-mono text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Conflito ativo: uma nova versão foi gravada por outro usuário. Sincronize antes de exportar.</span>
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
                isConflict ? 'opacity-50 pointer-events-none' : ''
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
                isConflict ? 'opacity-50 pointer-events-none' : ''
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
