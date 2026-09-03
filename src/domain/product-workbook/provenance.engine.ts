// src/domain/product-workbook/provenance.engine.ts
// Provenance, Evidence Conflict Detection, and Canonical Decision Evaluation (PIM.W1.1).
// Pure domain engine without external side-effects.
// Zero explicit any.

import {
  TechnicalDatum,
  TechnicalValue,
  Evidence,
  CanonicalDecision,
  EffectiveDatumStatus
} from './types';
import { isValidIsoDate } from './validators';

/**
 * Structural deep equality for typed Technical Values.
 * Invariant: Unknown values with different reasons are considered distinct to trigger
 * conservative conflict detection (Part F).
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

    case 'unknown': {
      const bU = b as typeof a;
      // Unknown semantics: reasons participate in equality for conservative conflict tracking
      return (a.reason ?? '') === (bU.reason ?? '');
    }

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
 * Validates whether a canonical decision is structurally, referentially, and semantically valid for a datum.
 * Returns true only when non-empty rationale exists and all referenced evidence IDs exist on the datum.
 */
export function isCanonicalDecisionValidForDatum(
  decision: CanonicalDecision | undefined,
  datum: TechnicalDatum
): { readonly valid: boolean; readonly reason?: string } {
  if (!decision) {
    return { valid: false, reason: 'Decisão canônica ausente.' };
  }

  // A2. Non-empty rationale
  if (!decision.rationale || decision.rationale.trim().length === 0) {
    return { valid: false, reason: 'Decisão canônica não possui justificativa (rationale é obrigatório).' };
  }

  // Timestamp check
  if (!isValidIsoDate(decision.decidedAt)) {
    return { valid: false, reason: `decidedAt "${decision.decidedAt}" não é uma data ISO-8601 válida.` };
  }

  const availableEvidenceIds = new Set(datum.evidence.map((e) => e.id));

  // A3. Referential evidence existence
  switch (decision.kind) {
    case 'selected_evidence': {
      if (!decision.selectedEvidenceId || decision.selectedEvidenceId.trim().length === 0) {
        return { valid: false, reason: 'Decisão selected_evidence não informou selectedEvidenceId.' };
      }
      if (!availableEvidenceIds.has(decision.selectedEvidenceId)) {
        return {
          valid: false,
          reason: `Evidência selecionada "${decision.selectedEvidenceId}" não está anexada ao dado.`
        };
      }
      return { valid: true };
    }

    case 'engineering_decision': {
      if (!decision.basisEvidenceIds || decision.basisEvidenceIds.length === 0) {
        return { valid: false, reason: 'Decisão de engenharia exige ao menos uma evidência de base em basisEvidenceIds.' };
      }
      const missing = decision.basisEvidenceIds.filter((id) => !availableEvidenceIds.has(id));
      if (missing.length > 0) {
        return {
          valid: false,
          reason: `Decisão de engenharia referencia evidências não anexadas ao dado: ${missing.join(', ')}.`
        };
      }
      return { valid: true };
    }

    case 'verified_consensus': {
      if (!decision.verifiedEvidenceIds || decision.verifiedEvidenceIds.length === 0) {
        return { valid: false, reason: 'Consenso verificado exige ao menos uma evidência em verifiedEvidenceIds.' };
      }
      const missing = decision.verifiedEvidenceIds.filter((id) => !availableEvidenceIds.has(id));
      if (missing.length > 0) {
        return {
          valid: false,
          reason: `Consenso verificado referencia evidências não anexadas ao dado: ${missing.join(', ')}.`
        };
      }
      return { valid: true };
    }

    default:
      return { valid: false, reason: 'Tipo de decisão canônica desconhecido.' };
  }
}

/**
 * Detects discrepancies among observed values in attached evidences (Part A4).
 * Example: Source Manual EN asserts 155 °C, but Datasheet PT asserts 140 °C.
 * isResolvedByCanonicalDecision is TRUE only when the canonical decision is referentially and semantically valid.
 */
export function detectEvidenceConflicts(datum: TechnicalDatum): EvidenceConflictReport {
  const observedEvidences = datum.evidence.filter(
    (ev): ev is Evidence & { observedValue: TechnicalValue } => ev.observedValue !== undefined
  );

  const decisionValidation = isCanonicalDecisionValidForDatum(datum.canonicalDecision, datum);

  if (observedEvidences.length <= 1) {
    return {
      hasConflict: false,
      conflictingEvidence: [],
      distinctObservedValues: observedEvidences.map((e) => e.observedValue),
      isResolvedByCanonicalDecision: decisionValidation.valid
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
  const isResolved = hasConflict && decisionValidation.valid;

  let reason: string | undefined;
  if (hasConflict) {
    conflictingEvidences.push(...observedEvidences);
    if (isResolved) {
      reason = `Discrepância histórica registrada entre ${distinctValues.length} fontes, resolvida por decisão canônica (${datum.canonicalDecision?.kind}).`;
    } else if (datum.canonicalDecision && !decisionValidation.valid) {
      reason = `Conflito de evidências (${distinctValues.length} fontes distintas): decisão canônica inválida/incompleta (${decisionValidation.reason}).`;
    } else {
      reason = `Conflito de evidências: ${distinctValues.length} valores distintos observados sem decisão canônica aprovada.`;
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
