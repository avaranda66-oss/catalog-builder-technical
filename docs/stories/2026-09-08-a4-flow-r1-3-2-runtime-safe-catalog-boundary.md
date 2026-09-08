# A4.FLOW.R1.3.2 — Runtime-Safe Catalog Boundary

Status: Approved

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- quality_gate_tools: Vitest domain/store/component integration, production-editor browser counterproof, full local gates, exact-SHA evidence

## Story

**As a** catalog editor and final-publication operator,
**I want** persisted catalogs to be hydrated into a structurally safe runtime representation while retaining typed source-corruption diagnostics,
**so that** malformed legacy/source `page.blocks` values cannot crash real editor consumers and can never become publishable.

## Provenance and Scope

- Direct user-authorized Principal Audit follow-up to A4.FLOW.R1.3.1.
- Exact base: `97ae660dcc6ab8a4cd31b8c2895b8d050b1ee826` on `remediation/a4-flow-r1-3-1-final-counterproof`.
- Branch: `remediation/a4-flow-r1-3-2-safe-catalog-boundary`.
- Worktree: `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder-a4-flow-r1-3-2`.
- Do not modify `main` or PRs #6, #7, or #8 directly. Do not merge.

## Acceptance Criteria

1. R132-T1 — Hydrating source values `"corrupt"`, `42`, `{ corrupt: true }`, and `false` yields runtime pages whose `blocks` are arrays, while typed diagnostics retain each malformed source condition.
2. R132-T2 — `null` and `undefined` source blocks hydrate to `[]` without `MALFORMED_PAGE_BLOCKS`.
3. R132-T3 — A malformed non-null/non-array source leaves the runtime UI structurally valid, causes preflight to include `MALFORMED_PAGE_BLOCKS`, and sets `canPublish === false`.
4. R132-T4 — The production `PageThumbnailList`, reached through the real store/hydration path, renders malformed persisted source without exception or white screen and leaves navigation available while publication is blocked.
5. R132-T5 — The production `A4Canvas`, reached through the malformed persisted-source path, safely exercises current-page selection, selected-block validation, and practical presence/location block lookup with zero array-operation `TypeError`.
6. R132-T6 — Valid array-backed catalogs retain existing semantics and all R1.3.1 guarantees.
7. R132-T7 — Hydration/source diagnostics never persist as content blocks or user-editable catalog content.

## Architectural Invariants

- Every `Catalog` exposed to Zustand, React editor, export/print, and ordinary domain/UI consumers has `CatalogPage.blocks: ContentBlock[]`.
- Non-null, non-array source corruption remains available through one explicit typed diagnostic/provenance channel and blocks final publication.
- `null`/`undefined` blocks remain legacy-compatible and non-blocking.
- Fix the single hydration/runtime boundary; do not scatter component guards, create a second catalog engine, hide diagnostics in DOM attributes, or use `any` as the solution.

## Tasks / Subtasks

- [ ] Task 1 — Freeze baseline and audit the full consumption/hydration graph (AC: 1–7).
  - [ ] Record clean status, exact SHA, baseline typecheck, and baseline full test results.
  - [ ] Map `page.blocks`, `currentCatalog.pages`, hydration/load, store, preflight/planner, editor, thumbnail, export, and print consumers.
- [ ] Task 2 — Add factual R132 RED counterproof (AC: 1–7).
  - [ ] Create `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx` covering R132-T1..T7 through real boundaries/components.
  - [ ] Record the pre-fix failure mode without fabricating already-solved findings.
- [ ] Task 3 — Implement one typed runtime-safe catalog hydration boundary (AC: 1–3, 6–7).
  - [ ] Normalize runtime `page.blocks` to arrays.
  - [ ] Retain typed malformed-source diagnostics outside editable content and compose them into publication preflight.
  - [ ] Preserve valid and nullish legacy semantics.
- [ ] Task 4 — Prove real editor and browser survival (AC: 3–5).
  - [ ] Exercise production `PageThumbnailList` and `A4Canvas` through store/hydration.
  - [ ] Add a production-editor malformed fixture/browser assertion that exits non-zero on React/uncaught/white-screen/publishable corruption.
- [ ] Task 5 — Verify, document, commit, and deliver without merge (AC: 1–7).
  - [ ] Run focused R132 tests, full test/lint/typecheck/build, diff check, R1.3.1 regressions, and PRESYS browser proof.
  - [ ] Audit forbidden scope, update this story record/file list, create logical commits, push, and open the stacked PR against `remediation/a4-flow-r1-3-1-final-counterproof`.

## Dev Notes

- TypeScript is strict; domain types are explicit and new modules use absolute `@/` imports. [Source: `docs/framework/coding-standards.md`]
- The editor uses Zustand/Immer and Supabase is isolated in the shared service layer; no dependency or persistence schema change is authorized. [Source: `docs/framework/tech-stack.md`]
- Production code follows the established `src/components`, `src/domain`, `src/services`, `src/stores`, and `tests` layout despite the generic planned tree. [Source: `docs/framework/source-tree.md`; previous A4 story]
- A4.FLOW.R1.1 established one measured render authority, fail-closed publication, and canonical row conservation. This follow-up must preserve those guarantees. [Source: `docs/stories/2026-09-08-a4-flow-r1-1-runtime-wiring-presys-final.md#completion-notes-list`]

## Testing

- Required focused suite: `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx` with R132-T1..T7.
- Required browser runner: `node tests/browser/presys-a4-physical.mjs`, extended or composed with a real production-editor malformed-source fixture.
- Final gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- Preserve printable-root parity, Manual mode, `LAYOUT_UNSTABLE`, deterministic failed-image readiness, canonical row identity, malformed-table blocking, physical conservation, and zero row loss/duplication.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled in `.aiox-core/core-config.yaml`; manual review and all requested local gates remain mandatory.

## Forbidden Scope

- Zero SQL, migrations, RLS, dependencies, lockfile, auth redesign, C3/Presence redesign, Commands, Undo/Redo, Table Studio, `main` mutation, merge, or unrelated fixes.

## Dev Agent Record

### Agent Model Used

- Pending implementation.

### Debug Log References

- Pending implementation.

### Completion Notes List

- Pending implementation.

### File List

- `docs/stories/2026-09-08-a4-flow-r1-3-2-runtime-safe-catalog-boundary.md`

## QA Results

- Pending independent review.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 0.1 | Registered the user-authorized R1.3.2 runtime-safe catalog boundary and exact counterproof contract. | River (SM) |
