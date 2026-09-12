import { z } from 'zod';
import type {
  ArchiveCatalogCasRequest,
  CatalogListItem,
  CatalogListQuery,
  CatalogPersistenceEnvelope,
  CatalogPersistenceMetadata,
  CatalogRepository,
  CreateCatalogRequest,
  PersistenceError,
  PersistenceErrorCode,
  PersistenceResult,
  SaveCatalogCasRequest,
} from './contracts';
import {
  PersistenceContractError,
  checkCatalogRootPersistenceCompatibility,
  parseCanonicalSnapshot,
  parsePersistenceEnvelope,
} from './snapshot';

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const canonicalUuid = z.string().regex(CANONICAL_UUID_PATTERN);
const clean = z.string().min(1);
const positiveRevision = z.number().int().safe().positive();

const OriginSchema = z.object({
  originKind: clean,
  originId: clean.optional(),
  originRevision: z.number().int().safe().nonnegative().optional(),
}).strict();

const MetadataSchema = z.object({
  catalogId: canonicalUuid,
  remoteRevision: positiveRevision,
  lastMutationId: canonicalUuid,
  title: clean,
  locale: clean,
  createdAt: clean,
  updatedAt: clean,
  createdBy: clean.nullable(),
  updatedBy: clean.nullable(),
  archivedAt: clean.nullable(),
  origin: OriginSchema.optional(),
  documentSchemaVersion: z.literal(1),
}).strict();

const ListItemSchema = MetadataSchema.omit({ lastMutationId: true });
const ListSchema = z.array(ListItemSchema);

export interface VNextPersistenceRpcError {
  readonly code?: string | null;
  readonly message?: string | null;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface VNextPersistenceRpcResponse<T = unknown> {
  readonly data: T | null;
  readonly error: VNextPersistenceRpcError | null;
}

export interface VNextPersistenceRpcClient {
  rpc(functionName: string, args?: Record<string, unknown>): Promise<VNextPersistenceRpcResponse>;
}

export interface SupabaseCatalogRepositoryOptions {
  readonly isOffline?: () => boolean;
}

type OperationKind = 'read' | 'mutation';

function failure<T>(code: PersistenceErrorCode, message?: string): PersistenceResult<T> {
  const error: PersistenceError = message ? { code, message } : { code };
  return { ok: false, error };
}

function canonicalUuidOrFailure(value: string, label: string): PersistenceResult<string> {
  return CANONICAL_UUID_PATTERN.test(value)
    ? { ok: true, value }
    : failure('INVALID_DOCUMENT', `${label} must be an exact canonical lowercase UUID`);
}

function contractFailure<T>(error: unknown): PersistenceResult<T> {
  if (error instanceof PersistenceContractError) return failure(error.code, error.message);
  return failure('INVALID_DOCUMENT', error instanceof Error ? error.message : String(error));
}

function rpcMessage(error: VNextPersistenceRpcError): string {
  return [error.message, error.details, error.hint].filter((part): part is string => Boolean(part)).join(' | ');
}

const TRANSPORT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'ABORT_ERR',
]);

function isTransportLike(error: VNextPersistenceRpcError): boolean {
  const code = error.code?.toUpperCase();
  if (code && TRANSPORT_ERROR_CODES.has(code)) return true;
  const message = rpcMessage(error).toLowerCase();
  return /failed to fetch|network|timeout|timed out|connection|econn|abort/.test(message);
}

function mapSemanticRpcError(error: VNextPersistenceRpcError): PersistenceErrorCode | null {
  const message = rpcMessage(error);
  if (message.includes('VNEXT_NOT_FOUND')) return 'NOT_FOUND';
  if (message.includes('VNEXT_ARCHIVED')) return 'ARCHIVED';
  if (message.includes('VNEXT_UNSUPPORTED_VERSION')) return 'UNSUPPORTED_VERSION';
  if (
    message.includes('VNEXT_CONFLICT') ||
    message.includes('VNEXT_DUPLICATE_CATALOG') ||
    message.includes('VNEXT_MUTATION_REUSE') ||
    message.includes('VNEXT_MUTATION_REPLAY_STALE')
  ) return 'CONFLICT';
  if (error.code === '42501' || message.includes('VNEXT_UNAUTHORIZED') || message.includes('AUTH_')) return 'UNAUTHORIZED';
  if (error.code === '40001' || error.code === '23505') return 'CONFLICT';
  if (error.code === '22023' || error.code === '22P02' || message.includes('VNEXT_INVALID_DOCUMENT')) return 'INVALID_DOCUMENT';
  return null;
}

export class SupabaseCatalogRepository implements CatalogRepository {
  private readonly isOffline: () => boolean;

  constructor(
    private readonly client: VNextPersistenceRpcClient,
    options: SupabaseCatalogRepositoryOptions = {}
  ) {
    this.isOffline = options.isOffline ?? (() => typeof navigator !== 'undefined' && navigator.onLine === false);
  }

  private async call<T>(
    functionName: string,
    args: Record<string, unknown>,
    kind: OperationKind,
    parse: (data: unknown) => T
  ): Promise<PersistenceResult<T>> {
    if (this.isOffline()) return failure('OFFLINE', 'Remote persistence is known to be offline before dispatch');

    try {
      const response = await this.client.rpc(functionName, args);
      if (response.error) {
        const semanticError = mapSemanticRpcError(response.error);
        if (semanticError) return failure(semanticError, rpcMessage(response.error));
        if (isTransportLike(response.error)) {
          return failure(
            kind === 'mutation' ? 'AMBIGUOUS_COMMIT_OUTCOME' : 'REMOTE_FAILURE',
            rpcMessage(response.error)
          );
        }
        return failure('REMOTE_FAILURE', rpcMessage(response.error));
      }
      if (response.data === null || response.data === undefined) {
        return failure('REMOTE_FAILURE', `${functionName} returned no authoritative payload`);
      }
      try {
        return { ok: true, value: parse(response.data) };
      } catch (error) {
        return contractFailure(error);
      }
    } catch (error) {
      return failure(
        kind === 'mutation' ? 'AMBIGUOUS_COMMIT_OUTCOME' : 'REMOTE_FAILURE',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async listCatalogs(query: CatalogListQuery = {}): Promise<PersistenceResult<readonly CatalogListItem[]>> {
    return this.call(
      'list_vnext_catalogs_v1',
      { p_include_archived: query.includeArchived ?? false },
      'read',
      (data) => ListSchema.parse(data)
    );
  }

  async getCatalog(catalogId: string): Promise<PersistenceResult<CatalogPersistenceEnvelope>> {
    const id = canonicalUuidOrFailure(catalogId, 'catalogId');
    if (!id.ok) return id;
    return this.call('get_vnext_catalog_v1', { p_catalog_id: id.value }, 'read', parsePersistenceEnvelope);
  }

  async createCatalog(request: CreateCatalogRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> {
    const mutation = canonicalUuidOrFailure(request.mutationId, 'mutationId');
    if (!mutation.ok) return mutation;

    let documentSnapshot;
    try {
      documentSnapshot = parseCanonicalSnapshot(request.documentSnapshot);
      const compatibility = checkCatalogRootPersistenceCompatibility(documentSnapshot);
      if (!compatibility.compatible) {
        return failure('INVALID_DOCUMENT', `Catalog root ${compatibility.catalogId} is persistence-incompatible`);
      }
    } catch (error) {
      return contractFailure(error);
    }

    return this.call(
      'create_vnext_catalog_v1',
      {
        p_mutation_id: mutation.value,
        p_document_snapshot: documentSnapshot,
        p_origin: request.origin ?? null,
      },
      'mutation',
      parsePersistenceEnvelope
    );
  }

  async saveCAS(request: SaveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceEnvelope>> {
    const catalog = canonicalUuidOrFailure(request.catalogId, 'catalogId');
    if (!catalog.ok) return catalog;
    const mutation = canonicalUuidOrFailure(request.mutationId, 'mutationId');
    if (!mutation.ok) return mutation;
    if (!Number.isSafeInteger(request.expectedRemoteRevision) || request.expectedRemoteRevision <= 0) {
      return failure('INVALID_DOCUMENT', 'expectedRemoteRevision must be a positive safe integer');
    }

    let documentSnapshot;
    try {
      documentSnapshot = parseCanonicalSnapshot(request.documentSnapshot);
      if (documentSnapshot.id !== catalog.value) {
        return failure('ENVELOPE_MISMATCH', 'catalogId does not match documentSnapshot.id');
      }
    } catch (error) {
      return contractFailure(error);
    }

    return this.call(
      'save_vnext_catalog_cas_v1',
      {
        p_catalog_id: catalog.value,
        p_expected_remote_revision: request.expectedRemoteRevision,
        p_mutation_id: mutation.value,
        p_document_snapshot: documentSnapshot,
      },
      'mutation',
      parsePersistenceEnvelope
    );
  }

  async archiveCAS(request: ArchiveCatalogCasRequest): Promise<PersistenceResult<CatalogPersistenceMetadata>> {
    const catalog = canonicalUuidOrFailure(request.catalogId, 'catalogId');
    if (!catalog.ok) return catalog;
    const mutation = canonicalUuidOrFailure(request.mutationId, 'mutationId');
    if (!mutation.ok) return mutation;
    if (!Number.isSafeInteger(request.expectedRemoteRevision) || request.expectedRemoteRevision <= 0) {
      return failure('INVALID_DOCUMENT', 'expectedRemoteRevision must be a positive safe integer');
    }

    return this.call(
      'archive_vnext_catalog_cas_v1',
      {
        p_catalog_id: catalog.value,
        p_expected_remote_revision: request.expectedRemoteRevision,
        p_mutation_id: mutation.value,
      },
      'mutation',
      (data) => MetadataSchema.parse(data)
    );
  }
}
