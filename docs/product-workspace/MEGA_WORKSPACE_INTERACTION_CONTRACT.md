# MEGA PRODUCT WORKSPACE — INTERACTION CONTRACT
**Document ID:** CONTRACT-PIM-MEGA-WORKSPACE-INT-V1  
**Parties:** Agent 2 (UX / Interaction Layer) ↔ Agent 1 (Domain / Storage / AI Foundation)  
**Status:** Canonical Interface Specification  
**Target Integration Mission:** `PIM.MEGA.WORKSPACE.INTEGRATION1`

---

## 1. Overview & Purpose

This contract defines the strict boundary between the **Human Experience Layer** (`src/labs/product-workspace-ux/` by Agent 2) and the **Foundation / Domain Engine** (`src/domain/product-workspace/` by Agent 1).

The UX layer guarantees that:
- No raw database identifiers (CAS hashes, schema versions, internal UUIDs) are rendered in primary user workflows.
- All user interactions produce strongly-typed domain events with clean payloads.
- The UI remains completely optimistic and responsive, handling undo/redo locally until confirmed by domain commands.

The Domain layer will supply implementations for the events and handlers declared below.

---

## 2. Core UI Event Handlers (Props Contract)

The root component of the Mega Product Workspace will consume the following callback interface:

```typescript
export interface MegaWorkspaceDomainHandlers {
  // =========================================================================
  // Section Lifecycle & Organization Events
  // =========================================================================
  
  /**
   * Invoked when user renames an editorial section.
   * @param sectionId Unique identifier of the section (e.g. 'sec-metrologia')
   * @param title New human-readable title (e.g. 'Metrologia e Calibração')
   */
  onRenameSection: (sectionId: string, title: string) => Promise<void> | void;

  /**
   * Invoked when user reorders sections via drag handle or Move Up/Down buttons.
   * @param sectionId Identifier of the section being moved
   * @param fromIndex Original zero-based position
   * @param toIndex Target zero-based position
   */
  onMoveSection: (sectionId: string, fromIndex: number, toIndex: number) => Promise<void> | void;

  /**
   * Invoked when user creates a new editorial section.
   * @param title Title of the new section
   * @param insertAtIndex Optional target position in the section array
   */
  onCreateSection: (title: string, insertAtIndex?: number) => Promise<string> | string;

  /**
   * Invoked when user removes a section.
   * @param sectionId Identifier of the section
   * @param purgeFacts If true, also flags inner facts for deletion; if false, orphans move to unassigned pool.
   */
  onDeleteSection: (sectionId: string, purgeFacts: boolean) => Promise<void> | void;

  // =========================================================================
  // Block Lifecycle & Layout Events
  // =========================================================================

  /**
   * Invoked when user alters a block's responsive grid sizing.
   * @param blockId Unique identifier of the block
   * @param size Conceptual layout width: 'small' (1/3), 'medium' (1/2), 'large' (2/3), 'full' (1/1)
   */
  onResizeBlock: (blockId: string, size: 'small' | 'medium' | 'large' | 'full') => Promise<void> | void;

  /**
   * Invoked when user reorders blocks within a section or moves between sections.
   * @param blockId Identifier of the block
   * @param sourceSectionId Origin section
   * @param targetSectionId Destination section
   * @param targetIndex Zero-based target index in the destination block array
   */
  onMoveBlock: (
    blockId: string,
    sourceSectionId: string,
    targetSectionId: string,
    targetIndex: number
  ) => Promise<void> | void;

  /**
   * Invoked when user hides a block from the active catalog view without deleting data.
   * @param blockId Identifier of the block
   * @param hidden Boolean visibility state
   */
  onHideBlock: (blockId: string, hidden: boolean) => Promise<void> | void;

  // =========================================================================
  // Fact (Datum) Editing, Staging & Visibility Events
  // =========================================================================

  /**
   * Invoked when user updates a technical specification value or metadata.
   * Blocker 7: Operates as STAGING into WorkspaceEditDraft. Does not commit directly to canonical truth.
   * @param datumId Canonical identifier of the fact
   * @param draft Modified fields: label, value, unit
   * @param scope Scope of mutation: 'model' (specific model) | 'family' (propagates to all models in line)
   */
  onStageFactEdit: (
    datumId: string,
    draft: { label?: string; value: string; unit?: string },
    scope: 'model' | 'family'
  ) => Promise<void> | void;

  /**
   * Invoked when user renames the human display label of a specification without altering its canonical semanticKey.
   * Directly matches Agent 1 updateDescriptorDisplayLabel command.
   * @param canonicalKey Canonical machine/AI identity
   * @param newLabel New human display name
   */
  onUpdateFactDisplayLabel: (canonicalKey: string, newLabel: string) => Promise<void> | void;

  /**
   * Invoked when user toggles the presentation visibility of a fact in a section.
   * Hides the fact from active view presentation without deleting the underlying TechnicalDatum.
   * @param sectionId Target section
   * @param factId Unique datum identifier
   * @param hidden Boolean visibility state
   */
  onToggleFactVisibility: (sectionId: string, factId: string, hidden?: boolean) => Promise<void> | void;

  /**
   * Invoked when user adds a new technical specification via "+ Adicionar Informação".
   * @param sectionId Target section where the fact will be displayed
   * @param fact Specification payload: label, value, unit, originScope, source, optional semanticKey
   */
  onAddFact: (
    sectionId: string,
    fact: {
      label: string;
      value: string;
      unit?: string;
      originScope: 'model' | 'family';
      sourceDocumentCode?: string;
      sourcePage?: number;
      semanticKey?: string;
    }
  ) => Promise<string> | string;

  /**
   * Invoked when user opens the provenance drawer to inspect source citations.
   * Blocker 6: Supports returning multiple evidences, single evidence, or empty for unreferenced facts.
   * @param datumId Identifier of the fact or sensor row
   */
  onOpenSource: (datumId: string) => Promise<SourceEvidenceDetails[]> | void;

  // =========================================================================
  // Table Creation & Mutation Events
  // =========================================================================

  /**
   * Invoked when user creates a structured table block.
   * @param sectionId Target section
   * @param title Title of the table
   * @param headers Column names
   * @param initialRows Optional 2D array of initial cell values
   */
  onCreateTable: (
    sectionId: string,
    title: string,
    headers: string[],
    initialRows?: string[][]
  ) => Promise<string> | string;

  /**
   * Invoked when user converts selected loose fact cards into a consolidated table.
   * @param factIds List of datum IDs to convert
   * @param targetSectionId Target section
   * @param tableTitle Title for the resulting table
   */
  onConvertFactsToTable: (
    factIds: string[],
    targetSectionId: string,
    tableTitle: string
  ) => Promise<void> | void;

  // =========================================================================
  // Semantic Identity & Safe Rename Events (Preview Only until FOUNDATION1B)
  // =========================================================================

  /**
   * Invoked when user requests blast-radius analysis before renaming a canonical key.
   * Backed directly by Agent 1's planCanonicalKeyRename planner.
   * @param currentKey Current semantic key (e.g. 'temperature.stability')
   * @param proposedKey Proposed key (e.g. 'thermal.stability')
   * @returns Blast radius impact summary
   */
  onRequestSemanticRenamePreview: (
    currentKey: string,
    proposedKey: string
  ) => Promise<SemanticImpactSummary>;

  /**
   * Contract hook for future execution engine.
   * PENDING FOUNDATION1B: Currently Agent 1 has only delivered the planner.
   * UI operates in Preview Mode until the execution engine is delivered.
   * @param currentKey Current semantic key
   * @param newKey New semantic key
   * @param retainOldAsAlias Whether to preserve the current key as a backward-compatible alias
   */
  onConfirmSemanticRename: (
    currentKey: string,
    newKey: string,
    retainOldAsAlias: boolean
  ) => Promise<void> | void;

  /**
   * Invoked when user adds an alias to an existing semantic key.
   * Backed directly by Agent 1's addDescriptorAliasCommand.
   * @param semanticKey Canonical key
   * @param alias New synonym or label variant
   */
  onAddSemanticAlias: (semanticKey: string, alias: string) => Promise<void> | void;

  // =========================================================================
  // Conflict Reconciliation Events
  // =========================================================================

  /**
   * Invoked when user reconciles a divergence between documents.
   * @param conflictId Identifier of the conflicting fact
   * @param resolvedValue Chosen specification value
   * @param unit Specification unit
   * @param justification Optional engineering note
   */
  onResolveConflict: (
    conflictId: string,
    resolvedValue: string,
    unit?: string,
    justification?: string
  ) => Promise<void> | void;

  // =========================================================================
  // AI Organization & Perspective Events
  // =========================================================================

  /**
   * Invoked when user triggers intelligent layout structuring.
   * Analyzes workspace contents and suggests section groupings without mutating canonical data.
   */
  onOrganizeWorkspace: () => Promise<WorkspaceOrganizationDiff>;

  /**
   * Invoked when user switches visual perspective (Padrão, Engenharia, Comercial, Documentação).
   * @param perspectiveId Identifier of the chosen perspective
   */
  onSelectPerspective: (perspectiveId: string) => void;
}
```

---

## 3. Data Transfer Objects (Payloads)

### 3.1 Semantic Impact Summary
```typescript
export interface SemanticImpactSummary {
  affectedProductsCount: number;
  linkedTablesCount: number;
  activeViewsCount: number;
  catalogReferencesCount: number;
  backwardCompatibleAliasCreated: boolean;
}
```

### 3.2 Workspace Organization Diff
```typescript
export interface WorkspaceOrganizationDiff {
  newSectionsCount: number;
  newTablesCount: number;
  groupedCardsCount: number;
  removedFactsCount: number; // Must be strictly 0
  suggestedSectionTitles: string[];
}
```

### 3.3 Source Evidence Details
```typescript
export interface SourceEvidenceDetails {
  datumId: string;
  documentTitle: string;
  documentCode: string;
  revision: string;
  page: number;
  sectionReference: string;
  quotedText: string;
  verificationStatus: 'verified' | 'pending' | 'divergent';
  verifiedBy?: string;
  verifiedAt?: string;
  sha256Checksum?: string;
}
```

---

## 4. Integration Invariants (Non-Negotiables)

1. **Zero Data Destruction:** Layout mutations (`onMoveBlock`, `onResizeBlock`, `onHideBlock`, `onOrganizeWorkspace`) MUST NEVER delete underlying facts or alter `semanticKey` bindings.
2. **Deterministic Aliasing:** Any execution of `onRequestSemanticRename` MUST register `currentKey` into `aliases` so that legacy catalog blocks, print templates, and external queries continue to resolve seamlessly.
3. **Optimistic Rollback:** The UI layer provides instant visual updates with an Undo toast. If a domain command rejects, the UI will invoke `rollback()` with the previous snapshot.
