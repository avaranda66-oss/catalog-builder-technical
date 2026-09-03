// src/services/product-workbook/persistence.types.ts
// Tipagens para persistência do Product Workbook (PIM.W2A)
// Estritamente tipado. Zero explicit any.

import { ProductWorkbook, WorkbookOwner } from '../../domain/product-workbook';

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

export interface SaveWorkbookParams {
  readonly workbook: ProductWorkbook;
  readonly expectedRevision?: number | null;
}

export interface SaveWorkbookResult {
  readonly success: boolean;
  readonly workbook: ProductWorkbook;
  readonly revision: number;
}

export interface WorkbookConflictError extends Error {
  readonly code: 'WORKBOOK_CONFLICT';
  readonly expectedRevision: number;
  readonly actualRevision?: number;
}

export interface ProductWorkbookRepository {
  getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null>;
  saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult>;
}
