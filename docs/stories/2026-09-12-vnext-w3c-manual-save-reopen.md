# W3.C — Manual Save + Canonical Reopen

Status: **IMPLEMENTED — LOCAL GATES GREEN / EXACT-HEAD CI PENDING**

Date: 2026-09-12

Canonical base SHA: `a0bee489deff7af78e056463cf763f3ba4844105`

Canonical base tree: `8c87e59a32f3761d9d6d21a023e132e3b08a6f09`

W3.B gate: PR #31 squash-merged; Quality Gate run `34723686552` completed `SUCCESS` on the canonical base.

## Objective

Establish the VNext runtime persistence coordination authority for explicit manual Save and exact canonical reopen. The Father-facing invariant is:

`edit → Save → authoritative server ACK → close/remount → reopen exact catalog → continue editing safely`.

The authored `CatalogDocument` remains the sole document authority. Persistence binding, remote revision state, mutation identity, save sequencing, dirty/equivalence state, auth/session lineage, and reconciliation remain outside authored content.

## Frozen contract decisions

- Manual Save crosses an authoring barrier before snapshot capture.
- A valid, non-composing, current W2.G text draft commits only through the existing `text.setContent` action.
- IME/composing, invalid, stale, or otherwise unsafe drafts block Save while preserving the draft.
- `DocumentSession` carries a monotonic local authored sequence that advances for accepted authored state transitions and never rewinds on Undo.
- Dirty state is based on exact canonical authored-state equivalence to the latest acknowledged snapshot plus unresolved visible draft work.
- ACK updates persistence binding only. It never replaces the live document and never creates/clears Undo history.
- One open session owns one serialized remote mutation lane.
- An ambiguous dispatched mutation is reconciled by authoritative GET and, only when still indeterminate, exact idempotent replay of the same mutation identity and payload.
- A late result is accepted only for the same open-session and auth lineage.
- Reopen validates the authoritative envelope/document, requested identity, current schema, and canonical document before installing a fresh `DocumentSession`.
- Reopen creates fresh Undo/Redo history and remounts the workspace against the new session identity.
- Exact-open failure preserves the current safe session.
- Conflict preserves local work and does not auto-overwrite or retry against a newer revision.
- Missing assets preserve canonical `AssetRef` data and continue through the existing resource-resolution/degraded-rendering seam.

## Acceptance criteria

- [x] Explicit persisted/unbound runtime binding with catalog id, remote revision, last mutation id, auth lineage, open-session lineage, acknowledged equivalence, local sequence, and one in-flight mutation lane.
- [x] Deterministic canonical authored-state equivalence independent of ordinary object key insertion ordering.
- [x] Manual Save validates the post-barrier document, captures an immutable snapshot, sequence/equivalence, expected revision, and one canonical mutation id, then calls W3.B `saveCAS`.
- [x] Duplicate Save during the same in-flight authored state joins/no-ops instead of dispatching another mutation.
- [x] New local work while S1 is in flight remains live and dirty after ACK S1.
- [x] W3.B `CONFLICT` preserves local work and exposes Father-readable conflict state.
- [x] `AMBIGUOUS_COMMIT_OUTCOME` blocks different remote mutations until authoritative reconciliation or exact replay settles the original attempt.
- [x] Unauthorized/offline/remote-failure states preserve local authored memory and never claim Saved.
- [x] Save result from an old catalog/open-session/auth lineage cannot mutate or message the active session.
- [x] Canonical reopen uses W3.B `getCatalog`, validates requested identity/envelope/schema/document, resolves through the existing resource seam, and creates a fresh `DocumentSession` with empty history.
- [x] Direct route `/v2?catalog=<catalogId>` can request exact reopen without building the W3.E library.
- [x] Unsafe route/open transition is guarded when current work is dirty or has unresolved visible draft work, including work created after an exact-open GET was dispatched.
- [x] Workspace/editor controller identity is remounted or otherwise proven to target only the newly opened session.
- [x] Father-visible Save UI exposes Save / Saving… / Saved / Unsaved changes / Conflict / Could not verify save / Offline or unavailable without persistence jargon.

## Mandatory deterministic tests

- [x] L01 — L1 → S1 → L2 → ACK S1 keeps L2, advances binding for S1, remains dirty.
- [x] L02 — L1 → S1 → Undo → ACK S1 does not overwrite the Undo result.
- [x] L03 — Save A → open B → ACK A leaves B untouched.
- [x] L04 — Save under auth A → auth B → late ACK leaves B untouched.
- [x] L05 — duplicate Save of same state during flight creates no competing mutation.
- [x] L13 — ambiguous commit reconciles by `lastMutationId` and exact replay when required.
- [x] L17 — valid visible text draft commits through `text.setContent` before Save snapshot capture.
- [x] L17b — IME/composing or invalid/stale draft blocks Save, preserves draft, and never shows false Saved.
- [x] DIRTY-UNDO — edit after ACK then Undo exactly to acknowledged content becomes clean while local sequence remains advanced.
- [x] REOPEN-1 — exact persisted catalog creates fresh session/history with correct binding.
- [x] REOPEN-2 — malformed remote envelope/document fails closed and preserves the existing session.
- [x] REOPEN-3 — requested catalog id mismatch fails closed.
- [x] REOPEN-4 — A→B reopen remounts actions/controllers so edits mutate B only.
- [x] AUTH — unauthorized Save/Reopen preserves local authored state.
- [x] REOPEN-RACE — edit after GET dispatch blocks installation; a stale older reopen cannot overwrite a newer reopened session.
- [x] DEGRADED-ASSET — an integrity-mismatched AssetRef is preserved and is not assigned a demo URL by id-only collision.

## Browser proof

- [x] Edit Text → Save → Saved only after ACK.
- [x] Edit again during delayed Save → old ACK does not clear dirty/current edit.
- [x] Close/remount or safe route transition → exact catalog reopen restores saved content.
- [x] Reopened session starts with fresh Undo/Redo and accepts a new edit.
- [x] Valid visible Text draft is included by the Save barrier.
- [x] Blocked/uncommittable draft cannot produce false Saved.
- [x] Delayed Save followed by explicit safe catalog switch proves the late ACK cannot contaminate the new active catalog.

## Validation

- [x] Focused W3.C unit/application tests.
- [x] Deterministic async/deferred repository tests.
- [x] Chromium browser proof.
- [x] `npm run lint` — 0 errors; 268 existing warnings.
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`
- [ ] Exact pushed-head required CI.

## Implementation and evidence

The implementation introduces one VNext persistence runtime below React. `PersistenceWorkspace` owns the persisted/unbound binding, dirty/save projection, authoring-barrier registration, asset URL projection, and active session installation. `SaveCoordinator` owns the single manual-save mutation lane, immutable capture, duplicate-flight join, stale lineage rejection, authoritative ACK validation, conflict handling, and ambiguous mutation reconciliation. `CanonicalReopenCoordinator` owns exact-ID GET validation and fresh-session installation.

`DocumentSession.localSequence` is monotonic across accepted edits and Undo/Redo. Dirty state is computed from deterministic canonical authored-state equivalence plus unresolved visible draft work, so Undo can return to a clean acknowledged state without rewinding causality.

The W2.G textarea registers an authoring barrier. Save commits a valid current draft through the same canonical `text.setContent` action used by normal direct-text completion. IME composition, invalid content, stale expected text, or another unsafe commit failure blocks Save and keeps the draft visible.

ACK acceptance proves the returned catalog id, attempted mutation id, exact next CAS revision, and canonical snapshot equivalence. ACK never replaces the live `DocumentSession`; therefore newer local edits and Undo remain authoritative in memory.

Ambiguous post-dispatch outcomes first read authoritative state. Matching `lastMutationId` proves commit; an unchanged expected base permits exact replay of the same mutation identity/payload; incompatible server advance becomes conflict. A different mutation id is never allocated for that unresolved attempt.

Reopen validates the persistence envelope and canonical document, requires exact requested/document identity, creates a fresh `DocumentSession`, binds remote metadata outside authored content, resolves only integrity-matching known demo assets, and replaces the workspace atomically. It now rechecks auth/session/open lineage and unsaved-work state after the GET, preventing a delayed exact-open response from discarding edits or overwriting a newer reopen.

The browser route is `/v2?catalog=<catalogId>`. `beforeunload` protects dirty/unresolved work and `popstate` exact-open uses the same safe reopen coordinator. The editor workspace is keyed by `openSessionId`, remounting interaction controllers for the installed session.

Focused evidence before candidate freeze:

- `tests/vnext/persistence/runtime-coordination.test.ts` — 16 PASS.
- `tests/vnext/application/w3c-editor-persistence.test.tsx` — 6 PASS after the degraded-asset proof was added.
- `tests/vnext/proof/architecture-boundary.test.ts` — remains green with no legacy persistence authority reachable from `/v2` and one canonical `text.setContent` mutation literal in the W2.G integration.
- Combined focused gate before the degraded-asset addition: 34/34 PASS; the final full suite includes the added asset test.
- `tests/vnext/proof/w3c-save-reopen-proof.mjs` — Chromium proof PASS, including draft barrier, delayed ACK/current edit separation, exact reopen with fresh history, post-reopen edit, blocked IME save, dirty-open guard, and late A ACK after safe switch to B.
- Browser evidence is written under ignored `scratch/w3c-save-reopen-proof/` (`evidence.json` and `w3c-save-reopen.png`).
- Final repository suite including reopen-race hardening and degraded-asset coverage: 218 files PASS, 2373 PASS, 1 skipped (2374 total).
- Build PASS; typecheck PASS; lint 0 errors / 268 warnings; `git diff --check` PASS.

## Candidate evidence packet

JOB: W3.C

BASE SHA/TREE: `a0bee489deff7af78e056463cf763f3ba4844105` / `8c87e59a32f3761d9d6d21a023e132e3b08a6f09`

TESTED SHA/TREE: populated after candidate commit; exact pushed-head CI remains intentionally pending until push.

CONTRACTS: authoring barrier; monotonic local causality; equivalence-based dirty; one mutation lane; authoritative ACK; ambiguous GET/exact replay; stale session/auth rejection; exact fresh-session reopen; guarded navigation; canonical resource seam.

DELTA: VNext runtime persistence coordination, manual Save UI/runtime, canonical exact reopen, route/auth wiring, deterministic adversarial tests, Chromium proof, and story evidence only.

CLAIMS:

- C1 — visible valid draft is included in Save snapshot → application test + Chromium proof → PASS.
- C2 — old ACK never overwrites newer local state/Undo → deferred coordinator tests + Chromium proof → PASS.
- C3 — ambiguous mutation never becomes a different mutation → deterministic GET/exact replay tests → PASS.
- C4 — stale catalog/auth ACK is inert → deferred tests + browser catalog-switch proof → PASS.
- C5 — exact reopen creates a fresh empty-history session and remounts controllers → coordinator/application/browser proofs → PASS.
- C6 — malformed/mismatched reopen fails closed; post-GET edit/reopen races preserve the safer current session → deterministic tests → PASS.
- C7 — degraded asset identity is preserved without false known-asset URL resolution → application test → PASS.
- C8 — W0/W1/W2/VNext architecture boundaries remain intact → architecture-boundary gate → PASS.

NOT PROVEN: W3.D crash recovery, W3.E library UX, W3.F full-identity copy, W3.G cloud asset bridge, W3.H autosave/concurrency/realtime. These are intentionally outside W3.C.

ARTIFACTS: W3.C story; focused tests; deterministic coordinator suite; Chromium fixture/proof; ignored browser evidence packet.

NEXT RISK / NEXT ACTION: freeze/push one W3.C candidate, require exact-head CI, then independent Principal/Gemini adversarial implementation audit. No merge without explicit user authorization.

## Scope exclusions

W3.D Recovery, IndexedDB, Recovery UI, W3.E Catalog Library, W3.F clone implementation, W3.G cloud asset bridge, W3.H autosave scheduling/concurrency, BroadcastChannel, Realtime, Presence, CRDT, W4, W5, W6, Legacy persistence authority, hard delete, restore/unarchive are excluded.

W3.D is **NOT STARTED**.

## File list

- `docs/stories/2026-09-12-vnext-w3c-manual-save-reopen.md`
- `src/vnext/application/session.ts`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/editor-defaults.ts`
- `src/vnext/persistence/equivalence.ts`
- `src/vnext/persistence/workspace.ts`
- `src/vnext/persistence/save-coordinator.ts`
- `src/vnext/persistence/reopen-coordinator.ts`
- `src/vnext/persistence/runtime.ts`
- `src/vnext/persistence/supabase-client.ts`
- `src/vnext/persistence/index.ts`
- `tests/vnext/persistence/runtime-coordination.test.ts`
- `tests/vnext/application/w3c-editor-persistence.test.tsx`
- `tests/vnext/proof/fixtures/w3c-browser.html`
- `tests/vnext/proof/fixtures/w3c-browser.tsx`
- `tests/vnext/proof/w3c-save-reopen-proof.mjs`
