import type { CatalogPersistenceEnvelope } from '@/vnext/persistence';
import { digestCanonicalDocument, validateRecoveryRecordIntegrity, type DigestBytes } from './digest';
import type { RecoveryInspection } from './repository';

export type RecoveryDecision =
  | { readonly kind: 'NO_RECOVERY' }
  | { readonly kind: 'REDUNDANT_ALREADY_IN_CLOUD'; readonly remote: CatalogPersistenceEnvelope }
  | { readonly kind: 'RECOVERABLE_OVER_SAME_REMOTE_BASE'; readonly remote: CatalogPersistenceEnvelope }
  | { readonly kind: 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT'; readonly remote: CatalogPersistenceEnvelope }
  | { readonly kind: 'SAME_REVISION_DIGEST_MISMATCH'; readonly remote: CatalogPersistenceEnvelope }
  | { readonly kind: 'REMOTE_UNAVAILABLE' }
  | { readonly kind: 'INVALID_OR_UNSUPPORTED_RECORD'; readonly inspection: RecoveryInspection };

export type RemoteRecoveryState =
  | { readonly status: 'AVAILABLE'; readonly envelope: CatalogPersistenceEnvelope }
  | { readonly status: 'UNAVAILABLE' };

export async function decideRecovery(
  inspection: RecoveryInspection | undefined,
  remote: RemoteRecoveryState,
  digestBytes?: DigestBytes
): Promise<RecoveryDecision> {
  if (!inspection) return { kind: 'NO_RECOVERY' };
  if (inspection.status === 'INVALID') return { kind: 'INVALID_OR_UNSUPPORTED_RECORD', inspection };
  if (remote.status === 'UNAVAILABLE') return { kind: 'REMOTE_UNAVAILABLE' };

  const record = await validateRecoveryRecordIntegrity(inspection.record, inspection.key, digestBytes);
  const remoteDigest = await digestCanonicalDocument(remote.envelope.documentSnapshot, digestBytes);
  const pending = record.pendingRemoteMutation;
  if (
    pending
    && remote.envelope.lastMutationId === pending.mutationId
    && remote.envelope.remoteRevision === pending.expectedRemoteRevision + 1
    && remoteDigest === pending.attemptDigest
  ) {
    return { kind: 'REDUNDANT_ALREADY_IN_CLOUD', remote: remote.envelope };
  }
  if (remoteDigest === record.snapshotDigest) {
    return { kind: 'REDUNDANT_ALREADY_IN_CLOUD', remote: remote.envelope };
  }
  if (remote.envelope.remoteRevision === record.baseRemoteRevision) {
    return remoteDigest === record.baseRemoteSnapshotDigest
      ? { kind: 'RECOVERABLE_OVER_SAME_REMOTE_BASE', remote: remote.envelope }
      : { kind: 'SAME_REVISION_DIGEST_MISMATCH', remote: remote.envelope };
  }
  return { kind: 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT', remote: remote.envelope };
}
