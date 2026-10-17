import React from 'react';
import { INTAKE_ACCEPT, INTAKE_MAX_FILES } from './intake-model';

export const DROP_ZONE_TEXT = 'Arraste aqui PDFs, planilhas e fotos (ou clique para escolher)';

interface Props {
  readonly onFiles: (files: File[]) => void;
  readonly disabled?: boolean;
  /** Smaller once there are files in the list, so the list and the chat keep their room. */
  readonly compact?: boolean;
}

/**
 * FR-64: one place for every file. A click (or Enter/Space) opens the file chooser; files dragged from the computer
 * can be dropped anywhere on the box. The box itself says what it is, so it needs no other label.
 */
export function SourceDropZone({ onFiles, disabled, compact }: Props) {
  const input = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const depth = React.useRef(0);
  const helpId = `${React.useId()}-help`;
  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const take = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(files);
  };
  return (
    <div
      className="ai-intake-drop"
      data-dragging={dragging ? 'true' : undefined}
      data-compact={compact ? 'true' : undefined}
      onDragEnter={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        take(event.dataTransfer?.files);
      }}
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
