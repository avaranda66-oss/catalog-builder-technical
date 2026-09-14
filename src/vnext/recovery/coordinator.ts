import type { ApplicationExecutionDependencies, DocumentSession } from '@/vnext/application';
import { createDocumentSession } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import {
  CURRENT_RECOVERY_RECORD_FORMAT_VERSION,
  RECOVERY_DIGEST_ALGORITHM,
  RecoveryRecordError,
  recoveryKeyOf,
  recoveryKeyToken,
  type AuthoringRecoveryOverlay,
  type PendingRemoteMutation,
  type RecoveryKey,
  type RecoveryRecord,
} from './contracts';
import { digestCanonicalDocument, validateRecoveryRecordIntegrity, type DigestBytes } from './digest';
import type { RecoveryDecision, RemoteRecoveryState } from './decision';
import { decideRecovery } from './decision';
import type { RecoveryInspection, RecoveryRepository, RecoveryWriteResult } from './repository';

export interface RecoverySnapshotInput extends RecoveryKey {
  readonly localEditSequence: number;
  readonly baseRemoteRevision: number;
  readonly baseRemoteSnapshotDigest: string;
  readonly documentSnapshot: CatalogDocument;
  readonly pendingRemoteMutation?: Omit<PendingRemoteMutation, 'attemptDigestAlgorithm' | 'attemptDigest'>;
  readonly authoringRecoveryOverlay?: AuthoringRecoveryOverlay;
}

export interface RecoveryWriteOutcome {
  readonly record: RecoveryRecord;
  readonly storage: RecoveryWriteResult;
}

export interface AcceptedRecovery {
  readonly session: DocumentSession;
  readonly openSessionId: string;
  readonly overlay?: AuthoringRecoveryOverlay;
  readonly sourceRecord: RecoveryRecord;
}

export interface RecoveryCoordinatorOptions {
  readonly repository: RecoveryRepository;
  readonly applicationDependencies: ApplicationExecutionDependencies;
  readonly createOpenSessionId: () => string;
  readonly now?: () => Date;
  readonly digestBytes?: DigestBytes;
}

export class RecoveryCoordinator {
  private readonly generations = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: RecoveryCoordinatorOptions) {}

  private serialize<T>(key: RecoveryKey, operation: () => Promise<T>): Promise<T> {
    const token = recoveryKeyToken(recoveryKeyOf(key));
    const previous = this.queues.get(token) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.queues.set(token, next);
    const cleanup = () => {
      if (this.queues.get(token) === next) this.queues.delete(token);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  async write(input: RecoverySnapshotInput): Promise<RecoveryWriteOutcome> {
    return this.serialize(input, async () => {
      const key = recoveryKeyOf(input);
      const existing = await this.options.repository.get(key);
      if (existing?.status === 'INVALID') {
        throw new RecoveryRecordError('INVALID_RECORD', 'Invalid stored recovery is preserved');
      }
      const observed = existing?.status === 'VALID' ? existing.record.recoveryGeneration : 0;
      const remembered = this.generations.get(recoveryKeyToken(key)) ?? 0;
      const recoveryGeneration = Math.max(observed, remembered) + 1;
      const now = (this.options.now ?? (() => new Date()))().toISOString();
      const snapshotDigest = await digestCanonicalDocument(input.documentSnapshot, this.options.digestBytes);
      const pendingRemoteMutation = input.pendingRemoteMutation
        ? {
            ...input.pendingRemoteMutation,
            attemptDigestAlgorithm: RECOVERY_DIGEST_ALGORITHM,
            attemptDigest: await digestCanonicalDocument(
              input.pendingRemoteMutation.attemptedDocumentSnapshot,
              this.options.digestBytes
            ),
          }
        : undefined;
      const record: RecoveryRecord = {
        recordFormatVersion: CURRENT_RECOVERY_RECORD_FORMAT_VERSION,
        ...key,
        recoveryGeneration,
        localEditSequence: input.localEditSequence,
        baseRemoteRevision: input.baseRemoteRevision,
        baseRemoteSnapshotDigest: input.baseRemoteSnapshotDigest,
        documentSchemaVersion: input.documentSnapshot.schemaVersion,
        documentSnapshot: input.documentSnapshot,
        snapshotDigestAlgorithm: RECOVERY_DIGEST_ALGORITHM,
        snapshotDigest,
        createdAt: existing?.status === 'VALID' ? existing.record.createdAt : now,
        updatedAt: now,
        ...(pendingRemoteMutation ? { pendingRemoteMutation } : {}),
        ...(input.authoringRecoveryOverlay ? { authoringRecoveryOverlay: input.authoringRecoveryOverlay } : {}),
      };
      const validated = await validateRecoveryRecordIntegrity(record, key, this.options.digestBytes);
      const storage = await this.options.repository.putIfNewer(validated);
      if (storage.status !== 'STALE') this.generations.set(recoveryKeyToken(key), recoveryGeneration);
      return { record: validated, storage };
    });
  }

  discover(authorityScopeId: string): Promise<readonly RecoveryInspection[]> {
    return this.options.repository.listByScope(authorityScopeId);
  }

  deleteIfGeneration(key: RecoveryKey, expectedGeneration: number) {
    return this.serialize(key, () => this.options.repository.deleteIfGeneration(key, expectedGeneration));
  }

  deleteInvalidIfStillInvalid(key: RecoveryKey) {
    return this.serialize(key, () => this.options.repository.deleteInvalidIfStillInvalid(key));
  }

  async compare(inspection: RecoveryInspection | undefined, remote: RemoteRecoveryState): Promise<RecoveryDecision> {
    return decideRecovery(inspection, remote, this.options.digestBytes);
  }

  async accept(inspection: RecoveryInspection, authorityScopeId: string): Promise<AcceptedRecovery> {
    if (inspection.status !== 'VALID') throw new RecoveryRecordError('INVALID_RECORD', 'Invalid recovery cannot be accepted');
    if (inspection.key.authorityScopeId !== authorityScopeId) {
      throw new RecoveryRecordError('IDENTITY_MISMATCH', 'Foreign authority scope cannot accept recovery');
    }
    const record = await validateRecoveryRecordIntegrity(inspection.record, inspection.key, this.options.digestBytes);
    const openSessionId = this.options.createOpenSessionId();
    return {
      session: createDocumentSession(record.documentSnapshot, this.options.applicationDependencies),
      openSessionId,
      ...(record.authoringRecoveryOverlay ? { overlay: record.authoringRecoveryOverlay } : {}),
      sourceRecord: record,
    };
  }
}
