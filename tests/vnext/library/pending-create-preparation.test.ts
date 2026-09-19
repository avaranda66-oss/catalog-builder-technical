import { describe, expect, it, vi } from 'vitest';
import {
  CatalogLibraryService,
  createDefaultCatalogStarterRegistry,
  type CatalogStarterRegistry,
} from '@/vnext/library';
import {
  StrictCasCatalogRepository,
  documentFixture,
  idSequence,
  uuid,
} from '../persistence/w3h-fixtures';

function libraryFixture(
  repository: StrictCasCatalogRepository,
  start: number,
  starterRegistry?: CatalogStarterRegistry
) {
  const createId = vi.fn(idSequence(start));
  const library = new CatalogLibraryService({
    repository,
    applicationDependencies: { createId: idSequence(start + 10000) },
    createId,
    createMutationId: idSequence(start + 20000),
    createOpenSessionId: idSequence(start + 30000),
    authLineage: () => 'user-a:1',
    authorityScopeId: () => 'scope:user-a',
    ...(starterRegistry ? { starterRegistry } : {}),
  });
  return { library, createId };
}

async function establishUnresolvedPending(
  repository: StrictCasCatalogRepository,
  library: CatalogLibraryService
) {
  repository.createOverride = async () => ({
    ok: false,
    error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
  });
  repository.getOverride = async () => ({
    ok: false,
    error: { code: 'REMOTE_FAILURE' },
  });
  await expect(library.createBlank('C1 pending')).resolves.toMatchObject({
    ok: false,
    error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
  });
  const request = repository.createCatalog.mock.calls[0]?.[0];
  if (!request) throw new Error('Missing pending create request');
  return request;
}

function keepPendingUnresolved(repository: StrictCasCatalogRepository): void {
  repository.getOverride = async () => ({
    ok: false,
    error: { code: 'REMOTE_FAILURE' },
  });
  repository.getCatalog.mockClear();
}

describe('W3.H restored W3.E pending-create preparation order', () => {
  it('PENDING-PREP-01 Blank reconciles exact C1/M1 before allocating any C2 identity', async () => {
    const repository = new StrictCasCatalogRepository(documentFixture(uuid(71000), 'Existing'));
    const { library, createId } = libraryFixture(repository, 72000);
    const pending = await establishUnresolvedPending(repository, library);
    const allocations = createId.mock.calls.length;
    const mutationId = pending.mutationId;

    keepPendingUnresolved(repository);
    await expect(library.createBlank('C2 must not exist')).resolves.toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });

    expect(createId).toHaveBeenCalledTimes(allocations);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(repository.createCatalog.mock.calls[0]?.[0].mutationId).toBe(mutationId);
    expect(repository.getCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledWith(pending.documentSnapshot.id);
  });

  it('PENDING-PREP-02 Duplicate reconciles pending create before source GET or clone allocation', async () => {
    const source = documentFixture(uuid(73000), 'Source');
    const repository = new StrictCasCatalogRepository(source);
    const { library, createId } = libraryFixture(repository, 74000);
    const pending = await establishUnresolvedPending(repository, library);
    const allocations = createId.mock.calls.length;

    keepPendingUnresolved(repository);
    await expect(library.duplicate(source.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });

    expect(createId).toHaveBeenCalledTimes(allocations);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledWith(pending.documentSnapshot.id);
    expect(repository.getCatalog).not.toHaveBeenCalledWith(source.id);
  });

  it('PENDING-PREP-03 Starter reconciles pending create before starter materialization or fresh IDs', async () => {
    const repository = new StrictCasCatalogRepository(documentFixture(uuid(75000), 'Existing'));
    const baseRegistry = createDefaultCatalogStarterRegistry();
    const getStarter = vi.fn((starterId: string) => baseRegistry.get(starterId));
    const starterRegistry: CatalogStarterRegistry = {
      list: () => baseRegistry.list(),
      get: getStarter,
    };
    const { library, createId } = libraryFixture(repository, 76000, starterRegistry);
    const pending = await establishUnresolvedPending(repository, library);
    const allocations = createId.mock.calls.length;

    keepPendingUnresolved(repository);
    await expect(library.createFromStarter('essential-technical-sheet')).resolves.toMatchObject({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });

    expect(getStarter).not.toHaveBeenCalled();
    expect(createId).toHaveBeenCalledTimes(allocations);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledWith(pending.documentSnapshot.id);
  });
});
