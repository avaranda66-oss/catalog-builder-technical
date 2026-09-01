import React from 'react';
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

export const TechnicalCell: React.FC<TechnicalCellProps> = ({
  value,
  divergence,
  align = 'left',
  isEditable = true,
  onBlur,
  onRestoreDivergence,
  onToggleMarker,
  className = ''
}) => {
  // Detecta se o valor é um marcador técnico estruturado
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === ' ' && onToggleMarker) {
      e.preventDefault();
      onToggleMarker();
    }
  };

  return (
    <div className={`flex items-center gap-1 w-full ${alignClass} ${className}`}>
      {markerType && !isEditable ? (
        <TechnicalMarker type={markerType} size={11} color="#003366" />
      ) : (
        <span
          contentEditable={isEditable}
          suppressContentEditableWarning
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
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
