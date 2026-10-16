import React from 'react';
import type { ConflictResolutionState, SaveProjection } from '../../persistence';
import {
  editorNoticeAutoHides, editorNoticeText, editorNoticeTone, SUCCESS_NOTICE_TIMEOUT_MS, type EditorNoticeInput,
} from '../../editor/editor-notices';
import { fatherSaveExplanation } from '../save-presentation';
import { ConflictDialog, type ConflictDialogResolution } from './ConflictDialog';
import './EditorNotices.css';

const SAVE_PROBLEM_PHASES: ReadonlySet<SaveProjection['phase']> = new Set(['ambiguous', 'unavailable', 'unauthorized', 'blocked']);

export interface EditorNoticesProps {
  /** The editor's latest status sentence, optionally with the tone the caller already knows. */
  message: EditorNoticeInput | null;
  onDismissMessage: () => void;
  /** Reports a new status sentence. Conflict failures are shown inside the conflict dialog instead. */
  onMessage: (message: string) => void;
  documentTitle: string;
  save?: SaveProjection;
  localProtectionUnavailable?: boolean;
  conflictState?: ConflictResolutionState;
  conflictResolution?: ConflictDialogResolution;
}

/**
 * FR-12: one fixed area right under the top bar, above the page, so messages are seen without scrolling.
 * Save problems are bands that stay while they last (they are part of the layout). The latest status message floats
 * over the top of the workspace instead, so it never pushes the page down or pulls it back up: a finished change
 * leaves after 4 s; an error or an instruction stays until the person closes it or the next message replaces it.
 * FR-44: every save problem has its plain explanation here, also in the simple mode. FR-43: a conflict opens the
 * blocking conflict dialog instead of a band.
 */
export function EditorNotices({
  message, onDismissMessage, documentTitle, save, localProtectionUnavailable, conflictState = 'idle', conflictResolution,
}: EditorNoticesProps) {
  const conflict = save?.phase === 'conflict' && conflictResolution;
  const saveProblem = save !== undefined && SAVE_PROBLEM_PHASES.has(save.phase);
  return (
    <div className="vnext-editor-notices" data-editor-notices="">
      {conflict && <ConflictDialog documentTitle={documentTitle} state={conflictState} resolution={conflict} />}
      {(localProtectionUnavailable || saveProblem) && (
        <div className="vnext-editor-notice-bands" data-editor-notice-bands="">
          {localProtectionUnavailable && (
            <p className="vnext-status vnext-editor-notice-band" data-tone="warning" role="alert">
              Não foi possível proteger as alterações neste computador. Mantenha esta aba aberta e use Salvar antes de sair.
            </p>
          )}
          {saveProblem && (
            <p className="vnext-status vnext-editor-notice-band" role="alert" data-save-problem=""
              data-tone={save.retry && !save.retry.exhausted ? 'warning' : 'error'}>
              {fatherSaveExplanation(save)}
            </p>
          )}
        </div>
      )}
      {/* Keyed by the sentence: a new message starts with a fresh timer and is not paused by an old hover. */}
      {message && <TransientNotice key={editorNoticeText(message)} notice={message} onDismiss={onDismissMessage} />}
    </div>
  );
}

function TransientNotice({ notice, onDismiss }: { notice: EditorNoticeInput; onDismiss: () => void }) {
  const message = editorNoticeText(notice);
  const tone = editorNoticeTone(notice);
  const [paused, setPaused] = React.useState(false);
  // The editor re-renders often; keep the timer tied to the message, not to the callback identity.
  const dismiss = React.useRef(onDismiss);
  dismiss.current = onDismiss;
  React.useEffect(() => {
    if (!editorNoticeAutoHides(tone) || paused) return;
    const timer = globalThis.setTimeout(() => dismiss.current(), SUCCESS_NOTICE_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [tone, paused]);
  return (
    <div
      className="vnext-editor-notice"
      role="status"
      data-tone={tone}
      data-editor-notice=""
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p>{message}</p>
      {tone !== 'progress' && (
        <button type="button" aria-label="Fechar aviso" onClick={() => dismiss.current()}>Fechar</button>
      )}
    </div>
  );
}
