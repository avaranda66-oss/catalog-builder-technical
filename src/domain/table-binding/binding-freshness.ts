// src/domain/table-binding/binding-freshness.ts
// Avaliador puro de frescor e revisão de bindings tabulares (Emenda 15).
// Zero dependências externas ou de UI.

import { CatalogCellBinding } from '../catalog.schema';

export type BindingFreshnessStatus =
  | 'frozen'
  | 'not_applicable'
  | 'source_missing'
  | 'fresh'
  | 'review_required'
  | 'revision_regressed'
  | 'source_owner_changed'
  | 'unknown_revision';

export interface SourceOwnerInfo {
  readonly kind: 'product' | 'family';
  readonly id: string;
}

export interface BindingFreshnessResult {
  status: BindingFreshnessStatus;
  needsReview: boolean;
  message?: string;
  sourceRevision?: number;
  currentRevision?: number;
  sourceOwnerKind?: 'product' | 'family';
  currentOwnerKind?: 'product' | 'family';
}

/**
 * Avalia o status de frescor de um binding em relação à revisão atual da fonte técnica e sua identidade.
 * Contrato estrito (Emenda 7 & 15):
 * - snapshot -> frozen
 * - legacy/product_metadata sem revision -> not_applicable
 * - PIM/dataset + revision atual ausente -> source_missing
 * - mudança de proprietário da fonte (ex: family -> product_override) -> source_owner_changed (review_required)
 * - current == sourceRevision -> fresh
 * - current > sourceRevision -> review_required
 * - current < sourceRevision -> revision_regressed (NUNCA fresh)
 * - sourceRevision ausente quando deveria existir -> unknown_revision
 */
export function evaluateBindingFreshness(
  binding: CatalogCellBinding,
  currentRevision?: number | null,
  currentSourceOwner?: SourceOwnerInfo | null
): BindingFreshnessResult {
  // 1. Modo Snapshot: dados congelados
  if (binding.bindingMode === 'snapshot') {
    return {
      status: 'frozen',
      needsReview: false,
      message: 'Dado congelado por snapshot explícito.',
      sourceRevision: binding.sourceRevision,
      currentRevision: currentRevision ?? undefined,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner?.kind
    };
  }

  // 2. Fontes legadas ou metadados sem rastreamento de revisão
  if (binding.sourceKind === 'legacy' || (binding.sourceKind === 'product_metadata' && binding.sourceRevision === undefined)) {
    return {
      status: 'not_applicable',
      needsReview: false,
      message: 'Controle de revisão não aplicável a esta fonte.',
      sourceRevision: binding.sourceRevision,
      currentRevision: currentRevision ?? undefined
    };
  }

  // 3. PIM / dataset onde a revisão atual da fonte está ausente
  if (currentRevision === undefined || currentRevision === null) {
    return {
      status: 'source_missing',
      needsReview: true,
      message: 'Revisão atual da fonte indisponível (source_missing).',
      sourceRevision: binding.sourceRevision,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner?.kind
    };
  }

  // 4. Detecção de mudança de proprietário da fonte (Emenda 7: family -> product override)
  if (
    currentSourceOwner &&
    binding.sourceOwnerKind &&
    (currentSourceOwner.kind !== binding.sourceOwnerKind || (binding.sourceOwnerId && currentSourceOwner.id !== binding.sourceOwnerId))
  ) {
    return {
      status: 'source_owner_changed',
      needsReview: true,
      message: `Origem da fonte técnica alterada (${binding.sourceOwnerKind} -> ${currentSourceOwner.kind}). Revisão necessária.`,
      sourceRevision: binding.sourceRevision,
      currentRevision,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner.kind
    };
  }

  // 5. Revisão gravada ausente quando esperada
  if (binding.sourceRevision === undefined || binding.sourceRevision === null) {
    return {
      status: 'unknown_revision',
      needsReview: true,
      message: 'Revisão de origem não informada no binding (unknown_revision).',
      currentRevision,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner?.kind
    };
  }

  // 6. Revisão idêntica
  if (currentRevision === binding.sourceRevision) {
    return {
      status: 'fresh',
      needsReview: false,
      message: 'Dado sincronizado com a revisão atual da fonte.',
      sourceRevision: binding.sourceRevision,
      currentRevision,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner?.kind
    };
  }

  // 7. Revisão avançada (fonte mais nova)
  if (currentRevision > binding.sourceRevision) {
    return {
      status: 'review_required',
      needsReview: true,
      message: `A fonte técnica foi atualizada (rev ${currentRevision} > rev ${binding.sourceRevision}). Revisão necessária.`,
      sourceRevision: binding.sourceRevision,
      currentRevision,
      sourceOwnerKind: binding.sourceOwnerKind,
      currentOwnerKind: currentSourceOwner?.kind
    };
  }

  // 8. Regressão de revisão (rev da fonte menor que a persistida) -> NUNCA chamar de fresh
  return {
    status: 'revision_regressed',
    needsReview: true,
    message: `Regressão de revisão detectada na fonte técnica (rev ${currentRevision} < rev ${binding.sourceRevision}).`,
    sourceRevision: binding.sourceRevision,
    currentRevision,
    sourceOwnerKind: binding.sourceOwnerKind,
    currentOwnerKind: currentSourceOwner?.kind
  };
}
