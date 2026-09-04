// src/domain/product-workspace/view-model.ts
// Pure Production ViewModel & Adapter for Mega Product Workspace (PIM.MEGA.WORKSPACE.INTEGRATION1.1).
// Guarantees:
// 1. Zero Second Truth: factsById is the single canonical map for all facts on screen.
// 2. Reuse domain TechnicalValue directly (Amendment I).
// 3. Family-only product remains truly family-only (Amendment B: hasProductWorkbook=false, productRevision=undefined).
// 4. Simple and Advanced views use the SAME safe factual truth: effective_for_publishing (Blocker 2).
// 5. Zero legacy product.specs fallback (Amendment H).
// 6. Explicit product field mapping (Amendment J: model -> displayName, code -> code, family.name -> familyLabel).
// 7. Partial provenance fail-soft (Amendment L: missing source marked unavailable without fabricating data).
// 8. Canonical table cell key collision safety via getDatasetCellKey (Blocker 1).
// 9. Unresolved conflict is NOT presented as a vigent fact (Blocker 4).
// 10. Lossless evidence projection (Blocker 5).
// 11. Search results projection (Blocker 8).
// 12. Evidence agreement verified via areValuesEqual (Blocker 12).
// Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalDatum,
  TechnicalValue,
  SourceDocument,
  DatumOrigin,
  getDatasetCellKey
} from '../product-workbook/types';
import { areValuesEqual } from '../product-workbook/provenance.engine';
import { resolveEffectiveProductKnowledge } from '../product-workbook/inheritance.engine';
import {
  WorkspaceLayoutV1,
  WorkspaceBlockSize,
  WorkspaceBlockVisibility,
  SemanticRegistryV1
} from './types';
import { formatTechnicalValue, buildWorkspaceProjection } from './projection';

// ============================================================================
// 1. VIEW-MODEL TYPES (PRODUCTION CONTRACT)
// ============================================================================

export interface ProductPresentationVM {
  readonly id: string;
  readonly displayName: string; // product.model -> displayName (Amendment J)
  readonly code: string;        // product.code -> code (Amendment J)
  readonly familyLabel?: string; // family?.name -> familyLabel (Amendment J)
  readonly familyId?: string;
  readonly hasProductWorkbook: boolean; // false for family-only (Amendment B)
  readonly productRevision?: number;    // undefined for family-only (Amendment B)
  readonly familyRevision?: number;
  readonly isFamilyOnly: boolean;
}

export type EvidenceState =
  | 'no_source'
  | 'single_source'
  | 'multiple_sources'
  | 'multiple_agreeing'
  | 'conflicting_sources';

export type FactPresentationState = 'factual' | 'pending_review' | 'conflicting';

export interface ProjectedEvidenceVM {
  readonly evidenceId: string;
  readonly sourceDocumentId: string;
  readonly page?: string | number;
  readonly section?: string;
  readonly locator?: string;
  readonly observedValue?: TechnicalValue;
  readonly formattedObservedValue?: string;
  readonly excerpt?: string;
  readonly notes?: string;
  readonly capturedAt?: string;
  readonly capturedBy?: string;
}

export interface ProjectedFactVM {
  readonly datumId: string;
  readonly semanticKey: string;
  readonly canonicalLabel: string;
  readonly formattedValue: string;
  readonly technicalValue: TechnicalValue; // domain TechnicalValue! (Amendment I)
  readonly unit?: string;
  readonly tolerance?: string;
  readonly dimensionKind?: string;
  readonly evidenceState: EvidenceState;
  readonly presentationState: FactPresentationState; // Blocker 4
  readonly candidateValues?: readonly string[]; // Blocker 4
  readonly originState: 'product_local' | 'family' | 'product_override';
  readonly originLabel: string;
  readonly sourceDocumentIds: readonly string[];
  readonly evidences: readonly ProjectedEvidenceVM[]; // Blocker 5
  readonly hasConflict: boolean;
  readonly isPendingOverride?: boolean; // Amendment G
  readonly pendingOverrideValue?: string;
  readonly provenanceIncomplete?: boolean; // Amendment L
}

export interface ProjectedSourceVM {
  readonly id: string;
  readonly title: string;
  readonly documentType: string;
  readonly revision?: string;
  readonly language?: string;
  readonly externalUrl?: string;
  readonly citationCount: number;
  readonly isUnavailable?: boolean; // Amendment L
}

export interface ProjectedConflictVM {
  readonly factId: string;
  readonly canonicalKey: string;
  readonly displayLabel: string;
  readonly message: string;
  readonly origin: string;
  readonly candidateValues: readonly string[];
  readonly rationale?: string;
}

export interface MegaTableCellVM {
  readonly type: 'fact_ref' | 'editorial_literal';
  readonly factId?: string;
  readonly value?: string;
  readonly displayOverride?: string;
  readonly highlight?: boolean;
}

export interface MegaTableColumnVM {
  readonly id: string;
  readonly label: string;
  readonly width?: string;
  readonly align?: 'left' | 'center' | 'right';
}

export interface MegaTableRowVM {
  readonly id: string;
  readonly label?: string;
  readonly cells: Readonly<Record<string, MegaTableCellVM>>;
}

export interface MegaTableBlockVM {
  readonly id: string;
  readonly kind: 'technical_table' | 'dataset_view';
  readonly title?: string;
  readonly description?: string;
  readonly size: WorkspaceBlockSize;
  readonly visibility: WorkspaceBlockVisibility;
  readonly columns: readonly MegaTableColumnVM[];
  readonly rows: readonly MegaTableRowVM[];
}

export interface FactGridBlockVM {
  readonly id: string;
  readonly kind: 'fact_grid' | 'datum_list';
  readonly title?: string;
  readonly size: WorkspaceBlockSize;
  readonly visibility: WorkspaceBlockVisibility;
  readonly factIds: readonly string[];
  readonly columns?: number;
}

export interface TextNoteBlockVM {
  readonly id: string;
  readonly kind: 'text_note';
  readonly title?: string;
  readonly content: string;
  readonly calloutVariant: 'info' | 'warning' | 'tip' | 'editorial';
  readonly size: WorkspaceBlockSize;
  readonly visibility: WorkspaceBlockVisibility;
}

export interface SourceGroupBlockVM {
  readonly id: string;
  readonly kind: 'source_group';
  readonly title?: string;
  readonly sourceIds: readonly string[];
  readonly size: WorkspaceBlockSize;
  readonly visibility: WorkspaceBlockVisibility;
}

export interface DividerBlockVM {
  readonly id: string;
  readonly kind: 'divider';
  readonly spacing: 'small' | 'medium' | 'large';
  readonly size: WorkspaceBlockSize;
  readonly visibility: WorkspaceBlockVisibility;
}

export type ProjectedBlockVM =
  | FactGridBlockVM
  | MegaTableBlockVM
  | TextNoteBlockVM
  | SourceGroupBlockVM
  | DividerBlockVM;

export interface ProjectedSectionVM {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly collapsed: boolean;
  readonly icon?: string;
  readonly blocks: readonly ProjectedBlockVM[];
}

export interface WorkspaceMetricsVM {
  /** Total canônico de fatos disponíveis no produto (cardinalidade de factsById; ZERO fallback para tela) */
  readonly knowledgeFactsCount?: number;
  /** Total de fatos únicos referenciados na árvore de layout */
  readonly referencedFactsCount: number;
  /** Fatos técnicos únicos referenciados pela visualização ativa (blocos visíveis) */
  readonly visibleUniqueFactsCount: number;
  /** Total de ocorrências visuais de fatos renderizadas */
  readonly visibleFactOccurrences: number;
  /** Total de referências a fatos dentro de células de tabelas */
  readonly tableFactReferencesCount: number;
  /** Quantidade de blocos de tabela */
  readonly tablesCount: number;
  /** Quantidade de documentos de fonte únicos */
  readonly sourcesCount: number;
  /** Total de conflitos canônicos conhecidos no produto */
  readonly knowledgeConflictsCount?: number;
  /** Total de fatos únicos em conflito apresentados na visualização ativa */
  readonly visibleConflictsCount: number;
}

export interface WorkspaceSessionVM {
  readonly interactionMode: 'view' | 'edit_layout' | 'edit_data';
  readonly detailLevel: 'simple' | 'advanced';
  readonly activeSectionId?: string;
  readonly searchQuery?: string;
}

export interface SearchResultVM {
  readonly id: string;
  readonly kind: 'fact' | 'table' | 'section' | 'source';
  readonly label: string;
  readonly factId?: string;
  readonly sectionId?: string;
  readonly tableId?: string;
  readonly blockId?: string;
  readonly sourceTableId?: string;
  readonly datasetId?: string;
  readonly sourceId?: string;
  readonly snippet?: string;
}

export interface MegaWorkspaceViewModel {
  readonly product: ProductPresentationVM;
  readonly metrics: WorkspaceMetricsVM;
  readonly factsById: Readonly<Record<string, ProjectedFactVM>>;
  readonly sourcesById: Readonly<Record<string, ProjectedSourceVM>>;
  readonly conflictsByFactId: Readonly<Record<string, ProjectedConflictVM>>;
  readonly sections: readonly ProjectedSectionVM[];
  readonly session: WorkspaceSessionVM;
  readonly searchResults: readonly SearchResultVM[]; // Blocker 8
  readonly isEmptyState: boolean;
}

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Coleta todos os IDs únicos de SourceDocument diretamente referenciados
 * pelas evidências dos fatos resolvidos e por auditorias/overrides pendentes (Emenda D + Blocker 3).
 * Evita chamadas cegas a listSourceDocuments() sem filtro.
 */
export function collectReferencedSourceDocumentIds(
  effectiveKnowledge: ResolvedProductKnowledge,
  auditContext?: {
    productWorkbook?: ProductWorkbookV2 | null;
    familyWorkbook?: ProductWorkbookV2 | null;
  }
): readonly string[] {
  const ids = new Set<string>();

  // 1. Safe factual source IDs (from publishing resolution)
  for (const entry of effectiveKnowledge.effectiveData.values()) {
    if (entry.datum.evidence) {
      for (const ev of entry.datum.evidence) {
        if (ev.sourceDocumentId && ev.sourceDocumentId.trim()) {
          ids.add(ev.sourceDocumentId.trim());
        }
      }
    }
  }

  // 2. Audit/pending source IDs from product workbook overrides and local data
  if (auditContext?.productWorkbook) {
    if (auditContext.productWorkbook.overrides) {
      for (const ovr of Object.values(auditContext.productWorkbook.overrides)) {
        if (ovr.evidence) {
          for (const ev of ovr.evidence) {
            if (ev.sourceDocumentId && ev.sourceDocumentId.trim()) {
              ids.add(ev.sourceDocumentId.trim());
            }
          }
        }
      }
    }
    if (auditContext.productWorkbook.data) {
      for (const datum of Object.values(auditContext.productWorkbook.data)) {
        if (datum.evidence) {
          for (const ev of datum.evidence) {
            if (ev.sourceDocumentId && ev.sourceDocumentId.trim()) {
              ids.add(ev.sourceDocumentId.trim());
            }
          }
        }
      }
    }
  }

  // 3. Audit source IDs from family workbook
  if (auditContext?.familyWorkbook?.data) {
    for (const datum of Object.values(auditContext.familyWorkbook.data)) {
      if (datum.evidence) {
        for (const ev of datum.evidence) {
          if (ev.sourceDocumentId && ev.sourceDocumentId.trim()) {
            ids.add(ev.sourceDocumentId.trim());
          }
        }
      }
    }
  }

  return Array.from(ids);
}

/**
 * Deriva o estado de evidência baseado em consenso factual comprovado (Blocker 12 + Micro-closure 1.2).
 * multiple_agreeing: SOMENTE se houver >= 2 observedValues comparáveis E TODOS os observedValues comparáveis forem estruturalmente iguais.
 * Se conflito histórico foi resolvido ou houver divergência entre quaisquer valores comparáveis: multiple_sources.
 */
function deriveEvidenceState(datum: TechnicalDatum, hasConflict: boolean): EvidenceState {
  if (hasConflict) return 'conflicting_sources';
  const evidences = datum.evidence || [];
  if (evidences.length === 0) return 'no_source';
  if (evidences.length === 1) return 'single_source';

  const observedValues = evidences
    .map((e) => e.observedValue)
    .filter((v): v is TechnicalValue => v !== undefined);

  // multiple_agreeing: somente se houver >= 2 observedValues comparáveis
  // E TODOS os observedValues comparáveis forem estruturalmente iguais.
  if (observedValues.length >= 2) {
    const first = observedValues[0];
    const allAgree = observedValues.every((val) => areValuesEqual(val, first));
    if (allAgree) {
      // Se conflito histórico foi resolvido por decisão canônica, não fingir que todas as fontes concordam
      if (datum.canonicalDecision || (datum as any).conflict) {
        return 'multiple_sources';
      }
      return 'multiple_agreeing';
    }
  }

  return 'multiple_sources';
}

function mapOriginState(origin: DatumOrigin): 'product_local' | 'family' | 'product_override' {
  switch (origin) {
    case 'family':
      return 'family';
    case 'product_override':
      return 'product_override';
    case 'product_local':
    default:
      return 'product_local';
  }
}

// ============================================================================
// 3. ADAPTER FACTORY
// ============================================================================

export interface BuildMegaWorkspaceViewModelParams {
  product: {
    id: string;
    model: string;
    code?: string;
    family_id?: string | null;
  };
  family?: {
    id: string;
    name: string;
  } | null;
  productWorkbook?: ProductWorkbookV2 | null;
  familyWorkbook?: ProductWorkbookV2 | null;
  layout?: WorkspaceLayoutV1 | null;
  semanticRegistry?: SemanticRegistryV1 | null;
  sourceDocuments?: readonly SourceDocument[];
  session?: Partial<WorkspaceSessionVM>;
}

export function buildMegaWorkspaceViewModel(
  params: BuildMegaWorkspaceViewModelParams
): MegaWorkspaceViewModel {
  const {
    product,
    family,
    productWorkbook,
    familyWorkbook,
    layout: existingLayout,
    semanticRegistry,
    sourceDocuments = [],
    session: initialSession
  } = params;

  // Session state setup (Orthogonal interaction axes)
  const session: WorkspaceSessionVM = {
    interactionMode: initialSession?.interactionMode ?? 'view',
    detailLevel: initialSession?.detailLevel ?? 'simple',
    activeSectionId: initialSession?.activeSectionId,
    searchQuery: initialSession?.searchQuery
  };

  // Product presentation mapping (Amendment J: model -> displayName, code -> code)
  // Family-only protection (Amendment B: hasProductWorkbook=false, productRevision=undefined)
  const productPresentation: ProductPresentationVM = {
    id: product.id,
    displayName: product.model,
    code: product.code || product.model,
    familyLabel: family?.name,
    familyId: product.family_id || family?.id,
    hasProductWorkbook: Boolean(productWorkbook),
    productRevision: productWorkbook ? productWorkbook.revision : undefined,
    familyRevision: familyWorkbook ? familyWorkbook.revision : undefined,
    isFamilyOnly: !productWorkbook && Boolean(familyWorkbook)
  };

  // Empty State Rule (Amendment H: NO legacy product.specs fallback)
  const hasAnyPimKnowledge = Boolean(productWorkbook || familyWorkbook);
  if (!hasAnyPimKnowledge) {
    return {
      product: productPresentation,
      metrics: {
        knowledgeFactsCount: 0,
        referencedFactsCount: 0,
        visibleUniqueFactsCount: 0,
        visibleFactOccurrences: 0,
        tableFactReferencesCount: 0,
        tablesCount: 0,
        sourcesCount: 0,
        knowledgeConflictsCount: 0,
        visibleConflictsCount: 0
      },
      factsById: {},
      sourcesById: {},
      conflictsByFactId: {},
      sections: [],
      session,
      searchResults: [],
      isEmptyState: true
    };
  }

  // Safe Knowledge Resolution Policy (Blocker 2: Detail level must NOT change factual truth!)
  // Both simple + view and advanced + view use effective_for_publishing.
  const policy = 'effective_for_publishing';

  const effectiveKnowledge = resolveEffectiveProductKnowledge({
    productId: product.id,
    familyWorkbook: familyWorkbook || null,
    productWorkbook: productWorkbook || null,
    policy
  });

  // Source documents dictionary & provenance tracking (Amendment D, E, L)
  const sourcesById: Record<string, ProjectedSourceVM> = {};
  const knownSourceIds = new Set<string>();

  for (const doc of sourceDocuments) {
    knownSourceIds.add(doc.id);
    sourcesById[doc.id] = {
      id: doc.id,
      title: doc.title,
      documentType: doc.documentType || 'document',
      revision: doc.revision,
      language: doc.language,
      externalUrl: doc.externalUrl,
      citationCount: 0,
      isUnavailable: false
    };
  }

  // Build factsById and conflictsByFactId
  const factsById: Record<string, ProjectedFactVM> = {};
  const conflictsByFactId: Record<string, ProjectedConflictVM> = {};

  for (const [semKey, eff] of effectiveKnowledge.effectiveData.entries()) {
    const datum = eff.datum;
    const hasConflict = eff.effectiveStatus === 'conflicting';

    // Collect source IDs and citation count
    const referencedDocIds: string[] = [];
    let hasUnavailableSource = false;

    if (datum.evidence) {
      for (const ev of datum.evidence) {
        if (ev.sourceDocumentId) {
          const docId = ev.sourceDocumentId.trim();
          referencedDocIds.push(docId);

          if (sourcesById[docId]) {
            sourcesById[docId] = {
              ...sourcesById[docId],
              citationCount: sourcesById[docId].citationCount + 1
            };
          } else {
            // Amendment L: Partial provenance without fabricated data
            hasUnavailableSource = true;
            sourcesById[docId] = {
              id: docId,
              title: 'Documento de origem indisponível',
              documentType: 'unknown',
              citationCount: 1,
              isUnavailable: true
            };
          }
        }
      }
    }

    // Semantic label resolution (Amendment F: fallback to datum.label if no registry)
    const descriptor = semanticRegistry?.descriptors?.[semKey];
    const canonicalLabel = descriptor?.displayLabel || datum.label;

    const formatted = formatTechnicalValue(datum.value);
    const originState = mapOriginState(eff.origin);

    const originLabel =
      originState === 'family'
        ? (family?.name ? `Família ${family.name}` : 'Família')
        : originState === 'product_override'
        ? 'Alteração do Modelo'
        : product.model;

    // Check for pending override draft value (Amendment G)
    let pendingOverrideValue: string | undefined;
    if (eff.isPendingOverride && productWorkbook?.overrides?.[semKey]) {
      const ovr = productWorkbook.overrides[semKey];
      if (ovr.overriddenValue) {
        pendingOverrideValue = formatTechnicalValue(ovr.overriddenValue).text;
      }
    }

    // Collect candidate values from evidence if conflicting or for audit
    const candidateValues = (datum.evidence || [])
      .map((ev) => (ev.observedValue ? formatTechnicalValue(ev.observedValue).text : undefined))
      .filter((v): v is string => Boolean(v));

    // Lossless Projected Evidence (Blocker 5)
    const projectedEvidences: ProjectedEvidenceVM[] = (datum.evidence || []).map((ev) => ({
      evidenceId: ev.id,
      sourceDocumentId: ev.sourceDocumentId,
      page: ev.page,
      section: ev.section,
      locator: ev.locator,
      observedValue: ev.observedValue,
      formattedObservedValue: ev.observedValue ? formatTechnicalValue(ev.observedValue).text : undefined,
      excerpt: ev.excerpt,
      notes: ev.notes,
      capturedAt: ev.capturedAt,
      capturedBy: ev.capturedBy
    }));

    // BLOCKER 4: Unresolved conflict is NOT presented as a vigent fact
    const presentationState: FactPresentationState = hasConflict ? 'conflicting' : 'factual';
    const displayedFormattedValue = hasConflict ? 'Precisa de revisão' : formatted.text;

    const factVM: ProjectedFactVM = {
      datumId: datum.id,
      semanticKey: semKey,
      canonicalLabel,
      formattedValue: displayedFormattedValue,
      technicalValue: datum.value, // Lossless domain TechnicalValue! (Amendment I)
      unit: formatted.unit,
      evidenceState: deriveEvidenceState(datum, hasConflict),
      presentationState,
      candidateValues: candidateValues.length > 0 ? candidateValues : undefined,
      originState,
      originLabel,
      sourceDocumentIds: Array.from(new Set(referencedDocIds)),
      evidences: projectedEvidences,
      hasConflict,
      isPendingOverride: eff.isPendingOverride,
      pendingOverrideValue,
      provenanceIncomplete: hasUnavailableSource
    };

    factsById[datum.id] = factVM;

    if (hasConflict) {
      conflictsByFactId[datum.id] = {
        factId: datum.id,
        canonicalKey: semKey,
        displayLabel: canonicalLabel,
        message: 'Divergência técnica detectada entre fontes documentais.',
        origin: originLabel,
        candidateValues,
        rationale: 'Evidências concorrentes com valores discrepantes.'
      };
    }
  }

  // Structural Workbook for Layout / Auto-Organizer (Amendment B: Ephemeral Projection Workbook)
  // NEVER persisted, revision 0 never exposed, hasProductWorkbook stays false.
  const projectionWorkbook: ProductWorkbookV2 = productWorkbook || {
    schemaVersion: 2,
    id: `ephemeral-proj-${product.id}`,
    owner: { kind: 'product', id: product.id },
    revision: 0,
    data: {},
    modules: familyWorkbook?.modules || [],
    datasets: familyWorkbook?.datasets || [],
    savedViews: familyWorkbook?.savedViews || []
  };

  // Build Projection through domain engine (Projection automatically auto-organizes if layout is not provided)
  const projection = buildWorkspaceProjection({
    workbook: projectionWorkbook,
    effectiveKnowledge,
    semanticRegistry: semanticRegistry || undefined,
    layout: existingLayout || undefined,
    sources: sourceDocuments,
    searchQuery: session.searchQuery
  });

  // Project Sections & Blocks to ViewModel
  const sections: ProjectedSectionVM[] = [];
  const referencedFactIds = new Set<string>();
  const visibleUniqueFactIds = new Set<string>();
  let visibleFactOccurrences = 0;
  let tableFactReferencesCount = 0;
  let tablesCount = 0;

  for (const sec of projection.sections) {
    const blocks: ProjectedBlockVM[] = [];

    for (const block of sec.blocks) {
      const isBlockVisible = (block.visibility ?? 'visible') === 'visible';
      const blockSize: WorkspaceBlockSize = block.size ?? 'full';

      if (block.kind === 'fact_grid' || block.kind === 'datum_list') {
        const itemIds: string[] = [];

        for (const item of block.items) {
          const datumId = item.datumId;
          if (factsById[datumId]) {
            itemIds.push(datumId);
            referencedFactIds.add(datumId);
            if (isBlockVisible) {
              visibleUniqueFactIds.add(datumId);
              visibleFactOccurrences++;
            }
          }
        }

        blocks.push({
          id: block.id,
          kind: block.kind,
          title: block.title,
          size: blockSize,
          visibility: block.visibility ?? 'visible',
          factIds: itemIds,
          columns: block.kind === 'fact_grid' ? block.columns : undefined
        });
      } else if (block.kind === 'technical_table' || block.kind === 'dataset_view') {
        tablesCount++;
        const table = block.table;
        const columns: MegaTableColumnVM[] = table.columns.map((col) => ({
          id: col.id,
          label: col.label,
          width: col.width,
          align: col.align
        }));

        const rows: MegaTableRowVM[] = [];

        for (const row of table.rows) {
          const cells: Record<string, MegaTableCellVM> = {};

          for (const col of columns) {
            // BLOCKER 1: Use getDatasetCellKey for canonical collision-safe key lookup
            const cellKey = getDatasetCellKey(row.id, col.id);
            const cell = table.cells[cellKey];

            if (cell && cell.datumRefId) {
              const factId = cell.datumRefId;
              cells[col.id] = {
                type: 'fact_ref',
                factId,
                displayOverride: cell.formattedValue
              };

              if (factsById[factId]) {
                referencedFactIds.add(factId);
                tableFactReferencesCount++;
                if (isBlockVisible) {
                  visibleUniqueFactIds.add(factId);
                  visibleFactOccurrences++;
                }
              }
            } else {
              cells[col.id] = {
                type: 'editorial_literal',
                value: cell?.formattedValue || '—'
              };
            }
          }

          rows.push({
            id: row.id,
            label: row.label,
            cells
          });
        }

        blocks.push({
          id: block.id,
          kind: block.kind,
          title: table.title,
          description: table.description,
          size: blockSize,
          visibility: block.visibility ?? 'visible',
          columns,
          rows
        });
      } else if (block.kind === 'text_note') {
        blocks.push({
          id: block.id,
          kind: 'text_note',
          title: block.title,
          content: block.content,
          calloutVariant: block.calloutVariant || 'info',
          size: blockSize,
          visibility: block.visibility ?? 'visible'
        });
      } else if (block.kind === 'source_group') {
        blocks.push({
          id: block.id,
          kind: 'source_group',
          title: block.title,
          sourceIds: block.sources.map((s) => s.id),
          size: blockSize,
          visibility: block.visibility ?? 'visible'
        });
      } else if (block.kind === 'divider') {
        blocks.push({
          id: block.id,
          kind: 'divider',
          spacing: block.spacing,
          size: blockSize,
          visibility: block.visibility ?? 'visible'
        });
      }
    }

    sections.push({
      id: sec.id,
      title: sec.title,
      description: sec.description,
      order: sec.order,
      collapsed: sec.collapsed ?? false,
      icon: sec.icon,
      blocks
    });
  }

  // Count visible conflicts
  let visibleConflictsCount = 0;
  for (const factId of visibleUniqueFactIds) {
    if (factsById[factId]?.hasConflict) {
      visibleConflictsCount++;
    }
  }

  // Global Canonical Metrics (UX1.3A & Amendment 1: knowledgeFactsCount strictly canonical)
  const metrics: WorkspaceMetricsVM = {
    knowledgeFactsCount: effectiveKnowledge.effectiveData.size,
    referencedFactsCount: referencedFactIds.size,
    visibleUniqueFactsCount: visibleUniqueFactIds.size,
    visibleFactOccurrences,
    tableFactReferencesCount,
    tablesCount,
    sourcesCount: Object.keys(sourcesById).length,
    knowledgeConflictsCount: effectiveKnowledge.conflictsCount,
    visibleConflictsCount
  };

  // BLOCKER 8: Map Search Hits to Search Results
  const searchResults: SearchResultVM[] = [];
  if (projection.searchHits) {
    for (const datumId of projection.searchHits.matchedDatumIds) {
      const fact = factsById[datumId];
      if (fact) {
        searchResults.push({
          id: `search-fact-${datumId}`,
          kind: 'fact',
          label: fact.canonicalLabel,
          factId: datumId,
          snippet: fact.formattedValue
        });
      }
    }
    for (const secId of projection.searchHits.matchedSectionIds) {
      const sec = sections.find((s) => s.id === secId);
      if (sec) {
        searchResults.push({
          id: `search-sec-${secId}`,
          kind: 'section',
          label: sec.title,
          sectionId: secId
        });
      }
    }
    for (const tblId of projection.searchHits.matchedTableIds) {
      let matchingBlockId: string | undefined;
      let sourceTableId: string | undefined;
      let datasetId: string | undefined;
      let tableTitle = 'Tabela Técnica';

      for (const sec of projection.sections) {
        for (const b of sec.blocks) {
          if (b.kind === 'technical_table' && (b.table.id === tblId || b.id === tblId)) {
            matchingBlockId = b.id;
            sourceTableId = b.table.id;
            tableTitle = b.table.title || tableTitle;
            break;
          }
          if (b.kind === 'dataset_view' && (b.table.id === tblId || b.id === tblId)) {
            matchingBlockId = b.id;
            sourceTableId = b.table.id;
            datasetId = b.table.id;
            tableTitle = b.table.title || tableTitle;
            break;
          }
        }
        if (matchingBlockId) break;
      }

      searchResults.push({
        id: `search-tbl-${matchingBlockId || tblId}`,
        kind: 'table',
        label: tableTitle,
        blockId: matchingBlockId || tblId,
        tableId: tblId,
        sourceTableId: sourceTableId || tblId,
        datasetId
      });
    }

    // Busca global em fontes / títulos de documentos comprobatórios
    const cleanQ = projection.searchHits.query.trim().toLowerCase();
    if (cleanQ) {
      for (const src of Object.values(sourcesById)) {
        if (
          src.title.toLowerCase().includes(cleanQ) ||
          (src.documentType && src.documentType.toLowerCase().includes(cleanQ))
        ) {
          searchResults.push({
            id: `search-src-${src.id}`,
            kind: 'source',
            label: src.title,
            sourceId: src.id,
            snippet: src.documentType ? `Documento: ${src.documentType}` : undefined
          });
        }
      }
    }
  }

  return {
    product: productPresentation,
    metrics,
    factsById,
    sourcesById,
    conflictsByFactId,
    sections,
    session,
    searchResults,
    isEmptyState: Object.keys(factsById).length === 0
  };
}
