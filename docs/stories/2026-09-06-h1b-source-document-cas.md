# COMPANY.READINESS.H1B.RR011 — SourceDocument CAS V2

Status: Ready for Review

## Goal

Replace last-write-wins SourceDocument persistence with a separate server-managed CAS version while preserving `SourceDocument.revision` as editorial text.

## Acceptance Criteria

- [x] `product_source_documents.version` is drafted as BIGINT, default 1, not null, existing rows backfilled to 1, bounded to JavaScript safe integer range.
- [x] `SourceDocument.revision` remains editorial and unchanged in the canonical domain.
- [x] CAS V2 supports create 0→1 and update N→N+1 using atomic `id + version` matching.
- [x] Duplicate create, stale update, and missing update raise SQLSTATE 40001 `SOURCE_DOCUMENT_CONFLICT` with safe `actualVersion` detail.
- [x] Null, negative, fractional/invalid transport values, unsafe integers, and client-controlled `version` are rejected.
- [x] Unauthorized writes preserve SQLSTATE 42501.
- [x] Client validates returned version equals `expectedVersion + 1` and fails closed on malformed protocol.
- [x] Legacy `upsert_source_document_v1` authenticated execution is revoked; no automatic retry/fallback is introduced in CAS V2.
- [x] Realtime exposes `sourceDocumentId` and resulting persistence version as observation metadata; Realtime is not treated as ACK.
- [x] No Wave3 editor UX is implemented.
- [x] SQL is stored as rehearsal/draft because no production ledger number after 00023 is officially allocated.
- [x] GitHub Actions quality gates pass: lint, typecheck, tests, build. (Run `34041271765`.)
- [x] Disposable DB rehearsal executed. (Authoritative run `34041203047`.)

## Test Coverage

- [x] create 0→1
- [x] duplicate create
- [x] 1→2
- [x] two writers from base 2: A→3, B→40001
- [x] missing update
- [x] invalid expected version
- [x] unsafe integer
- [x] 42501
- [x] client version injection
- [x] bad returned version fail-closed
- [x] legacy-v1 bypass blocked
- [x] own echo metadata
- [x] higher third-party version metadata

## File List

- `src/services/product-workbook/persistence.types.ts`
- `src/services/product-workbook/source-document.repository.ts`
- `src/services/product-workbook/source-document.realtime.ts`
- `src/services/product-workbook/index.ts`
- `supabase/rehearsals/source_document_cas_v2_draft.sql`
- `supabase/rehearsals/rr011_disposable_db_baseline.sql`
- `supabase/rehearsals/rr011_disposable_db_pre_concurrency.sql`
- `supabase/rehearsals/rr011_writer_a.sql`
- `supabase/rehearsals/rr011_writer_b.sql`
- `supabase/rehearsals/rr011_disposable_db_post_concurrency.sql`
- `scripts/rehearsals/run-rr011-disposable-db-rehearsal.sh`
- `.github/workflows/rr011-disposable-db-rehearsal.yml`
- `docs/release-readiness/RR011_DISPOSABLE_DB_REHEARSAL1.md`
- `tests/services/source-document-cas-v2.test.ts`
- `docs/stories/2026-09-06-h1b-source-document-cas.md`

## Migration Ledger

Production migration number: **DEFERRED**.

The repository ledger at the requested base contains migrations through `00023`. This story does not allocate `00024` or rewrite historical migrations.
