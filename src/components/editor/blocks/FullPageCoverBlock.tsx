import React, { useRef, useState, useEffect, useCallback } from 'react';
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
import { useAssetStore } from '../../../stores/useAssetStore';

export interface ElementPositionConfig {
  x: number;
  y: number;
  size?: number;
  color?: string;
  visible?: boolean;
  width?: number;
}

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
  const resolvedCoverUrl = useAssetStore((state) => (block.assetId ? state.resolvedUrls[block.assetId] : undefined));
  const backgroundImageUrl =
    resolvedCoverUrl ||
    custom.backgroundImageUrl ||
    block.imageUrl ||
    (block as any).legacyUrl ||
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85';

  // Migração automática de configs legadas para canvasLayers[]
  const getInitialLayers = (): CanvasLayer[] => {
    if (custom.canvasLayers && Array.isArray(custom.canvasLayers)) {
      return custom.canvasLayers;
    }

    const legacyLayers: CanvasLayer[] = [];

    // Logo
    const logoCfg = custom.logoConfig || { x: 5, y: 3.5, size: 22, visible: true };
    if (logoCfg.visible !== false) {
      legacyLayers.push({
        id: 'layer-logo',
        type: 'text',
        label: 'Logotipo / Marca',
        x: logoCfg.x ?? 5,
        y: logoCfg.y ?? 3.5,
        fontSize: logoCfg.size || 22,
        fontWeight: 'black',
        fontFamily: 'sans',
        color: '#ffffff',
        letterSpacing: 'wider' as any,
        content: custom.brandName || 'PRESYS',
        visible: true,
        zIndex: 10
      });
    }

    // Badge RBC
    const badgeCfg = custom.badgeConfig || { x: 58, y: 3.8, size: 10, visible: true };
    if (badgeCfg.visible !== false) {
      legacyLayers.push({
        id: 'layer-badge',
        type: 'badge',
        label: 'Selo Metrológico / Badge',
        x: badgeCfg.x ?? 58,
        y: badgeCfg.y ?? 3.8,
        fontSize: badgeCfg.size || 10,
        fontWeight: 'bold',
        fontFamily: 'mono',
        color: '#93c5fd',
        backgroundColor: 'rgba(30, 58, 138, 0.4)',
        borderColor: 'rgba(96, 165, 250, 0.5)',
        borderWidth: 1,
        content: block.badgeText || 'CALIBRAÇÃO RBC · ISO/IEC 17025',
        visible: true,
        zIndex: 11
      });
    }

    // Título Comercial
    const titleCfg = custom.titleConfig || { x: 5, y: 22, size: 42, visible: true };
    if (titleCfg.visible !== false) {
      legacyLayers.push({
        id: 'layer-title',
        type: 'text',
        label: 'Título Comercial',
        x: titleCfg.x ?? 5,
        y: titleCfg.y ?? 22,
        fontSize: titleCfg.size || 42,
        fontWeight: 'black',
        fontFamily: 'sans',
        color: '#ffffff',
        content: block.title || 'PCON-Y18-LP / CALIBRADOR',
        visible: true,
        zIndex: 12
      });
    }

    // Subtítulo
    const subCfg = custom.subtitleConfig || { x: 5, y: 29, size: 16, visible: true };
    if (subCfg.visible !== false) {
      legacyLayers.push({
        id: 'layer-subtitle',
        type: 'text',
        label: 'Subtítulo',
        x: subCfg.x ?? 5,
        y: subCfg.y ?? 29,
        fontSize: subCfg.size || 16,
        fontWeight: 'medium',
        fontFamily: 'sans',
        color: '#cbd5e1',
        content: block.subtitle || 'Calibrador Automático de Pressão de Alta Estabilidade',
        visible: true,
        zIndex: 13
      });
    }

    // Linha de Destaque
    const lineCfg = custom.accentLineConfig || { x: 5, y: 34, width: 80, visible: true };
    if (lineCfg.visible !== false) {
      legacyLayers.push({
        id: 'layer-line',
        type: 'line',
        label: 'Linha de Destaque',
        x: lineCfg.x ?? 5,
        y: lineCfg.y ?? 34,
        width: lineCfg.width || 80,
        backgroundColor: '#3b82f6',
        height: 3,
        visible: true,
        zIndex: 14
      });
    }

    return legacyLayers;
  };

  const layers: CanvasLayer[] = getInitialLayers();
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Estado de Drag & Drop
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const handleStartDrag = (layerId: string, currentX: number, currentY: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLayerId(layerId);
    setDraggingLayerId(layerId);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: currentX,
      startY: currentY
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingLayerId || !dragStartRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPixels = e.clientX - dragStartRef.current.mouseX;
    const deltaYPixels = e.clientY - dragStartRef.current.mouseY;

    const deltaXPercent = (deltaXPixels / rect.width) * 100;
    const deltaYPercent = (deltaYPixels / rect.height) * 100;

    let newX = Math.max(0, Math.min(95, dragStartRef.current.startX + deltaXPercent));
    let newY = Math.max(0, Math.min(95, dragStartRef.current.startY + deltaYPercent));

    const updatedLayers = layers.map((l) =>
      l.id === draggingLayerId
        ? { ...l, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 }
        : l
    );

    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updatedLayers }
    });
  }, [draggingLayerId, layers, custom, pageId, block.id, updateBlock]);

  const handleMouseUp = useCallback(() => {
    if (draggingLayerId) {
      setDraggingLayerId(null);
      dragStartRef.current = null;
    }
  }, [draggingLayerId]);

  useEffect(() => {
    if (draggingLayerId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingLayerId, handleMouseMove, handleMouseUp]);

  // Funções de Manipulação de Layers
  const handleUpdateLayer = (layerId: string, updates: Partial<CanvasLayer>) => {
    const updatedLayers = layers.map((l) => (l.id === layerId ? { ...l, ...updates } : l));
    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updatedLayers }
    });
  };

  const handleAddLayer = (type: CanvasLayerType) => {
    const newId = `layer-${Date.now()}`;
    let newLayer: CanvasLayer;

    switch (type) {
      case 'text':
        newLayer = {
          id: newId,
          type: 'text',
          label: `Texto Livre ${layers.length + 1}`,
          content: 'Novo Texto Técnico',
          x: 10,
          y: 20 + layers.length * 5,
          fontSize: 20,
          fontWeight: 'bold',
          color: '#ffffff',
          visible: true,
          zIndex: layers.length + 1
        };
        break;
      case 'badge':
        newLayer = {
          id: newId,
          type: 'badge',
          label: `Badge / Selo ${layers.length + 1}`,
          content: 'CERTIFICADO RBC',
          x: 10,
          y: 10,
          fontSize: 10,
          fontWeight: 'bold',
          fontFamily: 'mono',
          color: '#93c5fd',
          backgroundColor: 'rgba(30, 58, 138, 0.5)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
          borderWidth: 1,
          visible: true,
          zIndex: layers.length + 1
        };
        break;
      case 'image':
        newLayer = {
          id: newId,
          type: 'image',
          label: `Imagem / Logo ${layers.length + 1}`,
          imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
          x: 10,
          y: 40,
          width: 200,
          height: 140,
          visible: true,
          zIndex: layers.length + 1
        };
        break;
      case 'line':
        newLayer = {
          id: newId,
          type: 'line',
          label: `Linha Técnica ${layers.length + 1}`,
          x: 10,
          y: 35,
          width: 80,
          height: 3,
          backgroundColor: '#3b82f6',
          visible: true,
          zIndex: layers.length + 1
        };
        break;
      case 'shape':
        newLayer = {
          id: newId,
          type: 'shape',
          label: `Caixa / Moldura ${layers.length + 1}`,
          x: 10,
          y: 50,
          width: 250,
          height: 100,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          borderColor: '#475569',
          borderWidth: 1,
          visible: true,
          zIndex: layers.length + 1
        };
        break;
    }

    const updated = [...layers, newLayer];
    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
    setSelectedLayerId(newId);
  };

  const handleRemoveLayer = (layerId: string) => {
    const updated = layers.filter((l) => l.id !== layerId);
    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
  };

  const handleDuplicateLayer = (layer: CanvasLayer) => {
    const cloned: CanvasLayer = {
      ...layer,
      id: `layer-${Date.now()}`,
      label: `${layer.label} (Cópia)`,
      x: Math.min(90, layer.x + 3),
      y: Math.min(90, layer.y + 3),
      zIndex: layers.length + 1
    };
    const updated = [...layers, cloned];
    updateBlock(pageId, block.id, {
      customData: { ...custom, canvasLayers: updated }
    });
    setSelectedLayerId(cloned.id);
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
          backgroundImage: `url("${backgroundImageUrl}")`,
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
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors"
            title="Inserir texto livre arrastável"
          >
            <Type className="w-3 h-3 text-blue-400" />
            <span>Texto</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('badge')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors"
            title="Inserir selo ou badge metrológico"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Selo / Badge</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('image')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors"
            title="Inserir foto ou logo secundário"
          >
            <ImageIcon className="w-3 h-3 text-emerald-400" />
            <span>Foto / Logo</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('line')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors"
            title="Inserir linha técnica horizontal"
          >
            <Minus className="w-3 h-3 text-blue-400" />
            <span>Linha</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddLayer('shape')}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-blue-600 text-[10px] font-bold rounded-none border border-slate-700 transition-colors"
            title="Inserir moldura ou caixa de destaque"
          >
            <Square className="w-3 h-3 text-purple-400" />
            <span>Moldura</span>
          </button>
        </div>
      )}

      {/* 3. Renderização de Cada Camada / Layer no Canvas */}
      {layers
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
              {/* Handle de Drag & Drop */}
              <div
                onMouseDown={(e) => handleStartDrag(layer.id, layer.x, layer.y, e)}
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
                  className="hover:text-blue-300 ml-1"
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
                  className="hover:text-red-400 ml-0.5"
                  title="Excluir elemento"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* RENDER POR TIPO */}
              {layer.type === 'text' && (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleUpdateLayer(layer.id, { content: e.currentTarget.innerText.trim() })}
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
                    letterSpacing: layer.letterSpacing === 'widest' ? '0.2em' : layer.letterSpacing === 'wide' ? '0.1em' : 'normal',
                    textTransform: layer.textTransform || 'none'
                  }}
                  className="outline-none focus:bg-white/10 px-1 py-0.5 cursor-text leading-tight whitespace-pre-wrap min-w-[60px]"
                >
                  {layer.content || 'Digite o texto...'}
                </div>
              )}

              {layer.type === 'badge' && (
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => handleUpdateLayer(layer.id, { content: e.currentTarget.innerText.trim() })}
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
                <div
                  style={{
                    width: `${layer.width || 200}px`,
                    height: `${layer.height || 140}px`
                  }}
                  className="overflow-hidden bg-slate-900 border border-slate-700 relative group/img"
                >
                  <img
                    src={layer.imageUrl}
                    alt={layer.label}
                    className="w-full h-full object-contain"
                  />
                </div>
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
