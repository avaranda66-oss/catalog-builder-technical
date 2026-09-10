# VNext W2.B — Object Application Actions

Status: Implementation carried by PR #19; GitHub is authority for live review/merge state

Date: 2026-09-10

Verified base SHA: `366c4fbed14750193b1a6645c0e3e0c57b82899b`

Verified base tree: `559726b0a401eb9ab46e6eb1cf7a84264f1630ba`

Branch: `feat/vnext-w2b-object-actions`

Implementation commit: `40a0a965be7dee4d6c188ea88e6b5bd5836ea53b`

Implementation tree: `92091118b2d0e2a4ff14f2431a89e9f3e5789bcc`

W2.B implementation/promotion vehicle: PR #19. GitHub is authority for its live review/merge state.

## Goal

Implement W2.B on the merged W2.A canonical base so Text, Image, Table, Shape, Line, and Icon objects can be inserted and manipulated exclusively through strict, browser-independent Application Actions and the immutable `DocumentSession` API.

PR #18 was independently verified MERGED at the base SHA above before this branch was created. These values are provenance only; GitHub remains authority for live branch and PR state.

## Scope

- `object.insert`
- `object.delete`
- `object.duplicate`
- `object.move`
- `object.resize`
- `object.reorder`
- `image.replace`
- Minimum reusable application-layer fresh-ID instantiation needed by insert/duplicate and existing page duplication.
- Integer-U geometry input with exact U → mm materialization and no page/safe-area clamping.
- Lock, failure, semantic no-op, metadata, Undo/Redo, and `transactionId` behavior inherited from W1.
- Table resize commit-then-diagnose behavior with TableModel structural immutability.

## Acceptance Criteria

- [x] All seven W2.B actions are present in the strict runtime-validatable `ApplicationActionSchema` and reject unknown fields.
- [x] Geometry-changing actions accept safe integer U only; width/height are at least 1 U; negative x/y remain legal; committed mm round-trips exactly through `mmToU`.
- [x] `object.insert` accepts no caller-owned canonical object ID, requires explicit zIndex, supports all six W2.A primitives, and validates page/assets/table references before avoidable ID allocation.
- [x] Insert/duplicate allocate fresh canonical object/Table structural IDs and fresh RichText-local IDs while preserving asset references and source immutability.
- [x] Missing, locked, wrong-type, invalid geometry, invalid z-order, and missing-asset failures use the frozen W2.B error codes and leave document/history/Redo unchanged.
- [x] Move and resize mutate only Frame; same-U requests are semantic no-ops.
- [x] Table move/resize preserve the complete TableModel structure and IDs; valid infeasible resize commits and later yields existing layout/publication diagnostics.
- [x] Reorder interprets targetIndex against `(zIndex, page.objects array order)`, treats current visual index as no-op, and normalizes zIndex only after a real reorder with accurate affected metadata.
- [x] `image.replace` changes only Image assetId and preserves frame/fit/focalPoint/zIndex/lock state.
- [x] Undo/Redo restores exact committed snapshots for every W2.B action; insert/duplicate Redo performs no ID reallocation; representative W2.B transaction coalescing remains one Undo step.
- [x] Application/domain/table remain independent of React/DOM/browser mutation authority.
- [x] Focused proof, export proof, and all required repository gates pass.

## Identity Policy

Canonical global structural identity remains document, asset, page, object, table, column, row, cell, annotation, and legend IDs. RichText paragraph and inline IDs remain local to each independent RichText. Fresh instantiation regenerates local RichText IDs without promoting them to global identity scope. Asset resources remain document-owned references and are never duplicated or deleted as an object side effect.

## Geometry Boundary

W2.B mutation payloads use integer U. Serialized Frame remains mm using `writtenMm = suppliedU / 10_000`, with `mmToU(writtenMm) === suppliedU` required before commit. No epsilon geometry comparison, browser pixels, implicit clamping, or auto-fit behavior is introduced.

## Tasks

- [x] Extend action contracts/error codes/public exports.
- [x] Refactor fresh-ID object/Table/RichText instantiation and object lookup boundary.
- [x] Implement insert/delete/duplicate/move/resize/reorder/image.replace execution semantics.
- [x] Add adversarial action, identity, history, Table immutability, and architecture tests.
- [x] Run focused tests, export proof, full gates, and scope audit.
- [x] Update durable project/handoff memory with MERGE-DURABLE PR wording.
- [x] Commit, push, and create exactly one PR without merging.

## Dev Agent Record

### Completion Notes

- Implemented strict W2.B Object Application Actions for all six W2.A primitives through the existing W1 execution/session boundary.
- Shared fresh-ID instantiation now serves object insert/duplicate and existing page duplication while preserving global structural identity scope and RichText-local identity scope.
- Table move/resize changes only Frame. A valid resize to an infeasible width remains committed while the existing renderer/Table pipeline reports `TABLE_WIDTH_INFEASIBLE`.
- PR #19 is the W2.B implementation/promotion vehicle. GitHub is authority for live review/merge state; this story does not claim merge, canonical status, or Principal acceptance.

### Validation

- `npx vitest run tests/vnext/application tests/vnext/proof`: PASS — 10 files, 112/112 tests.
- `node tests/vnext/proof/export-proof.mjs`: PASS — full screen/print matrix, native PDF + PDF.js forensics, W2.A representative primitive Chromium/native PDF proof, and R0.1.4 row-span readiness.
- `git diff --check`: PASS.
- `npm run lint`: PASS — 0 errors, 268 existing warnings.
- `npm run typecheck`: PASS.
- `npm test`: PASS — 206 files; 2,158 passed, 1 skipped (2,159 total).
- `npm run build`: PASS.

### File List

- `docs/stories/2026-09-10-vnext-w2b-object-actions.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/document.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `tests/vnext/application/object-actions.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`

### Deferred W2.C+

Selection/direct manipulation, snapping/guides, templates, Group, direct Text editing, persistence, translation, AI, and later-wave features remain out of scope.

### Change Log

- 2026-09-10: Story created from the authorized W2.B execution work order after independently verifying PR #18 merged and reconstructing canonical `origin/main` SHA/tree.
- 2026-09-10: W2.B implementation validated through focused VNext proofs, Chromium/native-PDF regression proof, lint/typecheck/full tests/build, committed as `40a0a965be7dee4d6c188ea88e6b5bd5836ea53b`, pushed normally, and carried by PR #19.
- 2026-09-10: Durable project state and Principal handoff updated with PR #19 merge-durable wording. Before W2.C, independently verify PR #19 merged into canonical `main` and reconstruct the resulting `main` SHA/tree.
