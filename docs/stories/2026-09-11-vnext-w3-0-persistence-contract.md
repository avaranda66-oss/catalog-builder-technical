# W3.0 — Save / Reopen / Catalog Library Contract Freeze

Status: **READY FOR PRINCIPAL REVIEW — NOT CANONICAL / NOT MERGED**

Date: 2026-09-11

## Goal

Convert the completed independent W3 repository research and Principal confrontation into a durable, implementation-blocking W3 contract before any persistence code is written.

This is a docs/governance-only story. W3 implementation remains **NOT STARTED**.

## Provenance

- Repository: `avaranda66-oss/catalog-builder-technical`.
- Canonical base at story start: `6321155d0b88e52758cfb7138070c036845c359b`.
- Canonical base tree: `29b5964878914828778c2125cd177b81b068af17`.
- Direct parent: `3810b4c70b9415f43c7cb0360d6525b5a1823c22`.
- PR #27: merged.
- Post-closeout Quality Gate run `34649885701`: completed / success.
- W2: complete / canonical.
- Independent W3 repository research by Gemini: complete.
- Principal research verdict: **A — W3 RESEARCH ACCEPTED**.
- W3 implementation: not started.

## Acceptance criteria

- [x] Canonical GitHub base is reconstructed before editing.
- [x] No VNext W3 persistence implementation exists on canonical `main`.
- [x] The W3 contract preserves `CatalogDocument` as the sole authored document authority.
- [x] Stable logical `catalogId` is `CatalogDocument.id`; new roots are UUID-compatible without globally changing nested IDs.
- [x] Remote revision remains outside authored document and does not reuse `source.serverVersion` as the live CAS token.
- [x] Whole validated canonical snapshots are the persistence payload; no normalized parallel document authority is introduced.
- [x] An explicit VNext persistence boundary is required; Legacy `brand` and `save_catalog_v3` are not final VNext authority.
- [x] Save semantics require strict CAS, server ACK, monotonic revision, and immutable history.
- [x] Concurrency forbids silent last-write-wins and stale/late regression.
- [x] Father conflict UX is limited to open-latest or save-local-as-copy; no normal overwrite-remote action.
- [x] Manual Save and autosave share one future `SaveCoordinator`, with manual Save implemented first.
- [x] Local recovery is exact-catalog scoped and explicitly distinct from `Saved`.
- [x] Reopen validates/migrates below React and rejects invalid persisted data before session creation.
- [x] Save/autosave/ACK do not mutate authored Undo history; reopen starts fresh history.
- [x] Minimum W3 Library is Create/Open/Rename/Duplicate/Archive with lightweight metadata listing.
- [x] Rename is a canonical `CatalogDocument.title` mutation with strict CAS/revision semantics, not a metadata-only Library update.
- [x] Father V1 exposes Archive, not hard Delete; Legacy `catalog_status` is not silently repurposed.
- [x] Archive remains lifecycle metadata but is CAS-protected and invalidates the shared concurrency token so stale sessions fail closed.
- [x] Future evidence explicitly covers stale Rename and Archive-vs-stale-Save races, including prevention of stale recreation or implicit unarchive.
- [x] Starter/Duplicate require complete fresh identity closure while immutable assets may be shared.
- [x] Missing assets preserve references, allow degraded repair editing, surface diagnostics, and block publication.
- [x] Supabase/Auth/RLS/CAS patterns are salvageable without restoring Legacy catalog authority.
- [x] Owner-management UX is deferred.
- [x] `CatalogDocument.schemaVersion` remains `1` unless authored schema changes.
- [x] Persistence/lifecycle authority remains below React and compatible with future shared human/AI structured actions.
- [x] Failure UX and explicit W3 out-of-scope boundaries are frozen.
- [x] W3.A–W3.I slicing and future evidence requirements are recorded.
- [x] Project state and both Principal handoffs truthfully show W3.0 under review and W3 implementation not started.
- [x] No files under `src/**`, `tests/**`, `supabase/migrations/**`, `.github/**`, or package manifests are changed.

## Files

- `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md` — frozen W3 architecture/behavior contract under Principal review.
- `docs/stories/2026-09-11-vnext-w3-0-persistence-contract.md` — W3.0 governance/review story.
- `docs/vnext/PROJECT-STATE.md` — current phase and next gate synchronization.
- `docs/vnext/PRINCIPAL-HANDOFF.md` — durable W3.0 contract/gate synchronization.
- `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md` — executive reconstruction/gate synchronization.

## Scope guard

No implementation, migration, persistence interface, Save UI, Catalog Library UI, recovery code, Supabase change, or W3 runtime behavior is authorized in this story.

## Validation

- `git diff --check` — PASS.
- Exact changed-file audit — PASS; only the five documentation files listed above are changed.
- Forbidden-scope audit for `src/**`, `tests/**`, `supabase/migrations/**`, `.github/**`, `package.json`, and `package-lock.json` — PASS; zero changes.
- `npm run lint` — PASS with 0 errors and 268 existing warnings.
- `npm run typecheck` — PASS.
- `npm test` — PASS: 213 test files passed; 2303 tests passed; 1 skipped; 2304 total.
- `npm run build` — PASS; Vite production build completed with existing chunk/dynamic-import warnings only.

The first local lint/typecheck attempt could not start because this fresh worktree had no `node_modules`. `npm ci` installed the lockfile-defined dependencies without modifying tracked package files; the gates above were then rerun successfully.

## Review gate

Principal must audit the exact PR head/tree against the frozen contract and docs-only scope. The PR must not be merged without explicit user authorization.
