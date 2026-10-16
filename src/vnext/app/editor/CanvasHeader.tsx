import { IssuesPanel, type IssuesPanelProps } from './IssuesPanel';
import { ZoomControl } from './ZoomControl';

export interface CanvasHeaderProps {
  /** 1-based number of the page being edited. */
  pageNumber: number;
  pageCount: number;
  /** Width of the page being edited, for "Ajustar à largura". */
  pageWidthMm: number;
  /** The problem counter ("1 a corrigir") and its list. */
  issues: IssuesPanelProps;
  /** Save text shown beside the problems; left out in the simple mode, where the top bar shows it. */
  memoryStatus?: string;
}

/**
 * FR-92 (costura 2.0): the line above the page with "Página N de M", the page zoom (FR-16a,
 * `ZoomControl` + `useStageZoomHost`) and the problems. Moved out of EditorWorkspace without
 * changing behavior or texts.
 */
export function CanvasHeader({ pageNumber, pageCount, pageWidthMm, issues, memoryStatus }: CanvasHeaderProps) {
  return (
    <div className="vnext-canvas-meta">
      <div><strong>Página {pageNumber} de {pageCount}</strong><span>A4 · 210 × 297 mm</span></div>
      <ZoomControl pageWidthMm={pageWidthMm} />
      <div className="vnext-canvas-statuses">
        <IssuesPanel {...issues} />
        {memoryStatus !== undefined && <span className="vnext-memory-status" data-save-state="">{memoryStatus}</span>}
      </div>
    </div>
  );
}
