// src/domain/product-workbook/query.engine.ts
// AI-Safe Knowledge Snapshot, Comparison Matrix, and Saved View Evaluator (PIM.W1).
// Pure functional domain queries without database or AI network dependencies.
// Zero explicit any.

import {
  ResolvedProductKnowledge,
  KnowledgeSnapshot,
  KnowledgeFactSnapshot,
  ProductComparisonMatrix,
  ProductComparisonRow,
  ProductDataView,
  EffectiveDatumStatus,
  TechnicalValue,
  EffectiveDatum
} from './types';
import { detectEvidenceConflicts } from './provenance.engine';

/**
 * Policy defining which verification levels are included in an AI or publication snapshot.
 */
export type SnapshotInclusionPolicy =
  | 'approved_only'
  | 'verified_or_approved'
  | 'all_including_draft';

/**
 * Generates an AI-safe snapshot of product knowledge.
 *
 * Invariants:
 * 1. Draft facts are excluded by default (under 'approved_only' or 'verified_or_approved').
 * 2. Conflicting facts are never quietly reported as factual consensus.
 * 3. Unknown values remain explicit (Zero Hallucination).
 */
export function getProductKnowledgeSnapshot(params: {
  effectiveKnowledge: ResolvedProductKnowledge;
  policy?: SnapshotInclusionPolicy;
}): KnowledgeSnapshot {
  const { effectiveKnowledge } = params;
  const policy = params.policy ?? 'approved_only';

  const facts = new Map<string, KnowledgeFactSnapshot>();
  const conflictingFacts: KnowledgeFactSnapshot[] = [];
  const unknownFacts: KnowledgeFactSnapshot[] = [];

  for (const [semKey, effective] of effectiveKnowledge.effectiveData) {
    const datum = effective.datum;
    const status = effective.effectiveStatus;

    const conflictReport = detectEvidenceConflicts(datum);
    const hasConflict = conflictReport.hasConflict && !conflictReport.isResolvedByCanonicalDecision;

    const sourceSummaries = datum.evidence.map((ev) => {
      const pageInfo = ev.page !== undefined ? ` (pág. ${ev.page})` : '';
      const locatorInfo = ev.locator ? ` [loc: ${ev.locator}]` : '';
      return `${ev.sourceDocumentId}${pageInfo}${locatorInfo}`;
    });

    const factSnapshot: KnowledgeFactSnapshot = {
      semanticKey: semKey,
      label: datum.label,
      effectiveValue: datum.value,
      status,
      origin: effective.origin,
      sourceCount: datum.evidence.length,
      sourceSummaries,
      revision:
        effective.origin === 'family'
          ? (effectiveKnowledge.familyRevision ?? effectiveKnowledge.productRevision)
          : effectiveKnowledge.productRevision,
      hasConflict,
      candidateValues: conflictReport.distinctObservedValues
    };

    // 1. Categoria: Fato com Conflito Não Resolvido
    if (status === 'conflicting' || hasConflict) {
      conflictingFacts.push(factSnapshot);
      continue;
    }

    // 2. Categoria: Fato Desconhecido / Não Registrado
    if (datum.value.type === 'unknown') {
      unknownFacts.push(factSnapshot);
      continue;
    }

    // 3. Filtragem conforme política de aprovação
    if (policy === 'approved_only') {
      if (status === 'approved') {
        facts.set(semKey, factSnapshot);
      }
    } else if (policy === 'verified_or_approved') {
      if (status === 'approved' || status === 'verified') {
        facts.set(semKey, factSnapshot);
      }
    } else {
      // all_including_draft (exclui apenas deprecated)
      if (status !== 'deprecated') {
        facts.set(semKey, factSnapshot);
      }
    }
  }

  return {
    productId: effectiveKnowledge.productId,
    productRevision: effectiveKnowledge.productRevision,
    generatedAt: new Date().toISOString(),
    facts,
    conflictingFacts,
    unknownFacts
  };
}

/**
 * Compares multiple products aligned by semantic keys.
 * Produces structured comparison rows without copying values across products.
 */
export function compareResolvedProducts(
  products: readonly { readonly productId: string; readonly knowledge: ResolvedProductKnowledge }[]
): ProductComparisonMatrix {
  const productIds = products.map((p) => p.productId);
  const allSemanticKeys = new Set<string>();
  const labelsByKey = new Map<string, string>();

  // Coleta união de todas as chaves semânticas presentes em qualquer dos produtos
  for (const prod of products) {
    for (const [key, effective] of prod.knowledge.effectiveData) {
      allSemanticKeys.add(key);
      if (!labelsByKey.has(key)) {
        labelsByKey.set(key, effective.datum.label);
      }
    }
  }

  const sortedKeys = Array.from(allSemanticKeys).sort();
  const rows: ProductComparisonRow[] = [];

  for (const semKey of sortedKeys) {
    const label = labelsByKey.get(semKey) ?? semKey;
    const valuesByProductId: Record<string, TechnicalValue | null> = {};
    const statusByProductId: Record<string, EffectiveDatumStatus | 'missing'> = {};

    for (const prod of products) {
      const datum = prod.knowledge.effectiveData.get(semKey);
      if (datum) {
        valuesByProductId[prod.productId] = datum.datum.value;
        statusByProductId[prod.productId] = datum.effectiveStatus;
      } else {
        valuesByProductId[prod.productId] = null;
        statusByProductId[prod.productId] = 'missing';
      }
    }

    rows.push({
      semanticKey: semKey,
      label,
      valuesByProductId,
      statusByProductId
    });
  }

  return {
    productIds,
    rows
  };
}

/**
 * Evaluates a saved data view against effective product knowledge.
 * Invariant: Modifying or evaluating a view never mutates underlying TechnicalDatum facts.
 */
export function evaluateSavedView(
  view: ProductDataView,
  knowledge: ResolvedProductKnowledge
): {
  readonly viewId: string;
  readonly viewName: string;
  readonly rows: readonly { readonly semanticKey: string; readonly label: string; readonly datum: EffectiveDatum }[];
} {
  const rows: { semanticKey: string; label: string; datum: EffectiveDatum }[] = [];

  for (const datumKey of view.datumKeys) {
    const effective = knowledge.effectiveData.get(datumKey);
    if (effective) {
      rows.push({
        semanticKey: datumKey,
        label: effective.datum.label,
        datum: effective
      });
    }
  }

  // Ordenação se fornecida
  if (view.ordering && view.ordering.length > 0) {
    const orderIndexMap = new Map(view.ordering.map((k, i) => [k, i]));
    rows.sort((a, b) => {
      const idxA = orderIndexMap.get(a.semanticKey) ?? 9999;
      const idxB = orderIndexMap.get(b.semanticKey) ?? 9999;
      return idxA - idxB;
    });
  }

  return {
    viewId: view.id,
    viewName: view.name,
    rows
  };
}
