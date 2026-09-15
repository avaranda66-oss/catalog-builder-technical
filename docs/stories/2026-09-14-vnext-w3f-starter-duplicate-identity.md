# W3.F — Starter / Duplicate Complete Identity Closure

Status: **InReview**

Date: 2026-09-14

Canonical implementation base: `cd4d20fbdfd89d1896385317a46052f0239c9ac4`

Canonical base tree: `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d`

Required branch: `feat/vnext-w3f-starter-duplicate-identity` (one W3.F PR; do not merge; do not start W3.G+).

## Story

As the Father, I need to create an independent catalog by duplicating an existing catalog or choosing a curated Starter, so that I can begin from useful authored content while receiving an ordinary new catalog with its own persistence, Recovery, session, and identity lineages.

## Frozen predecessor contract

- W3.E is the canonical predecessor and Library authority.
- `CatalogDocument` remains the sole authored authority; there is no clone DTO, Legacy authority, DOM serialization, renderer clone, or arbitrary JSON replacement.
- W3.C remains authoritative for exact reopen, Save/CAS, and validated authoritative acknowledgements.
- W3.D remains authoritative for Recovery discovery, namespaces, startup gating, and fresh open sessions.
- W3.E's hardened Create attempt state machine remains the only semantic Create authority: pending `catalogId`, `mutationId`, document, and optional origin remain exact across verification/replay; `NOT_FOUND` makes forward progress by replaying the same attempt; ACK/GET proof includes exact origin equality; auth changes invalidate stale completions.
- W3.F does not implement cloud asset transfer/upload, asset byte duplication, autosave, cross-document synchronization, Realtime/Presence/CRDT, hard Delete, Restore, W4, W5, W6, or a special Starter renderer.

## Live provenance gate

Verified before branch/story creation:

- live `origin/main`: `cd4d20fbdfd89d1896385317a46052f0239c9ac4`
- tree: `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d`
- parent: `e37cdf3105626ce83763964f8d2a56a1fda1e01b`
- subject: `feat(vnext): add W3.E catalog library (#34)`
- Quality Gates run `34875954678`: `completed / success`
- remote repository: `avaranda66-oss/catalog-builder-technical`
- no pre-existing local/remote branch or PR named `feat/vnext-w3f-starter-duplicate-identity` was found.

## Canonical architecture

### Full-document clone authority

- Introduce one application-layer full-document clone capability, named to repository convention and conceptually equivalent to `CatalogCloneService`.
- The authority accepts one validated `CatalogDocument` plus canonical application-layer identity allocation infrastructure and produces one validated `CatalogDocument`.
- Duplicate, Starter materialization, and a future Save-as-copy caller must converge on this authority. W3.F must not create separate cloners.
- Reuse/refactor `src/vnext/application/document.ts`, especially canonical identity enumeration/reservation, `IdAllocator`, RichText instantiation, Table remapping, object instantiation, and page instantiation. Do not add an independent identity walker unless live schema evidence proves the existing machinery cannot cover full-document cloning.
- Construct completely before Create dispatch, then pass `CatalogDocument` schema parsing and canonical table/domain validation. Persistence must never receive an unvalidated clone.

### Fresh identity closure

Allocate fresh authored identities for every identity-bearing node found in the live canonical schema, including at minimum:

- `CatalogDocument.id`
- `Page.id`
- every top-level object ID
- every `Group.id` and all group-child object IDs recursively
- Table object ID and `TableModel.id`
- table columns, rows, cells, annotations, and legend entries
- RichText paragraph and inline IDs in Text objects, table cells, table annotations, and legend entries
- any additional authored identity-bearing node discovered live.

The root catalog ID must be a fresh canonical lowercase UUID suitable for persistence even when the source root is only an older valid in-memory identity. Collision, duplicate allocation, or exhausted identity generation fails closed. The source is never normalized or re-identified in place.

### Internal references

Every internal authored reference resolves to the corresponding cloned identity. Table coverage includes `rowId`, `columnId`, `coveredBy`, cell `annotationIds`, table `annotationIds`, marker `legendEntryId`, and every additional canonical identity reference found live. No source structural identity may remain reachable from the cloned graph.

### Semantic preservation and assets

- Preserve authored locale, source/provenance semantics, style, fonts, palette, page dimensions, safe areas, geometry, z-index, locks, object content, RichText content/marks, Table semantics, Groups, AssetRefs, and all other authored fields exactly except fresh identities and the explicit Duplicate title.
- Duplicate title policy is `Cópia de <source title>`. If canonical title length rules reject it, use the smallest deterministic truncation that preserves the prefix and produces a valid title; test the boundary.
- Preserve `CatalogDocument.source` semantically. Never overwrite it with duplicate/starter provenance.
- Immutable Image/Icon `AssetRef` values remain shared and unchanged; do not duplicate bytes or invent W3.G behavior.

### Persistence origin

- Duplicate uses typed deterministic `CreateCatalogRequest.origin` metadata identifying copy semantics, exact source logical catalog ID, and authoritative fetched source revision.
- Starter uses typed deterministic origin metadata identifying Starter semantics, Starter ID, and Starter revision/version.
- Origin remains persistence metadata, not authored content.
- Exact Create acknowledgement verification must reject divergent origin, including present-versus-absent divergence.

### Duplicate application flow

- Library active-row action `Duplicar` fetches one authoritative source envelope by exact catalog ID.
- Parse and validate that exact snapshot; clone it once; record its fetched revision in origin; apply only the deterministic copy title; dispatch through the existing Create attempt authority.
- Ambiguous transport retains and reconciles/replays the exact same cloned catalog ID, mutation ID, document, and origin. Never regenerate a clone because transport certainty was lost.
- A later source revision does not alter or invalidate an already-created clone; there is no live linkage.
- Successful authoritative Create ACK makes the independent row appear in active Library and permits ordinary exact-route opening.

### Starter registry and materialization

- Add one static, typed, deterministic Starter registry below React.
- Each definition exposes a stable Starter ID, revision, Father-facing label/title, optional description/category, and a validated source `CatalogDocument` or canonical materialization function.
- A Starter is a source blueprint only. Each materialization passes through the same full-document clone authority as Duplicate and then the same Create attempt authority.
- Repeated materialization yields disjoint structural identity closures while immutable AssetRefs may remain equal.
- No remote marketplace, CMS, approval workflow, live Starter linkage, or special renderer is added.

### Auth, Recovery, Undo, and session isolation

- Capture active authority for each clone/Create operation. An operation started under A cannot finish into B's Library, open under B, or replay under B; stale completion is inert.
- The new catalog ID establishes a distinct W3.D Recovery namespace. Do not copy/delete source Recovery records or reuse source `openSessionId`.
- Clone creation is lifecycle work outside the source authored session and creates no source Undo entry.
- Opening the new catalog follows existing W3.C/W3.D behavior and creates an ordinary fresh session.

## Father UX

- Extend the compact W3.E Library rather than redesigning it.
- Add active-row action `Duplicar`.
- `Novo catálogo` intentionally offers `Em branco` and curated Starter choices without becoming a generic SaaS card wall.
- No IDs, revisions, mutation/CAS terminology, or technical persistence details appear in Father-facing UI.
- Loading, ambiguous Create verification/retry, offline, unauthorized, not-found, invalid-document, and remote-failure states remain actionable in plain language.
- Dialog/chooser focus, labels, keyboard use, and touch targets remain accessible.
- Mobile widths 320, 360, and 390 px have no horizontal overflow and preserve W3.E Library usability.

## Acceptance criteria — clone identity

- [x] CLONE-01 clone root ID differs from source root.
- [x] CLONE-02 every Page ID is fresh.
- [x] CLONE-03 every object, Group, and recursive Group-child ID is fresh.
- [x] CLONE-04 all Table structural identities are fresh: model, columns, rows, cells, annotations, legend entries, and any additional live schema identities.
- [x] CLONE-05 all RichText paragraph/inline IDs are fresh in every RichText-bearing location.
- [x] CLONE-06 source and clone authored structural identity sets have zero intersection, excluding intentionally shareable immutable AssetRefs.
- [x] CLONE-07 every Table internal reference remaps to clone identities.
- [x] CLONE-08 every clone internal reference resolves without dangling source/unknown identities.
- [x] CLONE-09 Image/Icon AssetRefs remain intentionally shared and unchanged.
- [x] CLONE-10 source document is byte/semantic-equivalent after cloning and receives no persistence, Recovery, archive, or Undo mutation.
- [x] CLONE-11 clone passes `CatalogDocument` schema parse plus canonical Table/domain validation before Create dispatch.
- [x] CLONE-12 two clones of the same source have mutually disjoint fresh structural identities.
- [x] CLONE-13 identity collision/allocation failure fails closed and never silently reuses an identity.
- [x] CLONE-14 a valid source with a non-persistence-compatible root produces a fresh persistence-compatible clone without source mutation.

## Acceptance criteria — origin

- [x] ORIGIN-01 Duplicate origin kind expresses copy semantics; origin ID is the exact source catalog ID; origin revision is the authoritative fetched revision.
- [x] ORIGIN-02 Starter origin kind expresses Starter semantics; origin ID is the stable Starter ID; origin revision is the registry revision.
- [x] ORIGIN-03 `CatalogDocument.source` remains semantically preserved for Duplicate and Starter clones.
- [x] ORIGIN-04 Create ACK/GET proof with divergent origin fails exact verification, preserves the pending attempt, and creates no second logical catalog.

## Acceptance criteria — Duplicate

- [x] DUP-01 active Library Duplicate succeeds through exact source fetch, canonical clone, and authoritative Create ACK.
- [x] DUP-02 source remains unchanged.
- [x] DUP-03 resulting active Library row is an independent catalog with deterministic copy title.
- [x] DUP-04 exact reopen of the duplicate works through canonical W3.C/W3.D bootstrap.
- [x] DUP-05 later edit/Save of duplicate does not affect source.
- [x] DUP-06 later edit/Save of source does not affect duplicate.
- [x] DUP-07 an ambiguous Duplicate Create reconciles/replays the exact attempt and cannot produce a ghost duplicate.
- [x] DUP-08 auth switch during Duplicate makes stale results inert and prevents cross-authority list/open/replay.

## Acceptance criteria — Starter

- [x] STARTER-01 registry is static, typed, deterministic, and below React.
- [x] STARTER-02 materialization uses the same canonical clone engine as Duplicate.
- [x] STARTER-03 repeated creation from one Starter produces mutually disjoint structural identity closures.
- [x] STARTER-04 immutable shared AssetRefs remain valid and unchanged.
- [x] STARTER-05 typed persistence origin is exact for Starter ID and revision.
- [x] STARTER-06 no live Starter/source linkage remains after materialization.

## Browser Father proof

- [x] Open the production Library route.
- [x] Duplicate a nontrivial existing catalog and prove the new active Library row.
- [x] Open the duplicate through the canonical exact route and prove authored content/layout preservation.
- [x] Edit and Save the duplicate, then prove the source is unchanged.
- [x] Return to Library, create from Starter, open it, and prove independence.
- [x] Repeat Starter creation and prove distinct structural identities.
- [x] Exercise one ambiguous Duplicate or Starter Create and prove same-attempt replay with one logical catalog and no ghost row.
- [x] Verify W3.D still gates Recovery normally.
- [x] Capture mobile proof at 320, 360, and 390 px with no horizontal overflow and usable actions/chooser/dialog.

## Tasks / Subtasks

- [x] Task 1 — Freeze live schema and application seams (AC: CLONE-01..14, ORIGIN-01..04)
  - [x] Enumerate every authored identity-bearing node and every internal reference in canonical schemas/validators.
  - [x] Trace reusable allocation/instantiation machinery in `src/vnext/application/document.ts` and document the single-authority design.
  - [x] Trace W3.E Create ambiguity/auth state machine and W3.C/W3.D reopen/recovery seams; freeze non-overlapping file leases.
- [x] Task 2 — Implement canonical full-document clone authority before UI (AC: CLONE-01..14, ORIGIN-03)
  - [x] Reuse/refactor canonical identity allocation and remapping; avoid a second walker/cloner.
  - [x] Enforce fresh persistence UUID root, collision fail-closed behavior, pure source handling, semantic preservation, and pre-persistence validation.
  - [x] Expose a typed application capability reusable by Duplicate, Starter, and future Save-as-copy.
  - [x] Add the adversarial multi-page/all-object fixture and focused identity/reference/asset/source tests.
- [x] Task 3 — Implement Starter and Duplicate application orchestration (AC: ORIGIN-01..04, DUP-01..08, STARTER-01..06)
  - [x] Add typed deterministic Starter registry/materialization below React.
  - [x] Extend/reuse the exact W3.E Create attempt coordinator rather than adding another Create algorithm.
  - [x] Implement exact source snapshot Duplicate, deterministic title policy, typed origin, ambiguous replay, and auth-stale isolation.
  - [x] Add focused application/persistence/reopen/recovery regression tests.
- [x] Task 4 — Extend Library UX after application APIs freeze (AC: DUP-01, DUP-03, DUP-08, STARTER-01, mobile/browser criteria)
  - [x] Add `Duplicar` and the intentional `Novo catálogo` blank/Starter chooser using existing Library visual language.
  - [x] Preserve accessible dialogs/focus/keyboard behavior, plain-language states, and 320/360/390 px usability.
  - [x] Add UI integration tests without placing clone/Create authority in React.
- [x] Task 5 — Build deterministic browser/proof fixtures (AC: browser/mobile criteria)
  - [x] Cover Duplicate, exact open, edit/Save independence, Starter, repeated Starter identity disjointness, ambiguous same-attempt replay/no ghost, and Recovery gate.
  - [x] Run the dedicated W3.F Chromium/mobile proof and all canonical VNext Chromium/native-PDF proofs.
- [x] Task 6 — Closure gates, independent audit, and exact-head delivery
  - [x] Run focused tests, W3.E Library regressions, W3.C reopen regressions, W3.D Recovery regressions, lint, typecheck, full tests, build, and `git diff --check`.
  - [x] Freeze candidate and obtain an independent read-only adversarial A/B/C audit specifically attacking shallow IDs, RichText/Table omissions, AssetRef over-cloning, source mutation/source misuse, origin divergence, second Create algorithm, ghost duplicates, auth crossing, live linkage, and W3.G leakage.
  - [x] Resolve all concrete blockers, update task checkboxes/File List/evidence, transition `InProgress → InReview`, commit coherent work, delegate push/PR to `@devops`, and wait for exact-head Quality Gates.
  - [x] Do not merge and do not start W3.G+.

## File leases

- Root integration authority reviews and integrates every patch.
- Story authority: this file only; after creation, only lifecycle-authorized sections may be updated by @dev/@qa.
- Lane A: read-only identity/schema/Create/recovery reconnaissance.
- Lane B: canonical clone core and its focused tests; exact paths freeze after recon.
- Lane C: Starter/Duplicate application integration and tests; no Lane B or React files.
- Lane D: Library React/CSS and UI tests only after application API freeze.
- Lane E: browser/proof fixtures/scripts only.
- Lane F: independent read-only candidate audit; no writes.
- `@devops` alone may push and create the one PR. No agent may merge.

## Testing requirements

- Unit/property-style identity closure tests must use an adversarial valid source containing multiple pages; Text with multiple paragraphs/inlines/marks; Table rows/columns/cells, merged/covered relationships, annotations, legend/marker references; Image/Icon AssetRefs; Shape/Line; and Group children.
- Tests must compare complete structural identity sets, internal-reference resolution, semantic equivalence excluding deliberate fields, source immutability, and two-clone disjointness.
- Application integration tests must prove exact origin metadata, Create ambiguity replay, auth isolation, independent Save behavior, exact reopen, and Recovery namespace behavior.
- UI/browser tests must use Father-visible outcomes and production routes, not only test-only service calls.
- Required closure commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`.
- Next.js-specific repository guidance is not applicable to this Vite project because `package.json` has no Next.js dependency and `node_modules/next/dist/docs/` is absent; no Next.js APIs are to be introduced.

## Story draft checklist result

| Category | Status | Evidence |
| --- | --- | --- |
| Goal & context clarity | PASS | Father outcome, predecessor contract, lifecycle boundaries, and exclusions are explicit. |
| Technical guidance | PASS | Canonical clone/Create authorities, identity/reference closure, origin, auth, Recovery, and UI seams are constrained. |
| Reference effectiveness | PASS | W3.E story and exact live code seams are named; requirements are reproduced rather than delegated to references. |
| Self-containment | PASS | Full acceptance matrices, edge cases, failure behavior, and scope exclusions are included. |
| Testing guidance | PASS | Adversarial fixture, focused/application/UI/browser/mobile/full gates are explicit and measurable. |
| CodeRabbit integration | N/A | `coderabbit_integration.enabled` is not configured in `.aiox-core/core-config.yaml`; manual AIOX QA plus available CLI review is required. |

Final assessment: **READY**. The user supplied the complete Principal execution contract and explicitly authorized implementation.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-14 | 0.1.0 | W3.F implementation story created from the frozen Principal contract and exact live W3.E provenance. Status: Ready. | @sm |
| 2026-09-14 | 0.2.0 | Development started in orchestrated sequential mode. Status: Ready → InProgress. | @dev |
| 2026-09-15 | 1.0.0 | W3.F implementation, focused tests, browser/mobile proofs, full ladder, and adversarial audit completed. Status: InProgress → InReview. | @dev / @qa |

## Dev Agent Record

### Agent model used

Gemini 3.8 Flash (delivery closure continuation)

### Debug Log References

- Focused W3.F tests: 53 passed in 4.04s (`catalog-clone.test.ts`, `catalog-starter-registry.test.ts`, `catalog-library-service.test.ts`, `catalog-library-ui.test.tsx`, `architecture-boundary.test.ts`, `catalog-library-open-recovery.test.tsx`).
- Full unit/property test suite: 231 files passed, 2484 passed, 1 skipped in 72.28s (`npm test`).
- Typecheck: clean (`tsc --noEmit` exit code 0).
- Linter: 0 errors, 268 existing warnings (`npm run lint`).
- Build: clean production bundle built in 17.68s (`npm run build`).
- Git diff whitespace check: clean (`git diff --check` exit code 0).
- Dedicated W3.F Chromium/mobile proof: PASS (`w3f-starter-duplicate-proof.mjs`).
- Canonical VNext proofs: 11/11 PASS (`w3e-catalog-library-proof.mjs`, `w3c-save-reopen-proof.mjs`, `w3d-indexeddb-adapter-proof.mjs`, `w3d-physical-recovery-proof.mjs`, `editor-direct-manipulation-proof.mjs`, `editor-group-proof.mjs`, `editor-snapping-diagnostics-proof.mjs`, `editor-template-insertion-proof.mjs`, `editor-text-proof.mjs`, `export-proof.mjs`, `group-export-proof.mjs`).

### Completion Notes List

- Canonical single clone authority implemented in `CatalogCloneService` in `src/vnext/application/document.ts`.
- Full fresh authored structural identity closure covering document, pages, objects, groups, table models, columns, rows, cells, annotations, legend, and richText paragraphs/inlines.
- Exact table reference remapping (`rowId`, `columnId`, `coveredBy`, `annotationIds`, `legendEntryId`).
- Shared immutable AssetRefs preserved without byte duplication.
- Source immutability preserved; source document is byte-identical before and after cloning.
- `CatalogDocument.source` preserved semantically.
- Typed deterministic origin metadata (`CreateCatalogRequest.origin`) for Duplicate (`originKind: 'duplicate'`) and Starter (`originKind: 'starter'`).
- Single shared Create authority: `createBlank`, `duplicate`, and `createFromStarter` all funnel through `createPreparedDocument` and the hardened W3.E Create state machine.
- Ambiguous Create replay reuses the exact same attempt (`catalogId`, `mutationId`, `documentSnapshot`, `origin`), preventing ghost copies.
- Auth isolation enforces that operations started under one authority cannot complete into or be viewed by another authority.
- Library UX extended with `Duplicar` row action and `Novo catálogo` modal chooser offering `Em branco` and registered Starters.
- Full mobile responsiveness at 320, 360, and 390 px with touch targets >= 44px and zero horizontal overflow.
- W3.G scope strictly excluded.

### File List

- `src/vnext/app/CatalogLibrary.tsx`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/application/document.ts`
- `src/vnext/application/index.ts`
- `src/vnext/library/index.ts`
- `src/vnext/library/service.ts`
- `src/vnext/library/starter-registry.ts`
- `tests/vnext/application/catalog-clone.test.ts`
- `tests/vnext/library/catalog-starter-registry.test.ts`
- `tests/vnext/library/catalog-library-open-recovery.test.tsx`
- `tests/vnext/library/catalog-library-service.test.ts`
- `tests/vnext/library/catalog-library-ui.test.tsx`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `tests/vnext/proof/fixtures/w3e-library-browser.tsx`
- `tests/vnext/proof/w3e-catalog-library-proof.mjs`
- `tests/vnext/proof/w3f-starter-duplicate-proof.mjs`
- `docs/stories/2026-09-14-vnext-w3f-starter-duplicate-identity.md`

## QA Results

### Acceptance Checklist Verification

- CLONE-01..14: Verified PASS via `tests/vnext/application/catalog-clone.test.ts` and dedicated browser proof.
- ORIGIN-01..04: Verified PASS via `tests/vnext/library/catalog-library-service.test.ts`.
- DUP-01..08: Verified PASS via unit, UI, and browser proof.
- STARTER-01..06: Verified PASS via registry tests, service tests, and browser proof.
- Browser Father proof: Verified PASS via `w3f-starter-duplicate-proof.mjs`.

### Constrained Adversarial Audit

- Result: **A — ACCEPT**.
- Attacked vectors:
  - Shallow copied authored IDs: None. Full recursive allocator re-identification.
  - Missed RichText IDs: None. Paragraphs and inlines recursively re-identified across texts, cells, annotations, and legend entries.
  - Missed Table references: None. Strict ID mapping with fail-closed validation.
  - Source mutation: None. Source immutability tested and preserved.
  - AssetRef over-cloning: None. Asset references preserved as shared immutable values.
  - `CatalogDocument.source` misuse: None. Preserved semantically.
  - Origin divergence: None. Typed `CreateCatalogRequest.origin` validated against ACK.
  - Second/weaker Create state machine: None. All paths use `createPreparedDocument`.
  - Ambiguous Duplicate/Starter ghost copies: None. Exact same attempt reconciled/replayed.
  - Auth crossing: None. `authorityScopeId` validated pre/post dispatch.
  - Recovery lineage copying/deletion: None. Fresh catalog ID creates separate namespace; source recovery records untouched.
  - Live Starter/source linkage: None. Cloned documents are independent persistence entities.
  - W3.G scope leakage: None. Zero asset upload bridge, autosave, or CRDT code added.

### Scope Confirmation

- W3.F delivery is frozen.
- W3.G implementation is NOT started.
- Merging is strictly blocked pending explicit user authorization.
