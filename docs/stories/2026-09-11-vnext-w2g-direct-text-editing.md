# W2.G — Minimum Direct Text Editing

Status: COMPLETE / MERGED / CANONICAL

Date: 2026-09-11

## Provenance

- Repository: `avaranda66-oss/catalog-builder-technical`.
- GitHub authority verified before implementation.
- Canonical base SHA: `2d24935b507a240b11165d2e9357f1975cf389ba`.
- Canonical base tree: `eba8c26b52a2e714a45da39bc2831bde6c7c8aa0`.
- Canonical direct parent: `7793aaa21bfed41d57da861424efdd84a686170d`.
- Canonical commit: `docs(vnext): record W2.F canonical merge closeout (#25)`.
- PR #24: MERGED.
- PR #25: MERGED.
- Branch: `feat/vnext-w2g-direct-text-editing`.
- W2.A through W2.F: COMPLETE / CANONICAL.
- W2.G: IMPLEMENTED / INDEPENDENTLY AUDITED / PRINCIPAL ACCEPTED / MERGED / CANONICAL.
- Accepted review head: `f827d660b9f63548830b15477f843727dd9a70e2`.
- Accepted review tree: `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`.
- Canonical squash main SHA: `3810b4c70b9415f43c7cb0360d6525b5a1823c22`.
- Canonical main tree: `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`.
- Canonical parent: `2d24935b507a240b11165d2e9357f1975cf389ba`.
- Canonical merge tree equals the accepted audited review tree.
- Post-merge required Quality Gate run `34642762581`: **SUCCESS**.

## Objective

Deliver the minimum safe direct editing path for ordinary Text objects so an office user can select Text, enter editing directly, type multiline technical content, insert common engineering symbols, commit once, Undo once, and Redo once without interacting with RichText JSON.

Canonical authored geometry must remain unchanged when content is edited. Canonical truth remains `CatalogDocument / RichText`; textarea value, caret, selection, composition, focus, and edit-mode state remain ephemeral editor state.

## Frozen contract

- Add one strict typed Application Action with semantics equivalent to:

  ```ts
  {
    type: 'text.setContent',
    objectId: string,
    expectedText: RichText,
    plainText: string
  }
  ```

- Runtime validation permits empty/Unicode/LF text, rejects unsupported ASCII controls, and never trims user content. UI normalizes CR/CRLF to LF before dispatch.
- Execution order is target lookup -> grouped-child guard -> lock guard -> Text type guard -> target-specific compare-and-set against `expectedText` -> supported-subset guard -> deterministic reconciliation -> canonical validation.
- Staleness is target specific. Unrelated document/page/object changes do not stale the edit; a changed target RichText does.
- Direct-editable RichText is limited to paragraphs that are empty or contain exactly one text inline. Existing marks on the retained inline may be preserved. Lists, explicit lineBreaks, multi-inline/mixed-run structures, and other lossy cases fail closed.
- Reconciliation preserves unchanged paragraph identities across insert/delete via deterministic sequence matching, then applies deterministic positional substitution inside unmatched blocks so ordinary edits retain paragraph and inline identity.
- New paragraph/inline IDs come only from the existing application `IdAllocator` seeded with the canonical reservation identity closure. Empty paragraphs contain zero inlines.
- UI captures object/page/original RichText/plain projection/draft ephemerally. Typing performs zero `session.execute()` calls and creates zero history entries.
- Commit dispatches at most one `text.setContent`; changed commit is one Undo step; no-op/failure/cancel creates no history and preserves Redo.
- Native `<textarea>` overlay is editor chrome outside `[data-editorial-root]`; publication continues through the existing canonical RichText renderer.
- Activation paths: double-click/double-pointer activation on selected Text, Enter for exactly one editable Text, and contextual `Editar texto`.
- Locked, grouped, and unsupported complex Text do not activate destructively and produce clear status.
- Double-click with slight pointer jitter must enter editing without changing the authored Text frame.
- In text-edit mode the Text remains selected, move/resize cannot start, resize handles are hidden, and textarea caret/selection works normally.
- Commit boundaries: Ctrl/Cmd+Enter when not composing, explicit `Concluir`, and controlled editor click-away. Raw textarea blur and window blur do not commit.
- Text-edit-local textarea/symbol/Concluir/Cancelar chrome does not trigger click-away commit.
- Escape/Cancelar discard draft with zero Application Actions. Active-page change cancels. Undo/Redo cancel draft first, then operate on canonical history.
- Window focus loss retains the ephemeral draft.
- Grouped Text direct content edit fails with `ACTION_INVALID`; Father workflow remains Ungroup -> Edit Text -> Group.
- Locked Text action fails with `OBJECT_LOCKED`.
- Technical-symbol toolbar supports `±`, `°C`, `Ω`, `µ`, `≤`, `≥`, `≈`, replacing the current textarea selection and restoring focus/caret without commit.
- Native IME composition remains ephemeral; composing keyboard events must not trigger commit/cancel shortcuts.
- Content editing never changes x/y/width/height, zIndex, lock state, or Text style. Overflow commits valid content and is surfaced by existing `TEXT_OBJECT_OVERFLOW` diagnostics.
- DocumentRenderer/publication/PDF see committed RichText only; draft/editor chrome never enters the canonical publication root.
- No translation, persistence, W3, W4, W5+, Group drill-down, second renderer/model/allocator, contentEditable authority, innerHTML serialization, DOM Range persistence, per-keystroke actions/history, auto-grow, or auto-pagination.

## Acceptance criteria

- [x] Strict `text.setContent` schema and runtime validation.
- [x] Target lookup, grouped/locked/type guards, and target-specific stale compare-and-set.
- [x] Pure editable-subset projection and application-layer reconciliation.
- [x] Stable paragraph/inline identity with existing allocator authority for genuinely new IDs.
- [x] Empty, multiline, blank-middle, trailing-blank, marked-inline, Unicode, and technical-symbol content.
- [x] No-op/failure preserve history and Redo.
- [x] One changed commit equals one Undo; Redo restores exact edited RichText snapshot/IDs.
- [x] Native textarea edit surface outside `[data-editorial-root]`.
- [x] Enter, contextual button, and double-click activation.
- [x] Double-click jitter cannot move the Text frame.
- [x] No move/resize/handles while text-edit mode is active.
- [x] Controlled commit, click-away, cancel, page-change, Undo/Redo, blur/focus-loss, and IME semantics.
- [x] Locked/grouped/complex Text fail safely.
- [x] Technical-symbol toolbar insertion at caret/selection.
- [x] Frame/style/zIndex/lock/object ID preserved exactly.
- [x] Overflow uses existing `TEXT_OBJECT_OVERFLOW` behavior with no auto-resize.
- [x] Focused application/editor/diagnostics/architecture tests pass.
- [x] Chromium W2.G proof passes on real `/v2`.
- [x] W2.C/W2.D/W2.E/W2.F and PDF/export regressions pass.
- [x] `git diff --check`, lint, typecheck, full tests, and build pass.
- [x] During W2.G review, one non-merged PR existed and durable project/handoff docs contained actual branch/base/PR/implementation-head facts; final exact-head CI was reported after the final push.

## Test and proof plan

Application coverage will include success, invariants, missing/type/locked/grouped/stale failures, unrelated-change tolerance, no-op/Redo behavior, Unicode/control validation, empty and multiline structures, deterministic ID preservation/allocation/collision failure, complex-RichText rejection, marks, and exact Undo/Redo snapshots.

Editor coverage will include all three activation paths, locked/grouped/complex guards, textarea publication boundary, zero execute calls while typing, hidden handles, Escape/Cancelar, one-shot commits, blur/focus-loss behavior, symbol insertion and focus restoration, controlled click-away, page cancellation, Undo/Redo cancellation ordering, stale failure handling, IME composition, no-op behavior, and frame/style preservation.

Chromium proof: `tests/vnext/proof/editor-text-proof.mjs` will exercise real `/v2`, prove canonical immutability during draft, symbol-toolbar behavior, cancel, commit, exact content/geometry/style/IDs, Undo/Redo, overflow, publication/editor-root separation, double-click jitter safety, zero console/page errors, and no Legacy bootstrap.

Regression proofs:

- `node tests/vnext/proof/editor-direct-manipulation-proof.mjs`
- `node tests/vnext/proof/editor-snapping-diagnostics-proof.mjs`
- `node tests/vnext/proof/editor-template-insertion-proof.mjs`
- `node tests/vnext/proof/editor-group-proof.mjs`
- `node tests/vnext/proof/group-export-proof.mjs`
- `node tests/vnext/proof/export-proof.mjs`

## Scope exclusions

No save/autosave/reopen/Catalog Library/Supabase/CAS/conflict/local recovery/Auth; no advanced Table editing/TSV/Fit Height/table presets/spreadsheet selection; no translation/localized leaves/stale translation/AI authoring/components/catalog starters/sharing; no Group child drill-down; no RichText schema redesign.

## File List

- docs/stories/2026-09-11-vnext-w2g-direct-text-editing.md
- src/vnext/application/contracts.ts
- src/vnext/application/document.ts
- src/vnext/application/execute.ts
- src/vnext/application/index.ts
- src/vnext/application/text-editing.ts
- src/vnext/app/EditorWorkspace.tsx
- src/vnext/app/styles.css
- tests/vnext/application/text-actions.test.ts
- tests/vnext/application/editor-workspace.test.tsx
- tests/vnext/proof/architecture-boundary.test.ts
- tests/vnext/proof/authoring-diagnostics.test.ts
- tests/vnext/proof/editor-text-proof.mjs
- .github/workflows/quality-gates.yml

## Dev Agent Record

### Debug Log References

- GitHub canonical provenance gate verified before branch creation.

### Completion Notes

- PR #26 was implemented from canonical base SHA/tree `2d24935b507a240b11165d2e9357f1975cf389ba` / `eba8c26b52a2e714a45da39bc2831bde6c7c8aa0` on `feat/vnext-w2g-direct-text-editing`.
- Initial implementation review head/tree: `286fa9583a6a3d15249e0c67de3e16dcf761529e` / `21cd615a559599ce389141b70ddb32bc04ec9273`.
- Full local gates were green before delivery: lint PASS (0 errors, 268 baseline warnings), typecheck PASS, tests PASS (213 files, 2303 passed, 1 skipped), build PASS, `git diff --check` PASS.
- Real `/v2` W2.G Chromium proof passed with zero console errors, zero page errors, and no Legacy bootstrap. W2.C/W2.D/W2.E/W2.F regressions, export/PDF regression, and PDF technical-symbol evidence passed.
- Independent initial adversarial audit classification: **B — SOUND, SMALL AMENDMENT REQUIRED**, limited to proof completeness and required-CI proof execution; W2.G product semantics remained unchanged.
- The Principal amendment completed the committed W2.G technical-text path with all seven required symbols `±`, `°C`, `Ω`, `µ`, `≤`, `≥`, `≈`, and the generated PDF is checked through `pdfjs` extraction.
- The existing required GitHub job `Lint, typecheck, tests, build` installs Playwright Chromium and executes the W2.G Chromium/PDF proof plus W2.C, W2.D, W2.E, W2.F, Group export, and canonical export/PDF regression proofs; the required check context name is unchanged.
- Final accepted review head/tree after the Principal amendment: `f827d660b9f63548830b15477f843727dd9a70e2` / `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`.
- Independent amendment re-audit classification: **A — READY TO MERGE AS WRITTEN**.
- Principal final classification: **A — W2.G PRINCIPAL ACCEPTED / READY TO MERGE AS WRITTEN**.
- The user explicitly authorized the merge of PR #26. That authorization applied to PR #26 only and was consumed by the merge.
- GitHub squash-merged PR #26 at `2026-09-11T20:10:03Z` as canonical `main` SHA/tree `3810b4c70b9415f43c7cb0360d6525b5a1823c22` / `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`, direct parent `2d24935b507a240b11165d2e9357f1975cf389ba`.
- The canonical merge tree exactly equals the accepted audited review tree.
- Post-merge required Quality Gate run `34642762581` completed **SUCCESS** on canonical main.
- The historical/external Netlify red status was not a required branch-protection context and no W2.G causality was demonstrated.
- W2.G is **COMPLETE / MERGED / CANONICAL** and closes W2 as **COMPLETE / CANONICAL**. W3 remains **NOT STARTED**.

## Change Log

- 2026-09-11: Story created on exact verified canonical base before production code changes.
- 2026-09-11: W2.G implementation completed and validated; PR #26 opened; durable review state synchronized without claiming merge/canonical acceptance.
- 2026-09-11: Principal proof amendment applied after independent audit classification B: completed seven-symbol PDF coverage and wired the browser/PDF proof matrix into the existing required GitHub quality-gates job.
- 2026-09-11: Independent amendment re-audit returned A; Principal final verdict returned A; user explicitly authorized merge; PR #26 was squash-merged as `3810b4c70b9415f43c7cb0360d6525b5a1823c22`, preserving audited tree `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`; post-merge Quality Gate run `34642762581` succeeded; W2.G and W2 are canonical-complete.

## W2.0 deviation

NONE
