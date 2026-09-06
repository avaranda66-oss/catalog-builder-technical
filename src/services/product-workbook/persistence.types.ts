// src/services/product-workbook/persistence.types.ts
// Tipagens e contratos de persistência do Product Workbook (PIM.W2B)
// Estritamente tipado. Zero explicit any.

import {
  ProductWorkbook,
  WorkbookOwner,
  SourceDocument
} from '../../domain/product-workbook';

export const MAX_SAFE_PERSISTENCE_VERSION = 9_007_199_254_740_991;

export interface ProductWorkbookRow {
  readonly id: string;
  readonly owner_kind: 'product' | 'family';
  readonly owner_id: string;
  readonly revision: number;
  readonly full_payload: ProductWorkbook;
  readonly created_by?: string | null;
  readonly updated_by?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProductSourceDocumentRow {
  readonly id: string;
  readonly title: string;
  readonly document_type: string;
  /** Editorial revision from the canonical SourceDocument domain. */
  readonly revision?: string | null;
  /** Server-managed persistence CAS version. Never part of SourceDocument. */
  readonly version: number;
  readonly language?: string | null;
  readonly publication_date?: string | null;
  readonly file_reference?: string | null;
  readonly external_url?: string | null;
  readonly checksum?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly created_by?: string | null;
  readonly updated_by?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProductTechnicalDataIndexRow {
  readonly id: string;
  readonly workbook_id: string;
  readonly datum_id: string;
  readonly semantic_key: string;
  readonly module_id: string;
  readonly label: string;
  readonly value_type: string;
  readonly raw_value: Record<string, unknown>;
  readonly text_value?: string | null;
  readonly numeric_value?: number | null;
  readonly boolean_value?: boolean | null;
  readonly lower_value?: number | null;
  readonly upper_value?: number | null;
  readonly unit?: string | null;
  readonly enum_code?: string | null;
  readonly technical_token?: string | null;
  readonly asset_id?: string | null;
  readonly target_product_id?: string | null;
  readonly unknown_reason?: string | null;
  readonly status: string;
  readonly updated_at: string;
}

/**
 * Parâmetros de salvamento de Workbook.
 * expectedRevision é estritamente OBRIGATÓRIO para garantir CAS inviolável.
 */
export interface SaveWorkbookParams {
  readonly workbook: ProductWorkbook;
  readonly expectedRevision: number;
  readonly actorRef?: string;
}

export interface SaveWorkbookResult {
  readonly success: boolean;
  readonly workbook: ProductWorkbook;
  readonly revision: number;
}

/**
 * Erro canônico de concorrência CAS (SQLSTATE 40001).
 */
export class WorkbookConflictError extends Error {
  public readonly code = 'WORKBOOK_CONFLICT' as const;
  public readonly expectedRevision: number;
  public readonly actualRevision?: number;
  public readonly ownerIdentity?: string;

  constructor(
    message: string,
    expectedRevision: number,
    actualRevision?: number,
    ownerIdentity?: string
  ) {
    super(message);
    this.name = 'WorkbookConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
    this.ownerIdentity = ownerIdentity;
  }
}

/**
 * Erro de persistência geral do Product Workbook (validação, protocolo, corrupção).
 */
export class ProductWorkbookPersistenceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[ProductWorkbookPersistence:${code}] ${message}`);
    this.name = 'ProductWorkbookPersistenceError';
  }
}

/**
 * Wrapper de persistência para SourceDocument. A versão CAS permanece fora do domínio canônico.
 */
export interface PersistedSourceDocument {
  readonly document: SourceDocument;
  readonly version: number;
}

export interface SaveSourceDocumentParams {
  readonly document: SourceDocument;
  readonly expectedVersion: number;
}

export interface SaveSourceDocumentResult extends PersistedSourceDocument {
  readonly sourceDocumentId: string;
}

/** SQLSTATE 40001 / SOURCE_DOCUMENT_CONFLICT. */
export class SourceDocumentConflictError extends Error {
  public readonly code = 'SOURCE_DOCUMENT_CONFLICT' as const;

  constructor(
    message: string,
    public readonly sourceDocumentId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number | null
  ) {
    super(message);
    this.name = 'SourceDocumentConflictError';
  }
}

/** SQLSTATE 42501 from the server-side editor authorization gate. */
export class SourceDocumentAuthorizationError extends Error {
  public readonly code = '42501' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SourceDocumentAuthorizationError';
  }
}

export interface ProductWorkbookRepository {
  getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null>;
  saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult>;
}

export interface ProductSourceDocumentRepository {
  getSourceDocument(id: string): Promise<SourceDocument | null>;
  getPersistedSourceDocument(id: string): Promise<PersistedSourceDocument | null>;
  /**
   * Legacy V1 entry point retained only for source compatibility. Its database EXECUTE grant
   * is revoked by the CAS V2 rehearsal, so it cannot remain an authenticated write bypass.
   */
  upsertSourceDocument(document: SourceDocument): Promise<SourceDocument>;
  saveSourceDocument(params: SaveSourceDocumentParams): Promise<SaveSourceDocumentResult>;
  listSourceDocuments(ids?: string[]): Promise<SourceDocument[]>;
}
