# Story — Wave 0B G1 save/draft/ACK concurrency remediation

Status: Implemented; ready for Wave 0B integration review.

Mission: `COMPANY.READINESS.WAVE0B.G1.IMPLEMENT1`.

Base: `2720b7cd30f3ac0b461165444f3e930ec38c09d5`.

Branch: `remediation/wave0b-g1-save-draft`.

Normative design:

- `docs/release-readiness/G1_SAVE_DRAFT_ACK_CONTRACT.md`
- `docs/release-readiness/G1_INTERLEAVING_MATRIX.md`

Scope: implement RR-001 + RR-002 + RR-003 as one SAVE lifecycle unit. Preserve unsaved ownership across failures and lifecycle changes, reconcile validated canonical ACKs with post-send edits/deletes, preserve the correct CAS lineage under refresh/concurrency, and enforce bounded successor/retry behavior. Do not redesign the approved contract.

Acceptance criteria:

- Failed saves retain the latest local draft and ownership; only an explicit retry may send again, using the latest cumulative draft and unchanged valid base.
- Older ACKs never erase edits or deletions accepted after dispatch.
- Successful canonical ACK handling computes the continuing draft as `replay(ACK_CANONICAL_SNAPSHOT, POST_SEND_DELTA)`; untouched fields inherit canonical server normalization/deletion and unsafe structural replay fails closed.
- Revision-only ACKs never fabricate canonical content from the sent snapshot. At most one explicit same-owner/same-epoch/exact-revision verification read may supply the canonical snapshot.
- CLEAN refresh atomically adopts canonical document and base revision. DIRTY/SAVING/FAILED/CONFLICT/reconciliation refresh is evidence only and never rewrites local lineage.
- Discard uses an exact one-shot token bound to owner/session, generation, base/read epoch and navigation identity; edit/Save/owner switch/superseding navigation invalidates it before a delayed read can dispose newer state.
- Library drains are finite and single-owner mutations are serialized. Duplicate explicit Save calls join the same logical drain. A successful first pass may have at most the approved bounded successor pass.
- Workbook Save remains manual-successor. Duplicate Save calls join one request; a generation acknowledged while a later generation exists does not report the whole draft clean.
- Successor CAS uses the canonical ACK/clean-refresh base from which the continuing draft derives. Newer remote evidence blocks the successor.
- True CAS conflict (including SQLSTATE 40001/equivalent evidence) preserves local work, latches conflict, and performs zero automatic retries.
- Dirty owner records survive Classic ↔ Mega, product P → Q → P, close/reopen and unmount/remount; late ACK/read completions only affect their captured owner/epoch.
- Existing Storm Guard bounds remain finite; no conflict retry loop, failed-save timer retry, recursive drain or ACK-triggered unbounded continuation is introduced.
- No live DB/Supabase mutation, deployment, main update, V2 factual-presentation changes, SemanticEditor changes or RR016 lint-tooling changes.

Regression checklist:

- [x] AUD-001 failed save retains queue/draft; explicit retry sends latest only.
- [x] AUD-002 edit during in-flight save; old ACK preserves later edit and successor CAS.
- [x] AUD-005 Workbook edit during ACK.
- [x] AUD-012 dirty Classic ↔ Mega preservation.
- [x] A normalized ACK + post-send edit.
- [x] B refresh while save active.
- [x] C late ACK after owner switch.
- [x] D discard + edit + delayed read.
- [x] E discard + Save + delayed read.
- [x] F clean refresh adoption.
- [x] G dirty refresh evidence-only.
- [x] H failure + edit + retry.
- [x] I successor + third-party 40001.
- [x] J server-side deletion.
- [x] K post-send user deletion.
- [x] L incompatible structural normalization fails closed.
- [x] M double Save joins one request/drain.
- [x] N unmount + late ACK.
- [x] O StrictMode lifecycle bound.
- [x] Revision-only ACK canonical verification read, including the single-use read budget.
- [x] Network-sensitive regressions assert read/write counts, expected CAS base, final local draft/revision and barrier state.

Validation checklist:

- [x] Targeted G1 tests pass: 61/61 across 5 files.
- [x] `npm run typecheck` passes.
- [x] `npm test` passes: 158 files / 1,683 tests.
- [x] `npm run build` passes; existing Vite/pdfjs/chunk warnings only.
- [x] `git diff --check` passes.
- [x] Final diff stays inside G1 ownership plus this story.

File list (final):

- `src/stores/useLibraryStore.ts`
- `src/stores/useWorkbookDraftStore.ts` (new)
- `src/components/library/product-workspace/ProductKnowledgeWorkspace.tsx`
- `src/components/library/mega-workspace/ProductWorkspaceExperienceGate.tsx`
- `src/stores/useUIStore.ts`
- `tests/stores/library-save-queue.test.ts` (new)
- `tests/stores/library-consistency-phase2b.test.ts`
- `tests/integration/workbook-draft-lifecycle.test.tsx` (new)
- `docs/stories/2026-09-05-wave0b-g1-save-draft.md`

Dev Agent Record:

- Implementation owner: STRONG SAVE lifecycle / concurrency remediation.
- Completion notes: implemented owner-scoped Library/Workbook draft authority, canonical ACK replay with post-send delta/delete semantics, finite Library drains, manual Workbook successors, explicit conflict/failure/reconciliation barriers, one-shot discard authorization, navigation/session preservation, stale refresh protection, single-use revision-only canonical verification, and explicit clean remote-deletion baselines.
- Validation evidence: targeted G1 suite 61/61; full suite 158 files / 1,683 tests; typecheck PASS; build PASS; `git diff --check` PASS. No migration, live DB, deploy, main, Library V2 RR004C, SemanticEditor, ESLint or CI changes.
