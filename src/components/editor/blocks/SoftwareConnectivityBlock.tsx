// src/components/editor/blocks/SoftwareConnectivityBlock.tsx
// Bloco Software de Calibração & Conectividade canônico (CORE.E6B).
// Elimina ghost data/fake technical defaults, contentEditable no Canvas e botões editoriais.

import React from 'react';
import { Laptop, Wifi, Usb, Database } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  getSoftwareConnectivityItems,
  SoftwareConnectivityItem
} from '../../../domain/composite-content.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface SoftwareConnectivityBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const SoftwareConnectivityBlock: React.FC<SoftwareConnectivityBlockProps> = ({
  block,
  isSelected,
  isExport
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const rawItems: SoftwareConnectivityItem[] = getSoftwareConnectivityItems(block);

  // Em modo exportação, renderiza somente itens com conteúdo textual real (CORE.E6B Req 31)
  const items = isExport
    ? rawItems.filter(
        (it) =>
          (typeof it.badge === 'string' && it.badge.trim().length > 0) ||
          (typeof it.title === 'string' && it.title.trim().length > 0) ||
          (typeof it.desc === 'string' && it.desc.trim().length > 0)
      )
    : rawItems;

  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;
  const hasBadge = typeof block.badgeText === 'string' && block.badgeText.trim().length > 0;

  const renderIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Wifi':
        return <Wifi className="w-4 h-4 text-[#003366] shrink-0" />;
      case 'Usb':
        return <Usb className="w-4 h-4 text-[#003366] shrink-0" />;
      case 'Database':
        return <Database className="w-4 h-4 text-[#003366] shrink-0" />;
      default:
        return <Laptop className="w-4 h-4 text-[#003366] shrink-0" />;
    }
  };

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
      {(hasTitle || hasBadge || !isExport) && (
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2 gap-2">
          <h3
            data-printable-field="title"
            className="text-xs font-bold text-slate-900 uppercase tracking-wider rounded-none px-1 flex items-center gap-1.5 flex-1 min-w-0"
          >
            <Laptop className="w-3.5 h-3.5 text-[#003366] shrink-0" />
            {hasTitle ? (
              <span className="truncate">{block.title}</span>
            ) : !isExport ? (
              <span className="text-slate-400 italic truncate no-print">
                Software de Calibração & Conectividade...
              </span>
            ) : null}
          </h3>

          {hasBadge ? (
            <span
              data-printable-field="badgeText"
              className="text-[9px] font-mono font-bold bg-[#003366] text-white px-1.5 py-0.5 rounded-none uppercase shrink-0"
            >
              {block.badgeText}
            </span>
          ) : !isExport ? (
            <span className="text-[9px] font-mono font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-none uppercase shrink-0 italic no-print">
              Badge Opcional
            </span>
          ) : null}
        </div>
      )}

      {/* Grid de Cards de Conectividade */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {items.map((item, idx) => {
            const hasItemBadge = typeof item.badge === 'string' && item.badge.trim().length > 0;
            const hasItemTitle = typeof item.title === 'string' && item.title.trim().length > 0;
            const hasItemDesc = typeof item.desc === 'string' && item.desc.trim().length > 0;

            return (
              <div
                key={idx}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1.5 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    {renderIcon(item.icon)}

                    {hasItemBadge ? (
                      <span
                        data-printable-field={`item_${idx}_badge`}
                        className="text-[8px] font-mono font-bold px-1 py-0.2 bg-slate-200 text-slate-700 rounded-none uppercase"
                      >
                        {item.badge}
                      </span>
                    ) : !isExport ? (
                      <span className="text-[8px] font-mono text-slate-400 italic no-print">
                        Tag...
                      </span>
                    ) : null}
                  </div>

                  {hasItemTitle ? (
                    <h4
                      data-printable-field={`item_${idx}_title`}
                      className="font-bold text-slate-900 text-[11px] leading-snug"
                    >
                      {item.title}
                    </h4>
                  ) : !isExport ? (
                    <h4 className="font-bold text-slate-400 italic text-[11px] leading-snug no-print">
                      Recurso sem título...
                    </h4>
                  ) : null}

                  {hasItemDesc ? (
                    <p
                      data-printable-field={`item_${idx}_desc`}
                      className="text-[10px] text-slate-600 leading-relaxed font-sans"
                    >
                      {item.desc}
                    </p>
                  ) : !isExport && hasItemTitle ? (
                    <p className="text-[10px] text-slate-400 italic leading-relaxed font-sans no-print">
                      Descrição opcional...
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : !isExport ? (
        <div className="p-2 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 no-print">
          Nenhum recurso de conectividade cadastrado. Adicione itens pelo Inspector.
        </div>
      ) : null}
    </div>
  );
};
