// src/components/editor/blocks/BottomHeaderBlock.tsx
// Rodapé Técnico Metrológico canônico (CORE.E6A).
// Suporta isExport, elimina ghost data/fallbacks fictícios e canvas editing.
// Deriva foregroundTone com contraste seguro para paletas claras/escuras.

import React from 'react';
import { Phone, Mail, Globe } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import { useCatalogStore } from '../../../stores/useCatalogStore';
import {
  resolveBottomHeaderPaletteClass,
  resolveBottomHeaderForegroundTone
} from '../../../domain/bottom-header.appearance';

interface BottomHeaderBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const BottomHeaderBlock: React.FC<BottomHeaderBlockProps> = ({
  block,
  pageId: _pageId,
  isSelected,
  isExport = false
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const custom = block.customData || {};
  const gradientClass = resolveBottomHeaderPaletteClass(block);
  const foregroundTone = resolveBottomHeaderForegroundTone(block);

  const isDark = foregroundTone === 'dark';

  const hasBadgeText = typeof block.badgeText === 'string' && block.badgeText.trim().length > 0;
  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;
  const hasSubtitle = typeof block.subtitle === 'string' && block.subtitle.trim().length > 0;

  const hasPhone = typeof custom.phone === 'string' && custom.phone.trim().length > 0;
  const hasEmail = typeof custom.email === 'string' && custom.email.trim().length > 0;
  const hasWebsite = typeof custom.website === 'string' && custom.website.trim().length > 0;
  const hasAnyContact = hasPhone || hasEmail || hasWebsite;

  return (
    <div
      onClick={(e) => {
        if (isExport) return;
        e.stopPropagation();
        setSelectedBlockId(block.id);
      }}
      className={`relative p-3.5 rounded-none ${gradientClass} ${
        isDark ? 'text-slate-900' : 'text-white'
      } transition-all border ${
        isDark ? 'border-amber-400/60' : 'border-slate-700'
      } ${!isExport && isSelected ? 'ring-2 ring-blue-500' : ''} ${
        !isExport ? (isDark ? 'hover:border-slate-900' : 'hover:border-slate-500') : ''
      }`}
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="space-y-1">
          {(hasBadgeText || !isExport) && (
            <div className="flex items-center gap-2">
              {hasBadgeText ? (
                <span
                  data-printable-field="badgeText"
                  className={`inline-flex items-center justify-center text-[9px] font-mono font-bold tracking-widest uppercase px-2.5 py-1 leading-none rounded-none box-border border ${
                    isDark
                      ? 'bg-slate-900/10 text-slate-900 border-slate-900/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                  }`}
                >
                  {block.badgeText}
                </span>
              ) : !isExport ? (
                <span
                  className={`inline-flex items-center justify-center text-[9px] font-mono font-bold tracking-widest uppercase px-2.5 py-1 leading-none rounded-none box-border border opacity-50 no-print ${
                    isDark
                      ? 'bg-slate-900/10 text-slate-900 border-slate-900/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                  }`}
                >
                  PRESYS METROLOGIA
                </span>
              ) : null}
            </div>
          )}

          {hasTitle ? (
            <h2
              data-printable-field="title"
              className={`text-lg font-black tracking-tight leading-tight ${
                isDark ? 'text-slate-900' : 'text-white'
              }`}
            >
              {block.title}
            </h2>
          ) : !isExport ? (
            <h2
              className={`text-lg font-black tracking-tight leading-tight opacity-50 no-print ${
                isDark ? 'text-slate-900' : 'text-white'
              }`}
            >
              Razão Social / Título Institucional...
            </h2>
          ) : null}

          {hasSubtitle ? (
            <p
              data-printable-field="subtitle"
              className={`text-xs font-medium ${
                isDark ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              {block.subtitle}
            </p>
          ) : !isExport && hasTitle ? (
            <p
              className={`text-xs font-medium opacity-50 no-print ${
                isDark ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              Subtítulo institucional opcional...
            </p>
          ) : null}
        </div>

        {/* Informações de Contato: apenas renderiza ícones se o contato existir */}
        {(hasAnyContact || !isExport) && (
          <div
            className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 text-[10px] font-mono pt-2 md:pt-0 border-t md:border-t-0 md:border-l md:pl-4 ${
              isDark
                ? 'text-slate-800 border-slate-900/20'
                : 'text-slate-300 border-white/10'
            }`}
          >
            {hasPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className={`w-3 h-3 shrink-0 ${isDark ? 'text-[#003366]' : 'text-blue-400'}`} />
                <span data-printable-field="phone">
                  {custom.phone}
                </span>
              </div>
            )}

            {hasEmail && (
              <div className="flex items-center gap-1.5">
                <Mail className={`w-3 h-3 shrink-0 ${isDark ? 'text-[#003366]' : 'text-blue-400'}`} />
                <span data-printable-field="email">
                  {custom.email}
                </span>
              </div>
            )}

            {hasWebsite && (
              <div className="flex items-center gap-1.5">
                <Globe className={`w-3 h-3 shrink-0 ${isDark ? 'text-[#003366]' : 'text-blue-400'}`} />
                <span data-printable-field="website">
                  {custom.website}
                </span>
              </div>
            )}

            {!hasAnyContact && !isExport && (
              <div className="text-[9px] italic opacity-50 no-print">
                Sem contatos cadastrados
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
