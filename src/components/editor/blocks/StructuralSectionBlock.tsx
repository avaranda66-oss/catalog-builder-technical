// src/components/editor/blocks/StructuralSectionBlock.tsx
// Renderer Estrutural Mínimo e Defensivo (Fase 3A.2 Contextual Inspector)
// Garante paridade bidirecional com RendererParityAuditor e consome deterministicamente todos os tokens de layout e card.

import React from 'react';
import { ContentBlock } from '@/domain/catalog.schema';
import { SPACING_MM_MAP } from '@/domain/canvas-layout.schema';
import { CorporateIcon, getCorporateIcon } from '@/components/icons';

interface StructuralSectionBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected?: boolean;
  selectedChildId?: string | null;
  onSelectSection?: () => void;
  onSelectCard?: (childId: string) => void;
  isExport?: boolean;
  previewWidthMm?: number;
}

export const StructuralSectionBlock: React.FC<StructuralSectionBlockProps> = ({
  block,
  isSelected = false,
  selectedChildId = null,
  onSelectSection,
  onSelectCard,
  isExport = false,
  previewWidthMm
}) => {
  const data = block.structuralData;
  const layout = data?.layout || {
    mode: 'grid',
    columns: 4,
    widthMode: 'fill',
    gap: 'sm',
    padding: 'md',
    density: 'normal',
    align: 'left',
    background: 'soft',
    border: 'subtle',
    radius: 'sm'
  };

  const children = data?.children || [];
  const columns = Math.min(Math.max(layout.columns || 4, 1), 6);
  const gapMm = SPACING_MM_MAP[layout.gap] ?? 3;
  const paddingMm = SPACING_MM_MAP[layout.padding] ?? 4;

  const sectionIconId = data?.iconId;
  const isSectionIconKnown = Boolean(getCorporateIcon(sectionIconId));
  const hasVisibleSectionIcon = isSectionIconKnown || (!isExport && Boolean(sectionIconId));

  const hasHeader = Boolean(
    block.title?.trim() ||
    block.badgeText?.trim() ||
    hasVisibleSectionIcon
  );

  // Mapeamento determinístico de Tokens de Background
  const bgMap = {
    transparent: 'transparent',
    surface: '#ffffff',
    soft: '#f8fafc',
    technical: '#f1f5f9'
  };

  // Mapeamento determinístico de Tokens de Borda
  const borderMap = {
    none: 'none',
    subtle: '1px solid #e2e8f0',
    solid: '1px solid #94a3b8',
    accent: '1.5px solid #003366'
  };

  // Mapeamento determinístico de Tokens de Raio
  const radiusMap = {
    none: '0px',
    sm: '3px',
    md: '6px',
    lg: '12px'
  };

  // Mapeamento de Densidade (Padding e Tipografia interna dos cards)
  const densityStyles = {
    compact: { cardPad: '6px', titleClass: 'text-[10px]', bodyClass: 'text-[8.5px]' },
    normal: { cardPad: '10px', titleClass: 'text-[11px]', bodyClass: 'text-[9.5px]' },
    comfortable: { cardPad: '14px', titleClass: 'text-[12px]', bodyClass: 'text-[10px]' }
  };
  const currentDensity = densityStyles[layout.density] || densityStyles.normal;

  // Alinhamento horizontal do bloco e textos
  const alignContainerClass =
    layout.align === 'center' ? 'mx-auto text-center' : layout.align === 'right' ? 'ml-auto text-right' : 'mr-auto text-left';
  const alignContentClass =
    layout.align === 'center' ? 'text-center' : layout.align === 'right' ? 'text-right' : 'text-left';

  // Largura determinística (Fill vs Fixed em mm com suporte a override transitório de preview)
  const effectiveWidthMm = previewWidthMm ?? layout.fixedWidthMm;
  const widthStyle: React.CSSProperties =
    layout.widthMode === 'fixed' && effectiveWidthMm && effectiveWidthMm > 0
      ? { width: `${effectiveWidthMm}mm`, maxWidth: '100%' }
      : { width: '100%' };

  // Grid vs Stack
  const gridColumnsStyle =
    layout.mode === 'stack'
      ? 'minmax(0, 1fr)'
      : `repeat(${columns}, minmax(0, 1fr))`;

  // Anel de seleção no container da seção:
  // Se seção selecionada SEM card: anel azul de foco primário.
  // Se seção selecionada COM card: anel pontilhado sutil (o card é o foco).
  const sectionSelectionClass = isExport
    ? ''
    : isSelected && !selectedChildId
    ? 'ring-2 ring-blue-600 ring-offset-1'
    : isSelected && selectedChildId
    ? 'ring-1 ring-dashed ring-slate-300'
    : '';

  return (
    <div
      data-block-id={block.id}
      data-block-type="structural_section"
      onClick={(e) => {
        if (!isExport && onSelectSection) {
          e.stopPropagation();
          onSelectSection();
        }
      }}
      className={`structural-section-block relative transition-all ${alignContainerClass} ${sectionSelectionClass} ${
        !isExport ? 'cursor-pointer' : ''
      }`}
      style={{
        ...widthStyle,
        padding: `${paddingMm}mm`,
        backgroundColor: bgMap[layout.background] || bgMap.soft,
        border: borderMap[layout.border] || borderMap.subtle,
        borderRadius: radiusMap[layout.radius] || radiusMap.sm
      }}
    >
      {/* Cabeçalho da Seção com Atributos Canônicos de Paridade */}
      {hasHeader && (
        <div className={`mb-2.5 pb-1.5 border-b border-slate-200/80 flex items-center justify-between ${alignContentClass}`}>
          <div className="flex items-center gap-2">
            {block.structuralData?.iconId && (
              <CorporateIcon
                iconId={block.structuralData.iconId}
                size="md"
                context="section"
                isExport={isExport}
                className="text-[#003366] shrink-0"
              />
            )}
            {block.title?.trim() && (
              <h3
                className="font-bold text-slate-900 text-xs tracking-wide uppercase font-mono"
                data-printable-node-id={`b${block.id}_sec_title`}
                data-printable-policy="translate"
              >
                {block.title}
              </h3>
            )}
          </div>
          {block.badgeText?.trim() && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 text-[#003366] rounded font-mono"
              data-printable-node-id={`b${block.id}_sec_badge`}
              data-printable-policy="translate"
            >
              {block.badgeText}
            </span>
          )}
        </div>
      )}

      {block.subtitle?.trim() && (
        <p
          className={`text-[10px] text-slate-600 mb-2 ${alignContentClass}`}
          data-printable-node-id={`b${block.id}_sec_subtitle`}
          data-printable-policy="translate"
        >
          {block.subtitle}
        </p>
      )}

      {/* Grid / Stack de Cards Filhos com Atributos Canônicos por child.id */}
      <div
        className="w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumnsStyle,
          gap: `${gapMm}mm`
        }}
      >
        {children.map((child) => {
          const isCardSelected = !isExport && selectedChildId === child.id;

          // Mapeamento determinístico de Ênfase do Card
          let emphasisClass = 'bg-white border border-slate-200';
          let iconColorClass = 'text-slate-600';

          if (child.emphasis === 'highlight') {
            emphasisClass = 'bg-white border border-blue-200 border-t-2 border-t-[#003366] shadow-xs';
            iconColorClass = 'text-[#003366]';
          } else if (child.emphasis === 'informative') {
            emphasisClass = 'bg-sky-50/70 border border-sky-200';
            iconColorClass = 'text-sky-700';
          } else if (child.emphasis === 'technical') {
            emphasisClass = 'bg-slate-50 border border-slate-300 font-mono';
            iconColorClass = 'text-slate-700';
          }

          const cardSelectionClass = isCardSelected
            ? 'ring-2 ring-blue-600 ring-offset-1 shadow-sm'
            : '';

          const iconAlignmentClass =
            layout.align === 'center'
              ? 'justify-center'
              : layout.align === 'right'
              ? 'justify-end'
              : 'justify-start';

          return (
            <div
              key={child.id}
              data-card-id={child.id}
              onClick={(e) => {
                if (!isExport && onSelectCard) {
                  e.stopPropagation();
                  onSelectCard(child.id);
                }
              }}
              className={`rounded shadow-2xs flex flex-col justify-between transition-all ${emphasisClass} ${cardSelectionClass} ${
                !isExport ? 'cursor-pointer hover:border-slate-400' : ''
              }`}
              style={{ padding: currentDensity.cardPad }}
            >
              <div className={alignContentClass}>
                {/* Badge do Card */}
                {child.badge?.trim() && (
                  <div className={`flex items-center mb-1 ${iconAlignmentClass}`}>
                    <span
                      className="text-[8px] font-bold text-slate-500 uppercase font-mono bg-slate-100 px-1 py-0.2 rounded"
                      data-printable-node-id={`b${block.id}_card_${child.id}_badge`}
                      data-printable-policy="translate"
                    >
                      {child.badge}
                    </span>
                  </div>
                )}

                {/* Ícone Semântico do Card */}
                {child.iconId && (
                  <div className={`flex items-center mb-1.5 ${iconAlignmentClass}`}>
                    <CorporateIcon
                      iconId={child.iconId}
                      size="sm"
                      context="card"
                      isExport={isExport}
                      className={iconColorClass}
                    />
                  </div>
                )}

                {/* Título do Card */}
                {child.title?.trim() && (
                  <h4
                    className={`font-bold text-slate-800 leading-tight mb-1 ${currentDensity.titleClass}`}
                    data-printable-node-id={`b${block.id}_card_${child.id}_title`}
                    data-printable-policy="translate"
                  >
                    {child.title}
                  </h4>
                )}

                {/* Corpo do Card */}
                {child.body?.trim() && (
                  <p
                    className={`text-slate-600 leading-snug ${currentDensity.bodyClass}`}
                    data-printable-node-id={`b${block.id}_card_${child.id}_body`}
                    data-printable-policy="translate"
                  >
                    {child.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
