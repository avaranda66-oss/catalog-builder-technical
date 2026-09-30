import { describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  InMemoryRecoveryRepository,
  RecoveryStorageError,
  type RecoveryRepository,
  type RecoveryWriteResult,
} from '@/vnext/recovery';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const OPEN_A = '33333333-3333-4333-8333-333333333333';
const MUTATION_0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AUTH_A = 'authority-a';

const applicationDependencies: ApplicationExecutionDependencies = {
  createId: () => 'generated-id',
};

function documentFixture(id = A_ID, title = 'Original'): CatalogDocument {
  return {
    schemaVersion: 1,
    id,
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
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:00:00.000Z',
    createdBy: 'proof-user-a',
    updatedBy: 'proof-user-a',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function failure<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runtimeFor(
  repository: CatalogRepository,
  recoveryRepository: RecoveryRepository,
  options: {
    resolveAssetUrls?: (document: CatalogDocument) => Promise<ReadonlyMap<string, string>>;
  } = {}
) {
  const session = createDocumentSession(documentFixture(), applicationDependencies);
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies,
    createMutationId: () => MUTATION_1,
    createOpenSessionId: () => OPEN_A,
    authLineage: 'user-a:0',
    authorityScopeId: AUTH_A,
    recoveryRepository,
    binding: envelope(),
    ...(options.resolveAssetUrls ? { resolveAssetUrls: options.resolveAssetUrls } : {}),
  });
  return { runtime, session };
}

class DelayedRecoveryRepository implements RecoveryRepository {
  readonly inner = new InMemoryRecoveryRepository();
  readonly started = deferred<void>();
  readonly release = deferred<void>();

  async putIfNewer(record: Parameters<RecoveryRepository['putIfNewer']>[0]): Promise<RecoveryWriteResult> {
    this.started.resolve();
    await this.release.promise;
    return this.inner.putIfNewer(record);
  }

  get: RecoveryRepository['get'] = (key) => this.inner.get(key);
  listByScope: RecoveryRepository['listByScope'] = (scope) => this.inner.listByScope(scope);
  deleteIfGeneration: RecoveryRepository['deleteIfGeneration'] =
    (key, generation) => this.inner.deleteIfGeneration(key, generation);
  deleteInvalidIfStillInvalid: RecoveryRepository['deleteInvalidIfStillInvalid'] =
    (key) => this.inner.deleteInvalidIfStillInvalid(key);
}

describe('L1 authority-loss protection boundary', () => {
  it('L1-A/C/D waits for the latest A Recovery before teardown and never exposes it to B', async () => {
    const recovery = new DelayedRecoveryRepository();
    const saveCAS = vi.fn(() => failure<CatalogPersistenceEnvelope>());
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), recovery);
    session.execute({ type: 'document.rename', title: 'Latest A edit' });

    const protection = runtime.protectForAuthorityLoss();
    await recovery.started.promise;
    let settled = false;
    void protection.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    recovery.release.resolve();
    await protection;

    const recordsA = await recovery.inner.listByScope(AUTH_A);
    const recordsB = await recovery.inner.listByScope('authority-b');
    expect(recordsA).toHaveLength(1);
    expect(recordsB).toEqual([]);
    expect(recordsA[0]?.status).toBe('VALID');
    if (recordsA[0]?.status !== 'VALID') throw new Error('Expected A Recovery');
    expect(recordsA[0].record.documentSnapshot.title).toBe('Latest A edit');

    expect(await runtime.manualSave()).toMatchObject({
      ok: false,
      error: { code: 'STALE_RESULT' },
    });
    expect(saveCAS).not.toHaveBeenCalled();
    expect((await recovery.inner.listByScope(AUTH_A))[0]).toMatchObject({
      status: 'VALID',
      record: { documentSnapshot: { title: 'Latest A edit' } },
    });
  });

  it('L1-B preserves an already-protected Recovery without rewriting its generation', async () => {
    const recovery = new InMemoryRecoveryRepository();
    const { runtime, session } = runtimeFor(repositoryBase(), recovery);
    session.execute({ type: 'document.rename', title: 'Already protected' });
    await runtime.recoveryManager?.flush();
    const before = await recovery.listByScope(AUTH_A);
    expect(before[0]?.status).toBe('VALID');
    if (before[0]?.status !== 'VALID') throw new Error('Expected Recovery');

    await runtime.protectForAuthorityLoss();

    const after = await recovery.listByScope(AUTH_A);
    expect(after[0]?.status).toBe('VALID');
    if (after[0]?.status !== 'VALID') throw new Error('Expected Recovery');
    expect(after[0].record.recoveryGeneration).toBe(before[0].record.recoveryGeneration);
    expect(after[0].record.documentSnapshot.title).toBe('Already protected');
  });

  it('L1-E invalidates an open that completes after authority loss', async () => {
    const pendingRead = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    const { runtime } = runtimeFor(
      repositoryBase({ getCatalog: () => pendingRead.promise }),
      new InMemoryRecoveryRepository()
    );

    const opening = runtime.reopenCoordinator.open(B_ID, { allowDiscardUnsaved: true });
    await runtime.protectForAuthorityLoss();
    pendingRead.resolve({ ok: true, value: envelope(documentFixture(B_ID, 'Late B')) });

    expect(await opening).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(runtime.workspace.getSnapshot().session.getSnapshot().document.id).toBe(A_ID);
  });

  it('L1-F invalidates asset resolution that completes after authority loss', async () => {
    const pendingAssets = deferred<ReadonlyMap<string, string>>();
    const { runtime } = runtimeFor(
      repositoryBase({
        getCatalog: () => Promise.resolve({
          ok: true,
          value: envelope(documentFixture(B_ID, 'Pending asset B')),
        }),
      }),
      new InMemoryRecoveryRepository(),
      { resolveAssetUrls: () => pendingAssets.promise }
    );

    const opening = runtime.reopenCoordinator.open(B_ID, { allowDiscardUnsaved: true });
    await vi.waitFor(() => expect(runtime.workspace.getSnapshot().session.getSnapshot().document.id).toBe(A_ID));
    await runtime.protectForAuthorityLoss();
    pendingAssets.resolve(new Map());

    expect(await opening).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(runtime.workspace.getSnapshot().session.getSnapshot().document.id).toBe(A_ID);
  });

  it('L1-G keeps an already-dispatched Save owned by A and blocks any new dispatch', async () => {
    const remote = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return remote.promise;
    });
    const recovery = new InMemoryRecoveryRepository();
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), recovery);
    session.execute({ type: 'document.rename', title: 'Dispatched by A' });

    const save = runtime.manualSave();
    await vi.waitFor(() => expect(saveCAS).toHaveBeenCalledTimes(1));
    session.execute({ type: 'document.rename', title: 'Newer A after dispatch' });
    await runtime.protectForAuthorityLoss();

    expect(await runtime.manualSave()).toMatchObject({
      ok: false,
      error: { code: 'STALE_RESULT' },
    });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot().binding.authorityScopeId).toBe(AUTH_A);

    remote.resolve({
      ok: true,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    });
    expect(await save).toMatchObject({ ok: true, acknowledged: true });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    const protectedA = await recovery.listByScope(AUTH_A);
    expect(protectedA).toHaveLength(1);
    expect(protectedA[0]).toMatchObject({
      status: 'VALID',
      record: { documentSnapshot: { title: 'Newer A after dispatch' } },
    });
    expect(await recovery.listByScope('authority-b')).toEqual([]);
  });

  it('L1-H fails closed when local Recovery protection fails', async () => {
    const saveCAS = vi.fn(() => failure<CatalogPersistenceEnvelope>());
    const unavailable: RecoveryRepository = {
      putIfNewer: () => Promise.reject(
        new RecoveryStorageError('STORAGE_UNAVAILABLE', 'IndexedDB unavailable')
      ),
      get: () => Promise.resolve(undefined),
      listByScope: () => Promise.resolve([]),
      deleteIfGeneration: () => Promise.resolve({ status: 'NOT_FOUND' }),
      deleteInvalidIfStillInvalid: () => Promise.resolve({ status: 'NOT_FOUND' }),
    };
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), unavailable);
    session.execute({ type: 'document.rename', title: 'Must fail closed' });

    await expect(runtime.protectForAuthorityLoss()).rejects.toThrow('IndexedDB unavailable');
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      localProtection: 'unavailable',
    });
    expect(await runtime.manualSave()).toMatchObject({
      ok: false,
      error: { code: 'STALE_RESULT' },
    });
    expect(saveCAS).not.toHaveBeenCalled();
  });
});
