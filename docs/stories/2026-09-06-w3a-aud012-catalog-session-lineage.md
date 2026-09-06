# W3-A / AUD012 — Catalog Session Lineage & Async Completion Safety

Status: Ready for Review

## Goal

Prevent catalog-client async completions from crossing authoritative session, identity, catalog/navigation, local-generation, or remote-version boundaries while preserving ordinary save and CAS-conflict behavior.

## Base and Branch

- Provisional base: `de6ed28ed184c8a0dbfd61b5985143eab8caf9ef`.
- Target branch: `remediation/w3a-aud012-catalog-session-lineage`.
- Commit subject: `fix(readiness): guard catalog async lineage across sessions`.
- Do not merge; remote push belongs to `@github-devops`.

## Counterexamples

- N1 / P0 session-lineage escape: an ACK from S1 can currently mutate a newly established S2 even when auth user, catalog id, numeric local revision, and relative attempt id repeat.
- N2 / conflict-resolution TOCTOU: an awaited reload can currently overwrite a local edit or a newly navigated catalog before resolution completes.
- N3 / remote-version barrier: an older own ACK N can currently erase already-observed remote evidence M where `M > N` and incorrectly report synced.

## Acceptance Criteria

1. Every catalog async operation that can mutate state is bound to a monotonic authoritative session/generation token that cannot repeat through ABA.
2. Auth identity reset, relevant workspace reset, and establishment of a new authoritative catalog/navigation session invalidate prior completions before they can mutate state.
3. Same user, catalog id, local revision, and relative attempt id cannot make an old completion applicable to a new session.
4. Reload-server and keep-local conflict-resolution completions apply only while the initiating identity, catalog, authoritative session/generation, navigation lineage, and local revision remain current.
5. A catalog switch or superseding load/navigation makes an earlier resolution completion inert.
6. An ACK at version N never lowers or clears observed remote evidence/barrier M when `M > N`.
7. Ordinary same-session save remains successful and existing CAS-conflict behavior is preserved.
8. RR006 regressions remain green and RR011 contracts/files remain untouched.

## Tasks / Subtasks

- [x] Task 1 — Reproduce N1–N3 with deterministic RED tests (AC: 1–8).
  - [x] Use deferred promises only; add zero arbitrary sleeps.
  - [x] Cover T1–T10 and identify the existing RR006/RR011 contract suites for T11–T12.
- [x] Task 2 — Implement the minimal client-side lineage architecture in `src/stores/useCatalogStore.ts` (AC: 1–7).
  - [x] Define exact monotonic session/generation capture and applicability checks.
  - [x] Invalidate on auth reset, relevant workspace reset, and new authoritative catalog/navigation lineage.
  - [x] Guard save and both conflict-resolution paths against stale completion.
  - [x] Preserve the maximum observed remote-version barrier across older ACKs.
- [x] Task 3 — Run focused and regression gates (AC: 7–8).
  - [x] Focused AUD012 RED→GREEN and catalog-consistency suites.
  - [x] RR006, RR011 contract, RR007, and RR009 regressions.
  - [x] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
  - [x] CodeRabbit pre-commit review attempted; CLI unavailable on this host, with manual diff review completed and no CRITICAL finding identified.
- [x] Task 4 — Audit scope, commit, and hand off without merge.
  - [x] Verify the diff excludes every forbidden surface.
  - [x] Commit with the required subject and delegate push/remote CI to `@github-devops`.

## Required Test Matrix

- [x] T1 old ACK after logout/login same identity is inert.
- [x] T2 old ACK after identity change is inert.
- [x] T3 ABA localRevision does not defeat generation/session guard.
- [x] T4 stale save completion cannot mutate a newly loaded copy of the same catalog.
- [x] T5 reload-server conflict resolution cannot overwrite an edit made during await.
- [x] T6 keep-local conflict resolution cannot overwrite an edit made during await.
- [x] T7 navigation/catalog switch during resolution makes completion inert.
- [x] T8 observed remote v7 cannot be erased by later ACK v6.
- [x] T9 ordinary same-session save still succeeds.
- [x] T10 ordinary CAS conflict behavior remains intact.
- [x] T11 RR006 regressions remain green.
- [x] T12 RR011 contracts remain untouched.

## Scope Guard

- Preferred files: `src/stores/useCatalogStore.ts`, focused AUD012/catalog-consistency tests, and this story.
- `src/services/realtime.service.ts` is allowed only if indispensable to transport information already present.
- Forbidden: `TechnicalTableBlock`, export surfaces, `PrintDocumentView`, `PublicationsView`, `ExportPDFModal`, publication snapshots, SQL, RR011, LIVE DB, `main`, and server-side CAS changes.
- Also out of scope: Workbook Realtime subscription, Library conflict UX, reconnect catch-up global, and general `beforeunload` handling.
- RR006 and RR011 are frozen baselines.

## Dev Notes

- The project uses strict TypeScript, Zustand/Immer, Vite, Vitest, Supabase adapters, and Node/npm gates. [Source: `docs/framework/coding-standards.md`, `docs/framework/tech-stack.md`]
- New modules should use absolute `@/` imports where practical, and domain/integration behavior must be tested before visual detail. [Source: `docs/framework/coding-standards.md`]
- Existing SAVE lineage terminology includes monotonic owner/auth/epoch/read tokens and requires stale completions to become evidence-only or inert. [Source: `docs/release-readiness/G1_SAVE_DRAFT_ACK_CONTRACT.md`]
- This story changes only catalog-client async applicability. It does not redesign server CAS, persistence, realtime scope, publishing, or export behavior.

## CodeRabbit Integration

> CodeRabbit is not enabled through `.aiox-core/core-config.yaml`; the developer-agent definition still requires a pre-commit CLI attempt when available. Primary focus: stale async applicability, monotonic ABA safety, remote-version monotonicity, and regression preservation.

## Dev Agent Record

### Agent Model Used

- GPT-5.6 Sol via Codex desktop task.

### Debug Log References

- Focused pre-fix RED: 8 failures / 2 passes; T1–T8 reproduced N1–N3, while T9–T10 established the ordinary-save and CAS baselines.
- Focused post-fix: 10/10 AUD012 tests green; combined focused consistency/persistence run: 59/59 green.
- Frozen/required regression battery: 48/48 green across RR006, RR007, RR009, and the RR011 source-document CAS contract.
- Full Vitest gate: 170/170 files and 1,764/1,764 tests green.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`: exit 0. Lint retains 267 pre-existing warnings and zero errors; build retains existing chunk/import warnings.
- CodeRabbit CLI attempt: unavailable (`~/.local/bin/coderabbit` absent in WSL; no Windows PATH binary).

### Completion Notes List

- Added monotonic `workspaceIdentityEpoch` and `catalogSessionGeneration` authorities. Save queues and async completion tokens bind to both, plus catalog id, editor context, local revision, and observed remote-version barrier.
- Identity reset, editor-context change, authoritative catalog adoption, catalog navigation/load, conflict resolution, copy/creation, and translated-document adoption start a new authoritative generation and invalidate older physical operations.
- Save completion is inert outside its captured lineage. Same-session revision growth remains valid so edits made during an in-flight save continue into the existing queue contract.
- Conflict resolution reads workspace data without mutating store state, then requires exact identity/session/catalog/context/local-revision/barrier equality before applying reload or keep-local results.
- Realtime transports the already-present remote version into a monotonic active-catalog barrier. ACK N cannot clear or supersede barrier M when `M > N`.
- No dependency, SQL, server CAS, export, publication, RR011, or TechnicalTableBlock changes were made. No manual UI behavior changed, so UI verification is not applicable to this state-lineage slice.
- Physical HTTP requests are not cancelled; stale completions are made semantically inert. The barrier covers versions actually observed for the active catalog; reconnect catch-up and inactive-catalog/global barriers remain deliberately out of scope.

### File List

- `docs/stories/2026-09-06-w3a-aud012-catalog-session-lineage.md`
- `src/services/realtime.service.ts`
- `src/stores/useCatalogStore.ts`
- `tests/stores/catalog-consistency-phase1.test.ts`
- `tests/stores/catalog-session-lineage-aud012.test.ts`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1.0 | Story prepared from the user-authorized W3-A/AUD012 mission and marked Ready for implementation. | River (SM) |
| 2026-09-06 | 0.1.1 | Development started (autonomous execution) — Status: Ready → In Progress. | Dex (Dev) |
| 2026-09-06 | 1.0.0 | Added catalog session lineage, conflict-resolution TOCTOU guards, remote-version barrier, deterministic AUD012 tests, and completed all local quality gates — Status: In Progress → Ready for Review. | Dex (Dev) |
