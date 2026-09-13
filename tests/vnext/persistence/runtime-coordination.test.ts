import { describe, expect, it, vi } from 'vitest';
import {
  createDocumentSession,
  type ApplicationExecutionDependencies,
  type DocumentSession,
} from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import {
  advanceAuthLineage,
  authLineageValue,
  createAuthLineageState,
} from '@/vnext/app/auth-lineage';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const C_ID = '33333333-3333-4333-8333-333333333333';
const M0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const M2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
    pages: [{ id: `page-${id.slice(0, 4)}`, widthMm: 210, heightMm: 297, objects: [] }],
    assets: [],
  };
}

function envelope(
  document = documentFixture(),
  remoteRevision = 1,
  lastMutationId = M0
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function failure<T>(code: 'OFFLINE' | 'REMOTE_FAILURE' = 'REMOTE_FAILURE'): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code } });
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

const applicationDependencies: ApplicationExecutionDependencies = {
  createId: (() => {
    let value = 0;
    return () => `generated-${++value}`;
  })(),
};

function runtimeFor(
  repository: CatalogRepository,
  document = documentFixture(),
  authLineage = 'user-a:0'
): { runtime: VNextPersistenceRuntime; session: DocumentSession } {
  const session = createDocumentSession(document, applicationDependencies);
  let mutationIndex = 0;
  let openIndex = 0;
  const mutations = [M1, M2];
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies,
    createMutationId: () => mutations[mutationIndex++] ?? M2,
    createOpenSessionId: () => `open-${++openIndex}`,
    authLineage,
    binding: envelope(document),
  });
  return { runtime, session };
}

describe('W3.C SaveCoordinator causal semantics', () => {
  it('L01 keeps L2 live when ACK S1 arrives and advances only the binding for S1', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return pending.promise;
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));

    expect(session.execute({ type: 'document.rename', title: 'L1' }).ok).toBe(true);
    const save = runtime.saveCoordinator.save();
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(session.execute({ type: 'document.rename', title: 'L2' }).ok).toBe(true);
    expect(runtime.workspace.getSnapshot().save.label).toBe('Saving…');

    pending.resolve({
      ok: true,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    });
    expect((await save).ok).toBe(true);

    const state = runtime.workspace.getSnapshot();
    expect(state.session.getSnapshot().document.title).toBe('L2');
    expect(state.binding).toMatchObject({ kind: 'PERSISTED', remoteRevision: 2, lastMutationId: M1 });
    expect(state.dirty).toBe(true);
    expect(state.save.label).toBe('Unsaved changes');
  });

  it('L02 does not overwrite an Undo that happened while S1 was in flight', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const { runtime, session } = runtimeFor(repositoryBase({
      saveCAS: vi.fn((next: SaveCatalogCasRequest) => {
        request = next;
        return pending.promise;
      }),
    }));

    session.execute({ type: 'document.rename', title: 'L1' });
    const save = runtime.saveCoordinator.save();
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.title).toBe('Original');

    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });
    await save;
    expect(session.getSnapshot().document.title).toBe('Original');
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
  });

  it('L03 ignores ACK A after exact reopen installs B', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const getCatalog = vi.fn((catalogId: string) => Promise.resolve({
      ok: true as const,
      value: envelope(documentFixture(catalogId, 'Catalog B'), 7, M0),
    }));
    const { runtime, session: sessionA } = runtimeFor(repositoryBase({
      getCatalog,
      saveCAS: vi.fn((next: SaveCatalogCasRequest) => {
        request = next;
        return pending.promise;
      }),
    }));

    sessionA.execute({ type: 'document.rename', title: 'A local' });
    const saveA = runtime.saveCoordinator.save();
    expect((await runtime.reopenCoordinator.open(B_ID, { allowDiscardUnsaved: true })).ok).toBe(true);
    const sessionB = runtime.workspace.getSnapshot().session;
    expect(sessionB).not.toBe(sessionA);
    expect(sessionB.getSnapshot().document.id).toBe(B_ID);

    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });
    expect(await saveA).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(runtime.workspace.getSnapshot().session).toBe(sessionB);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({ kind: 'PERSISTED', catalogId: B_ID, remoteRevision: 7 });
  });

  it('L04 ignores a late ACK after auth lineage changes', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    }));
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return pending.promise;
    });
    const { runtime, session } = runtimeFor(repositoryBase({
      getCatalog,
      saveCAS,
    }));
    session.execute({ type: 'document.rename', title: 'A local' });
    const save = runtime.saveCoordinator.save();
    runtime.updateAuthLineage('user-b:1');

    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });
    expect(await save).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({ kind: 'PERSISTED', remoteRevision: 1, authLineage: 'user-b:1' });
    expect(session.getSnapshot().document.title).toBe('A local');

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true, acknowledged: true });
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({
      kind: 'PERSISTED',
      remoteRevision: 2,
      lastMutationId: M1,
      authLineage: 'user-b:1',
    });
  });

  it('AUTH-2 accepts an in-flight Save ACK after repeated same-user SIGNED_IN keeps lineage stable', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const initialLineage = createAuthLineageState('user-a');
    const { runtime, session } = runtimeFor(repositoryBase({
      saveCAS: vi.fn((next: SaveCatalogCasRequest) => {
        request = next;
        return pending.promise;
      }),
    }), documentFixture(), authLineageValue(initialLineage));
    session.execute({ type: 'document.rename', title: 'A local' });
    const save = runtime.saveCoordinator.save();

    const repeatedSignedIn = advanceAuthLineage(initialLineage, 'user-a');
    runtime.updateAuthLineage(authLineageValue(repeatedSignedIn));
    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });

    expect(await save).toMatchObject({ ok: true, acknowledged: true });
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({
      kind: 'PERSISTED',
      remoteRevision: 2,
      lastMutationId: M1,
      authLineage: 'user-a:0',
    });
  });

  it('L05 joins duplicate Save for the same in-flight local state', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return pending.promise;
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    session.execute({ type: 'document.rename', title: 'L1' });

    const first = runtime.saveCoordinator.save();
    const second = runtime.saveCoordinator.save();
    expect(saveCAS).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });

    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true, joined: true });
    expect(saveCAS).toHaveBeenCalledTimes(1);
  });

  it('rejects an ACK whose mutation identity or CAS revision does not prove this save', async () => {
    const wrongMutation = vi.fn((request: SaveCatalogCasRequest) => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 2, M2),
    }));
    const first = runtimeFor(repositoryBase({ saveCAS: wrongMutation }));
    first.session.execute({ type: 'document.rename', title: 'L1' });
    expect(await first.runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'REMOTE_DIVERGENCE' },
    });
    expect(first.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { label: 'Conflict' },
      binding: { remoteRevision: 1, lastMutationId: M0 },
    });

    const wrongRevision = vi.fn((request: SaveCatalogCasRequest) => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 3, request.mutationId),
    }));
    const second = runtimeFor(repositoryBase({ saveCAS: wrongRevision }));
    second.session.execute({ type: 'document.rename', title: 'L1' });
    expect(await second.runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'REMOTE_DIVERGENCE' },
    });
    expect(second.runtime.workspace.getSnapshot().binding).toMatchObject({
      remoteRevision: 1,
      lastMutationId: M0,
    });
  });

  it('CONFLICT and pre-dispatch OFFLINE preserve local work and never claim Saved', async () => {
    for (const code of ['CONFLICT', 'OFFLINE'] as const) {
      const { runtime, session } = runtimeFor(repositoryBase({
        saveCAS: vi.fn(() => Promise.resolve({
          ok: false as const,
          error: { code },
        })),
      }));
      session.execute({ type: 'document.rename', title: `Local ${code}` });

      expect(await runtime.saveCoordinator.save()).toMatchObject({
        ok: false,
        error: { code },
      });
      expect(session.getSnapshot().document.title).toBe(`Local ${code}`);
      expect(runtime.workspace.getSnapshot().dirty).toBe(true);
      expect(runtime.workspace.getSnapshot().save.label).not.toBe('Saved');
    }
  });

  it('L13 accepts authoritative GET when lastMutationId proves the ambiguous mutation committed', async () => {
    let request!: SaveCatalogCasRequest;
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    }));
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return Promise.resolve({
        ok: false as const,
        error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
      });
    });
    const { runtime, session } = runtimeFor(repositoryBase({ getCatalog, saveCAS }));
    session.execute({ type: 'document.rename', title: 'L1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true });
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({ remoteRevision: 2, lastMutationId: M1 });
  });

  it('L13 exact-replays the same mutation identity/payload after GET still shows the expected base', async () => {
    const requests: SaveCatalogCasRequest[] = [];
    const saveCAS = vi.fn((request: SaveCatalogCasRequest) => {
      requests.push(request);
      if (requests.length === 1) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
        });
      }
      return Promise.resolve({
        ok: true as const,
        value: envelope(request.documentSnapshot, 2, request.mutationId),
      });
    });
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(documentFixture(), 1, M0),
    }));
    const { runtime, session } = runtimeFor(repositoryBase({ getCatalog, saveCAS }));
    session.execute({ type: 'document.rename', title: 'L1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true });
    expect(saveCAS).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1].mutationId).toBe(M1);
  });

  it('reconciles an unresolved ambiguous mutation across a real auth transition without allocating a new mutation', async () => {
    const requests: SaveCatalogCasRequest[] = [];
    let readCount = 0;
    const saveCAS = vi.fn((request: SaveCatalogCasRequest) => {
      requests.push(request);
      if (requests.length === 1) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const },
        });
      }
      return Promise.resolve({
        ok: true as const,
        value: envelope(request.documentSnapshot, 2, request.mutationId),
      });
    });
    const getCatalog = vi.fn(() => {
      readCount += 1;
      if (readCount === 1) {
        return Promise.resolve({
          ok: false as const,
          error: { code: 'REMOTE_FAILURE' as const },
        });
      }
      return Promise.resolve({
        ok: true as const,
        value: envelope(documentFixture(), 1, M0),
      });
    });
    const { runtime, session } = runtimeFor(repositoryBase({ getCatalog, saveCAS }));
    session.execute({ type: 'document.rename', title: 'L1' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(true);

    runtime.updateAuthLineage('user-b:1');
    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: true, acknowledged: true });

    expect(getCatalog).toHaveBeenCalledTimes(2);
    expect(saveCAS).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[1].mutationId).toBe(M1);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({
      kind: 'PERSISTED',
      remoteRevision: 2,
      lastMutationId: M1,
      authLineage: 'user-b:1',
    });
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);
  });

  it('DIRTY-UNDO becomes clean by exact equivalence without rewinding localSequence', async () => {
    const saveCAS = vi.fn((request: SaveCatalogCasRequest) => Promise.resolve({
      ok: true as const,
      value: envelope(request.documentSnapshot, 2, request.mutationId),
    }));
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    session.execute({ type: 'document.rename', title: 'Saved title' });
    await runtime.saveCoordinator.save();
    const acknowledgedSequence = session.getSnapshot().localSequence;
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);

    session.execute({ type: 'document.rename', title: 'Later title' });
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
    session.undo();
    expect(session.getSnapshot().document.title).toBe('Saved title');
    expect(session.getSnapshot().localSequence).toBeGreaterThan(acknowledgedSequence);
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(runtime.workspace.getSnapshot().save.label).toBe('Saved');
  });
});

describe('W3.C canonical reopen', () => {
  it('REOPEN-1 creates a fresh DocumentSession with empty history and correct binding', async () => {
    const { runtime, session: sessionA } = runtimeFor(repositoryBase({
      getCatalog: vi.fn(() => Promise.resolve({
        ok: true as const,
        value: envelope(documentFixture(B_ID, 'Persisted B'), 9, M2),
      })),
    }));
    const result = await runtime.reopenCoordinator.open(B_ID);
    expect(result.ok).toBe(true);
    const state = runtime.workspace.getSnapshot();
    expect(state.session).not.toBe(sessionA);
    expect(state.session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false, localSequence: 0 });
    expect(state.session.getSnapshot().document.title).toBe('Persisted B');
    expect(state.binding).toMatchObject({ kind: 'PERSISTED', catalogId: B_ID, remoteRevision: 9, lastMutationId: M2 });
    expect(state.dirty).toBe(false);
  });

  it('REOPEN-2 malformed document fails closed and preserves the current safe session', async () => {
    const malformed = { ...envelope(documentFixture(B_ID)), documentSnapshot: { bad: true } } as unknown as CatalogPersistenceEnvelope;
    const { runtime, session } = runtimeFor(repositoryBase({
      getCatalog: vi.fn(() => Promise.resolve({ ok: true as const, value: malformed })),
    }));
    const before = runtime.workspace.getSnapshot().binding;
    const result = await runtime.reopenCoordinator.open(B_ID);
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().binding).toEqual(before);
  });

  it('REOPEN-3 requested identity mismatch fails closed', async () => {
    const { runtime, session } = runtimeFor(repositoryBase({
      getCatalog: vi.fn(() => Promise.resolve({
        ok: true as const,
        value: envelope(documentFixture(C_ID, 'Wrong catalog'), 3, M2),
      })),
    }));
    const result = await runtime.reopenCoordinator.open(B_ID);
    expect(result).toMatchObject({ ok: false, error: { code: 'REQUESTED_ID_MISMATCH' } });
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(runtime.workspace.getSnapshot().binding).toMatchObject({ catalogId: A_ID });
  });

  it('REOPEN-RACE preserves edits made after GET dispatch instead of installing the fetched catalog', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    const { runtime, session } = runtimeFor(repositoryBase({
      getCatalog: vi.fn(() => pending.promise),
    }));

    const reopen = runtime.reopenCoordinator.open(B_ID);
    expect(session.execute({ type: 'document.rename', title: 'Edited while opening' }).ok).toBe(true);
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);

    pending.resolve({ ok: true, value: envelope(documentFixture(B_ID, 'Persisted B'), 4, M2) });
    expect(await reopen).toMatchObject({ ok: false, error: { code: 'UNSAVED_CHANGES' } });
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(session.getSnapshot().document.title).toBe('Edited while opening');
  });

  it('REOPEN-RACE ignores an older GET after a newer reopen has installed another session', async () => {
    const pendingB = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    const pendingC = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    const getCatalog = vi.fn((catalogId: string) => catalogId === B_ID ? pendingB.promise : pendingC.promise);
    const { runtime } = runtimeFor(repositoryBase({ getCatalog }));

    const reopenB = runtime.reopenCoordinator.open(B_ID);
    const reopenC = runtime.reopenCoordinator.open(C_ID);

    pendingC.resolve({ ok: true, value: envelope(documentFixture(C_ID, 'Persisted C'), 7, M2) });
    expect((await reopenC).ok).toBe(true);
    const installedC = runtime.workspace.getSnapshot().session;
    expect(installedC.getSnapshot().document.id).toBe(C_ID);

    pendingB.resolve({ ok: true, value: envelope(documentFixture(B_ID, 'Persisted B'), 5, M1) });
    expect(await reopenB).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(runtime.workspace.getSnapshot().session).toBe(installedC);
    expect(runtime.workspace.getSnapshot().session.getSnapshot().document.id).toBe(C_ID);
  });

  it('AUTH unauthorized Save/Reopen preserves local authored memory', async () => {
    const repository = repositoryBase({
      saveCAS: vi.fn(() => Promise.resolve({
        ok: false as const,
        error: { code: 'UNAUTHORIZED' as const },
      })),
      getCatalog: vi.fn(() => Promise.resolve({
        ok: false as const,
        error: { code: 'UNAUTHORIZED' as const },
      })),
    });
    const { runtime, session } = runtimeFor(repository);
    session.execute({ type: 'document.rename', title: 'Keep me' });

    expect(await runtime.saveCoordinator.save()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(session.getSnapshot().document.title).toBe('Keep me');
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);

    expect(await runtime.reopenCoordinator.open(B_ID, { allowDiscardUnsaved: true })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    expect(runtime.workspace.getSnapshot().session).toBe(session);
    expect(session.getSnapshot().document.title).toBe('Keep me');
  });
});
