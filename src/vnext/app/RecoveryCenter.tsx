import React from 'react';
import type { VNextPersistenceRuntime } from '../persistence';
import type { RecoveryStartupCandidate } from '../recovery';
import { compilePlans, DocumentRenderer } from '../rendering';
import {
  PENDING_SAVE_PHASE_MESSAGE,
  RECOVERY_KICKER,
  overlayDetail,
  overlayHeading,
  recoveryCandidateSummary,
  recoveryCandidateTitle,
  recoveryDecisionMessage,
} from './recovery-presentation';
import { fatherSaveLabel } from './save-presentation';

export type RecoveryGatePhase = 'PENDING' | 'DECISION' | 'FAILED' | 'RELEASED';

function pendingMutationOf(candidate: RecoveryStartupCandidate) {
  return candidate.inspection.status === 'VALID' ? candidate.inspection.record.pendingRemoteMutation : undefined;
}

/** The catalog this editor opened; only its own local backups may hold the editor. */
function openCatalogId(runtime: VNextPersistenceRuntime): string {
  const snapshot = runtime.workspace.getSnapshot();
  return snapshot.binding.kind === 'PERSISTED'
    ? snapshot.binding.catalogId
    : snapshot.session.getSnapshot().document.id;
}

function ProtectedRecoveryInspection({ candidate }: { readonly candidate: RecoveryStartupCandidate }) {
  if (candidate.inspection.status === 'INVALID') {
    return (
      <div className="vnext-recovery-inspection" data-protected-recovery-inspection="">
        <strong>Cópia de segurança danificada</strong>
        <p>Não é possível mostrar o conteúdo desta cópia. Ela pode ser descartada.</p>
      </div>
    );
  }
  return <ValidRecoveryInspection candidate={candidate} />;
}

function ValidRecoveryInspection({ candidate }: { readonly candidate: RecoveryStartupCandidate }) {
  if (candidate.inspection.status !== 'VALID') return null;
  const { record } = candidate.inspection;
  const compiled = compilePlans(record.documentSnapshot);
  const overlay = record.authoringRecoveryOverlay;
  return (
    <div className="vnext-recovery-inspection" data-protected-recovery-inspection="">
      <p><strong>Somente para ver</strong> — nada aqui é salvo.</p>
      <div className="vnext-recovery-document-preview">
        <DocumentRenderer
          document={record.documentSnapshot}
          plans={compiled.plans}
          assetUrls={new Map()}
        />
      </div>
      {(overlay?.kind === 'TEXT_DRAFT_V1' || overlay?.kind === 'TABLE_TITLE_DRAFT_V1') && (
        <label>
          <span>{overlayHeading(overlay)}</span>
          <textarea readOnly value={overlay.draft} />
        </label>
      )}
      {overlay?.kind === 'INSPECTOR_FRAME_DRAFT_V1' && (
        <p>
          <strong>{overlayHeading(overlay)}:</strong> {overlayDetail(overlay)}
        </p>
      )}
      {overlay?.kind === 'TABLE_CELL_DRAFT_V1' && (
        <div data-recovery-table-cell-draft="">
          <strong>{overlayHeading(overlay)}</strong>
          <p>{overlayDetail(overlay)}</p>
        </div>
      )}
    </div>
  );
}

export function RecoveryCenter({
  runtime,
  authorityScopeId,
  onGatePhaseChange,
}: {
  readonly runtime: VNextPersistenceRuntime;
  readonly authorityScopeId: string;
  readonly onGatePhaseChange: (phase: RecoveryGatePhase) => void;
}) {
  const [candidates, setCandidates] = React.useState<readonly RecoveryStartupCandidate[]>([]);
  const [inspectionId, setInspectionId] = React.useState<string>();
  const [confirmDiscardId, setConfirmDiscardId] = React.useState<string>();
  const [message, setMessage] = React.useState<string>();
  const [phase, setPhase] = React.useState<'PENDING' | 'READY' | 'FAILED'>('PENDING');
  const refreshGeneration = React.useRef(0);
  const markedPendingSave = React.useRef(false);

  const refresh = React.useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const startup = runtime.recoveryStartup;
    if (!startup) return;
    setPhase('PENDING');
    setMessage(undefined);
    const isCurrent = () => (
      generation === refreshGeneration.current
      && runtime.workspace.getSnapshot().activeAuthorityScopeId === authorityScopeId
    );
    try {
      const catalogId = openCatalogId(runtime);
      const discovered = await startup.discover(authorityScopeId, { catalogId });
      if (!isCurrent()) return;
      const visible: RecoveryStartupCandidate[] = [];
      const activeOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;
      for (const candidate of discovered) {
        if (!isCurrent()) return;
        // Backups of other catalogs stay on this computer and never hold this editor.
        if (candidate.inspection.key.catalogId !== catalogId) continue;
        if (candidate.inspection.key.openSessionId === activeOpenSessionId) continue;
        const pending = pendingMutationOf(candidate);
        if (pending && pending.catalogId === catalogId) {
          // Pause saving only for this catalog's own unconfirmed save; resumed once it is resolved.
          markedPendingSave.current = true;
          runtime.workspace.setPhase('ambiguous', PENDING_SAVE_PHASE_MESSAGE);
        }
        if (candidate.decision.kind === 'REDUNDANT_ALREADY_IN_CLOUD' && !pending) {
          await startup.discard(candidate, authorityScopeId);
          if (!isCurrent()) return;
        } else {
          visible.push(candidate);
        }
      }
      if (!isCurrent()) return;
      setCandidates(visible);
      setPhase('READY');
    } catch {
      if (!isCurrent()) return;
      setCandidates([]);
      runtime.workspace.setLocalProtectionUnavailable();
      setMessage('A cópia de segurança deste computador não pôde ser lida.');
      setPhase('FAILED');
    }
  }, [authorityScopeId, runtime]);

  React.useEffect(() => {
    setCandidates([]);
    setInspectionId(undefined);
    setConfirmDiscardId(undefined);
    void refresh();
    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  React.useEffect(() => {
    if (phase === 'PENDING') onGatePhaseChange('PENDING');
    else if (phase === 'FAILED') onGatePhaseChange('FAILED');
    else onGatePhaseChange(candidates.length > 0 ? 'DECISION' : 'RELEASED');
  }, [candidates.length, onGatePhaseChange, phase]);

  React.useEffect(() => {
    // Once no unconfirmed save of this catalog is left (verified or discarded), saving resumes.
    if (phase !== 'READY' || !markedPendingSave.current) return;
    if (candidates.some((candidate) => pendingMutationOf(candidate))) return;
    markedPendingSave.current = false;
    const save = runtime.workspace.getSnapshot().save;
    if (save.phase === 'ambiguous' && save.message === PENDING_SAVE_PHASE_MESSAGE) {
      runtime.workspace.setPhase('idle');
    }
  }, [candidates, phase, runtime]);

  const remove = (id: string) => setCandidates((current) => current.filter((entry) => entry.id !== id));

  const recover = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    if (await runtime.recover(candidate)) remove(candidate.id);
    else {
      await refresh();
      setMessage('As alterações atuais mudaram enquanto a recuperação era verificada.');
    }
  };

  const openCloud = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    const result = await runtime.reopenCoordinator.open(
      candidate.inspection.key.catalogId
    );
    if (result.ok) remove(candidate.id);
    else setMessage(result.error.code === 'UNSAVED_CHANGES'
      ? 'Salve ou descarte as alterações atuais antes de abrir a versão da nuvem.'
      : 'Não foi possível abrir a versão salva. Tente novamente.');
  };

  const reconcile = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    const result = await runtime.recoveryStartup?.reconcilePending(candidate, authorityScopeId);
    if (result?.status === 'ACKNOWLEDGED') {
      await openCloud(candidate);
      return;
    }
    setMessage(result?.status === 'PRESERVED'
      ? 'Não foi possível confirmar o último salvamento. A cópia de segurança continua guardada neste computador.'
      : 'Não há salvamento pendente para verificar.');
  };

  const discard = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    if (confirmDiscardId !== candidate.id) {
      setConfirmDiscardId(candidate.id);
      return;
    }
    try {
      const result = await runtime.recoveryStartup?.discard(candidate, authorityScopeId);
      if (result?.status === 'DELETED' || result?.status === 'NOT_FOUND') {
        remove(candidate.id);
        return;
      }
      await refresh();
      setMessage(result?.status === 'VALID_PRESERVED'
        ? 'A cópia de segurança mudou e foi verificada novamente. Escolha uma opção para continuar.'
        : 'A cópia de segurança mudou e não foi descartada. Veja-a novamente.');
    } catch {
      await refresh();
      setMessage('Não foi possível descartar a cópia de segurança. Tente novamente.');
    }
  };

  const continueWithoutRecovery = () => {
    refreshGeneration.current += 1;
    setCandidates([]);
    setInspectionId(undefined);
    setConfirmDiscardId(undefined);
    setMessage(undefined);
    setPhase('READY');
  };

  if (phase === 'PENDING') {
    return (
      <section className="vnext-recovery-center" role="status" aria-label="Recuperação local">
        <div className="vnext-recovery-panel" data-recovery-startup-state="pending">
          <span className="vnext-info-kicker">{RECOVERY_KICKER}</span>
          <h2>Verificando alterações locais…</h2>
        </div>
      </section>
    );
  }

  if (phase === 'FAILED') {
    return (
      <section className="vnext-recovery-center" role="dialog" aria-modal="true" aria-label="Recuperação local">
        <div className="vnext-recovery-panel" data-recovery-startup-state="failed">
          <span className="vnext-info-kicker">{RECOVERY_KICKER}</span>
          <h2>Não foi possível verificar alterações locais.</h2>
          {message && <p role="status">{message}</p>}
          <div className="vnext-recovery-actions">
            <button type="button" className="vnext-btn-primary" onClick={() => void refresh()}>Tentar novamente</button>
            <button type="button" className="vnext-btn-secondary" onClick={continueWithoutRecovery}>Continuar sem recuperação local</button>
          </div>
        </div>
      </section>
    );
  }

  if (candidates.length === 0 && !message) return null;
  return (
    <section className="vnext-recovery-center" role="dialog" aria-modal="true" aria-label="Recuperação local">
      <div className="vnext-recovery-panel">
        <span className="vnext-info-kicker">{RECOVERY_KICKER}</span>
        <h2>Encontramos alterações deste catálogo que não foram salvas.</h2>
        <p>Elas ficaram guardadas numa cópia de segurança neste computador. Escolha o que fazer antes de continuar.</p>
        {message && <p role="status">{message}</p>}
        {candidates.map((candidate) => {
          const valid = candidate.inspection.status === 'VALID';
          const pending = pendingMutationOf(candidate);
          const canRecover = valid
            && !pending
            && candidate.decision.kind === 'RECOVERABLE_OVER_SAME_REMOTE_BASE';
          const canOpenCloud = 'remote' in candidate.decision;
          const summary = recoveryCandidateSummary(candidate);
          // One recommended choice (navy), the others plain: recover, else check the pending save, else open the saved version.
          const recommended = canRecover ? 'recover' : pending ? 'check' : canOpenCloud ? 'cloud' : undefined;
          const style = (action: 'recover' | 'check' | 'cloud') => action === recommended ? 'vnext-btn-primary' : 'vnext-btn-secondary';
          // This decision sentence already says the last save was not confirmed: do not repeat it in a second line.
          const decisionMentionsPendingSave = Boolean(pending) && candidate.decision.kind === 'RECOVERABLE_OVER_SAME_REMOTE_BASE';
          return (
            <article key={candidate.id} className="vnext-recovery-card">
              <h3>{recoveryCandidateTitle(candidate)}</h3>
              {summary && <p data-recovery-summary="">{summary}</p>}
              <p data-recovery-decision="">{recoveryDecisionMessage(candidate)}</p>
              {pending && !decisionMentionsPendingSave && <p data-save-state="">{fatherSaveLabel(runtime.workspace.getSnapshot().save.label)}</p>}
              <div className="vnext-recovery-actions">
                {canRecover && <button type="button" className={style('recover')} onClick={() => void recover(candidate)}>Recuperar minhas alterações</button>}
                {pending && <button type="button" className={style('check')} onClick={() => void reconcile(candidate)}>Conferir se foi salvo</button>}
                {canOpenCloud && <button type="button" className={style('cloud')} onClick={() => void openCloud(candidate)}>Abrir versão salva na nuvem</button>}
                <button type="button" className="vnext-btn-secondary" onClick={() => setInspectionId(
                  inspectionId === candidate.id ? undefined : candidate.id
                )}>Ver alterações recuperadas</button>
                <button type="button" className="vnext-btn-secondary" onClick={() => void discard(candidate)}>
                  {confirmDiscardId === candidate.id ? 'Sim, apagar a cópia' : 'Apagar a cópia deste computador'}
                </button>
              </div>
              {inspectionId === candidate.id && (
                <ProtectedRecoveryInspection candidate={candidate} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
