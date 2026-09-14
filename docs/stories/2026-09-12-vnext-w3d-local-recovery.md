# W3.D — Local Crash Recovery

Status: **Ready for Review**

Date: 2026-09-12

Canonical implementation base: `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7`

Required branch: `feat/vnext-w3d-local-recovery` (one future W3.D PR; no merge without explicit Principal authorization).

## Story

As the Father, I need legitimate local work to be discoverable and safely recoverable after a browser, tab, or computer failure, so that I can continue authoring without overwriting newer cloud content, crossing account boundaries, or being told that unsaved work was saved.

## Provenance and predecessor contract

This is the canonical implementation story for the user's W3.D execution contract. It is additive to, and must preserve, W3.0, W3.A, W3.B, and W3.C—not reinterpret them. In particular:

- `CatalogDocument` remains the sole canonical authored-document authority. Recovery is local, noncanonical durability; it is never `Saved` and never a second document model.
- W3.A's validated JSON-safe canonical persistence representation, strict schema/domain validation, UUID compatibility boundary, and SHA-256-compatible integrity posture remain authoritative.
- W3.B's authoritative remote repository/CAS/history semantics remain authoritative.
- W3.C's `PersistenceWorkspace`, `SaveCoordinator`, `CanonicalReopenCoordinator`, `DocumentSession.localSequence`, exact remote reopen, immutable attempted mutation capture, same-identity ambiguous replay, authoring barriers, equivalence-based dirty projection, and stale catalog/session/auth protection remain authoritative.
- W2.G's direct-Text behavior remains authoritative: Cancel does not mutate canonical content; confirmation uses `text.setContent`; one confirmation produces one Undo unit; IME remains semantically correct.

No name, module boundary, database schema, object shape beyond the required semantics, or production file location is invented by this story. The developer must discover the live seams before implementation.

### Required starting references

- `docs/stories/2026-09-11-vnext-w3-0-persistence-contract.md` — W3.0 canonical persistence/lifecycle authority, local-recovery boundary, failure semantics, and frozen slicing.
- `docs/stories/2026-09-11-vnext-w3a-persistence-contracts-roundtrip.md` — deterministic JSON-safe canonical snapshot representation, strict validation, root/mutation identity rules.
- `docs/stories/2026-09-12-vnext-w3b-supabase-persistence.md` — VNext remote repository/CAS/history implementation and exact authoritative payload boundary.
- `docs/stories/2026-09-12-vnext-w3c-manual-save-reopen.md` — W3.C sections “Frozen contract decisions”, “Mandatory deterministic tests”, “Browser proof”, and “Implementation and evidence”; this is the immediate runtime integration predecessor.
- `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md` — sections “Local recovery”, “Save semantics”, “Conflict”, “Undo / Redo”, and “Failure UX”.
- `docs/framework/coding-standards.md`, `docs/framework/source-tree.md`, and `docs/framework/tech-stack.md` — project-wide TypeScript, test-first, source-tree, and dependency constraints.

## Father invariant

The Father can edit a catalog, suffer a browser/tab/computer failure, return, discover legitimate local work, understand the available safe choices, and recover it without opening the wrong catalog, overwriting newer cloud content, silently merging, losing a valid newer recovery, crossing account boundaries, or needing developer terminology.

## Scope and frozen implementation contract

### Recovery authority and storage

- Use IndexedDB only, in a dedicated VNext database; the preferred database name is `catalog_builder_vnext_recovery`.
- Do not use localStorage as a fallback, Legacy storage as authority, OPFS as a requirement, DOM capture, React serialization, generic UI-state backup, or persistence of Undo history.
- `navigator.storage.persist()` is best effort only. It may be requested once at a suitable application/browser seam; correctness does not depend on approval and no prompt loop is permitted.
- Preserve unresolved recovery by default across logout and do not expire it by age. Delete only when authoritative cloud proves it redundant, its exact conditional cleanup succeeds, or the authenticated user explicitly discards the exact scoped record.

### Identity, isolation, and strict record validation

- A recovery key is exactly `authorityScopeId + catalogId + openSessionId`. `authorityScopeId` is stable authenticated user plus workspace/deployment; it is not `authLineage`, and token refresh does not change it. The same user may recover after logout/login; a different user must not enumerate, open, delete, or otherwise access it.
- `openSessionId` isolates tabs/open lineages. Two tabs may create two records. There is no last-write-wins, timestamp winner, merge, distributed lock, BroadcastChannel authority, or W3.H coordination implementation. Multiple candidates remain explicit.
- A strict, versioned `RecoveryRecord` must contain at minimum: `recordFormatVersion`, `authorityScopeId`, `catalogId`, `openSessionId`, `recoveryGeneration`, `localEditSequence`, `baseRemoteRevision`, `baseRemoteSnapshotDigest`, `documentSchemaVersion`, `documentSnapshot`, `snapshotDigestAlgorithm`, `snapshotDigest`, informational created/updated timestamps, and optional `pendingRemoteMutation` and typed `authoringRecoveryOverlay`.
- Validate records fail-closed. Unknown, corrupt, or unsupported records are rejected and preserved; never silently repair or delete them. Validate catalog identity, supported format/schema, canonical document, authority scope, and all integrity material before use.
- `localEditSequence` represents authored causality. `recoveryGeneration` represents ordered local recovery operations. They are distinct. A stale lower generation cannot overwrite a newer record, and deletion is conditional on the expected generation.
- Digest the deterministic canonical persistence representation with SHA-256. Require both `snapshotDigest` and `baseRemoteSnapshotDigest`. Equal remote revision with an unexpected digest is an integrity/reconciliation failure: do not automatically install local recovery.

### Visible authoring recovery overlay

- Preserve visible, unconfirmed Father work without periodically mutating `CatalogDocument` for every keystroke.
- Implement only a narrow typed authoring recovery overlay that is local-only, noncanonical, target-qualified, and expected-source-qualified. It is not DOM serialization, React serialization, a generic UI backup, remote payload, or Undo history.
- On accepted recovery: validate the canonical document, create a fresh `DocumentSession` with a new `openSessionId` and empty Undo/Redo, then restore only a compatible overlay as an ephemeral draft. Never silently commit it or restore interaction state.
- Text confirmation after recovery still dispatches exactly one `text.setContent` canonical action and creates exactly one Undo unit. Cancel leaves canonical content untouched. A stale expected-source mismatch is not auto-applied.
- Inspect every real ephemeral Father-visible authoring surface. If another visible draft can be lost, add equivalent typed coverage or stop for a documented Principal decision; do not silently exclude it.

### Pending remote save and save/recovery lifecycle

- Before remote Save dispatch, request an immediate recovery flush of the exact attempted authored state.
- A local recovery write failure does not prevent remote Save, but Father-facing state must expose `Proteção local indisponível`; local protection success never means `Saved`.
- Persist sufficient exact pending mutation state to reconcile a crash after dispatch and before ACK: `mutationId`, `catalogId`, `expectedRemoteRevision`, captured local sequence, attempted snapshot/effective payload, and attempt digest.
- On restart, fetch authoritative remote first and retain W3.B/W3.C rules: matching `lastMutationId` proves commit; exact expected remote base permits only replay of the same mutation identity and payload; a divergent remote result is conflict. Never allocate a replacement mutation ID to guess.
- While S1 is in flight, L2 must continue producing recovery. ACK S1 must not delete L2. Cleanup is allowed only for the exact ACK-covered record/generation; use the new remote base to supersede safely and make stale cleanup inert.

### Scheduling, IDB transaction standard, and remote comparison

- Scheduling defaults are configuration, not domain law: immediate leading write on first dirty state; 750 ms trailing debounce during continuous edits; maximum unsnapshotted interval 3000 ms. Use fake-clock deterministic tests, coalesce to the latest snapshot, and serialize writes per recovery key.
- IndexedDB success is transaction completion, not request-success alone. Prove database version creation, shared storage, abort behavior, quota failure, generation ordering, and conditional deletion. A failed later write must preserve the prior complete record; quota failure has no localStorage fallback.
- Implement a pure typed remote-comparison decision layer before any local installation. It distinguishes at least: `NO_RECOVERY`, `REDUNDANT_ALREADY_IN_CLOUD`, `RECOVERABLE_OVER_SAME_REMOTE_BASE`, `REMOTE_NEWER_OR_DIFFERENT_CONFLICT`, `SAME_REVISION_DIGEST_MISMATCH`, `REMOTE_UNAVAILABLE`, and `INVALID_OR_UNSUPPORTED_RECORD`.
- Never install recovery before comparison. A remote unavailable result permits protected inspection, not a remote assumption. Same revision/different digest fails closed.

### Father recovery UX and protected inspection

- Use Father language, including: `Encontramos alterações não salvas neste dispositivo.`, `Recuperar minhas alterações`, `Abrir versão salva na nuvem`, `Ver alterações recuperadas`, `Descartar recuperação local`, `Não foi possível verificar a versão da nuvem.`, and `Proteção local indisponível.` Do not expose CAS, revision arithmetic, mutation IDs, or IndexedDB terminology.
- If remote is newer/different, never offer ordinary overwrite-cloud. Offer opening the newest cloud version or inspecting recovered work in protected mode. Save-recovered-work-as-copy belongs to W3.F; do not implement partial clone logic.
- Protected inspection uses the canonical renderer, has no remote Save, fake remote binding, hidden document mutation, or normal recovered-to-cloud action, and is clearly local/recovered.

## Acceptance criteria

- [x] W3.D uses the existing VNext persistence/session authority below React and preserves W3.0–W3.C contracts, including canonical `CatalogDocument` sole authority and W2.G authoring semantics.
- [x] IndexedDB is the only recovery store and has a dedicated VNext database; no Legacy authority, localStorage fallback, OPFS requirement, DOM/React serialization, or Undo serialization exists.
- [x] Strict validated records and keys implement exact authority scope, catalog, and session isolation; corrupt/unknown/unsupported records fail closed and remain preserved.
- [x] SHA-256 digests cover deterministic canonical persistence representation; unexpected equal-revision digest mismatch does not auto-install recovery.
- [x] Recovery generations prevent stale overwrite and exact generation-conditional cleanup prevents stale deletion.
- [x] Scheduling has first-dirty leading persistence, 750 ms trailing debounce, 3000 ms maximum wait, latest-state coalescing, and per-key serialization, all deterministically proven with a fake clock.
- [x] IDB durability proof observes transaction completion and proves abort/quota/later-write preservation/version creation/shared-storage behavior.
- [x] A typed, target- and expected-source-qualified visible-draft overlay preserves recoverable Father-visible work without canonical keystroke mutation or generic UI capture.
- [x] Recovery installs a validated canonical snapshot into a fresh `DocumentSession`, with empty Undo/Redo and a new `openSessionId`; compatible overlays are restored ephemerally only.
- [x] Recovery text cancel is canonical no-op; confirmation is one `text.setContent` and one Undo; IME recovery remains noncanonical; stale expected source is not auto-applied.
- [x] Exact pending remote mutations survive restart and use only W3.C same-mutation-id/same-payload replay or authoritative proof; no guessed mutation identity, revision, `Saved`, or overwrite occurs.
- [x] Pre-dispatch exact recovery flush, S1/L2 continued recovery, ACK-vs-newer-L2 protection, exact ACK-covered cleanup, and ambiguous dispatch preservation are proven.
- [x] The typed comparison layer decides before installation and covers no recovery, redundant, same-base recoverable, remote conflict, same-revision digest mismatch, unavailable remote, and invalid/unsupported record.
- [x] Remote-newer/different and remote-unavailable paths retain local work, never overwrite cloud, and provide only safe Father choices/protected inspection.
- [x] Two same-profile tabs produce distinct session IDs and recovery records with no timestamp authority or overwrite.
- [x] Same-profile A→B→A authentication proves B cannot enumerate/open/delete A records, A recovery survives logout, A sees it on return, and explicit discard touches only the exact authenticated scoped record.
- [x] UI uses Father language, never equates local protection/recovery with `Saved`, and never exposes implementation terminology.
- [x] Recovery retention has no age expiry and is removed only by authoritative redundancy plus conditional cleanup or exact authenticated user discard.
- [x] The story checklist, task checkboxes, file list, claim-to-oracle evidence packet, and implementation/evidence notes are synchronized by the implementing developer.

## Mandatory deterministic recovery matrix

- [x] R01 — Immediate first dirty write.
- [x] R02 — Debounce and maximum wait.
- [x] R03 — Stale generation cannot overwrite.
- [x] R04 — Aborted write preserves previous record.
- [x] R05 — Quota failure and no localStorage fallback.
- [x] R06 — Exact pre-Save flush.
- [x] R07 — L2 recovery during S1 flight.
- [x] R08 — ACK S1 cannot delete newer L2.
- [x] R09 — Exact ACK-covered cleanup.
- [x] R10 — Ambiguous request preserved.
- [x] R11 — Restart plus `lastMutationId` proves commit.
- [x] R12 — Restart plus exact-base exact replay of same identity/payload.
- [x] R13 — Divergent remote conflict.
- [x] R14 — Same revision/digest mismatch.
- [x] R15 — Edit then Undo to remote is redundant cleanup.
- [x] R16 — Two tabs have independent records.
- [x] R17 — No timestamp automatic winner.
- [x] R18 — Logout A preserves recovery.
- [x] R19 — B cannot see A.
- [x] R20 — A login again sees A.
- [x] R21 — Exact discard only.
- [x] R22 — Recovered session has fresh Undo/Redo.
- [x] R23 — Corrupt record rejected and preserved.
- [x] R24 — Unsupported format rejected and preserved.
- [x] R25 — Remote unavailable leads only to protected inspection.
- [x] R26 — Newer remote never overwrites.

## Mandatory visible-draft tests

- [x] DRAFT-01 — visible Text draft → recovery → crash → accepted recovery: canonical old text remains and the draft restores visibly.
- [x] DRAFT-02 — cancelling a recovered draft retains canonical old text and creates no Undo entry.
- [x] DRAFT-03 — confirming a recovered draft dispatches one `text.setContent`, creates one Undo unit, and produces the confirmed content.
- [x] DRAFT-04 — IME crash recovery preserves intent as noncanonical draft work.
- [x] DRAFT-05 — stale expected source does not auto-apply.

## Mandatory physical Chromium/Playwright shared-storage browser proofs

Unit tests alone are insufficient. Run real Chromium/Playwright evidence against one persisted browser profile/storage location. Every proof records scenario execution, a directly asserted intermediate durability/isolation condition, and postconditions; fixed sleeps, close actions, inspected PASS text, isolated browser contexts, or uninspected records are not proof.

- [x] A — Hard crash/restart: edit; prove IndexedDB transaction completion; hard-close page/browser; reopen the same storage; discover and remotely compare recovery; accept it; prove restored state has fresh Undo/Redo and can continue editing.
- [x] B — Visible noncanonical Text draft crash: canonical A; visibly type B without confirmation; prove typed overlay transaction completion; hard-close/reopen same storage; accept recovery; prove canonical remains A and draft B is visible; confirm; prove exactly one canonical action and content B.
- [x] C — Save dispatch/recovery race: prove exact pre-Save persistence, allow S1 in flight and L2 editing/recovery, acknowledge S1, and inspect that L2's newer recovery survives rather than being stale-cleaned.
- [x] D — Pending-mutation restart reconciliation: physically preserve a dispatched/no-ACK pending mutation, restart with same storage, fetch remote first, and prove `lastMutationId` matching commits only that captured mutation with no false `Saved` beforehand.
- [x] E — Exact replay identity/payload: physically restart from an exact expected remote base after ambiguous dispatch and prove replay uses the original mutation identity and payload, never a new identity; prove divergent remote becomes conflict instead.
- [x] F — Two tabs: same browser profile/storage and same catalog in two tabs; prove two `openSessionId`s and two inspected records; neither record overwrites the other and no timestamp winner/merge occurs.
- [x] G — Same-profile auth scope: A writes recovery; B logs in through the same storage and cannot enumerate/open/delete A; A returns and sees its recovery. Isolated contexts with separate storage are prohibited evidence.
- [x] H — Fail-closed recovery choices: physically prove same-revision/digest mismatch and newer/different remote do not install/overwrite; prove remote-unavailable exposes only clearly local protected inspection and no remote Save/fake binding.
- [x] I — Startup recovery race: delay initial discovery and prove ordinary authoring is structurally unavailable before discovery and while an actionable decision is pending; then prove safe recovery unlocks the recovered session, while a stale programmatic install is rejected without losing current authored work or the old recovery.

## Developer file-discovery mandate

Before writing production code, the developer must record in this story's Dev Agent Record the exact live paths and symbols discovered from the W3.C head for: canonical snapshot serialization/digests; `DocumentSession` and `openSessionId`; persistence workspace/runtime/save/reopen coordinators; repository GET/CAS/ambiguous reconciliation contracts; auth scope/effective principal policy; W2.G authoring barriers and actual ephemeral authoring surfaces; VNext UI/proof fixtures; test utilities/fake clock; and existing browser launch/profile conventions.

Use `rg --files`, symbol/text search, and focused reads against the actual repository. Reuse existing seams where they meet this contract. Do not invent a parallel persistence authority, assume a filename from this story, alter W3.B/W3.C remote semantics, or select a new abstraction/library/database schema without a discovered need and root architecture freeze. If a required seam is absent, contradictory, or would require any stop condition below, stop and escalate before changing code.

## Tasks / subtasks

- [x] Recon and API freeze: perform the mandated discovery; map contracts and non-overlapping file leases; synchronize this story's File List before implementation.
- [x] Define pure strict recovery types, validation, canonical SHA-256 digest derivation, generation-conditional operations, and remote-comparison decisions without a second document authority.
- [x] Build the IndexedDB adapter and transaction-completion/error behavior, including shared-storage test support and no-fallback enforcement.
- [x] Integrate scheduling and recovery lifecycle below React with the existing session/workspace/save authority; preserve S1/L2 and ambiguous mutation rules.
- [x] Integrate typed visible-draft overlays only through discovered authoring barriers; inventory all visible ephemeral surfaces and escalate uncovered loss paths.
- [x] Integrate recovery discovery, Father UX, protected inspection, exact discard, and same-profile auth scope behavior without normal remote overwrite/copy implementation.
- [x] Implement R01–R26 and DRAFT-01–05 focused deterministic/application/adapter/race tests with explicit claim/oracle mapping.
- [x] Implement and run physical Chromium proofs A–I with durable evidence artifacts; verify intermediate conditions directly.
- [x] Run independent adversarial review for stale generation, stale cleanup, malformed records, digest mismatch, replay identity/payload drift, user/tab isolation, false `Saved`, and future-wave leakage.
- [x] Update every completed checkbox, the Dev Agent Record, File List, validation results, browser artifacts, claim matrix, known limitations, and evidence packet; then run required repository gates.

## Governance, scope guard, and stop conditions

- This story authorizes W3.D only. W3.E Catalog Library, W3.F identity/copy implementation, W3.G asset bridge, W3.H autosave/concurrency/realtime, W4, W5, W6, BroadcastChannel authority, CRDT, merge, remote overwrite, and partial clone logic are out of scope.
- Stop implementation and request a Principal decision if compliance would require a second canonical document authority, periodic canonical Text mutation while typing, generic React/DOM serialization, Legacy storage authority, localStorage fallback, new CAS semantics, remote merge/overwrite, W3.F partial clone, W3.H concurrency implementation, or weakened W3.C ambiguity/stale-session guarantees.
- Do not create a competing branch/PR, push, merge, or change files outside the lease assigned by the root authority. Root freezes APIs and leases after recon and integrates patches individually.
- Quality gates before review: focused tests; coordinator/in-memory integration; IndexedDB adapter integration; async races; browser proofs; crash/restart; visible-draft crash; two-tab; same-storage auth isolation; `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`; existing Chromium/PDF proofs; exact-head CI; independent adversarial audit.

## Required evidence packet and story synchronization

At candidate freeze, update this story with: JOB `W3.D`; base SHA/tree; tested SHA/tree; PR; contracts; delta; a claim matrix of claim → oracle → test/proof/log → result; not proven; known limitations; artifact paths; CI runs; audit findings; and next action. Evidence must distinguish execution, required intermediate condition, and postcondition. The File List must be exact and must include every modified production, test, fixture, proof, and evidence/story file; do not report unverified green status.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-12 | 0.1.0 | Initial W3.D implementation story prepared and marked Ready. | @sm |
| 2026-09-12 | 0.2.0 | Development started under root authority; Lane B Recovery Core lease activated. | @dev |
| 2026-09-13 | 0.3.0 | Recovery core contracts, repository, decisions, coordinator, and scheduler implemented with focused evidence. | @dev |
| 2026-09-13 | 0.4.0 | Dedicated IndexedDB adapter implemented and proven in real Chromium. | @dev |
| 2026-09-13 | 0.5.0 | W3.C lifecycle, typed draft overlays, startup decisions, protected Father UX, and auth-scoped production persistence integrated. | @dev |
| 2026-09-13 | 0.5.0 | Recovery scheduling and W3.C Save lifecycle integrated with exact preflight durability, S1/L2 rebasing, ambiguity preservation, and digest-guarded replay. | @dev |
| 2026-09-13 | 0.6.0 | Physical Chromium A–H evidence, full gates, canonical Father copy, and adversarial candidate audit completed. | @dev |
| 2026-09-13 | 0.7.0 | Principal amendment applied: local Recovery failure remains visible but no longer blocks or replaces authoritative cloud Save behavior. | @dev |
| 2026-09-14 | 0.8.0 | Gemini verdict B / Principal B1 amendment applied: startup discovery now gates authoring, recovery installation is pre/post stale-safe, Open Cloud preserves unsaved work, and physical scenario I proves the race correction. | @dev |

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`. Quality validation uses the required manual/adversarial review and repository gates.

## Story draft checklist result

| Category | Status | Evidence |
| --- | --- | --- |
| Goal & context clarity | PASS | Story, Father invariant, predecessor contract, and scope guard state the user outcome and W3.D position. |
| Technical implementation guidance | PASS | Strict recovery contract, lifecycle constraints, discovery mandate, and known predecessor seams provide implementation guidance without inventing architecture. |
| Reference effectiveness | PASS | Required starting references identify the exact documents and relevant sections; predecessor requirements are summarized in this story. |
| Self-containment | PASS | Identity, validation, overlay, lifecycle, UX, retention, scope exclusions, and stop conditions are recorded here. |
| Testing guidance | PASS | R01–R26, DRAFT-01–05, STARTUP-RACE-01–10, physical shared-storage proofs A–I, no-false-green standard, and required gates are explicit. |
| CodeRabbit integration | N/A | Disabled by `core-config.yaml`; the required disabled notice is present. |

**Final assessment: READY.** A developer can begin only after the mandated repository recon/API-and-file-lease freeze. Any discovered contradiction or stop condition is a Principal decision, not an implementation assumption.

## Dev Agent Record

### Agent model used

GPT-5 Codex root agent (single-root continuation).

### Debug log references

Generated proof output is under `scratch/w3d-physical-recovery-proof/`; the consolidated durable result is `docs/qa/evidence/vnext-w3d/physical-proof-result.json`.

### Completion notes

- This continuation inherited completed production phases and a category-B physical-proof harness. The harness was preserved, extended through sequential A–I scenarios, and hardened so only spawned Chromium processes are terminated, profile release waits are bounded, failed profiles/logs are retained, and cleanup cannot become a correctness oracle.
- Frozen seams used: W3.A `serializeCanonicalSnapshot`, W3.C `DocumentSession` factory/session authority, and `CatalogPersistenceEnvelope` remote comparison.
- Added strict v1 records, exact tuple keys, SHA-256 validation, typed Text/Inspector overlays, exact pending mutation capture, generation-conditional in-memory semantics, seven-way remote decisions, fresh-session acceptance, and recovery scheduling.
- Phase-1 evidence: 3 focused test files / 13 tests PASS; typecheck PASS; focused ESLint PASS; `git diff --check` PASS.
- Added the dedicated `catalog_builder_vnext_recovery` IndexedDB adapter with strict transaction completion, atomic generation ordering, conditional delete, scope index, typed failures, and corrupt-record preservation.
- Phase-2 evidence: 4 recovery test files / 16 tests PASS; typecheck and focused ESLint PASS; real Chromium adapter proof PASS with fresh-connection readback, schema/version creation, concurrent G2 protection, aborted G3 preserving G2, per-tab/per-user scope enumeration, and corrupt delete preservation. Quota behavior is an explicitly injected typed-boundary oracle; no physical quota exhaustion is claimed.
- Phase-3/5 focused evidence: exact pre-dispatch pending-mutation commit, S1/L2 rebase, conditional cleanup, ambiguous restart proof/replay, same-revision digest guard, Undo cleanup, scoped discovery, fresh-session recovery, Text/Inspector overlay capture/restore, protected inspection, and explicit two-step discard are green.
- Phase-3 evidence: the runtime owns a session recovery manager below React; first-dirty/debounced scheduling, best-effort exact pending-mutation preflight, S1/L2 rebasing, generation-conditional cleanup, immutable record scope, exact ambiguous payload retention, same-revision digest rejection, and Undo redundancy cleanup are covered by 11 focused lifecycle tests.
- Principal amendment `50a7b5a` removed the unreachable/misleading `RECOVERY_UNAVAILABLE` ManualSave result. A failed local preflight now marks `Proteção local indisponível.`, rechecks session/auth lineage, and continues through the unchanged W3.C remote dispatch/reconciliation path. Authoritative ACK can project cloud `Saved` while local protection remains unavailable; known remote failures and unresolved ambiguity remain authoritative and never become false `Saved`.
- LP-01–LP-04 plus the Father projection and stale-preflight race pass through the real `SaveCoordinator`: cloud ACK, OFFLINE/REMOTE_FAILURE/CONFLICT/UNAUTHORIZED, authoritative ambiguous proof, unresolved ambiguity, exact mutation identity, no invented durability, and no stale cross-lineage dispatch are covered. The accepted degraded condition remains explicit: a crash after an unprotected dispatch may not be locally recoverable.
- Gemini's final adversarial audit returned verdict B with one blocking B1 counterexample: remote open could render an interactive editor before asynchronous recovery discovery, allowing `Lnew` to be authored and then clobbered by an older recovery. Principal amendment `852615a` fixes that counterexample without reopening accepted Recovery architecture.
- The runtime-backed app now withholds `EditorWorkspace` while initial discovery is unresolved and while an actionable candidate awaits a decision. `RecoveryCenter` remains available for recovery, protected inspection, discard, retry, and safe continuation; discovery failure is Father-readable, and generation/authority invalidation makes late results inert.
- `runtime.recover()` independently validates clean/draft-free/save-safe authority, session, binding, remote-decision equivalence, and candidate state both before and after asynchronous acceptance. Any advancement preserves the live session and old recovery. Post-startup Open Cloud and acknowledged-reconciliation paths use ordinary unsaved-change protection rather than an unconditional discard bypass.
- STARTUP-RACE-01–10 pass through the real runtime/component path and cover initial/candidate gates, canonical and draft defenses, async TOCTOU, auth/session drift, stale remote decisions, dirty Open Cloud, safe recovery, and late discovery. The affected validation is 61/61 PASS.
- Physical A–I evidence was regenerated and PASS in Chromium `151.0.7922.34` against amended production implementation `852615a2285d62e2504535933749cb9f4ac07370` / `7aef1eba949e4cdd05cac5127459882107ea1971`. A fresh IndexedDB connection observed committed records before each hard kill; restart reused the same profile. Text Cancel produced zero canonical actions, Confirm produced one action/Undo unit, S1 ACK preserved L2, pending mutation proof/replay retained exact identity and payload, two tabs produced two records, B was denied A enumerate/open/delete, mismatch/newer/unavailable paths failed closed, and scenario I proved both structural startup gating and stale-install rejection with current work and old recovery preserved.
- The full repository gate passed after the startup-race amendment: lint (zero errors; existing warnings only), typecheck, 226 test files / 2,435 passed / 1 skipped, build, and `git diff --check`.
- Existing VNext Chromium/native-PDF proofs all PASS: W2.C direct manipulation, W2.F groups, W2.D snapping/diagnostics, W2.E template insertion, W2.G Text, W2.A export/native PDF, W2.F group export/PDF, W3.C Save/Reopen, and the W3.D IndexedDB adapter.
- Root adversarial audit found and fixed four candidate defects: pure persistence graph reachability (`e1dc011`), noncanonical Father recovery labels (`66aa64e`), local-protection failure suppressing cloud Save (`50a7b5a`), and the startup recovery clobber race (`852615a`). No stale generation/cleanup, malformed-record deletion, digest bypass, replay drift, user/tab collision, false `Saved`, startup clobber, or W3.E+ leakage remained.

### Evidence packet

- JOB: `W3.D`
- Canonical base SHA/tree: `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7` / `d08158a1c2f3e0e10c6812008e1356322815d81f`
- Tested production implementation SHA/tree: `852615a2285d62e2504535933749cb9f4ac07370` / `7aef1eba949e4cdd05cac5127459882107ea1971`
- Branch: `feat/vnext-w3d-local-recovery`
- PR: `https://github.com/avaranda66-oss/catalog-builder-technical/pull/33`; exact-head CI evidence is the GitHub check suite attached to the final pushed head; no merge authorized.
- Not proven: physical browser quota exhaustion. Quota mapping/no-fallback and prior-record preservation are proven at the injected IndexedDB failure boundary. Whole-machine power loss is not claimed; OS-level Chromium process termination and same-profile restart are proven.
- Known limitations: recovery intentionally has no cross-tab merge/winner, cloud overwrite, save-as-copy, autosave, realtime coordination, or W3.E+ behavior.

| Claim | Oracle | Evidence | Result |
| --- | --- | --- | --- |
| R01–R05 strict records, scheduling, ordering, abort/quota behavior | Parsed records, fake clock, generation/CAS results, preserved prior record | `tests/vnext/recovery/*`, W3.D IndexedDB adapter proof | PASS |
| R06–R15 Save lifecycle and ambiguity | Exact pre-dispatch record, S1/L2 generations, ACK cleanup result, exact mutation/digest comparison | `tests/vnext/persistence/recovery-lifecycle.test.ts`, `tests/vnext/recovery/recovery-startup.test.ts` | PASS |
| LP-01–LP-04 degraded local protection | Failed Recovery write plus cloud ACK/failure/ambiguity, original mutation identity, independent Father projections | `tests/vnext/persistence/recovery-lifecycle.test.ts`, `tests/vnext/application/w3c-editor-persistence.test.tsx` | PASS |
| R16–R26 isolation, fresh session, corruption, fail-closed decisions | Scoped inspected records, conditional delete, new session identity/history, decision kind | Recovery focused tests and physical F–H | PASS |
| DRAFT-01–05 Text/Inspector overlays | Canonical snapshot remains old, visible typed overlay restored, sequence/Undo delta, expected-source guard | `tests/vnext/application/w3c-editor-persistence.test.tsx`, physical B | PASS |
| A hard crash/restart | Fresh-connection transaction read before OS kill; same profile; new session ID/history | `docs/qa/evidence/vnext-w3d/physical-proof-result.json` A | PASS |
| B visible draft crash | Fresh-connection overlay read; two hard-crash paths; Cancel 0 / Confirm 1 canonical action | Same evidence B | PASS |
| C ACK S1 cannot erase L2 | Record inspected before dispatch, after L2, and after ACK/rebase | Same evidence C | PASS |
| D–E pending mutation durability/reconciliation | Restarted record identity/payload, no false Saved, remote proof or exact replay only | Same evidence D–E | PASS |
| F–G shared-storage tab/user isolation | One persistent context/storage, actual records, foreign operations denied, A returns | Same evidence F–G | PASS |
| H mismatch/newer/unavailable fail closed | No recovery action, cloud state retained, UNBOUND protected canonical renderer | Same evidence H | PASS |
| STARTUP-RACE-01–10 / physical I | Structural editor absence while discovery/decision is pending; pre/post stale rejection preserves current session, draft/work, and old recovery; safe recovery unlocks a fresh session | `tests/vnext/application/w3d-startup-race.test.tsx`, same evidence I | PASS |
| Repository and existing proof gates | Command exit status and asserted proof outputs | lint, typecheck, full Vitest, build, diff-check, VNext Chromium/PDF suite | PASS |

## File list

- `docs/stories/2026-09-12-vnext-w3d-local-recovery.md`
- `docs/qa/evidence/vnext-w3d/physical-proof-result.json`
- `src/vnext/recovery/contracts.ts`
- `src/vnext/recovery/coordinator.ts`
- `src/vnext/recovery/decision.ts`
- `src/vnext/recovery/digest.ts`
- `src/vnext/recovery/index.ts`
- `src/vnext/recovery/indexeddb-repository.ts`
- `src/vnext/recovery/repository.ts`
- `src/vnext/recovery/scheduler.ts`
- `src/vnext/recovery/session-manager.ts`
- `src/vnext/recovery/startup.ts`
- `src/vnext/persistence/reopen-coordinator.ts`
- `src/vnext/persistence/runtime.ts`
- `src/vnext/persistence/save-coordinator.ts`
- `src/vnext/persistence/workspace.ts`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/RecoveryCenter.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/styles.css`
- `tests/vnext/application/w3c-editor-persistence.test.tsx`
- `tests/vnext/application/w3d-startup-race.test.tsx`
- `tests/vnext/persistence/recovery-lifecycle.test.ts`
- `tests/vnext/recovery/recovery-startup.test.ts`
- `tests/vnext/recovery/fixtures.ts`
- `tests/vnext/recovery/recovery-contracts.test.ts`
- `tests/vnext/recovery/recovery-coordinator.test.ts`
- `tests/vnext/recovery/recovery-indexeddb.test.ts`
- `tests/vnext/recovery/recovery-scheduler.test.ts`
- `tests/vnext/proof/fixtures/w3d-indexeddb.html`
- `tests/vnext/proof/fixtures/w3d-browser.html`
- `tests/vnext/proof/fixtures/w3d-browser.tsx`
- `tests/vnext/proof/w3d-indexeddb-adapter-proof.mjs`
- `tests/vnext/proof/w3d-physical-recovery-proof.mjs`
