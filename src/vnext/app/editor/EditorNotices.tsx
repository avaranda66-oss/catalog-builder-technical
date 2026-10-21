import React from 'react';
import type { SaveProjection } from '../../persistence';
import {
  editorNoticeText, editorNoticeTimeoutMs, editorNoticeTone, SUCCESS_NOTICE_TIMEOUT_MS, type EditorNoticeInput,
} from '../../editor/editor-notices';
import { fatherSaveExplanation } from '../save-presentation';
import './EditorNotices.css';

const SAVE_PROBLEM_PHASES: ReadonlySet<SaveProjection['phase']> = new Set(['ambiguous', 'unavailable', 'unauthorized', 'blocked']);

export interface EditorNoticesProps {
  /** The editor's latest status sentence, optionally with the tone the caller already knows. */
  message: EditorNoticeInput | null;
  onDismissMessage: () => void;
  save?: SaveProjection;
  localProtectionUnavailable?: boolean;
}

/**
 * FR-12: one fixed area right under the top bar, above the page, so messages are seen without scrolling.
 * Save problems are bands that stay while they last (they are part of the layout). The latest status message floats
 * over the top of the workspace instead, so it never pushes the page down or pulls it back up: a short finished
 * change leaves after 4 s; a longer one, which only adds a tip, after 6 to 8 s (paused while the pointer is over it);
 * an error or an instruction stays until the person closes it or the next message replaces it. The message never
 * takes clicks away from the page: the area is click-through outside the cards, and use-notice-anchor.ts keeps the
 * card off the selected object (J5).
 * FR-44: every save problem has its plain explanation here, also in the simple mode. FR-43: a conflict is not a
 * band: the editor shows the blocking SaveConflictDialog (rendered outside the editor shell, see ConflictDialog.tsx).
 */
export function EditorNotices({ message, onDismissMessage, save, localProtectionUnavailable }: EditorNoticesProps) {
  const saveProblem = save !== undefined && SAVE_PROBLEM_PHASES.has(save.phase);
  return (
    <div className="vnext-editor-notices" data-editor-notices="">
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
  const timeoutMs = editorNoticeTimeoutMs(notice);
  const [paused, setPaused] = React.useState(false);
  // The editor re-renders often; keep the timer tied to the message, not to the callback identity.
  const dismiss = React.useRef(onDismiss);
  dismiss.current = onDismiss;
  React.useEffect(() => {
    if (timeoutMs === null || paused) return;
    const timer = globalThis.setTimeout(() => dismiss.current(), timeoutMs);
    return () => globalThis.clearTimeout(timer);
  }, [timeoutMs, paused]);
  return (
    <div
      className="vnext-editor-notice"
      role="status"
      data-tone={tone}
      data-editor-notice=""
      data-notice-stays={timeoutMs === null ? 'until-closed' : timeoutMs > SUCCESS_NOTICE_TIMEOUT_MS ? 'long' : 'short'}
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
