import React from 'react';
import type { VNextPersistenceRuntime } from '../persistence';
import type { RecoveryStartupCandidate } from '../recovery';
import { compilePlans, DocumentRenderer } from '../rendering';

function candidateTitle(candidate: RecoveryStartupCandidate): string {
  return candidate.inspection.status === 'VALID'
    ? candidate.inspection.record.documentSnapshot.title
    : `Recuperação inválida (${candidate.inspection.key.catalogId})`;
}

function decisionMessage(candidate: RecoveryStartupCandidate): string {
  switch (candidate.decision.kind) {
    case 'RECOVERABLE_OVER_SAME_REMOTE_BASE':
      return candidate.inspection.status === 'VALID' && candidate.inspection.record.pendingRemoteMutation
        ? 'Uma gravação remota ficou sem confirmação. Verifique-a antes de continuar.'
        : 'Há trabalho local protegido sobre a mesma base da nuvem.';
    case 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT':
      return 'A nuvem mudou. O conteúdo local foi preservado apenas para inspeção.';
    case 'SAME_REVISION_DIGEST_MISMATCH':
      return 'A revisão remota tem conteúdo inesperado. A recuperação foi bloqueada.';
    case 'REMOTE_UNAVAILABLE':
      return 'A nuvem está indisponível. Somente a inspeção local protegida é permitida.';
    case 'INVALID_OR_UNSUPPORTED_RECORD':
      return 'O registro local é inválido ou incompatível e não será aberto.';
    case 'REDUNDANT_ALREADY_IN_CLOUD':
      return 'O trabalho já está confirmado na nuvem.';
    case 'NO_RECOVERY':
      return 'Nenhuma recuperação disponível.';
  }
}

function ProtectedRecoveryInspection({ candidate }: { readonly candidate: RecoveryStartupCandidate }) {
  if (candidate.inspection.status === 'INVALID') {
    return (
      <div className="vnext-recovery-inspection" data-protected-recovery-inspection="">
        <strong>Registro local inválido preservado</strong>
        <p>{candidate.inspection.error.message}</p>
      </div>
    );
  }
  return <ValidRecoveryInspection candidate={candidate} />;
}

function ValidRecoveryInspection({ candidate }: { readonly candidate: RecoveryStartupCandidate }) {
  if (candidate.inspection.status !== 'VALID') return null;
  const { record } = candidate.inspection;
  const compiled = compilePlans(record.documentSnapshot);
  return (
    <div className="vnext-recovery-inspection" data-protected-recovery-inspection="">
      <p><strong>Visualização local protegida</strong> — nenhuma ação salva na nuvem.</p>
      <div className="vnext-recovery-document-preview">
        <DocumentRenderer
          document={record.documentSnapshot}
          plans={compiled.plans}
          assetUrls={new Map()}
        />
      </div>
      {record.authoringRecoveryOverlay?.kind === 'TEXT_DRAFT_V1' && (
        <label>
          <span>Rascunho de texto ainda não confirmado</span>
          <textarea readOnly value={record.authoringRecoveryOverlay.draft} />
        </label>
      )}
      {record.authoringRecoveryOverlay?.kind === 'INSPECTOR_FRAME_DRAFT_V1' && (
        <p>Rascunho do Inspector: {JSON.stringify(record.authoringRecoveryOverlay.draft)}</p>
      )}
    </div>
  );
}

export function RecoveryCenter({
  runtime,
  authorityScopeId,
}: {
  readonly runtime: VNextPersistenceRuntime;
  readonly authorityScopeId: string;
}) {
  const [candidates, setCandidates] = React.useState<readonly RecoveryStartupCandidate[]>([]);
  const [inspectionId, setInspectionId] = React.useState<string>();
  const [confirmDiscardId, setConfirmDiscardId] = React.useState<string>();
  const [message, setMessage] = React.useState<string>();
  const refreshGeneration = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const startup = runtime.recoveryStartup;
    if (!startup) return;
    try {
      const discovered = await startup.discover(authorityScopeId);
      if (
        generation !== refreshGeneration.current
        || runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId
      ) return;
      const visible: RecoveryStartupCandidate[] = [];
      const activeOpenSessionId = runtime.workspace.getSnapshot().binding.openSessionId;
      for (const candidate of discovered) {
        if (candidate.inspection.key.openSessionId === activeOpenSessionId) continue;
        const pending = candidate.inspection.status === 'VALID'
          ? candidate.inspection.record.pendingRemoteMutation
          : undefined;
        if (pending) {
          runtime.workspace.setPhase(
            'ambiguous',
            'Há uma gravação anterior que ainda precisa ser verificada.'
          );
        }
        if (candidate.decision.kind === 'REDUNDANT_ALREADY_IN_CLOUD' && !pending) {
          if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
          await startup.discard(candidate, authorityScopeId);
        } else {
          visible.push(candidate);
        }
      }
      if (generation !== refreshGeneration.current) return;
      setCandidates(visible);
      setMessage(undefined);
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      setCandidates([]);
      setMessage(error instanceof Error ? error.message : 'A recuperação local está indisponível.');
    }
  }, [authorityScopeId, runtime]);

  React.useEffect(() => {
    setCandidates([]);
    setInspectionId(undefined);
    setConfirmDiscardId(undefined);
    void refresh();
  }, [refresh]);

  const remove = (id: string) => setCandidates((current) => current.filter((entry) => entry.id !== id));

  const recover = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    if (await runtime.recover(candidate)) remove(candidate.id);
    else setMessage('A recuperação não pôde ser instalada com segurança.');
  };

  const openCloud = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    const result = await runtime.reopenCoordinator.open(
      candidate.inspection.key.catalogId,
      { allowDiscardUnsaved: true }
    );
    if (result.ok) remove(candidate.id);
    else setMessage(result.error.message ?? 'Não foi possível abrir a versão da nuvem.');
  };

  const reconcile = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    const result = await runtime.recoveryStartup?.reconcilePending(candidate, authorityScopeId);
    if (result?.status === 'ACKNOWLEDGED') {
      await openCloud(candidate);
      return;
    }
    setMessage(result?.status === 'PRESERVED'
      ? result.error.message ?? 'A gravação continua ambígua e foi preservada.'
      : 'Não há gravação pendente para verificar.');
  };

  const discard = async (candidate: RecoveryStartupCandidate) => {
    if (runtime.workspace.getSnapshot().activeAuthorityScopeId !== authorityScopeId) return;
    if (confirmDiscardId !== candidate.id) {
      setConfirmDiscardId(candidate.id);
      return;
    }
    const result = await runtime.recoveryStartup?.discard(candidate, authorityScopeId);
    if (result?.status === 'DELETED' || result?.status === 'NOT_FOUND') remove(candidate.id);
    else setMessage('O registro não foi descartado porque mudou ou é inválido.');
  };

  if (candidates.length === 0 && !message) return null;
  return (
    <section className="vnext-recovery-center" role="dialog" aria-modal="true" aria-label="Recuperação local">
      <div className="vnext-recovery-panel">
        <span className="vnext-info-kicker">Recuperação local</span>
        <h2>Trabalho protegido encontrado</h2>
        {message && <p role="status">{message}</p>}
        {candidates.map((candidate) => {
          const valid = candidate.inspection.status === 'VALID';
          const pending = valid ? candidate.inspection.record.pendingRemoteMutation : undefined;
          const canRecover = valid
            && !pending
            && candidate.decision.kind === 'RECOVERABLE_OVER_SAME_REMOTE_BASE';
          const canOpenCloud = 'remote' in candidate.decision;
          return (
            <article key={candidate.id} className="vnext-recovery-card">
              <h3>{candidateTitle(candidate)}</h3>
              <p>{decisionMessage(candidate)}</p>
              <div className="vnext-recovery-actions">
                {canRecover && <button type="button" onClick={() => void recover(candidate)}>Recuperar trabalho local</button>}
                {pending && <button type="button" onClick={() => void reconcile(candidate)}>Verificar gravação pendente</button>}
                {canOpenCloud && <button type="button" onClick={() => void openCloud(candidate)}>Abrir versão da nuvem</button>}
                <button type="button" onClick={() => setInspectionId(
                  inspectionId === candidate.id ? undefined : candidate.id
                )}>Inspecionar conteúdo local</button>
                {valid && (
                  <button type="button" onClick={() => void discard(candidate)}>
                    {confirmDiscardId === candidate.id ? 'Confirmar descarte local' : 'Descartar recuperação local'}
                  </button>
                )}
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
