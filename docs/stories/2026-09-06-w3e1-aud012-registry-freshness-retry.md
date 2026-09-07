# W3-E.1 / AUD012 Registry Freshness + Retry Closure

## Status

In Progress

## Story

As a catalog runtime maintainer,
I want registry freshness and global catch-up retry semantics to close the remaining AUD012 gaps,
so that product identity authority is revoked immediately when remote product changes can invalidate it, and catch-up completion is only acknowledged after both draft and runtime converge successfully.

## Context

This story closes the remaining W3-E / AUD012 correctness gaps without redesigning the existing W3-E architecture.

The implementation must preserve the current coordinator, draft reconciliation, runtime architecture, `bypassInFlight`, and the behavior already established by RR006, RR007, RR009, and RR011. The preferred implementation surface is limited to `App.tsx`, `product-workbook.realtime.ts`, and focused tests. `ProductKnowledgeRuntime` may be touched only if strictly necessary to satisfy the acceptance criteria.

The following areas are explicitly out of scope and must not be changed: `useCatalogStore`, `ProductKnowledgePicker`, `useLibraryStore`, export behavior, SQL, migrations, migration `00022`, and RR011 behavior.

## Blockers

### R1 — Registry freshness must revoke stale product identity authority immediately

Any remote change in `public.products` that can alter `ProductIdentity.familyId` must immediately revoke the current registry authority for the affected product before any subsequent identity-dependent work proceeds.

The recovery path must use an authoritative reread of the product row/state rather than trusting stale registry data, cached identity, event payload assumptions, or a previously authoritative snapshot.

### R2 — Global catch-up completion requires both draft and runtime success

Global catch-up must only be considered complete after both draft reconciliation and runtime application have demonstrably succeeded for the same pending work.

If either side fails, the work must remain pending and retryable. Recovery must be deterministic and must not require a new WAL entry or a new remote event to re-drive the same logical work.

## Acceptance Criteria

### R1 — Registry Freshness / ProductIdentity Authority

- [ ] **T1.** A remote `public.products` change that may affect `ProductIdentity.familyId` immediately revokes authority for the affected product before any dependent resolution continues.
- [ ] **T2.** The revocation path applies to all relevant remote product mutation shapes already handled by the W3-E realtime flow, including cases where the event payload itself is insufficient to prove the resulting `familyId`.
- [ ] **T3.** After authority is revoked, the system performs an authoritative reread through the existing product/workbook data path before restoring authority or using `familyId` for downstream decisions.
- [ ] **T4.** No stale registry entry, cached identity, prior snapshot, or event-derived assumption may re-establish authority without the authoritative reread succeeding.
- [ ] **T5.** If the authoritative reread fails or cannot produce a valid authoritative identity, authority remains revoked/pending and the existing retry/recovery semantics remain available.
- [ ] **T6.** The fix preserves existing W3-E coordinator and in-flight behavior, including `bypassInFlight`, and does not introduce a second coordinator, alternate registry, or parallel reconciliation path.
- [ ] **T7.** Focused tests prove immediate revocation, authoritative reread, non-use of stale `familyId`, successful restoration after reread, and retry-safe behavior after reread failure.

### R2 — Global Catch-up / Draft + Runtime Closure

- [ ] **T8.** Global catch-up is marked complete only when both draft reconciliation and runtime application report success for the pending catch-up work.
- [ ] **T9.** Success from only one side is insufficient to clear pending state, advance completion state, or suppress retry of the failed side.
- [ ] **T10.** A draft failure leaves the catch-up pending/retryable even if runtime succeeded.
- [ ] **T11.** A runtime failure leaves the catch-up pending/retryable even if draft reconciliation succeeded.
- [ ] **T12.** Retrying a partial failure is deterministic and reuses the existing pending/WAL-derived work; recovery must not require creation of a new WAL record, synthetic remote event, or duplicate logical mutation.
- [ ] **T13.** Focused tests cover draft-only failure, runtime-only failure, both-fail, eventual success after retry, and proof that completion is emitted/recorded only after both sides succeed.

## Tasks / Subtasks

- [x] **1. Close R1 registry freshness semantics (T1–T7)**
  - [x] Identify the existing remote `public.products` event path in `product-workbook.realtime.ts` and the point where identity authority is currently considered valid.
  - [x] Revoke authority immediately when a remote product mutation can change `ProductIdentity.familyId`.
  - [x] Route recovery through the existing authoritative reread path.
  - [x] Ensure stale registry/cached/event-derived identity cannot be consumed between revocation and authoritative reread completion.
  - [x] Preserve current coordinator, reconciliation, and `bypassInFlight` behavior.
  - [x] Add focused tests for T1–T7.

- [x] **2. Close R2 global catch-up completion/retry semantics (T8–T13)**
  - [x] Update the existing catch-up completion decision so draft and runtime success are both required.
  - [x] Preserve pending/retryable state when either side fails.
  - [x] Ensure retry resumes deterministically from existing pending/WAL-derived work without requiring a new WAL entry.
  - [x] Prevent partial success from falsely acknowledging catch-up completion.
  - [x] Add focused tests for T8–T13.

- [x] **3. Regression protection and scope control**
  - [x] Confirm no duplicate coordinator, draft reconciliation layer, runtime architecture, registry, or retry mechanism is introduced.
  - [x] Confirm RR006, RR007, RR009, and RR011 semantics remain unchanged.
  - [x] Confirm workbook lifecycle behavior remains unchanged outside the two closures above.
  - [x] Keep changes within `App.tsx`, `product-workbook.realtime.ts`, focused tests, and `ProductKnowledgeRuntime` only if strictly necessary.
  - [x] Do not modify `useCatalogStore`, `ProductKnowledgePicker`, `useLibraryStore`, export code, SQL, migrations, `00022`, or RR011.

## Dev Notes

### Architecture constraints

- Preserve the existing W3-E architecture. This story is a remediation/closure story, not an architecture redesign.
- Reuse the current coordinator, draft reconciliation, runtime application path, pending/WAL state, and `bypassInFlight` behavior.
- Do not create parallel authority, retry, catch-up, or reconciliation mechanisms.
- Treat authoritative reread as the only valid way to restore `ProductIdentity.familyId` authority after a relevant remote product mutation.
- Treat global catch-up completion as a two-party success condition: draft reconciliation **and** runtime application must both succeed.
- Partial success must remain observable as pending/retryable work until the failed side succeeds.
- Recovery must be idempotent and deterministic from existing pending/WAL-derived state; no new WAL is required for the retry of the same logical work.

### Preferred files

- `App.tsx`
- `product-workbook.realtime.ts`
- focused tests adjacent to the existing W3-E/AUD012 coverage
- `ProductKnowledgeRuntime` only if the existing contract cannot satisfy T8–T13 without a minimal change

### Explicitly excluded files/areas

- `useCatalogStore`
- `ProductKnowledgePicker`
- `useLibraryStore`
- export behavior
- SQL
- migrations
- migration `00022`
- RR011 implementation/contract

## Test Requirements

Focused coverage must include, at minimum:

- remote product mutation revokes identity authority before dependent reads;
- authoritative reread is required before authority is restored;
- stale `familyId` is never consumed after revocation;
- authoritative reread failure leaves the work retryable;
- draft succeeds/runtime fails => catch-up remains pending;
- runtime succeeds/draft fails => catch-up remains pending;
- both fail => catch-up remains pending;
- retry reaches deterministic convergence without a new WAL entry;
- catch-up completes only after both draft and runtime succeed;
- no regression in W3-E, W3-A/AUD012, RR006, RR007, RR009, RR011, or workbook lifecycle coverage.

## Validation Gates

The story is complete only when all of the following pass:

- [x] W3-E focused/regression suite
- [x] W3-A / AUD012 suite
- [x] RR006 suite
- [x] RR007 suite
- [x] RR009 suite
- [x] RR011 suite
- [x] workbook lifecycle suite
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [ ] remote CI

## Definition of Done

- [x] R1 and T1–T7 are implemented and covered by focused tests.
- [x] R2 and T8–T13 are implemented and covered by focused tests.
- [x] No prohibited architecture or scope changes were introduced.
- [x] All local validation gates pass.
- [ ] Remote CI passes.
- [x] Story checklist is updated during development.
- [x] File List is updated by the implementing agent to reflect the actual files changed.

## CodeRabbit Integration

### Story Type Analysis

- **Primary Type:** Architecture / Integration remediation
- **Complexity:** High — correctness depends on preserving established coordination, reconciliation, runtime, retry, and WAL semantics across asynchronous paths.

### Specialized Agent Assignment

- **Primary:** `@dev`
- **Supporting:** `@qa` for regression/gate validation; `@architect` only if implementation appears to require a new pattern, which this story explicitly seeks to avoid.

### Quality Focus

- authority invalidation timing;
- stale identity prevention;
- authoritative reread correctness;
- partial-success catch-up semantics;
- idempotent retry without duplicate WAL work;
- preservation of RR006/RR007/RR009/RR011 and workbook lifecycle behavior.

## File List

- `docs/stories/2026-09-06-w3e1-aud012-registry-freshness-retry.md`
- `src/App.tsx`
- `src/services/product-workbook/product-workbook.realtime.ts`
- `tests/integration/workbook-realtime-catchup-aud012.test.ts`

## Dev Agent Record

### Agent Model Used

- GPT-5.6 Sol via Codex desktop task.

### Debug Log References

- Focused pre-fix RED: 3 failures / 11 passes. The failures reproduced stale registry authority and the two missing retry paths.
- Focused post-fix: 14/14 W3-E/AUD012 tests green.
- Frozen regression battery: 82/82 green across W3-E, W3-A/AUD012, RR006, RR007, RR009, RR011, and workbook lifecycle.
- Full Vitest gate: 171/171 files and 1,779/1,779 tests green.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: exit 0. Lint retains 267 warnings and zero errors; build retains existing Vite chunk/import warnings.
- CodeRabbit CLI pre-commit review attempted through WSL; `~/.local/bin/coderabbit` is unavailable on this host.
- Migration `supabase/migrations/00022_product_workbook_persistence.sql` remains byte-identical to the base; SHA-256 `E47D44EAE3D5AD82AF55E9EEDA51D78476CFE8E8AF172D839D6D73228661EA03`.

### Completion Notes List

- The existing workbook realtime coordinator now also treats `public.products` changes as registry-freshness signals. WAL payload identity fields are used only to scope the signal; `family_id` is never trusted as factual authority.
- Active-scope registry signals synchronously revoke runtime/draft authority through the existing `requireRealtimeCatchUp()` boundary, then reuse the authoritative registry/workbook reread path. Out-of-scope product signals are ignored.
- Global catch-up clears pending state only when the draft reconciliation returns success and `ProductKnowledgeRuntime` finishes `fresh`. False results and exceptions remain pending.
- Failed global catch-up schedules a cancelable deterministic exponential retry (250 ms base, 4 s cap), coalesces signals while pending, and requires no new WAL event. Disconnect/reconnect and coordinator stop cancel or supersede stale retry work through the existing lifecycle generation.
- `ProductKnowledgeRuntime`, `useCatalogStore`, `useLibraryStore`, picker/export surfaces, SQL, migrations, RR011, and the workbook draft reconciliation implementation were not changed.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1.0 | Story prepared for W3-E.1 / AUD012 registry freshness and retry closure. | River (SM) |
| 2026-09-06 | 0.2.0 | Development started; deterministic RED coverage added for R1/R2. | Dex (Dev) |
| 2026-09-06 | 0.9.0 | R1/R2 implemented and all local gates passed; awaiting remote CI. | Dex (Dev) |
