import { describe, expect, it } from 'vitest';
import {
  InMemoryRecoveryRepository,
  RecoveryCoordinator,
  RecoveryStorageError,
  decideRecovery,
  digestCanonicalDocument,
  recoveryKeyOf,
} from '@/vnext/recovery';
import type { CatalogPersistenceEnvelope } from '@/vnext/persistence';
import { CATALOG_ID, MUTATION_0, MUTATION_1, SESSION_A, recoveryDocument, recoveryRecord } from './fixtures';

const dependencies = { createId: () => 'unused' };

function envelope(documentSnapshot = recoveryDocument('Cloud base'), remoteRevision = 7): CatalogPersistenceEnvelope {
  return {
    catalogId: CATALOG_ID,
    remoteRevision,
    lastMutationId: MUTATION_0,
    title: documentSnapshot.title,
    locale: documentSnapshot.locale,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    createdBy: null,
    updatedBy: null,
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot,
  };
}

describe('W3.D recovery coordinator and decisions', () => {
  it('serializes generations independently of authored sequence and rejects stale overwrite/delete', async () => {
    const repository = new InMemoryRecoveryRepository();
    const coordinator = new RecoveryCoordinator({
      repository,
      applicationDependencies: dependencies,
      createOpenSessionId: () => '99999999-9999-4999-8999-999999999999',
      now: () => new Date('2026-09-13T00:00:00.000Z'),
    });
    const base = recoveryDocument('Cloud base');
    const baseDigest = await digestCanonicalDocument(base);
    const input = {
      authorityScopeId: 'deployment:workspace:user-a',
      catalogId: CATALOG_ID,
      openSessionId: SESSION_A,
      localEditSequence: 1,
      baseRemoteRevision: 7,
      baseRemoteSnapshotDigest: baseDigest,
      documentSnapshot: recoveryDocument('L1'),
    };
    const [first, second] = await Promise.all([
      coordinator.write(input),
      coordinator.write({ ...input, documentSnapshot: recoveryDocument('L2') }),
    ]);
    expect([first.record.recoveryGeneration, second.record.recoveryGeneration]).toEqual([1, 2]);
    expect((await repository.get(recoveryKeyOf(second.record)))?.status).toBe('VALID');
    expect(await repository.putIfNewer(first.record)).toEqual({ status: 'STALE', storedGeneration: 2 });
    expect(await repository.deleteIfGeneration(recoveryKeyOf(second.record), 1)).toEqual({
      status: 'STALE', storedGeneration: 2,
    });
  });

  it('allows same-generation idempotence but fails closed on different content', async () => {
    const repository = new InMemoryRecoveryRepository();
    const first = await recoveryRecord();
    expect(await repository.putIfNewer(first)).toEqual({ status: 'STORED', generation: 1 });
    expect(await repository.putIfNewer(first)).toEqual({ status: 'IDEMPOTENT', generation: 1 });
    const changedDocument = recoveryDocument('Changed');
    const changed = await recoveryRecord({
      documentSnapshot: changedDocument,
      snapshotDigest: await digestCanonicalDocument(changedDocument),
    });
    await expect(repository.putIfNewer(changed)).rejects.toBeInstanceOf(RecoveryStorageError);
  });

  it('distinguishes same-base recovery, digest mismatch, conflict and unavailable', async () => {
    const record = await recoveryRecord();
    const inspection = { status: 'VALID' as const, key: recoveryKeyOf(record), record };
    await expect(decideRecovery(inspection, { status: 'AVAILABLE', envelope: envelope() })).resolves.toMatchObject({
      kind: 'RECOVERABLE_OVER_SAME_REMOTE_BASE',
    });
    await expect(
      decideRecovery(inspection, { status: 'AVAILABLE', envelope: envelope(recoveryDocument('Altered base')) })
    ).resolves.toMatchObject({ kind: 'SAME_REVISION_DIGEST_MISMATCH' });
    await expect(decideRecovery(inspection, { status: 'AVAILABLE', envelope: envelope(undefined, 8) })).resolves.toMatchObject({
      kind: 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT',
    });
    await expect(decideRecovery(inspection, { status: 'UNAVAILABLE' })).resolves.toEqual({ kind: 'REMOTE_UNAVAILABLE' });
  });

  it('does not discard a typed authoring overlay merely because its canonical snapshot matches remote', async () => {
    const base = recoveryDocument('Cloud base');
    const record = await recoveryRecord({
      documentSnapshot: base,
      snapshotDigest: await digestCanonicalDocument(base),
      authoringRecoveryOverlay: {
        kind: 'INSPECTOR_FRAME_DRAFT_V1',
        pageId: 'page-1',
        objectId: 'object-1',
        expectedFrame: { xMm: 1, yMm: 2, widthMm: 3, heightMm: 4 },
        draft: { x: '1.5', y: '2', width: '3', height: '4' },
      },
    });
    const inspection = { status: 'VALID' as const, key: recoveryKeyOf(record), record };
    await expect(decideRecovery(inspection, {
      status: 'AVAILABLE',
      envelope: envelope(base),
    })).resolves.toMatchObject({ kind: 'RECOVERABLE_OVER_SAME_REMOTE_BASE' });
  });

  it('proves a committed pending mutation only with its exact identity, revision and payload digest', async () => {
    const attemptedDocumentSnapshot = recoveryDocument('Attempted');
    const attemptDigest = await digestCanonicalDocument(attemptedDocumentSnapshot);
    const record = await recoveryRecord({
      pendingRemoteMutation: {
        mutationId: MUTATION_1,
        catalogId: CATALOG_ID,
        expectedRemoteRevision: 7,
        previousLastMutationId: MUTATION_0,
        capturedLocalEditSequence: 2,
        attemptedDocumentSnapshot,
        attemptDigestAlgorithm: 'SHA-256',
        attemptDigest,
      },
    });
    const inspection = { status: 'VALID' as const, key: recoveryKeyOf(record), record };
    const committed = { ...envelope(attemptedDocumentSnapshot, 8), lastMutationId: MUTATION_1 };
    await expect(decideRecovery(inspection, { status: 'AVAILABLE', envelope: committed })).resolves.toMatchObject({
      kind: 'REDUNDANT_ALREADY_IN_CLOUD',
    });
    await expect(decideRecovery(inspection, {
      status: 'AVAILABLE',
      envelope: {
        ...committed,
        documentSnapshot: recoveryDocument('Wrong payload'),
        title: 'Wrong payload',
      },
    })).resolves.toMatchObject({ kind: 'REMOTE_NEWER_OR_DIFFERENT_CONFLICT' });
  });

  it('accepts only the owning scope into a fresh empty-history DocumentSession', async () => {
    const repository = new InMemoryRecoveryRepository();
    const record = await recoveryRecord();
    await repository.putIfNewer(record);
    const coordinator = new RecoveryCoordinator({
      repository,
      applicationDependencies: dependencies,
      createOpenSessionId: () => '99999999-9999-4999-8999-999999999999',
    });
    const inspection = await repository.get(recoveryKeyOf(record));
    if (!inspection) throw new Error('missing inspection');
    await expect(coordinator.accept(inspection, 'deployment:workspace:user-b')).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    const accepted = await coordinator.accept(inspection, 'deployment:workspace:user-a');
    expect(accepted.openSessionId).not.toBe(record.openSessionId);
    expect(accepted.session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false, localSequence: 0 });
  });
});
