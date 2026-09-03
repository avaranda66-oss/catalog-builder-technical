// src/components/editor/blocks/AdditelTwoColBlock.tsx
// Header Dual-Column Presys canônico (CORE.E6A).
// Suporta isExport, elimina ghost data/fallbacks fictícios e canvas editing.

import React from 'react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import { useResolvedAssetUrl } from '../../../hooks/useResolvedAssetUrl';
import { resolvePrimaryImageSource } from '../../../domain/primary-image.engine';

interface AdditelTwoColBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const AdditelTwoColBlock: React.FC<AdditelTwoColBlockProps> = ({
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

  // Leitura com prioridade canônica bullets > bulletList legacy
  const rawBullets = Array.isArray(custom.bullets)
    ? custom.bullets
    : Array.isArray(custom.bulletList)
    ? custom.bulletList
    : [];
  const bullets = rawBullets.filter(
    (b): b is string => typeof b === 'string' && b.trim().length > 0
  );

  const themeColor = custom.themeColor || '#003366';
  const hasBadgeText = typeof block.badgeText === 'string' && block.badgeText.trim().length > 0;
  const hasBadgeSubtitle = typeof custom.badgeSubtitle === 'string' && custom.badgeSubtitle.trim().length > 0;
  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;
  const hasSubtitle = typeof block.subtitle === 'string' && block.subtitle.trim().length > 0;
  const hasOverview = typeof custom.overview === 'string' && custom.overview.trim().length > 0;

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
      {/* Header Estilo Metrologia */}
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
                Título do Header Dual-Column...
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
                Subtítulo do instrumento...
              </span>
            ) : null}
          </div>
        </div>

        {/* Badge Lateral Temático */}
        {(hasBadgeText || hasBadgeSubtitle || !isExport) && (
          <div
            style={{ backgroundColor: themeColor }}
            className="px-3 py-1 text-white text-right rounded-none border border-slate-900 shrink-0 select-none"
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

            {hasBadgeSubtitle ? (
              <span
                data-printable-field="badgeSubtitle"
                className="text-[8px] font-mono text-blue-200 block uppercase tracking-widest mt-0.5"
              >
                {custom.badgeSubtitle}
              </span>
            ) : !isExport && hasBadgeText ? (
              <span className="text-[8px] font-mono text-blue-200/50 block uppercase tracking-widest mt-0.5 no-print">
                Precision Metrology
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Grid 2 Colunas */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
        {/* Coluna Esquerda: Imagem e Visão Geral */}
        <div className="md:col-span-6 space-y-2 flex flex-col justify-between">
          <div className="w-full h-44 rounded-none overflow-hidden bg-slate-900 border border-slate-300 flex items-center justify-center p-2 relative">
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={block.title || 'Produto Metrológico'}
                className="max-h-full max-w-full object-contain"
              />
            ) : !isExport ? (
              <div className="text-slate-400 text-xs font-sans flex flex-col items-center gap-1 text-center p-2 no-print">
                <span className="font-semibold">Nenhuma fotografia vinculada</span>
                <span className="text-[10px] text-slate-500">Adicione no painel de propriedades</span>
              </div>
            ) : null}
          </div>

          {hasOverview ? (
            <p
              data-printable-field="overview"
              className="text-[11px] text-slate-700 leading-normal"
            >
              {custom.overview}
            </p>
          ) : !isExport ? (
            <p className="text-[11px] text-slate-400 italic leading-normal no-print">
              Visão geral do produto (configure no painel lateral)...
            </p>
          ) : null}
        </div>

        {/* Coluna Direita: Lista de Recursos Técnicos */}
        {(bullets.length > 0 || !isExport) && (
          <div className="md:col-span-6 p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1.5">
            <div>
              <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1.5">
                <span data-print-string-key="features_overview" className="font-bold text-[10px] text-slate-900 uppercase tracking-wider font-mono">
                  Recursos Técnicos de Destaque
                </span>
              </div>

              {bullets.length > 0 ? (
                <ul className="space-y-1 text-[10px] text-slate-800">
                  {bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-[#003366] font-bold shrink-0 mt-0.5 select-none">■</span>
                      <span
                        data-printable-field={`bullet_${idx}`}
                        className="flex-1 leading-snug"
                      >
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : !isExport ? (
                <p className="text-[9px] text-slate-400 italic py-1 no-print">
                  Nenhum recurso técnico cadastrado
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
