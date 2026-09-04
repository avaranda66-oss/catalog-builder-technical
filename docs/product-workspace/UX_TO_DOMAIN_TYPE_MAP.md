# UX TO DOMAIN TYPE MAP
**Document ID:** MAP-PIM-MEGA-WORKSPACE-TYPES-V1  
**Mission:** PIM.MEGA.WORKSPACE.UX1.3A (Domain Re-Sync & Contract Closure)  
**Author:** Agent 2 (Interaction Design & UX Lead)  
**Status:** PRE-INTEGRATION CANDIDATE  
**Target Domain:** Agent 1 `src/domain/product-workspace/types.ts` & `src/domain/product-workbook/types.ts`  
**Domain HEAD Synced:** `3bbbc3a960136e383055f37a3602541df01050b8` (commit `3bbbc3a` on `origin/feat/pim-mega-workspace-foundation-v1-synced`)  
**Purpose:** Precise mapping between presentation fixture types in the UX Lab and canonical domain entities to prevent data corruption or impedance mismatch during integration.

---

## 1. Classification Tiers

All mapped properties follow the strict 5-tier classification hierarchy:
1. **`DIRECT`**: Identical property name and type semantics in domain and UX contracts.
2. **`FORMAT ONLY`**: Pure presentation formatting (e.g. pt-BR decimal localization, units appended for display).
3. **`DERIVED PRESENTATION`**: Computed view-level aggregation or projection (e.g. sets, counts, filter matches, boolean visual toggles).
4. **`ADAPTER REQUIRED`**: Bidirectional mapper required to transform structures between domain model and view model without information loss.
5. **`NOT AVAILABLE`**: Internal domain mechanics, storage tokens (e.g. CAS / Compare-And-Swap optimistic concurrency tokens), intentionally omitted from UI contracts.

---

## 2. Type Mapping Registry

### 2.1 `FactItem` (UX Lab) ↔ `TechnicalDatum` / `WorkspaceProjectionFact` (Domain)

| Field / Attribute (UX Lab `FactItem`) | Domain Equivalent (`TechnicalDatum` / `WorkspaceProjectionFact`) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `datumId: string` | **DIRECT** | **Yes** | 1:1 mapping to stable datum identifier. |
| `semanticKey: string` | `TechnicalDatum.semanticKey` | **DIRECT** | **Yes** | Stable machine/AI identity string adhering to `SEMANTIC_KEY_REGEX`. Never referred to as `canonicalKey` on the datum. |
| `label: string` | `displayLabel` / `displayOverrides[canonicalKey].customLabel` | **DERIVED PRESENTATION** | **Yes** | Human-facing editable display name. Stored in layout `displayOverrides` (sovereign workspace display) or fallback `SemanticDescriptor`. |
| `technicalValue?: TechnicalValueDTO` | `TechnicalDatum.value` (`TechnicalValue`) | **DIRECT** | **Yes** | Full lossless 10-variant discriminated union (`text`, `number`, `boolean`, `quantity`, `range`, `enum`, `technical_token`, `asset_reference`, `product_reference`, `unknown`). |
| `value: string` / `formattedValue` | `value.raw` or `formatTechnicalValue(value)` | **FORMAT ONLY** | **Yes** | Formatted human string for rendering, localized to pt-BR where applicable. |
| `unit?: string` | `unit: UnitCode \| undefined` | **DIRECT** | **Yes** | Validates against Presys canonical `UnitCode` enum. |
| `isHighlighted?: boolean` | `metadata['isHighlighted'] === 'true'` | **DERIVED PRESENTATION** | **Yes** | Stored in datum or layout projection metadata. |
| `visibility?: WorkspaceBlockVisibility` | `BaseWorkspaceBlockDef.visibility` | **DIRECT** | **Yes** | Canonical visibility (`'visible' \| 'hidden'`). |
| `isHidden?: boolean` | `visibility === 'hidden'` | **DERIVED PRESENTATION** | **Yes** | Derived boolean presentation helper. |
| `originKind?: FactOriginKind` (`'product_local' \| 'family' \| 'product_override'`) | `DatumOrigin` / `WorkbookOwner` + `isOverride: boolean` | **DIRECT** | **Yes** | Separated strictly from evidence state (`FactSourceState`). Maps cleanly to domain lineage and inheritance provenance. |
| `originScope: 'model' \| 'family'` | `origin: DatumOrigin` / `owner: WorkbookOwner` | **DIRECT** | **Yes** | Domain uses `WorkbookOwner: { kind: 'family' \| 'model', modelId?, familyId }`. Mapped to human `'model' \| 'family'`. |
| `originLabel: string` | Formatted owner string (`"TA-25N"` or `"Linha TA"`) | **FORMAT ONLY** | **Yes** | Derived directly from `WorkbookOwner.kind` and `modelName`/`familyName`. |
| `category?: string` | `category?: string` | **DIRECT** | **Yes** | Direct string pass-through. |
| `aliases?: string[]` | `aliases: readonly string[]` (from `SemanticRegistryV1`) | **ADAPTER REQUIRED** | **Yes** | AI synonyms belong strictly to sovereign canonical semantic layer (`SemanticRegistryV1`), NOT workspace display layout. |
| `source?: FactSource` | Derived from primary `Evidence` | **ADAPTER REQUIRED** | **Yes** | Unpacks first evidence entry. |
| `sources?: FactSource[]` | `evidences: readonly Evidence[]` (from `traceDatumSource`) | **ADAPTER REQUIRED** | **Yes** | Maps domain evidence array directly to UX source array. |
| `conflict?: FactConflictDetails` | `CanonicalDecision` / `EffectiveDatumStatus: 'conflicting'` | **ADAPTER REQUIRED** | **Yes** | Mapped from domain conflicting status and alternative claims. |

---

### 2.2 `WorkspaceBlock` (UX Lab) ↔ `WorkspaceBlockDef` (Domain)

| Field / Attribute (UX Lab `WorkspaceBlock`) | Domain Equivalent (`WorkspaceBlockDef`) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `id: string` | **DIRECT** | **Yes** | Unique block identifier. |
| `kind: BlockKind` | `kind: WorkspaceBlockKind` | **ADAPTER REQUIRED** | **Yes** | Mappings: `hero_summary` → `fact_grid` (with hero variant), `fact_grid` → `fact_grid`, `mega_table` → `technical_table`, `table` → `technical_table`, `documents` → `source_group`, `notes` → `text_note`. |
| `title?: string` | `title?: string` | **DIRECT** | **Yes** | Direct title property. |
| `subtitle?: string` | `description?: string` or `metadata['subtitle']` | **ADAPTER REQUIRED** | **Yes** | Stored in block description or metadata dictionary. |
| `size: BlockSize` (`'small' \| 'medium' \| 'large' \| 'full'`) | `BaseWorkspaceBlockDef.size?: WorkspaceBlockSize` | **DIRECT** | **Yes** | Direct union parity delivered in FOUNDATION1D (`'small' \| 'medium' \| 'large' \| 'full'`). |
| `visibility?: WorkspaceBlockVisibility` | `BaseWorkspaceBlockDef.visibility?: WorkspaceBlockVisibility` | **DIRECT** | **Yes** | Direct token parity delivered in FOUNDATION1D (`'visible' \| 'hidden'`). |
| `isHidden?: boolean` | `visibility === 'hidden'` | **DERIVED PRESENTATION** | **Yes** | Derived boolean helper for React components. |
| `data: ...` | References (`datumIds`, `tableDef`, `sourceDocumentIds`) | **ADAPTER REQUIRED** | **Yes** | Domain blocks store ID pointers (`datumIds: string[]`); UX Lab uses hydrated objects. The adapter hydrates/dehydrates references against `ProductWorkbookV2`. |

---

### 2.3 `WorkspaceSection` (UX Lab) ↔ `WorkspaceSectionDef` (Domain)

| Field / Attribute (UX Lab `WorkspaceSection`) | Domain Equivalent (`WorkspaceSectionDef`) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `id: string` | `id: string` | **DIRECT** | **Yes** | Section unique identifier. |
| `title: string` | `title: string` | **DIRECT** | **Yes** | Direct human section title. |
| `description?: string` | `description?: string` | **DIRECT** | **Yes** | Optional editorial description. |
| `icon?: string` | `icon?: string` | **DIRECT** | **Yes** | Icon name token (e.g. `'Sparkles'`, `'Cpu'`, `'Box'`). |
| `isCollapsed?: boolean` | `collapsed?: boolean` | **DIRECT** | **Yes** | 1:1 boolean mapping with rename. |
| `blocks: WorkspaceBlock[]` | `blockIds: readonly string[]` | **ADAPTER REQUIRED** | **Yes** | Domain section stores ordered `blockIds: string[]`; adapter dereferences blocks from `layout.blocks[blockId]`. |

---

### 2.4 `MegaTableData` (UX Lab) ↔ `WorkspaceTechnicalTableDef` (Domain)

| Field / Attribute (UX Lab `MegaTableData`) | Domain Equivalent (`WorkspaceTechnicalTableDef`) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `columns: MegaTableColumn[]` | `columns: readonly WorkspaceTableColumnDef[]` | **ADAPTER REQUIRED** | **Yes** | `id` → `id`, `header` → `headerLabel`, `width` → `widthPercent` or `metadata['width']`, `visible` → `visible`. |
| `rows: MegaTableRow[]` | `rows: readonly WorkspaceTableRowDef[]` & `cells` | **ADAPTER REQUIRED** | **Yes** | UX stores rows with `group` and keyed `cells: Record<colId, MegaTableCellData>`. Domain stores `rows` with `rowId` and top-level `cells: Record<string, WorkspaceTableCellDef>` keyed by `rowId:colId`. Cells can be `fact_ref` or `editorial_literal`. |
| `defaultDensity` (`'compact' \| 'normal' \| 'comfortable'`) | `metadata['density']` | **FORMAT ONLY** | **Yes** | Visual presentation density preference stored in table metadata. |
| `supportsFullscreen?: boolean` | UI capability flag | **DERIVED PRESENTATION** | **Yes** | Handled completely by presentation container. |

---

### 2.5 `FactSource` (UX Lab) ↔ `Evidence` (Domain)

| Field / Attribute (UX Lab `FactSource`) | Domain Equivalent (`Evidence`) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `documentId: string` | `sourceDocumentId: string` | **DIRECT** | **Yes** | Internal UUID of source document in vault. |
| `documentTitle: string` | `documentTitle: string` (from document index) | **ADAPTER REQUIRED** | **Yes** | Populated by joining with document catalog. |
| `documentCode: string` | `documentCode: string` (e.g. `'EM0291-04'`) | **DIRECT** | **Yes** | Canonical engineering publication code. |
| `revision?: string` | `documentRevision?: string` | **DIRECT** | **Yes** | Document edition / revision string. |
| `page: number` | `location.pageNumber: number` | **ADAPTER REQUIRED** | **Yes** | Domain stores location in `location: { pageNumber, section, coordinates }`. |
| `excerpt: string` | `rawSnippet: string` | **DIRECT** | **Yes** | Exact quoted excerpt extracted by OCR or human. |
| `verifiedStatus: string` | `verification.status` | **DIRECT** | **Yes** | Mapped from domain verification states (`'verified'`, `'disputed'`, `'unverified'`). |
| `claimValue?: string` | `extractedValue: TechnicalValue` | **FORMAT ONLY** | **Yes** | Formatted string of the specific claim made in this document. |
| `isFamilyInherited?: boolean` | Derived from evidence lineage | **DERIVED PRESENTATION** | **Yes** | True if evidence originates from family-level master document. |
| `technicalMetadata: { ocrConfidence, checksum, uploadedAt }` | `metadata: Record<string, string>` & `hash` | **ADAPTER REQUIRED** | **Yes** | Audit fields unmarshalled into typed object. |

---

### 2.6 `FactConflictDetails` (UX Lab) ↔ `CanonicalDecision` / `conflicting` status (Domain)

| Field / Attribute (UX Lab `FactConflictDetails`) | Domain Equivalent (`CanonicalDecision` / Conflict) | Tier Classification | Lossless? | Mapping Details & Transformation Logic |
|---|---|---|---|---|
| `title: string` | Derived conflict summary | **FORMAT ONLY** | **Yes** | Human-readable title generated from conflicting datum label. |
| `description: string` | Decision notes / reason for divergence | **FORMAT ONLY** | **Yes** | Detailed explanation of source discrepancies. |
| `options: FactConflictOption[]` | Competing evidence items & claims | **ADAPTER REQUIRED** | **Yes** | Each conflicting manual provides its extracted value, document code, and page number as an actionable option. |
| `detectedAt: string` | Conflict ingestion timestamp | **DIRECT** | **Yes** | ISO-8601 timestamp. |

---

## 3. Bidirectional Mapping Guarantees

1. **Zero Data Destruction:** Every domain datum mapped to a UX `FactItem` retains its `id` (`datumId`) and `semanticKey`. Layout manipulations in the UX Lab (reordering, moving, resizing, hiding) touch only layout structures (`WorkspaceLayoutV1`), never mutating or dropping the underlying `TechnicalDatum`.
2. **Lossless Roundtrip:** Dehydrating a UX Lab state back into domain structures preserves all metadata fields, column definitions, and custom section titles without truncation or loss of precision.
3. **No Chemical CAS Confusion:** CAS in this repository strictly represents **Compare-And-Swap** optimistic concurrency tokens used during catalog and template persistence, having zero relation to chemical registries or molecular databases.
