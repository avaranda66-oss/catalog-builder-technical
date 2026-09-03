// src/services/product-workbook/persistence.types.ts
// Tipagens e contratos de persistência do Product Workbook (PIM.W2B)
// Estritamente tipado. Zero explicit any.

import {
  ProductWorkbook,
  WorkbookOwner,
  SourceDocument
} from '../../domain/product-workbook';

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
  readonly revision?: string | null;
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

export interface ProductWorkbookRepository {
  getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null>;
  saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult>;
}

export interface ProductSourceDocumentRepository {
  getSourceDocument(id: string): Promise<SourceDocument | null>;
  upsertSourceDocument(document: SourceDocument): Promise<SourceDocument>;
  listSourceDocuments(ids?: string[]): Promise<SourceDocument[]>;
}
