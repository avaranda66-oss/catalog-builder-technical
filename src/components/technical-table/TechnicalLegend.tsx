import React from 'react';
import { TechnicalMarker } from './TechnicalMarker';
import { TechnicalMarkerType, DEFAULT_MARKER_LEGENDS } from './table-tokens';

export interface TableLegendConfig {
  showLegend: boolean;
  title?: string;
  items?: Array<{
    type: TechnicalMarkerType;
    label: string;
  }>;
}

interface TechnicalLegendProps {
  config?: TableLegendConfig;
  activeMarkers?: TechnicalMarkerType[];
  className?: string;
}

export const TechnicalLegend: React.FC<TechnicalLegendProps> = ({
  config,
  activeMarkers = ['filled_square', 'empty_square', 'asterisk', 'dash'],
  className = ''
}) => {
  if (config && config.showLegend === false) return null;

  const items =
    config?.items ||
    activeMarkers.map((type) => ({
      type,
      label: DEFAULT_MARKER_LEGENDS[type] || type
    }));

  if (items.length === 0) return null;

  return (
    <div className={`pt-1.5 pb-1 px-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600 font-mono select-none ${className}`}>
      <span className="font-bold text-slate-700 uppercase tracking-wider text-[9px]">Legenda:</span>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <TechnicalMarker type={item.type} size={10} color="#003366" />
          <span className="text-slate-600">{item.label}</span>
        </div>
      ))}
    </div>
  );
};
