# C3 — Presence Session Identity & Async Lifecycle Hardening

Status: InReview

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- remote_operations: `@github-devops`

## Story

**As a** catalog or template editor,
**I want** every Presence callback, timer, heartbeat, and cleanup operation to remain owned by the session that created it,
**so that** delayed work from an obsolete document or auth identity can never mutate the current Presence session.

## Base and Branch

- Immutable base and required `origin/main`: `618904c87912d06a1731419bbbff4fbb6aca2ece`.
- Target branch: `remediation/c3-presence-session-lifecycle`.
- Do not push, merge, or commit directly to protected `main`.
- Do not create a pull request during this mission.

## Acceptance Criteria

1. C3-T1: Session A leave resolving after session B activates cannot untrack, remove, null, clear, or disconnect B.
2. C3-T2: A late `SUBSCRIBED` callback from obsolete A is inert after B activates.
3. C3-T3: A late `CHANNEL_ERROR` or `TIMED_OUT` callback from obsolete A is inert after B activates.
4. C3-T4: A reconnect timer owned by A is inert after B activates.
5. C3-T5: An obsolete heartbeat cannot track B's payload or otherwise mix channel and payload ownership.
6. C3-T6: Catalog Presence identity remains `documentKind: catalog`, `documentId: catalog id`, and `catalogId: catalog id`.
7. C3-T7: Template Presence identity remains `documentKind: template`, `documentId: actual template id`, with a template-specific channel identity.
8. C3-T8: A template Presence payload does not populate `catalogId`.
9. C3-T9: Explicit leave of the current session stops its heartbeat, cancels its reconnect, untracks/removes its own channel, clears its target/payload, and emits disconnected exactly once where practical.
10. C3-T10: Re-subscribing to the same target does not create duplicate channels.
11. C3-T11: Auth/client session identity replacement rejects stale callbacks and preserves the new `presenceKey`, `userId`, `clientInstanceId`, payload, and channel.
12. C3-T12: `beforeunload`/`pagehide` synchronous cleanup remains safe and cannot manufacture cross-session cleanup.
13. Deterministic mocked-Supabase tests must capture the real unsafe race before production changes; no RED may be fabricated.
14. Catalog and template callers, location updates, reconnect behavior, and UI consumers must preserve the canonical document contract end-to-end.

## Tasks / Subtasks

- [x] Inventory the current Presence authority and template/catalog integration (AC: 6–8, 10–12).
  - [x] Inspect `PresenceService` and every caller of subscription, leave, location update, and active-target APIs.
  - [x] Record the authority diagram and the actual template identity contract.
- [x] Add deterministic RED tests using mocked Supabase Realtime channels (AC: 1–5, 9–13).
  - [x] Capture unresolved A cleanup followed by B activation and late A completion.
  - [x] Cover late subscription/error callbacks, reconnect timer, heartbeat, auth replacement, same-target subscription, explicit leave, and sync cleanup.
- [x] Implement the smallest captured-resource and session-generation ownership mechanism (AC: 1–5, 9–12).
  - [x] Make obsolete async continuations, callbacks, timers, and heartbeats inert.
  - [x] Preserve independent cleanup of obsolete channels without dereferencing mutable current resources after `await`.
- [x] Prove catalog/template contract regressions and run focused validation (AC: 6–14).
  - [x] Test catalog and template payload, target, channel, reconnect, and location identity.
  - [x] Run new and existing Presence plus relevant document/template/auth lifecycle tests and report exact totals.
- [x] Run full quality gates, audit scope, commit, and hand off remote operations (AC: 1–14).
  - [x] Run lint, typecheck, full tests, build, diff-check, and merge-marker audit.
  - [x] Attempt the required CodeRabbit review when available.
  - [x] Commit locally; delegate push and exact-SHA source-branch Quality Gates observation to `@github-devops`.

## Dev Notes

- Use strict TypeScript and explicit domain types; prioritize deterministic domain/integration tests. [Source: `docs/framework/coding-standards.md`]
- The existing stack is React, Vite/Vitest, Zustand/Immer, Supabase, and Node/npm. [Source: `docs/framework/tech-stack.md`]
- The production center is `src/services/presence.service.ts`; callers or hooks may change only if required to repair the proven template contract.
- The checkout has no Next.js package documentation and this service path uses no Next.js APIs, so the repository's Next agent warning has no applicable API guide for this story.
- Lifecycle hardening is limited to Presence identity and ownership. It must not add CRDT, OT, cursors, collaborative editing, locks, merge semantics, schema, migrations, dependencies, or new realtime tables.

## Authority Diagram

`CollaboratorPresenceBar/useCatalogStore → usePresenceStore → PresenceService session epoch → presence:{kind}:{id} channel → track/untrack/removeChannel → epoch-owned reconnect/heartbeat → epoch+channel-guarded status/sync callbacks`

## Testing

- Use deterministic mocked Supabase Realtime channels and controllable promises/timers.
- Capture factual RED before production edits, then retain the same counterexamples as GREEN regressions.
- Run new C3 tests, existing Presence tests, relevant template/document lifecycle tests, and auth lifecycle tests if touched.

## Scope Guard

Expected production center:

- `src/services/presence.service.ts`
- Presence callers/hooks only if required by the proven contract
- focused tests
- this story file

Forbidden scope:

- catalog/workbook persistence, CAS, realtime catalog decoder
- Table Core, BoxBlock, Active Editing Context, export architecture
- SQL, migrations, dependencies, package manifests, lockfiles
- collaboration features, locks, CRDT, OT, or remote editing
- protected-branch governance or a pull request

## CodeRabbit Integration

> **CodeRabbit Integration**: not configured in `.aiox-core/core-config.yaml`; the local developer policy still requires an attempted pre-commit CLI review when the CLI is available.

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex via Codex desktop task.

### Debug Log References

- Base proof before edits: `HEAD == origin/main == 618904c87912d06a1731419bbbff4fbb6aca2ece`.
- Factual RED on unchanged production: 2 files, 14 tests, 11 failed and 3 passed. Failures covered C3-T1, late subscription/error callbacks, reconnect, heartbeat, template payload shape/UI kind, auth replacement, unload cleanup, and obsolete sync delivery.
- C3 GREEN: 2 files, 15 tests passed after adding the template location/reconnect regression.
- Focused regressions: 8 files, 66 tests passed, 0 skipped, 0 failed.
- Full suite: 183 files passed; 1,894 tests passed, 1 skipped, 0 failed (1,895 total).
- Lint: exit 0, 0 errors and 267 baseline warnings. Changed-file comparison confirmed 9/9 warnings already existed on `origin/main`.
- Typecheck: exit 0. Build: exit 0 with existing Vite dynamic-import and large-chunk warnings.
- `git diff --check`: exit 0.
- CodeRabbit was attempted through the prescribed WSL path; CLI unavailable at `/home/gabriel/.local/bin/coderabbit`, so no automated-review pass is claimed.

### Completion Notes List

- Root cause: async leave dereferenced mutable `activeChannel` after `await`; channel callbacks, reconnect timers, and heartbeat timers likewise read mutable current fields without session ownership.
- Added a monotonic `sessionGeneration` and channel equality guard so obsolete callbacks and timers become inert.
- Leave and unload cleanup synchronously detach/invalidate current ownership, then untrack/remove only the captured channel; no post-await cleanup can touch a replacement session.
- Reconnect captures the target and retains the session's own `presenceKey`; same-target deduplication now includes auth/client identity.
- Template flow is canonical end-to-end: `documentKind: template`, actual template id, `presence:template:{id}` channel, no `catalogId`, and preserved identity through location/reconnect.
- `CollaboratorPresenceBar` now derives the document id/kind from `editorContext`; catalog behavior remains `documentKind: catalog`, `documentId/catalogId: catalog id`.
- C3 matrix: T1 GREEN; T2 GREEN; T3 GREEN for `CHANNEL_ERROR` and `TIMED_OUT`; T4 GREEN; T5 GREEN; T6 GREEN; T7 GREEN; T8 GREEN; T9 GREEN; T10 GREEN; T11 GREEN; T12 GREEN. Additional C3-T13 obsolete sync callback counterexample is GREEN.
- DoD self-assessment passed for every applicable item. Live Supabase/manual UI verification, new dependencies/configuration, and user-facing documentation are N/A; the behavior is covered by deterministic mocked-channel and component integration tests.

### File List

- `docs/stories/2026-09-07-c3-presence-session-lifecycle.md`
- `src/components/editor/CollaboratorPresenceBar.tsx`
- `src/services/presence.service.ts`
- `src/stores/usePresenceStore.ts`
- `tests/components/presence-template-contract-c3.test.tsx`
- `tests/services/presence-session-lifecycle-c3.test.ts`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-07 | 0.1.0 | Registered the user-authorized C3 lifecycle remediation and T1–T12 matrix. | River (SM) |
| 2026-09-07 | 0.2.0 | Advanced the complete user-supplied mission to Ready for Dev. | River (SM) |
| 2026-09-08 | 1.0.0 | Hardened Presence session ownership, restored template identity, and completed local gates. | Dex (Dev) |
