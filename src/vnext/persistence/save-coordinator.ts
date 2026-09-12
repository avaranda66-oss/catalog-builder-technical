import type { DocumentSession } from '../application';
import type { CatalogDocument } from '../domain';
import type {
  CatalogPersistenceEnvelope,
  CatalogRepository,
  PersistenceErrorCode,
  PersistenceResult,
  SaveCatalogCasRequest,
} from './contracts';
import { canonicalDocumentEquivalence } from './equivalence';
import { parseCanonicalSnapshot, parsePersistenceEnvelope } from './snapshot';
import type { PersistenceWorkspace } from './workspace';

export type SaveFailureCode =
  | PersistenceErrorCode
  | 'UNBOUND'
  | 'AUTHORING_BLOCKED'
  | 'SAVE_IN_FLIGHT_NEWER_WORK'
  | 'STALE_RESULT'
  | 'REMOTE_DIVERGENCE';

export type ManualSaveResult =
  | { readonly ok: true; readonly acknowledged: boolean; readonly joined?: boolean }
  | {
      readonly ok: false;
      readonly error: { readonly code: SaveFailureCode; readonly message?: string };
    };

interface SaveAttempt {
  readonly openSessionId: string;
  readonly authLineage: string;
  readonly session: DocumentSession;
  readonly localSequence: number;
  readonly equivalence: string;
  readonly previousLastMutationId: string;
  readonly request: SaveCatalogCasRequest;
}
interface SaveFlight {
  readonly attempt: SaveAttempt;
  readonly promise: Promise<ManualSaveResult>;
}

export interface SaveCoordinatorOptions {
  readonly workspace: PersistenceWorkspace;
  readonly repository: CatalogRepository;
  readonly createMutationId: () => string;
}

export class SaveCoordinator {
  private flight: SaveFlight | undefined;
  private ambiguousAttempt: SaveAttempt | undefined;

  constructor(private readonly options: SaveCoordinatorOptions) {}

  hasUnresolvedActiveMutation(): boolean {
    const active = this.options.workspace.getSnapshot().binding;
    return Boolean(
      (this.flight && this.flight.attempt.openSessionId === active.openSessionId)
      || (this.ambiguousAttempt && this.ambiguousAttempt.openSessionId === active.openSessionId)
    );
  }

  async save(): Promise<ManualSaveResult> {
    const workspaceSnapshot = this.options.workspace.getSnapshot();
    const { binding, session } = workspaceSnapshot;
    if (binding.kind !== 'PERSISTED') {
      return { ok: false, error: { code: 'UNBOUND', message: 'Catalog is not persisted yet' } };
    }

    if (this.ambiguousAttempt?.openSessionId === binding.openSessionId) {
      return this.reconcileAmbiguous(this.ambiguousAttempt);
    }

    const existing = this.flight;
    if (existing?.attempt.openSessionId === binding.openSessionId) {
      const current = session.getSnapshot();
      const equivalence = canonicalDocumentEquivalence(current.document);
      if (
        current.localSequence === existing.attempt.localSequence
        && equivalence === existing.attempt.equivalence
        && !this.options.workspace.getAuthoringBarrier().hasPendingDraft()
      ) {
        const joined = await existing.promise;
        return joined.ok ? { ...joined, joined: true } : joined;
      }
      return {
        ok: false,
        error: {
          code: 'SAVE_IN_FLIGHT_NEWER_WORK',
          message: 'A save is already in flight for an older local state',
        },
      };
    }

    const barrier = this.options.workspace.getAuthoringBarrier();
    const barrierResult = barrier.prepareForSave();
    this.options.workspace.notifyDraftStateChanged();
    if (!barrierResult.ok) {
      this.options.workspace.setPhase('blocked', barrierResult.message);
      return { ok: false, error: { code: 'AUTHORING_BLOCKED', message: barrierResult.message } };
    }

    const afterBarrier = session.getSnapshot();
    let documentSnapshot: CatalogDocument;
    try {
      documentSnapshot = parseCanonicalSnapshot(afterBarrier.document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.workspace.setPhase('blocked', message);
      return { ok: false, error: { code: 'INVALID_DOCUMENT', message } };
    }

    const equivalence = canonicalDocumentEquivalence(documentSnapshot);
    const currentBinding = this.options.workspace.getSnapshot().binding;
    if (
      currentBinding.kind !== 'PERSISTED'
      || currentBinding.openSessionId !== binding.openSessionId
      || currentBinding.authLineage !== binding.authLineage
    ) {
      return { ok: false, error: { code: 'STALE_RESULT' } };
    }
    if (equivalence === currentBinding.acknowledgedEquivalence && !barrier.hasPendingDraft()) {
      this.options.workspace.setPhase('idle');
      return { ok: true, acknowledged: true };
    }

    const attempt: SaveAttempt = {
      openSessionId: currentBinding.openSessionId,
      authLineage: currentBinding.authLineage,
      session,
      localSequence: afterBarrier.localSequence,
      equivalence,
      previousLastMutationId: currentBinding.lastMutationId,
      request: {
        mutationId: this.options.createMutationId(),
        catalogId: currentBinding.catalogId,
        expectedRemoteRevision: currentBinding.remoteRevision,
        documentSnapshot,
      },
    };

    this.options.workspace.setPhase('saving');
    const promise = this.dispatchAttempt(attempt);
    const flight: SaveFlight = { attempt, promise };
    this.flight = flight;
    try {
      return await promise;
    } finally {
      if (this.flight === flight) this.flight = undefined;
    }
  }

  private isCurrent(attempt: SaveAttempt): boolean {
    const snapshot = this.options.workspace.getSnapshot();
    return snapshot.session === attempt.session
      && this.options.workspace.matches(attempt.openSessionId, attempt.authLineage);
  }

  private acceptEnvelope(
    attempt: SaveAttempt,
    input: CatalogPersistenceEnvelope
  ): ManualSaveResult {
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.workspace.setPhase('conflict', message);
      return { ok: false, error: { code: 'REMOTE_DIVERGENCE', message } };
    }
    if (
      envelope.catalogId !== attempt.request.catalogId
      || envelope.lastMutationId !== attempt.request.mutationId
      || envelope.remoteRevision !== attempt.request.expectedRemoteRevision + 1
      || canonicalDocumentEquivalence(envelope.documentSnapshot) !== attempt.equivalence
    ) {
      this.options.workspace.setPhase(
        'conflict',
        'Authoritative save acknowledgement does not match the attempted mutation'
      );
      return { ok: false, error: { code: 'REMOTE_DIVERGENCE' } };
    }
    this.ambiguousAttempt = undefined;
    this.options.workspace.acknowledge(
      attempt.openSessionId,
      attempt.authLineage,
      envelope,
      attempt.localSequence
    );
    return { ok: true, acknowledged: true };
  }

  private handleKnownFailure(
    attempt: SaveAttempt,
    code: PersistenceErrorCode,
    message?: string
  ): ManualSaveResult {
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    if (code === 'CONFLICT') this.options.workspace.setPhase('conflict', message);
    else if (code === 'UNAUTHORIZED') {
      this.options.workspace.setPhase('unauthorized', message ?? 'Sign in again to save');
    } else if (code === 'OFFLINE' || code === 'REMOTE_FAILURE') {
      this.options.workspace.setPhase('unavailable', message);
    } else {
      this.options.workspace.setPhase('blocked', message);
    }
    return { ok: false, error: { code, ...(message ? { message } : {}) } };
  }

  private async dispatchAttempt(attempt: SaveAttempt): Promise<ManualSaveResult> {
    let result: PersistenceResult<CatalogPersistenceEnvelope>;
    try {
      result = await this.options.repository.saveCAS(attempt.request);
    } catch (error) {
      if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
      this.ambiguousAttempt = attempt;
      this.options.workspace.setPhase(
        'ambiguous',
        error instanceof Error ? error.message : 'Could not verify whether the dispatched save committed'
      );
      return this.reconcileAmbiguous(attempt);
    }

    if (result.ok) return this.acceptEnvelope(attempt, result.value);
    if (result.error.code !== 'AMBIGUOUS_COMMIT_OUTCOME') {
      return this.handleKnownFailure(attempt, result.error.code, result.error.message);
    }
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    this.ambiguousAttempt = attempt;
    return this.reconcileAmbiguous(attempt);
  }

  private async reconcileAmbiguous(attempt: SaveAttempt): Promise<ManualSaveResult> {
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    this.options.workspace.setPhase('ambiguous', 'Verifying the previous save');

    let read: PersistenceResult<CatalogPersistenceEnvelope>;
    try {
      read = await this.options.repository.getCatalog(attempt.request.catalogId);
    } catch (error) {
      this.ambiguousAttempt = attempt;
      const message = error instanceof Error ? error.message : String(error);
      this.options.workspace.setPhase('ambiguous', message);
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message } };
    }
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    if (!read.ok) {
      this.ambiguousAttempt = attempt;
      this.options.workspace.setPhase('ambiguous', read.error.message ?? 'Could not verify save');
      return {
        ok: false,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message: read.error.message },
      };
    }

    let authoritative: CatalogPersistenceEnvelope;
    try {
      authoritative = parsePersistenceEnvelope(read.value);
    } catch (error) {
      this.ambiguousAttempt = undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.options.workspace.setPhase('conflict', message);
      return { ok: false, error: { code: 'REMOTE_DIVERGENCE', message } };
    }
    if (authoritative.lastMutationId === attempt.request.mutationId) {
      return this.acceptEnvelope(attempt, authoritative);
    }
    if (authoritative.remoteRevision > attempt.request.expectedRemoteRevision) {
      this.ambiguousAttempt = undefined;
      this.options.workspace.setPhase('conflict', 'The server advanced with a different mutation');
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    if (
      authoritative.remoteRevision !== attempt.request.expectedRemoteRevision
      || authoritative.lastMutationId !== attempt.previousLastMutationId
    ) {
      this.ambiguousAttempt = undefined;
      this.options.workspace.setPhase(
        'conflict',
        'Authoritative state diverged while reconciling save'
      );
      return { ok: false, error: { code: 'CONFLICT' } };
    }

    let replay: PersistenceResult<CatalogPersistenceEnvelope>;
    try {
      replay = await this.options.repository.saveCAS(attempt.request);
    } catch (error) {
      this.ambiguousAttempt = attempt;
      const message = error instanceof Error ? error.message : String(error);
      this.options.workspace.setPhase('ambiguous', message);
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message } };
    }
    if (!this.isCurrent(attempt)) return { ok: false, error: { code: 'STALE_RESULT' } };
    if (replay.ok) return this.acceptEnvelope(attempt, replay.value);
    if (
      replay.error.code === 'AMBIGUOUS_COMMIT_OUTCOME'
      || replay.error.code === 'OFFLINE'
      || replay.error.code === 'REMOTE_FAILURE'
    ) {
      this.ambiguousAttempt = attempt;
      this.options.workspace.setPhase('ambiguous', replay.error.message ?? 'Could not verify save');
      return {
        ok: false,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME', message: replay.error.message },
      };
    }
    this.ambiguousAttempt = undefined;
    return this.handleKnownFailure(attempt, replay.error.code, replay.error.message);
  }
}
