# UX TO DOMAIN TYPE MAP
**Document ID:** MAP-PIM-MEGA-WORKSPACE-TYPES-V1  
**Mission:** PIM.MEGA.WORKSPACE.UX1.1  
**Author:** Agent 2 (Interaction Design & UX Lead)  
**Target Domain:** Agent 1 `src/domain/product-workspace/types.ts` & `src/domain/product-workbook/types.ts`  
**Purpose:** Precise mapping between presentation fixture types in the UX Lab and canonical domain entities to prevent data corruption or impedance mismatch during integration.

---

## 1. Type Mapping Registry

### 1.1 `FactItem` (UX Lab) ↔ `TechnicalDatum` / `WorkspaceProjectionFact` (Domain)

| Field / Attribute (UX Lab `FactItem`) | Domain Equivalent (`TechnicalDatum` / `WorkspaceProjectionFact`) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `datumId: string` | **Yes** (rename) | **Yes** | 1:1 mapping to stable datum identifier. |
| `label: string` | `descriptor.displayLabel` (from `SemanticDescriptor`) | **Yes** (lookup) | **Yes** | Human-facing editable display name stored in layout `semanticDescriptors`. |
| `value: string` | `value.raw` or `formatTechnicalValue(value)` | **Yes** (unboxing) | **Yes** | Domain values are structured (`TechnicalValue: scalar, range, toleranced, multi_condition`). The adapter unboxes or formats to human string. |
| `unit?: string` | `unit: UnitCode \| undefined` | **Yes** (normalization) | **Yes** | Validates against Presys canonical `UnitCode` enum. |
| `isHighlighted?: boolean` | `metadata['isHighlighted'] === 'true'` | **Yes** (metadata) | **Yes** | Stored in datum or layout projection metadata. |
| `isHidden?: boolean` | Absence from `block.datumIds` or `metadata['isHidden']` | **Yes** (presence check) | **Yes** | In domain, "hiding" means excluding the `datumId` from the presentation block's `datumIds` array while keeping the datum in the workbook. |
| `originScope: 'model' \| 'family'` | `origin: DatumOrigin` / `owner: WorkbookOwner` | **Yes** (enum map) | **Yes** | Domain uses `WorkbookOwner: { kind: 'family' \| 'model', modelId?, familyId }`. Mapped to human `'model' \| 'family'`. |
| `originLabel: string` | Formatted owner string (`"TA-25N"` or `"Linha TA"`) | **Yes** (derived) | **Yes** | Derived directly from `WorkbookOwner.kind` and `modelName`/`familyName`. |
| `category?: string` | `category?: string` | **No** | **Yes** | Direct string pass-through. |
| `semanticKey: string` | `canonicalKey: string` | **Yes** (rename) | **Yes** | Stable machine/AI identity string adhering to `SEMANTIC_KEY_REGEX`. |
| `aliases?: string[]` | `descriptor.aliases: readonly string[]` | **Yes** (lookup) | **Yes** | Stored in `SemanticDescriptor.aliases`. |
| `source?: FactSource` | Derived from primary `Evidence` | **Yes** (adapter) | **Yes** | Unpacks first evidence entry. |
| `sources?: FactSource[]` | `evidences: readonly Evidence[]` (from `traceDatumSource`) | **Yes** (adapter) | **Yes** | Maps domain evidence array directly to UX source array. |
| `conflict?: FactConflictDetails` | `CanonicalDecision` / `EffectiveDatumStatus: 'conflicting'` | **Yes** (composite) | **Yes** | Mapped from domain conflicting status and alternative claims. |

---

### 1.2 `WorkspaceBlock` (UX Lab) ↔ `WorkspaceBlockDef` (Domain)

| Field / Attribute (UX Lab `WorkspaceBlock`) | Domain Equivalent (`WorkspaceBlockDef`) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `id: string` | **No** | **Yes** | Unique block identifier. |
| `kind: BlockKind` | `kind: WorkspaceBlockKind` | **Yes** (enum mapping) | **Yes** | Mappings: `hero_summary` → `fact_grid` (with hero variant), `fact_grid` → `fact_grid`, `mega_table` → `technical_table`, `table` → `technical_table`, `documents` → `source_group`, `notes` → `text_note`. |
| `title?: string` | `title?: string` | **No** | **Yes** | Direct title property. |
| `subtitle?: string` | `description?: string` or `metadata['subtitle']` | **Yes** (field rename) | **Yes** | Stored in block description or metadata dictionary. |
| `size: BlockSize` (`'small' \| 'medium' \| 'large' \| 'full'`) | `metadata['layoutSize']` or pending domain field | **Yes** (metadata) | **Yes** | Currently stored in `block.metadata['layoutSize']` until Agent 1 adds `size` to `BaseWorkspaceBlockDef` in FOUNDATION1B. |
| `isHidden?: boolean` | Absence from `section.blockIds` or `metadata['isHidden']` | **Yes** (layout state) | **Yes** | Preserves block in `layout.blocks` dictionary while omitting its ID from active section `blockIds`. |
| `data: ...` | References (`datumIds`, `tableDef`, `sourceDocumentIds`) | **Yes** (hydration) | **Yes** | Domain blocks store ID pointers (`datumIds: string[]`); UX Lab uses hydrated objects. The adapter hydrates/dehydrates references against `ProductWorkbookV2`. |

---

### 1.3 `WorkspaceSection` (UX Lab) ↔ `WorkspaceSectionDef` (Domain)

| Field / Attribute (UX Lab `WorkspaceSection`) | Domain Equivalent (`WorkspaceSectionDef`) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `id: string` | **No** | **Yes** | Section unique identifier. |
| `title: string` | `title: string` | **No** | **Yes** | Direct human section title. |
| `description?: string` | `description?: string` | **No** | **Yes** | Optional editorial description. |
| `icon?: string` | `icon?: string` | **No** | **Yes** | Icon name token (e.g. `'Sparkles'`, `'Cpu'`, `'Box'`). |
| `isCollapsed?: boolean` | `collapsed?: boolean` | **Yes** (rename) | **Yes** | 1:1 boolean mapping. |
| `blocks: WorkspaceBlock[]` | `blockIds: readonly string[]` | **Yes** (hydration) | **Yes** | Domain section stores ordered `blockIds: string[]`; adapter dereferences blocks from `layout.blocks[blockId]`. |

---

### 1.4 `MegaTableData` (UX Lab) ↔ `WorkspaceTechnicalTableDef` (Domain)

| Field / Attribute (UX Lab `MegaTableData`) | Domain Equivalent (`WorkspaceTechnicalTableDef`) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `columns: MegaTableColumn[]` | `columns: readonly WorkspaceTableColumnDef[]` | **Yes** (field mapping) | **Yes** | `id` → `id`, `header` → `headerLabel`, `width` → `widthPercent` or `metadata['width']`, `visible` → `visible`. |
| `rows: MegaTableRow[]` | `rows: readonly WorkspaceTableRowDef[]` & `cells` | **Yes** (matrix transform) | **Yes** | UX stores rows with `group` and keyed `cells: Record<colId, MegaTableCellData>`. Domain stores `rows` with `rowId` and a top-level `cells: Record<string, WorkspaceTableCellDef>` keyed by `rowId:colId`. Mapped bi-directionally without data loss. |
| `defaultDensity` (`'compact' \| 'normal' \| 'comfortable'`) | `metadata['density']` | **Yes** (metadata) | **Yes** | Visual presentation density preference stored in table metadata. |
| `supportsFullscreen?: boolean` | UI capability flag | **No** | **Yes** | Handled completely by presentation container. |

---

### 1.5 `FactSource` (UX Lab) ↔ `Evidence` (Domain)

| Field / Attribute (UX Lab `FactSource`) | Domain Equivalent (`Evidence`) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `documentId: string` | `sourceDocumentId: string` | **Yes** (rename) | **Yes** | Internal UUID of source document in vault. |
| `documentTitle: string` | `documentTitle: string` (from document index) | **Yes** (join) | **Yes** | Populated by joining with document catalog. |
| `documentCode: string` | `documentCode: string` (e.g. `'EM0291-04'`) | **No** | **Yes** | Canonical engineering publication code. |
| `revision?: string` | `documentRevision?: string` | **Yes** (rename) | **Yes** | Document edition / revision string. |
| `page: number` | `location.pageNumber: number` | **Yes** (nesting) | **Yes** | Domain stores location in `location: { pageNumber, section, coordinates }`. |
| `excerpt: string` | `rawSnippet: string` | **Yes** (rename) | **Yes** | Exact quoted excerpt extracted by OCR or human. |
| `verifiedStatus: string` | `verification.status` | **Yes** (enum map) | **Yes** | Mapped from domain verification states (`'verified'`, `'disputed'`, `'unverified'`). |
| `claimValue?: string` | `extractedValue: TechnicalValue` | **Yes** (format) | **Yes** | Formatted string of the specific claim made in this document. |
| `isFamilyInherited?: boolean` | Derived from evidence lineage | **Yes** (derived) | **Yes** | True if evidence originates from family-level master document. |
| `technicalMetadata: { ocrConfidence, checksum, uploadedAt }` | `metadata: Record<string, string>` & `hash` | **Yes** (composite) | **Yes** | Audit fields unmarshalled into typed object. |

---

### 1.6 `FactConflictDetails` (UX Lab) ↔ `CanonicalDecision` / `conflicting` status (Domain)

| Field / Attribute (UX Lab `FactConflictDetails`) | Domain Equivalent (`CanonicalDecision` / Conflict) | Adapter Needed? | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `title: string` | Derived conflict summary | **Yes** (formatted) | **Yes** | Human-readable title generated from conflicting datum label. |
| `description: string` | Decision notes / reason for divergence | **Yes** (formatted) | **Yes** | Detailed explanation of source discrepancies. |
| `options: FactConflictOption[]` | Competing evidence items & claims | **Yes** (adapter) | **Yes** | Each conflicting manual provides its extracted value, document code, and page number as an actionable option. |
| `detectedAt: string` | Conflict ingestion timestamp | **Yes** (pass-through) | **Yes** | ISO-8601 timestamp. |

---

## 2. Bidirectional Mapping Guarantees

1. **Zero Data Destruction:** Every domain datum mapped to a UX `FactItem` retains its `id` (`datumId`) and `semanticKey`. Layout manipulations in the UX Lab (reordering, moving, resizing, hiding) touch only layout structures (`WorkspaceLayoutV1`), never mutating or dropping the underlying `TechnicalDatum`.
2. **Lossless Roundtrip:** Dehydrating a UX Lab state back into domain structures preserves all metadata fields, column definitions, and custom section titles without truncation or loss of precision.
