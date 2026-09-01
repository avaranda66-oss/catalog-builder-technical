import React, { useRef, useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Plus, Trash2, Image, Move } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useMediaStore } from '../../../stores/useMediaStore';

interface FullPageCoverBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
}

export interface ElementPositionConfig {
  x: number; // Percentual 0 a 100% da largura A4
  y: number; // Percentual 0 a 100% da altura A4
  size?: number; // Tamanho da fonte em px
  color?: string; // Cor do texto
  visible?: boolean; // Visibilidade
  width?: number; // Largura em px (para linha)
}

export const FullPageCoverBlock: React.FC<FullPageCoverBlockProps> = ({
  block,
  pageId,
  isSelected
}) => {
  const { updateBlock, setSelectedBlockId } = useCatalogStore();
  const { openGallery } = useMediaStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const custom = block.customData || {};
  const coverStyle = custom.coverStyle || 'photo_hero'; // 'photo_hero' | 'editorial_cards'
  const isFreeform = custom.isFreeformMode ?? true; // Modo Canva ativado por padrão
  const overlayOpacity = custom.overlayOpacity ?? 45; // 0 a 100%

  const highlights = custom.highlights || [
    { label: 'Exatidão Metrológica', value: 'até 0.01% FE', icon: 'ShieldCheck' },
    { label: 'Geração Autônoma', value: '-0.9 a 70 bar', icon: 'Activity' },
    { label: 'Comunicação Digital', value: 'HART 7 & Modbus', icon: 'Zap' },
    { label: 'Interface Touchscreen', value: 'Colorida 5.7"', icon: 'Cpu' }
  ];

  // Configurações de posicionamento e escala dos elementos
  const logoConfig: ElementPositionConfig = custom.logoConfig || { x: 5, y: 3.5, size: 22, visible: true };
  const badgeConfig: ElementPositionConfig = custom.badgeConfig || { x: 62, y: 3.8, size: 10, visible: true };
  const titleConfig: ElementPositionConfig = custom.titleConfig || { x: 5, y: 22, size: 42, visible: true };
  const subtitleConfig: ElementPositionConfig = custom.subtitleConfig || { x: 5, y: 29, size: 16, visible: true };
  const accentLineConfig: ElementPositionConfig = custom.accentLineConfig || { x: 5, y: 33, width: 80, visible: true };
  const overviewConfig: ElementPositionConfig = custom.overviewConfig || { x: 5, y: 36, size: 12, visible: true };

  const defaultPhotoUrl =
    block.imageUrl ||
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85';

  const gradientClass =
    block.style?.gradient ||
    custom.gradient ||
    'bg-gradient-to-b from-slate-900 via-[#001f3f] to-slate-950';

  // Estado de Drag & Drop interativo
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const handleStartDrag = (key: string, currentX: number, currentY: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingKey(key);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: currentX,
      startY: currentY
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingKey || !dragStartRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPixels = e.clientX - dragStartRef.current.mouseX;
    const deltaYPixels = e.clientY - dragStartRef.current.mouseY;

    const deltaXPercent = (deltaXPixels / rect.width) * 100;
    const deltaYPercent = (deltaYPixels / rect.height) * 100;

    let newX = Math.max(0, Math.min(90, dragStartRef.current.startX + deltaXPercent));
    let newY = Math.max(0, Math.min(95, dragStartRef.current.startY + deltaYPercent));

    const configKey = `${draggingKey}Config`;
    const prevConfig = custom[configKey] || {};

    updateBlock(pageId, block.id, {
      customData: {
        ...custom,
        [configKey]: {
          ...prevConfig,
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10
        }
      }
    });
  }, [draggingKey, custom, pageId, block.id, updateBlock]);

  const handleMouseUp = useCallback(() => {
    if (draggingKey) {
      setDraggingKey(null);
      dragStartRef.current = null;
    }
  }, [draggingKey]);

  useEffect(() => {
    if (draggingKey) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingKey, handleMouseMove, handleMouseUp]);

  // Edições inline de texto
  const handleTitleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    updateBlock(pageId, block.id, { title: e.currentTarget.innerText.trim() });
  };

  const handleSubtitleBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, { subtitle: e.currentTarget.innerText.trim() });
  };

  const handleBadgeBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, { badgeText: e.currentTarget.innerText.trim() });
  };

  const handleBrandNameBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, brandName: e.currentTarget.innerText.trim() }
    });
  };

  const handleBrandSubtitleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, brandSubtitle: e.currentTarget.innerText.trim() }
    });
  };

  const handleOverviewBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, overview: e.currentTarget.innerText.trim() }
    });
  };

  const handleFooterLeftBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, footerLeft: e.currentTarget.innerText.trim() }
    });
  };

  const handleFooterRightBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    updateBlock(pageId, block.id, {
      customData: { ...custom, footerRight: e.currentTarget.innerText.trim() }
    });
  };

  const handleOpenMediaGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    openGallery((selectedUrl) => {
      updateBlock(pageId, block.id, { imageUrl: selectedUrl });
    });
  };

  return (
    <div
      ref={containerRef}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative w-[794px] h-[1123px] min-h-[1123px] text-white shadow-2xl flex flex-col justify-between overflow-hidden select-none transition-all ${
        isSelected ? 'ring-4 ring-blue-500 shadow-2xl' : 'hover:ring-2 hover:ring-slate-400/60'
      } ${coverStyle === 'editorial_cards' ? gradientClass : 'bg-slate-950'}`}
      style={{ boxSizing: 'border-box' }}
    >
      {/* ========================================================================= */}
      {/* MODO 1: CAPA FOTOGRÁFICA FULL-BLEED (COM POSICIONAMENTO LIVRE CANVA)       */}
      {/* ========================================================================= */}
      {coverStyle === 'photo_hero' && (
        <>
          {/* Fotografia de Fundo Cobrindo 100% da Folha A4 */}
          <div className="absolute inset-0 z-0 overflow-hidden bg-slate-950">
            <img
              src={defaultPhotoUrl}
              alt="Capa do Catálogo"
              className="w-full h-full object-cover object-center filter brightness-95"
            />
            {/* Gradiente Superior/Inferior configurável */}
            <div
              className="absolute inset-0 bg-gradient-to-b from-slate-950 via-transparent to-slate-950/80 pointer-events-none"
              style={{ opacity: overlayOpacity / 100 }}
            />
            <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/60 pointer-events-none" />
          </div>

          {/* Barra Flutuante de Ações Rápidas de Capa */}
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2 opacity-0 hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleOpenMediaGallery}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-[#003366] text-white text-xs font-bold rounded-lg backdrop-blur-md border border-white/20 shadow-xl transition-colors"
            >
              <Image className="w-3.5 h-3.5" />
              <span>Trocar Foto de Fundo</span>
            </button>
          </div>

          {/* ===================================================================== */}
          {/* CAMADAS LIVRES DE TEXTO E ELEMENTOS (MODO CANVA)                      */}
          {/* ===================================================================== */}

          {/* 1. Logotipo / Marca */}
          {logoConfig.visible !== false && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('logo', logoConfig.x, logoConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${logoConfig.y}%`,
                left: `${logoConfig.x}%`,
                zIndex: 20
              }}
              className={`group border border-white/30 backdrop-blur-xs px-3.5 py-1.5 rounded-lg bg-black/30 inline-block transition-shadow ${
                isSelected && isFreeform ? 'cursor-move hover:ring-2 hover:ring-blue-400' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isSelected && isFreeform && (
                  <Move className="w-3 h-3 text-blue-300 opacity-60 group-hover:opacity-100 pointer-events-none" />
                )}
                <div>
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleBrandNameBlur}
                    style={{ fontSize: `${logoConfig.size || 22}px` }}
                    className="font-black tracking-wider text-white block font-sans outline-none focus:bg-white/20 rounded px-1 -ml-1 cursor-text leading-none"
                  >
                    {custom.brandName || 'PRESYS'}
                  </span>
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleBrandSubtitleBlur}
                    className="text-[9px] uppercase font-mono tracking-widest text-slate-300 block outline-none focus:bg-white/20 rounded px-1 -ml-1 cursor-text mt-0.5"
                  >
                    {custom.brandSubtitle || 'INSTRUMENTOS & SISTEMAS'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Selo Metrológico / Badge */}
          {badgeConfig.visible !== false && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('badge', badgeConfig.x, badgeConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${badgeConfig.y}%`,
                left: `${badgeConfig.x}%`,
                zIndex: 20
              }}
              className={`group px-3 py-1 bg-black/40 backdrop-blur-md border border-white/20 rounded-full inline-flex items-center gap-1.5 ${
                isSelected && isFreeform ? 'cursor-move hover:ring-2 hover:ring-blue-400' : ''
              }`}
            >
              {isSelected && isFreeform && (
                <Move className="w-3 h-3 text-blue-300 opacity-60 group-hover:opacity-100 pointer-events-none" />
              )}
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBadgeBlur}
                style={{ fontSize: `${badgeConfig.size || 10}px` }}
                className="font-mono font-bold tracking-wider text-blue-300 uppercase outline-none focus:bg-white/20 cursor-text"
              >
                {block.badgeText || 'PRESYS · METROLOGIA & SEGURANÇA OPERACIONAL'}
              </span>
            </div>
          )}

          {/* 3. Título Comercial Principal */}
          {titleConfig.visible !== false && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('title', titleConfig.x, titleConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${titleConfig.y}%`,
                left: `${titleConfig.x}%`,
                zIndex: 20,
                maxWidth: '650px'
              }}
              className={`group p-1.5 rounded-lg transition-all ${
                isSelected && isFreeform ? 'cursor-move hover:ring-2 hover:ring-blue-400 hover:bg-black/30' : ''
              }`}
            >
              <div className="flex items-start gap-1">
                {isSelected && isFreeform && (
                  <Move className="w-4 h-4 text-blue-300 opacity-60 group-hover:opacity-100 mt-1 shrink-0 pointer-events-none" />
                )}
                <h1
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handleTitleBlur}
                  style={{
                    fontSize: `${titleConfig.size || 42}px`,
                    color: titleConfig.color || '#ffffff'
                  }}
                  className="font-black tracking-tight uppercase outline-none focus:bg-white/20 rounded px-1 leading-none cursor-text drop-shadow-md font-sans"
                >
                  {block.title || 'PSV PORTABLE'}
                </h1>
              </div>
            </div>
          )}

          {/* 4. Subtítulo Técnico */}
          {subtitleConfig.visible !== false && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('subtitle', subtitleConfig.x, subtitleConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${subtitleConfig.y}%`,
                left: `${subtitleConfig.x}%`,
                zIndex: 20,
                maxWidth: '600px'
              }}
              className={`group p-1 rounded-lg transition-all ${
                isSelected && isFreeform ? 'cursor-move hover:ring-2 hover:ring-blue-400 hover:bg-black/30' : ''
              }`}
            >
              <div className="flex items-start gap-1">
                {isSelected && isFreeform && (
                  <Move className="w-3.5 h-3.5 text-blue-300 opacity-60 group-hover:opacity-100 mt-0.5 shrink-0 pointer-events-none" />
                )}
                <p
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handleSubtitleBlur}
                  style={{
                    fontSize: `${subtitleConfig.size || 16}px`,
                    color: subtitleConfig.color || '#e2e8f0'
                  }}
                  className="font-normal outline-none focus:bg-white/20 rounded px-1 cursor-text drop-shadow font-sans"
                >
                  {block.subtitle || 'Portable Safety Valve Test Station'}
                </p>
              </div>
            </div>
          )}

          {/* 5. Linha de Acento Azul */}
          {accentLineConfig.visible !== false && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('accentLine', accentLineConfig.x, accentLineConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${accentLineConfig.y}%`,
                left: `${accentLineConfig.x}%`,
                width: `${accentLineConfig.width || 80}px`,
                zIndex: 20
              }}
              className={`group py-1 cursor-move ${
                isSelected && isFreeform ? 'hover:ring-2 hover:ring-blue-400' : ''
              }`}
            >
              <div className="h-1 w-full bg-blue-500 rounded-full shadow-lg" />
            </div>
          )}

          {/* 6. Visão Geral / Descrição da Capa */}
          {overviewConfig.visible !== false && custom.overview && (
            <div
              onMouseDown={(e) => isFreeform && handleStartDrag('overview', overviewConfig.x, overviewConfig.y, e)}
              style={{
                position: 'absolute',
                top: `${overviewConfig.y}%`,
                left: `${overviewConfig.x}%`,
                zIndex: 20,
                maxWidth: '480px'
              }}
              className={`group p-2.5 rounded-lg bg-black/40 backdrop-blur-xs border border-white/10 transition-all ${
                isSelected && isFreeform ? 'cursor-move hover:ring-2 hover:ring-blue-400' : ''
              }`}
            >
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={handleOverviewBlur}
                style={{ fontSize: `${overviewConfig.size || 12}px` }}
                className="text-slate-300 leading-relaxed outline-none focus:bg-white/20 rounded p-1 cursor-text font-sans"
              >
                {custom.overview}
              </p>
            </div>
          )}

          {/* Rodapé Integrado */}
          <div className="relative z-10 p-8 pt-4 border-t border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-between text-[10px] text-slate-300 font-mono mt-auto">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleFooterLeftBlur}
              className="outline-none focus:bg-white/20 rounded px-1 cursor-text"
            >
              {custom.footerLeft || 'www.presys.com.br · vendas@presys.com.br'}
            </span>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleFooterRightBlur}
              className="outline-none focus:bg-white/20 rounded px-1 cursor-text"
            >
              {custom.footerRight || 'PRESYS METROLOGY & PROCESS AUTOMATION'}
            </span>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODO 2: CAPA EDITORIAL COM CARDS (PCON-Y18)                               */}
      {/* ========================================================================= */}
      {coverStyle === 'editorial_cards' && (
        <div className="p-8 h-full flex flex-col justify-between relative z-10">
          {/* Topo */}
          <div className="flex items-center justify-between border-b border-white/20 pb-4">
            <div>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBrandNameBlur}
                className="font-extrabold text-2xl tracking-tight text-white block font-sans outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text"
              >
                {custom.brandName || 'PRESYS'}
              </span>
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBrandSubtitleBlur}
                className="text-[10px] uppercase font-mono tracking-widest text-slate-300 block outline-none focus:bg-white/10 rounded px-1 -ml-1 cursor-text"
              >
                {custom.brandSubtitle || 'Instrumentos & Sistemas de Precisão'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenMediaGallery}
                className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-white/20"
              >
                <Image className="w-3 h-3" />
                <span>Galeria de Fotos</span>
              </button>

              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBadgeBlur}
                className="px-3 py-1 bg-white/10 backdrop-blur-xs border border-white/20 rounded-full text-[10px] font-mono font-bold tracking-wider text-blue-300 uppercase outline-none focus:bg-white/20 cursor-text"
              >
                {block.badgeText || 'CALIBRAÇÃO RBC · ISO/IEC 17025'}
              </span>
            </div>
          </div>

          {/* Corpo Principal */}
          <div className="my-auto py-4 space-y-5 text-center flex flex-col items-center">
            <div className="space-y-1.5 max-w-xl mx-auto">
              <h1
                contentEditable
                suppressContentEditableWarning
                onBlur={handleTitleBlur}
                className="text-3xl sm:text-4xl font-black tracking-tight text-white outline-none focus:bg-white/10 rounded px-2 leading-tight cursor-text"
              >
                {block.title || 'PCON-Y18-LP / SÉRIE CALIBRADORES DE PRESSÃO'}
              </h1>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={handleSubtitleBlur}
                className="text-xs sm:text-sm text-slate-300 font-medium outline-none focus:bg-white/10 rounded px-2 cursor-text"
              >
                {block.subtitle ||
                  'Calibrador Automático de Pressão de Alta Estabilidade para Laboratório e Campo'}
              </p>
            </div>

            {/* Imagem de Grande Formato */}
            <div className="w-full max-w-md h-64 rounded-2xl overflow-hidden bg-slate-800/80 border-2 border-white/20 shadow-2xl relative group flex items-center justify-center p-3">
              <img
                src={defaultPhotoUrl}
                alt="Produto de Capa"
                className="max-h-full max-w-full object-contain filter drop-shadow-2xl"
              />

              <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-3">
                <button
                  type="button"
                  onClick={handleOpenMediaGallery}
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>Escolher da Galeria</span>
                </button>
              </div>
            </div>

            {/* Cards de Destaque */}
            <div className="w-full max-w-2xl space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Destaques de Performance ({highlights.length})
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newHighlight = {
                      label: 'Novo Destaque Metrológico',
                      value: 'Configurável',
                      icon: 'CheckCircle2'
                    };
                    updateBlock(pageId, block.id, {
                      customData: { ...custom, highlights: [...highlights, newHighlight] }
                    });
                  }}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-300 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded border border-white/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Destaque</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {highlights.map((h: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs flex flex-col items-center text-center space-y-1 hover:bg-white/10 transition-colors relative group"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (highlights.length <= 1) return;
                        const updated = highlights.filter((_: any, i: number) => i !== idx);
                        updateBlock(pageId, block.id, {
                          customData: { ...custom, highlights: updated }
                        });
                      }}
                      className="absolute top-1 right-1 p-0.5 text-white/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const updated = [...highlights];
                        updated[idx] = { ...updated[idx], value: e.currentTarget.innerText.trim() };
                        updateBlock(pageId, block.id, { customData: { ...custom, highlights: updated } });
                      }}
                      className="text-[11px] font-bold text-white font-mono outline-none focus:bg-white/20 rounded px-1 cursor-text"
                    >
                      {h.value}
                    </span>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const updated = [...highlights];
                        updated[idx] = { ...updated[idx], label: e.currentTarget.innerText.trim() };
                        updateBlock(pageId, block.id, { customData: { ...custom, highlights: updated } });
                      }}
                      className="text-[9px] text-slate-400 leading-tight outline-none focus:bg-white/20 rounded px-1 cursor-text"
                    >
                      {h.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumo Executivo */}
            <div className="max-w-xl text-left bg-white/5 border border-white/10 rounded-xl p-3.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300 block mb-0.5">
                Visão Geral do Equipamento
              </span>
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={handleOverviewBlur}
                className="text-xs text-slate-300 leading-relaxed outline-none focus:bg-white/10 rounded p-1 cursor-text"
              >
                {custom.overview ||
                  'Projetado para atender as mais exigentes demandas metrológicas de calibração com bomba interna motorizada e controle em malha fechada.'}
              </p>
            </div>
          </div>

          {/* Rodapé */}
          <div className="border-t border-white/20 pt-3 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleFooterLeftBlur}
              className="outline-none focus:bg-white/10 rounded px-1 cursor-text"
            >
              {custom.footerLeft || 'www.presys.com.br · vendas@presys.com.br'}
            </span>
            <span
              contentEditable
              suppressContentEditableWarning
              onBlur={handleFooterRightBlur}
              className="outline-none focus:bg-white/10 rounded px-1 cursor-text"
            >
              {custom.footerRight || 'Fone: +55 (11) 3038-1300 · São Paulo - SP'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
