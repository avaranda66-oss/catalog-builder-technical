import type { CatalogDocument } from '../domain';

export const CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type PersistedDocumentSchemaVersion = typeof CURRENT_PERSISTED_DOCUMENT_SCHEMA_VERSION;

export interface CatalogOriginMetadata {
  readonly originKind: string;
  readonly originId?: string;
  readonly originRevision?: number;
}

export interface CatalogPersistenceMetadata {
  readonly catalogId: string;
  readonly remoteRevision: number;
  readonly lastMutationId: string;
  readonly title: string;
  readonly locale: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string | null;
  readonly updatedBy: string | null;
  readonly archivedAt: string | null;
  readonly origin?: CatalogOriginMetadata;
  readonly documentSchemaVersion: PersistedDocumentSchemaVersion;
}

export interface CatalogPersistenceEnvelope extends CatalogPersistenceMetadata {
  readonly documentSnapshot: CatalogDocument;
}

export type CatalogListItem = Omit<CatalogPersistenceMetadata, 'lastMutationId'>;

export interface CatalogPersistenceHandle {
  readonly catalogId: string;
  readonly remoteRevision: number;
  readonly lastMutationId: string;
}

export type CatalogRootPersistenceCompatibility =
  | {
      readonly compatible: true;
      readonly catalogId: string;
    }
  | {
      readonly compatible: false;
      readonly catalogId: string;
      readonly reason: 'ROOT_ID_NOT_UUID_COMPATIBLE';
    };

export const PERSISTENCE_ERROR_CODES = [
  'NOT_FOUND',
  'UNAUTHORIZED',
  'ARCHIVED',
  'CONFLICT',
  'INVALID_DOCUMENT',
  'UNSUPPORTED_VERSION',
  'OFFLINE',
  'REMOTE_FAILURE',
  'AMBIGUOUS_COMMIT_OUTCOME',
  'ENVELOPE_MISMATCH',
] as const;

export type PersistenceErrorCode = (typeof PERSISTENCE_ERROR_CODES)[number];

export interface PersistenceError {
  readonly code: PersistenceErrorCode;
  readonly message?: string;
}

export type PersistenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PersistenceError };

export interface CatalogListQuery {
  readonly includeArchived?: boolean;
}

export interface CreateCatalogRequest {
  readonly mutationId: string;
  readonly documentSnapshot: CatalogDocument;
  readonly origin?: CatalogOriginMetadata;
}

export interface SaveCatalogCasRequest {
  readonly mutationId: string;
  readonly catalogId: string;
  readonly expectedRemoteRevision: number;
  readonly documentSnapshot: CatalogDocument;
}

export interface ArchiveCatalogCasRequest {
  readonly mutationId: string;
  readonly catalogId: string;
  readonly expectedRemoteRevision: number;
}

/**
 * Infrastructure-neutral W3 persistence contract.
 * Implementations belong to later W3 slices; this interface carries no transport authority.
 */
export interface CatalogRepository {
  listCatalogs(query?: CatalogListQuery): Promise<PersistenceResult<readonly CatalogListItem[]>>;
  getCatalog(catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>>;
  createCatalog(request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>>;
  saveCAS(request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>>;
  archiveCAS(request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>>;
}
