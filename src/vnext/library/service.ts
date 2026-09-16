import {
  CatalogCloneService,
  createCatalogDocument,
  createDocumentSession,
  type ApplicationExecutionDependencies,
} from '../application';
import type { CatalogDocument } from '../domain';
import {
  PreparedCatalogCreateCoordinator,
  VNextPersistenceRuntime,
  parsePersistenceEnvelope,
  type CatalogListItem,
  type CatalogOriginMetadata,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type SaveFailureCode,
} from '../persistence';
import type { CatalogStarterRegistry, CatalogStarterSummary } from './starter-registry';

export const CATALOG_CLONE_ORIGIN_KIND = {
  duplicate: 'duplicate',
  starter: 'starter',
} as const;

export type CatalogCloneOriginKind = typeof CATALOG_CLONE_ORIGIN_KIND[keyof typeof CATALOG_CLONE_ORIGIN_KIND];

export interface CatalogCloneOriginMetadata extends CatalogOriginMetadata {
  readonly originKind: CatalogCloneOriginKind;
  readonly originId: string;
  readonly originRevision: number;
}

export type CatalogLibraryView = 'active' | 'archived';
export type CatalogLibrarySort = 'updated-desc' | 'title-asc' | 'title-desc';
export type CatalogLibraryCreateState = 'idle' | 'pending-verification';

export interface CatalogLibraryQuery {
  readonly view?: CatalogLibraryView;
  readonly search?: string;
  readonly sort?: CatalogLibrarySort;
}

export type CatalogLibraryFailureCode =
  | SaveFailureCode
  | 'INVALID_TITLE'
  | 'STARTER_NOT_FOUND'
  | 'ACTION_REJECTED'
  | 'REMOTE_DIVERGENCE'
  | 'STALE_RESULT';

export type CatalogLibraryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: CatalogLibraryFailureCode; readonly message?: string } };

export interface CatalogLibraryServiceOptions {
  readonly repository: CatalogRepository;
  readonly applicationDependencies: ApplicationExecutionDependencies;
  readonly createId: () => string;
  readonly createMutationId: () => string;
  readonly createOpenSessionId: () => string;
  readonly authLineage: () => string;
  readonly authorityScopeId: () => string;
  readonly starterRegistry?: CatalogStarterRegistry;
}

interface CatalogLibraryAuthority {
  readonly authLineage: string;
  readonly authorityScopeId: string;
}

function failure<T>(code: CatalogLibraryFailureCode, message?: string): CatalogLibraryResult<T> {
  return { ok: false, error: { code, ...(message ? { message } : {}) } };
}

function metadataFromEnvelope(envelope: CatalogPersistenceEnvelope): CatalogPersistenceMetadata {
  const { documentSnapshot: _documentSnapshot, ...metadata } = envelope;
  return metadata;
}

function listItemFromMetadata(metadata: CatalogPersistenceMetadata): CatalogListItem {
  const { lastMutationId: _lastMutationId, ...item } = metadata;
  return item;
}

function normalizedText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

function compareTitle(left: CatalogListItem, right: CatalogListItem): number {
  const leftTitle = normalizedText(left.title);
  const rightTitle = normalizedText(right.title);
  if (leftTitle < rightTitle) return -1;
  if (leftTitle > rightTitle) return 1;
  return left.catalogId < right.catalogId ? -1 : left.catalogId > right.catalogId ? 1 : 0;
}

function compareUpdatedDesc(left: CatalogListItem, right: CatalogListItem): number {
  if (left.updatedAt > right.updatedAt) return -1;
  if (left.updatedAt < right.updatedAt) return 1;
  return compareTitle(left, right);
}

export function projectCatalogLibraryItems(
  items: readonly CatalogListItem[],
  query: CatalogLibraryQuery = {}
): readonly CatalogListItem[] {
  const view = query.view ?? 'active';
  const normalizedSearch = query.search ? normalizedText(query.search.trim()) : '';
  const filtered = items.filter((item) => {
    const belongsToView = view === 'active' ? item.archivedAt === null : item.archivedAt !== null;
    if (!belongsToView) return false;
    if (!normalizedSearch) return true;
    return normalizedText(item.title).includes(normalizedSearch);
  });
  const sort = query.sort ?? 'updated-desc';
  return [...filtered].sort((left, right) => {
    if (sort === 'title-asc') return compareTitle(left, right);
    if (sort === 'title-desc') return compareTitle(right, left);
    return compareUpdatedDesc(left, right);
  });
}

export class CatalogLibraryService {
  private readonly cloneService: CatalogCloneService;
  private readonly createCoordinator: PreparedCatalogCreateCoordinator;

  constructor(private readonly options: CatalogLibraryServiceOptions) {
    this.cloneService = new CatalogCloneService(options.createId);
    this.createCoordinator = new PreparedCatalogCreateCoordinator({
      repository: options.repository,
      createMutationId: options.createMutationId,
      authLineage: options.authLineage,
      authorityScopeId: options.authorityScopeId,
    });
  }

  private captureAuthority(): CatalogLibraryAuthority {
    return {
      authLineage: this.options.authLineage(),
      authorityScopeId: this.options.authorityScopeId(),
    };
  }

  private authorityIsCurrent(authority: CatalogLibraryAuthority): boolean {
    return this.options.authLineage() === authority.authLineage
      && this.options.authorityScopeId() === authority.authorityScopeId;
  }

  private staleAuthority<T>(): CatalogLibraryResult<T> {
    return failure('STALE_RESULT', 'The active account changed while the Library operation was running');
  }

  getCreateState(): CatalogLibraryCreateState {
    return this.createCoordinator.getState();
  }

  listStarters(): readonly CatalogStarterSummary[] {
    return this.options.starterRegistry?.list() ?? [];
  }

  private async createPreparedDocument(
    authority: CatalogLibraryAuthority,
    input: CatalogPersistenceEnvelope['documentSnapshot'],
    origin?: CatalogCloneOriginMetadata
  ): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    return this.createCoordinator.create(input, origin);
  }

  async list(query: CatalogLibraryQuery = {}): Promise<CatalogLibraryResult<readonly CatalogListItem[]>> {
    const authority = this.captureAuthority();
    const view = query.view ?? 'active';
    const result = await this.options.repository.listCatalogs({ includeArchived: view === 'archived' });
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!result.ok) return failure(result.error.code, result.error.message);
    return { ok: true, value: projectCatalogLibraryItems(result.value, query) };
  }

  async createBlank(title = 'Novo catálogo'): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    const authority = this.captureAuthority();
    let documentSnapshot;
    try {
      documentSnapshot = createCatalogDocument(this.options.createId, title.trim() || 'Novo catálogo');
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    return this.createPreparedDocument(authority, documentSnapshot);
  }

  async duplicate(catalogId: string): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    const authority = this.captureAuthority();
    const read = await this.options.repository.getCatalog(catalogId);
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!read.ok) return failure(read.error.code, read.error.message);

    let source: CatalogPersistenceEnvelope;
    try {
      source = parsePersistenceEnvelope(read.value);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (source.catalogId !== catalogId || source.documentSnapshot.id !== catalogId) {
      return failure('ENVELOPE_MISMATCH', 'Requested catalog identity does not match the authoritative document');
    }

    let documentSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
    try {
      documentSnapshot = this.cloneService.clone(source.documentSnapshot, {
        title: `Cópia de ${source.documentSnapshot.title}`,
      });
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    const origin: CatalogCloneOriginMetadata = {
      originKind: CATALOG_CLONE_ORIGIN_KIND.duplicate,
      originId: source.catalogId,
      originRevision: source.remoteRevision,
    };
    return this.createPreparedDocument(authority, documentSnapshot, origin);
  }

  async createFromStarter(starterId: string): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    const authority = this.captureAuthority();
    const starter = this.options.starterRegistry?.get(starterId);
    if (!starter) return failure('STARTER_NOT_FOUND', 'The selected Starter does not exist');

    let documentSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
    try {
      documentSnapshot = this.cloneService.clone(starter.sourceDocument);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    const origin: CatalogCloneOriginMetadata = {
      originKind: CATALOG_CLONE_ORIGIN_KIND.starter,
      originId: starter.starterId,
      originRevision: starter.revision,
    };
    return this.createPreparedDocument(authority, documentSnapshot, origin);
  }

  async saveAsCopy(
    sourceDocument: CatalogDocument,
    sourceRemoteRevision: number
  ): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    const authority = this.captureAuthority();
    let documentSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
    try {
      documentSnapshot = this.cloneService.clone(sourceDocument, {
        title: `Cópia de ${sourceDocument.title}`,
      });
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    return this.createPreparedDocument(authority, documentSnapshot, {
      originKind: CATALOG_CLONE_ORIGIN_KIND.duplicate,
      originId: sourceDocument.id,
      originRevision: sourceRemoteRevision,
    });
  }

  async rename(catalogId: string, rawTitle: string): Promise<CatalogLibraryResult<CatalogListItem>> {
    const authority = this.captureAuthority();
    const title = rawTitle.trim();
    if (!title) return failure('INVALID_TITLE', 'O nome do catálogo não pode ficar vazio.');

    const read = await this.options.repository.getCatalog(catalogId);
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!read.ok) return failure(read.error.code, read.error.message);

    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(read.value);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (envelope.catalogId !== catalogId || envelope.documentSnapshot.id !== catalogId) {
      return failure('ENVELOPE_MISMATCH', 'Requested catalog identity does not match the authoritative document');
    }

    const session = createDocumentSession(envelope.documentSnapshot, this.options.applicationDependencies);
    const action = session.execute({ type: 'document.rename', title });
    if (!action.ok) return failure('ACTION_REJECTED', action.error.details);
    if (!action.metadata.changed) return { ok: true, value: listItemFromMetadata(metadataFromEnvelope(envelope)) };

    const runtime = new VNextPersistenceRuntime({
      session,
      repository: this.options.repository,
      applicationDependencies: this.options.applicationDependencies,
      createMutationId: this.options.createMutationId,
      createOpenSessionId: this.options.createOpenSessionId,
      authLineage: authority.authLineage,
      authorityScopeId: authority.authorityScopeId,
      binding: envelope,
    });
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    const saved = await runtime.saveCoordinator.save();
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!saved.ok) return failure(saved.error.code, saved.error.message);

    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    const refreshed = await this.options.repository.getCatalog(catalogId);
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!refreshed.ok) return failure(refreshed.error.code, refreshed.error.message);
    try {
      const authoritative = parsePersistenceEnvelope(refreshed.value);
      return { ok: true, value: listItemFromMetadata(metadataFromEnvelope(authoritative)) };
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
  }

  async archive(catalogId: string): Promise<CatalogLibraryResult<CatalogPersistenceMetadata>> {
    const authority = this.captureAuthority();
    const read = await this.options.repository.getCatalog(catalogId);
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!read.ok) return failure(read.error.code, read.error.message);
    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(read.value);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (envelope.catalogId !== catalogId || envelope.documentSnapshot.id !== catalogId) {
      return failure('ENVELOPE_MISMATCH', 'Requested catalog identity does not match the authoritative document');
    }
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    const archived = await this.options.repository.archiveCAS({
      mutationId: this.options.createMutationId(),
      catalogId,
      expectedRemoteRevision: envelope.remoteRevision,
    });
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!archived.ok) return failure(archived.error.code, archived.error.message);
    return { ok: true, value: archived.value };
  }
}
