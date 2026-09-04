// src/domain/product-workspace/source-trace.ts
// Pure domain engine for Human-First Source Traceability (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Transforms raw database Evidence records and UUIDs into clear, human-readable citations.
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  SourceDocument,
  TechnicalDatum
} from '../product-workbook/types';
import {
  ProjectedSourceTrace,
  HumanProvenanceItem,
  WorkspaceLayoutV1
} from './types';
import { formatTechnicalValue } from './projection';

export interface ResolveSourceTraceParams {
  datumId: string;
  workbook: ProductWorkbookV2;
  effectiveKnowledge?: ResolvedProductKnowledge;
  sources?: readonly SourceDocument[];
  layout?: WorkspaceLayoutV1;
}

/**
 * Resolve o rastro completo de fonte e evidências de forma humanizada e legível.
 */
export function resolveSourceTrace(params: ResolveSourceTraceParams): ProjectedSourceTrace {
  const { datumId, workbook, effectiveKnowledge, sources = [], layout } = params;

  const sourceMap = new Map<string, SourceDocument>();
  for (const s of sources) {
    sourceMap.set(s.id, s);
  }

  // Localiza o datum
  let datum: TechnicalDatum | undefined;
  let originText = 'Calibrador / Produto Local';
  let hasConflict = false;
  let conflictMessage: string | undefined;

  if (effectiveKnowledge) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      if (eff.datum.id === datumId) {
        datum = eff.datum;
        if (eff.origin === 'family') {
          originText = 'Família de Produtos (Herdado)';
        } else if (eff.origin === 'product_override') {
          originText = 'Sobrescrita Específica do Produto';
        }
        if (eff.effectiveStatus === 'conflicting') {
          hasConflict = true;
          conflictMessage = eff.conflictReason || 'Valores divergentes observados entre documentos de referência.';
        }
        break;
      }
    }
  }

  if (!datum) {
    datum = workbook.data[datumId];
    if (!datum) {
      // Procura por ID direto nos valores
      datum = Object.values(workbook.data).find((d) => d.id === datumId);
    }
  }

  if (!datum) {
    throw new Error(`Datum "${datumId}" não foi encontrado no workbook nem no conhecimento efetivo.`);
  }

  const desc = layout?.semanticDescriptors?.[datum.semanticKey];
  const displayLabel = desc?.displayLabel || datum.label || datum.semanticKey;
  const currentValueFormatted = formatTechnicalValue(datum.value).text;

  const items: HumanProvenanceItem[] = [];

  if (datum.evidence && datum.evidence.length > 0) {
    for (const ev of datum.evidence) {
      const srcDoc = sourceMap.get(ev.sourceDocumentId);
      const observedText = ev.observedValue ? formatTechnicalValue(ev.observedValue).text : undefined;

      items.push({
        sourceTitle: srcDoc?.title || 'Documento Técnico Oficial',
        documentType: srcDoc?.documentType || 'manual',
        revision: srcDoc?.revision,
        page: ev.page,
        section: ev.section,
        locator: ev.locator,
        observedValueText: observedText,
        excerpt: ev.excerpt,
        capturedAt: ev.capturedAt,
        capturedBy: ev.capturedBy,
        isConsensus: datum.status === 'verified' || datum.status === 'approved'
      });
    }
  }

  let canonicalDecisionRationale: string | undefined;
  if (datum.canonicalDecision) {
    canonicalDecisionRationale = datum.canonicalDecision.rationale;
  }

  return {
    datumId: datum.id,
    displayLabel,
    canonicalKey: datum.semanticKey,
    currentValueFormatted,
    originText,
    hasConflict,
    conflictMessage,
    canonicalDecisionRationale,
    items,
    hasEvidence: items.length > 0
  };
}
