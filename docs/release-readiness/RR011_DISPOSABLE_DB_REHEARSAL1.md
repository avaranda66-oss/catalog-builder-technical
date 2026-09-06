# COMPANY.READINESS.RR011.DISPOSABLE-DB.REHEARSAL1

Status: Ready for empirical execution

## Scope and safety

- Source commit: `5443b249f8d3c0d6b678105de709e3465a298f1a`.
- SQL under test: `supabase/rehearsals/source_document_cas_v2_draft.sql`.
- Expected SQL SHA-256: `711c4bffc6d2b244e9eb5185234cd6153b117edf0cb14dd40ff855b59bdf02e0`.
- The runner rejects any `DATABASE_URL` whose host is not `localhost` or `127.0.0.1`.
- The runner explicitly rejects the production project ref `bjxqvrpbigwgabwbhtqa`.
- No Supabase secret or live credential is required or accepted.
- The PostgreSQL service container exists only for the GitHub Actions job.

## Baseline fidelity

The minimum disposable baseline is derived from repository migrations:

- `00001_initial_schema.sql`: `user_role`, `auth.users` relationship, and `profiles` contract.
- `00004_team_workspace.sql`: `profiles.is_active` and `team_role()` semantics.
- `00019_fix_reserved_keyword_and_centralize_auth_v1.sql`: exact editor authorization behavior in `require_document_editor_v1()`.
- `00022_product_workbook_persistence.sql`: `product_source_documents`, RLS/read policy, direct-DML revokes, and the legacy V1 signature/write authority.

`auth.uid()` is simulated only by reading the same per-session JWT claim setting used by Supabase. The positive actor is an active `editor`; the negative actor is an active `viewer`. Both pass through the unweakened `require_document_editor_v1()` path.

## Concurrency method

The two-writer assertion launches two independent `psql` processes. Writer A performs the `version = 2` update and holds its transaction open. The runner observes Writer A at the barrier through `pg_stat_activity`, then starts Writer B with the same expected version. Writer B blocks on the real row lock, resumes after A commits version 3, and must receive `40001 / SOURCE_DOCUMENT_CONFLICT` with `actualVersion = 3`.

Realtime checks cover only the database contract (`REPLICA IDENTITY FULL` and publication membership). They do not claim delivery or acknowledgement behavior.

## Files

- `.github/workflows/rr011-disposable-db-rehearsal.yml`
- `scripts/rehearsals/run-rr011-disposable-db-rehearsal.sh`
- `supabase/rehearsals/rr011_disposable_db_baseline.sql`
- `supabase/rehearsals/rr011_disposable_db_pre_concurrency.sql`
- `supabase/rehearsals/rr011_writer_a.sql`
- `supabase/rehearsals/rr011_writer_b.sql`
- `supabase/rehearsals/rr011_disposable_db_post_concurrency.sql`

Production migration number remains **DEFERRED**. This audit branch does not modify application production TypeScript or create a production migration.

## Execution history

- Run `34041020800` is **INVALID / NOT EMPIRICAL EVIDENCE**. A shallow checkout omitted the source commit object, so the source-integrity check exited with `fatal: bad object 5443b249f8d3c0d6b678105de709e3465a298f1a` before baseline creation. The workflow pipeline also allowed `tee` to mask that nonzero exit. The follow-up changes only the audit workflow to fetch full history and propagate pipeline failures; the SQL under test remains byte-identical.
