import React, { useState } from 'react';
import { X, Download, CheckCircle2, AlertCircle, Printer } from 'lucide-react';
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

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    setExportMessage(null);

    const safeTitle = (currentCatalog.title || 'PRESYS_Catalog')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

    const result = await PDFService.exportToPDF('.a4-page-container', {
      fileName,
      quality: 1.0,
      scale: 3.5
    });

    setIsExporting(false);
    if (result.success) {
      setIsSuccess(true);
      setExportMessage(`Arquivo "${fileName}" gerado com sucesso em Ultra-HD!`);
    } else {
      setIsSuccess(false);
      setExportMessage(result.message || 'Falha ao gerar o arquivo PDF.');
    }
  };

  const handleNativePrint = () => {
    setExportPDFModalOpen(false);
    setTimeout(() => {
      PDFService.printNative();
    }, 150);
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
                Padrão Gráfico de Alta Fidelidade (A4 210mm × 297mm)
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
          <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-1 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Catálogo:</span>
              <span className="font-semibold text-slate-800 truncate max-w-xs">{currentCatalog.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Páginas:</span>
              <span className="font-semibold text-slate-800">{currentCatalog.pages.length} folha(s) A4</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Opção 1: Impressão Nativa Vetorial */}
            <div 
              onClick={handleNativePrint}
              className="p-3 bg-blue-50/50 hover:bg-blue-50 border border-blue-200 hover:border-blue-400 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center gap-1.5 text-[#003366] font-bold text-xs font-mono">
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF Vetorial (Nativo)</span>
                </div>
                <p className="text-[10.5px] text-slate-600 mt-1.5 leading-relaxed">
                  Qualidade máxima de impressão: textos 100% vetoriais nítidos em qualquer zoom e imagens em resolução total original.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-bold text-[#003366] group-hover:underline flex items-center gap-1">
                Imprimir / Salvar Vetorial &rarr;
              </span>
            </div>

            {/* Opção 2: Download Direto Ultra-HD */}
            <div 
              onClick={handleDownloadPDF}
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs font-mono">
                  <Download className="w-3.5 h-3.5 text-[#003366]" />
                  <span>Download .PDF Direto</span>
                </div>
                <p className="text-[10.5px] text-slate-600 mt-1.5 leading-relaxed">
                  Gera e baixa o arquivo <code className="text-[9px] bg-slate-200 px-1">.pdf</code> compilado em Ultra-HD 350+ DPI com 1 clique.
                </p>
              </div>
              <span className="mt-2 text-[10px] font-bold text-slate-800 group-hover:underline flex items-center gap-1">
                {isExporting ? 'Processando Ultra-HD...' : 'Baixar Arquivo PDF &rarr;'}
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
