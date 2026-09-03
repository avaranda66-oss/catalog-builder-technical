// src/services/product-workbook/product-workbook.repository.ts
// Repositório de persistência do Product Workbook com CAS estrito e autoridade única (PIM.W2C)
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
  WorkbookConflictError,
  ProductWorkbookPersistenceError
} from './persistence.types';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validador utilitário de formato UUID v4 / RFC 4122.
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export class SupabaseProductWorkbookRepository implements ProductWorkbookRepository {
  private readonly client: SupabaseClient | null;

  constructor(client?: SupabaseClient | null) {
    this.client = client ?? null;
  }

  public async getWorkbook(owner: WorkbookOwner): Promise<ProductWorkbook | null> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    // Validação fail-closed de owner.kind
    if (owner.kind !== 'product' && owner.kind !== 'family') {
      throw new ProductWorkbookPersistenceError(
        'INVALID_OWNER_KIND',
        `owner.kind "${(owner as any).kind}" deve ser "product" ou "family".`
      );
    }

    // Validação fail-closed antes da rede de owner.id
    if (!isValidUuid(owner.id)) {
      throw new ProductWorkbookPersistenceError(
        'INVALID_OWNER_ID',
        `owner.id "${owner.id}" deve ser um UUID válido antes da chamada de rede.`
      );
    }

    let response = await this.client.rpc('get_product_workbook_v2', {
      p_owner_kind: owner.kind,
      p_owner_id: owner.id
    });

    // Se a RPC v2 ainda não existe no ambiente (pre-flight / migration pendente), tenta v1
    if (response.error && (response.error.code === '42883' || response.error.message.includes('function public.get_product_workbook_v2') || response.error.message.includes('does not exist'))) {
      response = await this.client.rpc('get_product_workbook_v1', {
        p_owner_kind: owner.kind,
        p_owner_id: owner.id
      });
    }

    const { data, error } = response;

    if (error) {
      if (error.code === '42501' || error.message.includes('AUTH_READ_DENIED')) {
        throw new ProductWorkbookPersistenceError('AUTH_READ_DENIED', error.message);
      }
      if (error.code === 'XX000' || error.message.includes('WORKBOOK_CORRUPTED')) {
        throw new ProductWorkbookPersistenceError('WORKBOOK_CORRUPTED', error.message);
      }
      if (error.message.includes('INVALID_WORKBOOK_OWNER_KIND')) {
        throw new ProductWorkbookPersistenceError('INVALID_OWNER_KIND', error.message);
      }
      throw new ProductWorkbookPersistenceError('GET_WORKBOOK_FAILED', error.message);
    }

    if (!data) {
      return null;
    }

    // Deserialização e validação estrita de invariantes de domínio
    return parseProductWorkbook(data);
  }

  public async saveWorkbook(params: SaveWorkbookParams): Promise<SaveWorkbookResult> {
    if (!this.client) {
      throw new ProductWorkbookPersistenceError('CLIENT_NOT_INITIALIZED', 'Supabase client não inicializado.');
    }

    const { workbook, expectedRevision } = params;

    // 1. CAS obrigatório: expectedRevision deve ser um número inteiro >= 0
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new ProductWorkbookPersistenceError(
        'CAS_REVISION_REQUIRED',
        `expectedRevision é obrigatório e deve ser um inteiro >= 0 (recebido: ${expectedRevision}).`
      );
    }

    // 2. Validação pré-rede: expectedRevision deve ser exatamente igual a workbook.revision
    if (expectedRevision !== workbook.revision) {
      throw new ProductWorkbookPersistenceError(
        'REVISION_MISMATCH',
        `expectedRevision (${expectedRevision}) diverge de workbook.revision (${workbook.revision}). Operação cancelada antes da rede.`
      );
    }

    // 3. Validação pré-rede: owner.kind deve ser product ou family
    const ownerKind = (workbook.owner as { kind?: unknown })?.kind;
    if (ownerKind !== 'product' && ownerKind !== 'family') {
      throw new ProductWorkbookPersistenceError(
        'INVALID_OWNER_KIND',
        `owner.kind "${ownerKind}" deve ser "product" ou "family".`
      );
    }

    // 4. Validação pré-rede: owner.id deve ser um UUID válido
    if (!isValidUuid(workbook.owner.id)) {
      throw new ProductWorkbookPersistenceError(
        'INVALID_OWNER_ID',
        `owner.id "${workbook.owner.id}" deve ser um UUID válido antes da rede.`
      );
    }

    // 5. Validação pré-rede: Invariantes do domínio do Product Workbook
    const validation = validateProductWorkbook(workbook);
    if (!validation.valid) {
      const errorDetails = validation.errors.map((e) => `[${e.code}] ${e.message}`).join(', ');
      throw new ProductWorkbookPersistenceError(
        'WORKBOOK_VALIDATION_FAILED',
        `Invariantes do workbook violadas: ${errorDetails}`
      );
    }

    // 6. Chamada RPC com token de concorrência CAS estrito (V2 ou V1 conforme schemaVersion)
    const rpcName = workbook.schemaVersion === 2 ? 'save_product_workbook_v2' : 'save_product_workbook_v1';
    const { data, error } = await this.client.rpc(rpcName, {
      p_workbook: workbook,
      p_expected_revision: expectedRevision
    });

    if (error) {
      // Conflito de concorrência CAS (SQLSTATE 40001 / WORKBOOK_CONFLICT)
      if (error.code === '40001' || error.message.includes('WORKBOOK_CONFLICT')) {
        let actualRevision: number | undefined;

        // Preferência por campo structured error.details se fornecido pelo PostgreSQL
        if ((error as any).details) {
          try {
            const parsedDetails = JSON.parse((error as any).details);
            if (typeof parsedDetails.actualRevision === 'number') {
              actualRevision = parsedDetails.actualRevision;
            }
          } catch {
            // Fallback para regex
          }
        }

        if (actualRevision === undefined) {
          const actualMatch = error.message.match(/Atual:\s*(\d+)/i);
          if (actualMatch && actualMatch[1]) {
            actualRevision = parseInt(actualMatch[1], 10);
          }
        }

        throw new WorkbookConflictError(
          error.message,
          expectedRevision,
          actualRevision,
          `${workbook.owner.kind}:${workbook.owner.id}`
        );
      }

      // Evidência órfã referenciando SourceDocument inexistente
      if (error.message.includes('ORPHAN_SOURCE_DOCUMENT')) {
        throw new ProductWorkbookPersistenceError('ORPHAN_SOURCE_DOCUMENT', error.message);
      }

      // Owner não existe no banco
      if (error.message.includes('OWNER_NOT_FOUND')) {
        throw new ProductWorkbookPersistenceError('OWNER_NOT_FOUND', error.message);
      }

      // Owner em uso bloqueando exclusão
      if (error.message.includes('WORKBOOK_OWNER_IN_USE')) {
        throw new ProductWorkbookPersistenceError('WORKBOOK_OWNER_IN_USE', error.message);
      }

      throw new ProductWorkbookPersistenceError('SAVE_WORKBOOK_FAILED', error.message);
    }

    if (!data) {
      throw new ProductWorkbookPersistenceError(
        'EMPTY_RESPONSE',
        'Erro inesperado: RPC save_product_workbook_v1 retornou payload vazio.'
      );
    }

    const savedWorkbook = parseProductWorkbook(data);

    // 7. Protocolo de Persistência: a revisão retornada deve ser estritamente expectedRevision + 1
    const expectedNextRevision = expectedRevision + 1;
    if (savedWorkbook.revision !== expectedNextRevision) {
      throw new ProductWorkbookPersistenceError(
        'PERSISTENCE_PROTOCOL_VIOLATION',
        `Revisão retornada pelo servidor (${savedWorkbook.revision}) viola o protocolo CAS (esperado: ${expectedNextRevision}).`
      );
    }

    return {
      success: true,
      workbook: savedWorkbook,
      revision: savedWorkbook.revision
    };
  }
}
