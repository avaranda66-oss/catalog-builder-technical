import React from 'react';
import { CheckCircle2, Plus, Trash2, Image } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useMediaStore } from '../../../stores/useMediaStore';

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
  const { openGallery } = useMediaStore();

  const custom = block.customData || {};
  const coverStyle = custom.coverStyle || 'photo_hero'; // 'photo_hero' | 'editorial_cards'
  const overlayOpacity = custom.overlayOpacity ?? 45; // 0 a 100%
  const textAlign = custom.textAlign || 'left'; // 'left' | 'center'
  const showAccentLine = custom.showAccentLine ?? true;
  const showLogoBox = custom.showLogoBox ?? true;

  const highlights = custom.highlights || [
    { label: 'Exatidão Metrológica', value: 'até 0.01% FE', icon: 'ShieldCheck' },
    { label: 'Geração Autônoma', value: '-0.9 a 70 bar', icon: 'Activity' },
    { label: 'Comunicação Digital', value: 'HART 7 & Modbus', icon: 'Zap' },
    { label: 'Interface Touchscreen', value: 'Colorida 5.7"', icon: 'Cpu' }
  ];

  const gradientClass =
    block.style?.gradient ||
    custom.gradient ||
    'bg-gradient-to-b from-slate-900 via-[#001f3f] to-slate-950';

  const defaultPhotoUrl =
    block.imageUrl ||
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1400&q=85';

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

  const handleHighlightChange = (index: number, field: 'value' | 'label', text: string) => {
    const updated = [...highlights];
    updated[index] = { ...updated[index], [field]: text.trim() };
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: updated }
    });
  };

  const handleAddHighlight = () => {
    const newHighlight = {
      label: 'Novo Destaque Metrológico',
      value: 'Configurável',
      icon: 'CheckCircle2'
    };
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: [...highlights, newHighlight] }
    });
  };

  const handleRemoveHighlight = (idx: number) => {
    if (highlights.length <= 1) return;
    const updated = highlights.filter((_: any, i: number) => i !== idx);
    updateBlock(pageId, block.id, {
      customData: { ...custom, highlights: updated }
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
      {/* MODO 1: CAPA FOTOGRÁFICA FULL-BLEED (ESTILO PSV PORTABLE)                 */}
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
            {/* Gradiente Superior para Leitura do Logo/Título */}
            <div
              className="absolute inset-0 bg-gradient-to-b from-slate-950 via-transparent to-slate-950/80 pointer-events-none"
              style={{ opacity: overlayOpacity / 100 }}
            />
            {/* Vinheta Escura Lateral */}
            <div className="absolute inset-0 bg-radial from-transparent via-black/20 to-black/60 pointer-events-none" />
          </div>

          {/* Barra de Ações Rápidas de Capa (Modo Canva) */}
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

          {/* Topo: Logotipo e Identidade Técnica */}
          <div className="relative z-10 p-10 pb-4 flex items-start justify-between">
            {showLogoBox && (
              <div className="border border-white/30 backdrop-blur-xs px-4 py-2 rounded-lg bg-black/20 inline-block">
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handleBrandNameBlur}
                  className="font-black text-xl tracking-wider text-white block font-sans outline-none focus:bg-white/20 rounded px-1 -ml-1 cursor-text"
                >
                  {custom.brandName || 'PRESYS'}
                </span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handleBrandSubtitleBlur}
                  className="text-[9px] uppercase font-mono tracking-widest text-slate-300 block outline-none focus:bg-white/20 rounded px-1 -ml-1 cursor-text"
                >
                  {custom.brandSubtitle || 'INSTRUMENTOS & SISTEMAS'}
                </span>
              </div>
            )}

            {block.badgeText && (
              <span
                contentEditable
                suppressContentEditableWarning
                onBlur={handleBadgeBlur}
                className="px-3 py-1 bg-black/40 backdrop-blur-md border border-white/20 rounded-full text-[10px] font-mono font-bold tracking-wider text-blue-300 uppercase outline-none focus:bg-white/20 cursor-text"
              >
                {block.badgeText}
              </span>
            )}
          </div>

          {/* Bloco de Título Principal e Acento Visual (Estilo PSV Portable) */}
          <div
            className={`relative z-10 px-10 my-auto py-8 space-y-3 ${
              textAlign === 'center' ? 'text-center max-w-2xl mx-auto' : 'text-left max-w-xl'
            }`}
          >
            <h1
              contentEditable
              suppressContentEditableWarning
              onBlur={handleTitleBlur}
              className="text-4xl sm:text-5xl font-black tracking-tight text-white uppercase outline-none focus:bg-white/20 rounded px-2 leading-none cursor-text drop-shadow-md font-sans"
            >
              {block.title || 'PSV PORTABLE'}
            </h1>

            <p
              contentEditable
              suppressContentEditableWarning
              onBlur={handleSubtitleBlur}
              className="text-lg sm:text-xl text-slate-200 font-normal outline-none focus:bg-white/20 rounded px-2 cursor-text drop-shadow font-sans"
            >
              {block.subtitle || 'Portable Safety Valve Test Station'}
            </p>

            {showAccentLine && (
              <div
                className={`h-1 w-20 bg-blue-500 rounded-full shadow-lg ${
                  textAlign === 'center' ? 'mx-auto' : ''
                }`}
              />
            )}

            {custom.overview && (
              <p
                contentEditable
                suppressContentEditableWarning
                onBlur={handleOverviewBlur}
                className="text-xs text-slate-300 pt-2 leading-relaxed max-w-lg outline-none focus:bg-white/20 rounded p-1 cursor-text font-sans bg-black/30 backdrop-blur-xs rounded-lg p-3 border border-white/10"
              >
                {custom.overview}
              </p>
            )}
          </div>

          {/* Rodapé Minimalista Integrado */}
          <div className="relative z-10 p-10 pt-4 border-t border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-between text-[10px] text-slate-300 font-mono">
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
      {/* MODO 2: CAPA EDITORIAL COM CARDS (ESTILO PCON-Y18)                        */}
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
                    handleAddHighlight();
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
                        handleRemoveHighlight(idx);
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
                      onBlur={(e) => handleHighlightChange(idx, 'value', e.currentTarget.innerText)}
                      className="text-[11px] font-bold text-white font-mono outline-none focus:bg-white/20 rounded px-1 cursor-text"
                    >
                      {h.value}
                    </span>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => handleHighlightChange(idx, 'label', e.currentTarget.innerText)}
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
