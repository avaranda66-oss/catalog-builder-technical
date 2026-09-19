import { describe, expect, it } from 'vitest';
import {
  PreparedCatalogCreateCoordinator,
  type CatalogPersistenceEnvelope,
  type CreateCatalogRequest,
} from '@/vnext/persistence';
import {
  StrictCasCatalogRepository,
  documentFixture,
  envelope,
  idSequence,
  uuid,
} from './w3h-fixtures';

function coordinator(repository: StrictCasCatalogRepository, seed = 7000) {
  return new PreparedCatalogCreateCoordinator({
    repository,
    createMutationId: idSequence(seed),
    authLineage: () => 'user-a:0',
    authorityScopeId: () => 'scope:user-a',
  });
}

describe('W3.H PreparedCatalogCreateCoordinator ghost-copy safety', () => {
  it('accepts an ambiguous create when exact authoritative C2/M2 proves the same committed attempt', async () => {
    const source = documentFixture(uuid(100));
    const copy = documentFixture(uuid(200), 'Copy C2');
    const repository = new StrictCasCatalogRepository(source);
    repository.ambiguousCreateOnce = true;
    const create = coordinator(repository);

    const result = await create.create(copy, {
      originKind: 'duplicate',
      originId: source.id,
      originRevision: 1,
    });

    expect(result).toMatchObject({ ok: true, value: { catalogId: copy.id, remoteRevision: 1 } });
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledTimes(1);
    expect(repository.catalogCount()).toBe(2);
    expect(create.getState()).toBe('idle');
  });

  it('replays NOT_FOUND using the exact same C2/M2 request instead of allocating a new identity', async () => {
    const source = documentFixture(uuid(101));
    const copy = documentFixture(uuid(201), 'Copy C2');
    const repository = new StrictCasCatalogRepository(source);
    const firstRequests: CreateCatalogRequest[] = [];
    repository.createOverride = async (request) => {
      firstRequests.push(request);
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } };
    };
    const create = coordinator(repository, 7100);

    const result = await create.create(copy);
    expect(result.ok).toBe(true);
    const calls = repository.createCatalog.mock.calls.map(([request]) => request);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[1]?.documentSnapshot.id).toBe(copy.id);
    expect(calls[1]?.mutationId).toBe(calls[0]?.mutationId);
    expect(firstRequests).toHaveLength(1);
    expect(repository.catalogCount()).toBe(2);
  });

  it('retains pending C2/M2 when authoritative read is unavailable and ignores a new C3 input until C2 resolves', async () => {
    const source = documentFixture(uuid(102));
    const copyC2 = documentFixture(uuid(202), 'Copy C2');
    const unrelatedC3 = documentFixture(uuid(203), 'Copy C3');
    const repository = new StrictCasCatalogRepository(source);
    repository.createOverride = async () => ({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });
    repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    const create = coordinator(repository, 7200);

    const first = await create.create(copyC2);
    expect(first).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    expect(create.getState()).toBe('pending-verification');
    const originalAttempt = repository.createCatalog.mock.calls[0]?.[0];

    const resumed = await create.create(unrelatedC3);
    expect(resumed).toMatchObject({ ok: true, value: { catalogId: copyC2.id } });
    const calls = repository.createCatalog.mock.calls.map(([request]) => request);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(originalAttempt);
    expect(calls.some((request) => request.documentSnapshot.id === unrelatedC3.id)).toBe(false);
    expect(repository.catalogCount()).toBe(2);
    expect(create.getState()).toBe('idle');
  });

  it('fails closed on divergent authoritative C2 and keeps the unresolved attempt without allocating C3/M3', async () => {
    const source = documentFixture(uuid(103));
    const copyC2 = documentFixture(uuid(204), 'Copy C2');
    const unrelatedC3 = documentFixture(uuid(205), 'Copy C3');
    const repository = new StrictCasCatalogRepository(source);
    let captured: CreateCatalogRequest | undefined;
    repository.createOverride = async (request) => {
      captured = request;
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } };
    };
    repository.getOverride = async () => ({
      ok: true,
      value: envelope(copyC2, 2, uuid(99999)) as CatalogPersistenceEnvelope,
    });
    const create = coordinator(repository, 7300);

    const first = await create.create(copyC2);
    expect(first).toMatchObject({ ok: false, error: { code: 'REMOTE_DIVERGENCE' } });
    expect(create.getState()).toBe('pending-verification');
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(captured?.documentSnapshot.id).toBe(copyC2.id);

    const resumed = await create.create(unrelatedC3);
    expect(resumed).toMatchObject({ ok: true, value: { catalogId: copyC2.id } });
    const calls = repository.createCatalog.mock.calls.map(([request]) => request);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls.some((request) => request.documentSnapshot.id === unrelatedC3.id)).toBe(false);
  });
});
