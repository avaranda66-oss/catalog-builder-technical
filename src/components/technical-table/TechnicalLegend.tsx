import React from 'react';
import { TechnicalMarker } from './TechnicalMarker';
import { TechnicalMarkerType, DEFAULT_MARKER_LEGENDS } from './table-tokens';
import { usePrintLocalization } from '../../translation/PrintLocalizationContext';

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
  onUpdateLegendItem?: (markerType: TechnicalMarkerType, newLabel: string) => void;
  onUpdateLegendTitle?: (newTitle: string) => void;
  isEditable?: boolean;
}

export const TechnicalLegend: React.FC<TechnicalLegendProps> = ({
  config,
  activeMarkers = ['filled_square', 'empty_square', 'asterisk', 'dash'],
  className = '',
  onUpdateLegendItem,
  onUpdateLegendTitle,
  isEditable = true
}) => {
  const { resolveSystemString } = usePrintLocalization();

  if (config && config.showLegend === false) return null;

  // Se config?.title foi customizado e não é a chave placeholder/default, usa o customizado.
  // Caso contrário, resolve 'legend_title' a partir da localização do documento.
  const isDefaultTitle = !config?.title || config.title === 'LEGEND:' || config.title === 'LEGENDA METROLÓGICA:';
  const displayTitle = isDefaultTitle
    ? resolveSystemString('legend_title', 'LEGEND:')
    : config!.title!;

  // Se config?.items foi fornecido pelo usuário (customizado), usa ele.
  // Caso contrário, resolve cada marcador dinamicamente no idioma do documento.
  const items =
    config?.items && config.items.length > 0
      ? config.items
      : activeMarkers.map((type) => ({
          type,
          label: resolveSystemString(`legend_${type}`, DEFAULT_MARKER_LEGENDS[type] || type)
        }));

  if (items.length === 0) return null;

  return (
    <div className={`pt-1.5 pb-1 px-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600 font-mono select-none ${className}`}>
      <span
        data-print-string-key="legend_title"
        data-printable-policy={isDefaultTitle ? 'system' : 'translate'}
        contentEditable={isEditable}
        suppressContentEditableWarning
        onBlur={(e) => {
          if (onUpdateLegendTitle) {
            onUpdateLegendTitle(e.currentTarget.innerText.trim());
          }
        }}
        className={`font-bold text-slate-700 uppercase tracking-wider text-[9px] ${
          isEditable ? 'outline-none focus:bg-amber-100 hover:bg-slate-100 px-0.5 cursor-text' : ''
        }`}
      >
        {displayTitle}
      </span>

      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <TechnicalMarker type={item.type} size={10} color="#003366" />
          <span
            data-print-string-key={`legend_${item.type}`}
            data-printable-policy={config?.items ? 'translate' : 'system'}
            contentEditable={isEditable}
            suppressContentEditableWarning
            onBlur={(e) => {
              const val = e.currentTarget.innerText.trim();
              if (onUpdateLegendItem) {
                onUpdateLegendItem(item.type, val);
              }
            }}
            className={`text-slate-600 ${
              isEditable ? 'outline-none focus:bg-amber-100 hover:bg-blue-50 px-1 py-0.5 border border-transparent hover:border-slate-300 cursor-text' : ''
            }`}
            title={isEditable ? 'Click to edit legend text' : undefined}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
};
