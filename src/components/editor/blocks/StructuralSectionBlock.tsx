// src/components/editor/blocks/StructuralSectionBlock.tsx
// Renderer Estrutural Mínimo e Defensivo (Fase 3A.1 Canvas Domain Foundation)
// Garante paridade visual entre Editor (A4Canvas) e PDF (CleanA4Document) sem omitir conteúdo.

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
      {/* Cabeçalho da Seção (ContentBlock.title, subtitle, badgeText) */}
      {(block.title || block.badgeText) && (
        <div className="mb-2.5 pb-1.5 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data?.iconId && (
              <span className="text-[11px] font-mono font-bold text-slate-500 uppercase px-1.5 py-0.5 bg-slate-200/60 rounded">
                [{data.iconId}]
              </span>
            )}
            <h3
              className="font-bold text-slate-900 text-xs tracking-wide uppercase font-mono"
              data-printable-node="title"
            >
              {block.title || 'Seção Estrutural'}
            </h3>
          </div>
          {block.badgeText && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 bg-blue-100 text-[#003366] rounded font-mono"
              data-printable-node="badge"
            >
              {block.badgeText}
            </span>
          )}
        </div>
      )}

      {block.subtitle && (
        <p className="text-[10px] text-slate-600 mb-2" data-printable-node="subtitle">
          {block.subtitle}
        </p>
      )}

      {/* Grid de Cards Filhos */}
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
              <div className="flex items-center justify-between mb-1">
                {child.iconId && (
                  <span className="text-[9px] font-mono text-blue-700 font-semibold">
                    [{child.iconId}]
                  </span>
                )}
                {child.badge && (
                  <span className="text-[8px] font-bold text-slate-500 uppercase font-mono bg-slate-100 px-1 py-0.2 rounded">
                    {child.badge}
                  </span>
                )}
              </div>
              <h4 className="font-bold text-slate-800 text-[11px] leading-tight mb-1" data-printable-node="card-title">
                {child.title}
              </h4>
              <p className="text-[9.5px] text-slate-600 leading-snug" data-printable-node="card-body">
                {child.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
