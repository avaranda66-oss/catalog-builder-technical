// src/domain/table-binding/legacy-product-field.resolver.ts
// Resolver puro compartilhado para campos legados de produto (legacy.product_field.*).
// Elimina a duplicação entre TechnicalTableBlock, SpecsTableInspector e legacy-table.adapter.
// Zero dependências de React, Zustand ou Supabase.

import { TableCellBoundContent } from '../table-core/table.types';
import { TableDatumResolver, TableDatumResolutionResult } from './table-datum.types';

export const LEGACY_PRODUCT_FIELD_PREFIX = 'legacy.product_field.';

/**
 * Interface mínima de produto para leitura de campos e especificações legadas.
 */
export interface LegacyProductLike {
  id?: string;
  code?: string;
  model?: string;
  family?: string;
  description?: string;
  specs?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Extrai o valor de um campo de produto legado respeitando a precedência:
 * 1. Campo de primeiro nível do produto
 * 2. Campo em product.specs
 * 3. Campo em product.specs.customSpecs
 */
export function resolveLegacyProductField(
  product: LegacyProductLike | undefined | null,
  fieldKey: string
): string | undefined {
  if (!product || !fieldKey) return undefined;

  const specs = (product.specs || {}) as Record<string, unknown>;
  const customSpecs = (specs.customSpecs || {}) as Record<string, unknown>;

  const rawValue =
    product[fieldKey] ??
    specs[fieldKey] ??
    customSpecs[fieldKey];

  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  return String(rawValue);
}

/**
 * Cria uma instância de TableDatumResolver para dados no namespace `legacy.product_field.*`.
 */
export function createLegacyProductFieldResolver(
  getProduct: (productId: string) => LegacyProductLike | undefined | null
): TableDatumResolver {
  return (reference: TableCellBoundContent): TableDatumResolutionResult | undefined => {
    if (!reference.datumKey.startsWith(LEGACY_PRODUCT_FIELD_PREFIX)) {
      return undefined;
    }

    const fieldKey = reference.datumKey.slice(LEGACY_PRODUCT_FIELD_PREFIX.length);
    const product = getProduct(reference.productId);

    if (!product) {
      return {
        value: { kind: 'empty' },
        status: 'unknown',
        diagnostic: { message: `Produto legado com ID "${reference.productId}" não encontrado.` }
      };
    }

    const fieldValue = resolveLegacyProductField(product, fieldKey);

    if (fieldValue !== undefined) {
      return {
        value: { kind: 'text', text: fieldValue },
        status: 'approved'
      };
    }

    return {
      value: { kind: 'empty' },
      status: 'unknown',
      diagnostic: { message: `Campo "${fieldKey}" não encontrado no produto "${reference.productId}".` }
    };
  };
}
