# W3.D — Local Crash Recovery

Status: **InProgress**

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

- [ ] W3.D uses the existing VNext persistence/session authority below React and preserves W3.0–W3.C contracts, including canonical `CatalogDocument` sole authority and W2.G authoring semantics.
- [ ] IndexedDB is the only recovery store and has a dedicated VNext database; no Legacy authority, localStorage fallback, OPFS requirement, DOM/React serialization, or Undo serialization exists.
- [ ] Strict validated records and keys implement exact authority scope, catalog, and session isolation; corrupt/unknown/unsupported records fail closed and remain preserved.
- [ ] SHA-256 digests cover deterministic canonical persistence representation; unexpected equal-revision digest mismatch does not auto-install recovery.
- [ ] Recovery generations prevent stale overwrite and exact generation-conditional cleanup prevents stale deletion.
- [ ] Scheduling has first-dirty leading persistence, 750 ms trailing debounce, 3000 ms maximum wait, latest-state coalescing, and per-key serialization, all deterministically proven with a fake clock.
- [ ] IDB durability proof observes transaction completion and proves abort/quota/later-write preservation/version creation/shared-storage behavior.
- [ ] A typed, target- and expected-source-qualified visible-draft overlay preserves recoverable Father-visible work without canonical keystroke mutation or generic UI capture.
- [ ] Recovery installs a validated canonical snapshot into a fresh `DocumentSession`, with empty Undo/Redo and a new `openSessionId`; compatible overlays are restored ephemerally only.
- [ ] Recovery text cancel is canonical no-op; confirmation is one `text.setContent` and one Undo; IME recovery remains noncanonical; stale expected source is not auto-applied.
- [ ] Exact pending remote mutations survive restart and use only W3.C same-mutation-id/same-payload replay or authoritative proof; no guessed mutation identity, revision, `Saved`, or overwrite occurs.
- [ ] Pre-dispatch exact recovery flush, S1/L2 continued recovery, ACK-vs-newer-L2 protection, exact ACK-covered cleanup, and ambiguous dispatch preservation are proven.
- [ ] The typed comparison layer decides before installation and covers no recovery, redundant, same-base recoverable, remote conflict, same-revision digest mismatch, unavailable remote, and invalid/unsupported record.
- [ ] Remote-newer/different and remote-unavailable paths retain local work, never overwrite cloud, and provide only safe Father choices/protected inspection.
- [ ] Two same-profile tabs produce distinct session IDs and recovery records with no timestamp authority or overwrite.
- [ ] Same-profile A→B→A authentication proves B cannot enumerate/open/delete A records, A recovery survives logout, A sees it on return, and explicit discard touches only the exact authenticated scoped record.
- [ ] UI uses Father language, never equates local protection/recovery with `Saved`, and never exposes implementation terminology.
- [ ] Recovery retention has no age expiry and is removed only by authoritative redundancy plus conditional cleanup or exact authenticated user discard.
- [ ] The story checklist, task checkboxes, file list, claim-to-oracle evidence packet, and implementation/evidence notes are synchronized by the implementing developer.

## Mandatory deterministic recovery matrix

- [ ] R01 — Immediate first dirty write.
- [ ] R02 — Debounce and maximum wait.
- [ ] R03 — Stale generation cannot overwrite.
- [ ] R04 — Aborted write preserves previous record.
- [ ] R05 — Quota failure and no localStorage fallback.
- [ ] R06 — Exact pre-Save flush.
- [ ] R07 — L2 recovery during S1 flight.
- [ ] R08 — ACK S1 cannot delete newer L2.
- [ ] R09 — Exact ACK-covered cleanup.
- [ ] R10 — Ambiguous request preserved.
- [ ] R11 — Restart plus `lastMutationId` proves commit.
- [ ] R12 — Restart plus exact-base exact replay of same identity/payload.
- [ ] R13 — Divergent remote conflict.
- [ ] R14 — Same revision/digest mismatch.
- [ ] R15 — Edit then Undo to remote is redundant cleanup.
- [ ] R16 — Two tabs have independent records.
- [ ] R17 — No timestamp automatic winner.
- [ ] R18 — Logout A preserves recovery.
- [ ] R19 — B cannot see A.
- [ ] R20 — A login again sees A.
- [ ] R21 — Exact discard only.
- [ ] R22 — Recovered session has fresh Undo/Redo.
- [ ] R23 — Corrupt record rejected and preserved.
- [ ] R24 — Unsupported format rejected and preserved.
- [ ] R25 — Remote unavailable leads only to protected inspection.
- [ ] R26 — Newer remote never overwrites.

## Mandatory visible-draft tests

- [ ] DRAFT-01 — visible Text draft → recovery → crash → accepted recovery: canonical old text remains and the draft restores visibly.
- [ ] DRAFT-02 — cancelling a recovered draft retains canonical old text and creates no Undo entry.
- [ ] DRAFT-03 — confirming a recovered draft dispatches one `text.setContent`, creates one Undo unit, and produces the confirmed content.
- [ ] DRAFT-04 — IME crash recovery preserves intent as noncanonical draft work.
- [ ] DRAFT-05 — stale expected source does not auto-apply.

## Mandatory physical Chromium/Playwright shared-storage browser proofs

Unit tests alone are insufficient. Run real Chromium/Playwright evidence against one persisted browser profile/storage location. Every proof records scenario execution, a directly asserted intermediate durability/isolation condition, and postconditions; fixed sleeps, close actions, inspected PASS text, isolated browser contexts, or uninspected records are not proof.

- [ ] A — Hard crash/restart: edit; prove IndexedDB transaction completion; hard-close page/browser; reopen the same storage; discover and remotely compare recovery; accept it; prove restored state has fresh Undo/Redo and can continue editing.
- [ ] B — Visible noncanonical Text draft crash: canonical A; visibly type B without confirmation; prove typed overlay transaction completion; hard-close/reopen same storage; accept recovery; prove canonical remains A and draft B is visible; confirm; prove exactly one canonical action and content B.
- [ ] C — Save dispatch/recovery race: prove exact pre-Save persistence, allow S1 in flight and L2 editing/recovery, acknowledge S1, and inspect that L2's newer recovery survives rather than being stale-cleaned.
- [ ] D — Pending-mutation restart reconciliation: physically preserve a dispatched/no-ACK pending mutation, restart with same storage, fetch remote first, and prove `lastMutationId` matching commits only that captured mutation with no false `Saved` beforehand.
- [ ] E — Exact replay identity/payload: physically restart from an exact expected remote base after ambiguous dispatch and prove replay uses the original mutation identity and payload, never a new identity; prove divergent remote becomes conflict instead.
- [ ] F — Two tabs: same browser profile/storage and same catalog in two tabs; prove two `openSessionId`s and two inspected records; neither record overwrites the other and no timestamp winner/merge occurs.
- [ ] G — Same-profile auth scope: A writes recovery; B logs in through the same storage and cannot enumerate/open/delete A; A returns and sees its recovery. Isolated contexts with separate storage are prohibited evidence.
- [ ] H — Fail-closed recovery choices: physically prove same-revision/digest mismatch and newer/different remote do not install/overwrite; prove remote-unavailable exposes only clearly local protected inspection and no remote Save/fake binding.

## Developer file-discovery mandate

Before writing production code, the developer must record in this story's Dev Agent Record the exact live paths and symbols discovered from the W3.C head for: canonical snapshot serialization/digests; `DocumentSession` and `openSessionId`; persistence workspace/runtime/save/reopen coordinators; repository GET/CAS/ambiguous reconciliation contracts; auth scope/effective principal policy; W2.G authoring barriers and actual ephemeral authoring surfaces; VNext UI/proof fixtures; test utilities/fake clock; and existing browser launch/profile conventions.

Use `rg --files`, symbol/text search, and focused reads against the actual repository. Reuse existing seams where they meet this contract. Do not invent a parallel persistence authority, assume a filename from this story, alter W3.B/W3.C remote semantics, or select a new abstraction/library/database schema without a discovered need and root architecture freeze. If a required seam is absent, contradictory, or would require any stop condition below, stop and escalate before changing code.

## Tasks / subtasks

- [x] Recon and API freeze: perform the mandated discovery; map contracts and non-overlapping file leases; synchronize this story's File List before implementation.
- [x] Define pure strict recovery types, validation, canonical SHA-256 digest derivation, generation-conditional operations, and remote-comparison decisions without a second document authority.
- [ ] Build the IndexedDB adapter and transaction-completion/error behavior, including shared-storage test support and no-fallback enforcement.
- [ ] Integrate scheduling and recovery lifecycle below React with the existing session/workspace/save authority; preserve S1/L2 and ambiguous mutation rules.
- [ ] Integrate typed visible-draft overlays only through discovered authoring barriers; inventory all visible ephemeral surfaces and escalate uncovered loss paths.
- [ ] Integrate recovery discovery, Father UX, protected inspection, exact discard, and same-profile auth scope behavior without normal remote overwrite/copy implementation.
- [ ] Implement R01–R26 and DRAFT-01–05 focused deterministic/application/adapter/race tests with explicit claim/oracle mapping.
- [ ] Implement and run physical Chromium proofs A–H with durable evidence artifacts; verify intermediate conditions directly.
- [ ] Run independent adversarial review for stale generation, stale cleanup, malformed records, digest mismatch, replay identity/payload drift, user/tab isolation, false `Saved`, and future-wave leakage.
- [ ] Update every completed checkbox, the Dev Agent Record, File List, validation results, browser artifacts, claim matrix, known limitations, and evidence packet; then run required repository gates.

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
| Testing guidance | PASS | R01–R26, DRAFT-01–05, physical shared-storage proofs A–H, no-false-green standard, and required gates are explicit. |
| CodeRabbit integration | N/A | Disabled by `core-config.yaml`; the required disabled notice is present. |

**Final assessment: READY.** A developer can begin only after the mandated repository recon/API-and-file-lease freeze. Any discovered contradiction or stop condition is a Principal decision, not an implementation assumption.

## Dev Agent Record

### Agent model used

GPT-5 Codex root agent (single-root continuation).

### Debug log references

No debug log. Focused Vitest, TypeScript, ESLint, and `git diff --check` were used directly.

### Completion notes

- Inherited from the interrupted orchestration: the complete W3.D story only. No partial recovery production/test files existed.
- Frozen seams used: W3.A `serializeCanonicalSnapshot`, W3.C `DocumentSession` factory/session authority, and `CatalogPersistenceEnvelope` remote comparison.
- Added strict v1 records, exact tuple keys, SHA-256 validation, typed Text/Inspector overlays, exact pending mutation capture, generation-conditional in-memory semantics, seven-way remote decisions, fresh-session acceptance, and recovery scheduling.
- Phase-1 evidence: 3 focused test files / 13 tests PASS; typecheck PASS; focused ESLint PASS; `git diff --check` PASS.
- Physical IndexedDB and browser claims remain unproven and unchecked.

## File list

- `docs/stories/2026-09-12-vnext-w3d-local-recovery.md`
- `src/vnext/recovery/contracts.ts`
- `src/vnext/recovery/coordinator.ts`
- `src/vnext/recovery/decision.ts`
- `src/vnext/recovery/digest.ts`
- `src/vnext/recovery/index.ts`
- `src/vnext/recovery/repository.ts`
- `src/vnext/recovery/scheduler.ts`
- `tests/vnext/recovery/fixtures.ts`
- `tests/vnext/recovery/recovery-contracts.test.ts`
- `tests/vnext/recovery/recovery-coordinator.test.ts`
- `tests/vnext/recovery/recovery-scheduler.test.ts`
