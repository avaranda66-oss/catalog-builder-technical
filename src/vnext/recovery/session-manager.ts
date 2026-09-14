import type { CatalogDocument } from '@/vnext/domain';
import type { CatalogPersistenceEnvelope } from '@/vnext/persistence/contracts';
import { canonicalDocumentEquivalence } from '@/vnext/persistence/equivalence';
import type { AuthoringRecoveryOverlay, PendingRemoteMutation, RecoveryKey, RecoveryRecord } from './contracts';
import { RecoveryCoordinator } from './coordinator';
import { digestCanonicalDocument } from './digest';
import { RecoveryWriteScheduler, type RecoverySchedulerClock } from './scheduler';

export interface SessionRecoverySource {
  readonly ownerAuthorityScopeId: string;
  readonly activeAuthorityScopeId: string;
  readonly catalogId: string;
  readonly openSessionId: string;
  readonly localEditSequence: number;
  readonly documentSnapshot: CatalogDocument;
  readonly baseRemoteRevision: number;
  readonly baseRemoteSnapshot: CatalogDocument;
  readonly dirty: boolean;
  readonly authoringRecoveryOverlay?: AuthoringRecoveryOverlay;
}

export interface SessionRecoveryManagerOptions {
  readonly coordinator: RecoveryCoordinator;
  readonly getSource: () => SessionRecoverySource;
  readonly subscribe: (listener: () => void) => () => void;
  readonly clock?: RecoverySchedulerClock;
  readonly trailingMs?: number;
  readonly maxWaitMs?: number;
  readonly onProtectionAvailable?: () => void;
  readonly onProtectionUnavailable?: (message: string) => void;
}

function sourceKey(source: SessionRecoverySource): RecoveryKey {
  return {
    authorityScopeId: source.ownerAuthorityScopeId,
    catalogId: source.catalogId,
    openSessionId: source.openSessionId,
  };
}

function sourceToken(source: SessionRecoverySource, pending?: PendingRemoteMutation): string {
  return JSON.stringify({
    ownerAuthorityScopeId: source.ownerAuthorityScopeId,
    activeAuthorityScopeId: source.activeAuthorityScopeId,
    catalogId: source.catalogId,
    openSessionId: source.openSessionId,
    localEditSequence: source.localEditSequence,
    document: canonicalDocumentEquivalence(source.documentSnapshot),
    baseRemoteRevision: source.baseRemoteRevision,
    base: canonicalDocumentEquivalence(source.baseRemoteSnapshot),
    dirty: source.dirty,
    overlay: source.authoringRecoveryOverlay,
    pending,
  });
}

export class SessionRecoveryManager {
  private readonly scheduler: RecoveryWriteScheduler<SessionRecoverySource>;
  private readonly unsubscribe: () => void;
  private pendingRemoteMutation: PendingRemoteMutation | undefined;
  private lastScheduledToken: string | undefined;
  private lastWrittenRecord: RecoveryRecord | undefined;

  constructor(private readonly options: SessionRecoveryManagerOptions) {
    this.scheduler = new RecoveryWriteScheduler({
      write: (source) => this.persist(source),
      clock: options.clock,
      trailingMs: options.trailingMs,
      maxWaitMs: options.maxWaitMs,
      onError: (error) => options.onProtectionUnavailable?.(
        error instanceof Error ? error.message : 'Proteção local indisponível.'
      ),
    });
    this.unsubscribe = options.subscribe(() => this.scheduleCurrent());
  }

  private ownsActiveScope(source: SessionRecoverySource): boolean {
    return source.ownerAuthorityScopeId === source.activeAuthorityScopeId;
  }

  private scheduleCurrent(): void {
    const source = this.options.getSource();
    if (!this.ownsActiveScope(source)) return;
    if (
      !source.dirty
      && !source.authoringRecoveryOverlay
      && !this.pendingRemoteMutation
      && !this.lastWrittenRecord
    ) return;
    const token = sourceToken(source, this.pendingRemoteMutation);
    if (token === this.lastScheduledToken) return;
    this.lastScheduledToken = token;
    this.scheduler.schedule(source);
  }

  private async persist(source: SessionRecoverySource, baseOverride?: CatalogPersistenceEnvelope): Promise<void> {
    if (!this.ownsActiveScope(source)) return;
    if (!source.dirty && !source.authoringRecoveryOverlay && !this.pendingRemoteMutation) {
      const written = this.lastWrittenRecord;
      if (!written) return;
      const deletion = await this.options.coordinator.deleteIfGeneration(
        sourceKey(source),
        written.recoveryGeneration
      );
      if (deletion.status === 'DELETED' || deletion.status === 'NOT_FOUND') {
        this.lastWrittenRecord = undefined;
      }
      this.options.onProtectionAvailable?.();
      return;
    }
    const baseRemoteSnapshot = baseOverride?.documentSnapshot ?? source.baseRemoteSnapshot;
    const outcome = await this.options.coordinator.write({
      ...sourceKey(source),
      localEditSequence: source.localEditSequence,
      baseRemoteRevision: baseOverride?.remoteRevision ?? source.baseRemoteRevision,
      baseRemoteSnapshotDigest: await digestCanonicalDocument(baseRemoteSnapshot),
      documentSnapshot: source.documentSnapshot,
      ...(this.pendingRemoteMutation
        ? {
            pendingRemoteMutation: {
              mutationId: this.pendingRemoteMutation.mutationId,
              catalogId: this.pendingRemoteMutation.catalogId,
              expectedRemoteRevision: this.pendingRemoteMutation.expectedRemoteRevision,
              previousLastMutationId: this.pendingRemoteMutation.previousLastMutationId,
              capturedLocalEditSequence: this.pendingRemoteMutation.capturedLocalEditSequence,
              attemptedDocumentSnapshot: this.pendingRemoteMutation.attemptedDocumentSnapshot,
            },
          }
        : {}),
      ...(source.authoringRecoveryOverlay ? { authoringRecoveryOverlay: source.authoringRecoveryOverlay } : {}),
    });
    if (outcome.storage.status !== 'STALE') this.lastWrittenRecord = outcome.record;
    this.options.onProtectionAvailable?.();
  }

  start(): void {
    this.scheduleCurrent();
  }

  async flushPendingMutation(pendingRemoteMutation: PendingRemoteMutation): Promise<void> {
    const source = this.options.getSource();
    if (!this.ownsActiveScope(source)) throw new Error('Recovery authority scope is not active');
    this.pendingRemoteMutation = pendingRemoteMutation;
    this.lastScheduledToken = undefined;
    this.scheduleCurrent();
    await this.scheduler.flush();
    if (this.lastWrittenRecord?.pendingRemoteMutation?.mutationId !== pendingRemoteMutation.mutationId) {
      throw new Error('Pending remote mutation was not committed to recovery');
    }
  }

  async acknowledge(pendingRemoteMutation: PendingRemoteMutation, envelope: CatalogPersistenceEnvelope): Promise<void> {
    if (this.pendingRemoteMutation?.mutationId !== pendingRemoteMutation.mutationId) return;
    const source = this.options.getSource();
    if (!this.ownsActiveScope(source)) return;
    this.pendingRemoteMutation = undefined;
    this.lastScheduledToken = undefined;
    const overlay = source.authoringRecoveryOverlay;
    const liveMatchesAcknowledgement = canonicalDocumentEquivalence(source.documentSnapshot)
      === canonicalDocumentEquivalence(envelope.documentSnapshot);
    if (liveMatchesAcknowledgement && !overlay) {
      const written = this.lastWrittenRecord;
      if (written) {
        await this.options.coordinator.deleteIfGeneration(sourceKey(source), written.recoveryGeneration);
      }
      this.lastWrittenRecord = undefined;
      return;
    }
    await this.persist(source, envelope);
  }

  getLastWrittenRecord(): RecoveryRecord | undefined {
    return this.lastWrittenRecord;
  }

  async flush(): Promise<void> {
    await this.scheduler.flush();
  }

  async close(): Promise<void> {
    this.unsubscribe();
    await this.scheduler.close();
  }
}
