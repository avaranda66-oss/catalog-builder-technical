// src/components/editor/frames/StructuralSectionInteractionFrame.tsx
// Interaction Frame Editor-Only para Seções Estruturais (Fase 3A.5B.1)
// Isola toda a lógica de pointer capture, handles de resize físico ancorados à borda real da seção,
// preview transitório com ref síncrono autoritativo, escala real da folha e reordenação acessível por Stable IDs.

import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { ContentBlock } from '@/domain/catalog.schema';
import { getPageContentBox } from '@/domain/page-geometry';
import { calculateSnappedResizeWidthMm } from '@/domain/structural-interaction';
import { useCatalogStore } from '@/stores/useCatalogStore';
import { StructuralSectionBlock } from '../blocks/StructuralSectionBlock';

export interface StructuralSectionInteractionFrameProps {
  block: ContentBlock;
  pageId: string;
  pageIndex?: number;
  blockIndex: number;
  totalBlocks: number;
  isSelected?: boolean;
  selectedChildId?: string | null;
  onSelectSection?: () => void;
  onSelectCard?: (childId: string) => void;
}

interface ResizeSnapshot {
  initialWidthMm: number;
  initialClientX: number;
  actualScale: number;
  anchor: 'left' | 'center' | 'right';
  handleSide: 'left' | 'right';
  pageId: string;
  blockId: string;
  initialCommittedWidth: number;
}

export const StructuralSectionInteractionFrame: React.FC<StructuralSectionInteractionFrameProps> = ({
  block,
  pageId,
  pageIndex: _pageIndex,
  blockIndex,
  totalBlocks,
  isSelected = false,
  selectedChildId = null,
  onSelectSection,
  onSelectCard
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [previewWidthMm, setPreviewWidthMm] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Refs síncronos autoritativos para imunidade contra React state lag em eventos rápidos (Fase 3A.5B.1)
  const isResizingRef = useRef<boolean>(false);
  const previewWidthRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activeCaptureElementRef = useRef<HTMLElement | null>(null);
  const isFinishedNormallyRef = useRef<boolean>(false);
  const resizeSnapshotRef = useRef<ResizeSnapshot | null>(null);

  const layout = block.structuralData?.layout;
  const isFixedWidth = layout?.widthMode === 'fixed';
  const align = layout?.align || 'left';

  // Obter largura útil máxima da página
  const contentBox = getPageContentBox();
  const availableWidthMm = contentBox.availableWidthMm;

  // Derivação da escala real do DOM da página A4
  const getActualScale = (): number => {
    if (!frameRef.current) return 1;
    const pageContainer = frameRef.current.closest('.a4-page-container') as HTMLElement | null;
    if (!pageContainer || !pageContainer.offsetWidth) return 1;
    return pageContainer.getBoundingClientRect().width / pageContainer.offsetWidth;
  };

  // Liberação segura de pointer capture
  const safeReleasePointerCapture = () => {
    if (activeCaptureElementRef.current && activePointerIdRef.current !== null) {
      try {
        activeCaptureElementRef.current.releasePointerCapture(activePointerIdRef.current);
      } catch {
        // Ignora se elemento desconectado ou captura já liberada
      }
      activeCaptureElementRef.current = null;
    }
  };

  // Cancelamento seguro (Escape, pointercancel, unmount)
  const cancelResize = () => {
    if (!isResizingRef.current && !resizeSnapshotRef.current) return;
    safeReleasePointerCapture();
    isResizingRef.current = false;
    setIsResizing(false);
    previewWidthRef.current = null;
    setPreviewWidthMm(null);
    activePointerIdRef.current = null;
    resizeSnapshotRef.current = null;
  };

  // Tratamento de lostpointercapture inesperado
  const handleLostPointerCapture = () => {
    // Se a sessão foi finalizada normalmente no pointerup, ignora o evento subsequente
    if (isFinishedNormallyRef.current) return;
    cancelResize();
  };

  // Listener para tecla Escape durante resize
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isResizingRef.current) {
        cancelResize();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handler de PointerDown no Handle de Resize
  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handleSide: 'left' | 'right'
  ) => {
    if (e.button !== 0) return; // Apenas botão principal
    e.preventDefault();
    e.stopPropagation();

    if (!isFixedWidth || !layout) return;

    const initialWidth = layout.fixedWidthMm ?? availableWidthMm;
    const actualScale = getActualScale();

    isFinishedNormallyRef.current = false;
    activeCaptureElementRef.current = e.currentTarget as HTMLElement;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Safe em ambientes de teste
    }
    activePointerIdRef.current = e.pointerId;

    resizeSnapshotRef.current = {
      initialWidthMm: initialWidth,
      initialClientX: e.clientX,
      actualScale,
      anchor: align,
      handleSide,
      pageId,
      blockId: block.id,
      initialCommittedWidth: initialWidth
    };

    isResizingRef.current = true;
    setIsResizing(true);
    previewWidthRef.current = initialWidth;
    setPreviewWidthMm(initialWidth);
  };

  // Handler de PointerMove (atualiza estado síncrono e APENAS preview transitório)
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current || !resizeSnapshotRef.current) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const snapshot = resizeSnapshotRef.current;
    const deltaX = e.clientX - snapshot.initialClientX;

    const newWidth = calculateSnappedResizeWidthMm({
      initialWidthMm: snapshot.initialWidthMm,
      deltaXPixels: deltaX,
      actualScale: snapshot.actualScale,
      anchor: snapshot.anchor,
      handleSide: snapshot.handleSide,
      availableWidthMm
    });

    // Atualização síncrona imediata no ref + dispatch React para render visual
    previewWidthRef.current = newWidth;
    setPreviewWidthMm(newWidth);
  };

  // Handler de PointerUp (commita exatamente UMA mutação baseada no ref síncrono)
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizingRef.current || !resizeSnapshotRef.current) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    isFinishedNormallyRef.current = true;
    safeReleasePointerCapture();

    const snapshot = resizeSnapshotRef.current;
    // O valor autoritativo final vem do ref síncrono para imunidade contra state lag
    const finalWidth = previewWidthRef.current ?? snapshot.initialWidthMm;

    // Limpa estado transitório
    isResizingRef.current = false;
    setIsResizing(false);
    previewWidthRef.current = null;
    setPreviewWidthMm(null);
    activePointerIdRef.current = null;
    resizeSnapshotRef.current = null;

    // Validação remota / externa: resolver IDs contra o estado atual do Store
    const catalog = useCatalogStore.getState().currentCatalog;
    const currentPage = catalog?.pages.find((p) => p.id === snapshot.pageId);
    const currentBlock = currentPage?.blocks?.find((b) => b.id === snapshot.blockId);

    if (
      !currentBlock ||
      currentBlock.type !== 'structural_section' ||
      !currentBlock.structuralData ||
      currentBlock.structuralData.layout.widthMode !== 'fixed'
    ) {
      // Bloco desapareceu ou não é mais fixed -> zero mutation
      return;
    }

    // Se o valor committed divergiu durante a interação local: cancela (fail-closed conservador)
    const currentCommitted = currentBlock.structuralData.layout.fixedWidthMm ?? availableWidthMm;
    if (Math.abs(currentCommitted - snapshot.initialCommittedWidth) > 0.0001) {
      return;
    }

    // No-op check: se a largura final snapped for idêntica à inicial, zero mutation
    if (Math.abs(finalWidth - snapshot.initialWidthMm) < 0.0001) {
      return;
    }

    // Commit único
    useCatalogStore.getState().setStructuralSectionFixedWidth(
      snapshot.pageId,
      snapshot.blockId,
      finalWidth
    );
  };

  // Controles Acessíveis de Reordenação
  const handleMoveUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blockIndex > 0) {
      useCatalogStore.getState().moveStructuralSectionOnPage(pageId, block.id, 'up');
    }
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blockIndex < totalBlocks - 1) {
      useCatalogStore.getState().moveStructuralSectionOnPage(pageId, block.id, 'down');
    }
  };

  // Drag & Drop nativo entre seções
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'structural_section',
        pageId,
        sectionId: block.id,
        index: blockIndex
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      if (data.type === 'structural_section' && data.pageId === pageId && data.sectionId !== block.id) {
        useCatalogStore.getState().reorderStructuralSectionOnPage(pageId, data.sectionId, blockIndex);
      }
    } catch {
      // Fail-closed
    }
  };

  // Renderização condicional dos handles de resize (apenas quando selecionado e fixed)
  const showRightHandle = isSelected && isFixedWidth && (align === 'left' || align === 'center');
  const showLeftHandle = isSelected && isFixedWidth && (align === 'right' || align === 'center');

  // Largura e alinhamento do ResizeShell (coincide fisicamente com a seção)
  const effectiveWidthMm = previewWidthMm ?? layout?.fixedWidthMm;
  const shellWidthStyle: React.CSSProperties =
    isFixedWidth && effectiveWidthMm && effectiveWidthMm > 0
      ? { width: `${effectiveWidthMm}mm`, maxWidth: '100%' }
      : { width: '100%' };

  const shellAlignClass =
    align === 'center'
      ? 'mx-auto'
      : align === 'right'
      ? 'ml-auto'
      : 'mr-auto';

  return (
    <div
      ref={frameRef}
      data-interaction-frame="structural_section"
      data-block-id={block.id}
      className="relative group/frame w-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Chrome Editor-Only: Toolbar Flutuante de Reordenação e Acessibilidade */}
      {isSelected && (
        <div
          data-testid="structural-section-toolbar"
          className="absolute -top-7 right-0 flex items-center gap-1 bg-white/95 border border-slate-200 shadow-sm rounded px-1 py-0.5 z-20 text-[10px] text-slate-600 no-print editor-only"
        >
          <button
            type="button"
            onClick={handleMoveUp}
            disabled={blockIndex <= 0}
            className="p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
            title="Mover seção para cima"
            aria-label="Mover seção para cima"
          >
            <ArrowUp className="w-3 h-3 text-slate-700" />
          </button>
          <button
            type="button"
            onClick={handleMoveDown}
            disabled={blockIndex >= totalBlocks - 1}
            className="p-1 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors"
            title="Mover seção para baixo"
            aria-label="Mover seção para baixo"
          >
            <ArrowDown className="w-3 h-3 text-slate-700" />
          </button>
          <div
            draggable
            onDragStart={handleDragStart}
            className="p-1 cursor-grab active:cursor-grabbing hover:bg-slate-100 rounded text-slate-500"
            title="Arrastar para reordenar seção"
            aria-label="Arrastar para reordenar seção"
          >
            <GripVertical className="w-3 h-3" />
          </div>
        </div>
      )}

      {/* Inner Interaction / Resize Shell: coincide rigorosamente com a dimensão física da seção */}
      <div
        data-testid="resize-shell"
        className={`relative ${shellAlignClass}`}
        style={shellWidthStyle}
      >
        {/* Badge Flutuante de Dimensão em Milímetros durante Resize */}
        {isResizing && previewWidthMm !== null && (
          <div
            data-testid="resize-dimension-badge"
            className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] font-mono px-2 py-0.5 rounded shadow z-40 no-print editor-only pointer-events-none whitespace-nowrap"
          >
            {previewWidthMm.toFixed(1)} mm
          </div>
        )}

        {/* Resize Handle Esquerdo (ancorado à borda física esquerda do ResizeShell) */}
        {showLeftHandle && (
          <div
            data-testid="resize-handle-left"
            className="absolute top-0 bottom-0 w-3 -left-1.5 cursor-ew-resize flex items-center justify-center group z-30 no-print editor-only select-none"
            onPointerDown={(e) => handlePointerDown(e, 'left')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelResize}
            onLostPointerCapture={handleLostPointerCapture}
            title="Redimensionar largura à esquerda"
            aria-label="Redimensionar largura da seção à esquerda"
          >
            <div className="w-1.5 h-8 bg-blue-600 rounded-full shadow border border-white group-hover:scale-110 transition-transform" />
          </div>
        )}

        {/* Renderer Compartilhado Puro */}
        <StructuralSectionBlock
          block={block}
          pageId={pageId}
          isSelected={isSelected}
          selectedChildId={selectedChildId}
          onSelectSection={onSelectSection}
          onSelectCard={onSelectCard}
          isExport={false}
          previewWidthMm={previewWidthMm ?? undefined}
        />

        {/* Resize Handle Direito (ancorado à borda física direita do ResizeShell) */}
        {showRightHandle && (
          <div
            data-testid="resize-handle-right"
            className="absolute top-0 bottom-0 w-3 -right-1.5 cursor-ew-resize flex items-center justify-center group z-30 no-print editor-only select-none"
            onPointerDown={(e) => handlePointerDown(e, 'right')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelResize}
            onLostPointerCapture={handleLostPointerCapture}
            title="Redimensionar largura à direita"
            aria-label="Redimensionar largura da seção à direita"
          >
            <div className="w-1.5 h-8 bg-blue-600 rounded-full shadow border border-white group-hover:scale-110 transition-transform" />
          </div>
        )}
      </div>
    </div>
  );
};
