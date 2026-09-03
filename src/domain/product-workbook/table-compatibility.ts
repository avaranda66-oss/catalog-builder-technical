// src/domain/product-workbook/table-compatibility.ts
// Compatibility adapter between Product Workbook knowledge facts and Table Core cells (PIM.W1 / Part Y).
// Maps typed technical values to safe literal table cells with fail-closed behavior.
// Zero dependencies on Table Core internals or UI.
// Zero explicit any.

import { TechnicalValue, ResolvedProductKnowledge, EffectiveDatum } from './types';

/**
 * Compatible Table Core literal cell representations.
 */
export type CompatibleTableLiteral =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'value_unit'; readonly amount: number; readonly unit: string; readonly qualifier?: string }
  | { readonly kind: 'badge'; readonly text: string; readonly variant?: 'neutral' | 'success' | 'warning' | 'critical' }
  | { readonly kind: 'asset_reference'; readonly assetId: string }
  | { readonly kind: 'empty' };

/**
 * Result of mapping a TechnicalValue to a Table Core literal cell.
 */
export type ValueMappingResult =
  | { readonly supported: true; readonly content: CompatibleTableLiteral }
  | { readonly supported: false; readonly reason: string };

/**
 * Safely maps a typed TechnicalValue to a Table Core cell literal.
 * Invariant: Unsupported compound types like 'range' fail closed rather than silently stringifying.
 */
export function mapTechnicalValueToTableLiteral(value: TechnicalValue): ValueMappingResult {
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
          text: value.value ? 'Sim' : 'Não',
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
          text: value.token,
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
        reason: 'Valores do tipo range requerem célula dimensional/composta estendida e não podem ser convertidos para primitivos simples silenciosamente.'
      };

    case 'product_reference':
      return {
        supported: false,
        reason: 'Referência a outro produto não possui projeção literal direta sem política explícita de exibição.'
      };

    default:
      return {
        supported: false,
        reason: 'Tipo de valor técnico não suportado para renderização tabular direta.'
      };
  }
}

/**
 * Result of resolving a Table Core datum_reference binding.
 */
export type DatumReferenceResolutionResult =
  | {
      readonly resolved: true;
      readonly effectiveDatum: EffectiveDatum;
      readonly literalContent: CompatibleTableLiteral;
      readonly isSnapshotApproved: boolean;
    }
  | {
      readonly resolved: false;
      readonly reason: 'datum_not_found' | 'mapping_unsupported' | 'unapproved_snapshot';
      readonly message: string;
    };

/**
 * Resolves a Table Core datum_reference against effective product knowledge.
 */
export function resolveDatumReferenceForTable(params: {
  datumKey: string;
  bindingMode: 'live' | 'snapshot';
  effectiveKnowledge: ResolvedProductKnowledge;
}): DatumReferenceResolutionResult {
  const { datumKey, bindingMode, effectiveKnowledge } = params;

  const effectiveDatum = effectiveKnowledge.effectiveData.get(datumKey);
  if (!effectiveDatum) {
    return {
      resolved: false,
      reason: 'datum_not_found',
      message: `Dado com chave semântica "${datumKey}" não encontrado no conhecimento efetivo do produto.`
    };
  }

  // Se o modo for snapshot e o dado estiver em draft ou conflito
  if (bindingMode === 'snapshot' && effectiveDatum.effectiveStatus !== 'approved') {
    return {
      resolved: false,
      reason: 'unapproved_snapshot',
      message: `Modo snapshot exige dado aprovado. Status atual: "${effectiveDatum.effectiveStatus}".`
    };
  }

  const mapping = mapTechnicalValueToTableLiteral(effectiveDatum.datum.value);
  if (!mapping.supported) {
    return {
      resolved: false,
      reason: 'mapping_unsupported',
      message: mapping.reason
    };
  }

  return {
    resolved: true,
    effectiveDatum,
    literalContent: mapping.content,
    isSnapshotApproved: effectiveDatum.effectiveStatus === 'approved'
  };
}
