# W3-E.2 / AUD012 Owner-Specific Catch-Up Retry

## Status

Ready for Review

## Story

As a catalog runtime maintainer,
I want owner-specific workbook catch-up to remain pending until success is proven,
so that a transient authoritative reread failure cannot leave workbook authority fail-closed forever when no new WAL event arrives.

## Context

W3-E and W3-E.1 are architecturally approved. This story closes only the residual owner-specific catch-up counterexample in `ProductWorkbookRealtimeCoordinator`.

The existing freshness model, registry invalidation, global reconnect retry, draft reconciliation, and repository `bypassInFlight` behavior must be preserved. No new reconciliation or authority path may be introduced.

## Acceptance Criteria

- [ ] **T1.** After `SUBSCRIBED`, a workbook revision-2 notification whose owner `catchUp(metadata)` returns `false` is retried deterministically without a new notification.
- [ ] **T2.** When the first owner catch-up attempt fails and the second succeeds, pending owner work is consumed only after the successful attempt.
- [ ] **T3.** An exception from owner `catchUp(metadata)` has the same pending/retry semantics as an explicit `false` result.
- [ ] **T4.** If revision 2 fails and revision 3 arrives before retry, the retry uses the newest relevant pending metadata and never semantically regresses to revision 2.
- [ ] **T5.** Multiple notifications for the same owner during a scheduled retry coalesce and do not create a retry storm.
- [ ] **T6.** Distinct owners maintain independent owner-specific retry state and can retry/converge independently.
- [ ] **T7.** `stop()` cancels owner retry timers semantically so stale retries cannot call the sink later.
- [ ] **T8.** Identity/lifecycle disposal makes owner retries from the previous coordinator lifecycle inert.
- [ ] **T9.** Exact duplicate workbook notifications remain deduplicated.
- [ ] **T10.** The W3-E.1 global catch-up retry behavior remains green.

## Tasks / Subtasks

- [x] **1. Add deterministic RED coverage for T1-T10**
  - [x] Use Vitest fake timers for owner retry timing.
  - [x] Cover `false` and exception failures.
  - [x] Cover newer metadata arriving before retry and same-owner coalescing.
  - [x] Cover independent owners, stop/lifecycle disposal, duplicate notification behavior, and global retry regression.

- [x] **2. Make owner-specific catch-up success-gated and retryable**
  - [x] Keep the newest pending owner metadata until catch-up success is proven.
  - [x] Reuse the existing 250 ms base / 4 s capped exponential backoff policy.
  - [x] Keep retry state keyed per owner; do not serialize unrelated owners through one global timer.
  - [x] Ensure newer pending metadata supersedes older failed work before retry.
  - [x] Cancel owner retry timers/state on coordinator stop.

- [x] **3. Regression protection and validation**
  - [x] Preserve W3-E/W3-E.1 behavior and exact-notification deduplication.
  - [x] Keep changes inside `product-workbook.realtime.ts`, focused W3-E tests, and this story unless an App change is strictly necessary.
  - [x] Do not modify `useCatalogStore`, `useLibraryStore`, `ProductKnowledgeRuntime`, `ProductKnowledgePicker`, SQL, migrations, `00022`, RR011, or export behavior.
  - [x] Run W3-E/E.1/E.2, AUD012 W3-A, RR006, RR007, RR009, RR011, workbook lifecycle, lint, typecheck, full tests, build, and `git diff --check`.
  - [x] Verify remote `Quality Gates` for the exact pushed SHA.

## Dev Notes

### Required semantics

- Owner-specific catch-up is consumed only after `sink.catchUp(metadata)` succeeds; `false` and exceptions remain pending/retryable.
- Retry is deterministic and timer-driven, with 250 ms base delay and 4 s cap, and must not busy-loop.
- Pending work is keyed by owner and coalesces to the newest relevant metadata.
- A newer owner revision arriving while an older attempt failed or is awaiting retry must be the work used by the next retry.
- Separate owners must not share a retry timer or otherwise block one another.
- Coordinator stop/lifecycle change must make old retry callbacks inert.

### Explicitly excluded files/areas

- `src/stores/useCatalogStore.ts`
- `src/stores/useLibraryStore.ts`
- `ProductKnowledgeRuntime`
- `ProductKnowledgePicker`
- SQL and migrations, including `00022`
- RR011
- export behavior

## Validation Gates

- [x] W3-E / W3-E.1 / W3-E.2 focused suite
- [x] AUD012 W3-A suite
- [x] RR006 suite
- [x] RR007 suite
- [x] RR009 suite
- [x] RR011 suite
- [x] workbook lifecycle suite
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [x] remote `Quality Gates` for exact pushed SHA

## File List

- `docs/stories/2026-09-06-w3e2-aud012-owner-catchup-retry.md`
- `src/services/product-workbook/product-workbook.realtime.ts`
- `tests/integration/workbook-realtime-catchup-aud012.test.ts`

## Dev Agent Record

### Agent Model Used

- GPT-5.6 Sol via Codex desktop task.

### Debug Log References

- Focused pre-fix RED: 5 failures / 16 passes. The failures reproduced missing owner retry after `false`/exception, premature same-owner replay instead of retry coalescing, and missing independent owner retries.
- Focused post-fix W3-E/W3-E.1/W3-E.2: 21/21 green.
- Frozen regression battery: 89/89 green across W3-E/E.1/E.2, AUD012 W3-A, RR006, RR007, RR009, RR011, and workbook lifecycle.
- Full Vitest gate: 171/171 files and 1,786/1,786 tests green.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: exit 0. Lint retains 267 warnings and zero errors; build retains existing Vite chunk/import warnings.
- CodeRabbit CLI pre-commit review attempted through WSL; `~/.local/bin/coderabbit` is unavailable on this host.
- Migration `supabase/migrations/00022_product_workbook_persistence.sql` remains byte-identical to the base; SHA-256 `E47D44EAE3D5AD82AF55E9EEDA51D78476CFE8E8AF172D839D6D73228661EA03`.
- Remote GitHub Actions `Quality Gates` run `34078412612` for implementation commit `2393756483e8cbe9c8f3aedb8e04e8906f19e16e`: success (lint, typecheck, tests, build).

### Completion Notes List

- Owner-specific catch-up now retains the newest pending metadata until `sink.catchUp(metadata)` proves success. Explicit `false` and exceptions schedule deterministic retries without requiring a new WAL event.
- Retry state is keyed per owner and reuses the existing exponential policy (250 ms base, 4 s cap), so unrelated owners retry independently and same-owner notifications coalesce behind a single timer.
- Newer owner metadata supersedes older failed work before retry; stale metadata is never reintroduced after a newer revision arrives.
- Coordinator `stop()` clears owner retry timers/attempts and lifecycle generation checks make callbacks from disposed lifecycles inert.
- W3-E.1 global catch-up retry, exact-notification deduplication, ProductKnowledgeRuntime, registry invalidation, draft reconciliation, repository `bypassInFlight`, stores, picker/export surfaces, SQL, migrations, and RR011 were not changed.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1.0 | Story prepared from the approved W3-E.2 / AUD012 owner-specific retry specification; development started. | River (SM) / Dex (Dev) |
| 2026-09-07 | 0.9.0 | Owner-specific retry implemented and all local/frozen gates passed; awaiting remote Quality Gates. | Dex (Dev) |
| 2026-09-07 | 1.0.0 | Remote Quality Gates passed for the implementation; story moved to Ready for Review. | Dex (Dev) |
