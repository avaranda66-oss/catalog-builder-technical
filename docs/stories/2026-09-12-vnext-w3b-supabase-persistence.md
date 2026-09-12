# W3.B — Supabase CAS Persistence + Immutable Revision History

Status: **READY FOR REVIEW / IMPLEMENTED / NOT CANONICAL**

Date: 2026-09-12

Canonical base SHA: `4199108c2e4e0cd2d09a3ec02e2700528a373ff3`

Canonical base tree: `1fa5b5f0d6a53149c38c95c5f3282de79fa5ff35`

W3.A gate: PR #29 merged; Quality Gate run `34706862089` completed `SUCCESS` on the canonical base.

## Objective

Implement the first durable VNext persistence infrastructure without creating a second authored-document authority: explicit VNext current/history storage, strict server-side CAS, catalog-scoped mutation identity and replay, immutable revisions, authenticated RPC boundaries, and a Supabase repository adapter that preserves W3.A semantic errors and ambiguous-commit semantics.

## Acceptance criteria

- [x] VNext persistence is additive and independent from Legacy `catalogs`, `catalog_versions`, `brand`, and `save_catalog_v3`.
- [x] `CatalogDocument` remains the sole authored content authority; the database stores the complete validated canonical snapshot.
- [x] Durable catalog roots use native PostgreSQL UUID only after exact lowercase UUID compatibility validation.
- [x] Nested authored IDs remain ordinary canonical IDs and are not constrained to PostgreSQL UUID.
- [x] Current durable state lives in `public.vnext_catalogs`.
- [x] Every successful create/save/archive appends exactly one immutable `public.vnext_catalog_revisions` row.
- [x] Revision 1 is CREATE; revisions are strictly monotonic; failed mutations consume no revision.
- [x] Mutation uniqueness is catalog-scoped through `UNIQUE (catalog_id, mutation_id)`.
- [x] Exact latest-mutation replay with identical effective intent is idempotent; divergent reuse fails closed.
- [x] SAVE and ARCHIVE use row-locking strict CAS; no last-write-wins path exists.
- [x] Archive state is lifecycle metadata and does not mutate `document_snapshot`.
- [x] SQL performs only a narrow persistence/security validation spine; W3.A remains the complete canonical validator.
- [x] Direct RPC snapshots reject unknown CatalogDocument root keys and validate optional `source` with the exact W3.A root key/type/integer semantics.
- [x] Authenticated readers are authorized through the existing team model; mutations require editor/admin through `require_document_editor_v1()`.
- [x] Direct application-role table mutation is revoked; RLS remains enabled as defense in depth.
- [x] SECURITY DEFINER RPCs use fixed `search_path` and authenticated-only grants.
- [x] Runtime adapter validates exact lowercase UUID mutation/root identities before dispatch and parses authoritative results through W3.A.
- [x] Possible lost acknowledgement for a dispatched mutation maps to `AMBIGUOUS_COMMIT_OUTCOME`; authored mutations are never retried automatically.
- [x] Real-database rehearsal covers sequential semantics, grants/RLS, malformed direct RPC calls, rollback injection, native UUID round-trip, and catalog-scoped mutation reuse.
- [x] True SAVE/SAVE and SAVE/ARCHIVE contention uses separate PostgreSQL sessions.
- [x] A dedicated GitHub workflow provisions disposable Supabase/PostgreSQL and runs the W3.B rehearsal.
- [x] Focused persistence and architecture-boundary tests pass locally.
- [ ] Exact pushed-head repository Quality Gate passes.
- [ ] Exact pushed-head W3.B real-database rehearsal workflow passes.

## Durable database authority

`public.vnext_catalogs` is the current durable persistence authority. It stores the catalog UUID, current remote revision, latest mutation UUID, title/locale projections, server-owned actor/timestamps, archive lifecycle metadata, origin metadata, schema version, and the complete canonical document snapshot.

`public.vnext_catalog_revisions` is append-only audit history. It stores one row for every successful `create`, `save`, or `archive` mutation, including the resulting snapshot/projections and server-owned actor/timestamp. It cannot become current document authority.

## RPC surface

- `list_vnext_catalogs_v1`
- `get_vnext_catalog_v1`
- `create_vnext_catalog_v1`
- `save_vnext_catalog_cas_v1`
- `archive_vnext_catalog_cas_v1`

All mutation RPCs authorize first, validate canonical mutation identity, use server-owned actor/time, and return authoritative state. SAVE/ARCHIVE lock the current row with `FOR UPDATE` before CAS. CREATE is insert-only and never upserts.

## Replay and ambiguous commit

For one catalog, a mutation UUID may replay only when that mutation is still the latest committed revision and operation/effective payload match exactly. A stale historical mutation or divergent operation/payload fails closed without another revision.

The repository adapter distinguishes known pre-dispatch offline state, ordinary remote failure, and an unknown outcome after mutation dispatch. A timeout/network failure after dispatch is `AMBIGUOUS_COMMIT_OUTCOME`; W3.B does not guess a revision, mark Saved, or retry. Future W3.C reconciliation may compare authoritative `getCatalog()` state with `lastMutationId`, but W3.C is not implemented here.

## Final adversarial remediation

The independent final W3.B audit accepted the authority model and identified three focused blockers. This amendment closes them without expanding W3.B scope.

- The real-database workflow now propagates rehearsal failures through its logging pipeline and asserts the required completion markers. SAVE/SAVE and SAVE/ARCHIVE contention acquires locks through the mutation RPC path, with no application-role pre-lock.
- `SupabaseCatalogRepository` uses `OFFLINE` only before dispatch. After RPC invocation, mutation transport loss is `AMBIGUOUS_COMMIT_OUTCOME`, the equivalent read outcome is `REMOTE_FAILURE`, structured transport codes including `ETIMEDOUT` are recognized, and concrete domain/SQL outcomes retain semantic precedence.
- `create_vnext_catalog_v1` now arbitrates insertion races with insert-only `ON CONFLICT (id) DO NOTHING RETURNING`. A losing caller loads the committed row under lock and applies the existing replay/divergence/staleness rules. Concurrent exact duplicate CREATE converges on one revision-1 commit; divergent CREATE still fails closed, and CREATE remains non-upsert authority.

## SQL validation boundary

The database validates only the persistence/security spine: JSON object shape, the exact allowed CatalogDocument top-level key set, exact schema version 1, exact lowercase UUID root consistency, non-empty title/locale projections, required top-level style/pages/assets shape, optional strict `source` root semantics (`documentId` plus safe non-negative integer `serverVersion`), and a 10 MiB defensive snapshot bound. RichText, Table, primitives, Group semantics, geometry, and the rest of the authored schema remain W3.A/domain authority.

Principal exact-head audit identified and closed direct RPC root structural poisoning through unknown top-level CatalogDocument keys / malformed source. The SQL boundary rejects those payloads with `VNEXT_INVALID_DOCUMENT` / SQLSTATE `22023`; it does not strip or normalize them. W3.A remains the complete canonical authored-document validator.

## Real PostgreSQL/Supabase proof

`supabase/rehearsals/00024_vnext_catalog_persistence_rehearsal.sql` covers create revision/history, duplicate create, unauthorized/viewer mutation denial, editor/admin mutation success, direct DML denial, immutable history, malformed RPC rejection, UUID textual round-trip, save/stale save, archive/stale/already-archived behavior, replay identity, divergent mutation reuse, cross-catalog mutation reuse, lightweight list behavior, RLS/grants, and a rehearsal-only history-insert failure trigger proving transaction rollback. It also bypasses `SupabaseCatalogRepository` with authenticated direct RPC calls to prove unknown root keys and malformed `source` are rejected on CREATE and SAVE, valid `source` with `serverVersion: 0` passes, rejected CREATE produces no current/history row, and rejected SAVE changes neither snapshot, remote revision, last mutation identity, nor history. The direct-RPC poisoning matrix includes `remoteRevision`, `mutationId`, arbitrary root keys, null/empty/string/array `source`, empty `documentId`, negative/fractional/string/unsafe `serverVersion`, and the valid zero-version control.

`scripts/vnext-w3b-rehearsal-real-pg.sh` adds true separate-session contention. Concurrent identical CREATE now uses an explicit PostgreSQL observability barrier: session A has a dedicated `application_name`, calls the real CREATE RPC inside an outer transaction, and then enters a bounded hold statement. The harness polls `pg_stat_activity` until A is observably executing that post-CREATE hold with an open transaction before it launches session B. It then polls the real blocking graph and requires A's backend PID to appear in `pg_blocking_pids(B.pid)` before either session is allowed to count as proof. Only after those two observations does the harness accept matching authoritative revision-1 results and the single-row/single-history durable postconditions. Concurrent divergent CREATE proves one revision-1 winner, one conflict, no overwrite, and no revision 2. SAVE/SAVE and SAVE/ARCHIVE retain their previously accepted separate-session contention proof through the real mutation RPC path.

This C1 barrier closes the prior false-positive schedule in which A could be launched but descheduled, B could create and commit first, and A could later replay successfully before sleeping. B is no longer launched until PostgreSQL itself proves A has already returned from CREATE and is holding the outer transaction open; if A never reaches that phase, or if B starts without becoming blocked by A according to `pg_blocking_pids`, C1 fails instead of inferring concurrency from two successful results. The GitHub workflow requires stable proof markers for both the post-CREATE A barrier and the blocked-by-A B observation in addition to the final C1 and later race PASS markers.

The authoritative real-database result is the dedicated GitHub workflow on the exact PR head; local Docker is unavailable in this environment. Run identity and exact-head result are read from GitHub after publication rather than self-referenced inside this commit.

## Security

The VNext RPC layer reuses `team_role()` and `require_document_editor_v1()`. Reader RPCs require an authenticated active team member. Mutations require editor/admin. `anon` and PUBLIC execution are revoked; authenticated receives only intended RPC execution and table SELECT. Direct authenticated INSERT/UPDATE/DELETE is denied. Both VNext tables have RLS enabled. Revision UPDATE/DELETE is additionally rejected by an engine-level trigger.

Service-role behavior is not used as application authority; the CI rehearsal records PostgreSQL role/RLS and effective table-privilege evidence explicitly.

## Local validation

- Focused W3.A/W3.B persistence tests: **47/47 PASS**.
- VNext architecture boundary: **13/13 PASS**.
- Git Bash syntax validation for `scripts/vnext-w3b-rehearsal-real-pg.sh`: **PASS**.
- Full pre-push repository gates are recorded by the implementation report and exact-head GitHub checks.

## Files

- `.github/workflows/vnext-w3b-rehearsal.yml`
- `scripts/vnext-w3b-rehearsal-real-pg.sh`
- `src/vnext/persistence/index.ts`
- `src/vnext/persistence/supabase-repository.ts`
- `supabase/migrations/00024_vnext_catalog_persistence.sql`
- `supabase/rehearsals/00024_vnext_catalog_persistence_rehearsal.sql`
- `tests/vnext/persistence/supabase-repository.test.ts`
- `tests/vnext/persistence/vnext-persistence-migration.test.ts`
- `docs/stories/2026-09-12-vnext-w3b-supabase-persistence.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`
- `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`

## Scope

W3.A: **CANONICAL**.

W3.B: **IMPLEMENTED / READY FOR REVIEW / NOT CANONICAL**.

W3.C: **NOT STARTED**.

No Save/Reopen UI, SaveCoordinator, local recovery, Catalog Library UI, starter/duplicate flow, asset upload, autosave, realtime authority, presence, CRDT, translation, W4, AI authoring, Legacy migration, hard delete, restore, or unarchive is implemented by W3.B.
