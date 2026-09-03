// src/domain/table-core/table.serialization.ts
// Fronteira Segura de Desserialização e Parsing do Table Core V2.
// Valida dados não-confiáveis vindos de JSON, storage ou IA sem lançar exceções não tratadas.
// Zero explicit any.

import { TableCoreModel } from './table.types';
import { TableCoreModelSchema } from './table.schema';
import { validateTableModel } from './table.validator';

export type ParseTableResult =
  | {
      success: true;
      data: TableCoreModel;
      warnings: string[];
    }
  | {
      success: false;
      errorCode: 'UNSUPPORTED_SCHEMA_VERSION' | 'INVALID_SCHEMA_SHAPE' | 'DOMAIN_INVARIANT_VIOLATION';
      error: string;
    };

/**
 * Valida e desserializa uma estrutura desconhecida em um TableCoreModel garantido.
 */
export function parseTableCoreModel(input: unknown): ParseTableResult {
  if (typeof input !== 'object' || input === null) {
    return {
      success: false,
      errorCode: 'INVALID_SCHEMA_SHAPE',
      error: 'Entrada de tabela deve ser um objeto JSON não-nulo.'
    };
  }

  const rawObj = input as Record<string, unknown>;

  // Checagem explícita de versão do schema
  if (rawObj.schemaVersion !== 1) {
    return {
      success: false,
      errorCode: 'UNSUPPORTED_SCHEMA_VERSION',
      error: `Versão de schema de tabela não suportada: "${String(rawObj.schemaVersion)}". Esperado: 1.`
    };
  }

  // Parse com Zod estrito
  const zodRes = TableCoreModelSchema.safeParse(input);
  if (!zodRes.success) {
    return {
      success: false,
      errorCode: 'INVALID_SCHEMA_SHAPE',
      error: `Falha na validação de schema: ${zodRes.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')}`
    };
  }

  // Validação de invariantes de domínio
  const table = zodRes.data;
  const domainValidation = validateTableModel(table);
  if (!domainValidation.valid) {
    return {
      success: false,
      errorCode: 'DOMAIN_INVARIANT_VIOLATION',
      error: `Violação de invariantes de domínio: ${domainValidation.errors.join('; ')}`
    };
  }

  return {
    success: true,
    data: table,
    warnings: domainValidation.warnings
  };
}
