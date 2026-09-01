import React, { useState } from 'react';
import { X, Download, CheckCircle2, AlertCircle, RefreshCw, Printer } from 'lucide-react';
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
      quality: 0.98,
      scale: 2.5
    });

    setIsExporting(false);
    if (result.success) {
      setIsSuccess(true);
      setExportMessage(`File "${fileName}" successfully generated and downloaded!`);
    } else {
      setIsSuccess(false);
      setExportMessage(result.message || 'Failed to generate PDF file.');
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
      <div className="bg-white rounded-none shadow-2xl border border-slate-400 max-w-lg w-full p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-300">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#003366] text-white flex items-center justify-center font-bold text-xs rounded-none shadow-xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
                Export Technical Catalog to PDF
              </h2>
              <p className="text-[10px] text-slate-500 font-mono">
                High-Resolution (300 DPI+) WYSIWYG Rendering
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

        <div className="mt-4 space-y-3 text-xs text-slate-600">
          <p>
            The export engine compiles all <strong>{currentCatalog.pages.length} page(s)</strong> of the active catalog, preserving technical typography, precise tables, calibration badges, and photographs.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Document:</span>
              <span className="font-semibold text-slate-800 truncate max-w-xs">{currentCatalog.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Format:</span>
              <span className="font-semibold text-slate-800">A4 Portrait (210mm × 297mm)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pages:</span>
              <span className="font-semibold text-slate-800">{currentCatalog.pages.length} sheet(s)</span>
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

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-200 pt-3">
          <button
            onClick={() => setExportPDFModalOpen(false)}
            disabled={isExporting}
            className="w-full sm:w-auto px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-none transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Native High-Resolution Vector Print */}
            <button
              onClick={handleNativePrint}
              disabled={isExporting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-none text-xs font-bold transition-colors"
              title="Print directly or save as vector PDF in high quality"
            >
              <Printer className="w-3.5 h-3.5 text-[#003366]" />
              <span>Native Print / Vector PDF</span>
            </button>

            {/* Direct High-Resolution Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[#003366] hover:bg-[#002244] disabled:bg-slate-400 text-white rounded-none text-xs font-bold shadow-xs transition-colors"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
