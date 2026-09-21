# VNext W4.A — Implementation Handoff

Status: **IMPLEMENTED / UNDER REVIEW — NOT CANONICAL**

Date: 2026-09-20

## Provenance

- Repository: `avaranda66-oss/catalog-builder-technical`.
- Verified base SHA/tree: `01c18b10051337b094e04688ff340d8032af1a75` / `7f79259be9bd19d5a5845caacb9120275d817560`.
- Base parent: `00b78e6d582a2868e4b0447cb3dee2bf53732299`.
- Base PR / gate: PR #39 merged; Quality Gate `35523152738` completed `SUCCESS` at the exact base head.
- Implementation branch: `codex/w4a-table-selection-axis`.
- Review PR and exact implementation head belong to the delivery report for the published branch; no merge or production deployment is authorized by this handoff.

## Delivered Slice

W4.A adds only:

- strict `table.axis.insert` and `table.axis.remove` Application Actions;
- pure ephemeral Table cell/range/row/column/whole-table selection;
- Object → Table Grid interaction and a reserved exit back to Object mode;
- Portuguese single-axis structural controls;
- measured canonical plans fed back to the visible preview and editor-only selection geometry;
- deterministic selection reconciliation across insert/remove and Undo/Redo;
- responsive/mobile reachability and controlled Save/reopen evidence.

It reuses `insertAxis`, `deleteAxis`, the canonical ID allocator, final document validation, `DocumentSession` history, the canonical renderer, `measureTables`, `projectRows`, `captureSnapshot`, and W3 persistence authority. No second engine, document store, allocator, renderer, persistence model, or native HTML table authority was added.

## Selection and Interaction Contract

- Identity is `pageId + objectId + tableId`.
- Cell/range anchor and focus remain stable row/column IDs; indices are always derived from current canonical ordering.
- Covered slots resolve to their anchor owner and normalized display ranges close transitively over every intersecting span.
- Explicit row/column intent remains separate from expanded display geometry, so removal never broadens silently.
- Grid mode supports click, reverse pointer drag, Shift+click, arrows, Shift+arrows, Tab/Shift+Tab boundary exit, selectors, Enter, double activation, Escape, and visible return-to-object control.
- Pointer cancellation/capture loss restores the prior ephemeral selection. Touch movement remains scrollable instead of becoming an unconditional drag.
- Selection never enters the canonical document, history, persistence snapshot, or publication root.

## Measured Layout Integration

The hidden transform-free canonical probe waits for fonts and settled images, compiles and measures the exact source document, resolves rows with the existing Table layout code, captures the snapshot, and returns cloned measured plans only while source identity is still current. The visible `DocumentRenderer` receives those plans. Selection hit targets and highlights use the same `trackQ`, `rowQ`, and measured caption-to-grid `gridOffsetYQ`; no estimated row height or second solver is used. Measurement can update only ephemeral plans and never changes authored frames.

Editor-scoped containment clips Table ink at the authored preview frame while the hidden intrinsic probe remains uncontained. Diagnostics remain active and interaction chrome stays outside the canonical content root.

## Validation Evidence

Repository gates:

- `npm run lint` — PASS, 0 errors; 268 pre-existing warnings remain advisory.
- `npm run typecheck` — PASS.
- `npm test` — PASS: 244 files, 2,613 passed, 1 skipped.
- `npm run build` — PASS; existing chunk-size/dynamic-import advisories remain.
- `git diff --check` — PASS; only Windows line-ending notices.

Focused coverage:

- 9 action/schema/history tests.
- 7 pure selection tests.
- 3 grid gesture cancellation/stale/touch tests.
- 8 authoring diagnostics/measurement tests.
- architecture boundary suite PASS.

Visible Chromium W4.A proof:

- runner: `tests/vnext/proof/editor-table-axis-proof.mjs`;
- Chromium `151.0.7922.34`;
- click, Shift+click, reverse drag, keyboard navigation, Tab boundary, row/column/table selectors;
- row/column insert/remove, exact Redo IDs, span and last-axis failures without sequence/data loss;
- FIXED/MIN row and caption-offset overlay alignment against canonical DOM geometry;
- authored frame unchanged;
- zero attributable console/page errors;
- mobile screenshots and global overflow assertions at 320/360/390 px (`scrollWidth === viewport width`);
- selecting another object or empty canvas exits grid mode without trapping subsequent object interaction;
- reproducible local artifacts under ignored `scratch/w4a-table-proof/`.

Regression proofs:

- W2.C direct manipulation — PASS.
- W2.D snapping/diagnostics — PASS.
- W2.F Group editor and Group publication/PDF — PASS.
- W2.G direct Text editing — PASS.
- W3.C Save/reopen — PASS.
- canonical export matrix — PASS for 900/1500 px, DPR 1/2, screen/print; native PDF + PDF.js forensics PASS; R0.1.4 row projection READY.

## Save/Reopen Boundary

The W4.A Chromium fixture applies a real structural Table change, saves through `VNextPersistenceRuntime`/`SaveCoordinator` strict-CAS authority, reopens another catalog, then reopens the saved catalog and verifies exact row IDs, column IDs, and frame. The repository is a deterministic in-browser `CatalogRepository`. This is controlled integration evidence, not real-production Supabase E2E and not a substitute for the separate migration compatibility hardening gate required before first W4 production promotion.

## Explicitly Deferred

W4 remains incomplete. W4.A does not include cell content/drafts, merge/unmerge UI, row-role editing, annotation/legend editing, TSV/copy/paste, markers, Fit Height, presets, axis reorder, column drag-resize, rich text, Group drill-down, W5/W6, AI, migration `00026`, migration drift hardening, dependency modernization, production deploy, or merge.

## Required Next Gate

W4.A remains under review until canonical promotion. Next: independent Gemini audit, then Principal gate. The user retains exclusive explicit merge authorization.
