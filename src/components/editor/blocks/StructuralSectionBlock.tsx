// src/components/editor/blocks/StructuralSectionBlock.tsx
// Renderer Estrutural Mínimo e Defensivo (Fase 3A.1A Micro-Hardening)
// Garante paridade bidirecional estrita com RendererParityAuditor e PrintableTextRegistry.
// Zero vazamento textual de metadados internos de ícones (iconId).

import React from 'react';
import { ContentBlock } from '@/domain/catalog.schema';
import { SPACING_MM_MAP } from '@/domain/canvas-layout.schema';

interface StructuralSectionBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected?: boolean;
  isExport?: boolean;
}

export const StructuralSectionBlock: React.FC<StructuralSectionBlockProps> = ({
  block,
  isSelected = false
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

  const hasHeader = Boolean(block.title?.trim() || block.badgeText?.trim());

  return (
    <div
      data-block-id={block.id}
      data-block-type="structural_section"
      className={`structural-section-block relative rounded transition-all ${
        isSelected ? 'ring-2 ring-blue-600 ring-offset-1' : ''
      }`}
      style={{
        padding: `${paddingMm}mm`,
        backgroundColor: layout.background === 'soft' ? '#f8fafc' : layout.background === 'technical' ? '#f1f5f9' : 'transparent',
        border: layout.border === 'subtle' ? '1px solid #e2e8f0' : layout.border === 'solid' ? '1px solid #cbd5e1' : 'none'
      }}
    >
      {/* Cabeçalho da Seção com Atributos Canônicos de Paridade */}
      {hasHeader && (
        <div className="mb-2.5 pb-1.5 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
          className="text-[10px] text-slate-600 mb-2"
          data-printable-node-id={`b${block.id}_sec_subtitle`}
          data-printable-policy="translate"
        >
          {block.subtitle}
        </p>
      )}

      {/* Grid de Cards Filhos com Atributos Canônicos por child.id */}
      <div
        className="w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${gapMm}mm`
        }}
      >
        {children.map((child) => (
          <div
            key={child.id}
            data-card-id={child.id}
            className="p-2.5 rounded bg-white border border-slate-200 shadow-2xs flex flex-col justify-between"
          >
            <div>
              {/* Badge do Card (Sem impressão textual de iconId) */}
              {child.badge?.trim() && (
                <div className="flex items-center justify-end mb-1">
                  <span
                    className="text-[8px] font-bold text-slate-500 uppercase font-mono bg-slate-100 px-1 py-0.2 rounded"
                    data-printable-node-id={`b${block.id}_card_${child.id}_badge`}
                    data-printable-policy="translate"
                  >
                    {child.badge}
                  </span>
                </div>
              )}

              {/* Título do Card */}
              {child.title?.trim() && (
                <h4
                  className="font-bold text-slate-800 text-[11px] leading-tight mb-1"
                  data-printable-node-id={`b${block.id}_card_${child.id}_title`}
                  data-printable-policy="translate"
                >
                  {child.title}
                </h4>
              )}

              {/* Corpo do Card */}
              {child.body?.trim() && (
                <p
                  className="text-[9.5px] text-slate-600 leading-snug"
                  data-printable-node-id={`b${block.id}_card_${child.id}_body`}
                  data-printable-policy="translate"
                >
                  {child.body}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
