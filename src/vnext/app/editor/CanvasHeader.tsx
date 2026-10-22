import React from 'react';
import { IssuesPanel, type IssuesPanelProps } from './IssuesPanel';
import { useNoticeAnchor } from './use-notice-anchor';
import { ZoomControl } from './ZoomControl';

export interface CanvasHeaderProps {
  /** 1-based number of the page being edited. */
  pageNumber: number;
  pageCount: number;
  /** Width of the page being edited, for "Ajustar à largura". */
  pageWidthMm: number;
  /** Height of the page being edited, for "Página inteira" (A4 proportion when left out). */
  pageHeightMm?: number;
  /** The problem counter ("1 a corrigir") and its list. */
  issues: IssuesPanelProps;
  /** Save text shown beside the problems; left out in the simple mode, where the top bar shows it. */
  memoryStatus?: string;
  /** Page-level actions shown before the problems (Onda 3.5: "Camadas"). */
  pageActions?: React.ReactNode;
}

/**
 * FR-92 (costura 2.0): the line above the page with "Página N de M", the page zoom (FR-16a/16b,
 * `ZoomControl` + `useStageZoomHost`) and the problems. FR-16b: it also tells the floating
 * messages where the page area starts (`useNoticeAnchor`), so a message never covers this line.
 */
export function CanvasHeader({ pageNumber, pageCount, pageWidthMm, pageHeightMm, issues, memoryStatus, pageActions }: CanvasHeaderProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  useNoticeAnchor(rootRef);
  return (
    <div ref={rootRef} className="vnext-canvas-meta">
      <div><strong>Página {pageNumber} de {pageCount}</strong><span className="vnext-canvas-size">A4 · 210 × 297 mm</span></div>
      <ZoomControl pageWidthMm={pageWidthMm} pageHeightMm={pageHeightMm} />
      <div className="vnext-canvas-statuses">
        {pageActions}
        <IssuesPanel {...issues} />
        {memoryStatus !== undefined && <span className="vnext-memory-status" data-save-state="">{memoryStatus}</span>}
      </div>
    </div>
  );
}
