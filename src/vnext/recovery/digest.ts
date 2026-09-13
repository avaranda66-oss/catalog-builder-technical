import type { CatalogDocument } from '@/vnext/domain';
import { serializeCanonicalSnapshot } from '@/vnext/persistence/snapshot';
import {
  RECOVERY_DIGEST_ALGORITHM,
  RecoveryRecordError,
  parseRecoveryRecord,
  type RecoveryRecord,
} from './contracts';

export type DigestBytes = (bytes: Uint8Array) => Promise<ArrayBuffer>;

function defaultDigest(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable');
  return globalThis.crypto.subtle.digest(RECOVERY_DIGEST_ALGORITHM, bytes as BufferSource);
}

export async function sha256Hex(value: string, digestBytes: DigestBytes = defaultDigest): Promise<string> {
  const digest = await digestBytes(new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalRecoveryPayload(document: CatalogDocument): string {
  return serializeCanonicalSnapshot(document);
}

export function digestCanonicalDocument(
  document: CatalogDocument,
  digestBytes?: DigestBytes
): Promise<string> {
  return sha256Hex(canonicalRecoveryPayload(document), digestBytes);
}

export async function validateRecoveryRecordIntegrity(
  input: unknown,
  expectedKey?: Parameters<typeof parseRecoveryRecord>[1],
  digestBytes?: DigestBytes
): Promise<RecoveryRecord> {
  const record = parseRecoveryRecord(input, expectedKey);
  const snapshotDigest = await digestCanonicalDocument(record.documentSnapshot, digestBytes);
  if (snapshotDigest !== record.snapshotDigest) {
    throw new RecoveryRecordError('DIGEST_MISMATCH', 'Recovery snapshot digest mismatch');
  }
  if (record.pendingRemoteMutation) {
    const attemptDigest = await digestCanonicalDocument(
      record.pendingRemoteMutation.attemptedDocumentSnapshot,
      digestBytes
    );
    if (attemptDigest !== record.pendingRemoteMutation.attemptDigest) {
      throw new RecoveryRecordError('DIGEST_MISMATCH', 'Pending mutation digest mismatch');
    }
  }
  return record;
}
