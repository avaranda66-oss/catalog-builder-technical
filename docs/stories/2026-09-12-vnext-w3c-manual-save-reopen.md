# W3.C — Manual Save + Canonical Reopen

Status: **IMPLEMENTED — FINAL PROJECTION AMENDMENT GATES GREEN / PRINCIPAL FINAL PROJECTION RE-AUDIT PENDING**

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
- Auth lineage changes only when the effective principal identity changes; repeated same-user session confirmation and token refresh preserve the current lineage.
- An unresolved ambiguous mutation that crosses a real auth transition remains unresolved and may only continue through authoritative reconciliation under the current auth context, preserving the original mutation identity and payload.
- Every transition that changes pending-draft truth republishes the persistence projection.
- A failed authoring barrier is a transient authoring-specific blocked projection. A later authoring-state change invalidates only that stale authoring blocker and recomputes the current projection; non-authoring blocked conditions remain authoritative.
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
- [x] Repeated same-user `SIGNED_IN` and `TOKEN_REFRESHED` callbacks preserve auth lineage and cannot falsely stale a valid in-flight Save.
- [x] Real effective-principal transitions advance auth lineage, including A→anonymous, anonymous→A, A→B, and A→anonymous→A.
- [x] An unresolved ambiguous attempt survives a real auth transition without permitting a different mutation; later Save reconciles/replays the same mutation under current auth authority.
- [x] Clearing the only visible text draft republishes dirty state so an unchanged acknowledged canonical document returns to Saved.
- [x] Resolving or cancelling the authoring state that caused a blocked Save clears only that stale authoring blocker: clean ACK-equivalent state returns to Saved, while canonical dirtiness and non-authoring blockers remain authoritative.
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
- [x] AUTH-1 — repeated same-user `SIGNED_IN` preserves lineage.
- [x] AUTH-2 — in-flight Save survives repeated same-user `SIGNED_IN`; ACK is accepted and binding advances.
- [x] AUTH-3 — `TOKEN_REFRESHED` for the same user preserves lineage.
- [x] AUTH-4 — A→anonymous changes lineage.
- [x] AUTH-5 — anonymous→A changes lineage.
- [x] AUTH-6 — A→B changes lineage.
- [x] AUTH-7 — A→anonymous→A produces a lineage distinct from the original A session.
- [x] AMBIGUOUS-AUTH — unresolved ambiguity across a real auth transition reconciles under current auth and exact-replays only the original mutation when required.
- [x] DIRTY-DRAFT-CANCEL — page activation discards the only draft, leaves canonical content unchanged, republishes dirty=false, and projects Saved.
- [x] BLOCKED-DRAFT-CANCEL — IME-blocked Save dispatches no persistence RPC; cancelling that draft leaves canonical content ACK-equivalent and immediately restores `dirty=false`, `phase=idle`, `Saved`.
- [x] BLOCKED-DRAFT-CANCEL-DIRTY — cancelling only the blocked draft over a dirty canonical edit clears the authoring blocker while preserving `dirty=true` and `Unsaved changes`.
- [x] COMPOSITION-END-RECOVERY — ending composition invalidates the obsolete authoring-block message while the visible draft remains dirty and Save-enabled.
- [x] NON-AUTHORING-BLOCK-CONTROL — a draft-state notification does not clear a generic validation/persistence `blocked` condition.

## Browser proof

- [x] Edit Text → Save → Saved only after ACK.
- [x] Edit again during delayed Save → old ACK does not clear dirty/current edit.
- [x] Close/remount or safe route transition → exact catalog reopen restores saved content.
- [x] Reopened session starts with fresh Undo/Redo and accepts a new edit.
- [x] Valid visible Text draft is included by the Save barrier.
- [x] Blocked/uncommittable draft cannot produce false Saved.
- [x] IME-blocked Save → composition end → cancel draft is asserted before any subsequent edit: browser state is ACK-equivalent, zero pending saves, `phase=idle`, `dirty=false`, and `Saved`.
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
- [x] Exact amendment implementation head CI — Quality Gate `34727427340` completed `SUCCESS` on `160b402b15caebd2ee64b6e306479a32d187230e`.
- [x] Final projection focused gate — 29/29 PASS across W3.C application and persistence coordination tests.
- [x] Final projection Chromium proof — PASS on Chromium 151.0.7922.34 with explicit blocked and immediately resolved snapshots.
- [x] Final projection full repository suite — 219 files PASS; 2386 PASS; 1 skipped (2387 total).
- [x] Final projection exact implementation head CI — Quality Gate `34728937141` completed `SUCCESS` on `6cf7d493b6225ac2158714b747ab4ab343daeb59`, including lint, typecheck, tests, build, Playwright Chromium installation, and VNext Chromium/PDF proofs.

## Implementation and evidence

The implementation introduces one VNext persistence runtime below React. `PersistenceWorkspace` owns the persisted/unbound binding, dirty/save projection, authoring-barrier registration, asset URL projection, and active session installation. `SaveCoordinator` owns the single manual-save mutation lane, immutable capture, duplicate-flight join, stale lineage rejection, authoritative ACK validation, conflict handling, and ambiguous mutation reconciliation. `CanonicalReopenCoordinator` owns exact-ID GET validation and fresh-session installation.

`DocumentSession.localSequence` is monotonic across accepted edits and Undo/Redo. Dirty state is computed from deterministic canonical authored-state equivalence plus unresolved visible draft work, so Undo can return to a clean acknowledged state without rewinding causality.

The W2.G textarea registers an authoring barrier. Save commits a valid current draft through the same canonical `text.setContent` action used by normal direct-text completion. IME composition, invalid content, stale expected text, or another unsafe commit failure blocks Save and keeps the draft visible.

ACK acceptance proves the returned catalog id, attempted mutation id, exact next CAS revision, and canonical snapshot equivalence. ACK never replaces the live `DocumentSession`; therefore newer local edits and Undo remain authoritative in memory.

Ambiguous post-dispatch outcomes first read authoritative state. Matching `lastMutationId` proves commit; an unchanged expected base permits exact replay of the same mutation identity/payload; incompatible server advance becomes conflict. A different mutation id is never allocated for that unresolved attempt.

The Principal auth-lineage amendment moves lineage advancement behind a tiny effective-principal policy. Repeated callbacks for the same authenticated user retain the same lineage regardless of `SIGNED_IN` or `TOKEN_REFRESHED`; only an actual identity transition advances the epoch. A late transport result from an older lineage remains inert. If that result could represent an unresolved dispatched mutation, the coordinator preserves the attempt and a later Save must first reconcile it under the current auth context, with the original mutation id and payload retained for any replay.

The Principal dirty-projection amendment republishes persistence state on every W3.C text-draft clearing path that changes `hasPendingDraft()`, including explicit page activation and loss of the edited object. A discarded draft therefore cannot leave a clean acknowledged canonical document falsely projected as `Unsaved changes`.

The independent final W3.C adversarial audit classified the architecture **B — W3.C SOUND, SMALL AMENDMENT REQUIRED** and identified one remaining Father-visible counterexample: an authoring-blocked Save could leave `phase='blocked'` stale after the responsible draft/composition state was resolved, even when the authored document again exactly matched the acknowledged canonical snapshot. The final projection amendment keeps public `SavePhase` unchanged and gives `PersistenceWorkspace` private blocked-source metadata. `SaveCoordinator` marks only failed authoring barriers through the dedicated authoring-block path. A later draft/composition transition clears that authoring-specific stale phase before projection is rebuilt. Generic `setPhase('blocked')` remains non-authoring, so invalid-document or persistence semantic failures are not silently erased.

The primary regression starts from an ACK-clean persisted document, opens a Text draft, enters IME composition, and clicks Save. It proves zero `saveCAS` calls, a visible draft, `dirty=true`, and Father-facing `phase='blocked'`. Cancelling that exact draft proves the textarea is gone, the canonical `CatalogDocument` remains the acknowledged document, there is no unresolved active mutation, the beforeunload predicate is false, and the projection is immediately `phase='idle'`, `dirty=false`, `Saved`. A second regression starts from an already dirty canonical edit and proves that cancelling only the blocked draft clears the authoring phase while retaining `dirty=true` / `Unsaved changes`. Composition-end coverage proves the obsolete blocker message disappears while the remaining draft stays dirty and Save-enabled. A non-authoring control proves draft notification preserves a generic blocked validation condition.

The Chromium proof now exposes `savePhase` and `saveMessage`. Its blocked snapshot records zero pending saves, `phase='blocked'`, `dirty=true`, and the composition message. Immediately after `compositionend` plus cancellation, before any new edit, the `resolvedBlocked` snapshot proves canonical text remains the ACKed `A local two`, remote revision remains 3, zero saves are pending, `phase='idle'`, the message is absent, `dirty=false`, and the Father-facing label is `Saved`. No fixed sleep is used as the correctness oracle for this transition.

Reopen validates the persistence envelope and canonical document, requires exact requested/document identity, creates a fresh `DocumentSession`, binds remote metadata outside authored content, resolves only integrity-matching known demo assets, and replaces the workspace atomically. It now rechecks auth/session/open lineage and unsaved-work state after the GET, preventing a delayed exact-open response from discarding edits or overwriting a newer reopen.

The browser route is `/v2?catalog=<catalogId>`. `beforeunload` protects dirty/unresolved work and `popstate` exact-open uses the same safe reopen coordinator. The editor workspace is keyed by `openSessionId`, remounting interaction controllers for the installed session.

Focused evidence for the Principal amendment before candidate freeze:

- `tests/vnext/app/auth-lineage.test.ts` — 6 PASS covering AUTH-1 and AUTH-3 through AUTH-7.
- `tests/vnext/persistence/runtime-coordination.test.ts` — 18 PASS, including AUTH-2, old-auth ACK protection with current-auth reconciliation, and unresolved ambiguous mutation across auth transition.
- `tests/vnext/application/w3c-editor-persistence.test.tsx` — 7 PASS, including DIRTY-DRAFT-CANCEL.
- `tests/vnext/proof/architecture-boundary.test.ts` — remains green with no legacy persistence authority reachable from `/v2` and one canonical `text.setContent` mutation literal in the W2.G integration.
- Combined amendment focused gate: 44/44 PASS.
- `tests/vnext/proof/w3c-save-reopen-proof.mjs` — Chromium proof PASS, including draft barrier, delayed ACK/current edit separation, exact reopen with fresh history, post-reopen edit, blocked IME save, dirty-open guard, and late A ACK after safe switch to B.
- Browser evidence is written under ignored `scratch/w3c-save-reopen-proof/` (`evidence.json` and `w3c-save-reopen.png`).
- Amendment full repository suite: 219 files PASS, 2382 PASS, 1 skipped (2383 total).
- Build PASS; typecheck PASS; lint 0 errors / 268 warnings; `git diff --check` PASS.

Final projection amendment evidence:

- `tests/vnext/application/w3c-editor-persistence.test.tsx` — 11 PASS, including BLOCKED-DRAFT-CANCEL, dirty-canonical + draft-cancel, composition-end recovery, non-authoring blocked preservation, L17/L17b, and DIRTY-DRAFT-CANCEL.
- `tests/vnext/persistence/runtime-coordination.test.ts` — 18 PASS; existing conflict, ambiguity, auth, and remote-failure coordination semantics remain green.
- Combined final-projection focused gate — 29/29 PASS.
- `tests/vnext/proof/w3c-save-reopen-proof.mjs` — Chromium proof PASS with explicit `blocked` → `resolvedBlocked` evidence before the next scenario.
- Final-projection full repository suite — 219 files PASS, 2386 PASS, 1 skipped (2387 total).
- Build PASS; typecheck PASS; lint 0 errors / 268 existing warnings; `git diff --check` PASS.
- Exact implementation head `6cf7d493b6225ac2158714b747ab4ab343daeb59` / tree `82d16b679ae75b0a84dd4592d98a7c37c9f458c8` — Quality Gate `34728937141` completed `SUCCESS`.

## Candidate evidence packet

JOB: W3.C

BASE SHA/TREE: `a0bee489deff7af78e056463cf763f3ba4844105` / `8c87e59a32f3761d9d6d21a023e132e3b08a6f09`

TESTED SHA/TREE: `6cf7d493b6225ac2158714b747ab4ab343daeb59` / `82d16b679ae75b0a84dd4592d98a7c37c9f458c8`.

EXACT-HEAD QUALITY GATE: `34728937141` — `COMPLETED / SUCCESS`, including lint, typecheck, tests, build, Playwright Chromium installation, and VNext Chromium/PDF proofs.

CONTRACTS: authoring barrier; monotonic local causality; equivalence-based dirty; one mutation lane; authoritative ACK; ambiguous GET/exact replay; stale session/auth rejection; exact fresh-session reopen; guarded navigation; canonical resource seam.

DELTA: original W3.C candidate plus the focused Principal amendment for effective-principal auth lineage, ambiguity preservation/reconciliation across real auth transitions, draft-clear dirty republishing, and the final projection amendment that distinguishes transient authoring blocks from non-authoring blocked conditions and recomputes Father-visible state on authoring transitions.

CLAIMS:

- C1 — visible valid draft is included in Save snapshot → application test + Chromium proof → PASS.
- C2 — old ACK never overwrites newer local state/Undo → deferred coordinator tests + Chromium proof → PASS.
- C3 — ambiguous mutation never becomes a different mutation → deterministic GET/exact replay tests → PASS.
- C4 — stale catalog/auth ACK is inert → deferred tests + browser catalog-switch proof → PASS.
- C5 — exact reopen creates a fresh empty-history session and remounts controllers → coordinator/application/browser proofs → PASS.
- C6 — malformed/mismatched reopen fails closed; post-GET edit/reopen races preserve the safer current session → deterministic tests → PASS.
- C7 — degraded asset identity is preserved without false known-asset URL resolution → application test → PASS.
- C8 — W0/W1/W2/VNext architecture boundaries remain intact → architecture-boundary gate → PASS.
- C9 — repeated same-user auth confirmation/token refresh cannot falsely stale Save; true principal transitions still stale old results → lineage policy + deferred coordinator tests → PASS.
- C10 — unresolved mutation across auth transition cannot silently disappear or dispatch a different mutation → authoritative reconciliation/exact-replay test → PASS.
- C11 — discarded visible draft cannot leave an unchanged acknowledged document falsely dirty → real EditorWorkspace page-activation test → PASS.
- C12 — cancelling the only authoring-blocked draft on an ACK-equivalent document immediately returns SaveProjection to `Saved` without another edit or persistence RPC → application + Chromium proof → PASS.
- C13 — clearing a stale authoring block does not erase canonical dirtiness or unrelated blocked persistence/validation state → application controls + existing runtime coordination suite → PASS.

NOT PROVEN: W3.D crash recovery, W3.E library UX, W3.F full-identity copy, W3.G cloud asset bridge, W3.H autosave/concurrency/realtime. These are intentionally outside W3.C.

ARTIFACTS: W3.C story; focused tests; deterministic coordinator suite; Chromium fixture/proof; ignored browser evidence packet.

NEXT RISK / NEXT ACTION: require the final story-sync head Quality Gate, then return for Principal W3.C final projection re-audit. No merge without explicit user authorization.

## Scope exclusions

W3.D Recovery, IndexedDB, Recovery UI, W3.E Catalog Library, W3.F clone implementation, W3.G cloud asset bridge, W3.H autosave scheduling/concurrency, BroadcastChannel, Realtime, Presence, CRDT, W4, W5, W6, Legacy persistence authority, hard delete, restore/unarchive are excluded.

W3.D is **NOT STARTED**.

## File list

- `docs/stories/2026-09-12-vnext-w3c-manual-save-reopen.md`
- `src/vnext/application/session.ts`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/auth-lineage.ts`
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
- `tests/vnext/app/auth-lineage.test.ts`
- `tests/vnext/application/w3c-editor-persistence.test.tsx`
- `tests/vnext/proof/fixtures/w3c-browser.html`
- `tests/vnext/proof/fixtures/w3c-browser.tsx`
- `tests/vnext/proof/w3c-save-reopen-proof.mjs`
