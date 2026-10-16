import React from 'react';
import { STAGE_ZOOM_OPTIONS, isStageZoomChoice, isStageZoomFitChoice, stageZoomPercent, stepStageZoom } from '../../editor/stage-zoom';
import { useStageZoomHost } from './use-stage-zoom';

export interface ZoomControlProps {
  /** Width of the page being edited; "Ajustar à largura" fits this width to the canvas. */
  pageWidthMm: number;
  /** Height of the page being edited, for "Página inteira" (A4 proportion when left out). */
  pageHeightMm?: number;
}

/**
 * FR-16a/FR-16b — page zoom for the canvas header (`.vnext-canvas-meta`): "−" and "+" step
 * through the levels, the list names them ("Página inteira", "Ajustar à largura", 75%, 100%,
 * 125%) and the measured size shows next to it. Compact on purpose, so the line with
 * "Página N de M" stays one line on a 1280–1366 px laptop with the bigger 60+ text.
 * Only changes how big the page looks on screen; the catalog and the PDF never change.
 */
export function ZoomControl({ pageWidthMm, pageHeightMm }: ZoomControlProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selectId = React.useId();
  const stageZoom = useStageZoomHost(rootRef, pageWidthMm, pageHeightMm);
  const { choice, fitWidthZoom, fitPageZoom } = stageZoom;
  const canZoomOut = stepStageZoom(choice, fitWidthZoom, -1, fitPageZoom) !== choice;
  const canZoomIn = stepStageZoom(choice, fitWidthZoom, 1, fitPageZoom) !== choice;
  return (
    <div
      ref={rootRef}
      className="vnext-zoom-control"
      role="group"
      aria-label="Zoom da página"
      title="Dica: segure Ctrl e gire a roda do mouse sobre a página para aproximar ou afastar."
      data-stage-zoom-control=""
      data-stage-zoom-choice={choice}
      data-stage-zoom={stageZoom.zoom}
    >
      <label className="vnext-zoom-label" htmlFor={selectId}>Zoom</label>
      <button
        type="button"
        className="vnext-zoom-step"
        aria-label="Diminuir o zoom"
        title="Diminuir o zoom"
        data-stage-zoom-step="out"
        disabled={!canZoomOut}
        onClick={stageZoom.zoomOut}
      ><span aria-hidden="true">−</span></button>
      <select
        id={selectId}
        className="vnext-zoom-select"
        value={choice}
        data-stage-zoom-select=""
        onChange={(event) => { if (isStageZoomChoice(event.target.value)) stageZoom.setChoice(event.target.value); }}
      >
        {STAGE_ZOOM_OPTIONS.map((option) => (
          <option key={option.choice} value={option.choice} data-stage-zoom-option={option.choice}>{option.label}</option>
        ))}
      </select>
      <button
        type="button"
        className="vnext-zoom-step"
        aria-label="Aumentar o zoom"
        title="Aumentar o zoom"
        data-stage-zoom-step="in"
        disabled={!canZoomIn}
        onClick={stageZoom.zoomIn}
      ><span aria-hidden="true">+</span></button>
      {isStageZoomFitChoice(choice) && stageZoom.measured && (
        <span className="vnext-zoom-value" data-stage-zoom-value="">{stageZoomPercent(stageZoom.zoom)}</span>
      )}
    </div>
  );
}
