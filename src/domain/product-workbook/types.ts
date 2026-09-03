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
 * Product Workbook Root Entity.
 */
export interface ProductWorkbook {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly owner: WorkbookOwner;
  readonly revision: number; // Integer >= 0 for CAS concurrency tracking
  readonly modules: readonly TechnicalModule[];
  readonly data: Readonly<Record<string, TechnicalDatum>>; // Keyed by datum ID
  readonly overrides?: Readonly<Record<string, InheritedDatumOverride>>; // Keyed by targetSemanticKey
  readonly savedViews?: readonly ProductDataView[];
  readonly metadata?: Readonly<Record<string, string>>;
}

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
  readonly familyId?: string;
  readonly modules: readonly TechnicalModule[];
  readonly effectiveData: ReadonlyMap<string, EffectiveDatum>; // Keyed by semanticKey
  readonly suppressedKeys: readonly string[];
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
  readonly revision: number;
  readonly hasConflict: boolean;
  readonly candidateValues?: readonly TechnicalValue[];
}

/**
 * AI/Publication Knowledge Query Result.
 */
export interface KnowledgeSnapshot {
  readonly productId: string;
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
