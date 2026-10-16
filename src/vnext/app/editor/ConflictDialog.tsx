import React from 'react';
import { createPortal } from 'react-dom';
import type {
  ConflictResolutionCoordinator,
  ConflictResolutionResult,
  ConflictResolutionState,
} from '../../persistence';
import { trapReviewTab, useReviewDialog } from '../review-dialog';
import './ConflictDialog.css';

export type ConflictDialogResolution = Pick<ConflictResolutionCoordinator, 'openLatest' | 'saveAsCopy'> & {
  /** True when opening the latest version first keeps this tab's work as a backup on this computer. */
  readonly keepsLocalBackup?: boolean;
};

export interface ConflictDialogProps {
  readonly documentTitle: string;
  readonly state: ConflictResolutionState;
  readonly resolution: ConflictDialogResolution;
}

function copyFailureMessage(result: ConflictResolutionResult): string | undefined {
  if (result.ok || result.error.code === 'RESOLUTION_IN_PROGRESS') return undefined;
  if (result.error.code === 'STALE_RESULT') return 'A situação do catálogo mudou enquanto a cópia era criada. Escolha de novo.';
  if (result.error.code === 'LOCAL_PROTECTION_UNAVAILABLE') {
    return 'Não foi possível guardar seu trabalho neste computador antes de criar a cópia. Nada foi apagado. Mantenha esta aba aberta e tente de novo.';
  }
  return 'Não foi possível salvar seu trabalho como cópia. Confira a conexão e tente de novo. Seu trabalho continua nesta tela.';
}

function latestFailureMessage(result: ConflictResolutionResult): string | undefined {
  if (result.ok || result.error.code === 'RESOLUTION_IN_PROGRESS') return undefined;
  if (result.error.code === 'STALE_RESULT') return 'A situação do catálogo mudou. Escolha de novo.';
  if (result.error.code === 'LOCAL_PROTECTION_UNAVAILABLE') {
    return 'Não foi possível guardar a cópia de segurança neste computador, então nada foi descartado. Use “Salvar meu trabalho como cópia”.';
  }
  if (result.error.code === 'UNSAVED_CHANGES') {
    return 'O catálogo mudou durante a abertura. Suas alterações foram mantidas nesta tela. Escolha de novo.';
  }
  return 'Não foi possível abrir a versão mais recente. Confira a conexão e tente de novo. Seu trabalho continua nesta tela.';
}

/**
 * FR-43: when someone else (another computer or another tab) saved this catalog first, the editor is
 * blocked until the person chooses. The safe choice comes first and has the focus: "Salvar meu trabalho
 * como cópia" keeps everything on screen in a new catalog. "Abrir versão mais recente" replaces the
 * screen with the other version and always asks before doing it. Escape does not close the dialog,
 * because closing it would let the person keep editing work that cannot be saved.
 */
export function ConflictDialog({ documentTitle, state, resolution }: ConflictDialogProps) {
  const [confirming, setConfirming] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const dialog = React.useRef<HTMLElement>(null);
  const busy = state !== 'idle';
  const step = confirming && !busy ? 'confirm' : 'choose';
  useReviewDialog(dialog, `${step}:${state}:${problem ?? ''}`);

  const copyTitle = `Cópia de ${documentTitle}`;
  const saveAsCopy = () => {
    setConfirming(false);
    setProblem(null);
    void resolution.saveAsCopy().then((result) => setProblem(copyFailureMessage(result) ?? null));
  };
  const openLatest = () => {
    setConfirming(false);
    setProblem(null);
    void resolution.openLatest().then((result) => setProblem(latestFailureMessage(result) ?? null));
  };
  const latestKeeps = resolution.keepsLocalBackup
    ? 'As alterações desta tela não entram no catálogo. Uma cópia de segurança delas fica guardada neste computador e é oferecida da próxima vez que você abrir este catálogo.'
    : 'As alterações desta tela não entram no catálogo e serão descartadas.';

  return createPortal(
    <div className="vnext-conflict-backdrop" data-conflict-dialog-host="">
      <section
        ref={dialog}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="vnext-conflict-dialog-title"
        aria-describedby="vnext-conflict-dialog-description"
        className="vnext-conflict-dialog"
        data-save-conflict=""
        onKeyDown={(event) => {
          trapReviewTab(event);
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
        }}
      >
        <h2 id="vnext-conflict-dialog-title">Este catálogo foi salvo em outro lugar enquanto você editava</h2>
        <p id="vnext-conflict-dialog-description">
          Outra pessoa, ou você em outra aba ou outro computador, salvou “{documentTitle}” antes. As alterações
          que estão nesta tela continuam aqui, mas ainda não foram salvas. Escolha o que fazer:
        </p>
        {step === 'confirm' ? (
          <div className="vnext-conflict-confirm" data-conflict-confirm="">
            <p><strong>Tem certeza?</strong> O catálogo “{documentTitle}” vai mostrar a versão salva no outro lugar.</p>
            <p>{latestKeeps}</p>
          </div>
        ) : (
          <ul className="vnext-conflict-choices">
            <li>
              <strong>Salvar meu trabalho como cópia</strong> (recomendado): cria um catálogo novo, “{copyTitle}”, com tudo o
              que está nesta tela, e ele abre aqui. O catálogo “{documentTitle}” fica com a versão salva no outro lugar;
              nada dele é apagado.
            </li>
            <li>
              <strong>Abrir versão mais recente</strong>: mostra aqui a versão salva no outro lugar. {latestKeeps}
            </li>
          </ul>
        )}
        {problem && <p className="vnext-conflict-problem" role="alert">{problem}</p>}
        <div className="vnext-conflict-actions" data-persistence-conflict-actions="">
          {step === 'confirm' ? <>
            <button type="button" className="vnext-btn-secondary" onClick={() => setConfirming(false)}>Não, voltar</button>
            <button type="button" className="vnext-btn-danger" onClick={openLatest}>Sim, descartar minhas alterações</button>
          </> : <>
            <button type="button" className="vnext-btn-primary" disabled={busy} onClick={saveAsCopy}>
              {state === 'resolving-save-as-copy' ? 'Salvando cópia…' : 'Salvar meu trabalho como cópia'}
            </button>
            <button type="button" className="vnext-btn-secondary" disabled={busy} onClick={() => { setProblem(null); setConfirming(true); }}>
              {state === 'resolving-open-latest' ? 'Abrindo versão mais recente…' : 'Abrir versão mais recente'}
            </button>
          </>}
        </div>
        {busy && <p className="vnext-conflict-progress" role="status">Aguarde, isso leva só alguns segundos.</p>}
      </section>
    </div>,
    document.body
  );
}
