# AGENT 1 INTEGRATION NOTES
**Mission Reference:** PIM.MEGA.WORKSPACE.UX1.1 ↔ PIM.MEGA.WORKSPACE.FOUNDATION1A (Remote Branch: `origin/feat/pim-mega-workspace-foundation-v1`)  
**Author:** Agent 2 (Interaction Design & UX Lab Lead)  
**Status:** REALIGNED (False direct mappings eliminated; real code audited)  
**Date:** 2026-09-04  
**Head Base:** `7ea3e814af0577cefeafd6b3a373c208fcd5bb47`

---

## 1. Executive Summary

A rigorous audit of the code published by Agent 1 on `origin/feat/pim-mega-workspace-foundation-v1` (commits `3386b2f` through `2ba0815`) was performed to eliminate premature compatibility claims and ensure strict architectural alignment before the upcoming `PIM.MEGA.WORKSPACE.INTEGRATION1` mission.

### Corrected Overclaims
1. **Block Sizing (`BlockSize`):**
   - *Previous claim:* Claimed `WorkspaceBlockDef['size']` was identical.
   - *Real Code Reality:* Agent 1's `BaseWorkspaceBlockDef` contains **only** `id: string` and `kind: WorkspaceBlockKind`. There is no `size` property (`'small' | 'medium' | 'large' | 'full'`) in the published domain schema.
   - *Status:* **PENDING DOMAIN ALIGNMENT** (Requires Agent 1 to add `size` to `BaseWorkspaceBlockDef` in FOUNDATION1B, or layout metadata adapter).
2. **Block Resize Command (`resizeBlock`):**
   - *Previous claim:* Claimed direct mapping.
   - *Real Code Reality:* Agent 1's `src/domain/product-workspace/commands.ts` exports `addBlock`, `removeBlock`, `renameBlock`, `moveBlock`, but **no `resizeBlock`**.
   - *Status:* **PENDING DOMAIN ALIGNMENT**.
3. **Block Visibility / Hiding (`hideBlock`):**
   - *Previous claim:* Claimed direct mapping.
   - *Real Code Reality:* Agent 1 has `removeBlock` (which removes presentation references while preserving the underlying datum), but no `isHidden: boolean` property on `BaseWorkspaceBlockDef` or `hideBlock` command.
   - *Status:* **PENDING DOMAIN ALIGNMENT** (Or adapter via presentation removal/pool).
4. **Semantic Rename Execution (`executeCanonicalKeyRename`):**
   - *Previous claim:* Suggested ready execution via `executeCanonicalKeyRename(workbook, plan)`.
   - *Real Code Reality:* Agent 1's domain contains a formal planner (`planCanonicalKeyRename` returning `CanonicalRenamePlan`), but **no execution engine** has been published yet.
   - *Status:* **PREVIEW ONLY / PENDING FOUNDATION1B**. UX emits only `onRequestSemanticRenamePreview` and defines `onConfirmSemanticRename` as an uncommitted hook.

---

## 2. Alignment Matrix (3-Tier Classification)

Every contract area is categorized into one of three explicit states:
- **`DIRECT`**: Matches published domain types/functions with zero translation needed.
- **`ADAPTER REQUIRED`**: Data is present in both domains but requires a bidirectional mapper.
- **`PENDING DOMAIN ALIGNMENT`**: Capability designed in UX Lab but not yet present in Agent 1's domain code.

| Feature Area | Agent 2 UX Lab Contract | Agent 1 Published Domain (`origin/feat/...`) | Alignment State | Notes |
|---|---|---|---|---|
| **Inspection Modes** | `WorkspaceMode: 'view' \| 'edit_workspace'`<br>`Simple` vs `Advanced` | `WorkspaceMode: 'simple' \| 'advanced'` | **DIRECT** | Visual modes map cleanly to simple/advanced presentation toggle. |
| **Section Rename** | `onRenameSection(sectionId, title)` | `renameSection(layout, sectionId, newTitle)` in `commands.ts` | **DIRECT** | Pure immutable layout transformation. |
| **Section Reordering** | `onMoveSection(sectionId, from, to)` | `moveSection(layout, sectionId, targetIndex)` and `reorderSections(layout, sectionIds)` in `commands.ts` | **DIRECT** | Full reordering parity. |
| **Block Movement** | `onMoveBlock(blockId, fromSec, toSec, idx)` | `moveBlock(layout, blockId, sourceSec, targetSec, targetIdx)` in `commands.ts` | **DIRECT** | Cross-section and intra-section movement fully supported. |
| **Block Sizing (`size`)** | `'small' \| 'medium' \| 'large' \| 'full'` | Not defined in `BaseWorkspaceBlockDef` | **PENDING DOMAIN ALIGNMENT** | Needs `size?: BlockSize` added to `BaseWorkspaceBlockDef` in FOUNDATION1B. |
| **Block Resize Command** | `resizeBlock(secId, blkId, size)` | Not exported in `commands.ts` | **PENDING DOMAIN ALIGNMENT** | Requires command in FOUNDATION1B. |
| **Block Visibility / Hiding** | `onHideBlock(blockId, hidden)` | `removeBlock(layout, blockId)` removes reference from section | **ADAPTER REQUIRED** | Adapter can treat "hiding" as moving the block to an unassigned block pool or Agent 1 can add `hidden?: boolean`. |
| **Fact Visibility / Hiding** | `toggleFactVisibility(factId)` / `isHidden` | `removeDatumFromBlock(layout, blockId, datumId)` | **ADAPTER REQUIRED** | Fact remains 100% intact in `ProductWorkbookV2`; adapter reconciles presentation list. |
| **Display Label Renaming** | `updateFactDisplayLabel(factId, newLabel)` | `updateDescriptorDisplayLabel(layout, canonicalKey, newLabel)` in `commands.ts` | **DIRECT** | Updates human presentation label while preserving `canonicalKey`. |
| **Staged Fact Editing** | `onStageFactEdit(datumId, draft, scope)` | `stageDatumChange(draft, datumId, changeDraft)` in `commands.ts` & `WorkspaceEditDraft` | **DIRECT** | Both agents strictly align on **staging** edits rather than direct canonical writes. |
| **Semantic Identity** | `canonicalKey`, `aliases`, `displayLabel` | `SemanticDescriptor`: `canonicalKey`, `displayLabel`, `aliases`, `deprecatedAliases` | **DIRECT** | Full conceptual and field parity. |
| **Semantic Rename Planner** | `onRequestSemanticRenamePreview(cur, next)` | `planCanonicalKeyRename(workbook, oldKey, newKey, options)` → `CanonicalRenamePlan` | **DIRECT** | Full blast-radius planning parity. |
| **Semantic Rename Execution** | `onConfirmSemanticRename(...)` | Not yet implemented in domain | **PENDING DOMAIN ALIGNMENT** | UX treats execution as a future hook; no execution presumed. |
| **Source Provenance Trace** | `SourceDrawer` with multi-source support (`FactSource[]`) | `traceDatumSource(workbook, datumId)` → `Evidence[]` | **ADAPTER REQUIRED** | Adapter maps domain `Evidence` to UX `FactSource` structure (documentCode, page, excerpt, status). |
| **Multi-Source Evidence** | Single, agreeing, conflicting, no-source, inherited | Multiple `Evidence` entries per datum in `ProductWorkbookV2` | **ADAPTER REQUIRED** | Domain supports multiple evidences; adapter groups and computes agreement/conflict state. |
| **Mega Table Matrix** | 19+ sensor rows, RTD/TC groups, sticky header, density modes | `TechnicalTableBlockDef`, `WorkspaceTechnicalTableDef`, `deriveTechnicalTable` | **ADAPTER REQUIRED** | Adapter translates `cells: Record<colId, cell>` to UX table row format. |
| **AI Layout Optimization** | `WorkspaceOrganizationDiff` (+2 sections, +1 table, 0 removed) | `autoOrganizeWorkspace(workbook, layout)` in `auto-organizer.ts` | **DIRECT** | Pure presentation projection without datum mutation. |

---

## 3. Integration Blueprint for `PIM.MEGA.WORKSPACE.INTEGRATION1`

When Agent 1 concludes FOUNDATION1B, the integration bridge will wire UX components to domain commands via the following adapter pattern:

```typescript
// Integration Bridge Adapter: Agent 2 UX Lab -> Agent 1 Domain Commands
export function createMegaWorkspaceBridge(
  layout: WorkspaceLayoutV1,
  setLayout: (l: WorkspaceLayoutV1) => void,
  workbook: ProductWorkbookV2,
  editDraft: WorkspaceEditDraft,
  setEditDraft: (d: WorkspaceEditDraft) => void
): MegaWorkspaceDomainHandlers {
  return {
    onRenameSection: (sectionId, title) => {
      setLayout(renameSection(layout, sectionId, title));
    },
    onMoveSection: (sectionId, fromIndex, toIndex) => {
      setLayout(moveSection(layout, sectionId, toIndex));
    },
    onMoveBlock: (blockId, sourceSecId, targetSecId, targetIndex) => {
      setLayout(moveBlock(layout, blockId, sourceSecId, targetSecId, targetIndex));
    },
    onStageFactEdit: (datumId, draft, scope) => {
      // Staging through Agent 1's stageDatumChange command
      const changeDraft: DatumChangeDraft = {
        datumId,
        value: draft.value ? { kind: 'scalar', raw: draft.value } : undefined,
        unit: draft.unit,
        scopeChoice: scope
      };
      setEditDraft(stageDatumChange(editDraft, datumId, changeDraft));
    },
    onUpdateDisplayLabel: (canonicalKey, newLabel) => {
      setLayout(updateDescriptorDisplayLabel(layout, canonicalKey, newLabel));
    },
    onRequestSemanticRenamePreview: async (currentKey, proposedKey) => {
      const plan = planCanonicalKeyRename(workbook, currentKey, proposedKey, {
        retainOldAsAlias: true
      });
      return {
        affectedProductsCount: plan.affectedDatumIds.length,
        linkedTablesCount: plan.affectedTableBindingIds.length,
        activeViewsCount: plan.affectedSavedViewIds.length,
        affectedCatalogReferencesCount: plan.affectedDatasetIds.length,
        willRetainOldKeyAsAlias: plan.aliasPreserved
      };
    },
    onConfirmSemanticRename: async (_currentKey, _newKey, _retain) => {
      // Intentionally uncommitted hook until Agent 1 delivers the execution engine
      console.info('[SemanticRename] Execution engine pending FOUNDATION1B delivery');
    }
  };
}
```

---

## 4. Pending Requirements for FOUNDATION1B

To achieve complete zero-adapter integration:
1. **Add `size?: 'small' | 'medium' | 'large' | 'full'`** to `BaseWorkspaceBlockDef` in `src/domain/product-workspace/types.ts`.
2. **Add `resizeBlock(layout, blockId, newSize)`** to `src/domain/product-workspace/commands.ts`.
3. **Add `hidden?: boolean`** to `BaseWorkspaceBlockDef` or export explicit presentation pool commands.
4. **Implement safe execution engine** for `CanonicalRenamePlan` with transaction safety and rollback support.
