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

  it('INVALID-ESCAPE-05 preserves a valid replacement observed at deletion time', async () => {
    const repository = new InMemoryRecoveryRepository();
    const valid = await recoveryRecord();
    const key = recoveryKeyOf(valid);
    repository.seedRaw(key, { corrupt: true });
    expect((await repository.get(key))?.status).toBe('INVALID');

    repository.seedRaw(key, valid);

    expect(await repository.deleteInvalidIfStillInvalid(key)).toEqual({ status: 'VALID_PRESERVED' });
    expect((await repository.get(key))?.status).toBe('VALID');
  });

  it('INVALID-ESCAPE-06/07 deletes only the exact invalid session/catalog/scope key', async () => {
    const repository = new InMemoryRecoveryRepository();
    const invalid = await recoveryRecord();
    const otherSession = await recoveryRecord({ openSessionId: SESSION_B });
    const otherCatalogId = '44444444-4444-4444-8444-444444444444';
    const otherCatalog = await recoveryRecord({
      catalogId: otherCatalogId,
      documentSnapshot: { ...recoveryDocument('Other catalog'), id: otherCatalogId },
    });
    const otherScope = await recoveryRecord({ authorityScopeId: 'deployment:workspace:user-b' });
    repository.seedRaw(recoveryKeyOf(invalid), { corrupt: true });
    await repository.putIfNewer(otherSession);
    await repository.putIfNewer(otherCatalog);
    await repository.putIfNewer(otherScope);

    expect(await repository.deleteInvalidIfStillInvalid(recoveryKeyOf(invalid))).toEqual({ status: 'DELETED' });
    expect(await repository.get(recoveryKeyOf(invalid))).toBeUndefined();
    expect(await repository.deleteInvalidIfStillInvalid(recoveryKeyOf(invalid))).toEqual({ status: 'NOT_FOUND' });
    expect((await repository.get(recoveryKeyOf(otherSession)))?.status).toBe('VALID');
    expect((await repository.get(recoveryKeyOf(otherCatalog)))?.status).toBe('VALID');
    expect((await repository.get(recoveryKeyOf(otherScope)))?.status).toBe('VALID');
  });
});
