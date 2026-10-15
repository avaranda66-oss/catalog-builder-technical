import React from 'react';
import { STAGE_ZOOM_OPTIONS, stageZoomPercent } from '../../editor/stage-zoom';
import { useStageZoomHost } from './use-stage-zoom';

export interface ZoomControlProps {
  /** Width of the page being edited; "Ajustar à largura" fits this width to the canvas. */
  pageWidthMm: number;
}

/**
 * FR-16a — page zoom buttons for the canvas header (`.vnext-canvas-meta`).
 * Only changes how big the page looks on screen; the catalog and the PDF never change.
 */
export function ZoomControl({ pageWidthMm }: ZoomControlProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const stageZoom = useStageZoomHost(rootRef, pageWidthMm);
  const fitActive = stageZoom.choice === 'fit-width';
  return (
    <div
      ref={rootRef}
      className="vnext-zoom-control"
      role="group"
      aria-label="Zoom da página"
      title="Dica: segure Ctrl e gire a roda do mouse sobre a página para aproximar ou afastar."
      data-stage-zoom-control=""
      data-stage-zoom-choice={stageZoom.choice}
      data-stage-zoom={stageZoom.zoom}
    >
      <span className="vnext-zoom-label" aria-hidden="true">Zoom</span>
      {STAGE_ZOOM_OPTIONS.map((option) => (
        <button
          key={option.choice}
          type="button"
          aria-pressed={stageZoom.choice === option.choice}
          data-stage-zoom-option={option.choice}
          onClick={() => stageZoom.setChoice(option.choice)}
        >
          {option.label}
        </button>
      ))}
      {fitActive && stageZoom.measured && (
        <span className="vnext-zoom-value" data-stage-zoom-value="">{stageZoomPercent(stageZoom.zoom)}</span>
      )}
    </div>
  );
}
