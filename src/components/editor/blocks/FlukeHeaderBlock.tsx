// src/components/editor/blocks/FlukeHeaderBlock.tsx
// Header Metrológico Industrial canônico (CORE.E6A).
// Suporta isExport, elimina ghost data/fallbacks fictícios e canvas editing.

import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';
import { resolvePrimaryImageSource } from '../../../domain/primary-image.engine';

interface FlukeHeaderBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const FlukeHeaderBlock: React.FC<FlukeHeaderBlockProps> = ({
  block,
  pageId: _pageId,
  isSelected,
  isExport = false
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const custom = block.customData || {};
  const imageSource = resolvePrimaryImageSource(block);
  const displayUrl = useResolvedAssetUrl(
    imageSource.kind === 'asset' ? imageSource.assetId : undefined,
    imageSource.kind === 'url' ? imageSource.url : undefined
  );

  // Somente itens cadastrados e não vazios são válidos para exibição documental
  const rawHighlights = Array.isArray(custom.highlights) ? custom.highlights : [];
  const highlights = rawHighlights.filter(
    (h): h is string => typeof h === 'string' && h.trim().length > 0
  );

  const badgeBg = custom.badgeBg || '#003366';
  const hasBadgeText = typeof block.badgeText === 'string' && block.badgeText.trim().length > 0;
  const hasBadgeSec = typeof custom.badgeSecondary === 'string' && custom.badgeSecondary.trim().length > 0;
  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;
  const hasSubtitle = typeof block.subtitle === 'string' && block.subtitle.trim().length > 0;
  const hasDescription = typeof custom.description === 'string' && custom.description.trim().length > 0;

  // Em modo exportação, se o bloco estiver completamente vazio de textos, preserva layout limpo
  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3 bg-white rounded-none border border-slate-300 transition-all ${
        !isExport && isSelected ? 'ring-2 ring-blue-600' : ''
      } ${!isExport ? 'hover:border-slate-400' : ''}`}
    >
      {/* Barra de Topo: Título + Badge de Metrologia */}
      <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900 mb-3 gap-3">
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            {hasTitle ? (
              <h1
                data-printable-field="title"
                className="text-xl font-black text-slate-900 tracking-tight leading-tight"
              >
                {block.title}
              </h1>
            ) : !isExport ? (
              <h1 className="text-xl font-black text-slate-400 italic tracking-tight leading-tight no-print">
                Título do Header Metrológico...
              </h1>
            ) : null}

            {hasSubtitle ? (
              <span
                data-printable-field="subtitle"
                className="text-sm font-bold text-slate-600"
              >
                {block.subtitle}
              </span>
            ) : !isExport && hasTitle ? (
              <span className="text-sm font-bold text-slate-400 italic no-print">
                Subtítulo opcional...
              </span>
            ) : null}
          </div>
        </div>

        {/* Badge Metrológico Duplo com fundo customizável */}
        {(hasBadgeText || hasBadgeSec || !isExport) && (
          <div
            style={{ backgroundColor: badgeBg }}
            className="px-2.5 py-1 text-white text-right rounded-none border border-slate-900 shrink-0 select-none"
          >
            {hasBadgeText ? (
              <span
                data-printable-field="badgeText"
                className="font-mono font-bold text-xs tracking-wider block leading-none uppercase"
              >
                {block.badgeText}
              </span>
            ) : !isExport ? (
              <span className="font-mono font-bold text-xs tracking-wider block leading-none uppercase text-white/50 no-print">
                PRESYS
              </span>
            ) : null}

            {hasBadgeSec ? (
              <span
                data-printable-field="badgeSecondary"
                className="text-[9px] block opacity-90 leading-tight mt-0.5"
              >
                {custom.badgeSecondary}
              </span>
            ) : !isExport && hasBadgeText ? (
              <span className="text-[9px] block opacity-50 leading-tight mt-0.5 no-print">
                Calibration
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Grid Principal do Bloco */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* Coluna Esquerda: Imagem e Descrição */}
        <div className="md:col-span-7 space-y-2 flex flex-col justify-between">
          {displayUrl ? (
            <div className="border border-slate-200 bg-slate-50 p-2 flex items-center justify-center min-h-[140px] max-h-[180px] overflow-hidden">
              <img
                src={displayUrl}
                alt={block.title || 'Foto do Instrumento'}
                className="max-h-[160px] w-auto object-contain"
              />
            </div>
          ) : !isExport ? (
            <div className="border-2 border-dashed border-slate-300 bg-slate-50 p-4 rounded-none flex flex-col items-center justify-center min-h-[140px] no-print">
              <span className="text-xs font-bold text-slate-500">Nenhuma imagem frontal vinculada</span>
              <span className="text-[10px] text-slate-400">Configure no painel lateral de propriedades</span>
            </div>
          ) : null}

          {hasDescription ? (
            <p
              data-printable-field="description"
              className="text-[11px] text-slate-700 leading-normal"
            >
              {custom.description}
            </p>
          ) : !isExport ? (
            <p className="text-[11px] text-slate-400 italic leading-normal no-print">
              Descrição técnica do instrumento (configure no painel lateral)...
            </p>
          ) : null}
        </div>

        {/* Coluna Direita: Box de Destaques Técnicos */}
        {(highlights.length > 0 || !isExport) && (
          <div className="md:col-span-5 p-2.5 rounded-none border border-slate-200 bg-slate-50 flex flex-col justify-between space-y-1.5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5">
                <span data-print-string-key="features_overview" className="font-bold text-[10px] text-slate-900 uppercase tracking-wider font-mono">
                  Destaques Metrológicos
                </span>
              </div>

              {highlights.length > 0 ? (
                <ul className="space-y-1 text-[10px] text-slate-800">
                  {highlights.map((h, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-[#003366] font-bold shrink-0 mt-0.5 select-none">■</span>
                      <span
                        data-printable-field={`hl_${idx}`}
                        className="flex-1 leading-snug"
                      >
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : !isExport ? (
                <p className="text-[9px] text-slate-400 italic py-1 no-print">
                  Nenhum destaque cadastrado
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
