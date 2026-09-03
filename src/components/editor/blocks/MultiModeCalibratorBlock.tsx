// src/components/editor/blocks/MultiModeCalibratorBlock.tsx
// Bloco Sistema Multifunção (MultiModeCalibrator) canônico (CORE.E6B).
// Elimina ghost data/fake technical defaults, contentEditable no Canvas e botões editoriais.

import React from 'react';
import { Layers } from 'lucide-react';
import { ContentBlock } from '../../../domain/catalog.schema';
import {
  getMultiModeItems,
  CalibratorModeItem
} from '../../../domain/composite-content.engine';
import { useCatalogStore } from '../../../stores/useCatalogStore';

interface MultiModeCalibratorBlockProps {
  block: ContentBlock;
  pageId: string;
  isSelected: boolean;
  isExport?: boolean;
}

export const MultiModeCalibratorBlock: React.FC<MultiModeCalibratorBlockProps> = ({
  block,
  isSelected,
  isExport
}) => {
  const setSelectedBlockId = useCatalogStore((state) => state.setSelectedBlockId);

  const rawModes: CalibratorModeItem[] = getMultiModeItems(block);

  // Em modo exportação, renderiza somente modos com título ou descrição reais (CORE.E6B Req 31)
  const modes = isExport
    ? rawModes.filter(
        (m) =>
          (typeof m.title === 'string' && m.title.trim().length > 0) ||
          (typeof m.desc === 'string' && m.desc.trim().length > 0)
      )
    : rawModes;

  const hasTitle = typeof block.title === 'string' && block.title.trim().length > 0;
  const hasBadge = typeof block.badgeText === 'string' && block.badgeText.trim().length > 0;

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
      {/* Header Técnico do Bloco */}
      {(hasTitle || hasBadge || !isExport) && (
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 mb-2 gap-2">
          <h3
            data-printable-field="title"
            className="text-xs font-bold text-slate-900 uppercase tracking-wider rounded-none px-1 flex items-center gap-1.5 flex-1 min-w-0"
          >
            <Layers className="w-3.5 h-3.5 text-[#003366] shrink-0" />
            {hasTitle ? (
              <span className="truncate">{block.title}</span>
            ) : !isExport ? (
              <span className="text-slate-400 italic truncate no-print">
                Sistema Multifunção (Modos de Calibração)...
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

      {/* Grid de Modos de Calibração */}
      {modes.length > 0 ? (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(modes.length, 1), 4)}, minmax(0, 1fr))`
          }}
        >
          {modes.map((mode, idx) => {
            const hasModeTitle = typeof mode.title === 'string' && mode.title.trim().length > 0;
            const hasModeDesc = typeof mode.desc === 'string' && mode.desc.trim().length > 0;
            const hasModeBadge = typeof mode.badge === 'string' && mode.badge.trim().length > 0;

            return (
              <div
                key={mode.id || idx}
                className="p-2.5 bg-slate-50 border border-slate-200 rounded-none flex flex-col justify-between space-y-1.5 transition-colors"
              >
                <div className="space-y-1">
                  {/* Badge Numérica Técnica */}
                  {hasModeBadge ? (
                    <div className="flex items-center justify-between">
                      <span
                        data-printable-field={`mode_${mode.id || idx}_badge`}
                        data-printable-policy="protect"
                        className="w-6 h-5 rounded-none bg-[#003366] text-white flex items-center justify-center font-mono font-bold text-[10px]"
                      >
                        {mode.badge}
                      </span>
                    </div>
                  ) : !isExport ? (
                    <div className="flex items-center justify-between no-print">
                      <span className="w-6 h-5 rounded-none bg-slate-200 text-slate-500 flex items-center justify-center font-mono font-bold text-[10px] italic">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ) : null}

                  {/* Título do Modo */}
                  {hasModeTitle ? (
                    <h4
                      data-printable-field={`mode_${mode.id || idx}_title`}
                      className="font-bold text-slate-900 text-[11px] leading-snug"
                    >
                      {mode.title}
                    </h4>
                  ) : !isExport ? (
                    <h4 className="font-bold text-slate-400 italic text-[11px] leading-snug no-print">
                      Modo sem título...
                    </h4>
                  ) : null}

                  {/* Descrição Técnica */}
                  {hasModeDesc ? (
                    <p
                      data-printable-field={`mode_${mode.id || idx}_desc`}
                      className="text-[10px] text-slate-600 leading-relaxed font-sans"
                    >
                      {mode.desc}
                    </p>
                  ) : !isExport && hasModeTitle ? (
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
          Nenhum modo de calibração cadastrado. Adicione modos técnicos pelo Inspector.
        </div>
      ) : null}
    </div>
  );
};
