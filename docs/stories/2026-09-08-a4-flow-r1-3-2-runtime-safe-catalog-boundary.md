# A4.FLOW.R1.3.2 — Runtime-Safe Catalog Boundary

Status: Ready for Review

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

- [x] Task 1 — Freeze baseline and audit the full consumption/hydration graph (AC: 1–7).
  - [x] Record clean status, exact SHA, baseline typecheck, and baseline full test results.
  - [x] Map `page.blocks`, `currentCatalog.pages`, hydration/load, store, preflight/planner, editor, thumbnail, export, and print consumers.
- [x] Task 2 — Add factual R132 RED counterproof (AC: 1–7).
  - [x] Create `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx` covering R132-T1..T7 through real boundaries/components.
  - [x] Record the pre-fix failure mode without fabricating already-solved findings.
- [x] Task 3 — Implement one typed runtime-safe catalog hydration boundary (AC: 1–3, 6–7).
  - [x] Normalize runtime `page.blocks` to arrays.
  - [x] Retain typed malformed-source diagnostics outside editable content and compose them into publication preflight.
  - [x] Preserve valid and nullish legacy semantics.
- [x] Task 4 — Prove real editor and browser survival (AC: 3–5).
  - [x] Exercise production `PageThumbnailList` and `A4Canvas` through store/hydration.
  - [x] Add a production-editor malformed fixture/browser assertion that exits non-zero on React/uncaught/white-screen/publishable corruption.
- [x] Task 5 — Verify, document, commit, and deliver without merge (AC: 1–7).
  - [x] Run focused R132 tests, full test/lint/typecheck/build, diff check, R1.3.1 regressions, and PRESYS browser proof.
  - [x] Audit forbidden scope, update this story record/file list, create logical commits, push, and open the stacked PR against `remediation/a4-flow-r1-3-1-final-counterproof`.

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

- OpenAI Codex (GPT-5).

### Debug Log References

- Baseline at `97ae660dcc6ab8a4cd31b8c2895b8d050b1ee826`: clean status; `npm run typecheck` passed; `npm test` passed 193 files / 2,018 tests with 1 skipped.
- Factual RED: focused R132 suite failed 8 tests and passed 3 before the production boundary; production failures included `PageThumbnailList` `.slice is not a function` and `A4Canvas` `.some is not a function`.
- Focused GREEN: R132 + R1.3.1 + R1.3 suites passed 3 files / 42 tests.
- Final GREEN: `npm run typecheck`, `npm run lint` (0 errors; repository warnings only), `npm test` (194 files / 2,029 passed, 1 skipped), `npm run build`, direct lint of the new lab route, `node --check tests/browser/presys-a4-physical.mjs`, and `git diff --check` passed.
- Browser evidence ran against exact code SHA `157f63f26e96648fc7c703f91dadb4e22f12f919`: 0 physical failures, 0 row defects, 0 blocked valid catalogs, 0 runtime editor errors, malformed string/object fixtures runtime-safe and fail-closed.
- CodeRabbit CLI was unavailable and CodeRabbit integration is disabled by repository configuration; manual diff review and the complete local gate set were used.

### Completion Notes List

- Added `hydrateCatalogSource`, the shared persisted/source-to-runtime boundary used by Supabase row hydration, template hydration, storage loads, and the public catalog store setter.
- Non-null/non-array `page.blocks` become runtime-safe empty arrays while typed `MALFORMED_PAGE_BLOCKS` provenance remains top-level catalog metadata and blocks preflight publication. Nullish values remain compatible and non-diagnostic; valid arrays remain unchanged.
- Consumption audit confirmed direct array consumers in `PageThumbnailList`, `A4Canvas`, `PropertiesPanel`, publications, store mutations, render planning, composition policy, export/print, and audit paths. Store-level hydration now protects these ordinary consumers instead of scattering component guards.
- Added R132-T1..T7 unit/integration counterproof and a dev/E2E-only browser route that traverses persisted-row hydration, the real Zustand setter, `PageThumbnailList`, and `A4Canvas`.
- Extended the existing PRESYS physical runner without replacing prior evidence. TA-25N, TA-35N, and TA-50N each retained 12 rendered pages with zero missing or duplicate canonical rows.
- No SQL, migrations, RLS, dependency, lockfile, auth, Presence/C3, Commands, Undo/Redo, Table Studio, `main`, merge, or unrelated product change was made.

### File List

- `docs/stories/2026-09-08-a4-flow-r1-3-2-runtime-safe-catalog-boundary.md`
- `docs/qa/evidence/a4-flow-r1-1/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3-2/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3-2/production-editor-malformed-object.png`
- `docs/qa/evidence/a4-flow-r1-3-2/production-editor-malformed-string.png`
- `src/domain/catalog.schema.ts`
- `src/domain/layout-preflight.ts`
- `src/labs/a4-runtime-boundary-proof/A4RuntimeBoundaryProofPage.tsx`
- `src/main.tsx`
- `src/services/storage.service.ts`
- `src/services/supabase.service.ts`
- `src/stores/useCatalogStore.ts`
- `tests/browser/presys-a4-physical.mjs`
- `tests/flow/a4-flow-r1-3-1-counterproof.test.tsx`
- `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx`

## QA Results

- Pending independent review.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 0.1 | Registered the user-authorized R1.3.2 runtime-safe catalog boundary and exact counterproof contract. | River (SM) |
| 2026-09-08 | 1.0 | Implemented and verified the typed runtime boundary, production-editor counterproof, and exact-SHA browser evidence. | Dex (Dev) |
