import { describe, expect, it, vi } from 'vitest';
import type {
  CatalogPersistenceEnvelope,
  CatalogRepository,
  PersistenceResult,
  SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  RecoveryCoordinator,
  RecoveryStartupCoordinator,
  digestCanonicalDocument,
  recoveryKeyOf,
} from '@/vnext/recovery';
import {
  CATALOG_ID,
  MUTATION_0,
  MUTATION_1,
  recoveryDocument,
  recoveryRecord,
} from './fixtures';

const AUTHORITY_SCOPE_ID = 'deployment:workspace:user-a';

function envelope(
  documentSnapshot = recoveryDocument('Cloud base'),
  remoteRevision = 7,
  lastMutationId = MUTATION_0
): CatalogPersistenceEnvelope {
  return {
    catalogId: CATALOG_ID,
    remoteRevision,
    lastMutationId,
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

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function repositoryBase(overrides: Partial<CatalogRepository>): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: () => unavailable(),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
    ...overrides,
  };
}

async function pendingRecord() {
  const attemptedDocumentSnapshot = recoveryDocument('Attempted payload');
  return recoveryRecord({
    pendingRemoteMutation: {
      mutationId: MUTATION_1,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 7,
      previousLastMutationId: MUTATION_0,
      capturedLocalEditSequence: 2,
      attemptedDocumentSnapshot,
      attemptDigestAlgorithm: 'SHA-256',
      attemptDigest: await digestCanonicalDocument(attemptedDocumentSnapshot),
    },
  });
}

function startup(recoveryRepository: InMemoryRecoveryRepository, repository: CatalogRepository) {
  const coordinator = new RecoveryCoordinator({
    repository: recoveryRepository,
    applicationDependencies: { createId: () => 'unused' },
    createOpenSessionId: () => '99999999-9999-4999-8999-999999999999',
  });
  return new RecoveryStartupCoordinator({ coordinator, repository });
}

describe('W3.D restart pending-mutation reconciliation', () => {
  it('allows only the active authority scope to enumerate, inspect, or discard a record', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await recoveryRecord();
    await recoveryRepository.putIfNewer(record);
    const controller = startup(recoveryRepository, repositoryBase({
      getCatalog: () => Promise.resolve({ ok: true, value: envelope() }),
    }));
    const [candidate] = await controller.discover(AUTHORITY_SCOPE_ID);

    expect(await controller.discover('deployment:workspace:user-b')).toEqual([]);
    expect(() => controller.inspect(candidate!, 'deployment:workspace:user-b')).toThrow(
      'Foreign authority scope'
    );
    await expect(controller.discard(candidate!, 'deployment:workspace:user-b')).rejects.toThrow(
      'Foreign authority scope'
    );
    expect(await controller.discover(AUTHORITY_SCOPE_ID)).toHaveLength(1);
  });

  it('replays only the persisted mutation identity and exact payload against its proven base', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await pendingRecord();
    await recoveryRepository.putIfNewer(record);
    const requests: SaveCatalogCasRequest[] = [];
    const repository = repositoryBase({
      getCatalog: () => Promise.resolve({ ok: true, value: envelope() }),
      saveCAS: (request) => {
        requests.push(request);
        return Promise.resolve({
          ok: true,
          value: envelope(request.documentSnapshot, 8, request.mutationId),
        });
      },
    });
    const controller = startup(recoveryRepository, repository);
    const [candidate] = await controller.discover(AUTHORITY_SCOPE_ID);

    expect(candidate?.decision.kind).toBe('RECOVERABLE_OVER_SAME_REMOTE_BASE');
    expect(await controller.reconcilePending(candidate!, AUTHORITY_SCOPE_ID)).toMatchObject({
      status: 'ACKNOWLEDGED',
      cleanup: { status: 'DELETED' },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      mutationId: MUTATION_1,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 7,
      documentSnapshot: record.pendingRemoteMutation?.attemptedDocumentSnapshot,
    });
    expect(await recoveryRepository.get(recoveryKeyOf(record))).toBeUndefined();
  });

  it('accepts authoritative lastMutationId proof without replaying', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await pendingRecord();
    await recoveryRepository.putIfNewer(record);
    const saveCAS = vi.fn();
    const repository = repositoryBase({
      getCatalog: () => Promise.resolve({
        ok: true,
        value: envelope(record.pendingRemoteMutation!.attemptedDocumentSnapshot, 8, MUTATION_1),
      }),
      saveCAS,
    });
    const controller = startup(recoveryRepository, repository);
    const [candidate] = await controller.discover(AUTHORITY_SCOPE_ID);

    expect(candidate?.decision.kind).toBe('REDUNDANT_ALREADY_IN_CLOUD');
    expect(await controller.reconcilePending(candidate!, AUTHORITY_SCOPE_ID)).toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    expect(saveCAS).not.toHaveBeenCalled();
  });

  it('re-reads after an ambiguous replay and accepts only exact authoritative proof', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await pendingRecord();
    await recoveryRepository.putIfNewer(record);
    let reads = 0;
    const repository = repositoryBase({
      getCatalog: () => {
        reads += 1;
        return Promise.resolve({
          ok: true,
          value: reads === 1
            ? envelope()
            : envelope(record.pendingRemoteMutation!.attemptedDocumentSnapshot, 8, MUTATION_1),
        });
      },
      saveCAS: () => Promise.resolve({
        ok: false,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
      }),
    });
    const controller = startup(recoveryRepository, repository);
    const [candidate] = await controller.discover(AUTHORITY_SCOPE_ID);

    expect(await controller.reconcilePending(candidate!, AUTHORITY_SCOPE_ID)).toMatchObject({
      status: 'ACKNOWLEDGED',
      cleanup: { status: 'DELETED' },
    });
    expect(reads).toBe(2);
    expect(await recoveryRepository.get(recoveryKeyOf(record))).toBeUndefined();
  });

  it('preserves the record and refuses replay when the same revision has a different digest', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const record = await pendingRecord();
    await recoveryRepository.putIfNewer(record);
    const saveCAS = vi.fn();
    const repository = repositoryBase({
      getCatalog: () => Promise.resolve({
        ok: true,
        value: envelope(recoveryDocument('Altered same revision')),
      }),
      saveCAS,
    });
    const controller = startup(recoveryRepository, repository);
    const [candidate] = await controller.discover(AUTHORITY_SCOPE_ID);

    expect(candidate?.decision.kind).toBe('SAME_REVISION_DIGEST_MISMATCH');
    expect(await controller.reconcilePending(candidate!, AUTHORITY_SCOPE_ID)).toMatchObject({
      status: 'PRESERVED',
      error: { code: 'REMOTE_DIVERGENCE' },
    });
    expect(saveCAS).not.toHaveBeenCalled();
    expect((await recoveryRepository.get(recoveryKeyOf(record)))?.status).toBe('VALID');
  });
});
