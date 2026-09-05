# G1 — Deterministic interleaving matrix

Normative companion to [G1_SAVE_DRAFT_ACK_CONTRACT.md](G1_SAVE_DRAFT_ACK_CONTRACT.md), base `e3e581870fe345d6e13198e413c601b842477403`. Design only; these are expected future transitions, not executed fixes.

Each independent sequence starts with a verified owner at remote/base revision 1, epoch E1, L=A=0. `R` is last observed remote revision, not omniscience; `B` is baseRevision. `I=g@r` means generation g sent with expected revision r. `P` is retained pending content, including content blocked from scheduling. `D/S` are dirty/saving. `—` means empty. Values A/B/C in Event denote edit contents; column A denotes acknowledgedGeneration. ACK and successor dispatch are separate atomic steps so the intermediate state is testable. Library may execute successor in its second pass; Workbook requires next manual Save.

For amendment traces, `S` is `SENT_SNAPSHOT`, `C` is `ACK_CANONICAL_SNAPSHOT`, `J` is the ordered `POST_SEND_DELTA`, and `D*` is `CONTINUING_DRAFT = replay(C, J)`; `D*` is named differently from the D/S status column. Replay never increments L or schedules work. A structural replay barrier preserves C + local draft + J and emits zero successor writes.

## Amendment 2 required cases A–O

| Case | Required sequence | Deterministic result |
|---|---|---|
| A | send A → edit B → normalized ACK A | Validate C, compute `D*=replay(C,J_B)`. Untouched normalized fields come from C; B survives. A advances only to sent generation; successor, if budgeted, uses ACK revision |
| B | send A → edit B → refresh R → ACK A | Refresh is evidence while SAVING. ACK reconciles S/C/J first. Same-revision compatible R may be own echo; R newer than ACK latches conflict and suppresses successor |
| C | save A for owner P → owner/product switch to Q → late ACK P | ACK settles captured P owner/epoch only. Q content/revision/loading untouched; no navigation side effect |
| D | discard confirmed → edit → delayed discard read | Edit increments L and invalidates discardToken. Delayed read cannot replace draft/base; zero writes |
| E | discard confirmed → Save → delayed discard read | Save dispatch invalidates discardToken before network. Delayed read cannot erase the saved/new lineage regardless of read success |
| F | CLEAN refresh adoption | Newer verified remote snapshot + revision adopted atomically as draft/base/remote. Next edit saves against adopted revision |
| G | DIRTY refresh | Draft/base/A stay unchanged; remote snapshot/revision/deletion stored separately as evidence. No implicit rebase/ACK |
| H | failed save → edit → retry | Failure retains ownership; edit advances latest draft; explicit retry sends latest draft at unchanged base; zero automatic retries |
| I | successor → third-party 40001 | One successor CAS attempt using own ACK base, then explicit conflict barrier; local candidate + remote evidence retained; zero automatic retry loop |
| J | normalized ACK contains field deletion | If that path was untouched after send, D* keeps the server deletion; successor cannot resurrect it |
| K | post-send user deletion | J records explicit delete; replay removes the path from C even if C still contains it |
| L | incompatible structural normalization | Replay cannot safely target J: preserve C + local draft + J, enter reconciliationRequired, zero successor writes |
| M | double explicit Save | Second Save joins the active same-owner request/drain; no parallel mutation and no early success |
| N | unmount → late ACK | Retained owner/session record receives ACK and reconciliation; unmounted/remounted views do not own I or reset draft |
| O | StrictMode duplicate lifecycle | Effect replay may repeat bounded reads per documented budget; no save from effect/cleanup, stable identity dedupes same logical owner loads, zero recursive network chain |

### Normalized ACK and post-send delta traces (A, J, K, L)

Start with Product base revision1: `model="Pump"`, `code=" P-100 "`, `specs.range="Normal"`, and an untouched persisted `specs.legacy="keep"`.

| Event | L | A | R | B | I | P | Required content / transition |
|---|---:|---:|---:|---:|---|---|---|
| A0 edit model → `Pump X` | 1 | 0 | 1 | 1 | — | 1 | Local draft has `Pump X`, original spaced code |
| A1 send generation1 | 1 | 0 | 1 | 1 | 1@1 | — | Capture S and empty J; write #1 expected1 |
| A2 post-send edit `specs.range` → `High pressure` | 2 | 0 | 1 | 1 | 1@1 | 2 | Append only range mutation to J |
| A3 canonical ACK2 | 2 | 1 | 2 | 2 | — | 2 | C has `code="P-100"`; D* has canonical normalized code + ACK model + local range. ACK replay adds no generation/timer |
| A4 successor | 2 | 1 | 2 | 2 | 2@2 | — | Write #2 expected2 sends D*, never spaced code |
| J0 branch from A2, C also deletes `specs.legacy` | 2 | 1 | 2 | 2 | — | 2 | J never touched legacy, so D* omits `specs.legacy`; no resurrection |
| K0 branch from A1, post-send user deletes `specs.legacy` | 2 | 0 | 1 | 1 | 1@1 | 2 | J contains explicit delete, even if C later still contains legacy |
| K1 ACK2 with legacy present in C | 2 | 1 | 2 | 2 | — | 2 | Replay delete over C; D* omits legacy |
| L0 branch from A1, post-send edit targets child `dataset d1.cell x` | 2 | 0 | 1 | 1 | 1@1 | 2 | J addresses stable IDs, not offsets |
| L1 ACK2 removes/rekeys d1 so J target has no safe mapping | 2 | 0 | 2 | 1 | — | 2 | `reconciliationRequired`: preserve C, local draft and J; A/base not advanced as completed replay; zero successor |

If a Library success contains only an accepted revision receipt and no complete canonical projection, treat it like L1's send barrier with reason canonical-verification-required. One explicit same-owner/same-epoch read at exactly that revision may supply C; higher revision is conflict evidence, lower/stale/failed read cannot complete it. Never fabricate C from S or retry the accepted write at the old base.

### Authoritative refresh traces (B, F, G)

| Event | L | A | R | B | I | P | Required transition |
|---|---:|---:|---:|---:|---|---|---|
| F0 owner clean after ACK2 | 1 | 1 | 2 | 2 | — | — | Verified clean baseline2 |
| F1 authoritative refresh3 normalized | 1 | 1 | 3 | 3 | — | — | Atomically adopt remote3 as draft+base+remote; L/A unchanged |
| F2 edit after refresh3 | 2 | 1 | 3 | 3 | — | 2 | Draft derives from remote3 |
| F3 Save | 2 | 1 | 3 | 3 | 2@3 | — | Exactly one write expected3; Workbook payload.revision=3 |
| G0 dirty at base2 | 2 | 1 | 2 | 2 | — | 2 | Local unsaved generation2 |
| G1 refresh3 arrives | 2 | 1 | 3 | 2 | — | 2 | Evidence only; draft/base/A unchanged. Divergence/deletion latches conflict as applicable |
| B0 send generation1 expected1 | 1 | 0 | 1 | 1 | 1@1 | — | S captured |
| B1 edit generation2 | 2 | 0 | 1 | 1 | 1@1 | 2 | J records post-send edit |
| B2 refresh2 arrives while I exists | 2 | 0 | 2 | 1 | 1@1 | 2 | Buffer evidence; never rebase I |
| B3 ACK2 canonical compatible with refresh2 | 2 | 1 | 2 | 2 | — | 2 | Reconcile C+J; refresh2 explained as own echo; successor remains eligible |
| B4 alternate: refresh3 arrives before ACK2 | 2 | 0 | 3 | 1 | 1@1 | 2 | Preserve remote3 evidence |
| B5 then ACK2 | 2 | 1 | 3 | 2 | — | 2 | Base becomes own accepted2 after replay; remote stays3; conflict, zero successor |
| R0 ACK2 leaves generation2 pending | 2 | 1 | 2 | 2 | — | 2 | Dirty between ACK and successor |
| R1 refresh3 arrives before successor dispatch | 2 | 1 | 3 | 2 | — | 2 | Evidence only because DIRTY; conflict blocks successor |
| R2 stale refresh2 started before a later ACK3 settles after ACK3 | 2 | 2 | 3 | 3 | — | — | Old read token is inapplicable; no rollback |
| R3 P refresh completes after active owner switched to Q | P unchanged | — | — | — | — | — | Completion may update only P's retained evidence/session when its captured token is valid; Q untouched |
| R4 remote delete while DIRTY/SAVING/FAILED/CONFLICT | unchanged | unchanged | tombstone | unchanged | as before | retained | Preserve local lineage; deletion evidence/conflict only |
| R5 remote delete while CLEAN | same | same | tombstone | deletion state | — | — | Atomically adopt explicit deleted-owner state only under CLEAN lifecycle rule; never turn it into implicit create |

Remote normalization follows the same split: CLEAN adopts it atomically with its revision; active local lineage stores it as evidence until own ACK replay or explicit resolution. Equal-revision compatible refresh is idempotent; equal-revision incompatible canonical content is a protocol barrier; lower revisions never roll state backward.

### Discard-token traces (D, E)

| Event | L | A | R | B | I | P | Token / result |
|---|---:|---:|---:|---:|---|---|---|
| D0 failed dirty generation3, no I | 3 | 1 | 2 | 2 | — | 3 | User confirms discard; token captures owner/auth/E1/L3/B2/readEpoch/navigation intent; one read starts |
| D1 user edits generation4 before read settles | 4 | 1 | 2 | 2 | — | 4 | Edit invalidates token immediately |
| D2 discard read returns remote3 | 4 | 1 | 3 | 2 | — | 4 | Evidence may update, but draft/base cannot be disposed/replaced; require new decision |
| E0 restart at D0; discard read pending, then user presses Save | 3 | 1 | 2 | 2 | 3@2 | — | Save dispatch invalidates token before request; read has no disposal authority |
| E1 delayed discard read settles | 3 | 1 | >=2 | 2 | 3@2 or settled lineage | as derived | Cannot erase I/new ACK/new draft, regardless of read success |
| D3 discard pending then owner/product switch or superseding navigation | unchanged | unchanged | evidence only | unchanged | — | retained | Token invalidated; old destination cannot be committed by late read |
| D4 matching discard read succeeds with token still exact | 0 | 0 | r | r | — | — | Atomically terminate E1 and create E2 at verified snapshot/deletion; invalidate every older read token |
| D5 discard read fails | unchanged | unchanged | unchanged | unchanged | — | retained | Preserve draft/failure/conflict; token expires; zero automatic reread |

## Normal ACK and edits during ACK

| Sequence / event | L | A | R | B | I | P | D/S | Expected network action / observable state |
|---|---:|---:|---:|---:|---|---|---|---|
| N0 loaded | 0 | 0 | 1 | 1 | — | — | no/no | No writes |
| N1 edit A | 1 | 0 | 1 | 1 | — | 1 | yes/no | Local A; Library arms 500 ms debounce, Workbook no auto save |
| N2 save | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #1 snapshot A expected1 |
| N3 duplicate save | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Join; 0 additional writes; no early success |
| N4 ACK1 revision2 | 1 | 1 | 2 | 2 | — | — | no/no | Clean; joined saves may report success |
| AB0 loaded | 0 | 0 | 1 | 1 | — | — | no/no | No writes |
| AB1 edit A | 1 | 0 | 1 | 1 | — | 1 | yes/no | Local only |
| AB2 save A | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #1 A expected1 |
| AB3 edit B (cumulative A+B) | 2 | 0 | 1 | 1 | 1@1 | 2 | yes/yes | No parallel write; draft A+B |
| AB4 ACK A revision2 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Validate canonical C and set draft=`replay(C,J_B)`; untouched normalization/deletions come from C, B survives; no full-draft success |
| AB5 save successor | 2 | 1 | 2 | 2 | 2@2 | — | yes/yes | Write #2 A+B expected2; Library pass2 or Workbook next Save |
| AB6 ACK successor revision3 | 2 | 2 | 3 | 3 | — | — | no/no | A+B clean, versions sent [1,2] |

AB is AUD-002 for Library and AUD-005 for Workbook. To exercise an edit only after ACK, execute N0..N4, then edit B to reach L2/A1/R2/B2/I—/P2/yes-no, then AB5..AB6. It must also send expected2.

## Failure, newest draft retry and ambiguous ACK loss

| Event | L | A | R | B | I | P | D/S | Expected network action / observable state |
| F0 edit A from baseline | 1 | 0 | 1 | 1 | — | 1 | yes/no | Local A |
| F1 save A | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #1 expected1 |
| F2 request fails offline | 1 | 0 | 1 | 1 | — | 1 | yes/no | Failure retained; flush=false |
| F3 automatic flush x50 | 1 | 0 | 1 | 1 | — | 1 | yes/no | 0 new writes, failure remains |
| F4 explicit retry | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #2 A expected1 |
| F5 ACK retry revision2 | 1 | 1 | 2 | 2 | — | — | no/no | Clean only here; total 2 writes (AUD-001) |
| F2b branch from F2: edit B | 2 | 0 | 1 | 1 | — | 2 | yes/no | Draft A+B, failure barrier stays |
| F3b load returns old A-free baseline | 2 | 0 | 1 | 1 | — | 2 | yes/no | One requested read; no draft replacement or write |
| F4b explicit retry latest | 2 | 0 | 1 | 1 | 2@1 | — | yes/yes | Write #2 A+B, never resurrect old A-only snapshot |
| F5b ACK revision2 | 2 | 2 | 2 | 2 | — | — | no/no | Clean latest cumulative content |
| U0 branch from F1: server commits but transport rejects | 1 | 0 | 1 | 1 | — | 1 | yes/no | Server may be v2; client R remains1, error/uncertain |
| U1 explicit retry | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | One write attempt expected1 |
| U2 conflict reveals revision2 | 1 | 0 | 2 | 1 | — | 1 | yes/no | Conflict; 0 autonomous writes; no claim of proven third-party writer |

If the original request has not settled at all, I remains 1@1 and S=yes; Retry joins/blocks, never sends a concurrent write. A timer expiring is not F2 and does not authorize U1.

## True remote conflict and realtime ordering

| Event | L | A | R | B | I | P | D/S | Expected network action / observable state |
| C0 after AB4 | 2 | 1 | 2 | 2 | — | 2 | yes/no | A acknowledged, B pending |
| C1 third party commits revision3, no notification yet | 2 | 1 | 2 | 2 | — | 2 | yes/no | No client action; server revision3 |
| C2 dispatch successor | 2 | 1 | 2 | 2 | 2@2 | — | yes/yes | One CAS attempt expected2, never expected3 |
| C3 CAS conflict actual3 | 2 | 1 | 3 | 2 | — | 2 | yes/no | Conflict, preserve draft/base; remote3 only if supplied by error/read |
| C4 save x50 and timers | 2 | 1 | 3 | 2 | — | 2 | yes/no | 0 writes; blocked |
| C5 edit C | 3 | 1 | 3 | 2 | — | 3 | yes/no | Preserve A+B+C, still conflict, 0 writes |
| C6 user chooses discard-and-reload; read deferred | 3 | 1 | 3 | 2 | — | 3 | yes/no | Capture exact discardToken; one read; retain draft. Any later edit/Save/owner-navigation invalidates token |
| C7 successful read3 and discardToken still matches | 0 | 0 | 3 | 3 | — | — | no/no | Atomically create E2; E1 discarded. If token mismatches, follow D/E and preserve local lineage |
| E0 branch from AB3: own realtime echo revision2 before ACK | 2 | 0 | 2 | 1 | 1@1 | 2 | yes/yes | Buffer remote content, no ACK or successor |
| E1 validated ACK1 revision2 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Echo explained, A+B preserved; successor now eligible |
| E2 third-party realtime revision3 before successor | 2 | 1 | 3 | 2 | — | 2 | yes/no | Conflict barrier; successor sends 0 writes |

Library errors do not currently expose actual revision, so C3 may leave R=2 until an explicit read supplies 3. Conflict must work equally with unknown actual revision. A missing remote row is a deletion conflict, never permission to create it silently.

## Experience, owner selection, close and unmount

Default navigation policy is explicit session preservation; it does not require a confirm call. Every row preserves records above the view tree. Each sequence below starts independently.

| Event | Owner / epoch | L | A | R | B | I | P | D/S | Expected network action / observable state |
| V0 edit Classic A | P/E1 | 1 | 0 | 1 | 1 | — | 1 | yes/no | No Workbook write |
| V1 Classic → Mega preserve | P/E1 | 1 | 0 | 1 | 1 | — | 1 | yes/no | 0 writes; fresh Mega fixture: 2 logical WB reads + 1 source batch; retained-draft notice |
| V2 Mega → Classic | P/E1 | 1 | 0 | 1 | 1 | — | 1 | yes/no | Restore A; 0 session reinitialization reads, 0 writes (AUD-012) |
| V3 family selection changes | P/E1 | 1 | 0 | 1 | 1 | — | 1 | yes/no | P draft retained; new family dependency may read once if needed |
| V4 select product Q | P/E1 hidden | 1 | 0 | 1 | 1 | — | 1 | yes/no | No P write; Q loads separately |
| V5 Q initial load succeeds revision7 | Q/E1 active | 0 | 0 | 7 | 7 | — | — | no/no | Q baseline7; P unchanged from V4 |
| V6 return P | P/E1 active | 1 | 0 | 1 | 1 | — | 1 | yes/no | Restore P/A; no overwrite from Q or P remote reload |
| V7 close workspace / internal area leave | P/E1 hidden | 1 | 0 | 1 | 1 | — | 1 | yes/no | Retain record; no cleanup write |
| V8 reopen P | P/E1 active | 1 | 0 | 1 | 1 | — | 1 | yes/no | Same draft and counter |
| M0 edit/save A | P/E1 | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Exactly 1 write |
| M1 unmount P, open Q | P/E1 hidden | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | 0 additional P writes; Q own load |
| M2 remount P before ACK | P/E1 | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Same I, no replacement load/write |
| M3 edit B | P/E1 | 2 | 0 | 1 | 1 | 1@1 | 2 | yes/yes | Local only |
| M4 ACK1 revision2 | P/E1 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Reconcile P canonical ACK with P post-send delta; Q unchanged even if active |

For cancelled navigation use V0 → Cancel and assert all V0 columns and active experience unchanged, 0 writes. For explicit discard without I, confirmation first creates the exact discardToken. Only a still-matching token may terminate E1 and create E2 at the chosen verified baseline: L=A=0, R=B=1, I=P=—, D/S=no-no. Never label this as ACK of generation1.

## Save-and-leave, discard during in-flight and finite drain

| Event | L | A | R | B | I | P | D/S | Expected network action / observable state |
| L0 edit A then choose Save and switch | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | 1 write; freeze outgoing edits, stay in current experience |
| L1 failure | 1 | 0 | 1 | 1 | — | 1 | yes/no | Stay, unlock edits, show error; 0 automatic retries |
| L2 explicit retry Save and switch | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #2 |
| L3 ACK2 and current token/targets clean | 1 | 1 | 2 | 2 | — | — | no/no | Commit chosen navigation once |
| D0 branch from L0: request discard | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Discard disabled while unresolved; preserve/cancel allowed; no abort-based rollback |
| D1 add later B (ordinary save, no leave lock) | 2 | 0 | 1 | 1 | 1@1 | 2 | yes/yes | Local edit only |
| D2 ACK1 | 2 | 1 | 2 | 2 | — | 2 | yes/no | B remains, A already persisted |
| D3 new explicit discard of remaining B | 0 | 0 | 2 | 2 | — | — | no/no | New epoch adopts ACK baseline A; no write to undo A |
| T0 Library edit A / pass1 send | 1 | 0 | 1 | 1 | 1@1 | — | yes/yes | Write #1 |
| T1 edit B during pass1 | 2 | 0 | 1 | 1 | 1@1 | 2 | yes/yes | Request successor only |
| T2 ACK1 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Never publish synced |
| T3 pass2 send B | 2 | 1 | 2 | 2 | 2@2 | — | yes/yes | Write #2 |
| T4 edit C; automatic timer fires while busy | 3 | 1 | 2 | 2 | 2@2 | 3 | yes/yes | No third pass authorization |
| T5 ACK2 | 3 | 2 | 3 | 3 | — | 3 | yes/no | Drain finishes false/dirty; no recursive drain |
| T6 advance timers / render / observe ACK | 3 | 2 | 3 | 3 | — | 3 | yes/no | 0 writes after budget exhausted |
| T7 new manual Save | 3 | 2 | 3 | 3 | 3@3 | — | yes/yes | New bounded drain write #3 |
| T8 ACK3 revision4 | 3 | 3 | 4 | 4 | — | — | no/no | Clean and true |

Two-owner partial success: initialize P and Q at L1/A0/R1/B1. One drain sends each once. P fails → P remains L1/A0/R1/B1/I—/P1/dirty, Q ACK2 → Q becomes L1/A1/R2/B2/I—/P—/clean. Aggregate dirty/error and false. Later independent success must never clear P's ownership. With K owners captured and no explicit new drain, <=2K write attempts regardless of edits or busy callers.

## Review obligations

- Every successor draft is `replay(canonical ACK, post-send delta)`; untouched normalization and server deletions are never resurrected. Unsafe replay fails closed with zero successor writes.
- Every write uses the base from the lineage its draft actually derives from: own canonical ACK replay, CLEAN atomic refresh, or explicit reconciliation. Dirty remote evidence never becomes a CAS base by observation alone.
- Every discarded epoch has an explicit still-valid generation/base/read/navigation-bound token; a delayed read with stale consent has zero disposal authority.
- Every clean edited epoch has a validated own ACK. P may exist while scheduling is blocked; this preserves draft ownership and Storm Guard together.
- 40001/conflict/reconciliation barriers create zero automatic retry loops.
- A hard browser leave after the native warning can lose memory-only drafts. The matrix proves in-app lifecycle preservation, not crash recovery or deployed SQL behavior.
