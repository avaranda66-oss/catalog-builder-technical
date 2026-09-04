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
 * Plano estrito de renomeação controlada de uma canonicalKey.
 * Garante que nenhuma chave seja alterada sem plano formal com checagem de colisão,
 * preservação da chave antiga como alias, integridade referencial e suporte a rollback.
 */
export interface CanonicalRenamePlan {
  readonly oldCanonicalKey: string;
  readonly newCanonicalKey: string;
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

export interface BaseWorkspaceBlockDef {
  readonly id: string;
  readonly kind: WorkspaceBlockKind;
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
 * Layout customizável do Workspace de Produto (V1).
 * Não armazena cópias de valores técnicos; apenas organiza a projeção de referências.
 */
export interface WorkspaceLayoutV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly productId: string;
  readonly title: string;
  readonly description?: string;
  readonly sections: readonly WorkspaceSectionDef[];
  readonly blocks: Readonly<Record<string, WorkspaceBlockDef>>;
  readonly semanticDescriptors?: Readonly<Record<string, SemanticDescriptor>>; // Keyed by canonicalKey
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
  readonly stagedLayoutChanges?: Partial<WorkspaceLayoutV1>;
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
      readonly title?: string;
      readonly items: readonly ProjectedFactItem[];
      readonly columns: number;
    }
  | {
      readonly id: string;
      readonly kind: 'datum_list';
      readonly title?: string;
      readonly items: readonly ProjectedFactItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'technical_table';
      readonly table: ProjectedTable;
    }
  | {
      readonly id: string;
      readonly kind: 'dataset_view';
      readonly table: ProjectedTable;
    }
  | {
      readonly id: string;
      readonly kind: 'text_note';
      readonly title?: string;
      readonly content: string;
      readonly calloutVariant: 'info' | 'warning' | 'tip' | 'editorial';
    }
  | {
      readonly id: string;
      readonly kind: 'source_group';
      readonly title?: string;
      readonly sources: readonly ProjectedSourceItem[];
    }
  | {
      readonly id: string;
      readonly kind: 'divider';
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

export interface AiProductKnowledgeEnvelope {
  readonly productId: string;
  readonly productRevision?: number;
  readonly familyId?: string;
  readonly generatedAt: string;
  readonly items: readonly AiDatumEnvelope[];
  readonly summary: {
    readonly totalFacts: number;
    readonly verifiedOrApprovedFacts: number;
    readonly draftOrConflictingFacts: number;
    readonly factsWithProvenance: number;
    readonly factsWithoutProvenance: number;
  };
}
