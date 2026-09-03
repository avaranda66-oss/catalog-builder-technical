// src/domain/product-workbook/provenance.engine.ts
// Provenance, Evidence Conflict Detection, and Canonical Decision Evaluation.
// Pure domain engine without external side-effects.
// Zero explicit any.

import {
  TechnicalDatum,
  TechnicalValue,
  Evidence,
  EffectiveDatumStatus
} from './types';

/**
 * Structural deep equality for typed Technical Values.
 */
export function areValuesEqual(a: TechnicalValue, b: TechnicalValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'text':
      return a.value === (b as typeof a).value;

    case 'number':
      return a.value === (b as typeof a).value;

    case 'boolean':
      return a.value === (b as typeof a).value;

    case 'quantity': {
      const bQ = b as typeof a;
      return (
        a.amount === bQ.amount &&
        a.unit === bQ.unit &&
        (a.qualifier ?? 'exact') === (bQ.qualifier ?? 'exact')
      );
    }

    case 'range': {
      const bR = b as typeof a;
      return (
        a.lower === bR.lower &&
        a.upper === bR.upper &&
        a.unit === bR.unit &&
        (a.lowerInclusive ?? true) === (bR.lowerInclusive ?? true) &&
        (a.upperInclusive ?? true) === (bR.upperInclusive ?? true)
      );
    }

    case 'enum':
      return a.code === (b as typeof a).code;

    case 'technical_token': {
      const bT = b as typeof a;
      return a.token === bT.token && (a.category ?? '') === (bT.category ?? '');
    }

    case 'asset_reference':
      return a.assetId === (b as typeof a).assetId;

    case 'product_reference': {
      const bP = b as typeof a;
      return (
        a.targetProductId === bP.targetProductId &&
        (a.relationKind ?? '') === (bP.relationKind ?? '')
      );
    }

    case 'unknown':
      return true;

    default:
      return false;
  }
}

/**
 * Result of evidence conflict detection.
 */
export interface EvidenceConflictReport {
  readonly hasConflict: boolean;
  readonly conflictingEvidence: readonly Evidence[];
  readonly distinctObservedValues: readonly TechnicalValue[];
  readonly isResolvedByCanonicalDecision: boolean;
  readonly reason?: string;
}

/**
 * Detects discrepancies among observed values in attached evidences.
 * Example: Source Manual EN asserts 155 °C, but Datasheet PT asserts 140 °C.
 */
export function detectEvidenceConflicts(datum: TechnicalDatum): EvidenceConflictReport {
  const observedEvidences = datum.evidence.filter(
    (ev): ev is Evidence & { observedValue: TechnicalValue } => ev.observedValue !== undefined
  );

  if (observedEvidences.length <= 1) {
    return {
      hasConflict: false,
      conflictingEvidence: [],
      distinctObservedValues: observedEvidences.map((e) => e.observedValue),
      isResolvedByCanonicalDecision: Boolean(datum.canonicalDecision)
    };
  }

  const distinctValues: TechnicalValue[] = [];
  const conflictingEvidences: Evidence[] = [];

  for (const ev of observedEvidences) {
    const isDistinct = !distinctValues.some((v) => areValuesEqual(v, ev.observedValue));
    if (isDistinct) {
      distinctValues.push(ev.observedValue);
    }
  }

  const hasConflict = distinctValues.length > 1;
  const isResolved = Boolean(
    datum.canonicalDecision &&
    (datum.canonicalDecision.status === 'selected' ||
     datum.canonicalDecision.status === 'verified' ||
     datum.canonicalDecision.status === 'synthetic')
  );

  let reason: string | undefined;
  if (hasConflict) {
    conflictingEvidences.push(...observedEvidences);
    if (!isResolved) {
      reason = `Conflito de evidências: ${distinctValues.length} valores distintos observados sem decisão canônica aprovada.`;
    } else {
      reason = `Discrepância histórica registrada entre ${distinctValues.length} fontes, resolvida por decisão canônica (${datum.canonicalDecision?.status}).`;
    }
  }

  return {
    hasConflict,
    conflictingEvidence: conflictingEvidences,
    distinctObservedValues: distinctValues,
    isResolvedByCanonicalDecision: isResolved,
    reason
  };
}

/**
 * Derives the effective datum status.
 * Ensures 'conflicting' is a derived state rather than a contradictory stored flag.
 */
export function deriveDatumStatus(datum: TechnicalDatum): EffectiveDatumStatus {
  if (datum.status === 'deprecated') {
    return 'deprecated';
  }

  const conflictReport = detectEvidenceConflicts(datum);
  if (conflictReport.hasConflict && !conflictReport.isResolvedByCanonicalDecision) {
    return 'conflicting';
  }

  return datum.status;
}
