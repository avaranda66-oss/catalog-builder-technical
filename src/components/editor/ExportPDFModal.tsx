import React, { useState } from 'react';
import { X, Download, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { PDFService } from '../../services/pdf.service';

export const ExportPDFModal: React.FC = () => {
  const { isExportPDFModalOpen, setExportPDFModalOpen } = useUIStore();
  const { currentCatalog } = useCatalogStore();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(true);

  if (!isExportPDFModalOpen || !currentCatalog) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage(null);

    const safeTitle = (currentCatalog.title || 'Catalogo')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const result = await PDFService.exportToPDF('.a4-page-container', {
      fileName,
      quality: 0.95
    });

    setIsExporting(false);
    if (result.success) {
      setIsSuccess(true);
      setExportMessage(`Arquivo "${fileName}" gerado e baixado com sucesso!`);
    } else {
      setIsSuccess(false);
      setExportMessage(result.message || 'Falha na geração do PDF.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-900">Exportar Catálogo em PDF</h2>
          </div>
          <button
            onClick={() => setExportPDFModalOpen(false)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-xs text-slate-600">
          <p>
            O motor de renderização irá gerar um PDF de alta resolução (WYSIWYG 1:1) com todas as <strong>{currentCatalog.pages.length} página(s)</strong> do catálogo ativo, preservando tipografia, tabelas e fotografias.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Documento:</span>
              <span className="font-semibold text-slate-800 truncate max-w-xs">{currentCatalog.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Formato:</span>
              <span className="font-semibold text-slate-800">A4 Retrato (210mm x 297mm)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Páginas:</span>
              <span className="font-semibold text-slate-800">{currentCatalog.pages.length} folha(s)</span>
            </div>
          </div>

          {exportMessage && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 text-xs font-medium ${
                isSuccess
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{exportMessage}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => setExportPDFModalOpen(false)}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            Fechar
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processando PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Gerar & Baixar PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
