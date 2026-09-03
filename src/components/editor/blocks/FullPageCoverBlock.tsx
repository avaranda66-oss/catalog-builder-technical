// src/components/editor/blocks/FullPageCoverBlock.tsx
// Bloco de Capa A4 Página Inteira (full_page_cover).
// Integra a Pure Domain Engine (CORE.E4) para materialização segura de camadas,
// eliminação completa do save-storm de drag (preview transiente local) e resolução canônica de background.

import React, { useRef, useState, useEffect } from 'react';
import {
  Trash2,
  Image as ImageIcon,
  Type,
  Minus,
  Sparkles,
  Square,
  Copy,
  Move
} from 'lucide-react';
import { ContentBlock, CanvasLayer, CanvasLayerType } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';
import {
  getEffectiveCoverLayers,
  materializeCoverLayers,
  createCoverLayer,
  updateCoverLayer,
  removeCoverLayer,
  duplicateCoverLayer,
  resolveCoverBackgroundSource
} from '../../../domain/full-page-cover.engine';

export interface ElementPositionConfig {
  x: number;
  y: number;
  size?: number;
  color?: string;
  visible?: boolean;
  width?: number;
}

const CoverImageLayer: React.FC<{ layer: CanvasLayer }> = ({ layer }) => {
  const displayUrl = useResolvedAssetUrl(layer.assetId, layer.imageUrl || layer.legacyUrl);
  return (
    <div
      style={{
        width: `${layer.width || 200}px`,
        height: `${layer.height || 140}px`
      }}
      className="overflow-hidden bg-slate-900 border border-slate-700 relative group/img"
    >
      <img
        src={displayUrl || layer.imageUrl || layer.legacyUrl || ''}
        alt={layer.label}
        className="w-full h-full object-contain"
      />
    </div>
  );
};

interface FullPageCoverBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export const FullPageCoverBlock: React.FC<FullPageCoverBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const custom = block.customData || {};
  const overlayOpacity = custom.overlayOpacity ?? 45; // 0 a 100%

  // Resolução pura da fonte de fotografia de fundo (assetId vs URLs)
  const bgSource = resolveCoverBackgroundSource(block);
  const backgroundImageUrl = useResolvedAssetUrl(
    bgSource.kind === 'asset' ? bgSource.assetId : undefined,
    bgSource.kind === 'url' ? bgSource.url : undefined
  );

  // Camadas canônicas / derivadas da engine pura
  const effectiveLayers = getEffectiveCoverLayers(block);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // ==========================================================================
  // ESTADO DE DRAG TRANSIENTE (Zero Save-Storm)
  // ==========================================================================
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [localPreviewLayers, setLocalPreviewLayers] = useState<CanvasLayer[] | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>(null);

  const handleStartDrag = (
    layerId: string,
    currentX: number,
    currentY: number,
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    setSelectedLayerId(layerId);
    setDraggingLayerId(layerId);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Defensivo
    }

    dragStartRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      startX: currentX,
      startY: currentY,
      hasMoved: false
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingLayerId || !dragStartRef.current || !containerRef.current) return;

    const deltaXPixels = e.clientX - dragStartRef.current.clientX;
    const deltaYPixels = e.clientY - dragStartRef.current.clientY;

    if (Math.abs(deltaXPixels) > 1 || Math.abs(deltaYPixels) > 1) {
      dragStartRef.current.hasMoved = true;
    }

    if (!dragStartRef.current.hasMoved) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPercent = (deltaXPixels / rect.width) * 100;
    const deltaYPercent = (deltaYPixels / rect.height) * 100;

    const newX = Math.max(0, Math.min(95, dragStartRef.current.startX + deltaXPercent));
    const newY = Math.max(0, Math.min(95, dragStartRef.current.startY + deltaYPercent));

    // Atualiza SOMENTE o preview local React. ZERO chamada de updateBlock() aqui!
    const base = localPreviewLayers || effectiveLayers;
    const updated = base.map((l) =>
      l.id === draggingLayerId
        ? { ...l, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 }
        : l
    );

    setLocalPreviewLayers(updated);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      try {
        e.currentTarget.releasePointerCapture?.(dragStartRef.current.pointerId);
      } catch {
        // Defensivo
      }

      // Se houve movimento real, comita EXATAMENTE UMA VEZ no Zustand
      if (dragStartRef.current.hasMoved && localPreviewLayers && draggingLayerId) {
        const baseLayers = materializeCoverLayers(block);
        const targetPreview = localPreviewLayers.find((l) => l.id === draggingLayerId);

        if (targetPreview) {
          const finalLayers = updateCoverLayer(baseLayers, draggingLayerId, {
            x: targetPreview.x,
            y: targetPreview.y
          });

          updateBlock(pageId, block.id, {
            customData: { ...custom, canvasLayers: finalLayers }
          });
        }
      }
      // Se !hasMoved: ZERO mutação, ZERO materialização (COVER-DRAG-NOMOVE-1)
    }

    setDraggingLayerId(null);
    setLocalPreviewLayers(null);
    dragStartRef.current = null;
  };

  const handlePointerCancel = () => {
    setDraggingLayerId(null);
    setLocalPreviewLayers(null);
    dragStartRef.current = null;
  };

  // Cancelamento via tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && draggingLayerId) {
        setDraggingLayerId(null);
        setLocalPreviewLayers(null);
        dragStartRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draggingLayerId]);

  // Camadas a renderizar: usa preview transiente se estiver em drag ativo, senão as efetivas
  const displayLayers = localPreviewLayers || effectiveLayers;

  // ==========================================================================
  // AÇÕES DA BARRA FLUTUANTE (CANVAS TOOLBAR) VIA ENGINE PURA
  // ==========================================================================
  const handleAddLayer = (type: CanvasLayerType) => {
    const baseLayers = materializeCoverLayers(block);
    const newLayer = createCoverLayer(type, baseLayers.length);
    const updated = [...baseLayers, newLayer];

    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
    setSelectedLayerId(newLayer.id);
  };

  const handleRemoveLayer = (layerId: string) => {
    const baseLayers = materializeCoverLayers(block);
    const updated = removeCoverLayer(baseLayers, layerId);

    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
  };

  const handleDuplicateLayer = (layer: CanvasLayer) => {
    const baseLayers = materializeCoverLayers(block);
    const updated = duplicateCoverLayer(baseLayers, layer.id);

    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
  };

  const handleInlineContentBlur = (layerId: string, newContent: string) => {
    const currentLayer = displayLayers.find((l) => l.id === layerId);
    if (currentLayer && currentLayer.content !== newContent) {
      const baseLayers = materializeCoverLayers(block);
      const updated = updateCoverLayer(baseLayers, layerId, { content: newContent });

      updateBlock(pageId, block.id, {
        customData: { ...custom, canvasLayers: updated }
      });
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
        setSelectedLayerId(null);
      }}
      className={`relative w-[794px] h-[1123px] min-h-[1123px] bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none transition-all rounded-none ${
        isSelected ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-slate-500'
      }`}
      style={{ boxSizing: 'border-box' }}
    >
      {/* 1. Fotografia de Fundo Full-Bleed A4 */}
      <div
        className="absolute inset-0 z-0 overflow-hidden bg-slate-950 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: backgroundImageUrl ? `url("${backgroundImageUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* Overlay Escuro com Contraste Configurável */}
        <div
          className="absolute inset-0 bg-slate-950 pointer-events-none"
          style={{ opacity: overlayOpacity / 100 }}
        />
      </div>

      {/* 2. Barra Flutuante de Ferramentas do Modo Canvas (no-print) */}
      {isSelected && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 left-2 z-50 bg-slate-900/90 backdrop-blur border border-slate-700 text-white p-1 flex items-center gap-1 rounded-none shadow-xl no-print"
          data-editor-action="true"
        >
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1.5 select-none font-mono">
            + Adicionar:
          </span>
          <button
            type="button"
            onClick={() => handleAddLayer('text')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors cursor-pointer"
            title="Inserir texto livre arrastável"
          >
            <Type className="w-3 h-3 text-blue-400" />
            <span>Texto</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('badge')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors cursor-pointer"
            title="Inserir selo ou badge metrológico"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Selo / Badge</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('image')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors cursor-pointer"
            title="Inserir foto ou logo secundário"
          >
            <ImageIcon className="w-3 h-3 text-emerald-400" />
            <span>Foto / Logo</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('line')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors cursor-pointer"
            title="Inserir linha técnica horizontal"
          >
            <Minus className="w-3 h-3 text-blue-400" />
            <span>Linha</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('shape')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors cursor-pointer"
            title="Inserir moldura ou caixa de destaque"
          >
            <Square className="w-3 h-3 text-purple-400" />
            <span>Moldura</span>
          </button>
        </div>
      )}

      {/* 3. Renderização de Cada Camada no Canvas */}
      {displayLayers
        .filter((l) => l.visible !== false)
        .map((layer) => {
          const isLayerSelected = selectedLayerId === layer.id;

          return (
            <div
              key={layer.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLayerId(layer.id);
              }}
              style={{
                position: 'absolute',
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                zIndex: layer.zIndex || 10,
                width: layer.width ? `${layer.width}px` : 'auto',
                opacity: (layer.opacity ?? 100) / 100
              }}
              className={`group/layer select-text transition-shadow ${
                isLayerSelected
                  ? 'ring-1 ring-blue-400 bg-blue-500/10'
                  : 'hover:ring-1 hover:ring-white/40'
              }`}
            >
              {/* Handle de Drag & Drop (Pointer Capture) */}
              <div
                onPointerDown={(e) => handleStartDrag(layer.id, layer.x, layer.y, e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className={`absolute -top-5 left-0 px-1.5 py-0.5 bg-[#003366] text-white text-[8px] font-mono font-bold flex items-center gap-1 rounded-none shadow cursor-grab active:cursor-grabbing no-print ${
                  isLayerSelected ? 'opacity-100' : 'opacity-0 group-hover/layer:opacity-100'
                }`}
                data-editor-action="true"
              >
                <Move className="w-2.5 h-2.5" />
                <span>{layer.label}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicateLayer(layer);
                  }}
                  className="hover:text-blue-300 ml-1 cursor-pointer"
                  title="Duplicar elemento"
                >
                  <Copy className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveLayer(layer.id);
                  }}
                  className="hover:text-red-400 ml-0.5 cursor-pointer"
                  title="Excluir elemento"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* RENDER POR TIPO */}
              {layer.type === 'text' && (
                <div
                  data-printable-field={`layer_${layer.id}`}
                  contentEditable={isSelected}
                  suppressContentEditableWarning
                  onBlur={(e) => handleInlineContentBlur(layer.id, e.currentTarget.innerText.trim())}
                  style={{
                    fontSize: `${layer.fontSize || 16}px`,
                    color: layer.color || '#ffffff',
                    fontWeight:
                      layer.fontWeight === 'black'
                        ? 900
                        : layer.fontWeight === 'bold'
                        ? 700
                        : layer.fontWeight === 'semibold'
                        ? 600
                        : 400,
                    fontFamily: layer.fontFamily === 'mono' ? 'monospace' : 'sans-serif',
                    textAlign: layer.textAlign || 'left',
                    letterSpacing:
                      layer.letterSpacing === 'widest'
                        ? '0.2em'
                        : layer.letterSpacing === 'wide'
                        ? '0.1em'
                        : 'normal',
                    textTransform: layer.textTransform || 'none'
                  }}
                  className="outline-none focus:bg-white/10 px-1 py-0.5 cursor-text leading-tight whitespace-pre-wrap min-w-[60px]"
                >
                  {layer.content || 'Digite o texto...'}
                </div>
              )}

              {layer.type === 'badge' && (
                <div
                  data-printable-field={`layer_${layer.id}`}
                  contentEditable={isSelected}
                  suppressContentEditableWarning
                  onBlur={(e) => handleInlineContentBlur(layer.id, e.currentTarget.innerText.trim())}
                  style={{
                    fontSize: `${layer.fontSize || 10}px`,
                    lineHeight: '1.2',
                    color: layer.color || '#93c5fd',
                    backgroundColor: layer.backgroundColor || 'rgba(30, 58, 138, 0.4)',
                    borderColor: layer.borderColor || 'rgba(96, 165, 250, 0.5)',
                    borderWidth: `${layer.borderWidth || 1}px`,
                    borderStyle: 'solid',
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box'
                  }}
                  className="outline-none focus:bg-white/20 cursor-text font-mono font-bold uppercase tracking-widest select-none"
                >
                  {layer.content || 'SELO / BADGE'}
                </div>
              )}

              {layer.type === 'line' && (
                <div
                  style={{
                    width: `${layer.width || 80}px`,
                    height: `${layer.height || 3}px`,
                    backgroundColor: layer.backgroundColor || '#3b82f6'
                  }}
                />
              )}

              {layer.type === 'image' && (
                <CoverImageLayer layer={layer} />
              )}

              {layer.type === 'shape' && (
                <div
                  style={{
                    width: `${layer.width || 250}px`,
                    height: `${layer.height || 100}px`,
                    backgroundColor: layer.backgroundColor || 'rgba(15, 23, 42, 0.8)',
                    borderColor: layer.borderColor || '#475569',
                    borderWidth: `${layer.borderWidth || 1}px`,
                    borderStyle: 'solid'
                  }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
};
