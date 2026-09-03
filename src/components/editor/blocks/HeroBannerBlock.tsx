// src/components/editor/blocks/HeroBannerBlock.tsx
// Bloco Hero Banner Corporativo (CORE.E5B / CORE.E5B.1).
// Canvas = representação visual segura + seleção.
// Inspector = autoridade única de edição.
// Zero contentEditable, zero inline upload, zero fake defaults impressos no PDF.
// Contraste de cores/foreground derivado semanticamente da paleta ativa (CORE.E5B.1).

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';
import { resolvePrimaryImageSource } from '../../../domain/primary-image.engine';
import {
  resolveHeroPaletteClass,
  resolveHeroForegroundTone
} from '../../../domain/hero-banner.appearance';

interface HeroBannerBlockProps {
  block: ContentBlock;
  pageId?: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const HeroBannerBlock: React.FC<HeroBannerBlockProps> = ({
  block,
  isSelected,
  isExport
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const gradientClass = resolveHeroPaletteClass(block);
  const foregroundTone = resolveHeroForegroundTone(block);
  const isDarkTone = foregroundTone === 'dark';

  const source = resolvePrimaryImageSource(block);
  const assetId = source.kind === 'asset' ? source.assetId : undefined;
  const fallbackUrl = source.kind === 'url' ? source.url : undefined;
  const displayUrl = useResolvedAssetUrl(assetId, fallbackUrl);

  const hasBadge = typeof block.badgeText === 'string' && Boolean(block.badgeText.trim());
  const hasTitle = typeof block.title === 'string' && Boolean(block.title.trim());
  const hasSubtitle = typeof block.subtitle === 'string' && Boolean(block.subtitle.trim());
  const hasCaption = typeof block.imageCaption === 'string' && Boolean(block.imageCaption.trim());

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-5 rounded-none ${
        isDarkTone ? 'text-slate-900' : 'text-white'
      } ${gradientClass} transition-all ${
        isSelected && !isExport
          ? 'ring-2 ring-blue-500'
          : isExport
          ? 'shadow-none'
          : 'cursor-pointer hover:ring-1 hover:ring-slate-400'
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        <div className="md:col-span-8 space-y-2">
          {/* 1. BADGE */}
          {hasBadge && (
            <span
              data-printable-field="badgeText"
              className={`inline-block px-2.5 py-0.5 ${
                isDarkTone ? 'bg-blue-900 text-white' : 'bg-blue-600/80 text-white'
              } text-[10px] font-bold tracking-wider uppercase rounded-none select-none`}
            >
              {block.badgeText}
            </span>
          )}

          {/* 2. TÍTULO */}
          {hasTitle ? (
            <h2
              data-printable-field="title"
              className={`text-lg font-black tracking-tight leading-tight rounded-none ${
                isDarkTone ? 'text-slate-950' : 'text-white'
              }`}
            >
              {block.title}
            </h2>
          ) : !isExport ? (
            <h2
              className={`text-lg font-black tracking-tight leading-tight rounded-none italic select-none no-print ${
                isDarkTone ? 'text-slate-700/70' : 'text-slate-400'
              }`}
            >
              Título do Hero Banner...
            </h2>
          ) : null}

          {/* 3. SUBTÍTULO */}
          {hasSubtitle ? (
            <p
              data-printable-field="subtitle"
              className={`text-xs font-normal leading-relaxed rounded-none ${
                isDarkTone ? 'text-slate-900' : 'text-slate-300'
              }`}
            >
              {block.subtitle}
            </p>
          ) : !isExport ? (
            <p
              className={`text-xs italic leading-relaxed select-none no-print ${
                isDarkTone ? 'text-slate-700/60' : 'text-slate-500'
              }`}
            >
              Descrição dos diferenciais e aplicações...
            </p>
          ) : null}
        </div>

        {/* 4. MÍDIA & LEGENDA */}
        <div className="md:col-span-4 flex flex-col items-center justify-center">
          {displayUrl ? (
            <div
              className={`w-full h-32 rounded-none overflow-hidden flex items-center justify-center p-2 ${
                isDarkTone
                  ? 'bg-black/5 border border-black/15'
                  : 'bg-slate-900/60 border border-slate-700/60'
              }`}
            >
              <img
                src={displayUrl}
                alt={block.title || 'Foto de Destaque'}
                className="max-h-full max-w-full object-contain filter drop-shadow"
              />
            </div>
          ) : !isExport ? (
            <div
              className={`w-full h-32 rounded-none overflow-hidden flex flex-col items-center justify-center p-2 text-[10px] font-sans gap-1 text-center select-none no-print ${
                isDarkTone
                  ? 'bg-black/10 border border-black/15 text-slate-800'
                  : 'bg-slate-900/60 border border-slate-700/60 text-slate-500'
              }`}
            >
              <ImageIcon className={`w-5 h-5 ${isDarkTone ? 'text-slate-800' : 'text-slate-600'}`} />
              <span>Defina a fotografia no painel lateral</span>
            </div>
          ) : null}

          {/* 5. LEGENDA TÉCNICA */}
          {hasCaption && (
            <p
              data-printable-field="imageCaption"
              className={`text-[10px] italic mt-1 text-center px-1 rounded-none font-sans ${
                isDarkTone ? 'text-slate-800' : 'text-slate-400'
              }`}
            >
              {block.imageCaption}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
