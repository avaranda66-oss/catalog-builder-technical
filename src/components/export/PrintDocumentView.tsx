import React, { useEffect, useState, useRef } from 'react';
import { Printer, Download, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Catalog } from '../../domain/catalog.schema';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { SupabaseService } from '../../services/supabase.service';
import { PDFService } from '../../services/pdf.service';
import { CleanA4Document } from './CleanA4Document';

export const PrintDocumentView: React.FC = () => {
  const { currentCatalog } = useCatalogStore();
  const [documentToRender, setDocumentToRender] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadyForPrint, setIsReadyForPrint] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isExportingDirect, setIsExportingDirect] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDocument = async () => {
      setIsLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const catalogId = urlParams.get('catalog');
      const templateId = urlParams.get('template');

      // 1. Usa o catálogo ativo em memória se corresponder ao ID
      if (currentCatalog && (!catalogId || currentCatalog.id === catalogId)) {
        setDocumentToRender(currentCatalog);
        setIsLoading(false);
        return;
      }

      // 2. Caso contrário, carrega do Supabase ou savedCatalogs
      if (catalogId) {
        const saved = useCatalogStore.getState().savedCatalogs.find((c) => c.id === catalogId);
        if (saved) {
          setDocumentToRender(saved);
          setIsLoading(false);
          return;
        }
      }

      if (templateId) {
        const res = await SupabaseService.getTemplate(templateId);
        if (res.success && res.data) {
          const preset = res.data;
          const templateCatalog: Catalog = {
            ...preset.catalog,
            id: preset.id,
            title: preset.name,
            version: preset.version || 1
          };
          setDocumentToRender(templateCatalog);
          setIsLoading(false);
          return;
        }
      }

      // Fallback para currentCatalog
      if (currentCatalog) {
        setDocumentToRender(currentCatalog);
      }
      setIsLoading(false);
    };

    void loadDocument();
  }, [currentCatalog]);

  // Aguarda carregamento de fontes e imagens para garantir fidelidade vetorial absoluta
  useEffect(() => {
    if (!documentToRender) return;

    let isCancelled = false;
    const preparePrint = async () => {
      if (typeof document !== 'undefined' && document.fonts) {
        await document.fonts.ready;
      }

      if (containerRef.current) {
        const images = Array.from(containerRef.current.querySelectorAll('img'));
        await Promise.all(
          images.map((img) => {
            if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
            return new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 2000);
            });
          })
        );
      }

      if (!isCancelled) {
        setIsReadyForPrint(true);
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autoprint') === '1') {
          setTimeout(() => {
            window.print();
          }, 300);
        }
      }
    };

    void preparePrint();
    return () => {
      isCancelled = true;
    };
  }, [documentToRender]);

  const handleNativePrint = () => {
    window.print();
  };

  const handleDownloadDirectPDF = async () => {
    if (!documentToRender) return;
    setIsExportingDirect(true);
    setStatusMessage(null);

    const safeTitle = (documentToRender.title || 'PRESYS_Catalog').replace(/[^a-zA-Z0-9_-]/g, '_');
    const versionStr = `v${documentToRender.version || 1}`;
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${safeTitle}_${versionStr}_${dateStr}.pdf`;

    const result = await PDFService.exportToPDF('.clean-export-page', {
      fileName,
      quality: 1.0,
      scale: 3.5
    });

    setIsExportingDirect(false);
    if (result.success) {
      setStatusMessage(`Arquivo "${fileName}" compilado com sucesso!`);
    } else {
      setStatusMessage(result.message || 'Falha ao compilar o PDF.');
    }
  };

  const handleReturnToEditor = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('print');
    url.searchParams.delete('autoprint');
    window.location.href = url.pathname + (url.search ? url.search : '');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white font-mono text-xs">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-blue-400" />
        <span>PREPARANDO RENDERIZADOR DE EXPORTAÇÃO A4...</span>
      </div>
    );
  }

  if (!documentToRender) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white font-mono text-xs p-6 text-center">
        <AlertCircle className="w-8 h-8 text-amber-400 mb-3" />
        <span className="font-bold text-sm">Nenhum documento encontrado para exportação.</span>
        <button
          onClick={handleReturnToEditor}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-none font-sans font-bold text-xs"
        >
          Voltar ao Editor
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-800 text-slate-900 print:bg-white print:m-0 print:p-0">
      {/* Barra de Controle Superior (Oculta na Impressão) */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-6 py-3 flex items-center justify-between no-print select-none shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={handleReturnToEditor}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-none text-xs font-mono font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Editor</span>
          </button>

          <div className="h-4 w-px bg-slate-700" />

          <div>
            <h1 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
              {documentToRender.title}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Versão v{documentToRender.version || 1} • {documentToRender.pages.length} Folha(s) A4 • Padrão Editorial Gráfico
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {statusMessage && (
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-700 px-2 py-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{statusMessage}</span>
            </span>
          )}

          <button
            onClick={handleDownloadDirectPDF}
            disabled={isExportingDirect || !isReadyForPrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-none text-xs font-mono font-bold transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>{isExportingDirect ? 'Compilando Ultra-HD...' : 'Baixar .PDF Direto'}</span>
          </button>

          <button
            onClick={handleNativePrint}
            disabled={!isReadyForPrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded-none text-xs font-mono font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / Salvar PDF Vetorial</span>
          </button>
        </div>
      </header>

      {/* Área de Visualização e Renderização Limpa */}
      <main ref={containerRef} className="py-8 print:p-0 flex flex-col items-center gap-8 print:gap-0">
        <CleanA4Document document={documentToRender} />
      </main>

      {/* Estilos Globais de Impressão A4 Estrita */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .clean-export-root {
            margin: 0 !important;
            padding: 0 !important;
          }
          .clean-export-page {
            box-shadow: none !important;
            margin: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>
    </div>
  );
};
