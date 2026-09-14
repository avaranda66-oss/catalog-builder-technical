# W3.E — Catalog Library

Status: **Ready for Principal W3.E Implementation Audit — DO NOT MERGE**

Date: 2026-09-14

Canonical implementation base: `e37cdf3105626ce83763964f8d2a56a1fda1e01b`

Canonical base tree: `c7bf0865b9f51dd4ea624a196f08dec496aeed67`

Required branch: `feat/vnext-w3e-catalog-library` (one W3.E PR; no merge without explicit Principal authorization).

## Story

As the Father, I need a simple catalog home where I can find, create, open, rename, and archive catalogs without seeing persistence internals, so that normal catalog work begins from ordinary professional software instead of technical infrastructure.

## Frozen predecessor contract

- `CatalogDocument` remains the sole authored document authority.
- `CatalogListItem` and other Library metadata are projection/index data only.
- W3.C remains authoritative for Save, CAS, exact reopen, validation, and remote acknowledgement.
- W3.D remains authoritative for local Recovery discovery, startup gating, retention, and protected choices.
- Library Open selects an exact `catalogId`; `/v2?catalog=<catalogId>` enters the existing bootstrap/reopen/recovery lifecycle.
- W3.E does not implement Starter/Duplicate cloning, complete identity remapping, Save-as-copy, Restore, hard Delete, folders, ownership UX, autosave, realtime, W4, W5, or W6.

## Live recon / API freeze

Verified against canonical `main` before implementation:

- SHA `e37cdf3105626ce83763964f8d2a56a1fda1e01b`
- tree `c7bf0865b9f51dd4ea624a196f08dec496aeed67`
- parent `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7`
- Quality Gate run `34844237602`: `completed / success`

Discovered canonical seams:

- `src/vnext/persistence/contracts.ts`
  - `CatalogRepository`
  - `CatalogListItem`
  - `createCatalog`, `getCatalog`, `saveCAS`, `archiveCAS`
- `src/vnext/application/document.ts`
  - `createCatalogDocument()` is the safe canonical blank-document factory.
- `src/vnext/application/contracts.ts` / session execution
  - `document.rename` is the canonical authored title mutation.
- `src/vnext/persistence/save-coordinator.ts`
  - `SaveCoordinator` owns canonical Save/CAS acknowledgement and conflict behavior.
- `src/vnext/persistence/reopen-coordinator.ts`
  - `CanonicalReopenCoordinator.open()` owns exact-ID validated reopen.
- `src/vnext/persistence/runtime.ts`
  - `VNextPersistenceRuntime` composes Save/Reopen/Recovery authority.
- `src/vnext/persistence/supabase-repository.ts`
  - listing uses lightweight `list_vnext_catalogs_v1`; no document snapshot in `CatalogListItem`.
- `supabase/migrations/00024_vnext_catalog_persistence.sql`
  - archive is metadata outside authored snapshot, advances remote revision, and normal Save rejects archived catalogs.
- `src/vnext/app/bootstrap.tsx`
  - `/v2?catalog=<id>` already delegates to canonical reopen and then W3.D runtime gating.

Frozen W3.E application seam:

- Add one typed `CatalogLibraryService` below React.
- `list()` calls `CatalogRepository.listCatalogs()` only and performs deterministic projection filtering/search/sort locally.
- `createBlank()` uses `createCatalogDocument(createId)`, persists through `CatalogRepository.createCatalog()`, validates the returned envelope, and only then returns the exact catalog ID for ordinary route opening.
- `rename()` fetches the authoritative full envelope only for the selected catalog, creates an ephemeral canonical `DocumentSession`, executes `document.rename`, and saves through `SaveCoordinator`; list projection updates only after authoritative acknowledgement.
- `archive()` fetches the selected authoritative envelope to establish current revision and then invokes canonical `archiveCAS`; no document mutation is used.
- Duplicate is represented only as a disabled/capability-gated affordance for W3.F.
- UI does not own revision arithmetic, document reconstruction, mutation IDs, or CAS retries.

## File leases

One root integration writer owns all files in this session because the real AIOX `Task`/subagent primitive is not exposed by the current tool registry. No overlapping writers are permitted.

- Lane B — application core: new Library service + focused tests.
- Lane C — UI: Library screen, bootstrap/mode integration, styles.
- Lane D — proof: Library browser fixture/proof + mobile assertions.
- Lane E — independent audit: read-only after candidate freeze.
- `@devops` remains the only authority for remote push and PR creation.

## Acceptance criteria / deterministic matrix

- [x] LIB-01 empty active Library shows Father-facing empty state and `Criar novo catálogo`.
- [x] LIB-02 metadata listing performs no full `CatalogDocument` fetch per row.
- [x] LIB-03 default view is active-only.
- [x] LIB-04 archived view is separate.
- [x] LIB-05 title search works deterministically.
- [x] LIB-06 ordering is deterministic, recently updated first by default with useful title ordering available.
- [x] LIB-07 blank create uses fresh lowercase UUID-compatible root identity, valid canonical document, authoritative create ACK, then ordinary exact route open.
- [x] LIB-08 Open uses exact catalog ID and the W3.C/W3.D bootstrap pipeline.
- [x] LIB-09 missing catalog has no first/nearest/title fallback.
- [x] LIB-10 Rename uses canonical `document.rename`, complete snapshot Save/CAS, and projection changes only after ACK.
- [x] LIB-11 stale Rename fails closed on revision conflict.
- [x] LIB-12 failed Rename does not create Library-only title authority.
- [x] LIB-13 Archive requires explicit confirmation.
- [x] LIB-14 successful Archive removes from active and appears in archived view.
- [x] LIB-15 stale Archive conflicts/fails closed.
- [x] LIB-16 stale pre-archive Save cannot resurrect an archived catalog.
- [x] LIB-17 stale pre-archive Rename cannot resurrect an archived catalog.
- [x] LIB-18 stale open tab cannot ordinary Save or implicitly unarchive after Archive.
- [x] LIB-19 Library Open preserves W3.D Recovery startup gate before authoring.
- [x] LIB-20 Library navigation/archive does not delete unrelated Recovery records.
- [x] LIB-21 unauthorized Library row/action fails closed.
- [x] LIB-22 Duplicate cloning is not implemented in W3.E.
- [x] LIB-23 no hard Delete exists.
- [x] LIB-24 no Restore/Unarchive contract is invented.

## Father UX

- Heading: `Catálogos`
- Primary action: `Novo catálogo`
- Search: `Buscar catálogos`
- Views: `Ativos` / `Arquivados`
- Active actions: `Abrir`, `Renomear`, `Arquivar`
- Duplicate may be shown only disabled with clear future capability semantics.
- Archive copy explains that the catalog leaves the active list and is not permanently deleted.
- Errors distinguish not found, unauthorized, offline, remote failure, conflict, and invalid document in Father language.
- No revision, mutation, CAS, database, JSON, Git, or Recovery-internal terminology is exposed.

## Mobile / accessibility

- 320–390 px widths must have no horizontal overflow.
- Search, active/archived switch, create, row actions, rename dialog, and archive confirmation remain touch-usable.
- Keyboard focus is visible and dialogs expose accessible labels/titles.
- Desktop remains a compact professional library rather than a generic card wall.

## Stop conditions / known boundary

- If blank creation cannot use the canonical factory, stop for Principal decision.
- No cross-tab dirty-state discovery is invented. Same-tab navigation away from dirty editor work must be guarded. A separate stale editor tab is protected by existing CAS/archived server semantics: after another surface archives or renames, stale Save/Rename must fail closed rather than silently overwrite/recreate.
- Recovery records are never broadly deleted by Library operations.
- No W3.F identity clone logic may enter this branch.

## Required validation

- focused Library service tests
- repository contract/race tests
- Recovery-aware Open integration test
- real Chromium Father Library flow
- narrow mobile browser proof
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`
- existing VNext Chromium/native-PDF proofs
- exact-head CI
- independent adversarial candidate audit

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-14 | 0.1.0 | W3.E implementation story created from the frozen Principal execution contract and live canonical recon. | @sm |
| 2026-09-14 | 0.2.0 | Development started after API/file-lease freeze. | @dev |
| 2026-09-14 | 0.3.0 | First adversarial audit findings integrated: auth-lineage async protection, hardened Create ACK reconciliation, stale-list race protection, production-route proof coverage, and dialog keyboard/focus behavior. | @dev |
| 2026-09-14 | 0.4.0 | Recovered second read-only audit returned B with two localized blockers; both received narrow amendments and regression coverage, followed by an A-accept amendment micro-audit. | @dev |
| 2026-09-14 | 1.0.0 | Delivery candidate frozen with full closure gates and canonical proof set green; W3.F implementation remains not started. | @dev |

## Dev Agent Record

### Agent model used

Codex Native2 root orchestrator. Real AIOX Task/subagent spawning was checked in the current tool registry and is unavailable; role authorities are therefore executed sequentially by the root with explicit file leases and no fabricated parallel-agent evidence.

### File list

- `.aiox/external-runs/20260914-134449-w3e-independent-audit/codex.log`
- `.aiox/external-runs/20260914-134449-w3e-independent-audit/command.txt`
- `.aiox/external-runs/20260914-134449-w3e-independent-audit/metadata.json`
- `.aiox/external-runs/20260914-134449-w3e-independent-audit/output.md`
- `.aiox/external-runs/20260914-134449-w3e-independent-audit/prompt.md`
- `.aiox/external-runs/20260914-141312-w3e-independent-reaudit/codex.log`
- `.aiox/external-runs/20260914-141312-w3e-independent-reaudit/command.txt`
- `.aiox/external-runs/20260914-141312-w3e-independent-reaudit/metadata.json`
- `.aiox/external-runs/20260914-141312-w3e-independent-reaudit/output.md`
- `.aiox/external-runs/20260914-141312-w3e-independent-reaudit/prompt.md`
- `docs/stories/2026-09-14-vnext-w3e-catalog-library.md`
- `src/vnext/app/CatalogLibrary.tsx`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/library/index.ts`
- `src/vnext/library/service.ts`
- `src/vnext/persistence/reopen-coordinator.ts`
- `tests/vnext/library/catalog-library-open-recovery.test.tsx`
- `tests/vnext/library/catalog-library-service.test.ts`
- `tests/vnext/library/catalog-library-ui.test.tsx`
- `tests/vnext/persistence/runtime-coordination.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `tests/vnext/proof/editor-direct-manipulation-proof.mjs`
- `tests/vnext/proof/editor-group-proof.mjs`
- `tests/vnext/proof/editor-snapping-diagnostics-proof.mjs`
- `tests/vnext/proof/editor-template-insertion-proof.mjs`
- `tests/vnext/proof/editor-text-proof.mjs`
- `tests/vnext/proof/fixtures/w2-editor-browser.html`
- `tests/vnext/proof/fixtures/w2-editor-browser.tsx`
- `tests/vnext/proof/fixtures/w3e-library-browser.html`
- `tests/vnext/proof/fixtures/w3e-library-browser.tsx`
- `tests/vnext/proof/w3e-catalog-library-proof.mjs`

### Evidence packet

- JOB: `W3.E`
- Canonical base SHA/tree: `e37cdf3105626ce83763964f8d2a56a1fda1e01b` / `c7bf0865b9f51dd4ea624a196f08dec496aeed67`
- Branch: `feat/vnext-w3e-catalog-library`
- First independent audit: localized findings fixed before the recovered second audit.
- Recovered second independent audit: **B — SMALL AMENDMENT REQUIRED** for exact-open auth lifetime and unresolved ambiguous Create retry.
- Final amendment 1: exact-open auth listener is installed before asynchronous reopen and invalidates/removes stale-authority UI before reload.
- Final amendment 2: unresolved ambiguous Create retains the exact catalog/mutation attempt and retries exact reconciliation instead of generating a second catalog.
- Narrow amendment micro-audit: **A — ACCEPT**.
- Focused amendment validation: 3 files / 48 tests PASS (`catalog-library-service`, `runtime-coordination`, `architecture-boundary`).
- Full suite: 229 files PASS; 2,463 tests PASS; 1 skipped.
- Lint: PASS, 0 errors / 268 existing warnings.
- Typecheck: PASS.
- Build: PASS.
- Dedicated W3.E Chromium + mobile proof: PASS on Chromium `151.0.7922.34`; initial metadata listing `listCalls=2`, `getCalls=0`; persisted edit/reopen `1 → 2 → 2` pages at revision 2; stale Save after Archive rejected with `ARCHIVED`; mobile 320/360/390 has no horizontal overflow.
- Canonical VNext proof set: 11/11 PASS, including native PDF/PDF.js export, W3.C Save/Reopen, both W3.D recovery proofs, and W3.E.
- Known boundary: no cross-tab dirty-state discovery is introduced; remote CAS/archive authority remains the defense for independent stale tabs.
- W3.F IMPLEMENTATION NOT STARTED.
- PR: pending `@devops` push/create after commit; DO NOT MERGE.
