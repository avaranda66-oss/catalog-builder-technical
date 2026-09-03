// src/domain/compliance-coverage.ts
// Classificação pura de conformidade factual e compatibilidade de blocos table-like contra a Biblioteca Oficial.
// Fase CORE.H2 — Confiabilidade do Editor e Veracidade de Conformidade.

import { BlockType, ContentBlock } from './catalog.schema';

export type TableLikeBlockType =
  | 'table'
  | 'specs_table'
  | 'electrical_table'
  | 'accessories_table'
  | 'custom_table'
  | 'matrix_spec_table'
  | 'ordering_codes'
  | 'inserts_visual';

export const TABLE_LIKE_BLOCK_TYPES: readonly TableLikeBlockType[] = [
  'table',
  'specs_table',
  'electrical_table',
  'accessories_table',
  'custom_table',
  'matrix_spec_table',
  'ordering_codes',
  'inserts_visual'
] as const;

export function isTableLikeBlock(blockType: string): blockType is TableLikeBlockType {
  return (TABLE_LIKE_BLOCK_TYPES as readonly string[]).includes(blockType);
}

export type TableComplianceSupportTier =
  | 'SUPPORTED_CANONICAL_ROWS'   // Possui tableRows estruturadas e comparáveis com a Biblioteca Oficial
  | 'UNSUPPORTED_SPECIALIZED'    // Possui modelo tabular/visual proprietário sem vínculo de produto individual
  | 'UNSUPPORTED_CUSTOM_SHAPE'   // custom_table com formato livre (customData.rows/headers sem productRefId)
  | 'NOT_APPLICABLE';            // Bloco não tabular

export interface BlockComplianceEvaluation {
  blockId: string;
  blockType: BlockType;
  tier: TableComplianceSupportTier;
  isSupported: boolean;
  auditableRowsCount: number;
  reason?: string;
}

/**
 * Avalia se um bloco possui estrutura elegível para conferência factual contra a biblioteca de produtos.
 */
export function evaluateBlockComplianceCapability(block: ContentBlock): BlockComplianceEvaluation {
  if (!isTableLikeBlock(block.type)) {
    return {
      blockId: block.id,
      blockType: block.type,
      tier: 'NOT_APPLICABLE',
      isSupported: false,
      auditableRowsCount: 0
    };
  }

  // 1. Tabelas com modelo canônico de produto (tableRows estruturadas comparáveis contra biblioteca)
  if (
    block.type === 'table' ||
    block.type === 'specs_table' ||
    block.type === 'electrical_table' ||
    block.type === 'accessories_table'
  ) {
    const rows = block.tableRows || [];
    return {
      blockId: block.id,
      blockType: block.type,
      tier: 'SUPPORTED_CANONICAL_ROWS',
      isSupported: true,
      auditableRowsCount: rows.length
    };
  }

  // 2. custom_table: Modo Dual
  if (block.type === 'custom_table') {
    // Se possui tableRows canônicos com pelo menos uma referência ou estrutura comparável
    const hasCanonicalProductRows =
      Array.isArray(block.tableRows) &&
      block.tableRows.length > 0 &&
      block.tableRows.some((r) => Boolean(r.productRefId));

    if (hasCanonicalProductRows) {
      return {
        blockId: block.id,
        blockType: block.type,
        tier: 'SUPPORTED_CANONICAL_ROWS',
        isSupported: true,
        auditableRowsCount: block.tableRows!.length
      };
    }

    // Se é formato customData livre ou sem productRefId
    return {
      blockId: block.id,
      blockType: block.type,
      tier: 'UNSUPPORTED_CUSTOM_SHAPE',
      isSupported: false,
      auditableRowsCount: 0,
      reason: 'Tabela customizada em formato livre sem identificador de produto da Biblioteca Oficial.'
    };
  }

  // 3. Tabelas especializadas com modelos de dados proprietários (matrix, ordering, inserts)
  return {
    blockId: block.id,
    blockType: block.type,
    tier: 'UNSUPPORTED_SPECIALIZED',
    isSupported: false,
    auditableRowsCount: 0,
    reason: `Estrutura "${block.type}" utiliza formato proprietário sem vínculo individual de linhas a produtos oficiais.`
  };
}
