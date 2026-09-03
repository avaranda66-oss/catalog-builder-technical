// src/components/editor/blocks/FeaturesListBlock.tsx
// Bloco de Lista de Recursos & Diferenciais canônico (CORE.E6B).
// Suporta isExport, elimina contentEditable no Canvas e botões editoriais.

import React from 'react';
import { Award } from 'lucide-react';
import { ContentBlock, FeatureItem } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface FeaturesListBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const FeaturesListBlock: React.FC<FeaturesListBlockProps> = ({
  block,
  isSelected,
  isExport
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const rawFeatures: FeatureItem[] = Array.isArray(block.features) ? block.features : [];

  // Em modo exportação, renderiza somente itens que tenham conteúdo textual real (CORE.E6B Req 31)
  const features = isExport
    ? rawFeatures.filter(
        (f) =>
          (typeof f.title === 'string' && f.title.trim().length > 0) ||
          (typeof f.description === 'string' && f.description.trim().length > 0)
      )
    : rawFeatures;

  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;

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
      {/* Header Técnico */}
      {(hasTitle || !isExport) && (
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2">
          <h3
            data-printable-field="title"
            className="text-xs font-bold text-slate-900 uppercase tracking-wider rounded-none px-1 flex items-center gap-1.5"
          >
            <Award className="w-3.5 h-3.5 text-[#003366] shrink-0" />
            {hasTitle ? (
              <span>{block.title}</span>
            ) : !isExport ? (
              <span className="text-slate-400 italic no-print">
                Destaques e Recursos Técnicos...
              </span>
            ) : null}
          </h3>
        </div>
      )}

      {/* Grid de Destaques */}
      {features.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {features.map((item) => {
            const hasItemTitle = typeof item.title === 'string' && item.title.trim().length > 0;
            const hasItemDesc = typeof item.description === 'string' && item.description.trim().length > 0;

            return (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-none transition-colors"
              >
                <span
                  className="text-[#003366] font-bold text-xs shrink-0 mt-0.5 select-none"
                  data-printable-policy="protect"
                >
                  ■
                </span>

                <div className="flex-1 min-w-0">
                  {hasItemTitle ? (
                    <h4
                      data-printable-field={`feat_${item.id}_title`}
                      className="text-[11px] font-bold text-slate-900 leading-snug"
                    >
                      {item.title}
                    </h4>
                  ) : !isExport ? (
                    <h4 className="text-[11px] font-bold text-slate-400 italic leading-snug no-print">
                      Destaque sem título...
                    </h4>
                  ) : null}

                  {hasItemDesc ? (
                    <p
                      data-printable-field={`feat_${item.id}_desc`}
                      className="text-[10px] text-slate-600 leading-relaxed font-sans mt-0.5"
                    >
                      {item.description}
                    </p>
                  ) : !isExport && hasItemTitle ? (
                    <p className="text-[10px] text-slate-400 italic leading-relaxed font-sans mt-0.5 no-print">
                      Descrição técnica opcional...
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : !isExport ? (
        <div className="p-2 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 no-print">
          Nenhum destaque cadastrado. Adicione diferenciais técnicos pelo Inspector.
        </div>
      ) : null}
    </div>
  );
};
