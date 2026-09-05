# G1 — Save, draft ownership and ACK contract

Mission: COMPANY.READINESS.WAVE0A.G1-DESIGN; RR-001 + RR-002 + RR-003. Date: 2026-09-05.

Status: design amended for independent re-review after `G1_STRONG_DESIGN_REVIEW1.md` returned **APPROVED WITH MANDATORY AMENDMENTS**. G1-R1-001, G1-R1-002 and G1-R1-003 are normative in this revision. **Wave 0B remains blocked until independent re-review approves this amended SHA and the separate H0A/story prerequisites are satisfied.** No production source changes. This is a future implementation contract, not evidence that the defects are fixed.

Base: `origin/remediation/company-readiness-wave0`, resolved locally to `e3e581870fe345d6e13198e413c601b842477403`. Working branch: `remediation/g1-save-draft-design`, created at that exact SHA. No main merge, push, migration or live verification.

## 1. Authority and source validation

Read the complete CR-001/002/003 findings (the findings ledger uses CR, not RR), complete RR-001/002/003 implementation packets, and G1/ownership/Wave 0/checkpoint sections of orchestration. The preserved AUD-001/002/005/012 probe bodies were also inspected. Sources:

- [Findings](COMPANY_READINESS_FINDINGS.md)
- [Packets](COMPANY_READINESS_IMPLEMENTATION_PACKETS.md)
- [Orchestration](COMPANY_READINESS_REMEDIATION_ORCHESTRATION.md)
- [Original probe evidence](COMPANY_READINESS_AUDIT1.md)
- [Deterministic interleavings](G1_INTERLEAVING_MATRIX.md)

The shared root cause is that ownership of **unacknowledged local content** is inferred from transient UI state or scheduling containers. Queue removal, component unmount, a response arriving, or a remote refresh is incorrectly treated as disposal of that ownership. Ownership must instead end at a validated ACK of that generation, explicit discard, or explicit reconciliation. Scheduling is subordinate to ownership.

Verified against source at the base SHA (line references apply to that SHA):

| Source / anchor | Actual behavior | Design consequence |
|---|---|---|
| `src/stores/useLibraryStore.ts:602`, `updateProduct` / `updateProductCell` | Product snapshot and expectedVersion captured at enqueue; 500 ms debounce | Keep coalescing but derive CAS at dispatch from session lineage |
| Same file:697, `flushLibraryEdits` | Empty queue returns true before checking in-flight; batch clears before ACK; busy caller returns true; recursive drain | Retained owner record, shared completion, bounded passes |
| Same file:725 | ACK patches visible version only | Advance successor base in owner record as well |
| Same file, `loadWorkspace` / realtime UPDATE / DELETE / family UPDATE | Remote data replaces local product or removes it; family rename rewrites product fields | Merge by owner, quarantine remote changes while dirty; no load/realtime ACK |
| `src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx:61–151` | Draft/dirty/save local to component; save replaces entire workbook; effects reload on product/family ID | Workbook-specific session outside component; generation-sensitive ACK and load epoch |
| Same file:176, conflict reload and error retry controls | Only Back confirms; conflict reload replaces draft; save error Retry invokes load | All exits/reloads use contract; save Retry must save, not reload |
| `src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx:49–87` | Experience switch unmounts Classic | Preserve session independently of both views |
| `src/components/library/LibraryView.tsx:108–150`, 729, 800, 959 | Local selected Product plus UI-store ID; parent can replace selection; mount reload; own Ctrl+S listener | Resolve current ID to session; guard/preserve both selection entry points; remount cannot reset |
| `src/stores/useUIStore.ts:69–77` | Area/open/close actions mutate navigation directly | Apply dirty-leave policy at these action boundaries |
| `src/services/product-workbook/product-workbook.repository.ts`, `saveWorkbook` | Enforces expectedRevision equal to payload.revision; parses response; requires revision +1; throws typed conflict | Payload revision and CAS token must be advanced together; retain strict repository |
| `src/services/supabase.service.ts:853`, `saveProduct` | Calls save_product_v4; returns success/data or conflict; other errors lose structured SQL code | Validate ACK at Library adapter; use explicit retry for all non-conflict failures, no speculative error classification |
| `src/domain/product-workbook/operations.ts:5` | Domain edits deliberately preserve persisted revision | Generation is session metadata, never a replacement for domain revision |
| `src/App.tsx:45–60` | Second global Ctrl+S handler also calls Library flush | Duplicate triggers must join; no extra save loop required in App |

This base is a React/Vite application (`package.json`: `tsc && vite build`), not a Next.js implementation. No Next.js code or guide-dependent API change is proposed.

## 2. Shared contract, distinct authorities

Shared: definitions, legal transitions, ACK validation principle, ownership/lineage, explicit retry, conflict barrier, finite scheduling and leave outcomes. Shared tests may use the same scenario descriptions. **Do not create a generic persistence framework or replace either repository.**

Library authority remains `useLibraryStore`, one owner record per product ID, containing Product drafts and version tokens. Workbook authority is a small new Workbook-only session store, proposed `src/stores/useWorkbookDraftStore.ts`, keyed by authenticated session + owner.kind + owner.id. Its records outlive Classic, Mega, Library and internal area unmounts in the same browser runtime. The gate and Classic subscribe to the same record. Family knowledge is a read dependency, not part of the product write owner.

Library and Workbook counters for the same product are independent: acknowledging Product.version does not acknowledge ProductWorkbook.revision. Neither save is a transaction with the other, source documents or assets. Navigation affecting both checks both; partial success retains the failed authority and blocks save-and-leave. No compensating write to undo a successful authority.

Authenticated session identity scopes drafts. Owner switch never transfers content or requests into another owner/user. On authentication loss, stop new sends and hide/quarantine old-session records; a late response can only settle its captured record. Do not expose old-user drafts to a newly authenticated user. Forced process termination/session loss is not durable recovery; see section 7.

## 3. Required per-owner state

These are semantic fields; Library may retain its vocabulary. All state transitions below must be atomic from subscribers' perspective.

| Concept | Definition |
|---|---|
| `ownerKey`, `epoch` | Authority + auth session + entity identity, and incarnation token. Each load/request captures both. Explicit discard/reconciliation opens a new epoch only after no unresolved write remains |
| `readEpoch` / `loadToken` | Monotonic applicability token for reads within an owner epoch. A completion may mutate lineage only if its owner/auth/epoch/read token is still current and no later transition invalidated it |
| `baseSnapshot`, `baseRevision` | Canonical server snapshot and CAS revision from which the active local lineage derives. Initialized by a successful verified load. It advances atomically on own validated ACK after canonical replay, on explicit reconciliation, or on the CLEAN authoritative-refresh transition defined below. Null/unknown is not revision zero |
| `remoteRevision`, `remoteSnapshot`, `remoteDeletion` | Most recent eligible server evidence, possibly newer than base; unknown allowed. Deletion is a tombstone. Remote evidence alone is never a dirty write token |
| `localGeneration` (L) | Monotonic accepted local-edit counter within epoch, initially 0; each accepted local content mutation increments once. ACK/refresh/replay never increments it |
| `acknowledgedGeneration` (A) | Highest local generation covered by a validated own ACK in this epoch; initially 0 for loaded baseline. Never incremented by refresh/realtime |
| `draft` | Latest complete local content visible/owned by the session |
| `SENT_SNAPSHOT` (S) | Immutable complete persisted projection captured at dispatch for generation N, with owner/auth/epoch/request identity and expected revision. It is never rewritten by later edits |
| `POST_SEND_DELTA` (J) | Ordered, generation-tagged mutations accepted strictly after N and before ACK reconciliation completes. It records assignments, explicit deletions, and supported structural operations; edit-then-revert remains represented because intent is recorded per mutation, not inferred only from final diff |
| `ACK_CANONICAL_SNAPSHOT` (C) | Complete canonical persisted projection returned by a validated ACK, mapped into the authority's domain shape and carrying accepted revision r+1. Server normalization/deletion is authoritative for paths untouched after send |
| `CONTINUING_DRAFT` (D) | `replay(C, J)` when replay is valid. D inherits C for untouched paths and applies post-send local intent in generation order. D is the only draft eligible for a successor |
| `inFlight` (I) | At most one immutable request per owner: S, generation N, expected revision, owner/auth/epoch/request ID and its post-send journal J. Held until settlement and reconciliation outcome are recorded |
| `pendingGeneration` (P) | Latest owned unsaved generation not already represented by I. L when L>A and either no I or L>I.generation; otherwise empty. It does not imply permission to send |
| `failure` | Last known-unsuccessful attempt and generation, plus retryable-by-explicit-action state. Failure never consumes ownership. A transport error after possible commit is uncertain outcome, not permission to resend automatically |
| `reconciliationRequired` | Fail-closed barrier containing C or accepted receipt, the retained local draft, J and reason when canonical replay cannot be proven safe or canonical content is unavailable. Zero successor writes until explicit resolution/verification |
| `conflict` | CAS rejection, remote deletion, or verified remote divergence not explained by own ACK. Stores remote evidence while preserving base and draft |
| `discardToken` | One-shot authorization bound to auth identity, ownerKey, epoch, L, baseRevision/readEpoch, navigation intent and discard-read token. It authorizes disposal only while every captured value still matches |
| `saving` | I exists. Completion flags clear only after the request settles and ACK/failure/reconciliation transition is atomically recorded |
| `dirty` | L>A for current epoch. It stays true during saving, failure, reconciliation required, conflict and hidden-view preservation |
| `discarded` | Explicit terminal outcome for previous epoch, never a simulated ACK. A successful discard creates a new epoch at the chosen verified snapshot/deletion state with L=A=0 |

In-flight generation may cover multiple coalesced edits: ACK of generation 3 covers 1..3 in that lineage; this does not require transmitting each intermediate state. An edit that returns to the original value may remain dirty until ACK or explicit discard; deep equality is not persistence proof.

Remote freshness and local dirty are separate. A clean owner can observe a newer remote value and accept it; a dirty owner must retain its draft. Library aggregate `isDirty = any owner dirty`; `isSaving = any owner saving`. Derive syncStatus with priority conflict > error > saving > dirty > offline/unverified > synced. CRUD/load success elsewhere must not overwrite these aggregates. Initial/demo/offline-cache content is not remotely verified merely because L=A=0; never show synced for an unverified baseline.

## 4. Transition rules and ACK semantics

1. **Open/load.** Deduplicate the active load for that owner/dependency identity. Capture auth identity, ownerKey, epoch, readEpoch/loadToken and base revision at start. A completion may adopt state only if all captured applicability fields still match. Missing Workbook after a successful authoritative read creates revision 0 baseline; read error does not. Family dependency reads are separate from product-write ownership.
2. **Edit.** Create the latest immutable content, increment L once and set P. Preserve failure/reconciliation/conflict barriers. If I exists for generation N, derive the actual mutations between the immediately preceding draft and the new draft and append them to J with this generation. Record explicit deletes and structural operations. Whole-document callbacks may be diffed at the store boundary, but must not mark every field as edited. For Workbook collections, address existing entities by stable IDs; membership/order operations are distinct from child-field edits.
3. **Dispatch.** With a verified baseline, no conflict/reconciliation/failure barrier unless explicitly retrying a known failure, no unresolved I and dirty=true, capture `SENT_SNAPSHOT=S` from the latest draft and generation N. Capture expected=baseRevision **at dispatch**, owner/auth/epoch/request ID and initialize J empty. For Workbook set the captured payload's `revision=expected` because the repository requires payload revision and CAS token to match. Removing scheduling metadata never removes S, J or draft ownership.
4. **Busy save.** Join the active owner/drain completion and record at most the bounded successor intent; never return early success and never start a parallel mutation for the same owner. Settlement/outcome seen by joiners must match the active operation.
5. **Validate ACK.** Require matching request/owner/auth/epoch and accepted revision exactly expected+1. Library full-row ACK is mapped from SQL row `sku/name/family/family_id/data/version` into the existing persisted Product projection before reconciliation; contradictory identity fails. Workbook retains repository parsing/validation and requires returned owner identity plus returned workbook revision/result revision to match. Invalid or malformed data never acknowledges content.
6. **Canonical ACK + replay (G1-R1-001).** Let C be the complete validated canonical ACK projection. The continuing document is exactly `CONTINUING_DRAFT = replay(ACK_CANONICAL_SNAPSHOT, POST_SEND_DELTA)`. Replay J in generation order. Untouched paths inherit C, including trims, resolved IDs, server deletions and other normalization. A post-send local assignment wins for that path; a post-send local deletion remains deleted. Returning a field to its sent value is still local intent if a recorded post-send mutation did so. For collections, stable entity IDs determine child targets; do not replay by array offset or replace a whole collection merely because one child changed.
7. **Successful ACK transition.** If replay is valid, atomically set `baseSnapshot=C`, `baseRevision=accepted revision`, `A=N`, `draft=D`, clear I/J, preserve L, set P=L when L>N, and advance remote observation without lowering newer evidence. ACK reconciliation does **not** increment L, call edit handlers, arm debounce or create a fresh automatic budget. If J is empty, D=C. A successor may be considered only after this atomic transition and only if no newer remote evidence/conflict exists.
8. **Structural incompatibility / incomplete canonical ACK.** If C removes/rekeys a parent required by J, changes a patched value to an incompatible structural type, conflicts with collection membership/order intent, makes the replay invalid, or otherwise cannot be applied safely, fail closed. Preserve C, local draft and J; enter `reconciliationRequired`; emit zero successor writes. Do not invent ID mappings, resurrect server-removed structures, discard local work or guess a merge. If Library receives only a valid revision receipt without a complete canonical projection, do not fabricate C from S. Preserve receipt/S/J and enter canonical-verification-required state. One **explicit** canonical read may complete reconciliation only for the same owner/auth/epoch and exact accepted revision; higher revision becomes conflict evidence, lower/stale/failed read leaves the barrier. Never retry the already accepted write with its old CAS base.
9. **Lineage / successor CAS.** A successor uses the accepted ACK/clean-refresh base revision that the current draft actually derives from. After successful replay of ACK N, expected=N's accepted revision. A remote observation newer than that ACK remains separate evidence and blocks the successor. Never assign a dirty successor's expected revision from an unrelated remote observation merely to bypass CAS. Product.version and Workbook.revision are never incremented optimistically.
10. **Failure/retry.** A known failed request clears settled I but retains latest draft/J intent as local ownership, restores P=L, preserves base/A and latches failure. Local edits may continue. A new explicit Save/Retry sends the **latest** draft using the unchanged base unless own ACK, CLEAN refresh or explicit reconciliation advanced it. Timers/blur/effects do not retry failures. A second failure relatches the barrier. An unresolved/uncertain request continues to own I and cannot be retried concurrently.
11. **True conflict.** SQLSTATE 40001 / verified third-party divergence / observed remote deletion latches explicit conflict. Preserve local candidate, base and remote evidence. All automatic successor/retry writes stop. Further local edits remain owned but do not clear conflict. There is no automatic conflict retry loop or hidden rebase. Explicit reconciliation/discard is a separate user decision and new lineage.

### Realtime, late loads and uncertain outcomes

Realtime and refresh are evidence, never a local ACK. While I exists, buffer/coalesce the highest eligible remote observation instead of immediately classifying the anticipated +1 update as third-party conflict: an own realtime echo can precede HTTP ACK. On validated full canonical ACK, a compatible observation at that revision is the own echo; a newer revision remains divergence. Equal content/revision without accepted request identity is insufficient proof of ACK. A version-only receipt plus same-revision echo enters canonical verification unless that echo supplies a complete eligible canonical projection under the same owner/auth/epoch rules.

### Authoritative refresh adoption (G1-R1-002)

A refresh is eligible only after owner/auth/epoch/read-token validation. Define CLEAN for refresh purposes as: verified baseline; `L=A`; no I; no failure; no conflict; no reconciliation/canonical-verification barrier. Adoption is one atomic publication of document and lineage.

| Owner state when eligible refresh completes | Required transition |
|---|---|
| CLEAN + strictly newer verified snapshot | Atomically set `draft=remoteSnapshot`, `baseSnapshot=remoteSnapshot`, `baseRevision=remoteRevision`, and remote evidence to that same pair. Keep L=A unchanged. A later edit derives from and saves against this new base |
| CLEAN + equal revision + compatible canonical content | Idempotent; no generation change and no network continuation |
| CLEAN + equal revision + incompatible canonical content | Protocol/integrity barrier; do not silently replace one same-revision document with another |
| CLEAN + lower/stale revision | Ignore for adoption; never roll draft/base/remote backwards |
| DIRTY | Preserve draft/base/A/J. Store newer remote snapshot/revision/deletion only as evidence and latch conflict when it is true divergence |
| SAVING | Preserve I/S/J/draft/base. Buffer eligible remote evidence. ACK reconciliation decides own echo versus newer divergence; refresh itself never rebases I |
| FAILED_WITH_DRAFT | Preserve failure, draft/base/A. Store remote evidence separately; no read can turn failure into clean or rewrite retry base |
| CONFLICT / reconciliationRequired | Preserve local lineage and barrier. Refresh may improve remote evidence for explicit resolution but cannot auto-resolve it |

Required ordering consequences: refresh during save cannot change I.expected; refresh immediately after ACK may clean-adopt only if the ACK transition left the owner clean; refresh between ACK and an authorized successor sees DIRTY and therefore cannot rewrite successor lineage; a stale refresh started before ACK is inapplicable after the ACK/read token changes. Owner switch/product switch never lets a completion for P mutate Q. Remote deletion is a tombstone: CLEAN may adopt explicit deleted-owner state according to product lifecycle UI, while DIRTY/SAVING/FAILED/CONFLICT retain the local draft and conflict evidence. Remote normalization on a CLEAN refresh is authoritative; on any active local lineage it remains evidence and never rewrites untouched local base behind that generation.

Compare Library echoes using the persisted projection (row sku/name/family/family_id/data mapped to Product code/model/family/family_id/specs), ignoring server timestamps and audit metadata. Do not compare raw Product objects to raw SQL rows. Inspection of `supabase/migrations/00012_library_schema_and_security_hardening.sql:434` confirms updates increment version by one and return a row, with CAS enforced for positive expectedVersion. Library existing-product dispatch therefore requires a known positive integer base, never 0/null. Workbook creation legitimately uses revision0 through its different protocol.

SQL boundary limitation found during validation: save_product_v4 inserts if the row is absent, even when an old positive expectedVersion was supplied. G1 blocks an **observed** remote deletion, but cannot guarantee preventing recreation when a remote delete races the write without a notification; an extra preflight read would not close that race. An update-only server CAS contract would require a separately authorized backend packet; do not change historical SQL or claim this design fixes that server behavior. Likewise, G1 acknowledgment covers the existing persisted Product projection, not a repair of legacy description/imageUrl serialization. Strong review must retain these explicit boundaries; no browser-only concurrency model can repair them.

Stale remote events/loads cannot roll base backwards. A load started before an ACK cannot overwrite its result; drop the stale token. A background fetch or family rename event cannot modify draft fields behind the user's back. Preserve the draft and record the new remote baseline evidence; unrelated products may refresh normally. Remote deletion keeps a tombstone beside the draft; it must not become an implicit create.

If a request committed but its ACK was lost, a retry with the old base can legitimately conflict. The current protocols lack an idempotency receipt proving which writer committed. Classify this as unresolved remote conflict/uncertain outcome, not a proven third-party edit and not the deterministic AUD-002 self-conflict. Preserve draft; explicit reconciliation is required. Do not claim arbitrary network partitions can be distinguished perfectly.

An unresolved promise continues to own I and prevents a second mutation. A timeout message is not cancellation and cannot unlock retry/discard as if the request never committed. 0B must not add a watchdog that releases this lock without a settlement/receipt protocol. Finite drain below bounds network attempts; it does not promise a network response deadline. Navigation can preserve the record while a request hangs.

## 5. Finite Library draining and Workbook Save

Library keeps 500 ms edit debounce and per-product coalescing. Replace recursive flush with one active drain object. Capture a finite set of eligible owner IDs at drain start. Perform at most **two passes**, at most one RPC per captured owner per pass; pass two captures that owner's latest pending generation after its first pass ACK. Failed/conflicted owners never enter pass two. Owners added after drain start wait for a later explicitly scheduled drain; do not extend the owner set while iterating.

An edit/busy flush during pass one can request the single successor pass. An edit during pass two remains pending. Drain completion itself must not recursively request another drain or install a timer. A new edit after completion, or a new user Save/Retry, starts a new bounded drain. If the last edit's timer fired while busy after the pass budget was consumed, leave visible dirty status and require a new Save (or subsequent edit); do not silently claim autosave completed. This deliberate bound is preferable to an unbounded await-until-idle contract. No polling on dirty state.

Tag automatic timer work with an edit sequence token. At drain completion invalidate/cancel all outstanding automatic triggers created at or before its final edit-token cutoff, including owners added during the drain, without deleting their pending content. An old timer firing just after completion cannot masquerade as a new edit and start an unbounded chain. New edit tokens after completion may schedule normally. Surface remaining dirty content as requiring Save when its automatic trigger was consumed by this bound.

`flushLibraryEdits()` retains Promise<boolean> compatibility: true only when its drain has settled successfully **and all current Library owners are verified, clean, with no pending/in-flight/failure/conflict** at the final check. False may mean newer edits remain, not just network error; syncStatus distinguishes dirty from error. All callers joining a drain receive its real aggregate result. No transient synced publication between passes. Independent owner successes do not erase another owner's error.

Make invocation intent explicit inside the store, e.g. optional `reason: 'manual' | 'automatic'` defaulting to manual for existing public calls. All three internal debounce/immediate edit paths pass automatic; blur is automatic too. Ctrl+S is manual. Automatic calls cannot release a failure barrier. Simultaneous manual retries join one active drain. Conflict blocks either intent until explicit resolution.

Workbook remains manual-save. One invocation captures one generation; later edits remain pending and require the next Save. Duplicate calls while busy join that single result, without autosave. A result for N may report N acknowledged but must not say the whole draft is saved when L>N. Replace unconditional success alert with full-draft success only if clean; otherwise show that newer changes remain unsaved. Save-and-leave freezes edits briefly and captures latest target so one save can finish that target without chasing new edits.

## 6. Storm Guard compatibility — conceptual proof

Read `tests/integration/incident1-supabase-storm-guard.test.ts` and `MegaWorkspaceReadOnlyContainer.tsx`. Existing incident tests assert catalog conflict blocks 50 callers, queued conflict stops draining, local edits do not unlock conflict, and Mega loading uses two Workbook reads plus one source batch for the fixture, zero writes. The first Mega test simulates loading rather than mounting the real component: retain it and add real lifecycle request-budget coverage.

Every internally generated network transition is finite:

| Automatic transition | Hard bound |
|---|---|
| Library accepted edit → 500 ms timer / immediate edit / blur | One valid automatic intent may start or join one drain. For K owners captured at drain start, at most 2K mutations total |
| Library pass-one valid ACK + replay with authorized pending successor | At most one pass-two mutation for that captured successful owner |
| Library pass-two ACK, drain completion, ACK replay, status publication, expired pre-cutoff timer | Zero new mutations and zero continuation timers |
| Workbook edit | Zero automatic writes; Workbook Save is manual |
| Duplicate/busy manual Save while request exists | Join current request; zero parallel same-owner writes |
| Known failure | Zero automatic retries/refetches. Each later explicit manual retry creates at most one Workbook attempt or one bounded Library drain |
| reconciliationRequired / canonical-verification-required | Zero automatic successor/retry. One explicit canonical/reconciliation read per user action; repository v2-missing fallback adds at most one v1 RPC for that logical Workbook read |
| SQLSTATE 40001 / true conflict / observed deletion conflict | Zero automatic retries, successors or conflict reads until explicit resolution |
| Refresh/realtime/ACK/clean adoption | Zero self-triggered reads/writes except an already-budgeted Library pass-two successor after successful own ACK replay |
| Owner/product switch, preserve navigation, unmount, remount, beforeunload | Zero writes caused by lifecycle. Matching initial loads are deduplicated by owner/auth/epoch/read identity |
| Classic fresh load | One product Workbook logical read + at most one family dependency read; each logical Workbook read has at most one v1 fallback when v2 RPC is missing |
| Mega fresh load with family and referenced sources | Two logical Workbook reads + one source batch; no source batch when no referenced sources. StrictMode initial effect replay is bounded to two effect executions for the same fixture |

Finite Library draining still uses a monotonically decreasing pass/owner budget. ACK replay never calls an edit handler, increments L or installs a timer, so normalization cannot manufacture a new budget. Failure and conflict latch barriers. Pre-completion automatic timers are invalidated by the drain cutoff; only an actual later edit or explicit user action may create a later bounded budget.

The forbidden chain `ACK → successor → conflict → automatic retry → conflict → ...` therefore terminates at the first conflict: `ACK → at most one budgeted successor → 40001 → zero automatic network transitions`. Catalog save engine and its existing incident guard stay untouched. This is a proof of specified transition/request bounds, **not runtime evidence that an unimplemented fix meets them**.

## 7. Dirty-leave UI contract

Use one simple decision interface where needed, without layout redesign. Default safe behavior for in-app view/owner navigation is **preserve in this browser session**; communicate “rascunho mantido nesta sessão” near the gate/workspace status. Explicit preserve policy is allowed by the mission and needs no confirmation on every switch. Retained drafts remain dirty and accessible on returning to the same owner. Mega continues to show persisted read-only knowledge, with gate-level notice that Classic has an unsaved draft; never present Mega's persisted content as that draft.

| Boundary | Required default and alternatives |
|---|---|
| Classic → Mega | Preserve Workbook session, including I/error/conflict. Display preserved-draft notice. Optional Save and switch / Discard and switch / Cancel use rules below |
| Mega → Classic | Restore same owner session immediately. Do not reload over retained draft; Mega does not create edits |
| Product change | Preserve old owner, bind new owner by ID. Async completion stays with captured old owner. Offer explicit save/discard/cancel if user elects to dispose of draft |
| Family change | Preserve all affected Product and Workbook owners. Family selection is not write ownership; clear only stale family read projection. Product reassignment is a Product edit and follows Library persistence |
| Close workspace / Library area change | Preserve records above unmount; reopening restores them. Both local Library selection and useUIStore entry points apply same policy |
| Internal route/unexpected React unmount | Session store retains dirty/I records; cleanup detaches listeners only. No cleanup save, reset or discard |
| Browser refresh / close / external route | Install beforeunload while any record dirty or in-flight; browser-native confirmation offers leave/stay. Cannot await save there. User must use normal Save and wait before leaving to guarantee persistence |

Save-and-leave: capture involved owner epochs and latest generations, prevent further edits in the departing scope during the operation, await all relevant authority saves, then recheck current generations, errors, request state and navigation token. Commit navigation only if all captured/current targets are clean. Failure/conflict/pending cancels navigation and preserves drafts; never interpret a boolean busy result as permission. Release edit lock on all settled outcomes. A newer navigation intent invalidates an older completion, so a late save cannot navigate to an obsolete target.

Cancel: do not change selection/experience, do not clear dirty/error, do not schedule any write. Preserve: navigation may happen immediately; existing I may settle into the hidden record. Returning restores that record.

Discard (G1-R1-003): label it explicitly as loss of local unsaved changes. With no unresolved I, confirmation creates a one-shot `discardToken` capturing exact auth identity, ownerKey, epoch, `L`, baseRevision/readEpoch, navigation intent and the discard read token (or the exact known verified snapshot when no read is needed). Keep the draft while any discard read is pending. A delayed read may replace local state **only while every captured field still matches**, I is empty, no newer remote evidence invalidates the chosen snapshot, and the navigation intent is still current; then atomically terminate the old epoch and adopt the chosen snapshot/deletion state in a new epoch.

Any later edit, Save/Retry dispatch, new generation, base/epoch change, owner switch, product switch, cancellation, superseding navigation, or navigation that establishes another lineage invalidates the token immediately. A stale delayed read then becomes evidence only and must not erase the later draft. A failed read preserves the draft and expires the token. A synchronous known-base discard also advances epoch/read tokens so older normal-refresh/discard completions cannot resurrect the discarded lineage. With I unresolved, discard remains unavailable; after settlement the user must make a **new** discard decision. An HTTP abort or unmount cannot undo a committed write, and discard never sends a compensating older snapshot.

Load/Retry UI: loading errors retry reads; saving errors retry saves. “Recarregar Dados Mais Recentes” in conflict must explicitly mean discard local edits and reload, or fetch only for comparison. It cannot silently reset the draft.

Browser limitations are explicit: memory session retention covers React unmount/remount, not a killed tab/process, crash or accepted browser unload. Existing `StorageService.saveProducts` stores products without an outbox receipt and is not proof of durable unsaved recovery. No new durable outbox is introduced in G1. Never promise automatic save on unload. In-app `loadWorkspace` after failure must preserve draft; hard browser reload only has the native leave decision in this scope.

## 8. Wave 0B permanent regression specifications

Use fake timers only for scheduling; use deferred promises for RPC/read responses, settle each explicitly inside act for React tests. Assert intermediate states via subscriptions to catch a fleeting false synced state. Mock Supabase/Storage repositories and retain external fetch barrier in tests/setup.ts. Reset session records, private queue/timer/drain state and auth identity between tests; `setState({products})` alone does not reset today's module-level queue. No real credentials or DB required.

| ID / target test file | Required sequence and assertions |
|---|---|
| AUD-001 / `tests/stores/library-save-queue.test.ts` (new) | Load v1; edit A; defer write; concurrent flush remains unsettled with exactly 1 RPC; reject offline. Both return false, A=0/L=1, draft A/error/dirty retained. Advance timers: no extra RPC. Explicit retry sends A expected1, ACK v2; exactly 2 calls, true/clean only now. Then mock persisted reload verifies A. Variant: edit B after failure and load old cloud snapshot; B remains; retry sends B |
| AUD-002 / same | Save A expected1; edit B during I; request successor; ACK A v2. Observe draft B, A=1/L=2, no clean state. Successor sends B expected2, ACK v3; call versions exactly [1,2]. Defer second ACK too. Add third writer v3 after A ACK: second call expected2 conflicts; preserve B/base2/remote3, no third call |
| AUD-005 / `tests/integration/workbook-draft-lifecycle.test.tsx` (new) | Real Classic parent, initial revision1; add module A; save deferred snapshot1; add B; ACK snapshot1 revision2. Both modules survive, dirty remains, draft.revision2; exactly 1 write and no unconditional full-success alert. Next Save sends both with payload.revision=expectedRevision=2; ACK3 clears dirty. Include facts/dataset/evidence content in fixture and at least one actual tab edit journey |
| AUD-012 / same, real gate | Edit Classic; switch Mega; return Classic. Under chosen preserve policy confirm need not fire: assert retained generation/content/dirty and preservation notice, 0 writes. Cover save-and-switch, rejected save staying Classic, cancel unchanged, explicit discard only when chosen. Repeat via product/family/close/area exits; mocks may drive race unit test, but at least one real tab edit covers operational journey |

Mandatory additional cases:

- ACK/load for owner P arrives after Q opens: only P changes; Q data, loading and revision untouched. P remount during in-flight joins, never starts another write or resets from server.
- Normalized ACK replay: send S with `code=" P-100 "`, edit a different persisted field after send, ACK canonical `code="P-100"`; continuing draft contains normalized code plus the later edit and successor expected revision is ACK revision. Add same-field local precedence, post-send change-then-revert, server field deletion, post-send user deletion, normalized untouched collection sibling and incompatible structural normalization. Structural incompatibility preserves C + local draft + J and sends zero successor writes.
- Authoritative refresh: clean refresh atomically adopts content+base revision; dirty/saving/failed/conflict refresh is evidence only. Cover refresh during save, immediately after ACK, between ACK and successor, stale/late refresh, owner/product switch, remote deletion and remote normalization. A clean refresh3 followed by edit must save expected3.
- Discard token: delayed discard read after edit, Save, owner/product switch or new navigation lineage cannot dispose the later state. Successful matching token adopts atomically into a new epoch; failed/stale read preserves draft.
- Realtime own echo before ACK does not erase B or falsely label third-party conflict. Newer third-party event after ACK blocks automatic successor; explicit conflict test without event still proves server CAS protects it. Stale load finishing after ACK is ignored.
- Dirty remote delete, empty workspace reload and offline fallback preserve draft, report divergence/absence; clean other products refresh normally. Family rename cannot silently change a dirty Product payload.
- Failed save followed by edit preserves failure barrier; 50 automatic flushes yield zero writes. 50 save/flush attempts in conflict yield zero writes for both authorities; local edits preserve conflict. One explicit non-conflict retry produces one active request under concurrent invocations.
- ACK malformed/missing revision, wrong owner, wrong request epoch, thrown exception and failure on pass two never set clean or retain stuck drain bookkeeping. Late duplicate ACK is ignored.
- Multi-product drain: one fail, one ACK; retain first's draft/error while second is clean. Aggregate remains dirty/error and flush returns false. A new product added during drain cannot extend its captured owner set.
- Continuously edit using controlled callbacks across pass one and two: at most 2K writes, completion false if edits remain, no completion timer/recursive continuation even after advancing timers. New manual Save persists remainder. Workbook busy Save remains one request.
- Discard with unsettled I is unavailable; preserve/cancel works; after ACK a fresh explicit discard disposes only remaining local edits. Accepted remote save is not rolled back. Discard/reopen creates fresh epoch; old load completion cannot revive discarded content.
- Save-and-leave affecting both authorities: one succeeds and the other fails; no navigation and no rollback; failed draft survives. Navigation token prevents stale destinations.
- beforeunload handler requests native leave warning while dirty/I, unregisters on fully clean/discarded; no attempted async unload write. Do not assert crash durability.
- Preserve `tests/integration/incident1-supabase-storm-guard.test.ts`; run `tests/integration/mega-workspace-integration.test.tsx` and add real mount/rerender request counts with stable identities. Keep repository and domain revision contract tests unchanged unless fixture expectations were invalid.

## 9. Implementation ownership / exact likely files

All paths below are future work, not changes in this design branch.

| File | Authorized implementation responsibility |
|---|---|
| `src/stores/useLibraryStore.ts` | Owner state, both edit entry points, finite queue/ACK/retry, protected load/realtime, aggregate status, explicit reset/discard behavior |
| `src/stores/useWorkbookDraftStore.ts` (new) | Workbook-only session lifecycle/load tokens/manual save, retained records and conflict/retry/discard actions; no generic persistence abstraction |
| `src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx` | Subscribe by owner, send edits to session, safe save status and error actions; remove component ownership/reset-on-load |
| `src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx` | Preserve/restore session across experience switches and show concise retained-draft status; common leave decisions |
| `src/components/library/LibraryView.tsx` | Local product selection and close use same leave policy; resolve session by ID, automatic blur intent, prevent mount reload overwrite |
| `src/stores/useUIStore.ts` | Area/open/close navigation policy and navigation token; coordinate save/discard choices without storing Workbook content here |
| `tests/stores/library-save-queue.test.ts` (new), `tests/stores/useLibraryStore.test.ts` | Permanent Library regressions; deterministic queue reset isolation |
| `tests/integration/workbook-draft-lifecycle.test.tsx` (new) | Permanent Workbook/gate/navigation/owner races |
| `tests/integration/mega-workspace-integration.test.tsx` | Real gate/Mega lifecycle counts and restored Classic session |
| `docs/stories/` implementation story | Required before 0B production edits; owner/checklist/file list and justified scope changes |

Additive scope is justified only for the Workbook-specific session module: putting it in Classic or the gate would still lose it when Library/area unmounts. A small beforeunload listener can be registered by the retained session/store lifecycle; do not depend solely on a Classic effect that disappears in Mega. Library needs equivalent listener coverage for its own drafts. Either listener can request the single browser-native prompt; neither sends writes.

No source-map expansion is needed for `src/App.tsx` or `src/components/common/Navbar.tsx` in this design: navbar routes through useUIStore; duplicate Ctrl+S calls must coalesce at store. Keep Mega's read repository/container unchanged, and put draft notice at the gate. Repositories, domain operations/IDs, SQL/CAS, catalog engine, layout, tabs owned by CELL/EDIT, V2 containment and shared test setup stay outside SAVE. Review-only dependencies include `src/services/supabase.service.ts`, `src/services/product-workbook/product-workbook.repository.ts`, `src/services/product-workbook/persistence.types.ts` and `src/domain/product-workbook/operations.ts`.

Library create/delete/reset and family handlers already share status fields: they must not falsely clear another owner's dirty state. Local deletion of an owner with a draft goes through explicit discard and waits for unresolved writes; no broad family CRUD redesign is implied. If implementation discovers a navigation writer bypassing these checked boundaries, record its exact path and acquire its owner lock before editing it.

0B order remains RR-001 ownership → RR-003 successor lineage → RR-002 Workbook/navigation under one SAVE owner. The orchestration still calls for STRONG ownership of G1 implementation; detailed instructions do not silently authorize splitting it among three lighter agents. Strong contract approval and integrated H0A are required before creating the 0B branch.

## 10. Design delivery checklist and validation

- [x] Base SHA checked; requested branch created at base.
- [x] Findings/packets/G1 orchestration and actual sources inspected.
- [x] One shared ownership contract; separate Library/Workbook adapters.
- [x] State, generations, ACK, failure, retry, CAS, remote uncertainty and dirty leave defined.
- [x] Interleaving matrix and all four permanent regression specifications supplied.
- [x] Request bounds and original Storm Guard compatibility reasoned explicitly.
- [x] Future file map and 0B sequencing supplied.
- [ ] Independent strong design approval (future review).
- [ ] Integrated H0A and 0B implementation story (future coordinator/PO work).
- [ ] 0B implementation and R1 regression/runtime verification (not performed).

Delivery file list: this contract and `G1_INTERLEAVING_MATRIX.md`. No existing audit evidence is rewritten. This design decision is the 0A artifact; the implementation story in docs/stories is a required 0B prerequisite per packet execution rule 1.

Amendment 2 revalidation on 2026-09-05 against the unchanged production-source baseline:

| Command | Result |
|---|---|
| `npm run lint` | Unavailable, exit1: Missing script: lint (RR-016); not PASS |
| `npm run typecheck` | PASS, exit0 |
| `npm test` | PASS, exit0: 154 files, 1,649 tests, 35.33s; existing React act warnings observed |
| `npm run build` | PASS, exit0; Vite build 10.41s; existing pdfjs eval, mixed import and bundle-size warnings |
| `git diff --check` | PASS |
| Amendment scope | Only `G1_SAVE_DRAFT_ACK_CONTRACT.md` and `G1_INTERLEAVING_MATRIX.md`; zero production/test/migration changes |

Tool results are local evidence, not deployed verification. No new G1 executable tests were written because this mission is documentation-only; the matrix specifies the permanent 0B regressions. These checks do not validate an unimplemented runtime fix or close company readiness. The optional skill greeting helper failed because `.aiox-core` lacks `execa`; this did not prevent source inspection, design work or project gates, and dependencies were not changed to repair it.