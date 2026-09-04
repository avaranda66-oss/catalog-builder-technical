// src/domain/product-workspace/ai-envelope.ts
// Pure domain engine for AI Knowledge Consumption & Zero-Loss Provenance (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Guarantees:
// 1. Unambiguous, typed extraction of technical knowledge for AI agents and LLM tool calling.
// 2. Exact provenance tracking: Document -> Page -> Section -> Locator -> Observed Value -> Datum.
// 3. Absolute safety: Missing evidence explicitly flags absence, never hallucinates sources.
// 4. Stable canonical keys preserved alongside user-defined human aliases and labels.
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  SourceDocument,
  TechnicalDatum
} from '../product-workbook/types';
import {
  AiProductKnowledgeEnvelope,
  AiDatumEnvelope,
  AiProvenanceRecord,
  WorkspaceLayoutV1
} from './types';
import { formatTechnicalValue } from './projection';

export interface BuildAiEnvelopeParams {
  workbook: ProductWorkbookV2;
  effectiveKnowledge?: ResolvedProductKnowledge;
  sources?: readonly SourceDocument[];
  layout?: WorkspaceLayoutV1;
}

/**
 * Constrói o envelope canônico e estritamente tipado de conhecimento do produto para consumo por IA.
 */
export function buildAiProductKnowledgeEnvelope(params: BuildAiEnvelopeParams): AiProductKnowledgeEnvelope {
  const { workbook, effectiveKnowledge, sources = [], layout } = params;
  const productId = workbook.owner.id;

  const sourceMap = new Map<string, SourceDocument>();
  for (const s of sources) {
    sourceMap.set(s.id, s);
  }

  const descriptors = layout?.semanticDescriptors || {};

  // Mapeamento de datasets para associar colunas/células ao datum
  const datasetMembershipMap = new Map<
    string,
    { datasetId: string; datasetKey: string; rowId: string; columnId: string }[]
  >();

  const allDatasets = [...(workbook.datasets || [])];
  if (effectiveKnowledge?.effectiveDatasets) {
    for (const effDs of effectiveKnowledge.effectiveDatasets.values()) {
      if (!allDatasets.some((d) => d.id === effDs.dataset.id)) {
        allDatasets.push(effDs.dataset);
      }
    }
  }

  for (const ds of allDatasets) {
    for (const cell of Object.values(ds.cells)) {
      if (!datasetMembershipMap.has(cell.datumId)) {
        datasetMembershipMap.set(cell.datumId, []);
      }
      datasetMembershipMap.get(cell.datumId)!.push({
        datasetId: ds.id,
        datasetKey: ds.semanticKey,
        rowId: cell.rowId,
        columnId: cell.columnId
      });
    }
  }

  // Mapeamento de módulos
  const moduleMap = new Map<string, { id: string; semanticKey: string; label: string }>();
  for (const mod of workbook.modules) {
    moduleMap.set(mod.id, {
      id: mod.id,
      semanticKey: mod.semanticKey,
      label: mod.label
    });
  }
  if (effectiveKnowledge) {
    for (const mod of effectiveKnowledge.modules) {
      if (!moduleMap.has(mod.id)) {
        moduleMap.set(mod.id, {
          id: mod.id,
          semanticKey: mod.semanticKey,
          label: mod.label
        });
      }
    }
  }

  // Coleta dados efetivos ou locais
  const effectiveEntries = new Map<string, { datum: TechnicalDatum; origin: 'family' | 'product_local' | 'product_override'; status: any; isOverride: boolean; familyDatumId?: string }>();

  if (effectiveKnowledge) {
    for (const eff of effectiveKnowledge.effectiveData.values()) {
      effectiveEntries.set(eff.datum.id, {
        datum: eff.datum,
        origin: eff.origin,
        status: eff.effectiveStatus,
        isOverride: eff.origin === 'product_override',
        familyDatumId: eff.familyDatumId
      });
    }
  }

  for (const d of Object.values(workbook.data)) {
    if (!effectiveEntries.has(d.id)) {
      effectiveEntries.set(d.id, {
        datum: d,
        origin: 'product_local',
        status: d.status,
        isOverride: false
      });
    }
  }

  const items: AiDatumEnvelope[] = [];
  let factsWithProvenance = 0;
  let factsWithoutProvenance = 0;
  let verifiedOrApprovedFacts = 0;
  let draftOrConflictingFacts = 0;

  for (const entry of effectiveEntries.values()) {
    const { datum, origin, status, isOverride, familyDatumId } = entry;
    const desc = descriptors[datum.semanticKey];

    const displayLabel = desc?.displayLabel || datum.label || datum.semanticKey;
    const aliases = desc?.aliases || [];
    const formatted = formatTechnicalValue(datum.value);

    // Proveniência de evidências
    const evidenceReferences: AiProvenanceRecord[] = [];
    const referencedDocIds = new Set<string>();

    if (datum.evidence && datum.evidence.length > 0) {
      for (const ev of datum.evidence) {
        const doc = sourceMap.get(ev.sourceDocumentId);
        referencedDocIds.add(ev.sourceDocumentId);

        evidenceReferences.push({
          evidenceId: ev.id,
          sourceDocumentId: ev.sourceDocumentId,
          sourceTitle: doc?.title || `Documento ${ev.sourceDocumentId}`,
          revision: doc?.revision,
          page: ev.page,
          section: ev.section,
          locator: ev.locator,
          observedValue: ev.observedValue,
          excerpt: ev.excerpt
        });
      }
    }

    const sourceDocuments = Array.from(referencedDocIds).map((docId) => {
      const doc = sourceMap.get(docId);
      return {
        id: docId,
        title: doc?.title || `Documento ${docId}`,
        revision: doc?.revision,
        type: doc?.documentType || 'other'
      };
    });

    const hasProvenance = evidenceReferences.length > 0;
    if (hasProvenance) {
      factsWithProvenance++;
    } else {
      factsWithoutProvenance++;
    }

    if (status === 'approved' || status === 'verified') {
      verifiedOrApprovedFacts++;
    } else {
      draftOrConflictingFacts++;
    }

    // Módulo pertencente
    const mod = moduleMap.get(datum.moduleId);
    const moduleMemberships = mod
      ? [
          {
            moduleId: mod.id,
            moduleKey: mod.semanticKey,
            moduleLabel: mod.label
          }
        ]
      : [];

    // Datasets pertencentes
    const datasetMemberships = datasetMembershipMap.get(datum.id) || [];

    items.push({
      datumId: datum.id,
      canonicalSemanticKey: datum.semanticKey,
      displayLabel,
      aliases,
      typedValue: datum.value,
      formattedValue: formatted.text,
      unit: formatted.unit,
      status,
      owner: workbook.owner,
      sourceOwner: origin === 'family' ? 'family' : 'product',
      moduleMemberships,
      datasetMemberships,
      evidenceReferences,
      sourceDocuments,
      canonicalDecision: datum.canonicalDecision,
      inheritanceProvenance: {
        origin,
        isOverride,
        familyDatumId
      },
      hasProvenance
    });
  }

  return {
    productId,
    productRevision: workbook.revision,
    familyId: effectiveKnowledge?.familyId,
    generatedAt: new Date().toISOString(),
    items,
    summary: {
      totalFacts: items.length,
      verifiedOrApprovedFacts,
      draftOrConflictingFacts,
      factsWithProvenance,
      factsWithoutProvenance
    }
  };
}
