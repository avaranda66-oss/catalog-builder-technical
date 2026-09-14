import { describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import {
  PersistenceWorkspace,
  SaveCoordinator,
  VNextPersistenceRuntime,
  persistedBindingFromEnvelope,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  RecoveryStorageError,
  type RecoveryInspection,
  type RecoveryRepository,
} from '@/vnext/recovery';

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const OPEN_SESSION_ID = '22222222-2222-4222-8222-222222222222';
const MUTATION_0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTHORITY_SCOPE_ID = 'user-a';

const applicationDependencies: ApplicationExecutionDependencies = {
  createId: () => 'generated-id',
};

function documentFixture(title = 'Original'): CatalogDocument {
  return {
    schemaVersion: 1,
    id: CATALOG_ID,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{ id: 'page-1', widthMm: 210, heightMm: 297, objects: [] }],
    assets: [],
  };
}

function envelope(
  document = documentFixture(),
  remoteRevision = 1,
  lastMutationId = MUTATION_0
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-12T17:00:00.000Z',
    updatedAt: '2026-09-12T17:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function failure<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function unavailableRecoveryRepository(): RecoveryRepository {
  return {
    putIfNewer: () => Promise.reject(
      new RecoveryStorageError('STORAGE_UNAVAILABLE', 'IndexedDB unavailable')
    ),
    get: () => Promise.resolve(undefined),
    listByScope: () => Promise.resolve([]),
    deleteIfGeneration: () => Promise.resolve({ status: 'NOT_FOUND' }),
    deleteInvalidIfStillInvalid: () => Promise.resolve({ status: 'NOT_FOUND' }),
  };
}

function repositoryBase(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    listCatalogs: () => failure(),
    getCatalog: () => failure(),
    createCatalog: () => failure(),
    saveCAS: () => failure(),
    archiveCAS: () => failure(),
    ...overrides,
  };
}

function runtimeFor(repository: CatalogRepository, recoveryRepository: RecoveryRepository) {
  const session = createDocumentSession(documentFixture(), applicationDependencies);
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies,
    createMutationId: () => MUTATION_1,
    createOpenSessionId: () => OPEN_SESSION_ID,
    authLineage: 'user-a:0',
    authorityScopeId: AUTHORITY_SCOPE_ID,
    recoveryRepository,
    binding: envelope(),
  });
  return { runtime, session };
}

function validRecord(inspection: RecoveryInspection | undefined) {
  expect(inspection?.status).toBe('VALID');
  if (!inspection || inspection.status !== 'VALID') throw new Error('Expected valid recovery');
  return inspection.record;
}

async function currentRecord(repository: InMemoryRecoveryRepository) {
  return repository.get({
    authorityScopeId: AUTHORITY_SCOPE_ID,
    catalogId: CATALOG_ID,
    openSessionId: OPEN_SESSION_ID,
  });
}

describe('W3.D Save recovery lifecycle', () => {
  it('commits the exact pending mutation before remote dispatch', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    let observed: RecoveryInspection | undefined;
    const saveCAS = vi.fn(async (request: SaveCatalogCasRequest) => {
      observed = await currentRecord(recoveryRepository);
      return {
        ok: true as const,
        value: envelope(request.documentSnapshot, 2, request.mutationId),
      };
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), recoveryRepository);
    session.execute({ type: 'document.rename', title: 'S1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true, acknowledged: true });

    const pending = validRecord(observed).pendingRemoteMutation;
    expect(pending).toMatchObject({
      mutationId: MUTATION_1,
      catalogId: CATALOG_ID,
      expectedRemoteRevision: 1,
      previousLastMutationId: MUTATION_0,
      capturedLocalEditSequence: 1,
      attemptDigestAlgorithm: 'SHA-256',
    });
    expect(pending?.attemptedDocumentSnapshot.title).toBe('S1');
    expect(pending?.attemptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(await currentRecord(recoveryRepository)).toBeUndefined();
  });

  it('LP-01 accepts an authoritative cloud ACK while local protection remains unavailable', async () => {
    let request!: SaveCatalogCasRequest;
    let resolveRemote!: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
    const remote = new Promise<PersistenceResult<CatalogPersistenceEnvelope>>((resolve) => {
      resolveRemote = resolve;
    });
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return remote;
    });
    const { runtime, session } = runtimeFor(
      repositoryBase({ saveCAS }),
      unavailableRecoveryRepository()
    );
    session.execute({ type: 'document.rename', title: 'Cloud-bound L1' });

    const save = runtime.saveCoordinator.save();
    await vi.waitFor(() => expect(saveCAS).toHaveBeenCalledTimes(1));
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      localProtection: 'unavailable',
      localProtectionMessage: 'Proteção local indisponível.',
      save: { phase: 'saving', label: 'Saving…' },
    });

    resolveRemote({
      ok: true,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    });
    expect(await save).toMatchObject({ ok: true, acknowledged: true });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      localProtection: 'unavailable',
      localProtectionMessage: 'Proteção local indisponível.',
      save: { phase: 'idle', label: 'Saved' },
      binding: { kind: 'PERSISTED', remoteRevision: 2, lastMutationId: MUTATION_1 },
    });
  });

  it('LP-02 preserves normal remote failures when local protection is unavailable', async () => {
    const cases = [
      { code: 'OFFLINE' as const, phase: 'unavailable', label: 'Offline / unavailable' },
      { code: 'REMOTE_FAILURE' as const, phase: 'unavailable', label: 'Offline / unavailable' },
      { code: 'CONFLICT' as const, phase: 'conflict', label: 'Conflict' },
      { code: 'UNAUTHORIZED' as const, phase: 'unauthorized', label: 'Offline / unavailable' },
    ];

    for (const expected of cases) {
      const saveCAS = vi.fn(() => Promise.resolve({
        ok: false as const,
        error: { code: expected.code },
      }));
      const { runtime, session } = runtimeFor(
        repositoryBase({ saveCAS }),
        unavailableRecoveryRepository()
      );
      session.execute({ type: 'document.rename', title: `Remote ${expected.code}` });

      expect(await runtime.saveCoordinator.save()).toMatchObject({
        ok: false,
        error: { code: expected.code },
      });
      expect(saveCAS).toHaveBeenCalledTimes(1);
      expect(runtime.workspace.getSnapshot()).toMatchObject({
        dirty: true,
        localProtection: 'unavailable',
        save: { phase: expected.phase, label: expected.label },
      });
      expect(runtime.workspace.getSnapshot().save.label).not.toBe('Saved');
    }
  });

  it('LP-03 reconciles an ambiguous cloud save without replacing its mutation identity', async () => {
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return Promise.resolve({
        ok: false as const,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
      });
    });
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    }));
    const { runtime, session } = runtimeFor(
      repositoryBase({ saveCAS, getCatalog }),
      unavailableRecoveryRepository()
    );
    session.execute({ type: 'document.rename', title: 'Ambiguous but committed' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true, acknowledged: true });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(request.mutationId).toBe(MUTATION_1);
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      localProtection: 'unavailable',
      save: { label: 'Saved' },
      binding: { remoteRevision: 2, lastMutationId: MUTATION_1 },
    });
  });

  it('LP-04 keeps unresolved ambiguity honest without inventing recovery durability', async () => {
    const saveCAS = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
    }));
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'REMOTE_FAILURE' as const, message: 'Verification unavailable' },
    }));
    const { runtime, session } = runtimeFor(
      repositoryBase({ saveCAS, getCatalog }),
      unavailableRecoveryRepository()
    );
    session.execute({ type: 'document.rename', title: 'Ambiguous and unresolved' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(true);
    expect(runtime.recoveryManager?.getLastWrittenRecord()).toBeUndefined();
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      localProtection: 'unavailable',
      save: { phase: 'ambiguous', label: 'Could not verify save' },
    });
  });

  it('does not dispatch a failed preflight after auth lineage changes', async () => {
    const session = createDocumentSession(documentFixture(), applicationDependencies);
    const workspace = new PersistenceWorkspace(
      session,
      persistedBindingFromEnvelope(
        envelope(),
        OPEN_SESSION_ID,
        'user-a:0',
        AUTHORITY_SCOPE_ID,
        0
      )
    );
    let rejectPreflight!: (reason: Error) => void;
    const beforeDispatch = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectPreflight = reject;
    }));
    const saveCAS = vi.fn(() => failure<CatalogPersistenceEnvelope>());
    const coordinator = new SaveCoordinator({
      workspace,
      repository: repositoryBase({ saveCAS }),
      createMutationId: () => MUTATION_1,
      recoveryLifecycle: {
        beforeDispatch,
        afterAcknowledged: () => Promise.resolve(),
      },
    });
    session.execute({ type: 'document.rename', title: 'Stale L1' });

    const save = coordinator.save();
    await vi.waitFor(() => expect(beforeDispatch).toHaveBeenCalledTimes(1));
    workspace.updateAuthLineage('user-a:1');
    rejectPreflight(new Error('IndexedDB unavailable'));

    expect(await save).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(saveCAS).not.toHaveBeenCalled();
    expect(workspace.getSnapshot().localProtection).toBe('available');
  });

  it('ACK S1 cannot erase newer L2 recovery and rebases it without the acknowledged pending mutation', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    let request!: SaveCatalogCasRequest;
    let resolveSave!: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
    const remote = new Promise<PersistenceResult<CatalogPersistenceEnvelope>>((resolve) => {
      resolveSave = resolve;
    });
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return remote;
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), recoveryRepository);
    session.execute({ type: 'document.rename', title: 'S1' });
    const save = runtime.saveCoordinator.save();
    await vi.waitFor(() => expect(saveCAS).toHaveBeenCalledTimes(1));

    session.execute({ type: 'document.rename', title: 'L2' });
    await runtime.recoveryManager?.flush();
    resolveSave({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });
    expect(await save).toMatchObject({ ok: true });
    await runtime.recoveryManager?.flush();

    const record = validRecord(await currentRecord(recoveryRepository));
    expect(record.documentSnapshot.title).toBe('L2');
    expect(record.localEditSequence).toBe(2);
    expect(record.baseRemoteRevision).toBe(2);
    expect(record.pendingRemoteMutation).toBeUndefined();
    expect(runtime.workspace.getSnapshot()).toMatchObject({ dirty: true });
  });

  it('keeps an ambiguous mutation durable with the same identity and exact payload', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const requests: SaveCatalogCasRequest[] = [];
    const saveCAS = vi.fn((request: SaveCatalogCasRequest) => {
      requests.push(request);
      return Promise.resolve({
        ok: false as const,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
      });
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), recoveryRepository);
    session.execute({ type: 'document.rename', title: 'Ambiguous S1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });

    const pending = validRecord(await currentRecord(recoveryRepository)).pendingRemoteMutation;
    expect(pending?.mutationId).toBe(requests[0]?.mutationId);
    expect(pending?.attemptedDocumentSnapshot).toEqual(requests[0]?.documentSnapshot);
    expect(pending?.capturedLocalEditSequence).toBe(1);
  });

  it('fails closed instead of replaying when the same remote revision has an unexpected digest', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const saveCAS = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
    }));
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(documentFixture('Unexpected same-revision content'), 1, MUTATION_0),
    }));
    const { runtime, session } = runtimeFor(
      repositoryBase({ saveCAS, getCatalog }),
      recoveryRepository
    );
    session.execute({ type: 'document.rename', title: 'Attempted S1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'REMOTE_DIVERGENCE' },
    });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(validRecord(await currentRecord(recoveryRepository)).pendingRemoteMutation).toBeDefined();
  });

  it('suspends writes after an authority change without relabeling the owner record', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const { runtime, session } = runtimeFor(repositoryBase(), recoveryRepository);
    session.execute({ type: 'document.rename', title: 'User A work' });
    await runtime.recoveryManager?.flush();

    runtime.updateAuthContext('user-b:1', 'user-b');
    session.execute({ type: 'document.rename', title: 'Must not become User B recovery' });
    await runtime.recoveryManager?.flush();

    expect(await recoveryRepository.listByScope('user-b')).toEqual([]);
    expect(await runtime.recoveryStartup?.discover('user-a')).toEqual([]);
    expect(validRecord(await currentRecord(recoveryRepository)).authorityScopeId).toBe(AUTHORITY_SCOPE_ID);
    expect(validRecord(await currentRecord(recoveryRepository)).documentSnapshot.title).toBe('User A work');

    runtime.updateAuthContext('user-a:2', 'user-a');
    expect(await runtime.recoveryStartup?.discover('user-a')).toHaveLength(1);
  });

  it('removes redundant recovery after Undo returns exactly to the remote snapshot', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const { runtime, session } = runtimeFor(repositoryBase(), recoveryRepository);
    session.execute({ type: 'document.rename', title: 'Temporary edit' });
    await runtime.recoveryManager?.flush();
    expect((await currentRecord(recoveryRepository))?.status).toBe('VALID');

    expect(session.undo().ok).toBe(true);
    await runtime.recoveryManager?.flush();

    expect(session.getSnapshot()).toMatchObject({
      document: { title: 'Original' },
      localSequence: 2,
    });
    expect(await currentRecord(recoveryRepository)).toBeUndefined();
  });
});
