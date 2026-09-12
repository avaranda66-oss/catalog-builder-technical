# W3.A — Persistence Contracts + Exact Canonical Round-Trip

Status: **IMPLEMENTED / UNDER REVIEW / NOT CANONICAL**

Date: 2026-09-11

Canonical base: `b34156c597dcd47a5ab6d154f73ffa7a323d4664`

Canonical tree: `0df4eedfcf649a10423a4a3153233ff6c424020f`

W3.0 gate: PR #28 merged; Quality Gate run `34668097170` completed `SUCCESS` for the canonical base.

## Objective

Establish the pure VNext persistence seam for one complete validated `CatalogDocument` snapshot plus thin persistence/lifecycle metadata. Prove exact canonical semantic/structural round-trip without introducing a second authored document model.

## Scope / acceptance criteria

- [x] Pure `src/vnext/persistence/` contract layer remains React-, DOM-, Supabase-, network-, browser-storage-, and Legacy-authority-free.
- [x] Persistence envelope keeps `catalogId`, `remoteRevision`, projections, lifecycle metadata, schema metadata, and the complete `CatalogDocument` snapshot.
- [x] `remoteRevision` and archive metadata remain outside authored `CatalogDocument`.
- [x] Snapshot serialization validates the existing canonical VNext document and preserves authored structure, ordering, IDs, integer-U-compatible geometry, and AssetRefs exactly.
- [x] Snapshot load inspects schema version, rejects unsupported versions explicitly, and performs canonical schema + domain/table validation without repair.
- [x] Envelope mismatches for id/title/locale/schema fail explicitly without rewriting authored content.
- [x] Non-UUID canonical roots still parse; persistence compatibility reports them as incompatible without rewriting the root.
- [x] Infrastructure-neutral repository contract exposes lightweight list metadata and typed CAS/create/get/archive semantics using only VNext persistence types.
- [x] Semantic errors distinguish not-found, unauthorized, archived, conflict, invalid document, unsupported version, offline, remote failure, and ambiguous commit outcome.
- [x] Focused tests cover complete W2 semantics including Text/RichText/Image/AssetRef/Table/annotations/legend/Shape/Line/Icon/Group and group-local frames.
- [x] Architecture proof prevents React, browser persistence, Supabase, and Legacy persistence authority leakage into the W3.A pure boundary.
- [x] Full repository gates pass.

## Explicit exclusions

W3.B+ is out of scope: no Supabase schema/RPC/client, remote implementation, SaveCoordinator, save UI, autosave, local recovery, Catalog Library UI, conflict UI, translation, publication changes, or merge.

## Architecture decisions

- `CatalogDocument` remains the sole authored authority.
- Persistence serializes the validated canonical snapshot directly; no normalized page/object/table persistence model exists.
- `CatalogDocument.source.serverVersion` remains authored provenance and is never used as the W3 CAS revision.
- W3.A defers runtime generation of new UUID roots; it freezes only the pure UUID compatibility boundary.
- Repository listing returns lightweight metadata and never requires a full document download.

## Files

- `src/vnext/persistence/contracts.ts`
- `src/vnext/persistence/snapshot.ts`
- `src/vnext/persistence/index.ts`
- `tests/vnext/persistence/persistence-contracts.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `docs/stories/2026-09-11-vnext-w3a-persistence-contracts-roundtrip.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`
- `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`

## Tests / proofs

- Focused W3.A + architecture proof: **23/23 PASS** across 2 files.
- Full `npm test`: **214 test files PASS; 2314 tests PASS; 1 skipped; 2315 total**.
- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS with 0 errors / 268 existing warnings**.
- `npm run build`: **PASS**; Vite built 2331 modules in 11.09s, with existing chunk/dynamic-import warnings.
- Adversarial proof covers deep structural equality, integer-U geometry, Group-local geometry, all W2 primitives, RichText identities, Table semantics/presentation, AssetRef integrity metadata, external remote revision, archive separation, strict projection consistency, unsupported schema failure, invalid-document failure, and non-UUID compatibility without rewrite.

## PR / CI truth

Branch: `feat/vnext-w3a-persistence-contracts-roundtrip`

PR/head/tree/CI: pending push and GitHub review; local implementation gates are green. Exact remote head/tree/check truth will be recorded from GitHub after push.

## State

W3.0: **CANONICAL**

W3.A: **IMPLEMENTED / UNDER REVIEW / NOT CANONICAL**

W3.B: **NOT STARTED**
