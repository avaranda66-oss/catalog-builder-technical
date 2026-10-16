import React from 'react';
import type { ConflictResolutionCoordinator, ConflictResolutionState, SaveProjection } from '../../persistence';
import { classifyEditorNotice, editorNoticeAutoHides, SUCCESS_NOTICE_TIMEOUT_MS } from '../../editor/editor-notices';
import { fatherSaveExplanation } from '../save-presentation';
import './EditorNotices.css';

const SAVE_PROBLEM_PHASES: ReadonlySet<SaveProjection['phase']> = new Set(['ambiguous', 'unavailable', 'unauthorized', 'blocked']);

export interface EditorNoticesProps {
  /** The editor's latest status sentence. */
  message: string | null;
  onDismissMessage: () => void;
  /** Reports a new status sentence (used when a conflict choice fails). */
  onMessage: (message: string) => void;
  documentTitle: string;
  save?: SaveProjection;
  localProtectionUnavailable?: boolean;
  conflictState?: ConflictResolutionState;
  conflictResolution?: Pick<ConflictResolutionCoordinator, 'openLatest' | 'saveAsCopy'>;
}

/**
 * FR-12: one fixed area right under the top bar, above the page, so messages are seen without scrolling.
 * Save problems and conflicts are bands that stay while they last (they are part of the layout). The latest status
 * message floats over the top of the workspace instead, so it never pushes the page down or pulls it back up: a
 * finished change leaves after 4 s; an error or an instruction stays until the person closes it or the next message
 * replaces it.
 */
export function EditorNotices({
  message, onDismissMessage, onMessage, documentTitle, save, localProtectionUnavailable, conflictState = 'idle', conflictResolution,
}: EditorNoticesProps) {
  const conflict = save?.phase === 'conflict' && conflictResolution;
  const saveProblem = save !== undefined && SAVE_PROBLEM_PHASES.has(save.phase);
  return (
    <div className="vnext-editor-notices" data-editor-notices="">
      {(localProtectionUnavailable || conflict || saveProblem) && (
        <div className="vnext-editor-notice-bands" data-editor-notice-bands="">
          {localProtectionUnavailable && (
            <p className="vnext-status vnext-editor-notice-band" data-tone="warning" role="alert">
              Não foi possível proteger as alterações neste computador. Mantenha esta aba aberta e use Salvar antes de sair.
            </p>
          )}
          {conflict && (
            <ConflictNotice documentTitle={documentTitle} state={conflictState} resolution={conflict} onMessage={onMessage} />
          )}
          {saveProblem && (
            <p className="vnext-status vnext-editor-notice-band" data-tone="error" role="alert" data-save-problem="">
              {fatherSaveExplanation(save)}
            </p>
          )}
        </div>
      )}
      {/* Keyed by the sentence: a new message starts with a fresh timer and is not paused by an old hover. */}
      {message && <TransientNotice key={message} message={message} onDismiss={onDismissMessage} />}
    </div>
  );
}

function TransientNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const tone = classifyEditorNotice(message);
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

/** FR-43 (safe text): the copy keeps everything on screen; opening the latest version asks before discarding. */
function ConflictNotice({ documentTitle, state, resolution, onMessage }: {
  documentTitle: string;
  state: ConflictResolutionState;
  resolution: Pick<ConflictResolutionCoordinator, 'openLatest' | 'saveAsCopy'>;
  onMessage: (message: string) => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const busy = state !== 'idle';
  const saveAsCopy = () => {
    setConfirming(false);
    void resolution.saveAsCopy().then((result) => {
      if (!result.ok) onMessage('Não foi possível salvar seu trabalho como cópia. Mantenha esta aba aberta e tente novamente.');
    });
  };
  const openLatest = () => {
    setConfirming(false);
    void resolution.openLatest().then((result) => {
      if (!result.ok) onMessage('Não foi possível abrir a versão mais recente. Mantenha esta aba aberta e tente novamente.');
    });
  };
  return (
    <section className="vnext-status vnext-editor-notice-band vnext-conflict-notice" data-tone="warning" role="alert"
      aria-labelledby="vnext-conflict-heading" data-save-conflict="">
      <h2 id="vnext-conflict-heading">Este catálogo foi salvo em outro lugar enquanto você editava.</h2>
      <p>Suas alterações continuam nesta tela, mas ainda não foram salvas no catálogo.</p>
      {confirming && !busy ? (
        <p><strong>Tem certeza?</strong> As alterações desta tela que ainda não foram salvas serão descartadas.</p>
      ) : (
        <ul>
          <li><strong>Salvar meu trabalho como cópia:</strong> cria o catálogo “Cópia de {documentTitle}” com tudo o que está nesta tela. O catálogo original fica com a versão salva em outro lugar.</li>
          <li><strong>Abrir versão mais recente:</strong> mostra a versão salva em outro lugar e descarta as alterações desta tela.</li>
        </ul>
      )}
      <div className="vnext-editor-notice-actions" data-persistence-conflict-actions="">
        {confirming && !busy ? <>
          <button type="button" className="vnext-btn-primary" onClick={openLatest}>Sim, descartar minhas alterações</button>
          <button type="button" className="vnext-btn-secondary" onClick={() => setConfirming(false)}>Não, voltar</button>
        </> : <>
          <button type="button" className="vnext-btn-primary" disabled={busy} onClick={saveAsCopy}>
            {state === 'resolving-save-as-copy' ? 'Salvando cópia…' : 'Salvar meu trabalho como cópia'}
          </button>
          <button type="button" className="vnext-btn-secondary" disabled={busy} onClick={() => setConfirming(true)}>
            {state === 'resolving-open-latest' ? 'Abrindo versão mais recente…' : 'Abrir versão mais recente'}
          </button>
        </>}
      </div>
    </section>
  );
}
