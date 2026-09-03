// src/domain/product-workbook/types.ts
// Pure domain types for Product Workbook / Technical Knowledge Engine (PIM.W1).
// Strictly decoupled from presentation, UI, databases, and document layout.
// Zero dependencies on React, Supabase, Zustand or CSS.
// Zero explicit any.

/**
 * Validated Technical Unit Codes (Engineering & SI units).
 * Note: Intentionally extensible via `(string & {})` for domain-specific engineering units,
 * while runtime `UnitCodeSchema` serves as the authoritative security and syntax gate.
 */
export type UnitCode =
  | '°C'
  | '°F'
  | 'K'
  | 'bar'
  | 'mbar'
  | 'Pa'
  | 'kPa'
  | 'MPa'
  | 'psi'
  | 'mA'
  | 'A'
  | 'V'
  | 'mV'
  | 'kV'
  | 'Ω'
  | 'kΩ'
  | 'MΩ'
  | 'W'
  | 'kW'
  | 'mm'
  | 'cm'
  | 'm'
  | 'in'
  | 'kg'
  | 'g'
  | 's'
  | 'ms'
  | 'min'
  | 'h'
  | 'Hz'
  | 'kHz'
  | 'MHz'
  | '%'
  | 'ppm'
  | 'dB'
  | (string & {});

/**
 * Qualifier for quantity assertions.
 */
export type QuantityQualifier = 'exact' | 'approx' | 'min' | 'max' | 'nominal' | 'typical';

/**
 * Discriminated union of typed technical values.
 * Strictly prevents raw untyped strings for structured engineering facts.
 */
export type TechnicalValue =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'boolean'; readonly value: boolean }
  | {
      readonly type: 'quantity';
      readonly amount: number;
      readonly unit: UnitCode;
      readonly qualifier?: QuantityQualifier;
    }
  | {
      readonly type: 'range';
      readonly lower?: number;
      readonly upper?: number;
      readonly unit: UnitCode;
      readonly lowerInclusive?: boolean;
      readonly upperInclusive?: boolean;
    }
  | {
      readonly type: 'enum';
      readonly code: string;
      readonly label?: string;
    }
  | {
      readonly type: 'technical_token';
      readonly token: string;
      readonly category?: string;
    }
  | {
      readonly type: 'asset_reference';
      readonly assetId: string;
      readonly mimeType?: string;
      readonly label?: string;
    }
  | {
      readonly type: 'product_reference';
      readonly targetProductId: string;
      readonly relationKind?: string;
    }
  | {
      readonly type: 'unknown';
      readonly reason?: string;
    };

/**
 * Types of provenance source documents.
 */
export type SourceDocumentType =
  | 'manual'
  | 'datasheet'
  | 'certificate'
  | 'drawing'
  | 'standard'
  | 'engineering_note'
  | 'website'
  | 'other';

/**
 * Canonical Source Document entity for provenance tracking.
 */
export interface SourceDocument {
  readonly id: string;
  readonly title: string;
  readonly documentType: SourceDocumentType;
  readonly revision?: string;
  readonly language?: string; // Validated BCP-47 tag (e.g. 'en', 'pt-BR', 'zh-Hans')
  readonly publicationDate?: string; // Validated ISO-8601 string
  readonly fileReference?: string;
  readonly externalUrl?: string;
  readonly checksum?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Evidence linking a source document to an observed claim or assertion.
 */
export interface Evidence {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly page?: string | number;
  readonly section?: string;
  readonly locator?: string;
  readonly observedValue?: TechnicalValue; // The value asserted by this specific source
  readonly excerpt?: string;
  readonly capturedAt?: string; // Validated ISO-8601 string
  readonly capturedBy?: string;
  readonly notes?: string;
}

/**
 * Strict discriminated union of Canonical Decisions resolving evidence conflicts.
 * Invariant: Every decision must have a non-empty rationale, ISO-8601 timestamp,
 * and valid non-orphan evidence references.
 */
export type CanonicalDecision =
  | {
      readonly kind: 'selected_evidence';
      readonly selectedEvidenceId: string;
      readonly rationale: string;
      readonly decidedAt: string; // ISO-8601 string
      readonly decidedBy?: string;
    }
  | {
      readonly kind: 'engineering_decision';
      readonly basisEvidenceIds: readonly string[]; // IDs das evidências de base consideradas
      readonly rationale: string;
      readonly decidedAt: string; // ISO-8601 string
      readonly decidedBy?: string;
    }
  | {
      readonly kind: 'verified_consensus';
      readonly verifiedEvidenceIds: readonly string[]; // IDs das evidências em consenso verificado
      readonly rationale: string;
      readonly decidedAt: string; // ISO-8601 string
      readonly decidedBy?: string;
    };

/**
 * Structured validation issue for domain invariants.
 */
export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

/**
 * Structured validation report for Product Workbook and Knowledge Bundle.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

/**
 * Life cycle status of a technical datum.
 */
export type DatumStatus = 'draft' | 'verified' | 'approved' | 'deprecated';

/**
 * Effective status of a datum including derived conflict state.
 */
export type EffectiveDatumStatus = DatumStatus | 'conflicting';

/**
 * Canonical Technical Datum.
 */
export interface TechnicalDatum {
  readonly id: string;
  readonly semanticKey: string;
  readonly moduleId: string;
  readonly label: string;
  readonly description?: string;
  readonly localizedLabels?: Readonly<Record<string, string>>; // BCP-47 -> label
  readonly value: TechnicalValue;
  readonly evidence: readonly Evidence[];
  readonly canonicalDecision?: CanonicalDecision;
  readonly status: DatumStatus;
  readonly audit?: {
    readonly createdAt: string;
    readonly createdBy?: string;
    readonly updatedAt: string;
    readonly updatedBy?: string;
  };
}

/**
 * Classification of technical modules.
 */
export type ModuleKind =
  | 'key_value'
  | 'matrix'
  | 'collection'
  | 'ordering'
  | 'rich_notes'
  | 'custom';

/**
 * Technical Module grouping related data points.
 */
export interface TechnicalModule {
  readonly id: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly localizedLabels?: Readonly<Record<string, string>>;
  readonly kind: ModuleKind;
  readonly order: number;
  readonly datumIds: readonly string[];
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Owner identity of a workbook.
 */
export type WorkbookOwner =
  | { readonly kind: 'product'; readonly id: string }
  | { readonly kind: 'family'; readonly id: string };

/**
 * Mode of override for inherited family data.
 */
export type OverrideMode = 'override' | 'suppress';

/**
 * Explicit override record for an inherited datum from the family.
 */
export interface InheritedDatumOverride {
  readonly targetSemanticKey: string;
  readonly mode: OverrideMode;
  readonly overriddenValue?: TechnicalValue;
  readonly overriddenStatus?: DatumStatus;
  readonly evidence?: readonly Evidence[];
  readonly canonicalDecision?: CanonicalDecision;
  readonly notes?: string;
}

/**
 * Explicit override record for an inherited dataset from the family.
 */
export interface InheritedDatasetOverride {
  readonly targetSemanticKey: string;
  readonly mode: OverrideMode;
  readonly overriddenLabel?: string;
  readonly overriddenDescription?: string;
  readonly notes?: string;
}

/**
 * Dataset resolved through inheritance (Family -> Product).
 */
export interface EffectiveDataset {
  readonly dataset: TechnicalDataset;
  readonly origin: 'family' | 'product_local' | 'product_override';
  readonly familyDatasetId?: string;
  readonly isSuppressed?: boolean;
}

/**
 * Presentation hints for a saved data view (decoupled from document rendering).
 */
export interface ViewPresentationHint {
  readonly presetRef?: string;
  readonly density?: 'compact' | 'regular';
}

/**
 * Saved View for filtered, grouped, and structured presentation subsets.
 * Does not store actual datum values (only references semantic keys/IDs).
 */
export interface ProductDataView {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly moduleIds?: readonly string[];
  readonly datumKeys: readonly string[];
  readonly ordering?: readonly string[];
  readonly groupingByModule?: boolean;
  readonly viewKind?: 'summary' | 'spec_matrix' | 'ordering' | 'comparison' | 'custom';
  readonly presentationHint?: ViewPresentationHint;
}

/**
 * Classificação canônica dos tipos de datasets técnicos.
 */
export type DatasetKind =
  | 'matrix'
  | 'collection'
  | 'accessories'
  | 'ordering'
  | 'performance'
  | 'compatibility'
  | 'dimensions'
  | 'custom';

/**
 * Coluna canônica de um TechnicalDataset.
 * Define o contrato e restrições semânticas dos dados presentes nesta dimensão.
 */
export interface DatasetColumn {
  readonly id: string;
  readonly semanticKey: string; // Validado por SEMANTIC_KEY_REGEX
  readonly label: string;
  readonly valueType: TechnicalValue['type'];
  readonly unit?: UnitCode;
  readonly order: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Linha canônica de um TechnicalDataset.
 */
export interface DatasetRow {
  readonly id: string;
  readonly semanticKey?: string;
  readonly label?: string;
  readonly order: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Célula canônica de um TechnicalDataset.
 * Invariante (EMENDA 2): Referencia estritamente um TechnicalDatum existente em workbook.data.
 * O dado técnico continua sendo a ÚNICA unidade de verdade técnica.
 */
export interface DatasetCell {
  readonly rowId: string;
  readonly columnId: string;
  readonly datumId: string;
}

/**
 * TechnicalDataset como entidade de domínio de primeira classe (PIM Core V1).
 * Representa tabelas técnicas pertencentes ao produto (exatidão, acessórios, ordering, etc.).
 * Invariante (EMENDA 5): Possui relação explícita com TechnicalModule via moduleId.
 */
export interface TechnicalDataset {
  readonly id: string;
  readonly semanticKey: string;
  readonly moduleId: string; // Vínculo explícito ao TechnicalModule correspondente
  readonly label: string;
  readonly description?: string;
  readonly kind: DatasetKind;
  readonly columns: readonly DatasetColumn[];
  readonly rows: readonly DatasetRow[];
  readonly cells: Readonly<Record<string, DatasetCell>>; // Keyed por getDatasetCellKey(rowId, columnId)
  readonly order: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Gera chave de célula determinística, reversível e imune a colisões por delimitador (EMENDA 3).
 * Formato: r{len}:{rowId}|c{len}:{columnId}
 */
export function getDatasetCellKey(rowId: string, columnId: string): string {
  if (!rowId || !columnId || rowId.trim() === '' || columnId.trim() === '') {
    throw new Error('Coordenadas de célula do dataset não podem ser vazias');
  }
  return `r${rowId.length}:${rowId}|c${columnId.length}:${columnId}`;
}

/**
 * Realiza o parsing seguro e determinístico de uma chave de célula do dataset.
 */
export function parseDatasetCellKey(key: string): { rowId: string; columnId: string } {
  if (!key || typeof key !== 'string') {
    throw new Error('Chave de célula inválida: deve ser uma string não vazia');
  }
  const match = /^r(\d+):(.*)\|c(\d+):(.*)$/.exec(key);
  if (!match) {
    throw new Error(`Formato de chave de célula inválido: "${key}"`);
  }
  const rowLen = parseInt(match[1], 10);
  const rest = match[2];
  if (rest.length < rowLen) {
    throw new Error(`Chave de célula corrompida (tamanho de linha incompatível): "${key}"`);
  }
  const rowId = rest.substring(0, rowLen);
  const colPart = key.substring(key.indexOf('|c') + 2);
  const colColon = colPart.indexOf(':');
  if (colColon === -1) {
    throw new Error(`Chave de célula corrompida (delimitador de coluna ausente): "${key}"`);
  }
  const colLen = parseInt(colPart.substring(0, colColon), 10);
  const columnId = colPart.substring(colColon + 1);
  if (columnId.length !== colLen) {
    throw new Error(`Chave de célula corrompida (tamanho de coluna incompatível): "${key}"`);
  }
  return { rowId, columnId };
}

/**
 * Product Workbook Root Entity V1 (SchemaVersion 1 - Histórico / Legado).
 */
export interface ProductWorkbookV1 {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly owner: WorkbookOwner;
  readonly revision: number;
  readonly modules: readonly TechnicalModule[];
  readonly data: Readonly<Record<string, TechnicalDatum>>;
  readonly overrides?: Readonly<Record<string, InheritedDatumOverride>>;
  readonly savedViews?: readonly ProductDataView[];
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Product Workbook Root Entity V2 (SchemaVersion 2 - Canônico PIM Core V1).
 * Incorpora TechnicalDatasets estruturados e vinculados a módulos.
 */
export interface ProductWorkbookV2 {
  readonly id: string;
  readonly schemaVersion: 2;
  readonly owner: WorkbookOwner;
  readonly revision: number;
  readonly modules: readonly TechnicalModule[];
  readonly data: Readonly<Record<string, TechnicalDatum>>;
  readonly datasets: readonly TechnicalDataset[];
  readonly overrides?: Readonly<Record<string, InheritedDatumOverride>>;
  readonly datasetOverrides?: Readonly<Record<string, InheritedDatasetOverride>>;
  readonly savedViews?: readonly ProductDataView[];
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Migrador explícito, puro, determinístico e idempotente de V1 para V2 (EMENDA 1).
 */
export function migrateWorkbookV1ToV2(v1: ProductWorkbookV1): ProductWorkbookV2 {
  return {
    id: v1.id,
    schemaVersion: 2,
    owner: v1.owner,
    revision: v1.revision,
    modules: v1.modules,
    data: v1.data,
    datasets: [],
    overrides: v1.overrides,
    savedViews: v1.savedViews,
    metadata: v1.metadata
  };
}

/**
 * Garante que um ProductWorkbook esteja no formato V2.
 */
export function ensureWorkbookV2(workbook: ProductWorkbook): ProductWorkbookV2 {
  if (workbook.schemaVersion === 2) {
    return workbook;
  }
  return migrateWorkbookV1ToV2(workbook);
}

/**
 * Product Workbook Root Entity (União Discriminada V1 | V2).
 */
export type ProductWorkbook = ProductWorkbookV1 | ProductWorkbookV2;

/**
 * Container bundle for sharing source documents across multiple workbooks.
 */
export interface ProductKnowledgeBundle {
  readonly sources: readonly SourceDocument[];
  readonly workbooks: readonly ProductWorkbook[];
}

/**
 * Origin of an effective datum resolved through inheritance.
 */
export type DatumOrigin = 'family' | 'product_override' | 'product_local';

/**
 * Resolved effective datum representation.
 */
export interface EffectiveDatum {
  readonly datum: TechnicalDatum;
  readonly origin: DatumOrigin;
  readonly effectiveStatus: EffectiveDatumStatus;
  readonly familyDatumId?: string;
  readonly productDatumId?: string;
  readonly overrideMode?: 'inherit' | 'override' | 'suppress';
  readonly isPendingOverride?: boolean;
  readonly conflictReason?: string;
}

/**
 * Policy for resolving effective product knowledge.
 */
export type ResolutionPolicy =
  | 'effective_for_editing'
  | 'effective_for_publishing'
  | 'effective_for_ai';

/**
 * Result of resolving product knowledge with family inheritance.
 */
export interface ResolvedProductKnowledge {
  readonly productId: string;
  /** Persisted revision of the product workbook. */
  readonly productRevision: number;
  readonly familyId?: string;
  /** Persisted revision of the family workbook, if applicable. */
  readonly familyRevision?: number;
  readonly modules: readonly TechnicalModule[];
  readonly effectiveData: ReadonlyMap<string, EffectiveDatum>; // Keyed by semanticKey
  readonly effectiveDatasets?: ReadonlyMap<string, EffectiveDataset>; // Keyed by semanticKey
  readonly suppressedKeys: readonly string[];
  readonly suppressedDatasetKeys?: readonly string[];
  readonly conflictsCount: number;
}

/**
 * Snapshot fact safe for publication and AI retrieval.
 */
export interface KnowledgeFactSnapshot {
  readonly semanticKey: string;
  readonly label: string;
  readonly effectiveValue: TechnicalValue;
  readonly status: EffectiveDatumStatus;
  readonly origin: DatumOrigin;
  readonly sourceCount: number;
  readonly sourceSummaries: readonly string[];
  /** Persisted/server revision of the originating workbook where this fact was persisted. */
  readonly revision: number;
  readonly hasConflict: boolean;
  readonly candidateValues?: readonly TechnicalValue[];
}

/**
 * AI/Publication Knowledge Query Result.
 */
export interface KnowledgeSnapshot {
  readonly productId: string;
  /** Persisted revision of the product workbook from which this snapshot was generated. */
  readonly productRevision: number;
  readonly generatedAt: string;
  readonly facts: ReadonlyMap<string, KnowledgeFactSnapshot>;
  readonly conflictingFacts: readonly KnowledgeFactSnapshot[];
  readonly unknownFacts: readonly KnowledgeFactSnapshot[];
}

/**
 * Domain structure for AI-assisted knowledge suggestions.
 * Never automatically approved.
 */
export interface KnowledgeSuggestion {
  readonly id: string;
  readonly semanticKey: string;
  readonly suggestedValue: TechnicalValue;
  readonly sourceDocumentIds: readonly string[];
  readonly confidence?: number;
  readonly rationale?: string;
  readonly status: 'draft';
  readonly suggestedAt: string;
}

/**
 * Row entry in multi-product comparison.
 */
export interface ProductComparisonRow {
  readonly semanticKey: string;
  readonly label: string;
  readonly valuesByProductId: Readonly<Record<string, TechnicalValue | null>>;
  readonly statusByProductId: Readonly<Record<string, EffectiveDatumStatus | 'missing'>>;
}

/**
 * Matrix result comparing multiple resolved products.
 */
export interface ProductComparisonMatrix {
  readonly productIds: readonly string[];
  readonly rows: readonly ProductComparisonRow[];
}
