// src/services/product-workbook/product-workbook.repository.ts
// Repositório de persistência do Product Workbook (PIM.W2A)
// Estritamente tipado. Zero explicit any.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductWorkbook,
  WorkbookOwner,
  parseProductWorkbook,
  validateProductWorkbook
} from '../../domain/product-workbook';
import {
  ProductWorkbookRepository,
  SaveWorkbookParams,
  SaveWorkbookResult,
  WorkbookConflictError
} from './persistence.types';

export class SupabaseProductWorkbookRepository implements ProductWorkbookRepository {
  private readonly client: SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? null;
  }

  public async getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null> {
    if (!this.client) {
      throw new Error('Supabase client não inicializado.');
    }

    const { data, error } = await this.client.rpc('get_product_workbook_v1', {
      p_owner_kind: owner.kind,
      p_owner_id: owner.id
    });

    if (error) {
      throw new Error(`Erro ao recuperar workbook: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    // Deserialização e validação de invariantes
    return parseProductWorkbook(data);
  }

  public async saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult> {
    if (!this.client) {
      throw new Error('Supabase client não inicializado.');
    }

    const { workbook, expectedRevision } = params;

    // 1. Fail-closed: Valida invariantes do domínio antes de enviar à rede
    const validation = validateProductWorkbook(workbook);
    if (!validation.valid) {
      const errorDetails = validation.errors.map((e) => `[${e.code}] ${e.message}`).join(', ');
      throw new Error(`WORKBOOK_VALIDATION_FAILED: Invariantes do workbook violadas: ${errorDetails}`);
    }

    // 2. Chamada RPC com token de concorrência CAS
    const { data, error } = await this.client.rpc('save_product_workbook_v1', {
      p_workbook: workbook,
      p_expected_revision: expectedRevision ?? null
    });

    if (error) {
      // Detecção de conflito de concorrência CAS (SQLSTATE 40001)
      if (error.code === '40001' || error.message.includes('WORKBOOK_CONFLICT')) {
        const conflictErr: WorkbookConflictError = Object.assign(
          new Error(error.message),
          {
            code: 'WORKBOOK_CONFLICT' as const,
            expectedRevision: expectedRevision ?? workbook.revision
          }
        );
        throw conflictErr;
      }

      throw new Error(`Erro ao salvar workbook: ${error.message}`);
    }

    if (!data) {
      throw new Error('Erro inesperado: RPC save_product_workbook_v1 retornou nulo.');
    }

    const savedWorkbook = parseProductWorkbook(data);

    return {
      success: true,
      workbook: savedWorkbook,
      revision: savedWorkbook.revision
    };
  }
}
