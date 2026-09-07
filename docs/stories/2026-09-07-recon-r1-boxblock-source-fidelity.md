# RECON.R1.1 — BoxBlock Authoritative Source Fidelity

Status: InReview

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- remote_operations: `@github-devops`
- quality_gate_tools: deterministic Vitest regressions, full repository gates, CodeRabbit when available, exact-SHA GitHub Actions verification

## Story

**As a** catalog editor,
**I want** `ContentBlock.textContent` to remain the authoritative raw source throughout BoxBlock display and editing,
**so that** supported lightweight markup, whitespace, newlines, empty content, and inert literal HTML cannot be silently corrupted by presentation DOM.

## Base, Branch, and Historical Evidence

- Immutable canonical base: `origin/main` at `958f2f0fa0154bc808eb156b8c376550c2824a82`.
- Target branch: `remediation/recon-r1-boxblock-source-fidelity`.
- Read-only historical evidence branch: `origin/remediation/r1-new-001-boxblock-fidelity`, final SHA `a1a411fa60036dd1a386edf51761ef389850fc64`.
- Relevant historical commits: implementation `b707435016358b9c22a69ea3892ac03c8d8ee2ce`, fidelity tests `d9ffc26a4157b49f560d3de612cfc9a9c37fd48c`, story/evidence `f1fffe38af31771f766f7d81a98d703331bd6dde`, final validation `a1a411fa60036dd1a386edf51761ef389850fc64`.
- Historical commits are design/test evidence only; do not merge or cherry-pick them.
- Do not merge, rebase, force-push, delete branches, or commit/push directly to `main`.

## Acceptance Criteria

1. R1-T1: `**forte**` survives a no-op edit boundary exactly and `updateBlock` is not called.
2. R1-T2: `*ênfase*` survives a no-op edit boundary exactly and `updateBlock` is not called.
3. R1-T3: empty source may display placeholder copy, but the editor value remains empty and placeholder text is never persisted.
4. R1-T4: leading and trailing whitespace, including `"  texto técnico  "`, is preserved exactly; no trim is applied.
5. R1-T5: multiline source, including a trailing newline, is preserved exactly.
6. R1-T6: literal HTML-like source remains inert text before, during, and after editing; no element or event-capable DOM is created.
7. R1-T7: an intentional edit from `**forte**` to `**fortíssimo**` persists the exact new raw source.
8. R1-T8: intentional removal of lightweight markup from `**forte**` to `forte` persists plain source exactly.
9. R1-T9: display mode continues to render supported bold and italic source as safe `<strong>` and `<em>` React nodes.
10. R1-T10: `CleanA4Document`/print rendering preserves safe formatting, exposes no editing textarea/UI, and keeps literal HTML inert.
11. If editing starts from source A and an external rerender supplies source B before the local draft changes, leaving edit mode does not manufacture a stale write of A.
12. The complete existing `tests/components/box-block-xss-security.test.tsx` matrix remains green, including editor, A4Canvas, CleanA4Document, persistence/reload, and backup/import paths.
13. Production changes remain limited to `BoxBlock.tsx`; tests may extend the existing security/fidelity suite or add one focused fidelity suite. No dependency or package manifest changes are allowed.
14. Factual RED evidence is captured against unchanged canonical production code before remediation; no failing result is fabricated.
15. Focused tests, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and an actual merge-marker audit pass on final HEAD.
16. Final current-main behavior is compared with historical commits `b707435...` and `d9ffc26...`; useful historical invariants are preserved or any omission is explicitly explained.
17. The final branch commit is pushed only by `@github-devops`, and GitHub Quality Gates complete successfully on the exact final branch SHA while `origin/main` remains unchanged.

## Tasks / Subtasks

- [x] Establish immutable preconditions and inspect current/historical behavior (AC: 14, 16, 17).
  - [x] Prove clean worktree, exact canonical base, target branch lineage, historical refs, and no merge/cherry-pick.
  - [x] Inspect current BoxBlock, shared editor/export call paths, and historical implementation/tests read-only.
- [x] Add and run deterministic RED fidelity regressions before production edits (AC: 1–6, 11, 14).
  - [x] Cover bold, italic, empty placeholder, edge whitespace, multiline/trailing newline, and inert HTML.
  - [x] Cover external rerender from A to B with no local draft change.
  - [x] Record exact factual RED failures on canonical production behavior.
- [x] Implement the minimal source-authority boundary (AC: 1–11, 13).
  - [x] Keep display rendering safe through existing `renderInlineMarkup()` and presentation-only placeholder copy.
  - [x] Use a controlled source-preserving editor initialized from exact `block.textContent ?? ''`.
  - [x] Persist exact draft only after an intentional local change; never derive persisted source from rendered DOM.
  - [x] Preserve current selection, styles, ContentBlock/store authority, and export semantics.
- [x] Complete focused security, editor, and print verification (AC: 1–12, 16).
  - [x] Prove R1-T1–T10, stale-write safety, the complete XSS suite, relevant A4Canvas, and CleanA4Document paths.
  - [x] Produce a historical parity matrix against `b707435...` and `d9ffc26...`.
- [x] Complete repository gates and DevOps handoff (AC: 13, 15, 17).
  - [x] Run lint, typecheck, full tests, build, diff-check, merge-marker audit, and CodeRabbit when available.
  - [x] Update this story's allowed Dev Agent Record sections, commit normally, then delegate push and exact-SHA CI verification to `@github-devops`.

## Dev Notes

- TypeScript is strict, the editor uses React plus Zustand/Immer, and Node/npm scripts are the required quality interface. [Source: `docs/framework/coding-standards.md`; `docs/framework/tech-stack.md`]
- Tests should assert domain/integration behavior before visual details, and every change must retain a story checklist, file list, and validation record. [Source: `docs/framework/coding-standards.md`]
- New modules should use absolute `@/` imports; same-module edits may preserve the established local style where no new module is introduced. [Source: `.aiox-core/constitution.md#vi-absolute-imports-should`; `docs/framework/coding-standards.md`]
- The current runtime manifest is Vite/React rather than Next.js, despite the framework overview mentioning Next.js. No Next-specific API or convention is required for this focused existing component path. [Source: `package.json`; `docs/framework/tech-stack.md`]
- The source-tree overview is planned and does not exactly match the existing `src/components/editor/blocks` layout; preserve the current repository structure for this narrow remediation. [Source: `docs/framework/source-tree.md`; current repository tree]
- `useCatalogStore.updateBlock` remains the persistence authority. No new persistence, collaboration, CAS, realtime, repository, or document-model authority is introduced. [Source: user-authorized RECON.R1.1 requirements; current `BoxBlock.tsx` contract]
- The existing renderer already creates formatting with React text nodes plus `<strong>`/`<em>` and is shared by A4Canvas and CleanA4Document. Keep that safe render boundary intact. [Source: current `src/components/editor/blocks/BoxBlock.tsx`; current `src/components/editor/A4Canvas.tsx`; current `src/components/export/CleanA4Document.tsx`]
- Historical code is evidence, not a patch source. Evaluate it against current architecture and improve lifecycle safety where the no-local-change rerender case requires it. [Source: user-authorized RECON.R1.1 requirements; historical commits listed above]

## Testing

- Use deterministic Vitest/jsdom component tests with React act/Testing Library helpers already used by the suite.
- Capture RED before production edits, then rerun the same cases GREEN.
- Assert exact editor values and `updateBlock` payloads; do not normalize whitespace or newlines in fidelity assertions.
- Use inert structural XSS assertions only; never execute event handlers, scripts, network requests, credential reads, live database writes, or migrations.
- Run the complete BoxBlock XSS suite plus relevant A4Canvas, CleanA4Document, and persistence/save regressions if fixture interaction requires them.

## Scope Guard

Expected production file:

- `src/components/editor/blocks/BoxBlock.tsx`

Expected supporting files:

- `tests/components/box-block-xss-security.test.tsx` or one dedicated BoxBlock fidelity test
- `docs/stories/2026-09-07-recon-r1-boxblock-source-fidelity.md`

Forbidden scope:

- `App.tsx`, `activeEditingContext`, `LibraryView`, realtime, Product Workbook, Table Core, specialized tables, save queues, CAS, repositories, SQL, migrations, dependencies, package manifests, lockfiles, deployment, presence, and Undo/Redo
- generic rich-text editor, new document model, new persistence authority, merge/rebase/push of `main`, force push, or historical branch deletion

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled in `.aiox-core/core-config.yaml`; the local developer policy still requires an attempted pre-commit CLI review when the CLI is available.

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex via Codex desktop, high-reasoning execution.

### Debug Log References

- Preconditions: clean detached worktree at `958f2f0fa0154bc808eb156b8c376550c2824a82`; after fetch, `origin/main` matched exactly and historical final ref resolved to `a1a411fa60036dd1a386edf51761ef389850fc64`; branch created directly from canonical base.
- Historical inspection was read-only through `git diff`/`git show`; no merge or cherry-pick was used.
- First attempted RED command could not start because the new worktree lacked `node_modules`; `npm ci` installed only the existing lockfile graph and did not change package manifests. This startup failure is not counted as product RED evidence.
- Factual RED after a browser-faithful jsdom `innerText` shim: 1 file, 11 tests, 7 failed and 4 passed. R1-T1 called `updateBlock` once with `textContent: "forte"` from source `**forte**`; current code had no controlled raw-source editor for T2–T6 or stale-rerender safety.
- GREEN fidelity + XSS run: 2 files, 18/18 tests before the final T4/T5 strengthening.
- Final focused run: 5 files, 54/54 tests (`box-block-source-fidelity-r1`, complete `box-block-xss-security`, `canvas-integrated-acceptance`, `pdf-export-cleanliness`, and `export-snapshot-version-consistency-rr009`).
- Full suite: 181 files passed; 1,879 tests passed, 1 skipped, 0 failed (1,880 total).
- Lint: exit 0, 0 errors and 267 pre-existing warnings; changed-file lint: exit 0 with no output.
- Typecheck: exit 0. Build: exit 0 (`vite build` completed in 24.03 s with the existing large-chunk warning).
- `git diff --check`: exit 0. Strict merge-marker audit: 0 matches.
- CodeRabbit check attempted through WSL; CLI absent (`CODERABBIT_NOT_INSTALLED`). WSL also reported two host PATH translation warnings. No CodeRabbit pass is claimed.
- `npm ci` audit reported 6 vulnerabilities in the pre-existing locked dependency graph (3 moderate, 1 high, 2 critical); no dependency or lockfile changed and remediation is outside this story's authorized scope.

### Completion Notes List

- Replaced the mixed formatted-`contentEditable` authority boundary with explicit safe display and controlled textarea edit modes.
- Display continues to use ordinary React text nodes plus the existing supported `<strong>`/`<em>` rendering. Placeholder copy is presentation-only.
- Editing initializes from exact `block.textContent ?? ''`; blur persists exact draft only when it differs from the source captured at edit start. There is no `.trim()` and no DOM-to-source reverse parsing.
- A no-local-change external rerender from source A to B produces no update and displays B after leaving edit mode, preventing BoxBlock from manufacturing stale A.
- Literal HTML remains inert before, during, and after editing; all seven prior XSS regressions remain green across direct render, A4Canvas, CleanA4Document, persistence/reload, and backup/import.
- R1 matrix: T1 GREEN; T2 GREEN; T3 GREEN; T4 GREEN for no-op and intentional edge-whitespace commit; T5 GREEN for no-op and intentional trailing-newline commit; T6 GREEN; T7 GREEN; T8 GREEN; T9 GREEN; T10 GREEN.
- Historical parity: safe display nodes — equivalent; controlled raw textarea — equivalent; no-op update suppression — equivalent; exact intentional source commit — equivalent; placeholder separation — equivalent; print formatting/inert HTML — equivalent; edge whitespace — improved with explicit no-op and commit tests; multiline/trailing newline — improved with explicit no-op and commit tests; external rerender/no-local-change — improved with explicit lifecycle regression; useful historical invariants dropped — none.
- ContentBlock, `useCatalogStore.updateBlock`, selection, styling, CleanA4Document reuse, save/CAS/realtime architecture, package manifests, and all forbidden-scope systems were preserved.

### DoD Self-Assessment

- [x] Requirements and acceptance criteria are implemented and covered by deterministic tests.
- [x] Code follows the existing React/TypeScript/Zustand structure, introduces no API/data-model/dependency/configuration change, and adds no lint error or warning.
- [x] Required unit/integration/security/print tests and the complete full suite pass; no project coverage threshold is defined.
- [x] Edge cases are covered. Manual UI verification is N/A for this source-authority contract because editor, DOM, store callback, A4Canvas, and print behavior are exercised directly in jsdom.
- [x] Tasks, decisions, validation evidence, file list, and change log are complete.
- [x] Build, lint, typecheck, diff-check, and marker audit pass. Existing locked dependency audit findings were not introduced by this story.
- [x] User-facing and architecture documentation updates are N/A; the change adds no public API or architectural pattern and is documented in this reconciliation story.
- [x] All applicable Definition of Done items have been addressed; ready for review and DevOps handoff.

### File List

- `docs/stories/2026-09-07-recon-r1-boxblock-source-fidelity.md`
- `src/components/editor/blocks/BoxBlock.tsx`
- `tests/components/box-block-source-fidelity-r1.test.tsx`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-07 | 0.1 | Registered the user-authorized RECON.R1.1 source-fidelity remediation with RED-first, XSS, historical-parity, scope, and exact-SHA CI requirements. | River (SM) |
| 2026-09-07 | 0.2 | Story draft checklist passed; status advanced to Ready for autonomous implementation. | River (SM) |
| 2026-09-07 | 0.2.1 | Development started (yolo mode) — Status: Ready → InProgress. | Dex (Dev) |
| 2026-09-07 | 0.2.2 | Development complete; RED/GREEN, security, focused/full gates, DoD, and historical parity recorded — Status: InProgress → InReview. | Dex (Dev) |

## QA Results

- _To be populated by @qa._
