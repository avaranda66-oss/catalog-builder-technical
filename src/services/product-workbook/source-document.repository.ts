// src/services/product-workbook/source-document.repository.ts
// Repositório de persistência de Source Documents (PIM.W2B / H1B CAS V2)
// Estritamente tipado. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SourceDocument,
  parseSourceDocument
} from '../../domain/product-workbook';
import {
  MAX_SAFE_PERSISTENCE_VERSION,
  PersistedSourceDocument,
  ProductSourceDocumentRepository,
  ProductWorkbookPersistenceError,
  SaveSourceDocumentParams,
  SaveSourceDocumentResult,
  SourceDocumentAuthorizationError,
  SourceDocumentConflictError
} from './persistence.types';

export class SupabaseProductSourceDocumentRepository implements ProductSourceDocumentRepository {
  private readonly client: SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? null;
  }

  public async getSourceDocument(id: string): Promise<SourceDocument | null> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    if (!id || trimString(id) === '') {
      throw new ProductWorkbookPersistenceError('INVALID_SOURCE_DOCUMENT_ID', 'ID do documento fonte é obrigatório.');
    }

    const { data, error } = await this.client.rpc('get_source_document_v1', {
      p_id: id
    });

    if (error) {
      if (error.code === '42501' || error.message.includes('AUTH_READ_DENIED')) {
        throw new ProductWorkbookPersistenceError('AUTH_READ_DENIED', error.message);
      }
      throw new ProductWorkbookPersistenceError('GET_SOURCE_DOCUMENT_FAILED', error.message);
    }

    if (!data) {
      return null;
    }

    return parseSourceDocument(normalizeSourceDocumentRow(data));
  }

  /**
   * Version-aware read for callers that intend to perform a subsequent CAS write.
   * The persistence version is intentionally returned outside SourceDocument.
   */
  public async getPersistedSourceDocument(id: string): Promise<PersistedSourceDocument | null> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    if (!id || trimString(id) === '') {
      throw new ProductWorkbookPersistenceError('INVALID_SOURCE_DOCUMENT_ID', 'ID do documento fonte é obrigatório.');
    }

    const { data, error } = await this.client.rpc('get_source_document_v1', {
      p_id: id
    });

    if (error) {
      if (error.code === '42501' || error.message.includes('AUTH_READ_DENIED')) {
        throw new ProductWorkbookPersistenceError('AUTH_READ_DENIED', error.message);
      }
      throw new ProductWorkbookPersistenceError('GET_SOURCE_DOCUMENT_FAILED', error.message);
    }

    if (!data) {
      return null;
    }

    const row = asRecord(data, 'GET_SOURCE_DOCUMENT_PROTOCOL_VIOLATION');
    const version = parsePersistenceVersion(row.version, 'GET_SOURCE_DOCUMENT_PROTOCOL_VIOLATION');

    return {
      document: parseSourceDocument(normalizeSourceDocumentRow(row)),
      version
    };
  }

  /**
   * Legacy unversioned V1 entry point. The CAS V2 rehearsal revokes EXECUTE on
   * upsert_source_document_v1 from authenticated, so this path fails closed after promotion.
   * New writes must use saveSourceDocument().
   */
  public async upsertSourceDocument(document: SourceDocument): Promise<SourceDocument> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    const validated = parseSourceDocument(document);

    const { data, error } = await this.client.rpc('upsert_source_document_v1', {
      p_document: validated
    });

    if (error) {
      if (error.code === '42501') {
        throw new ProductWorkbookPersistenceError(
          'LEGACY_SOURCE_DOCUMENT_WRITE_DISABLED',
          'upsert_source_document_v1 não possui mais EXECUTE para authenticated.'
        );
      }
      throw new ProductWorkbookPersistenceError('UPSERT_SOURCE_DOCUMENT_FAILED', error.message);
    }

    if (!data) {
      throw new ProductWorkbookPersistenceError('EMPTY_RESPONSE', 'RPC upsert_source_document_v1 retornou payload vazio.');
    }

    return parseSourceDocument(normalizeSourceDocumentRow(data));
  }

  /**
   * CAS V2 write. Exactly one RPC call is issued; conflicts are surfaced to the caller and
   * are never retried automatically.
   */
  public async saveSourceDocument(params: SaveSourceDocumentParams): Promise<SaveSourceDocumentResult> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    const { document, expectedVersion } = params;
    validateExpectedVersion(expectedVersion);

    if (document && typeof document === 'object' && Object.prototype.hasOwnProperty.call(document, 'version')) {
      throw new ProductWorkbookPersistenceError(
        'CLIENT_CONTROLLED_SOURCE_DOCUMENT_VERSION',
        'SourceDocument não pode conter o campo de persistência server-managed "version".'
      );
    }

    const validated = parseSourceDocument(document);

    const { data, error } = await this.client.rpc('upsert_source_document_v2', {
      p_document: validated,
      p_expected_version: expectedVersion
    });

    if (error) {
      if (error.code === '40001' || error.message.includes('SOURCE_DOCUMENT_CONFLICT')) {
        throw new SourceDocumentConflictError(
          error.message,
          validated.id,
          expectedVersion,
          parseActualVersionFromErrorDetails(error.details)
        );
      }

      if (error.code === '42501') {
        throw new SourceDocumentAuthorizationError(error.message);
      }

      throw new ProductWorkbookPersistenceError('SAVE_SOURCE_DOCUMENT_FAILED', error.message);
    }

    if (!data) {
      throw new ProductWorkbookPersistenceError(
        'SOURCE_DOCUMENT_PROTOCOL_VIOLATION',
        'RPC upsert_source_document_v2 retornou payload vazio.'
      );
    }

    return parseSourceDocumentCasResponse(data, validated.id, expectedVersion);
  }

  public async listSourceDocuments(ids?: string[]): Promise<SourceDocument[]> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    const { data, error } = await this.client.rpc('list_source_documents_v1', {
      p_ids: ids && ids.length > 0 ? ids : null
    });

    if (error) {
      if (error.code === '42501' || error.message.includes('AUTH_READ_DENIED')) {
        throw new ProductWorkbookPersistenceError('AUTH_READ_DENIED', error.message);
      }
      throw new ProductWorkbookPersistenceError('LIST_SOURCE_DOCUMENTS_FAILED', error.message);
    }

    if (!Array.isArray(data)) {
      return [];
    }

    const docs: SourceDocument[] = [];
    for (const item of data) {
      try {
        docs.push(parseSourceDocument(normalizeSourceDocumentRow(item)));
      } catch (parseErr) {
        console.warn(
          `[SupabaseProductSourceDocumentRepository] Documento fonte corrompido ignorado (id: ${item?.id}):`,
          parseErr
        );
      }
    }
    return docs;
  }
}

function trimString(val: string): string {
  return val.trim();
}

function validateExpectedVersion(expectedVersion: number): void {
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion > MAX_SAFE_PERSISTENCE_VERSION
  ) {
    throw new ProductWorkbookPersistenceError(
      'INVALID_SOURCE_DOCUMENT_EXPECTED_VERSION',
      `expectedVersion deve ser um inteiro seguro entre 0 e ${MAX_SAFE_PERSISTENCE_VERSION}.`
    );
  }

  if (expectedVersion === MAX_SAFE_PERSISTENCE_VERSION) {
    throw new ProductWorkbookPersistenceError(
      'SOURCE_DOCUMENT_VERSION_EXHAUSTED',
      'A versão máxima segura não pode ser incrementada.'
    );
  }
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProductWorkbookPersistenceError(code, 'Resposta do servidor deve ser um objeto JSON.');
  }
  return value as Record<string, unknown>;
}

function parsePersistenceVersion(value: unknown, code: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_SAFE_PERSISTENCE_VERSION
  ) {
    throw new ProductWorkbookPersistenceError(code, 'Versão de persistência retornada pelo servidor é inválida.');
  }
  return value;
}

function parseSourceDocumentCasResponse(
  data: unknown,
  requestedDocumentId: string,
  expectedVersion: number
): SaveSourceDocumentResult {
  const response = asRecord(data, 'SOURCE_DOCUMENT_PROTOCOL_VIOLATION');
  const sourceDocumentId = response.sourceDocumentId;

  if (typeof sourceDocumentId !== 'string' || sourceDocumentId.trim() === '') {
    throw new ProductWorkbookPersistenceError(
      'SOURCE_DOCUMENT_PROTOCOL_VIOLATION',
      'Resposta CAS não contém sourceDocumentId válido.'
    );
  }

  if (sourceDocumentId !== requestedDocumentId) {
    throw new ProductWorkbookPersistenceError(
      'SOURCE_DOCUMENT_PROTOCOL_VIOLATION',
      `sourceDocumentId retornado (${sourceDocumentId}) diverge do documento solicitado (${requestedDocumentId}).`
    );
  }

  const version = parsePersistenceVersion(response.version, 'SOURCE_DOCUMENT_PROTOCOL_VIOLATION');
  const expectedNextVersion = expectedVersion + 1;

  if (version !== expectedNextVersion) {
    throw new ProductWorkbookPersistenceError(
      'SOURCE_DOCUMENT_PROTOCOL_VIOLATION',
      `Versão retornada pelo servidor (${version}) viola o protocolo CAS (esperado: ${expectedNextVersion}).`
    );
  }

  const documentRow = asRecord(response.document, 'SOURCE_DOCUMENT_PROTOCOL_VIOLATION');
  const document = parseSourceDocument(normalizeSourceDocumentRow(documentRow));

  if (document.id !== sourceDocumentId) {
    throw new ProductWorkbookPersistenceError(
      'SOURCE_DOCUMENT_PROTOCOL_VIOLATION',
      'ID do documento retornado diverge do metadata CAS.'
    );
  }

  return {
    sourceDocumentId,
    document,
    version
  };
}

function parseActualVersionFromErrorDetails(details: unknown): number | null | undefined {
  let parsed: unknown = details;

  if (typeof details === 'string') {
    try {
      parsed = JSON.parse(details);
    } catch {
      return undefined;
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const value = (parsed as Record<string, unknown>).actualVersion;
  if (value === null) {
    return null;
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_SAFE_PERSISTENCE_VERSION
  ) {
    return value;
  }

  return undefined;
}

/**
 * Normaliza campos retornados do PostgreSQL (snake_case) para o formato do domínio (camelCase).
 * Converte explicitamente SQL NULLs para ausência de chave (undefined), garantindo round-trip
 * com o schema de domínio estrito. A coluna persistence `version` é deliberadamente descartada.
 */
export function normalizeSourceDocumentRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    id: row.id,
    title: row.title,
    documentType: row.document_type ?? row.documentType,
    metadata: (row.metadata !== null && typeof row.metadata === 'object') ? row.metadata : {}
  };

  const revision = row.revision;
  if (revision !== null && revision !== undefined) {
    normalized.revision = revision;
  }

  const language = row.language;
  if (language !== null && language !== undefined) {
    normalized.language = language;
  }

  const publicationDate = row.publication_date ?? row.publicationDate;
  if (publicationDate !== null && publicationDate !== undefined) {
    normalized.publicationDate = publicationDate;
  }

  const fileReference = row.file_reference ?? row.fileReference;
  if (fileReference !== null && fileReference !== undefined) {
    normalized.fileReference = fileReference;
  }

  const externalUrl = row.external_url ?? row.externalUrl;
  if (externalUrl !== null && externalUrl !== undefined) {
    normalized.externalUrl = externalUrl;
  }

  const checksum = row.checksum;
  if (checksum !== null && checksum !== undefined) {
    normalized.checksum = checksum;
  }

  return normalized;
}
