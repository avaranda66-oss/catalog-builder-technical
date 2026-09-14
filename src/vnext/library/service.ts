import {
  createCatalogDocument,
  createDocumentSession,
  type ApplicationExecutionDependencies,
} from '../application';
import {
  VNextPersistenceRuntime,
  canonicalDocumentEquivalence,
  parsePersistenceEnvelope,
  type CatalogListItem,
  type CatalogOriginMetadata,
  type CatalogPersistenceEnvelope,
  type CatalogPersistenceMetadata,
  type CatalogRepository,
  type SaveFailureCode,
} from '../persistence';

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
}

interface CatalogLibraryAuthority {
  readonly authLineage: string;
  readonly authorityScopeId: string;
}

interface PendingCreateAttempt {
  readonly authority: CatalogLibraryAuthority;
  readonly documentSnapshot: CatalogPersistenceEnvelope['documentSnapshot'];
  readonly mutationId: string;
  readonly origin?: CatalogOriginMetadata;
}

function sameCreateOrigin(left: CatalogOriginMetadata | undefined, right: CatalogOriginMetadata | undefined): boolean {
  if (!left || !right) return left === right;
  return left.originKind === right.originKind
    && left.originId === right.originId
    && left.originRevision === right.originRevision;
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
  private pendingCreate?: PendingCreateAttempt;

  constructor(private readonly options: CatalogLibraryServiceOptions) {}

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

  private sameAuthority(left: CatalogLibraryAuthority, right: CatalogLibraryAuthority): boolean {
    return left.authLineage === right.authLineage && left.authorityScopeId === right.authorityScopeId;
  }

  getCreateState(): CatalogLibraryCreateState {
    if (!this.pendingCreate) return 'idle';
    if (!this.authorityIsCurrent(this.pendingCreate.authority)) {
      this.pendingCreate = undefined;
      return 'idle';
    }
    return 'pending-verification';
  }

  private createRequest(pending: PendingCreateAttempt) {
    return {
      mutationId: pending.mutationId,
      documentSnapshot: pending.documentSnapshot,
      ...(pending.origin ? { origin: pending.origin } : {}),
    };
  }

  private async replayPendingCreate(
    pending: PendingCreateAttempt
  ): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.staleAuthority();
    }
    const replay = await this.options.repository.createCatalog(this.createRequest(pending));
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.staleAuthority();
    }
    if (!replay.ok) {
      return failure(replay.error.code, replay.error.message);
    }
    const verified = this.verifiedCreateAcknowledgement(
      replay.value,
      pending.documentSnapshot.id,
      pending.mutationId,
      pending.documentSnapshot,
      pending.origin
    );
    if (verified.ok) this.pendingCreate = undefined;
    return verified;
  }

  private async reconcilePendingCreate(
    pending: PendingCreateAttempt
  ): Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>> {
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.staleAuthority();
    }
    const verification = await this.options.repository.getCatalog(pending.documentSnapshot.id);
    if (!this.authorityIsCurrent(pending.authority)) {
      this.pendingCreate = undefined;
      return this.staleAuthority();
    }
    if (!verification.ok) {
      if (verification.error.code === 'NOT_FOUND') {
        return this.replayPendingCreate(pending);
      }
      if (
        verification.error.code === 'OFFLINE'
        || verification.error.code === 'REMOTE_FAILURE'
        || verification.error.code === 'AMBIGUOUS_COMMIT_OUTCOME'
      ) {
        return failure('AMBIGUOUS_COMMIT_OUTCOME', verification.error.message);
      }
      return failure(verification.error.code, verification.error.message);
    }
    const verified = this.verifiedCreateAcknowledgement(
      verification.value,
      pending.documentSnapshot.id,
      pending.mutationId,
      pending.documentSnapshot,
      pending.origin
    );
    if (verified.ok) this.pendingCreate = undefined;
    return verified;
  }

  private verifiedCreateAcknowledgement(
    value: CatalogPersistenceEnvelope,
    catalogId: string,
    mutationId: string,
    expectedDocument: CatalogPersistenceEnvelope['documentSnapshot'],
    expectedOrigin: CatalogOriginMetadata | undefined
  ): CatalogLibraryResult<CatalogPersistenceEnvelope> {
    let envelope: CatalogPersistenceEnvelope;
    try {
      envelope = parsePersistenceEnvelope(value);
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    if (
      envelope.catalogId !== catalogId
      || envelope.documentSnapshot.id !== catalogId
      || envelope.lastMutationId !== mutationId
      || envelope.remoteRevision !== 1
      || envelope.archivedAt !== null
      || canonicalDocumentEquivalence(envelope.documentSnapshot) !== canonicalDocumentEquivalence(expectedDocument)
      || !sameCreateOrigin(envelope.origin, expectedOrigin)
    ) {
      return failure('REMOTE_DIVERGENCE', 'Create acknowledgement does not prove the requested catalog mutation');
    }
    return { ok: true, value: envelope };
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
    if (this.pendingCreate) {
      if (this.sameAuthority(this.pendingCreate.authority, authority)) {
        return this.reconcilePendingCreate(this.pendingCreate);
      }
      this.pendingCreate = undefined;
    }
    let documentSnapshot;
    try {
      documentSnapshot = createCatalogDocument(this.options.createId, title.trim() || 'Novo catálogo');
    } catch (error) {
      return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
    }
    const mutationId = this.options.createMutationId();
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    const pending: PendingCreateAttempt = { authority, documentSnapshot, mutationId };
    const result = await this.options.repository.createCatalog(this.createRequest(pending));
    if (!this.authorityIsCurrent(authority)) return this.staleAuthority();
    if (!result.ok) {
      if (result.error.code !== 'AMBIGUOUS_COMMIT_OUTCOME') {
        return failure(result.error.code, result.error.message);
      }
      this.pendingCreate = pending;
      return this.reconcilePendingCreate(pending);
    }
    const verified = this.verifiedCreateAcknowledgement(
      result.value,
      documentSnapshot.id,
      mutationId,
      documentSnapshot,
      pending.origin
    );
    if (!verified.ok) this.pendingCreate = pending;
    return verified;
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
