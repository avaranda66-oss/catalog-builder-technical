# W1 — Application Actions + Minimal VNext Shell

Status: Ready for Review
Date: 2026-09-10
Base SHA: `ff4ce7302fe79ce9c2f431a09b94dd0e0ddaed7f`
Base tree: `98cca67af685892728b63756a90739b306b6c432`
Branch: `feat/vnext-w1-application-actions-shell`

## Goal

Establish the first production VNext application layer and product shell without reopening the proven W0/W0.1 Foundation. Human UI and future AI share one strict, typed, runtime-validated Application Action mutation boundary. `/v2` must load the VNext shell before any Legacy application/bootstrap authority is imported or initialized, while `/`, `/print`, existing Legacy catalog query behavior, and DEV/E2E proof routes remain Legacy-owned.

## Scope

- Pure `src/vnext/application` action contracts, execution, document factory, identity validation, immutable in-memory session, Undo/Redo, and a tested transaction-coalescing seam.
- Small W1 action set: rename document, add page, duplicate page, delete page, reorder page.
- Isolated production `/v2` bootstrap and a small professional in-memory VNext shell using the production VNext renderer.
- Auth decision B: W1 stays deliberately in-memory and does not import the currently Legacy-coupled auth store.
- Architecture tests protecting application purity, mutation authority, and VNext bootstrap isolation.
- Local/browser evidence, project-state update, exact-head PR/CI evidence.

## Acceptance criteria

- [x] A01 Typed actions compile-time + runtime validated.
- [x] A02 Unknown action/payload fields fail closed.
- [x] A03 No unrestricted ReplaceDocument mutation surface.
- [x] A04 Action failure leaves document/history unchanged.
- [x] A05 Successful action preserves valid `CatalogDocument`.
- [x] A06 Page add works.
- [x] A07 Page duplicate uses valid fresh IDs.
- [x] A08 Page delete protects last-page invariant.
- [x] A09 Page reorder validates inputs.
- [x] A10 Undo restores exact prior snapshot.
- [x] A11 Redo restores exact next snapshot.
- [x] A12 New action after Undo clears redo.
- [x] A13 Injectable deterministic ID generation exists.
- [x] A14 Application layer is React/DOM/browser independent.
- [x] A15 Future AI can use the same action schema contract.
- [x] A16 `/v2` selects VNext before Legacy bootstrap executes.
- [x] A17 `/v2` graph has no Legacy catalog/library/presence/realtime authority.
- [x] A18 `/` remains Legacy.
- [x] A19 `/print` remains functional.
- [x] A20 Legacy `?catalog=...` remains Legacy.
- [x] A21 `/v2` does not auto-load Legacy catalog IDs.
- [x] A22 Direct `/v2` navigation works.
- [x] A23 Refresh `/v2` works.
- [x] A24 Visible Add Page uses Application Action.
- [x] A25 Visible Undo/Redo use runtime history.
- [x] A26 No fake Save/persistence promise.
- [x] A27 No W2/W4/W5/W6 scope creep.
- [x] A28 Architecture boundary tests protect the new seams.
- [x] A29 Global gates pass.
- [ ] A30 Exact-head GitHub CI passes.

## Tasks

- [x] Implement strict Application Action contracts, execution, canonical ID handling, and factory.
- [x] Implement immutable in-memory document session with Undo/Redo and transaction coalescing.
- [x] Split bootstrap so `/v2` lazy-loads VNext and all other routes lazy-load Legacy.
- [x] Build minimal `/v2` shell with canonical Add Page and runtime Undo/Redo.
- [x] Extend VNext architecture tests and add action/session tests.
- [x] Run focused and global quality gates plus adversarial import/mutation audit.
- [x] Capture local browser evidence and direct-route/Legacy regression behavior.
- [x] Update durable project state and this evidence record.
- [ ] Commit, push, open PR, and record exact-head GitHub Quality Gate results. Do not merge.

## Dev Agent Record

### Agent Model Used

GPT-5.6 Sol (High)

### Debug Log References

- Base verified from `origin/main` before worktree creation: SHA `ff4ce7302fe79ce9c2f431a09b94dd0e0ddaed7f`, tree `98cca67af685892728b63756a90739b306b6c432`.
- Focused W1 tests: 18/18 passed.
- Full VNext tests: 85/85 passed.
- Global gates: `npm run lint` passed with 0 errors and 268 existing warnings; `npm run typecheck` passed; `npm test` passed with 2,131 passed and 1 skipped across 204 files; `npm run build` passed.
- Production Chromium proof: `/v2` loaded with no Legacy chunks, Add Page/Undo/Redo worked through the Application runtime, refresh reset the in-memory draft, and `?catalog=...` under `/v2` remained VNext. `/`, root `?catalog=...`, and `/print` remained Legacy with no console/page errors.
- Production build separated the VNext bootstrap (~33 kB JS) from `legacy-main` (~2.39 MB JS), corroborating runtime isolation.
- CodeRabbit CLI gate unavailable in this environment: `/home/gabriel/.local/bin/coderabbit` is not installed. This is recorded as unavailable, not passed.
- PR #16 opened against `main`: `https://github.com/avaranda66-oss/catalog-builder-technical/pull/16`. Initial implementation head before the final documentation commit was `6ff981c5a5f3ca16ec325e054e017fb2c18f6f6c`.
- Exact final PR head and GitHub Quality Gate conclusion are intentionally sourced from PR #16/final execution evidence after the last commit, avoiding a self-referential story-SHA loop.

### Completion Notes List

- Added strict Zod-discriminated Application Actions for document rename and page add/duplicate/delete/reorder, with fail-closed payload validation and canonical document validation after mutations.
- Added injectable ID generation, deep identity regeneration for duplicated pages, immutable/frozen snapshots, Undo/Redo, redo-branch clearing, and transaction coalescing.
- Moved Legacy bootstrap to `src/legacy-main.tsx`; `src/main.tsx` selects `/v2` before dynamically importing either VNext or Legacy.
- Added an isolated in-memory `/v2` shell rendering the canonical A4 VNext document. Its visible Add Page and Undo/Redo controls use the Application runtime, and the UI explicitly states that saving is limited to the current tab.
- Added application/session coverage and architecture proofs for application purity, mutation authority, bootstrap ordering, and VNext graph isolation.
- Local implementation, automated gates, browser regression proof, and adversarial import/mutation audit are complete. Exact-head GitHub CI remains pending until the PR is opened and checks settle.

### File List

- `docs/stories/2026-09-10-vnext-w1-application-actions-shell.md`
- `docs/vnext/PROJECT-STATE.md`
- `src/legacy-main.tsx`
- `src/main.tsx`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/document.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `src/vnext/application/session.ts`
- `tests/vnext/application/application-actions.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`

### Change Log

- 2026-09-10: Story created from the authorized W1 execution contract before production code changes.
- 2026-09-10: Implemented W1 Application Actions, in-memory history, isolated `/v2` shell/bootstrap, architecture proofs, and completed local/browser quality gates.
