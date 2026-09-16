import { vi } from 'vitest';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import type { RecoveryRepository } from '@/vnext/recovery';
import {
  type AutosaveClock,
  VNextPersistenceRuntime,
  type ArchiveCatalogCasRequest,
  type CatalogListItem,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type CreateCatalogRequest,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';

export function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`;
}

export function idSequence(start = 1): () => string {
  let value = start;
  return () => uuid(value++);
}

export function documentFixture(
  id = uuid(100),
  title = 'Original',
  withAsset = false
): CatalogDocument {
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
    pages: [{ id: `page-${id}`, widthMm: 210, heightMm: 297, objects: [] }],
    assets: withAsset ? [{
      id: 'shared-asset',
      version: 'v1',
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      widthPx: 100,
      heightPx: 100,
      name: 'shared.png',
      alt: 'Shared asset',
    }] : [],
  };
}

export function envelope(
  document: CatalogDocument,
  remoteRevision = 1,
  lastMutationId = uuid(1),
  archivedAt: string | null = null,
  origin?: CatalogPersistenceEnvelope['origin']
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-15T20:00:00.000Z',
    updatedAt: '2026-09-15T20:00:00.000Z',
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt,
    ...(origin ? { origin } : {}),
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

type GetOverride = (catalogId: string) => Promise<PersistenceResult<CatalogPersistenceEnvelope>>;
type SaveOverride = (request: SaveCatalogCasRequest) => Promise<PersistenceResult<CatalogPersistenceEnvelope>>;
type CreateOverride = (request: CreateCatalogRequest) => Promise<PersistenceResult<CatalogPersistenceEnvelope>>;

export class StrictCasCatalogRepository implements CatalogRepository {
  private readonly catalogs = new Map<string, CatalogPersistenceEnvelope>();
  private clock = 0;
  private externalMutation = 80000;

  getOverride?: GetOverride;
  saveOverride?: SaveOverride;
  createOverride?: CreateOverride;
  ambiguousCreateOnce = false;

  constructor(initialDocument: CatalogDocument) {
    this.catalogs.set(initialDocument.id, envelope(initialDocument));
  }

  readonly listCatalogs = vi.fn(async (query = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> => {
    const values = [...this.catalogs.values()]
      .filter((item) => query.includeArchived || item.archivedAt === null)
      .map(({ documentSnapshot: _snapshot, lastMutationId: _mutation, ...item }) => item);
    return { ok: true, value: values };
  });

  readonly getCatalog = vi.fn(async (catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const override = this.getOverride;
    if (override) {
      this.getOverride = undefined;
      return override(catalogId);
    }
    const current = this.catalogs.get(catalogId);
    return current ? { ok: true, value: current } : { ok: false, error: { code: 'NOT_FOUND' } };
  });

  readonly createCatalog = vi.fn(async (request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const override = this.createOverride;
    if (override) {
      this.createOverride = undefined;
      return override(request);
    }
    if (this.catalogs.has(request.documentSnapshot.id)) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const created = envelope(
      request.documentSnapshot,
      1,
      request.mutationId,
      null,
      request.origin
    );
    this.catalogs.set(created.catalogId, created);
    if (this.ambiguousCreateOnce) {
      this.ambiguousCreateOnce = false;
      return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } };
    }
    return { ok: true, value: created };
  });

  readonly saveCAS = vi.fn(async (request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> => {
    const override = this.saveOverride;
    if (override) {
      this.saveOverride = undefined;
      return override(request);
    }
    return this.commitSave(request);
  });

  readonly archiveCAS = vi.fn(async (request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> => {
    const current = this.catalogs.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const archived = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      archivedAt: this.timestamp(),
      updatedAt: this.timestamp(),
    };
    this.catalogs.set(request.catalogId, archived);
    const { documentSnapshot: _snapshot, ...metadata } = archived;
    return { ok: true, value: metadata };
  });

  commitSave(request: SaveCatalogCasRequest): PersistenceResult<CatalogPersistenceEnvelope> {
    const current = this.catalogs.get(request.catalogId);
    if (!current) return { ok: false, error: { code: 'NOT_FOUND' } };
    if (current.archivedAt) return { ok: false, error: { code: 'ARCHIVED' } };
    if (current.remoteRevision !== request.expectedRemoteRevision) {
      return { ok: false, error: { code: 'CONFLICT' } };
    }
    const saved: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: request.mutationId,
      title: request.documentSnapshot.title,
      locale: request.documentSnapshot.locale,
      updatedAt: this.timestamp(),
      documentSnapshot: request.documentSnapshot,
    };
    this.catalogs.set(request.catalogId, saved);
    return { ok: true, value: saved };
  }

  current(catalogId: string): CatalogPersistenceEnvelope {
    const current = this.catalogs.get(catalogId);
    if (!current) throw new Error(`Missing catalog ${catalogId}`);
    return current;
  }

  catalogCount(): number {
    return this.catalogs.size;
  }

  externalSave(catalogId: string, title: string): CatalogPersistenceEnvelope {
    const current = this.current(catalogId);
    const saved: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: uuid(this.externalMutation++),
      title,
      updatedAt: this.timestamp(),
      documentSnapshot: { ...current.documentSnapshot, title },
    };
    this.catalogs.set(catalogId, saved);
    return saved;
  }

  externalArchive(catalogId: string): CatalogPersistenceEnvelope {
    const current = this.current(catalogId);
    const archived: CatalogPersistenceEnvelope = {
      ...current,
      remoteRevision: current.remoteRevision + 1,
      lastMutationId: uuid(this.externalMutation++),
      archivedAt: this.timestamp(),
      updatedAt: this.timestamp(),
    };
    this.catalogs.set(catalogId, archived);
    return archived;
  }

  private timestamp(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 8, 15, 20, 0, this.clock)).toISOString();
  }
}

export class ManualAutosaveClock implements AutosaveClock {
  private now = 0;
  private nextHandle = 1;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): unknown {
    const handle = this.nextHandle++;
    this.tasks.set(handle, { at: this.now + Math.max(0, delayMs), callback });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === 'number') this.tasks.delete(handle);
  }

  pendingCount(): number {
    return this.tasks.size;
  }

  advanceBy(ms: number): void {
    this.now += Math.max(0, ms);
    for (;;) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= this.now)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0]);
      const next = due[0];
      if (!next) break;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
  }
}

export async function settleAsyncWork(turns = 8): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

export interface RuntimeFixtureOptions {
  readonly autosave?: boolean;
  readonly debounceMs?: number;
  readonly autosaveClock?: AutosaveClock;
  readonly recoveryRepository?: RecoveryRepository;
  readonly authLineage?: string;
  readonly authorityScopeId?: string;
  readonly resolveAssetUrls?: (
    document: CatalogDocument
  ) => ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;
}

export function runtimeFixture(
  repository: StrictCasCatalogRepository,
  document: CatalogDocument,
  seed: number,
  options: RuntimeFixtureOptions = {}
) {
  const applicationDependencies: ApplicationExecutionDependencies = {
    createId: idSequence(seed + 10000),
  };
  const session = createDocumentSession(document, applicationDependencies);
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies,
    createMutationId: idSequence(seed + 20000),
    createOpenSessionId: idSequence(seed + 30000),
    authLineage: options.authLineage ?? 'user-a:0',
    authorityScopeId: options.authorityScopeId ?? 'scope:user-a',
    binding: repository.current(document.id),
    ...(options.resolveAssetUrls ? { resolveAssetUrls: options.resolveAssetUrls } : {}),
    ...(options.recoveryRepository ? { recoveryRepository: options.recoveryRepository } : {}),
    ...(options.autosave === false
      ? {}
      : {
          autosave: {
            debounceMs: options.debounceMs ?? 25,
            ...(options.autosaveClock ? { clock: options.autosaveClock } : {}),
          },
        }),
  });
  return { runtime, session };
}
