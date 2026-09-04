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
export function mapTechnicalValueToTableLiteral(
  value: TechnicalValue,
  options?: { enableV2Literals?: boolean }
): TechnicalValueToTableLiteralResult {
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

    case 'asset_reference':
      return {
        supported: true,
        content: {
          kind: 'asset_reference',
          assetId: value.assetId,
          caption: value.label
        }
      };

    case 'boolean':
      if (options?.enableV2Literals) {
        return {
          supported: true,
          content: { kind: 'boolean', value: value.value, format: 'sim_nao' }
        };
      }
      return {
        supported: false,
        reason: 'Valores booleanos exigem tratamento de apresentação/tradução e não possuem projeção semântica tabular direta nesta fase.',
        unsupportedType: 'boolean'
      };

    case 'range':
      if (options?.enableV2Literals) {
        return {
          supported: true,
          content: {
            kind: 'range',
            lower: value.lower,
            upper: value.upper,
            unit: value.unit,
            lowerInclusive: value.lowerInclusive,
            upperInclusive: value.upperInclusive
          }
        };
      }
      return {
        supported: false,
        reason: 'Valores do tipo range exigem célula dimensional/composta estendida e não devem ser achatados em string silenciosamente.',
        unsupportedType: 'range'
      };

    case 'enum':
      if (options?.enableV2Literals) {
        return {
          supported: true,
          content: {
            kind: 'enum',
            code: value.code,
            label: value.label
          }
        };
      }
      return {
        supported: false,
        reason: `Valores do tipo enum (código: "${value.code}") não possuem projeção semântica tabular dedicada nesta fase e não devem perder código ou rótulo.`,
        unsupportedType: 'enum'
      };

    case 'technical_token':
      if (options?.enableV2Literals) {
        return {
          supported: true,
          content: {
            kind: 'technical_token',
            token: value.token,
            category: value.category
          }
        };
      }
      return {
        supported: false,
        reason: `Tokens técnicos (token: "${value.token}") não possuem célula semântica dedicada nesta fase e não devem ser projetados como badges genéricos.`,
        unsupportedType: 'technical_token'
      };

    case 'unknown':
      if (options?.enableV2Literals) {
        return {
          supported: true,
          content: {
            kind: 'unknown',
            reason: value.reason
          }
        };
      }
      return {
        supported: false,
        reason: value.reason
          ? `Dado técnico com valor desconhecido (unknown): ${value.reason}`
          : 'Dado técnico com valor desconhecido (unknown).',
        unsupportedType: 'unknown'
      };

    case 'product_reference':
      return {
        supported: false,
        reason: `Referência ao produto "${value.targetProductId}" não possui projeção literal direta sem política explícita de navegação/composição.`,
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

export function mapTechnicalValueToTableLiteralV2(value: TechnicalValue): TechnicalValueToTableLiteralResult {
  return mapTechnicalValueToTableLiteral(value, { enableV2Literals: true });
}

/**
 * Cria uma instância pura de TableDatumResolver para dados oriundos do Product Workbook.
 */
export function createProductWorkbookDatumResolver(
  lookup: ProductKnowledgeLookup,
  options?: { enableV2Literals?: boolean }
): TableDatumResolver {
  return (reference: TableCellBoundContent): TableDatumResolutionResult | undefined => {
    // Não processa namespaces legados (ex: legacy.product_field.*)
    if (reference.datumKey.startsWith('legacy.')) {
      return undefined;
    }

    // EMENDA 7 — SNAPSHOT OFFLINE FIRST:
    // MODO SNAPSHOT: Snapshot existente renderiza ANTES de qualquer lookup PIM.
    // PIM pode estar 100% offline.
    if (reference.bindingMode === 'snapshot') {
      const knowledge = typeof lookup === 'function' ? lookup(reference.productId) : lookup.get(reference.productId);
      const effectiveDatum = knowledge?.effectiveData?.get(reference.datumKey);
      const mappedStatus = effectiveDatum ? mapEffectiveStatusToTableStatus(effectiveDatum.effectiveStatus) : 'approved';
      return {
        value: reference.snapshot,
        status: mappedStatus,
        diagnostic: {
          message: knowledge ? undefined : 'Snapshot congelado renderizado offline (PIM indisponível).',
          productRevision: knowledge?.productRevision,
          familyRevision: knowledge?.familyRevision
        }
      };
    }

    // MODO REVIEW_REQUIRED: Se possuir snapshot, renderiza snapshot e marca diagnóstico
    if (reference.bindingMode === 'review_required') {
      const knowledge = typeof lookup === 'function' ? lookup(reference.productId) : lookup.get(reference.productId);
      const effectiveDatum = knowledge?.effectiveData?.get(reference.datumKey);
      const mappedStatus = effectiveDatum ? mapEffectiveStatusToTableStatus(effectiveDatum.effectiveStatus) : 'unknown';

      if (reference.snapshot) {
        return {
          value: reference.snapshot,
          status: mappedStatus,
          diagnostic: {
            message: 'Publicação requer revisão de alteração de dados.',
            productRevision: knowledge?.productRevision,
            familyRevision: knowledge?.familyRevision
          }
        };
      }
      return {
        value: { kind: 'empty' },
        status: mappedStatus,
        diagnostic: {
          message: 'Célula em modo review_required sem snapshot prévio; valor não materializado silenciosamente.',
          productRevision: knowledge?.productRevision,
          familyRevision: knowledge?.familyRevision
        }
      };
    }

    // MODO LIVE: Lookup PIM
    const knowledge = typeof lookup === 'function' ? lookup(reference.productId) : lookup.get(reference.productId);
    if (!knowledge) {
      if (reference.snapshot) {
        return {
          value: reference.snapshot,
          status: 'unknown',
          diagnostic: {
            message: `Fonte indisponível para produto "${reference.productId}"; utilizando snapshot como fallback stale.`
          }
        };
      }
      return {
        value: { kind: 'empty' },
        status: 'unknown',
        diagnostic: { message: `Conhecimento do produto com ID "${reference.productId}" não encontrado no lookup.` }
      };
    }

    const effectiveDatum = knowledge.effectiveData.get(reference.datumKey);
    if (!effectiveDatum) {
      if (reference.snapshot) {
        return {
          value: reference.snapshot,
          status: 'unknown',
          diagnostic: {
            message: `Chave semântica "${reference.datumKey}" não encontrada; utilizando snapshot como fallback.`,
            productRevision: knowledge.productRevision,
            familyRevision: knowledge.familyRevision
          }
        };
      }
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

    // Mapeia o valor técnico atual de forma conservadora e lossless
    const literalRes = mapTechnicalValueToTableLiteral(effectiveDatum.datum.value, options);
    if (!literalRes.supported) {
      if (reference.snapshot) {
        return {
          value: reference.snapshot,
          status: mappedStatus,
          diagnostic: {
            message: `${literalRes.reason} (usando snapshot como fallback).`,
            unsupportedType: literalRes.unsupportedType,
            productRevision: knowledge.productRevision,
            familyRevision: knowledge.familyRevision
          }
        };
      }
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
