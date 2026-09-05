# G1 — Deterministic interleaving matrix

Normative companion to [G1_SAVE_DRAFT_ACK_CONTRACT.md](G1_SAVE_DRAFT_ACK_CONTRACT.md), base `e3e581870fe345d6e13198e413c601b842477403`. Design only; these are expected future transitions, not executed fixes.

Each independent sequence starts with a verified owner at remote/base revision 1, epoch E1, L=A=0. `R` is last observed remote revision, not omniscience; `B` is baseRevision. `I=g@r` means generation g sent with expected revision r. `P` is retained pending content, including content blocked from scheduling. `D/S` are dirty/saving. `—` means empty. Values A/B/C in Event denote edit contents; column A denotes acknowledgedGeneration. ACK and successor dispatch are separate atomic steps so the intermediate state is testable. Library may execute successor in its second pass; Workbook requires next manual Save.

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
| AB4 ACK A revision2 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Keep A+B; no full-draft success; Workbook draft.revision2 |
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
| C6 user chooses discard-and-reload; read deferred | 3 | 1 | 3 | 2 | — | 3 | yes/no | One read, retain old draft until success |
| C7 successful read3, explicit disposal applied | 0 | 0 | 3 | 3 | — | — | no/no | E2; E1 discarded, no save success claim; 0 writes |
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
| M4 ACK1 revision2 | P/E1 | 2 | 1 | 2 | 2 | — | 2 | yes/no | Keep B; Q unchanged, even if active |

For cancelled navigation use V0 → Cancel and assert all V0 columns and active experience unchanged, 0 writes. For explicit discard without I, user confirmation terminates E1 and creates E2 at chosen baseline: L=A=0, R=B=1, I=P=—, D/S=no-no. Never label this as ACK of generation1.

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

- Every write uses the captured owner's base, never another owner's ACK or a remote observation alone.
- Every discarded epoch has an explicit decision; every clean edited epoch has a validated ACK.
- P may exist while scheduling is blocked; this is required to preserve draft and Storm Guard together.
- A hard browser leave after the native warning can lose memory-only drafts. The matrix proves in-app lifecycle preservation, not crash recovery or deployed SQL behavior.
