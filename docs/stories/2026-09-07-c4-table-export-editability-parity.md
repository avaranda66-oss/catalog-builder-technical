# C4 — Table Export / Editability Parity

Status: InReview

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- quality_gate_tools: focused Vitest regressions, full quality gates, CodeRabbit when available

## Story

**As a** catalog editor and publication operator,
**I want** specialized technical tables to follow the canonical editor versus read-only rendering contract,
**so that** edit affordances remain available in the editor but cannot leak into print/export DOM or change the represented facts.

## Base and Branch

- Immutable base and required `origin/main`: `81c13e4cf1d7f5160b3a16bac250a0e32b076adf`.
- Target branch: `remediation/c4-table-export-editability-parity`.
- Do not merge or commit directly to `main`.

## Acceptance Criteria

1. C4-T1: `electrical_table` remains editable in the editor path.
2. C4-T2: `electrical_table` has no editable controls or attributes in the non-editor/print/export path.
3. C4-T3: `accessories_table` remains editable in the editor path.
4. C4-T4: `accessories_table` has no editable controls or attributes in the non-editor/print/export path.
5. C4-T5: Both modes render the same rows, columns, and textual facts.
6. C4-T6: Editor-only actions cannot appear in non-editor DOM.
7. C4-T7: Existing `TechnicalTableBlock` behavior does not regress.
8. C4-T8: Existing `CustomTableBlock` behavior does not regress.
9. C4-T9: Add `CleanA4Document`/`PrintDocumentView` parity coverage if specialized blocks participate in those paths; otherwise record the architectural evidence.
10. C4-T10: No mutation callback can be invoked from the read-only path.
11. A deterministic RED test must prove a real user-visible render/export inconsistency before production code changes.
12. If the specialized blocks are not used by export, report `NO BUG` with evidence and do not manufacture a fix.

## Tasks / Subtasks

- [x] Map the render contract and actual editor/export call paths (AC: 7–12).
  - [x] Inspect `ElectricalTableBlock`, `AccessoriesTableBlock`, `TechnicalTableBlock`, `CustomTableBlock`, `TechnicalTable`, A4 editor rendering, `CleanA4Document`, `PrintDocumentView`, and shared block dispatch.
  - [x] Identify the exact behaviors controlled by `isEditable` and whether specialized blocks are mounted or transformed in export.
- [x] Add and execute deterministic RED parity tests before production edits (AC: 1–6, 9–12).
  - [x] Prove editor/read-only behavior for both specialized table kinds.
  - [x] Prove factual row/column/text parity and absence of mutation reachability in read-only mode.
- [x] If RED proves the bug, implement the narrow canonical render-mode fix (AC: 1–10).
  - [x] Remove hard-coded editability without rewriting `TechnicalTable` or migrating to `TableCore`.
  - [x] Preserve all factual content and existing generic table behavior.
- [x] Run focused and full quality gates, audit scope, commit, and prepare DevOps handoff (AC: 1–12).
  - [x] Run focused table/editor/export/print regression suites.
  - [x] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and merge-marker audit.
  - [x] Run CodeRabbit pre-commit review when available.
  - [x] Commit focused work; delegate remote push and exact-SHA Quality Gates to `@github-devops`.

## Dev Notes

- The repository uses strict TypeScript, React, Vite/Vitest, Tailwind, Zustand/Immer, and Node/npm gates. [Source: `docs/framework/coding-standards.md`, `docs/framework/tech-stack.md`]
- New modules should prefer absolute `@/` imports; tests should prioritize behavioral contracts over visual implementation details. [Source: `docs/framework/coding-standards.md`]
- Relevant production scope is limited to the specialized table blocks and the narrow shared render contract needed to propagate canonical mode.
- `package.json` does not declare Next.js and this checkout has no `node_modules/next/dist/docs`; the affected component/test path is Vite-based, so no Next API is assumed for C4.
- Previous export work established that clean publication rendering consumes immutable catalog content and that transient editor presentation must not cross into export. [Source: `docs/stories/2026-09-06-w2b-rr009-export-snapshot-consistency.md#dev-notes`]

## Testing

- Use deterministic Vitest/jsdom component tests with Testing Library.
- Assert semantic DOM behavior (`contenteditable`, editor controls, callbacks, text/rows/columns), not PDF corruption without binary-path evidence.
- Run focused table regressions plus `CleanA4Document` and `PrintDocumentView` suites when applicable.

## Scope Guard

Preferred production scope:

- `src/components/editor/blocks/ElectricalTableBlock.tsx`
- `src/components/editor/blocks/AccessoriesTableBlock.tsx`
- a narrow shared block renderer contract only if required
- focused tests
- this story file

Forbidden scope:

- `App`, realtime, workbook lifecycle, presence, Product Knowledge
- `TableCore` migration, table feature expansion, pagination, Undo
- SQL, migrations, LIVE DB, dependencies, package manifests, lockfiles
- factual content changes or a `TechnicalTable` rewrite
- `main` merge or direct commit

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled in `.aiox-core/core-config.yaml`; the local developer policy still requires an attempted pre-commit CLI review when the CLI is available.

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex via Codex desktop task.

### Debug Log References

- Base proof before edits: `HEAD == origin/main == 81c13e4cf1d7f5160b3a16bac250a0e32b076adf`.
- Render map: `A4Canvas` mounts both specialized blocks in editor mode; `CleanA4Document` mounted the same blocks directly without a render-mode prop; `PrintDocumentView`, `ExportPDFModal`, and `PublicationsView` delegate publication rendering to `CleanA4Document`.
- RED on canonical production code: focused C4 run had 2 failures / 5 passes. Each specialized export block exposed 5 buttons before the first failing assertion, plus editable attributes and an action-only table column from the same unconditional `isEditable=true` contract.
- GREEN after remediation: C4 focused suite 7/7; focused table/export/print regressions 7 files and 52/52 tests.
- Full suite: 177 files, 1835 passed, 1 skipped, 0 failed (1836 total).
- Lint: exit 0, 0 errors and 267 pre-existing warnings; changed-file lint exit 0 with no output.
- Typecheck: exit 0 after removal of one unused test import found during the first run.
- Build: exit 0; Vite emitted existing dynamic-import and large-chunk warnings.
- `git diff --check`: exit 0. Strict merge-marker audit: 0 matches.
- CodeRabbit pre-commit review attempted through the prescribed WSL path; CLI unavailable at `/home/gabriel/.local/bin/coderabbit`, so no CodeRabbit pass is claimed.

### Completion Notes List

- Actual export impact classification: `PARTIAL`. The real `CleanA4Document` capture DOM was affected; PDF clone cleanup hid buttons/`.no-print`, but the action-only `#` header and extra row cells were structural capture input. No binary PDF corruption claim is made because binary generation was not part of the component test path.
- Reused the existing `isExport` contract from `TechnicalTableBlock`/`CustomTableBlock`; no parallel render-mode abstraction or unrelated boolean was introduced.
- Editor mode remains editable. Export mode now removes controls, editable state, selection affordances, mutation handlers, and the action-only table column while preserving every printable field and factual value.
- `TechnicalTable`, Table Core, factual data, persistence, SQL, dependencies, package manifests, and lockfiles were not changed.
- C4 matrix: T1 GREEN; T2 GREEN; T3 GREEN; T4 GREEN; T5 GREEN; T6 GREEN; T7 GREEN; T8 GREEN; T9 GREEN through `CleanA4Document` plus the existing `PrintDocumentView` RR009 regression; T10 GREEN.
- Story DoD self-assessment passed for every applicable item; browser-manual, API, database, environment, and user-documentation items are not applicable to this focused component contract change.

### File List

- `docs/stories/2026-09-07-c4-table-export-editability-parity.md`
- `src/components/editor/blocks/AccessoriesTableBlock.tsx`
- `src/components/editor/blocks/ElectricalTableBlock.tsx`
- `src/components/export/CleanA4Document.tsx`
- `tests/components/specialized-table-editability-parity-c4.test.tsx`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-07 | 0.1 | Registered the user-authorized C4 remediation with RED-first and no-bug guardrails. | River (SM) |
| 2026-09-07 | 0.2 | Story draft checklist passed and status advanced to Ready for implementation. | River (SM) |
| 2026-09-07 | 0.3 | Development started (autonomous mode) — Status: Ready to InProgress. | Dex (Dev) |
| 2026-09-07 | 1.0 | Completed C4 render-mode remediation and all local quality gates. | Dex (Dev) |
| 2026-09-07 | 1.0.1 | DoD passed and status advanced from InProgress to InReview. | Dex (Dev) |
