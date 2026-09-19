# W3.I — Father Browser Flow / W3 Closeout

Status: **Ready for Remote Quality Gate**

Date: 2026-09-19

Canonical implementation base: `ac2b45bd5fe6971c0f1885b88884102d01114b98`

Canonical base tree: `18dc40ce8856483d011a7f0d266f02c4a39ff347`

Required branch: `feat/vnext-w3i-father-browser-closeout`

Promotion vehicle: one PR to `main`; **do not merge**. The USER is the sole authority for explicit merge authorization.

---

## Father goal

Como o Pai (usuário não técnico), quero concluir em um único fluxo de navegador as tarefas de criar, editar, salvar automaticamente, usar imagens duráveis, reabrir, duplicar, recuperar trabalho local, resolver conflitos, renomear e arquivar catálogos, para que eu tenha confiança de que as capacidades canônicas de W3 funcionam juntas sem expor conceitos técnicos de persistência.

## Canonical predecessor provenance

- W3.H — Autosave + Adversarial Concurrency is canonical through merged PR #37.
- Live GitHub `main` was verified before branch creation at `ac2b45bd5fe6971c0f1885b88884102d01114b98`, tree `18dc40ce8856483d011a7f0d266f02c4a39ff347`.
- PR #37 was verified `MERGED` at that exact commit.
- Post-merge Quality Gates run `35453791083` was verified `COMPLETED / SUCCESS` on that exact commit.
- The W3.I branch was created only from that exact canonical base.

## Frozen authorities

- `CatalogDocument` remains the sole canonical authored-document model.
- `SupabaseCatalogRepository` remains the production remote adapter.
- `SaveCoordinator` remains the sole normal Save/strict-CAS authority.
- `AutosaveCoordinator` only schedules or flushes the same `SaveCoordinator`.
- `CanonicalReopenCoordinator` remains the reopen authority.
- `PreparedCatalogCreateCoordinator` remains the Create/reconciliation authority.
- `ConflictResolutionCoordinator` remains the conflict-resolution single-flight authority.
- `CatalogCloneService` remains the complete authored-identity clone authority.
- W3.D Recovery remains local protection and never remote Saved authority.
- `AssetPersistenceBridge` keeps bytes and runtime URLs outside `CatalogDocument`.
- Strict CAS, mutation identity, revision, stale-result, archive, auth, catalog, open-session, and authority-scope behavior must not be weakened.
- No additional repository, coordinator, save path, clone path, recovery model, or document model may be introduced.

## Acceptance checklist

### W3I-01 — Library entry and creation

- [x] Father reaches the VNext Catalog Library.
- [x] Father creates a Blank catalog or selects a registered Starter through visible UI.
- [x] The created catalog opens in a fresh clean session.
- [x] No developer persistence terminology is exposed.

### W3I-02 — Authoring and autosave

- [x] Father performs a real visible edit.
- [x] An active text draft remains mounted beyond debounce and dispatches no remote Save.
- [x] Father explicitly completes the draft.
- [x] UI reaches `Salvando…` and then `Salvo` without Manual Save.
- [x] Undo history remains authored history.

### W3I-03 — Durable asset workflow

- [x] Father selects or replaces an image through existing UI.
- [x] `CatalogDocument` receives only a canonical immutable `AssetRef`.
- [x] No blob URL, signed URL, base64, or binary enters the canonical document.
- [x] The catalog reaches Saved.
- [x] Exact reopen resolves the asset through the canonical asset path.
- [x] Integrity or degraded behavior remains truthful if mismatch is exercised.

### W3I-04 — Exact reopen

- [x] Father leaves the editing session through an allowed flow and reopens from Library or a production-compatible route.
- [x] Saved text, structure, and `AssetRef` are preserved.
- [x] Reopened session has a new `openSessionId` and empty Undo/Redo.
- [x] Saved is shown only from acknowledged remote authority.

### W3I-05 — Duplicate / Starter independence

- [x] Father duplicates a nontrivial catalog through visible UI.
- [x] Copy receives a new catalog/document/page/object authored identity closure.
- [x] Immutable `AssetRef`s may remain shared.
- [x] Editing and saving the copy does not mutate the source.
- [x] Reopening source and copy proves independent persistence lineages.
- [x] Ambiguous Create creates no ghost copy or second mutation identity.

### W3I-06 — Local crash recovery

- [x] Visible unsaved Father work is created, including an active draft where practical.
- [x] A tab/browser interruption is simulated only through the real recovery seam.
- [x] Re-entry under the same authority scope shows a Father-language recovery choice.
- [x] Recovery installs a fresh session without claiming the work was already Saved.
- [x] Restored draft is confirmed or cancelled through normal UI and persists only through explicit authoring/autosave.
- [x] Account, catalog, and open-session isolation are proved.
- [x] Divergent cloud and local content are not silently merged.

### W3I-07 — Adversarial conflict / Open latest

- [x] Two independent browser sessions open at the same remote revision.
- [x] One session advances authority and the stale session receives a controlled strict-CAS conflict on autosave.
- [x] Stale local authored work remains protected.
- [x] UI exposes exactly the Father conflict choices.
- [x] `Abrir versão mais recente` protects local recovery first and installs a fresh authoritative session.

### W3I-08 — Adversarial conflict / Save as copy

- [x] A second controlled conflict is produced.
- [x] Father chooses `Salvar meu trabalho como cópia`.
- [x] Both choices are disabled while resolution is in flight.
- [x] No competing Open-latest operation or second Create appears.
- [x] Copy opens as a fresh Saved session.
- [x] Source authority remains unchanged.
- [x] Copy identities are fresh and immutable `AssetRef`s follow the canonical sharing rule.

### W3I-09 — Rename and Archive closeout

- [x] Father renames through Catalog Library and exact persisted title is confirmed after reopen.
- [x] Father archives through visible UI.
- [x] Catalog leaves active Library and appears only in archived view where supported.
- [x] Stale autosave cannot recreate, unarchive, rename, or overwrite the archived catalog.
- [x] No hard Delete, restore, or unarchive feature is added.

### W3I-10 — Father language and runtime integrity

- [x] Browser console errors array is empty.
- [x] Page errors array is empty.
- [x] CAS/revision/mutation/IndexedDB/storage/repository/database jargon is absent from Father UI.
- [x] No false Saved state appears.
- [x] UI re-entry causes no duplicate remote Save/Create.
- [x] Disposal leaves no unresolved timer/listener.
- [x] Existing W2/W3 proof matrix remains green.

## Controlled-vs-production evidence distinction

### Layer 1 — Production bootstrap smoke

- Load the real `/v2` route.
- Prove VNext bootstrap is selected and Legacy bootstrap is not selected.
- Prove production wiring reaches the canonical W3 runtime seams.
- This layer does not claim a complete real-Supabase Father journey.

### Layer 2 — Controlled Father-flow proof

- Use real React and visible Father UI interactions in Chromium.
- Use deterministic shared strict-CAS, recovery, and asset dependencies only where adversarial timing or outcomes require control.
- Direct fixture APIs may control only external timing/failure state or interruption; Father actions remain visible UI actions.
- Describe this layer as controlled browser integration, not real production Supabase end-to-end.
- Existing W3.B real-database rehearsal remains separate evidence.

## Deterministic evidence requirements

The integrated proof must assert and log enough state to audit the production bootstrap; catalog IDs and `openSessionId`s; remote revisions; Save/Create dispatch counts; active-draft canonical versus visible text; recovery choice/outcome; source and duplicate identities; source state before/after copy; canonical `AssetRef` without runtime URL leakage; archive state; conflict-resolution state; and `consoleErrors` / `pageErrors` arrays. Fixed waits may prove bounded non-events only and must not be the sole state-transition oracle.

## Implementation task checklist

- [x] Verify live GitHub `main` SHA/tree, PR #37 merge state, and post-merge Quality Gate run before branch creation.
- [x] Create the required branch from the exact canonical base.
- [x] Create this W3.I story before implementation.
- [x] Inventory and reuse existing W3.C–W3.H production components, fixtures, and proof helpers.
- [x] Implement the smallest integrated W3.I Chromium proof and minimum dedicated fixture/harness.
- [x] Keep product code unchanged unless the proof exposes a deterministic concrete W3 defect.
- [x] Add W3.I to required Quality Gates only after the proof is stable.
- [x] Smoke 320, 360, and 390 px action reachability and horizontal overflow.
- [x] Run focused W3.I proof/tests once stable.
- [x] Run one final complete local validation ladder and canonical regression proof matrix.
- [x] Update validation results, acceptance checklist, and complete File List.
- [ ] Commit and push a small coherent candidate; create exactly one PR; do not merge.
- [ ] Wait for exact-head GitHub Quality Gate `COMPLETED / SUCCESS`.

## Validation results

Focused candidate validation before the final full ladder:

- Integrated controlled Father Chromium flow: **PASS**.
- Real production `/v2` bootstrap smoke: **PASS**.
- Recovery, conflict, and Library actions at 320, 360, and 390 px with no page-level horizontal overflow: **PASS**.
- Browser console errors: `[]`; page errors: `[]`.
- `npm run typecheck`: **PASS**.
- Focused fixture ESLint and proof syntax check: **PASS**.
- `git diff --check`: **PASS**.

Final local ladder:

- Focused W3.I integrated Chromium proof: **PASS** (1 proof; W3I-01..10 and three mobile widths).
- `npm run lint`: **PASS**, 0 errors and the unchanged 268-warning repository baseline.
- `npm run typecheck`: **PASS**.
- `npm test`: **PASS**, 241 test files; 2,594 passed and 1 skipped (2,595 total).
- `npm run build`: **PASS**; only existing Vite dynamic-import/chunk-size advisories were emitted.
- `git diff --check`: **PASS**.
- W3.I integrated Chromium proof and production `/v2` bootstrap smoke: **PASS**.
- W3.H and W3.G Chromium proofs: **PASS**.
- W3.F, both W3.D physical/IndexedDB, and W3.C Chromium proofs: **PASS**.
- Canonical W2 Chromium/native-PDF matrix (7 proofs): **PASS**.
- Complete browser/PDF regression ladder: **PASS**, 14 proof scripts.
- Exact-head GitHub Quality Gate: pending branch publication and PR creation; the final executor report will identify the exact run.

## File List

- `.github/workflows/quality-gates.yml`
- `docs/stories/2026-09-19-vnext-w3i-father-browser-flow-closeout.md`
- `src/vnext/app/styles.css`
- `tests/vnext/proof/fixtures/w3i-father-browser.html`
- `tests/vnext/proof/fixtures/w3i-father-browser.tsx`
- `tests/vnext/proof/w3i-father-browser-flow-proof.mjs`

## Story draft checklist result

| Category | Status | Evidence |
| --- | --- | --- |
| Goal and context clarity | PASS | Father goal, canonical predecessor, frozen authorities, and W3 closeout scope are explicit. |
| Technical guidance | PASS | Two-layer proof truth, deterministic evidence, canonical seams, and product-change policy are constrained. |
| Self-containment | PASS | W3I-01..10, mobile sanity, full gate ladder, and exact-head delivery are reproduced in this story. |
| Testing guidance | PASS | Focused proof, final regression matrix, browser error capture, bounded waits, and mobile widths are measurable. |
| Scope control | PASS | W4, redesign, architecture replacement, realtime/presence/CRDT, hard delete, restore/unarchive, and dependency modernization are excluded. |

Final assessment: **READY FOR REMOTE QUALITY GATE**. The controlled W3.I Father journey, production bootstrap smoke, full local test/build ladder, and required W2/W3 proof matrix are green. Publication and exact-head CI remain delivery-only steps.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-19 | 0.1.0 | W3.I closeout story created from the Principal execution contract after exact live provenance verification; implementation started. | @sm / @dev |
| 2026-09-19 | 0.2.0 | Integrated Father proof completed; deterministic Starter asset fixture added; narrow mobile Recovery/conflict containment defects corrected and proved at 320/360/390 px. | @dev / @qa |
| 2026-09-19 | 0.3.0 | Final local ladder completed: 241 test files, 2,594 passing tests, 14 proof scripts, zero lint errors, typecheck/build/diff-check green; ready for exact-head remote gate. | @dev / @qa |

## Dev Agent Record

### Agent model used

GPT-5 Codex

### Debug Log References

- Live provenance: GitHub `main` SHA/tree, PR #37, and run `35453791083` verified before branch creation.

### Completion Notes List

- The integrated proof exercises Father actions through real React UI and uses deterministic adapters only for external repository timing, recovery storage, and durable asset control.
- A deterministic Starter variant supplies the canonical immutable `AssetRef` needed by the existing image UI; this corrected fixture data and did not change product architecture.
- Chromium exposed a real 320 px Recovery overflow (`scrollWidth` approximately 860 px). Narrow CSS containment corrected intrinsic preview/panel sizing.
- The next mobile checkpoint exposed the existing shell `min-width: 860px` and hidden inspector at conflict state. A narrow mobile stacking rule contains the shell and makes conflict actions reachable without changing persistence semantics.
- The complete controlled flow, `/v2` production bootstrap smoke, and final local regression ladder pass; only the exact-head remote gate remains pending.
- Final local regression is complete: all 14 requested Chromium/native-PDF scripts passed, including W3.I/H/G/F/D/C and the canonical W2 matrix.
- Full Vitest completed with 241 files, 2,594 passed, and 1 skipped; lint completed with zero errors and 268 unchanged baseline warnings.
- Vite build advisories (dynamic/static import overlap and large chunks) are pre-existing, non-causal, and no dependency or bundling architecture was changed in W3.I.
- Exact-head GitHub CI, Vercel/Netlify status inspection, and the final main-drift check are intentionally performed after this story snapshot is committed and published.

## Explicit scope guard

- No W4 or later wave work.
- No translation or AI implementation.
- No new authoring feature or UI redesign.
- No Realtime, Presence, CRDT, BroadcastChannel authority, distributed locking, or automatic merge.
- No new persistence, Save, Create, clone, recovery, repository, coordinator, or document authority.
- No hard Delete, restore, or unarchive.
- No dependency modernization or deployment/provider migration.
- No merge without explicit user authorization.

**W4 HAS NOT STARTED.**
