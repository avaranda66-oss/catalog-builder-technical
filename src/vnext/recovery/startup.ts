import type {
  CatalogPersistenceEnvelope,
  CatalogRepository,
  PersistenceError,
  PersistenceResult,
  SaveCatalogCasRequest,
} from '@/vnext/persistence/contracts';
import { parsePersistenceEnvelope } from '@/vnext/persistence/snapshot';
import { recoveryKeyToken, type PendingRemoteMutation, type RecoveryKey } from './contracts';
import type { RecoveryCoordinator } from './coordinator';
import type { RecoveryDecision, RemoteRecoveryState } from './decision';
import { digestCanonicalDocument } from './digest';
import type { RecoveryDeleteResult, RecoveryInspection } from './repository';

export interface RecoveryStartupCandidate {
  readonly id: string;
  readonly inspection: RecoveryInspection;
  readonly decision: RecoveryDecision;
}

export type PendingRecoveryReconciliation =
  | {
      readonly status: 'ACKNOWLEDGED';
      readonly envelope: CatalogPersistenceEnvelope;
      readonly cleanup: RecoveryDeleteResult;
    }
  | {
      readonly status: 'PRESERVED';
      readonly error: PersistenceError | { readonly code: 'REMOTE_DIVERGENCE'; readonly message: string };
    }
  | { readonly status: 'NOT_PENDING' };

export interface RecoveryStartupCoordinatorOptions {
  readonly coordinator: RecoveryCoordinator;
  readonly repository: CatalogRepository;
  readonly getActiveAuthorityScopeId?: () => string;
}

function candidateKey(candidate: RecoveryStartupCandidate): RecoveryKey {
  return candidate.inspection.key;
}

function availableRemote(decision: RecoveryDecision): CatalogPersistenceEnvelope | undefined {
  return 'remote' in decision ? decision.remote : undefined;
}

async function provesPendingMutation(
  envelope: CatalogPersistenceEnvelope,
  pending: PendingRemoteMutation
): Promise<boolean> {
  return envelope.catalogId === pending.catalogId
    && envelope.lastMutationId === pending.mutationId
    && envelope.remoteRevision === pending.expectedRemoteRevision + 1
    && await digestCanonicalDocument(envelope.documentSnapshot) === pending.attemptDigest;
}

export class RecoveryStartupCoordinator {
  constructor(private readonly options: RecoveryStartupCoordinatorOptions) {}

  async discover(authorityScopeId: string): Promise<readonly RecoveryStartupCandidate[]> {
    if (
      this.options.getActiveAuthorityScopeId
      && this.options.getActiveAuthorityScopeId() !== authorityScopeId
    ) return [];
    const inspections = await this.options.coordinator.discover(authorityScopeId);
    if (
      this.options.getActiveAuthorityScopeId
      && this.options.getActiveAuthorityScopeId() !== authorityScopeId
    ) return [];
    return Promise.all(inspections.map(async (inspection) => {
      if (inspection.status === 'INVALID') {
        return {
          id: recoveryKeyToken(inspection.key),
          inspection,
          decision: await this.options.coordinator.compare(inspection, { status: 'UNAVAILABLE' }),
        };
      }
      let remote: PersistenceResult<CatalogPersistenceEnvelope>;
      try {
        remote = await this.options.repository.getCatalog(inspection.key.catalogId);
      } catch {
        remote = { ok: false, error: { code: 'REMOTE_FAILURE' } };
      }
      let remoteState: RemoteRecoveryState = { status: 'UNAVAILABLE' };
      if (remote.ok) {
        try {
          remoteState = {
            status: 'AVAILABLE' as const,
            envelope: parsePersistenceEnvelope(remote.value),
          };
        } catch {
          remoteState = { status: 'UNAVAILABLE' as const };
        }
      }
      const decision = await this.options.coordinator.compare(inspection, remoteState);
      return { id: recoveryKeyToken(inspection.key), inspection, decision };
    }));
  }

  inspect(candidate: RecoveryStartupCandidate, authorityScopeId: string): RecoveryInspection {
    if (
      candidateKey(candidate).authorityScopeId !== authorityScopeId
      || (
        this.options.getActiveAuthorityScopeId
        && this.options.getActiveAuthorityScopeId() !== authorityScopeId
      )
    ) {
      throw new Error('Foreign authority scope cannot inspect recovery');
    }
    return candidate.inspection;
  }

  async discard(
    candidate: RecoveryStartupCandidate,
    authorityScopeId: string
  ): Promise<RecoveryDeleteResult> {
    const inspection = this.inspect(candidate, authorityScopeId);
    if (inspection.status !== 'VALID') return { status: 'INVALID_PRESERVED' };
    return this.options.coordinator.deleteIfGeneration(
      inspection.key,
      inspection.record.recoveryGeneration
    );
  }

  async reconcilePending(
    candidate: RecoveryStartupCandidate,
    authorityScopeId: string
  ): Promise<PendingRecoveryReconciliation> {
    const inspection = this.inspect(candidate, authorityScopeId);
    if (inspection.status !== 'VALID' || !inspection.record.pendingRemoteMutation) {
      return { status: 'NOT_PENDING' };
    }
    const pending = inspection.record.pendingRemoteMutation;
    const provenRemote = availableRemote(candidate.decision);
    if (
      candidate.decision.kind === 'REDUNDANT_ALREADY_IN_CLOUD'
      && provenRemote
      && provenRemote.lastMutationId === pending.mutationId
    ) {
      return {
        status: 'ACKNOWLEDGED',
        envelope: provenRemote,
        cleanup: await this.discard(candidate, authorityScopeId),
      };
    }
    if (candidate.decision.kind !== 'RECOVERABLE_OVER_SAME_REMOTE_BASE') {
      return {
        status: 'PRESERVED',
        error: {
          code: 'REMOTE_DIVERGENCE',
          message: 'Pending mutation cannot be replayed against an unproven remote base',
        },
      };
    }

    const request: SaveCatalogCasRequest = {
      mutationId: pending.mutationId,
      catalogId: pending.catalogId,
      expectedRemoteRevision: pending.expectedRemoteRevision,
      documentSnapshot: pending.attemptedDocumentSnapshot,
    };
    let replay: PersistenceResult<CatalogPersistenceEnvelope>;
    try {
      replay = await this.options.repository.saveCAS(request);
    } catch (error) {
      return this.verifyAmbiguousReplay(
        candidate,
        authorityScopeId,
        pending,
        { code: 'REMOTE_FAILURE', message: error instanceof Error ? error.message : String(error) }
      );
    }
    if (!replay.ok) {
      if (
        replay.error.code === 'AMBIGUOUS_COMMIT_OUTCOME'
        || replay.error.code === 'OFFLINE'
        || replay.error.code === 'REMOTE_FAILURE'
      ) {
        return this.verifyAmbiguousReplay(candidate, authorityScopeId, pending, replay.error);
      }
      return { status: 'PRESERVED', error: replay.error };
    }

    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(replay.value);
    } catch (error) {
      return {
        status: 'PRESERVED',
        error: {
          code: 'REMOTE_DIVERGENCE',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    const replayDigest = await digestCanonicalDocument(envelope.documentSnapshot);
    if (
      envelope.catalogId !== pending.catalogId
      || envelope.lastMutationId !== pending.mutationId
      || envelope.remoteRevision !== pending.expectedRemoteRevision + 1
      || replayDigest !== pending.attemptDigest
    ) {
      return {
        status: 'PRESERVED',
        error: {
          code: 'REMOTE_DIVERGENCE',
          message: 'Replay acknowledgement does not prove the captured pending mutation',
        },
      };
    }
    return {
      status: 'ACKNOWLEDGED',
      envelope,
      cleanup: await this.discard(candidate, authorityScopeId),
    };
  }

  private async verifyAmbiguousReplay(
    candidate: RecoveryStartupCandidate,
    authorityScopeId: string,
    pending: PendingRemoteMutation,
    fallbackError: PersistenceError
  ): Promise<PendingRecoveryReconciliation> {
    let read: PersistenceResult<CatalogPersistenceEnvelope>;
    try {
      read = await this.options.repository.getCatalog(pending.catalogId);
    } catch {
      return { status: 'PRESERVED', error: fallbackError };
    }
    if (!read.ok) return { status: 'PRESERVED', error: fallbackError };
    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(read.value);
    } catch {
      return { status: 'PRESERVED', error: fallbackError };
    }
    if (!await provesPendingMutation(envelope, pending)) {
      return { status: 'PRESERVED', error: fallbackError };
    }
    return {
      status: 'ACKNOWLEDGED',
      envelope,
      cleanup: await this.discard(candidate, authorityScopeId),
    };
  }
}
