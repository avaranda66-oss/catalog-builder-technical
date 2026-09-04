// src/services/product-workbook/source-document.repository.ts
// Repositório de persistência de Source Documents (PIM.W2B)
// Estritamente tipado. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SourceDocument,
  parseSourceDocument
} from '../../domain/product-workbook';
import {
  ProductSourceDocumentRepository,
  ProductWorkbookPersistenceError
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

  public async upsertSourceDocument(document: SourceDocument): Promise<SourceDocument> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    // Validação pré-rede com o schema canônico de domínio
    const validated = parseSourceDocument(document);

    const { data, error } = await this.client.rpc('upsert_source_document_v1', {
      p_document: validated
    });

    if (error) {
      throw new ProductWorkbookPersistenceError('UPSERT_SOURCE_DOCUMENT_FAILED', error.message);
    }

    if (!data) {
      throw new ProductWorkbookPersistenceError('EMPTY_RESPONSE', 'RPC upsert_source_document_v1 retornou payload vazio.');
    }

    return parseSourceDocument(normalizeSourceDocumentRow(data));
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

/**
 * Normaliza campos retornados do PostgreSQL (snake_case) para o formato do domínio (camelCase).
 * Converte explicitamente SQL NULLs para ausência de chave (undefined), garantindo round-trip
 * com o schema de domínio estrito (PIM.W2C.2).
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
