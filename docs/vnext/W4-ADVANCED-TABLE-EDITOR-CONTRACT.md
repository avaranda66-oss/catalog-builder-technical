# Catalog Builder VNext — W4 Advanced Table Editor Contract

STATUS: **W4.A IMPLEMENTED / UNDER REVIEW — NOT CANONICAL; W4 REMAINDER NOT AUTHORIZED**

DATE: 2026-09-20

Verified canonical base:

- main SHA: `01c18b10051337b094e04688ff340d8032af1a75`
- tree: `7f79259be9bd19d5a5845caacb9120275d817560`
- direct parent: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- PR #39: merged at the canonical SHA
- Quality Gate `35523152738`: exact-head `SUCCESS`

This contract freezes the W4 architecture and the independently reviewable W4.A slice. It does not authorize merge, production deployment, or implementation of W4.B+.

## 1. Preserved authority

- Canonical hierarchy remains `Catalog → Pages → Objects → Properties`.
- `CatalogDocument` remains the only authored document model and keeps `schemaVersion: 1` and the existing serialized millimetre fields.
- Authored physical arithmetic remains integer U; measured browser geometry remains integer Q.
- There is one canonical renderer rooted at `DocumentRenderer` and one canonical Table Engine.
- `src/vnext/table/table-model.ts` remains the structural Table operation authority. W4 reuses `insertAxis`, `deleteAxis`, `reorderAxis`, `mergeCells`, and `unmergeCell`; W4.A exposes only insert/remove.
- Application Actions remain the only mutation seam for UI and future AI. React owns ephemeral interaction state only.
- W3 whole-document persistence, strict CAS, autosave, recovery, and reopen authorities remain unchanged.
- Renderer measurement and diagnostics never resize authored frames, rewrite columns, create pages, or repair topology.

## 2. W4 decomposition

W4.A implements Table grid entry, ephemeral cell/range/row/column/table selection, canonical row/column insertion and removal, measured preview geometry, Undo/Redo integration, responsive controls, and focused proof coverage.

Deferred W4 work includes content editing, merge/unmerge UI, row-role editing, annotations/legend editing, TSV/copy/paste, marker toggling, Fit Height, presets, reorder, column drag-resize, rich-text editing, and Group drill-down.

## 3. W4.A actions

Two strict actions extend the existing discriminated action union:

- `table.axis.insert`
- `table.axis.remove`

Both identify `pageId`, `objectId`, and `tableId`. Insert identifies one stable `referenceAxisId`, an axis (`row` or `column`), and an explicit `before`/`after` position. Remove identifies one stable `axisId`. A canonical `expectedTable` snapshot is read-only compare-and-set data and never replacement content.

Row insertion uses explicit validated properties: `role` is `header` only when the caller deliberately requests header context, otherwise `body`; `heightPolicy` is `AUTO`. Column insertion uses the canonical ordinary default `{ width: { mode: 'flex', weight: 1 }, minMm: 1 }`. W4.A does not rewrite neighbouring row roles or column properties.

Execution order is action validation, target lookup, page/object/table identity checks, closed-Group rejection, lock rejection, expected-table comparison, reference/axis validation, operation-specific preflight, canonical ID allocation where needed, reuse of `insertAxis`/`deleteAxis`, immutable object replacement, and final canonical document validation.

Insertion allocates the new axis and all new empty cells through the existing canonical allocator. Surviving IDs, styles, references, annotations, legends, and the Table object frame remain unchanged. Insertion strictly inside an existing span preserves the domain operation's span-expansion behavior. Header/non-header span crossings fail closed.

Removal invokes `deleteAxis`, never auto-unmerges, and rejects the last row/column or any axis intersecting a span. Structurally valid edits may produce layout diagnostics; they never gain permission to resize the frame or rewrite columns.

Every changed action creates one `DocumentSession` history entry. Failure or semantic no-op preserves document identity, `localSequence`, history, and Redo. Redo restores the exact originally allocated IDs from snapshot history.

## 4. Ephemeral Table selection

Pure helpers live under `src/vnext/editor/`. React stores the current interaction state; no selection enters `CatalogDocument`, persistence, publication, or history.

Selection identity is `(pageId, objectId, tableId)`. Cell-range anchor and focus use `(rowId, columnId)` and are resolved against current canonical row/column order. Supported intent is one cell, rectangular cell range, contiguous row range, contiguous column range, or whole table.

Normalization resolves covered slots to their owning anchor, expands the display rectangle to include every intersecting span, and repeats until fixed-point closure. Original anchor/focus remain unchanged so a reversing or contracting gesture can shrink again. Selection is never discontiguous.

Whole-row and whole-column intent remains explicit and separate from the span-expanded display rectangle. Structural commands use one explicitly selected axis, not the expanded display area. A span-highlight expansion therefore never broadens deletion.

After insertion, the inserted axis is selected. After removal, the nearest surviving index is selected deterministically. Undo/Redo reconciles surviving IDs without storing selection history. Invalid page/object/table/session identity clears Table selection. Pointer cancellation/capture loss clears an active selection gesture without document mutation.

## 5. Interaction levels

The W4.A interaction hierarchy is `Object → Table Grid → reserved Cell Editing`.

Object mode preserves current single/multi-selection, move, resize, Group, and text behavior. A selected top-level unlocked Table enters grid mode through visible `Editar tabela`, Enter, or double activation. Closed Group children cannot enter grid mode; the workflow remains `Desagrupar → editar → Agrupar`.

Grid mode:

- keeps exactly one Table object selected;
- suspends Table move/resize hit handling and hides resize affordances;
- supports cell click, pointer drag, Shift+click, arrows, Shift+arrows, Tab/Shift+Tab, row selectors, column selectors, and whole-table selection;
- treats covered slots as ownership of the anchor and never as independent keyboard stops;
- exits through visible `Voltar ao objeto`, Escape, or boundary Tab behavior;
- does not create rows implicitly and does not implement Delete-to-clear.

Native input, textarea, select, button, and IME behavior is not intercepted by grid shortcuts. Undo/Redo shortcuts work outside native editable controls.

## 6. Measured-layout integration

The editor reuses `compilePlans`, `measureTables`, `projectRows`, `captureSnapshot`, and the canonical renderer. A transform-free hidden measurement root waits for fonts and decodable images, measures the exact source document, captures canonical facts, and publishes measured plans only while that source remains current.

The visible preview receives those resolved column tracks and row tracks. Grid hit targets and selection overlays derive from the same measured `TablePlan`, including the measured caption-to-grid offset. No estimated row heights or second solver is permitted.

Measurement changes only ephemeral plans. The authored Table frame remains unchanged. Editor-scoped containment may prevent Table ink from leaking outside the authored frame, but the hidden measurement root must retain full intrinsic content and diagnostics remain visible.

## 7. Visible and responsive UI

Contextual Portuguese controls expose row insertion before/after, selected-row removal, column insertion before/after, selected-column removal, and leaving grid mode. Multi-axis selections disable structural commands with a comprehensible explanation. Last-axis and span conflicts surface actionable messages without data loss.

At 320, 360, and 390 px the document shell has no global horizontal overflow. The finite A4 canvas may pan inside its own viewport. Table entry, selection, structural commands, and Undo/Redo remain reachable without hover. Touch scrolling is not universally converted into range selection.

## 8. Publication and persistence boundary

Table selection, selectors, overlays, and contextual controls remain outside `[data-editorial-root]` and are absent from canonical publication/PDF. Rendering may not mutate the document or authored frame.

Changed Tables remain ordinary schema-version-1 canonical snapshots and must round-trip through existing W3 persistence. Controlled repository/browser proofs are reported separately from real-production Supabase evidence.

## 9. Required evidence

W4.A requires strict action/application tests, pure selection tests, real Chromium editor interaction, mobile screenshots and global-overflow assertions at 320/360/390, publication/PDF regressions, snapshot round-trip and controlled Save/reopen evidence, plus `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.

W4.A remains **UNDER REVIEW** until an independently audited exact head is explicitly promoted. W4 as a whole remains incomplete.
