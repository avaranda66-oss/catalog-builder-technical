// src/domain/product-workspace/types.ts
// Pure domain types for Mega Product Workspace & Human-First Information Architecture (PIM.MEGA.WORKSPACE.FOUNDATION1A).
// Strictly decoupled from presentation frameworks, UI libraries, databases, and document layout.
// Separates DATA TRUTH (ProductWorkbookV2) from HUMAN PRESENTATION (WorkspaceLayoutV1 & WorkspaceProjection).
// Zero explicit any.

import {
  TechnicalValue,
  EffectiveDatumStatus,
  DatumOrigin,
  Evidence,
  CanonicalDecision,
  WorkbookOwner,
  UnitCode,
  SourceDocumentType
} from '../product-workbook/types';
import { CatalogCellBinding } from '../catalog.schema';

/**
 * Visual inspection mode for the Mega Workspace.
 * - 'simple': Focused on humans, clear technical specifications, tables, subtle origin indicators, no UUIDs or software jargon.
 * - 'advanced': Exposes canonical keys, internal IDs, revision counters, raw provenance, CAS and governance details.
 */
export type WorkspaceMode = 'simple' | 'advanced';

// ============================================================================
// 1. SEMANTIC IDENTITY CONTRACT (MACHINE vs HUMAN vs AI)
// ============================================================================

/**
 * Desritor semântico desacoplado.
 * Permite que humanos editem o label de exibição e sinônimos (aliases)
 * sem violar nem corromper a canonicalKey estável exigida por integrações e IA.
 */
export interface SemanticDescriptor {
  /** Chave canônica estável (Machine & AI Identity) - segue SEMANTIC_KEY_REGEX */
  readonly canonicalKey: string;
  /** Label amigável de exibição (Human Presentation) - editável livremente */
  readonly displayLabel: string;
  /** Sinônimos, termos alternativos e variações de busca para IA */
  readonly aliases: readonly string[];
  /** Descrição opcional para contexto semântico da IA */
  readonly description?: string;
  /** Labels localizados opcionais (BCP-47 -> label) */
  readonly localeLabels?: Readonly<Record<string, string>>;
  /** Sinônimos depreciados mantidos para retrocompatibilidade em lookups */
  readonly deprecatedAliases?: readonly string[];
}

/**
 * Registro de auditoria para planejamento de renomeação de chave canônica.
 */
export interface RenameStepAudit {
  readonly plannedAt: string;
  readonly plannedBy?: string;
  readonly rationale: string;
}

/**
 * Nó individual de referência semântica rastreado no grafo de impacto.
 */
export interface SemanticReferenceNode {
  readonly locationType:
    | 'technical_datum'
    | 'technical_dataset'
    | 'dataset_column'
    | 'saved_view_datum_keys'
    | 'saved_view_ordering'
    | 'product_override_target'
    | 'dataset_override_target'
    | 'family_datum_reference'
    | 'inherited_resolution'
    | 'catalog_cell_binding'
    | 'knowledge_picker_consumer'
    | 'knowledge_snapshot_consumer'
    | 'search_index_consumer';
  readonly containerId: string;
  readonly containerLabel?: string;
  readonly path: string;
  readonly isExternal: boolean;
}

/**
 * Grafo completo de referências semânticas para cálculo exato de blast radius.
 * Separa explicitamente referências internas comprovadas de referências externas.
 */
export interface SemanticReferenceGraph {
  readonly canonicalKey: string;
  readonly internalReferences: readonly SemanticReferenceNode[];
  readonly externalReferences: {
    readonly status: 'KNOWN' | 'UNKNOWN' | 'REQUIRES_INDEX';
    readonly items: readonly SemanticReferenceNode[];
    readonly warning?: string;
  };
  readonly totalReferenceCount: number;
  readonly hasExternalUncertainty: boolean;
}

/**
 * Plano estrito de renomeação controlada de uma canonicalKey.
 * Garante que nenhuma chave seja alterada sem plano formal com checagem de colisão,
 * preservação da chave antiga como alias, integridade referencial e suporte a rollback.
 */
export interface CanonicalRenamePlan {
  readonly oldCanonicalKey: string;
  readonly newCanonicalKey: string;
  readonly referenceGraph: SemanticReferenceGraph;
  readonly affectedDatumIds: readonly string[];
  readonly affectedDatasetIds: readonly string[];
  readonly affectedSavedViewIds: readonly string[];
  readonly affectedTableBindingIds: readonly string[];
  readonly aliasPreserved: boolean;
  readonly collisionCheck: {
    readonly hasCollision: boolean;
    readonly conflictingTarget?: string;
  };
  readonly rollbackPlan: {
    readonly canRollback: boolean;
    readonly instructions: string;
  };
  readonly auditEntry: RenameStepAudit;
  readonly isValid: boolean;
  readonly validationErrors: readonly string[];
  /** BLOCKER 4/5: O plano só é executável se não houver colisão, erros e NENHUMA incerteza em referências externas */
  readonly isExecutable: boolean;
}

// ============================================================================
// 2. MEGA TABLE & CELL CONTRACTS
// ============================================================================

/**
 * Tipo discriminado para células de uma tabela do workspace.
 * Invariante fundamental: Células referenciam TechnicalDatums ou Datasets por ID.
 * Células literais editoriais NÃO viram TechnicalDatum silenciosamente.
 */
export type WorkspaceTableCellDef =
  | {
      readonly type: 'datum_ref';
      readonly datumId: string;
    }
  | {
      readonly type: 'dataset_cell_ref';
      readonly datasetId: string;
      readonly rowId: string;
      readonly columnId: string;
    }
  | {
      readonly type: 'editorial_literal';
      readonly value: string;
      readonly notes?: string;
    };

export interface WorkspaceTableColumnDef {
  readonly id: string;
  readonly label: string;
  readonly headerType?: 'text' | 'quantity' | 'status';
  readonly unit?: UnitCode;
  readonly width?: string;
  readonly align?: 'left' | 'center' | 'right';
}

export interface WorkspaceTableRowDef {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly order: number;
}

/**
 * Definição independente de Mega Tabela no Workspace.
 * Desacoplada do Table Core editorial de publicação em catálogo.
 */
export interface WorkspaceTechnicalTableDef {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly columns: readonly WorkspaceTableColumnDef[];
  readonly rows: readonly WorkspaceTableRowDef[];
  /** Células indexadas por `getDatasetCellKey(rowId, columnId)` */
  readonly cells: Readonly<Record<string, WorkspaceTableCellDef>>;
  readonly metadata?: Readonly<Record<string, string>>;
}

// ============================================================================
// 3. WORKSPACE LAYOUT V1 (HUMAN CUSTOMIZABLE STRUCTURE)
// ============================================================================

export type WorkspaceBlockKind =
  | 'fact_grid'
  | 'datum_list'
  | 'technical_table'
  | 'dataset_view'
  | 'text_note'
  | 'source_group'
  | 'divider';

export type WorkspaceBlockSize = 'small' | 'medium' | 'large' | 'full';
export type WorkspaceBlockVisibility = 'visible' | 'hidden';

export interface BaseWorkspaceBlockDef {
  readonly id: string;
  readonly kind: WorkspaceBlockKind;
  readonly size?: WorkspaceBlockSize;
  readonly visibility?: WorkspaceBlockVisibility;
}

export interface FactGridBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'fact_grid';
  readonly title?: string;
  readonly datumIds: readonly string[];
  readonly columns?: 2 | 3 | 4;
}

export interface DatumListBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'datum_list';
  readonly title?: string;
  readonly datumIds: readonly string[];
}

export interface TechnicalTableBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'technical_table';
  readonly tableDef: WorkspaceTechnicalTableDef;
}

export interface DatasetViewBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'dataset_view';
  readonly datasetId: string;
  readonly customTitle?: string;
  readonly visibleColumnIds?: readonly string[];
}

export interface TextNoteBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'text_note';
  readonly title?: string;
  readonly content: string;
  readonly calloutVariant?: 'info' | 'warning' | 'tip' | 'editorial';
}

export interface SourceGroupBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'source_group';
  readonly title?: string;
  readonly sourceDocumentIds: readonly string[];
}

export interface DividerBlockDef extends BaseWorkspaceBlockDef {
  readonly kind: 'divider';
  readonly spacing?: 'small' | 'medium' | 'large';
}

export type WorkspaceBlockDef =
  | FactGridBlockDef
  | DatumListBlockDef
  | TechnicalTableBlockDef
  | DatasetViewBlockDef
  | TextNoteBlockDef
  | SourceGroupBlockDef
  | DividerBlockDef;

export interface WorkspaceSectionDef {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly blockIds: readonly string[];
  readonly order: number;
  readonly collapsed?: boolean;
  readonly icon?: string;
}

/**
 * Override de apresentação visual específico deste layout.
 * Não altera a semântica canônica do produto.
 */
export interface WorkspaceDisplayOverride {
  readonly customLabel?: string;
  readonly customDescription?: string;
}

/**
 * Registro Canônico de Semântica do Produto / Família (V1).
 * Entidade soberana que armazena aliases para IA, descrições contextuais e labels canônicos.
 * Totalmente desacoplada dos layouts visuais pessoais de cada usuário.
 * Suporta owner de família ou produto e controle estrito de versão com revision positiva.
 */
export interface SemanticRegistryV1 {
  readonly schemaVersion: 1;
  readonly owner: WorkbookOwner;
  readonly revision: number; // positive integer (>= 1, autoridade CAS/versão do registro)
  readonly descriptors: Readonly<Record<string, SemanticDescriptor>>; // Keyed by canonicalKey
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export type ProductSemanticRegistry = SemanticRegistryV1;

/**
 * Descritor semântico efetivo resolvido após herança de família.
 */
export interface EffectiveSemanticDescriptor {
  readonly descriptor: SemanticDescriptor;
  readonly origin: 'family' | 'product_override' | 'product_local';
  readonly isInherited: boolean;
}

/**
 * Registro Semântico Efetivo resolvido para consumo de IA e Apresentação.
 */
export interface EffectiveSemanticRegistry {
  readonly owner: WorkbookOwner;
  readonly familyRevision?: number;
  readonly productRevision?: number;
  readonly descriptors: Readonly<Record<string, SemanticDescriptor>>; // Keyed by canonicalKey
  readonly effectiveDescriptors: ReadonlyMap<string, EffectiveSemanticDescriptor>;
}

/**
 * Códigos de erro específicos de integridade do Registro Semântico.
 * Separados estritamente dos erros de layout/referência do Workspace (Emenda A).
 */
export type SemanticRegistryErrorCode =
  | 'DESCRIPTOR_KEY_MISMATCH'
  | 'ALIAS_CANONICAL_COLLISION'
  | 'ALIAS_ALIAS_COLLISION'
  | 'DEPRECATED_ALIAS_CANONICAL_COLLISION'
  | 'INVALID_CANONICAL_KEY'
  | 'EMPTY_DISPLAY_LABEL';

export interface SemanticRegistryValidationError {
  readonly code: SemanticRegistryErrorCode;
  readonly message: string;
  readonly canonicalKey: string;
  readonly alias?: string;
}

export interface SemanticRegistryValidationReport {
  readonly isValid: boolean;
  readonly errors: readonly SemanticRegistryValidationError[];
}

export class SemanticRegistryValidationException extends Error {
  public readonly report: SemanticRegistryValidationReport;
  constructor(report: SemanticRegistryValidationReport) {
    super(
      `Validação do registro semântico falhou com ${report.errors.length} erro(s): ${report.errors.map((e) => e.message).join('; ')}`
    );
    this.name = 'SemanticRegistryValidationException';
    this.report = report;
  }
}

/**
 * Localizador contextualizado de referências de bindings em catálogos editoriais externos.
 */
export interface ExternalCatalogBindingReference {
  readonly catalogId: string;
  readonly pageId: string;
  readonly blockId: string;
  readonly rowId?: string;
  readonly cellKey?: string;
  readonly binding: CatalogCellBinding;
}

/**
 * Erro de integridade de referência do Workspace contra o ProductWorkbook.
 */
export interface WorkspaceValidationError {
  readonly code:
    | 'DATUM_NOT_FOUND'
    | 'DATASET_NOT_FOUND'
    | 'DATASET_ROW_NOT_FOUND'
    | 'DATASET_COLUMN_NOT_FOUND'
    | 'DATASET_CELL_NOT_FOUND'
    | 'TABLE_CELL_KEY_INVALID'
    | 'SOURCE_DOCUMENT_NOT_FOUND'
    | 'SOURCE_CONTEXT_UNAVAILABLE';
  readonly message: string;
  readonly path: string;
  readonly entityId: string;
}

/**
 * Relatório de validação referencial do Workspace Layout contra o Conhecimento do Produto.
 */
export interface WorkspaceValidationReport {
  readonly isValid: boolean;
  readonly errors: readonly WorkspaceValidationError[];
}

/**
 * Layout customizável do Workspace de Produto (V1).
 * Não armazena cópias de valores técnicos; apenas organiza a projeção de referências.
 * Possui ciclo de vida e revisão completamente separados da verdade técnica do ProductWorkbook.
 */
export interface WorkspaceLayoutV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly productId: string;
  readonly revision: number; // positive integer (>= 1, autoridade de CAS e apresentação)
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly title: string;
  readonly description?: string;
  readonly sections: readonly WorkspaceSectionDef[];
  readonly blocks: Readonly<Record<string, WorkspaceBlockDef>>;
  readonly displayOverrides?: Readonly<Record<string, WorkspaceDisplayOverride>>; // Keyed by canonicalKey
  readonly semanticDescriptors?: Readonly<Record<string, SemanticDescriptor>>; // Keyed by canonicalKey (fallback / compatibilidade)
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Patch explícito e tipado para alterações estagiadas de layout (1:1 com TypeScript e Zod).
 */
export interface WorkspaceLayoutPatch {
  readonly title?: string;
  readonly description?: string;
  readonly sections?: readonly WorkspaceSectionDef[];
  readonly blocks?: Readonly<Record<string, WorkspaceBlockDef>>;
  readonly displayOverrides?: Readonly<Record<string, WorkspaceDisplayOverride>>;
  readonly metadata?: Readonly<Record<string, string>>;
}

// ============================================================================
// 4. TECHNICAL DATA EDITING STAGING CONTRACT
// ============================================================================

export interface DatumChangeDraft {
  readonly datumId: string;
  readonly semanticKey: string;
  readonly oldValue: TechnicalValue;
  readonly newValue: TechnicalValue;
  readonly reason?: string;
  readonly evidence?: readonly Evidence[];
  readonly stagedAt: string;
}

export interface WorkspaceEditDraft {
  readonly productId: string;
  readonly stagedDatumChanges: Readonly<Record<string, DatumChangeDraft>>;
  readonly stagedLayoutChanges?: WorkspaceLayoutPatch;
}

// ============================================================================
// 5. WORKSPACE PROJECTION (UI CONSUMPTION MODEL)
// ============================================================================

export interface ProjectedFactItem {
  readonly datumId: string;
  readonly canonicalSemanticKey: string;
  readonly displayLabel: string;
  readonly aliases: readonly string[];
  readonly formattedValue: string;
  readonly rawTypedValue: TechnicalValue;
  readonly unit?: string;
  readonly origin: DatumOrigin;
  readonly status: EffectiveDatumStatus;
  readonly hasConflict: boolean;
  readonly conflictReason?: string;
  readonly sourcesCount: number;
  readonly topSourceSummary?: string;
  readonly isOverride: boolean;
  readonly isPendingOverride?: boolean;
}

export interface ProjectedTableCell {
  readonly rowId: string;
  readonly columnId: string;
  readonly cellType: WorkspaceTableCellDef['type'];
  readonly formattedValue: string;
  readonly rawValue?: TechnicalValue;
  readonly datumRefId?: string;
  readonly status?: EffectiveDatumStatus;
  readonly hasConflict?: boolean;
  readonly isEditorialOnly: boolean;
}

export interface ProjectedTable {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly columns: readonly WorkspaceTableColumnDef[];
  readonly rows: readonly WorkspaceTableRowDef[];
  readonly cells: Readonly<Record<string, ProjectedTableCell>>;
  readonly isFromDataset: boolean;
  readonly sourceDatasetId?: string;
}

export interface ProjectedSourceItem {
  readonly id: string;
  readonly title: string;
  readonly documentType: SourceDocumentType | string;
  readonly revision?: string;
  readonly language?: string;
  readonly externalUrl?: string;
  readonly citationCount: number;
}

export type ProjectedBlock =
  | {
      readonly id: string;
      readonly kind: 'fact_grid';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly title?: string;
      readonly items: readonly ProjectedFactItem[];
      readonly columns: number;
    }
  | {
      readonly id: string;
      readonly kind: 'datum_list';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly title?: string;
      readonly items: readonly ProjectedFactItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'technical_table';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly table: ProjectedTable;
    }
  | {
      readonly id: string;
      readonly kind: 'dataset_view';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly table: ProjectedTable;
    }
  | {
      readonly id: string;
      readonly kind: 'text_note';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly title?: string;
      readonly content: string;
      readonly calloutVariant: 'info' | 'warning' | 'tip' | 'editorial';
    }
  | {
      readonly id: string;
      readonly kind: 'source_group';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly title?: string;
      readonly sources: readonly ProjectedSourceItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'divider';
      readonly size?: WorkspaceBlockSize;
      readonly visibility?: WorkspaceBlockVisibility;
      readonly spacing: 'small' | 'medium' | 'large';
    };

export interface ProjectedSection {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly collapsed: boolean;
  readonly icon?: string;
  readonly blocks: readonly ProjectedBlock[];
}

export interface WorkspaceStats {
  readonly totalDatums: number;
  readonly localDatums: number;
  readonly inheritedDatums: number;
  readonly overrides: number;
  readonly conflicts: number;
  readonly tablesCount: number;
  readonly sourcesCount: number;
}

export interface WorkspaceProjection {
  readonly productId: string;
  readonly title: string;
  readonly mode: WorkspaceMode;
  readonly summaryFacts: readonly ProjectedFactItem[];
  readonly sections: readonly ProjectedSection[];
  readonly stats: WorkspaceStats;
  readonly searchHits?: {
    readonly query: string;
    readonly matchedDatumIds: readonly string[];
    readonly matchedSectionIds: readonly string[];
    readonly matchedTableIds: readonly string[];
  };
}

// ============================================================================
// 6. SOURCE TRACEABILITY (HUMAN PROVENANCE DRAWER)
// ============================================================================

export interface HumanProvenanceItem {
  readonly sourceTitle: string;
  readonly documentType: string;
  readonly revision?: string;
  readonly page?: string | number;
  readonly section?: string;
  readonly locator?: string;
  readonly observedValueText?: string;
  readonly excerpt?: string;
  readonly capturedAt?: string;
  readonly capturedBy?: string;
  readonly isConsensus: boolean;
}

export interface ProjectedSourceTrace {
  readonly datumId: string;
  readonly displayLabel: string;
  readonly canonicalKey: string;
  readonly currentValueFormatted: string;
  readonly originText: string; // Ex: "Família TA" ou "Calibrador TA-25N"
  readonly hasConflict: boolean;
  readonly conflictMessage?: string;
  readonly canonicalDecisionRationale?: string;
  readonly items: readonly HumanProvenanceItem[];
  readonly hasEvidence: boolean;
}

// ============================================================================
// 7. AI PRODUCT KNOWLEDGE ENVELOPE (SAFE UNAMBIGUOUS AI EXTRACTION)
// ============================================================================

export interface AiProvenanceRecord {
  readonly evidenceId: string;
  readonly sourceDocumentId: string;
  readonly sourceTitle: string;
  readonly revision?: string;
  readonly page?: string | number;
  readonly section?: string;
  readonly locator?: string;
  readonly observedValue?: TechnicalValue;
  readonly excerpt?: string;
}

export interface AiDatumEnvelope {
  readonly datumId: string;
  readonly canonicalSemanticKey: string;
  readonly displayLabel: string;
  readonly aliases: readonly string[];
  readonly typedValue: TechnicalValue;
  readonly formattedValue: string;
  readonly unit?: string;
  readonly status: EffectiveDatumStatus;
  readonly owner: WorkbookOwner;
  readonly sourceOwner: 'product' | 'family';
  readonly moduleMemberships: readonly {
    readonly moduleId: string;
    readonly moduleKey: string;
    readonly moduleLabel: string;
  }[];
  readonly datasetMemberships: readonly {
    readonly datasetId: string;
    readonly datasetKey: string;
    readonly rowId: string;
    readonly columnId: string;
  }[];
  readonly evidenceReferences: readonly AiProvenanceRecord[];
  readonly sourceDocuments: readonly {
    readonly id: string;
    readonly title: string;
    readonly revision?: string;
    readonly type: string;
  }[];
  readonly canonicalDecision?: CanonicalDecision;
  readonly inheritanceProvenance: {
    readonly origin: DatumOrigin;
    readonly isOverride: boolean;
    readonly familyDatumId?: string;
  };
  readonly hasProvenance: boolean;
}

/**
 * Propósito semântico de consumo do envelope de conhecimento de IA.
 * - 'factual_answer': Modo padrão seguro. Exclui drafts, deprecated e conflitos sem resolução canônica.
 * - 'review': Permite inspecionar candidatos a revisão (drafts) em campo explicitamente separado (reviewCandidates).
 * - 'engineering': Modo de auditoria profunda. Expõe status completos de engenharia sem consenso forçado.
 */
export type AiKnowledgePurpose = 'factual_answer' | 'review' | 'engineering';

export interface AiConflictCandidate {
  readonly evidenceId: string;
  readonly sourceTitle: string;
  readonly revision?: string;
  readonly page?: string | number;
  readonly section?: string;
  readonly observedValue?: TechnicalValue;
  readonly excerpt?: string;
}

export interface AiConflictRecord {
  readonly datumId: string;
  readonly canonicalSemanticKey: string;
  readonly displayLabel: string;
  readonly status: 'conflicting';
  readonly candidates: readonly AiConflictCandidate[];
  readonly rationale?: string;
  readonly origin: DatumOrigin;
}

export interface AiExcludedSummary {
  readonly totalExcluded: number;
  readonly draftsCount: number;
  readonly deprecatedCount: number;
  readonly conflictingCount: number;
  readonly reason: string;
}

export interface AiProductKnowledgeEnvelope {
  readonly productId: string;
  readonly productRevision?: number;
  readonly familyId?: string;
  readonly purpose: AiKnowledgePurpose;
  readonly generatedAt: string;
  /** Facts seguros e aprovados para respostas factuais diretas da IA */
  readonly facts: readonly AiDatumEnvelope[];
  /** Conflitos de fontes não resolvidos (candidatos e evidências divergentes, nunca em facts) */
  readonly conflicts: readonly AiConflictRecord[];
  /** Candidatos de revisão (apenas preenchido se purpose === 'review' ou 'engineering', nunca em facts) */
  readonly reviewCandidates?: readonly AiDatumEnvelope[];
  /** Sumário formal de fatos excluídos para proteção contra alucinações */
  readonly excludedSummary: AiExcludedSummary;
  /** Documentos de fonte consultados */
  readonly sources: readonly {
    readonly id: string;
    readonly title: string;
    readonly revision?: string;
    readonly type: string;
  }[];
  readonly metadata?: Readonly<Record<string, string>>;
  /** Alias para retrocompatibilidade com consumidores legados de items */
  readonly items: readonly AiDatumEnvelope[];
  readonly summary: {
    readonly totalFacts: number;
    readonly verifiedOrApprovedFacts: number;
    readonly draftOrConflictingFacts: number;
    readonly factsWithProvenance: number;
    readonly factsWithoutProvenance: number;
  };
}
