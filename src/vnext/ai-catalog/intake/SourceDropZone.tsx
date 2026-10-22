import React from 'react';
import { INTAKE_ACCEPT, INTAKE_MAX_FILES } from './intake-model';

export const DROP_ZONE_TEXT = 'Arraste aqui PDFs, planilhas e fotos (ou clique para escolher)';

/** Whether the person is dragging files from the computer (not text or a picture from the page). */
export const dragHasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

export interface FileDropHandlers {
  readonly onDragEnter: (event: React.DragEvent) => void;
  readonly onDragOver: (event: React.DragEvent) => void;
  readonly onDragLeave: (event: React.DragEvent) => void;
  readonly onDrop: (event: React.DragEvent) => void;
}

/**
 * Drag and drop of files on a whole area. A file let go a little off target is still taken (it never falls through to
 * the browser, which would open the PDF or the photo in the tab and leave the editor). While `disabled`, the files
 * are refused but the browser still does not open them.
 */
export function useFileDrop(onFiles: (files: File[]) => void, disabled?: boolean): { dragging: boolean; handlers: FileDropHandlers } {
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);
  const handlers: FileDropHandlers = {
    onDragEnter: (event) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      if (disabled) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event) => {
      if (!dragHasFiles(event) && !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!disabled && files.length) onFiles(files);
    },
  };
  return { dragging: dragging && !disabled, handlers };
}

interface Props {
  readonly onFiles: (files: File[]) => void;
  readonly disabled?: boolean;
  /** Smaller once there are files in the list, so the list and the chat keep their room. */
  readonly compact?: boolean;
  /** Files are being dragged over the area that takes them (the whole files section). */
  readonly dragging?: boolean;
}

/**
 * FR-64: one place for every file. A click (or Enter/Space) opens the file chooser; files dragged from the computer
 * can be dropped on the box or anywhere around it (see `useFileDrop`). The box itself says what it is, so it needs
 * no other label.
 */
export function SourceDropZone({ onFiles, disabled, compact, dragging }: Props) {
  const input = React.useRef<HTMLInputElement>(null);
  const helpId = `${React.useId()}-help`;
  const take = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(files);
  };
  return (
    <div
      className="ai-intake-drop"
      data-dragging={dragging ? 'true' : undefined}
      data-compact={compact ? 'true' : undefined}
    >
      <button type="button" className="ai-intake-drop-button" disabled={disabled} aria-describedby={helpId}
        onClick={() => input.current?.click()}>
        <span aria-hidden="true" className="ai-intake-drop-icon">⇪</span>
        <span>{DROP_ZONE_TEXT}</span>
      </button>
      <small id={helpId}>
        Até {INTAKE_MAX_FILES} arquivos, lidos aqui no computador.
      </small>
      <input ref={input} type="file" multiple accept={INTAKE_ACCEPT} hidden aria-label="Escolher arquivos"
        disabled={disabled} tabIndex={-1}
        onChange={(event) => {
          take(event.target.files);
          // The same file can be chosen again after it was taken out of the list.
          event.target.value = '';
        }} />
    </div>
  );
}
