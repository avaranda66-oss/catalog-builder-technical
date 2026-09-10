# VNext W2.B — Object Application Actions

Status: In Progress

Date: 2026-09-10

Verified base SHA: `366c4fbed14750193b1a6645c0e3e0c57b82899b`

Verified base tree: `559726b0a401eb9ab46e6eb1cf7a84264f1630ba`

Branch: `feat/vnext-w2b-object-actions`

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

- [ ] All seven W2.B actions are present in the strict runtime-validatable `ApplicationActionSchema` and reject unknown fields.
- [ ] Geometry-changing actions accept safe integer U only; width/height are at least 1 U; negative x/y remain legal; committed mm round-trips exactly through `mmToU`.
- [ ] `object.insert` accepts no caller-owned canonical object ID, requires explicit zIndex, supports all six W2.A primitives, and validates page/assets/table references before avoidable ID allocation.
- [ ] Insert/duplicate allocate fresh canonical object/Table structural IDs and fresh RichText-local IDs while preserving asset references and source immutability.
- [ ] Missing, locked, wrong-type, invalid geometry, invalid z-order, and missing-asset failures use the frozen W2.B error codes and leave document/history/Redo unchanged.
- [ ] Move and resize mutate only Frame; same-U requests are semantic no-ops.
- [ ] Table move/resize preserve the complete TableModel structure and IDs; valid infeasible resize commits and later yields existing layout/publication diagnostics.
- [ ] Reorder interprets targetIndex against `(zIndex, page.objects array order)`, treats current visual index as no-op, and normalizes zIndex only after a real reorder with accurate affected metadata.
- [ ] `image.replace` changes only Image assetId and preserves frame/fit/focalPoint/zIndex/lock state.
- [ ] Undo/Redo restores exact committed snapshots for every W2.B action; insert/duplicate Redo performs no ID reallocation; representative W2.B transaction coalescing remains one Undo step.
- [ ] Application/domain/table remain independent of React/DOM/browser mutation authority.
- [ ] Focused proof, export proof, and all required repository gates pass.

## Identity Policy

Canonical global structural identity remains document, asset, page, object, table, column, row, cell, annotation, and legend IDs. RichText paragraph and inline IDs remain local to each independent RichText. Fresh instantiation regenerates local RichText IDs without promoting them to global identity scope. Asset resources remain document-owned references and are never duplicated or deleted as an object side effect.

## Geometry Boundary

W2.B mutation payloads use integer U. Serialized Frame remains mm using `writtenMm = suppliedU / 10_000`, with `mmToU(writtenMm) === suppliedU` required before commit. No epsilon geometry comparison, browser pixels, implicit clamping, or auto-fit behavior is introduced.

## Tasks

- [ ] Extend action contracts/error codes/public exports.
- [ ] Refactor fresh-ID object/Table/RichText instantiation and object lookup boundary.
- [ ] Implement insert/delete/duplicate/move/resize/reorder/image.replace execution semantics.
- [ ] Add adversarial action, identity, history, Table immutability, and architecture tests.
- [ ] Run focused tests, export proof, full gates, and scope audit.
- [ ] Update durable project/handoff memory with MERGE-DURABLE PR wording.
- [ ] Commit, push through DevOps authority, and create exactly one PR without merging.

## Dev Agent Record

### Completion Notes

- Implementation in progress.

### Validation

- Pending.

### File List

- `docs/stories/2026-09-10-vnext-w2b-object-actions.md`

### Deferred W2.C+

Selection/direct manipulation, snapping/guides, templates, Group, direct Text editing, persistence, translation, AI, and later-wave features remain out of scope.

### Change Log

- 2026-09-10: Story created from the authorized W2.B execution work order after independently verifying PR #18 merged and reconstructing canonical `origin/main` SHA/tree.
