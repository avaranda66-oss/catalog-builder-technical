# W3.A — Persistence Contracts + Exact Canonical Round-Trip

Status: **IMPLEMENTED / UNDER REVIEW / NOT CANONICAL**

Date: 2026-09-11

Canonical base: `b34156c597dcd47a5ab6d154f73ffa7a323d4664`

Canonical tree: `0df4eedfcf649a10423a4a3153233ff6c424020f`

W3.0 gate: PR #28 merged; Quality Gate run `34668097170` completed `SUCCESS` for the canonical base.

## Objective

Establish the pure VNext persistence seam for one complete validated `CatalogDocument` snapshot plus thin persistence/lifecycle metadata. Prove exact canonical semantic/structural round-trip for JSON-safe canonical documents, with deterministic representational absence for optional authored properties whose runtime value is `undefined`, without introducing a second authored document model.

## Scope / acceptance criteria

- [x] Pure `src/vnext/persistence/` contract layer remains React-, DOM-, Supabase-, network-, browser-storage-, and Legacy-authority-free.
- [x] Persistence envelope keeps `catalogId`, `remoteRevision`, projections, lifecycle metadata, schema metadata, and the complete `CatalogDocument` snapshot.
- [x] `remoteRevision` and archive metadata remain outside authored `CatalogDocument`.
- [x] Snapshot serialization validates the existing canonical VNext document first, then produces the explicit JSON-safe representation by omitting only optional object properties whose value is `undefined`; JSON-safe authored structure, ordering, IDs, integer-U-compatible geometry, and AssetRefs remain exact.
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
- Persistence serializes the validated canonical snapshot directly; the only representation step is deterministic omission of object properties whose validated optional value is `undefined`. No normalized page/object/table persistence model exists.
- `CatalogDocument.source.serverVersion` remains authored provenance and is never used as the W3 CAS revision.
- W3.A defers runtime generation of new UUID roots; it freezes only the pure UUID compatibility boundary.
- Repository listing returns lightweight metadata and never requires a full document download.

## Principal JSON-safe round-trip amendment — 2026-09-12

Principal-audited provenance before this amendment:

- PR #29: `feat(vnext): add W3.A persistence contracts and round-trip`.
- Base/main: `b34156c597dcd47a5ab6d154f73ffa7a323d4664`.
- Previous head: `a5a919e9940ddda9d437619f78e23e7db845206b`.
- Previous head tree: `33107b81068e029c3c36ffb2232d25fe1a11a0ea`.
- Required Quality Gate run `34670028711`, attempt 2: `SUCCESS`.

The counterexample was reproduced against the actual W3.A boundary before the fix. `duplicatePageWithFreshIds` duplicated a valid page with no safe area and produced a valid canonical runtime page with an own property equivalent to `{ safeArea: undefined }`. The adversarial persistence test proved `hasOwnProperty('safeArea') === true` on the source while `parseCanonicalSnapshot` still preserved that runtime representation. The new expected assertion failed with `expected true to be false`, proving the boundary had not yet made JSON-safe absence explicit. JSON serialization would then omit that property as a side effect.

The frozen persistence rule is that an optional authored property that is absent and the same optional property present with value `undefined` do not represent different authored semantics. The durable JSON-safe canonical representation uses property absence. Validation occurs before this representation step, so unknown authored fields remain invalid even when their value is `undefined`. `null` is not treated as `undefined`; where the persistence schema permits `null`, it remains `null`.

`src/vnext/persistence/snapshot.ts` now creates a fresh JSON-safe canonical graph after canonical schema/domain validation. Arrays are copied in original order. Defined values, IDs, authored geometry, Group-local frames, RichText, Table topology/IDs/spans/annotations/legend, AssetRefs, and `source.serverVersion` are preserved. Only object properties whose validated value is `undefined` are omitted. The source object is not mutated. `remoteRevision` remains envelope metadata outside `CatalogDocument`.

The focused `src/vnext/**` producer audit found four relevant authored optional-property emissions in `src/vnext/application/document.ts`: duplicated page `safeArea`, duplicated cell `coveredBy`, duplicated cell `annotationIds`, and duplicated table `annotationIds`. They now omit the property when the source has no value. Existing `instantiatePageWithFreshIds`, `execute.ts` object insertion for `locked`, and `template-registry.ts` safe-area handling already used omission. Other `undefined` occurrences under `src/vnext/app/`, `application/session.ts`, lookup return types, gesture/snapping state, rendering, and diagnostics are ephemeral or non-document state and were not changed.

Regression coverage now proves the historical explicit-`undefined` shape normalizes deterministically to absence, the input remains unchanged, ordinary JSON-safe rich fixtures still deep-round-trip exactly, application duplication naturally omits empty optional authored fields, unknown fields including an unknown `undefined` field remain rejected, legal nullable persistence metadata remains `null`, and remote revision stays outside authored content. The existing rich fixture continues to cover array ordering, IDs, integer-U geometry, Group-local geometry, RichText identities/content, complete Table structure/presentation, all primitives, AssetRefs, and authored provenance.

## Files

- `src/vnext/application/document.ts`
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

- JSON-safe persistence regression: **13/13 PASS**.
- Architecture boundary proof: **13/13 PASS**.
- Application duplication regressions: `application-actions.test.ts` **14/14 PASS** and `object-actions.test.ts` **26/26 PASS**.
- Full `npm test`: **214 test files PASS; 2317 tests PASS; 1 skipped; 2318 total**.
- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS with 0 errors / 268 existing warnings**.
- `npm run build`: **PASS**; Vite built 2331 modules in 10.82s, with existing chunk/dynamic-import warnings.
- Adversarial proof covers JSON-safe undefined omission and source immutability in addition to deep structural equality, integer-U geometry, Group-local geometry, all W2 primitives, RichText identities, Table semantics/presentation, AssetRef integrity metadata, external remote revision, legal null preservation, archive separation, strict projection consistency, unsupported schema failure, invalid-document/unknown-field failure, and non-UUID compatibility without rewrite.

## PR / CI truth

Branch: `feat/vnext-w3a-persistence-contracts-roundtrip`

Principal-audited pre-amendment live head/tree and prior CI are recorded above. Local amendment gates are green. The exact amendment commit/tree and GitHub checks are established only after this story is committed and pushed; they are read back from GitHub for the Principal re-audit report rather than self-referencing a commit identity from inside that same commit.

## State

W3.0: **CANONICAL**

W3.A: **IMPLEMENTED / UNDER REVIEW / NOT CANONICAL**

W3.B: **NOT STARTED**
