import { describe, expect, it, vi } from 'vitest';
import {
  createStaticPageTemplateRegistry,
  type ApplicationExecutionDependencies,
} from '@/vnext/application';
import {
  CatalogLibraryService,
  projectCatalogLibraryItems,
} from '@/vnext/library';
import type {
  ArchiveCatalogCasRequest,
  CatalogListItem,
  CatalogPersistenceEnvelope,
  CatalogPersistenceMetadata,
  CatalogRepository,
  CreateCatalogRequest,
  PersistenceResult,
  SaveCatalogCasRequest,
} from '@/vnext/persistence';

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function idSequence(start = 1): () => string {
  let next = start;
  return () => uuid(next++);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const dependencies: ApplicationExecutionDependencies = {
  createId: idSequence(5000),
  templateRegistry: createStaticPageTemplateRegistry([]),
};

class MemoryCatalogRepository implements CatalogRepository {
  private readonly catalogs = new Map<string, CatalogPersistenceEnvelope>();
  private tick = 0;
  beforeNextSave?: () => void;
  beforeNextArchive?: () => void;
  readonly listCatalogs = vi.fn(async (query = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => {
    const values = [...this.catalogs.values()]
      .filter((item) => query.includeArchived || item.archivedAt === null)
      .map(({ documentSnapshot: _snapshot, lastMutationId: _mutation, ...item }) => item);
    return { ok: true, value: values };
  });
  readonly getCatalog = vi.fn(async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const value = this.catalogs.get(catalogId);
    return value ? { ok: true, value } : { ok: false, error: { code: 'NOT_FOUND' } };
  });

  readonly createCatalog = vi.fn(async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    if (this.catalogs.has(request.documentSnapshot.id)) return { ok: false, error: { code: 'CONFLICT' } };
    const timestamp = this.timestamp();
    const envelope: CatalogPersistenceEnvelope = {
      catalogId: request.documentSnapshot.id,
      remoteRevision: 1,
      lastMutationId: request.mutationId,
      title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: 'user-a',
      updatedBy: 'user-a',
      archivedAt: null,
      documentSchemaVersion: 1,
      documentSnapshot: request.documentSnapshot,
    };
    this.catalogs.set(envelope.catalogId, envelope);
    return { ok: true, value: envelope };
  });

  readonly saveCAS = vi.fn(async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    this.beforeNextSave?.();
    this.beforeNextSave = undefined;
    const current = this.catalogs.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const envelope: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale,
      updatedAt: this.timestamp(),
      documentSnapshot: request.documentSnapshot,
    };
    this.catalogs.set(request.catalogId, envelope);
    return { ok: true, value: envelope };
  });

  readonly archiveCAS = vi.fn(async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    this.beforeNextArchive?.();
    this.beforeNextArchive = undefined;
    const current = this.catalogs.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) return { ok: false, error: { code: 'CONFLICT' } };
    const envelope: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      archivedAt: this.timestamp(),
      updatedAt: this.timestamp(),
    };
    this.catalogs.set(request.catalogId, envelope);
    const { documentSnapshot: _snapshot, ...metadata } = envelope;
    return { ok: true, value: metadata };
  });

  seed(envelope: CatalogPersistenceEnvelope): void {
    this.catalogs.set(envelope.catalogId, envelope);
  }

  advance(catalogId: string): void {
    const current = this.catalogs.get(catalogId);
    if (!current) return;
    this.catalogs.set(catalogId, {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: uuid(9000 + current.remoteRevision),
      updatedAt: this.timestamp(),
    });
  }

  current(catalogId: string): CatalogPersistenceEnvelope {
    const value = this.catalogs.get(catalogId);
    if (!value) throw new Error('missing catalog');
    return value;
  }

  private timestamp(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 8, 14, 12, 0, this.tick)).toISOString();
  }
}

function service(repository: MemoryCatalogRepository, start = 100): CatalogLibraryService {
  const ids = idSequence(start);
  return new CatalogLibraryService({
    repository,
    applicationDependencies: dependencies,
    createId: ids,
    createMutationId: ids,
    createOpenSessionId: ids,
    authLineage: () => 'user-a:1',
    authorityScopeId: () => 'workspace:user-a',
  });
}

async function create(repository: MemoryCatalogRepository, title: string, start: number): Promise<CatalogPersistenceEnvelope> {
  const created = await service(repository, start).createBlank(title);
  if (!created.ok) throw new Error(created.error.code);
  return created.value;
}

describe('W3.E CatalogLibraryService', () => {
  it('LIB-01/02/03 lists lightweight active metadata without fetching documents', async () => {
    const repository = new MemoryCatalogRepository();
    await create(repository, 'Bomba', 100);
    const result = await service(repository, 200).list();
    expect(result.ok && result.value.map((item) => item.title)).toEqual(['Bomba']);
    expect(repository.listCatalogs).toHaveBeenCalledWith({ includeArchived: false });
    expect(repository.getCatalog).not.toHaveBeenCalled();
    if (result.ok) expect(result.value[0]).not.toHaveProperty('documentSnapshot');
  });

  it('LIB-04/05/06 separates archived items and applies deterministic search/title ordering', async () => {
    const repository = new MemoryCatalogRepository();
    const zeta = await create(repository, 'Zeta', 300);
    const alpha = await create(repository, 'Álpha', 400);
    await service(repository, 500).archive(zeta.catalogId);
    const archived = await service(repository, 600).list({ view: 'archived' });
    expect(archived.ok && archived.value.map((item) => item.title)).toEqual(['Zeta']);
    expect(repository.listCatalogs).toHaveBeenLastCalledWith({ includeArchived: true });
    const active = await service(repository, 700).list({ search: 'alpha', sort: 'title-asc' });
    expect(active.ok && active.value.map((item) => item.catalogId)).toEqual([alpha.catalogId]);
    const { documentSnapshot: _snapshot, lastMutationId: _mutation, ...alphaItem } = repository.current(alpha.catalogId);
    expect(projectCatalogLibraryItems([alphaItem], { search: 'ALPHA' })).toHaveLength(1);
  });

  it('LIB-07 creates a valid fresh persisted blank catalog and returns its exact acknowledgement', async () => {
    const repository = new MemoryCatalogRepository();
    const result = await service(repository, 800).createBlank();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.catalogId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(result.value.documentSnapshot.id).toBe(result.value.catalogId);
    expect(result.value.documentSnapshot.pages).toHaveLength(1);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
  });

  it('LIB-07 reconciles an ambiguous create only when GET proves the exact mutation and document', async () => {
    const storage = new MemoryCatalogRepository();
    const repository: CatalogRepository = {
      listCatalogs: storage.listCatalogs,
      getCatalog: storage.getCatalog,
      createCatalog: vi.fn(async (request: CreateCatalogRequest) => {
        const committed = await storage.createCatalog(request);
        expect(committed.ok).toBe(true);
        return { ok: false as const, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const } };
      }),
      saveCAS: storage.saveCAS,
      archiveCAS: storage.archiveCAS,
    };
    const ids = idSequence(850);
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies: dependencies,
      createId: ids,
      createMutationId: ids,
      createOpenSessionId: ids,
      authLineage: () => 'user-a:1',
      authorityScopeId: () => 'workspace:user-a',
    });
    const result = await library.createBlank('ACK ambíguo');
    expect(result.ok).toBe(true);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(storage.getCatalog).toHaveBeenCalledTimes(1);
  });

  it('LIB-07 keeps an unresolved ambiguous create bound to the same catalog until exact reconciliation succeeds', async () => {
    const storage = new MemoryCatalogRepository();
    let getAttempts = 0;
    const repository: CatalogRepository = {
      listCatalogs: storage.listCatalogs,
      getCatalog: vi.fn(async (catalogId: string) => {
        getAttempts += 1;
        if (getAttempts === 1) return { ok: false as const, error: { code: 'REMOTE_FAILURE' as const } };
        return storage.getCatalog(catalogId);
      }),
      createCatalog: vi.fn(async (request: CreateCatalogRequest) => {
        const committed = await storage.createCatalog(request);
        expect(committed.ok).toBe(true);
        return { ok: false as const, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' as const } };
      }),
      saveCAS: storage.saveCAS,
      archiveCAS: storage.archiveCAS,
    };
    const ids = idSequence(875);
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies: dependencies,
      createId: ids,
      createMutationId: ids,
      createOpenSessionId: ids,
      authLineage: () => 'user-a:1',
      authorityScopeId: () => 'workspace:user-a',
    });

    const unresolved = await library.createBlank('ACK ainda incerto');
    expect(unresolved).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });

    const reconciled = await library.createBlank('não deve criar outro catálogo');
    expect(reconciled.ok).toBe(true);
    expect(repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(repository.getCatalog).toHaveBeenCalledTimes(2);
    expect(storage.listCatalogs).not.toHaveBeenCalled();
  });

  it('LIB-07 rejects a create acknowledgement that does not prove the dispatched mutation', async () => {
    const repository = new MemoryCatalogRepository();
    repository.createCatalog.mockImplementationOnce(async (request) => ({
      ok: true,
      value: {
        catalogId: request.documentSnapshot.id,
        remoteRevision: 1,
        lastMutationId: uuid(9999),
        title: request.documentSnapshot.title,
        locale: request.documentSnapshot.locale,
        createdAt: '2026-09-14T12:00:00.000Z',
        updatedAt: '2026-09-14T12:00:00.000Z',
        createdBy: 'user-a',
        updatedBy: 'user-a',
        archivedAt: null,
        documentSchemaVersion: 1,
        documentSnapshot: request.documentSnapshot,
      },
    }));
    expect(await service(repository, 875).createBlank()).toMatchObject({
      ok: false,
      error: { code: 'REMOTE_DIVERGENCE' },
    });
  });

  it('LIB-10 renames through canonical document.rename plus SaveCoordinator and only returns after ACK', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Original', 900);
    const result = await service(repository, 1000).rename(original.catalogId, 'Renomeado');
    expect(result).toMatchObject({ ok: true, value: { title: 'Renomeado' } });
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    const request = repository.saveCAS.mock.calls[0][0];
    expect(request.expectedRemoteRevision).toBe(1);
    expect(request.documentSnapshot.title).toBe('Renomeado');
    expect(repository.current(original.catalogId).remoteRevision).toBe(2);
  });

  it('LIB-11/12 stale Rename conflicts and preserves current remote truth', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Original', 1100);
    repository.beforeNextSave = () => repository.advance(original.catalogId);
    const result = await service(repository, 1200).rename(original.catalogId, 'Stale overwrite');
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(repository.current(original.catalogId).title).toBe('Original');
    expect(repository.current(original.catalogId).remoteRevision).toBe(2);
  });

  it('LIB-14 archive uses CAS and moves the authoritative record to archived state', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Ativo', 1300);
    const archived = await service(repository, 1400).archive(original.catalogId);
    expect(archived.ok && archived.value.archivedAt).toBeTruthy();
    expect(repository.current(original.catalogId).remoteRevision).toBe(2);
  });

  it('LIB-15 stale Archive conflicts and fails closed without archiving the newer revision', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Ativo', 1500);
    repository.beforeNextArchive = () => repository.advance(original.catalogId);
    const result = await service(repository, 1550).archive(original.catalogId);
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(repository.current(original.catalogId).remoteRevision).toBe(2);
    expect(repository.current(original.catalogId).archivedAt).toBeNull();
  });

  it('LIB-16/18 stale pre-archive Save cannot resurrect or unarchive', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Ativo', 1600);
    const staleSnapshot = original.documentSnapshot;
    await service(repository, 1700).archive(original.catalogId);
    const staleSave = await repository.saveCAS({
      mutationId: uuid(1800),
      catalogId: original.catalogId,
      expectedRemoteRevision: original.remoteRevision,
      documentSnapshot: { ...staleSnapshot, title: 'Ressuscitado' },
    });
    expect(staleSave).toMatchObject({ ok: false, error: { code: 'ARCHIVED' } });
    expect(repository.current(original.catalogId).archivedAt).toBeTruthy();
    expect(repository.current(original.catalogId).title).toBe('Ativo');
  });

  it('LIB-17 stale Rename after Archive cannot resurrect the catalog', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Ativo', 1900);
    await service(repository, 2000).archive(original.catalogId);
    const renamed = await service(repository, 2100).rename(original.catalogId, 'Não volta');
    expect(renamed).toMatchObject({ ok: false, error: { code: 'ARCHIVED' } });
    expect(repository.current(original.catalogId).archivedAt).toBeTruthy();
    expect(repository.current(original.catalogId).title).toBe('Ativo');
  });

  it('LIB-22/23/24 exposes no duplicate, delete, or restore operation', () => {
    const library = service(new MemoryCatalogRepository(), 2200) as unknown as Record<string, unknown>;
    expect(library.duplicate).toBeUndefined();
    expect(library.delete).toBeUndefined();
    expect(library.restore).toBeUndefined();
  });

  it('LIB-21 propagates unauthorized Library access without fabricating rows or mutations', async () => {
    const unauthorized: CatalogRepository = {
      listCatalogs: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'UNAUTHORIZED' as const } })),
      getCatalog: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'UNAUTHORIZED' as const } })),
      createCatalog: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'UNAUTHORIZED' as const } })),
      saveCAS: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'UNAUTHORIZED' as const } })),
      archiveCAS: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'UNAUTHORIZED' as const } })),
    };
    const ids = idSequence(2300);
    const library = new CatalogLibraryService({
      repository: unauthorized,
      applicationDependencies: dependencies,
      createId: ids,
      createMutationId: ids,
      createOpenSessionId: ids,
      authLineage: () => 'user-a:1',
      authorityScopeId: () => 'workspace:user-a',
    });
    expect(await library.list()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(await library.rename(uuid(1), 'Blocked')).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(await library.archive(uuid(1))).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(unauthorized.saveCAS).not.toHaveBeenCalled();
    expect(unauthorized.archiveCAS).not.toHaveBeenCalled();
  });

  it('fails stale list/rename/archive results closed when the active auth authority changes mid-operation', async () => {
    const repository = new MemoryCatalogRepository();
    const original = await create(repository, 'Authority A', 2400);
    let lineage = 'user-a:1';
    let scope = 'workspace:user-a';
    const ids = idSequence(2500);
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies: dependencies,
      createId: ids,
      createMutationId: ids,
      createOpenSessionId: ids,
      authLineage: () => lineage,
      authorityScopeId: () => scope,
    });

    const listPending = deferred<PersistenceResult<readonly CatalogListItem[]>>();
    repository.listCatalogs.mockImplementationOnce(() => listPending.promise);
    const list = library.list();
    lineage = 'user-b:2';
    scope = 'workspace:user-b';
    const { documentSnapshot: _snapshot, lastMutationId: _mutation, ...item } = repository.current(original.catalogId);
    listPending.resolve({ ok: true, value: [item] });
    await expect(list).resolves.toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });

    lineage = 'user-a:3';
    scope = 'workspace:user-a';
    const renamePending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    repository.getCatalog.mockImplementationOnce(() => renamePending.promise);
    const rename = library.rename(original.catalogId, 'Must not cross identity');
    lineage = 'user-b:4';
    scope = 'workspace:user-b';
    renamePending.resolve({ ok: true, value: repository.current(original.catalogId) });
    await expect(rename).resolves.toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(repository.saveCAS).not.toHaveBeenCalled();

    lineage = 'user-a:5';
    scope = 'workspace:user-a';
    const archivePending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    repository.getCatalog.mockImplementationOnce(() => archivePending.promise);
    const archive = library.archive(original.catalogId);
    lineage = 'user-b:6';
    scope = 'workspace:user-b';
    archivePending.resolve({ ok: true, value: repository.current(original.catalogId) });
    await expect(archive).resolves.toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(repository.archiveCAS).not.toHaveBeenCalled();
  });
});
