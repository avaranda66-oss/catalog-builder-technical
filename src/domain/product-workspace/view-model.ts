// src/domain/product-workspace/view-model.ts
// Pure Production ViewModel & Adapter for Mega Product Workspace (PIM.MEGA.WORKSPACE.INTEGRATION1).
// Guarantees:
// 1. Zero Second Truth: factsById is the single canonical map for all facts on screen.
// 2. Reuse domain TechnicalValue directly (Amendment I).
// 3. Family-only product remains truly family-only (Amendment B: hasProductWorkbook=false, productRevision=undefined).
// 4. Simple view uses safe publishing policy (Amendment G: protects verified family truth from draft override).
// 5. Zero legacy product.specs fallback (Amendment H).
// 6. Explicit product field mapping (Amendment J: model -> displayName, code -> code, family.name -> familyLabel).
// 7. Partial provenance fail-soft (Amendment L: missing source marked unavailable without fabricating data).
// 8. Zero explicit any.

import {
  ProductWorkbookV2,
  ResolvedProductKnowledge,
  TechnicalDatum,
  TechnicalValue,
  SourceDocument,
  DatumOrigin
} from '../product-workbook/types';
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

export type EvidenceState = 'no_source' | 'single_source' | 'multiple_agreeing' | 'conflicting_sources';

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
  readonly originState: 'product_local' | 'family' | 'product_override';
  readonly originLabel: string;
  readonly sourceDocumentIds: readonly string[];
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

export interface MegaWorkspaceViewModel {
  readonly product: ProductPresentationVM;
  readonly metrics: WorkspaceMetricsVM;
  readonly factsById: Readonly<Record<string, ProjectedFactVM>>;
  readonly sourcesById: Readonly<Record<string, ProjectedSourceVM>>;
  readonly conflictsByFactId: Readonly<Record<string, ProjectedConflictVM>>;
  readonly sections: readonly ProjectedSectionVM[];
  readonly session: WorkspaceSessionVM;
  readonly isEmptyState: boolean;
}

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Coleta todos os IDs únicos de SourceDocument diretamente referenciados
 * pelas evidências dos fatos resolvidos (Emenda D).
 * Evita chamadas cegas a listSourceDocuments() sem filtro.
 */
export function collectReferencedSourceDocumentIds(
  effectiveKnowledge: ResolvedProductKnowledge
): readonly string[] {
  const ids = new Set<string>();
  for (const entry of effectiveKnowledge.effectiveData.values()) {
    if (entry.datum.evidence) {
      for (const ev of entry.datum.evidence) {
        if (ev.sourceDocumentId && ev.sourceDocumentId.trim()) {
          ids.add(ev.sourceDocumentId.trim());
        }
      }
    }
  }
  return Array.from(ids);
}

function deriveEvidenceState(datum: TechnicalDatum, hasConflict: boolean): EvidenceState {
  if (hasConflict) return 'conflicting_sources';
  const count = datum.evidence ? datum.evidence.length : 0;
  if (count === 0) return 'no_source';
  if (count === 1) return 'single_source';
  return 'multiple_agreeing';
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
      isEmptyState: true
    };
  }

  // Safe Knowledge Resolution Policy (Amendment G: Simple view uses effective_for_publishing)
  const policy =
    session.detailLevel === 'simple' && session.interactionMode === 'view'
      ? 'effective_for_publishing'
      : 'effective_for_editing';

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

    const factVM: ProjectedFactVM = {
      datumId: datum.id,
      semanticKey: semKey,
      canonicalLabel,
      formattedValue: formatted.text,
      technicalValue: datum.value, // Lossless domain TechnicalValue! (Amendment I)
      unit: formatted.unit,
      evidenceState: deriveEvidenceState(datum, hasConflict),
      originState,
      originLabel,
      sourceDocumentIds: Array.from(new Set(referencedDocIds)),
      hasConflict,
      isPendingOverride: eff.isPendingOverride,
      pendingOverrideValue,
      provenanceIncomplete: hasUnavailableSource
    };

    factsById[datum.id] = factVM;

    if (hasConflict) {
      const candidateValues = (datum.evidence || [])
        .map((ev) => (ev.observedValue ? formatTechnicalValue(ev.observedValue).text : undefined))
        .filter((v): v is string => Boolean(v));

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
            const cellKey = `${row.id}:${col.id}`;
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

  return {
    product: productPresentation,
    metrics,
    factsById,
    sourcesById,
    conflictsByFactId,
    sections,
    session,
    isEmptyState: Object.keys(factsById).length === 0
  };
}
