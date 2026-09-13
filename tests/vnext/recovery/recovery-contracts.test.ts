import { describe, expect, it } from 'vitest';
import {
  InMemoryRecoveryRepository,
  RecoveryRecordError,
  RecoveryStorageError,
  parseRecoveryRecord,
  recoveryKeyOf,
  validateRecoveryRecordIntegrity,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  MUTATION_1,
  SESSION_B,
  recoveryDocument,
  recoveryRecord,
} from './fixtures';

describe('W3.D strict RecoveryRecord', () => {
  it('rejects unknown fields and preserves a corrupt stored record for inspection', async () => {
    const repository = new InMemoryRecoveryRepository();
    const valid = await recoveryRecord();
    const raw = { ...valid, unexpected: true };
    expect(() => parseRecoveryRecord(raw)).toThrow(RecoveryRecordError);
    repository.seedRaw(recoveryKeyOf(valid), raw);

    const inspection = await repository.get(recoveryKeyOf(valid));
    expect(inspection).toMatchObject({ status: 'INVALID', error: { code: 'INVALID_RECORD' } });
    expect(await repository.deleteIfGeneration(recoveryKeyOf(valid), 1)).toEqual({ status: 'INVALID_PRESERVED' });
    expect((await repository.get(recoveryKeyOf(valid)))?.status).toBe('INVALID');
  });

  it('rejects unsupported record versions distinctly', async () => {
    const valid = await recoveryRecord();
    expect(() => parseRecoveryRecord({ ...valid, recordFormatVersion: 2 })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_RECORD_VERSION' })
    );
  });

  it('validates SHA-256 integrity for canonical and pending snapshots', async () => {
    const attemptedDocumentSnapshot = recoveryDocument('Attempted');
    const { digestCanonicalDocument } = await import('@/vnext/recovery');
    const valid = await recoveryRecord({
      pendingRemoteMutation: {
        mutationId: MUTATION_1,
        catalogId: CATALOG_ID,
        expectedRemoteRevision: 7,
        previousLastMutationId: MUTATION_0,
        capturedLocalEditSequence: 1,
        attemptedDocumentSnapshot,
        attemptDigestAlgorithm: 'SHA-256',
        attemptDigest: await digestCanonicalDocument(attemptedDocumentSnapshot),
      },
    });
    await expect(validateRecoveryRecordIntegrity(valid)).resolves.toEqual(valid);
    await expect(validateRecoveryRecordIntegrity({ ...valid, snapshotDigest: '0'.repeat(64) })).rejects.toMatchObject({
      code: 'DIGEST_MISMATCH',
    });
    await expect(validateRecoveryRecordIntegrity({
      ...valid,
      pendingRemoteMutation: { ...valid.pendingRemoteMutation!, attemptDigest: '0'.repeat(64) },
    })).rejects.toMatchObject({ code: 'DIGEST_MISMATCH' });
  });

  it('keeps tab and authority-scope records independent and discards only an exact generation', async () => {
    const repository = new InMemoryRecoveryRepository();
    const a1 = await recoveryRecord();
    const a2 = await recoveryRecord({ openSessionId: SESSION_B });
    const b = await recoveryRecord({ authorityScopeId: 'deployment:workspace:user-b' });
    await repository.putIfNewer(a1);
    await repository.putIfNewer(a2);
    await repository.putIfNewer(b);
    expect(await repository.listByScope('deployment:workspace:user-a')).toHaveLength(2);
    expect(await repository.listByScope('deployment:workspace:user-b')).toHaveLength(1);
    expect(await repository.deleteIfGeneration(recoveryKeyOf(a1), 2)).toEqual({ status: 'STALE', storedGeneration: 1 });
    expect(await repository.deleteIfGeneration(recoveryKeyOf(a1), 1)).toEqual({ status: 'DELETED' });
    expect(await repository.listByScope('deployment:workspace:user-a')).toHaveLength(1);
    expect(await repository.listByScope('deployment:workspace:user-b')).toHaveLength(1);
  });

  it('does not overwrite an invalid preserved record', async () => {
    const repository = new InMemoryRecoveryRepository();
    const valid = await recoveryRecord();
    repository.seedRaw(recoveryKeyOf(valid), { corrupt: true });
    await expect(repository.putIfNewer(valid)).rejects.toBeInstanceOf(RecoveryStorageError);
  });
});
