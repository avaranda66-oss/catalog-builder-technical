import React, { useState } from 'react';
import { TechnicalMarker } from './TechnicalMarker';
import { TechnicalMarkerType } from './table-tokens';
import { DivergenceBadge } from '../common/DivergenceBadge';
import { FieldDivergence } from '../../domain/divergence';

interface TechnicalCellProps {
  value: string;
  divergence?: FieldDivergence;
  align?: 'left' | 'center' | 'right';
  isEditable?: boolean;
  onBlur?: (newVal: string) => void;
  onRestoreDivergence?: () => void;
  onToggleMarker?: () => void;
  className?: string;
}

const MARKER_CYCLE: Record<TechnicalMarkerType, TechnicalMarkerType> = {
  filled_square: 'empty_square',
  empty_square: 'dash',
  dash: 'filled_square',
  filled_circle: 'empty_circle',
  empty_circle: 'dash',
  asterisk: 'double_asterisk',
  double_asterisk: 'dash'
};

const MARKER_CHAR_MAP: Record<TechnicalMarkerType, string> = {
  filled_square: '■',
  empty_square: '□',
  filled_circle: '●',
  empty_circle: '○',
  asterisk: '*',
  double_asterisk: '**',
  dash: '—'
};

export const TechnicalCell: React.FC<TechnicalCellProps> = ({
  value,
  divergence,
  align = 'left',
  isEditable = true,
  onBlur,
  onRestoreDivergence,
  className = ''
}) => {
  const [showPicker, setShowPicker] = useState(false);

  const trimmed = (value || '').trim();
  let markerType: TechnicalMarkerType | null = null;

  if (trimmed === '■' || trimmed === '[x]' || trimmed === 'true' || trimmed === 'SIM') {
    markerType = 'filled_square';
  } else if (trimmed === '□' || trimmed === '[ ]' || trimmed === 'false' || trimmed === 'NAO') {
    markerType = 'empty_square';
  } else if (trimmed === '●') {
    markerType = 'filled_circle';
  } else if (trimmed === '○') {
    markerType = 'empty_circle';
  } else if (trimmed === '*') {
    markerType = 'asterisk';
  } else if (trimmed === '**') {
    markerType = 'double_asterisk';
  } else if (trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === '') {
    markerType = 'dash';
  }

  const isNumeric = /^[-+]?[\d.,\s±Ωµ°CFmbar%]+$/.test(trimmed);

  const alignClass =
    align === 'center' || markerType !== null
      ? 'text-center justify-center'
      : align === 'right' || isNumeric
      ? 'text-right justify-end'
      : 'text-left justify-start';

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    if (onBlur) {
      onBlur(e.currentTarget.innerText.trim());
    }
  };

  const handleCycleMarker = (e: React.MouseEvent) => {
    if (!isEditable || !markerType || !onBlur) return;
    e.stopPropagation();
    const nextType = MARKER_CYCLE[markerType] || 'filled_square';
    onBlur(MARKER_CHAR_MAP[nextType]);
  };

  const handleSelectMarker = (type: TechnicalMarkerType, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPicker(false);
    if (onBlur) {
      onBlur(MARKER_CHAR_MAP[type]);
    }
  };

  return (
    <div className={`relative flex items-center gap-1 w-full ${alignClass} ${className}`}>
      {markerType ? (
        <div className="inline-flex items-center gap-1 group/marker">
          {isEditable ? (
            <button
              type="button"
              onClick={handleCycleMarker}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPicker(!showPicker);
              }}
              className="p-0.5 rounded-none transition-transform select-none cursor-pointer hover:scale-125"
              title="Clique para alternar (ou botão direito para escolher)"
            >
              <TechnicalMarker type={markerType} size={11} color="#003366" />
            </button>
          ) : (
            <span className="p-0.5 select-none inline-flex items-center">
              <TechnicalMarker type={markerType} size={11} color="#003366" />
            </span>
          )}

          {/* Mini Seletor de Marcadores */}
          {showPicker && isEditable && (
            <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-slate-400 p-1 shadow-lg flex items-center gap-1 rounded-none no-print" data-editor-action="true">
              {(['filled_square', 'empty_square', 'filled_circle', 'empty_circle', 'asterisk', 'dash'] as TechnicalMarkerType[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => handleSelectMarker(m, e)}
                  className="p-1 hover:bg-slate-100 border border-transparent hover:border-slate-300"
                  title={m}
                >
                  <TechnicalMarker type={m} size={11} color="#003366" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span
          contentEditable={isEditable}
          suppressContentEditableWarning
          onBlur={handleBlur}
          className={`outline-none font-mono text-[11px] px-1 py-0.5 rounded-none transition-colors select-text ${
            isNumeric ? 'tabular-nums' : ''
          } ${
            divergence?.hasDivergence
              ? 'font-bold text-amber-900 bg-amber-50'
              : 'text-slate-900 focus:bg-amber-50 focus:ring-1 focus:ring-amber-400'
          }`}
        >
          {trimmed || '—'}
        </span>
      )}

      {divergence && onRestoreDivergence && (
        <DivergenceBadge divergence={divergence} onRestore={onRestoreDivergence} />
      )}
    </div>
  );
};
