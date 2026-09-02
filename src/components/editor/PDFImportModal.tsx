import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, Crop, Plus, ArrowLeft, ArrowRight, Check, ZoomIn, ZoomOut, Info } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { useCatalogStore } from '../../stores/useCatalogStore';
import { useMediaStore } from '../../stores/useMediaStore';
import { ContentBlock } from '../../domain/catalog.schema';

// Configura o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

interface PDFImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PDFImportModal: React.FC<PDFImportModalProps> = ({ isOpen, onClose }) => {
  const { currentCatalog, addBlock, activePageIndex, setCurrentCatalog } = useCatalogStore();
  const { addUrlAsset } = useMediaStore();

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.4);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSnipping, setIsSnipping] = useState<boolean>(false);

  // Estados de seleção de corte (Snip Box)
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Carrega o arquivo PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setFileName(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(1);
      setSelection(null);
    } catch (err) {
      console.error('Erro ao carregar PDF:', err);
      alert('Não foi possível ler o arquivo PDF selecionado.');
    } finally {
      setIsLoading(false);
    }
  };

  // Renderiza a página no canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        setIsLoading(true);
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || isCancelled) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      } catch (err) {
        console.error('Erro ao renderizar página:', err);
      } finally {
        setIsLoading(false);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, currentPage, scale]);

  // Manipuladores de mouse para ferramenta de recorte (Snip Tool)
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSnipping || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setStartPos({ x, y });
    setSelection({ x, y, width: 0, height: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !isSnipping || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const width = Math.abs(currentX - startPos.x);
    const height = Math.abs(currentY - startPos.y);

    setSelection({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Ação 1: Adiciona a página completa do PDF como uma nova folha no catálogo
  const handleAddFullPage = () => {
    if (!canvasRef.current || !currentCatalog) return;

    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png', 1.0);

    // Salva na galeria de mídia
    addUrlAsset(dataUrl, `${fileName} - Pág ${currentPage}`, 'diagram');

    // Cria a nova página
    const newPageNumber = currentCatalog.pages.length + 1;
    const newPageId = `page-pdf-${Date.now()}`;
    const newBlock: ContentBlock = {
      id: `block-pdf-full-${Date.now()}`,
      type: 'image',
      title: `Página ${currentPage} — ${fileName}`,
      imageUrl: dataUrl,
      imageCaption: `Importado de ${fileName} (Pág. ${currentPage})`
    };

    const newPage = {
      id: newPageId,
      pageNumber: newPageNumber,
      pageType: 'technical' as const,
      title: `Pág. ${currentPage} (${fileName})`,
      blocks: [newBlock]
    };

    setCurrentCatalog({
      ...currentCatalog,
      pages: [...currentCatalog.pages, newPage],
      updatedAt: new Date().toISOString()
    });
    void useCatalogStore.getState().saveCurrentCatalog();

    alert(`Página ${currentPage} importada com sucesso para o catálogo!`);
    onClose();
  };

  // Ação 2: Corta a seleção feita pelo usuário e insere como bloco ou na mídia
  const handleInsertSnip = () => {
    if (!canvasRef.current || !selection || selection.width < 10 || selection.height < 10) {
      alert('Por favor, desenhe uma área de seleção arrastando o mouse sobre o documento.');
      return;
    }

    const sourceCanvas = canvasRef.current;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = selection.width;
    cropCanvas.height = selection.height;
    const ctx = cropCanvas.getContext('2d');

    if (!ctx) return;

    ctx.drawImage(
      sourceCanvas,
      selection.x,
      selection.y,
      selection.width,
      selection.height,
      0,
      0,
      selection.width,
      selection.height
    );

    const snipDataUrl = cropCanvas.toDataURL('image/png', 1.0);

    // Adiciona na galeria
    addUrlAsset(snipDataUrl, `Recorte ${fileName} Pág ${currentPage}`, 'diagram');

    // Se houver uma página ativa, insere o bloco recortado
    if (currentCatalog && currentCatalog.pages[activePageIndex]) {
      const activePage = currentCatalog.pages[activePageIndex];
      const newBlock: ContentBlock = {
        id: `block-snip-${Date.now()}`,
        type: 'image',
        title: `Recorte Técnico — Pág. ${currentPage}`,
        imageUrl: snipDataUrl,
        imageCaption: `Recorte de ${fileName} (Pág. ${currentPage})`
      };
      addBlock(activePage.id, newBlock);
      alert('Recorte inserido na página atual do catálogo e salvo na Galeria de Mídia!');
    } else {
      alert('Recorte salvo com sucesso na Galeria de Mídia!');
    }

    setSelection(null);
    setIsSnipping(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">
                Importador de Páginas e Recorte de PDF (Snip Tool)
              </h3>
              <p className="text-xs text-slate-500">
                Extraia páginas completas ou recorte gráficos, diagramas e tabelas de manuais e catálogos existentes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Ferramentas / Controles */}
        <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors shadow-sm">
              <Upload className="w-4 h-4" />
              <span>Abrir Arquivo PDF</span>
              <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" />
            </label>

            {fileName && (
              <span className="text-xs font-mono text-slate-600 bg-white px-2.5 py-1 rounded border border-slate-200 truncate max-w-xs">
                {fileName}
              </span>
            )}
          </div>

          {pdfDoc && (
            <div className="flex items-center gap-4">
              {/* Paginação */}
              <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isLoading}
                  className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                  title="Página Anterior"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <span>
                  Página <strong>{currentPage}</strong> de {numPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  disabled={currentPage >= numPages || isLoading}
                  className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
                  title="Próxima Página"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Zoom */}
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700">
                <button
                  onClick={() => setScale((s) => Math.max(0.8, s - 0.2))}
                  className="p-1 hover:bg-slate-100 rounded"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                  className="p-1 hover:bg-slate-100 rounded"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Botão Modo Recorte */}
              <button
                onClick={() => {
                  setIsSnipping(!isSnipping);
                  setSelection(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  isSnipping
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
                }`}
              >
                <Crop className="w-3.5 h-3.5" />
                <span>{isSnipping ? 'Modo Recorte Ativo' : 'Ativar Ferramenta de Recorte'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Visualizador do PDF com Suporte a Recorte */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-slate-800 p-6 flex items-center justify-center relative select-none"
        >
          {isLoading && (
            <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-30">
              <div className="text-white text-sm font-medium flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processando página em alta definição...
              </div>
            </div>
          )}

          {!pdfDoc ? (
            <div className="text-center text-slate-400 py-16">
              <FileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium text-slate-300">Nenhum documento PDF aberto</p>
              <p className="text-xs text-slate-500 mt-1">
                Clique no botão "Abrir Arquivo PDF" acima para selecionar o manual ou catálogo.
              </p>
            </div>
          ) : (
            <div
              className={`relative shadow-2xl rounded bg-white ${isSnipping ? 'cursor-crosshair' : 'cursor-default'}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <canvas ref={canvasRef} className="block max-w-full rounded" />

              {/* Caixa de Seleção do Snip Tool */}
              {isSnipping && selection && (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                  style={{
                    left: `${selection.x}px`,
                    top: `${selection.y}px`,
                    width: `${selection.width}px`,
                    height: `${selection.height}px`
                  }}
                >
                  <div className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-mono px-1 py-0.5 rounded shadow">
                    {Math.round(selection.width)} × {Math.round(selection.height)} px
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        {pdfDoc && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {isSnipping ? (
                <span className="flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span><strong>Dica:</strong> Clique e arraste o mouse sobre a área que deseja recortar (ex: tabela, gráfico ou diagrama).</span>
                </span>
              ) : (
                <span>Visualizando página {currentPage}. Escolha entre adicionar a folha inteira ou recortar partes.</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isSnipping && selection && selection.width > 20 && selection.height > 20 ? (
                <button
                  onClick={handleInsertSnip}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>Inserir Recorte no Catálogo</span>
                </button>
              ) : null}

              <button
                onClick={handleAddFullPage}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Página {currentPage} Inteira ao Catálogo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
