// src/domain/table-binding/product-workbook-datum.resolver.ts
// Adapter puro de resolução de dados entre Table Core e Product Workbook (Fase BIND.B1).
// Conecta referências semânticas (datum_reference) aos fatos técnicos canônicos (ResolvedProductKnowledge).
// Zero dependências de React, Zustand ou Supabase.
// Zero acoplamento específico de produtos (sem if TA-50N, etc).

import { TableCellBoundContent, TableCellLiteralContent } from '../table-core/table.types';
import { ResolvedProductKnowledge, TechnicalValue, EffectiveDatumStatus } from '../product-workbook/types';
import { TableDatumResolver, TableDatumResolutionResult, TableDatumStatus } from './table-datum.types';

export type ProductKnowledgeLookup =
  | ((productId: string) => ResolvedProductKnowledge | undefined | null)
  | Map<string, ResolvedProductKnowledge>
  | ReadonlyMap<string, ResolvedProductKnowledge>;

/**
 * Mapeia conservadoramente o status do EffectiveDatum do PIM para o TableDatumStatus.
 * Garante que dados em conflito nunca sejam marcados como aprovados.
 */
export function mapEffectiveStatusToTableStatus(status: EffectiveDatumStatus): TableDatumStatus {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'draft':
      return 'draft';
    case 'conflicting':
      return 'conflict';
    default:
      return 'unknown';
  }
}

export type TechnicalValueToTableLiteralResult =
  | { readonly supported: true; readonly content: TableCellLiteralContent }
  | { readonly supported: false; readonly reason: string; readonly unsupportedType: string };

/**
 * Converte um TechnicalValue do Product Workbook em um TableCellLiteralContent de forma segura e com tipagem estrita.
 * INVARIANTE: Proibido achatar estruturas compostas/dimensionais (ex.: range, product_reference) em strings genéricas.
 */
export function mapTechnicalValueToTableLiteral(value: TechnicalValue): TechnicalValueToTableLiteralResult {
  switch (value.type) {
    case 'text':
      return {
        supported: true,
        content: { kind: 'text', text: value.value }
      };

    case 'number':
      return {
        supported: true,
        content: { kind: 'number', value: value.value }
      };

    case 'quantity':
      return {
        supported: true,
        content: {
          kind: 'value_unit',
          amount: value.amount,
          unit: value.unit,
          qualifier: value.qualifier
        }
      };

    case 'boolean':
      return {
        supported: true,
        content: {
          kind: 'badge',
          label: value.value ? 'Sim' : 'Não',
          variant: value.value ? 'success' : 'neutral'
        }
      };

    case 'enum':
      return {
        supported: true,
        content: {
          kind: 'text',
          text: value.label ?? value.code
        }
      };

    case 'technical_token':
      return {
        supported: true,
        content: {
          kind: 'badge',
          label: value.token,
          variant: 'neutral'
        }
      };

    case 'asset_reference':
      return {
        supported: true,
        content: {
          kind: 'asset_reference',
          assetId: value.assetId
        }
      };

    case 'unknown':
      return {
        supported: true,
        content: { kind: 'empty' }
      };

    case 'range':
      return {
        supported: false,
        reason: 'Valores do tipo range exigem célula dimensional/composta estendida e não devem ser achatados em string silenciosamente.',
        unsupportedType: 'range'
      };

    case 'product_reference':
      return {
        supported: false,
        reason: 'Referência a outro produto não possui projeção literal direta sem política explícita de exibição.',
        unsupportedType: 'product_reference'
      };

    default:
      return {
        supported: false,
        reason: `Tipo de valor técnico "${(value as { type: string }).type}" não suportado para representação tabular direta.`,
        unsupportedType: (value as { type: string }).type
      };
  }
}

/**
 * Cria uma instância pura de TableDatumResolver para dados oriundos do Product Workbook.
 */
export function createProductWorkbookDatumResolver(
  lookup: ProductKnowledgeLookup
): TableDatumResolver {
  return (reference: TableCellBoundContent): TableDatumResolutionResult | undefined => {
    // Não processa namespaces legados (ex: legacy.product_field.*)
    if (reference.datumKey.startsWith('legacy.')) {
      return undefined;
    }

    const knowledge = typeof lookup === 'function' ? lookup(reference.productId) : lookup.get(reference.productId);
    if (!knowledge) {
      return {
        value: { kind: 'empty' },
        status: 'unknown',
        diagnostic: { message: `Conhecimento do produto com ID "${reference.productId}" não encontrado no lookup.` }
      };
    }

    const effectiveDatum = knowledge.effectiveData.get(reference.datumKey);
    if (!effectiveDatum) {
      return {
        value: { kind: 'empty' },
        status: 'unknown',
        diagnostic: {
          message: `Chave semântica "${reference.datumKey}" não encontrada no conhecimento efetivo do produto.`,
          productRevision: knowledge.productRevision,
          familyRevision: knowledge.familyRevision
        }
      };
    }

    const mappedStatus = mapEffectiveStatusToTableStatus(effectiveDatum.effectiveStatus);

    // MODO SNAPSHOT: Preserva estritamente o snapshot persistido; o resolver NÃO o substitui
    if (reference.bindingMode === 'snapshot') {
      return {
        value: reference.snapshot,
        status: mappedStatus,
        diagnostic: {
          productRevision: knowledge.productRevision,
          familyRevision: knowledge.familyRevision
        }
      };
    }

    // MODO REVIEW_REQUIRED: Preserva o snapshot existente e sinaliza necessidade de revisão
    if (reference.bindingMode === 'review_required' && reference.snapshot) {
      return {
        value: reference.snapshot,
        status: mappedStatus,
        diagnostic: {
          message: 'Publicação requer revisão de alteração de dados.',
          productRevision: knowledge.productRevision,
          familyRevision: knowledge.familyRevision
        }
      };
    }

    // MODO LIVE (ou review_required sem snapshot prévio): Mapeia o valor técnico atual
    const literalRes = mapTechnicalValueToTableLiteral(effectiveDatum.datum.value);
    if (!literalRes.supported) {
      return {
        value: { kind: 'empty' },
        status: mappedStatus,
        diagnostic: {
          message: literalRes.reason,
          unsupportedType: literalRes.unsupportedType,
          productRevision: knowledge.productRevision,
          familyRevision: knowledge.familyRevision
        }
      };
    }

    return {
      value: literalRes.content,
      status: mappedStatus,
      diagnostic: {
        productRevision: knowledge.productRevision,
        familyRevision: knowledge.familyRevision
      }
    };
  };
}

/**
 * Compõe múltiplos TableDatumResolvers em ordem sequencial (chain of responsibility).
 * Permite que um resolver legado e um resolver do Product Workbook coexistam harmoniosamente.
 */
export function composeTableDatumResolvers(
  ...resolvers: (TableDatumResolver | undefined)[]
): TableDatumResolver {
  const activeResolvers = resolvers.filter((r): r is TableDatumResolver => typeof r === 'function');
  return (reference: TableCellBoundContent): TableDatumResolutionResult | undefined => {
    for (const resolver of activeResolvers) {
      const result = resolver(reference);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  };
}
