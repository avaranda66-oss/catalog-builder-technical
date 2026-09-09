# A4.FLOW.R1.3.3 — Source Diagnostic Lifecycle Closure

Status: InReview

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- quality_gate_tools: Vitest domain/store/persistence integration, exact-SHA browser counterproof, full local gates, stacked-PR CI

## Story

**As a** catalog editor and final-publication operator,
**I want** malformed-page source diagnostics to remain fail-closed only while their stable page remains unresolved,
**so that** an explicit repair or deletion survives save/reload without leaving a permanent ghost publication blocker.

## Provenance and Scope

- Direct user-authorized Principal Audit follow-up to A4.FLOW.R1.3.2.
- Exact base: `7fb68da3571748187d2fccad4c45f980d209c931` on `remediation/a4-flow-r1-3-2-safe-catalog-boundary`.
- Branch: `remediation/a4-flow-r1-3-3-source-diagnostic-lifecycle`.
- Worktree: `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder-a4-flow-r1-3-3`.
- Do not modify `main` or PRs #6, #7, #8, or #9 directly. Do not merge.
- Preserve every R132/R131 and PRESYS physical guarantee; do not reopen A4 architecture.

## Acceptance Criteria

1. R133-T1 — Loading a genuinely malformed non-null/non-array `page.blocks` yields runtime `blocks === []`, retains a typed `MALFORMED_PAGE_BLOCKS` diagnostic, and keeps `canPublish === false`.
2. R133-T2 — An unrelated edit on another page does not clear the affected page's diagnostic or publication block.
3. R133-T3 — A legitimate structural mutation of the affected page through the real store path makes its structure valid and resolves only that page's diagnostic without direct test mutation of `sourceDiagnostics`.
4. R133-T4 — Removing the affected page through the real store removes diagnostics that reference it and produces no ghost malformed-page preflight issue.
5. R133-T5 — Reordering pages without repairing the affected page preserves the unresolved diagnostic by stable `pageId`, while preflight reports the page's current location rather than persisted stale `pageNumber`.
6. R133-T6 — Explicit remediation followed by the real save/cache serialization boundary and hydration does not resurrect the diagnostic.
7. R133-T7 — Hydration reconciles a persisted diagnostic whose `pageId` no longer exists so it cannot permanently block publication.
8. R133-T8 — A persisted unresolved diagnostic for an existing affected page remains fail-closed across reload until explicit structural remediation.
9. R133-T9 — With malformed page A and malformed page B, remediating only A clears only A; B remains unresolved and publication remains blocked.
10. R133-T10 — A normal catalog without source corruption retains existing behavior.
11. R133-T11 — Moving a block to the next page clears a pending `MALFORMED_PAGE_BLOCKS` diagnostic when the diagnosed destination page's block structure actually changes.
12. R133-T12 — Moving a block to the previous page clears a pending `MALFORMED_PAGE_BLOCKS` diagnostic when the diagnosed destination page's block structure actually changes.
13. R133-T13 — A structural mutation on another page cannot clear a diagnostic for a page whose block structure did not change.

## Architectural Invariants

- Diagnostic identity is `code + stable pageId`; persisted source-path/page-number fields are provenance, not current location authority.
- Hydration reconciles orphan diagnostics deterministically while retaining diagnostics for existing unresolved pages.
- Mutation reconciliation clears `MALFORMED_PAGE_BLOCKS` only for a page explicitly structurally remediated or removed; unrelated edits and page reorder cannot clear it.
- Preflight resolves current page context from `pageId` whenever possible and emits no blocker for a nonexistent page.
- Resolved/orphaned diagnostics cannot be copied indefinitely through catalog/template/clone/translation paths.
- No global diagnostic clear, component workaround, DOM/CSS flag, `any`-based solution, second Catalog model, or weakened publication guard.

## Tasks / Subtasks

- [x] Task 1 — Freeze baseline and audit diagnostic propagation (AC: 1–13).
  - [x] Record exact base SHA, baseline typecheck, and baseline full test results before implementation.
  - [x] Audit hydration, store mutation, preflight, save/cache/load, template, duplicate/save-as-new, and translated document paths.
- [x] Task 2 — Add factual R133 RED counterproof before production changes (AC: 1–13).
  - [x] Create `tests/flow/a4-flow-r1-3-3-diagnostic-lifecycle.test.ts` with R133-T1..T13.
  - [x] Revise R132-T7 to assert the final lifecycle rather than only non-content placement.
  - [x] Record the exact original and adversarial pre-fix pass/fail matrices.
- [x] Task 3 — Implement one typed source-diagnostic lifecycle (AC: 1–9, 11–13).
  - [x] Add a single typed helper/rule for orphan reconciliation and page-scoped structural remediation.
  - [x] Reconcile structural remediation from the transaction's actual per-page block delta, including cross-page destinations.
  - [x] Restrict structural remediation clearing to `MALFORMED_PAGE_BLOCKS` and preserve unchanged diagnostics.
  - [x] Resolve live preflight page location by stable `pageId`.
- [x] Task 4 — Close persistence and derived-document propagation (AC: 6–10).
  - [x] Prove save/cache/load round-trip does not resurrect resolved diagnostics.
  - [x] Audit template, clone/save-as-new, translation, and other derived-document paths; retain intentional unresolved diagnostics fail-closed and make no speculative production change.
- [x] Task 5 — Verify, document, commit, and deliver without merge (AC: 1–13).
  - [x] Run focused R133, then R133/R132/R131, full test/lint/typecheck/build, and `git diff --check`.
  - [x] Run official browser/PRESYS evidence against exact code SHA `2153e6ea8e34115289fd351cdae3b3c5a97b2f3b` and record it in evidence.
  - [x] Update this story's Dev Agent Record/checklists/file list and prepare the stacked PR against the exact base branch without merge.

## Dev Notes

- TypeScript is strict; use explicit domain types and absolute `@/` imports for new modules. [Source: `docs/framework/coding-standards.md`]
- Zustand/Immer owns editor state, while Supabase and Storage remain isolated service boundaries; no dependency or persistence schema change is authorized. [Source: `docs/framework/tech-stack.md`]
- Relevant established paths are `src/domain/catalog.schema.ts`, `src/domain/layout-preflight.ts`, `src/stores/useCatalogStore.ts`, `src/services/storage.service.ts`, `src/services/supabase.service.ts`, `src/services/document-lifecycle.service.ts`, `src/stores/useTemplateStore.ts`, and `tests/flow/`. [Source: `docs/framework/source-tree.md`; repository audit]
- R1.3.2 introduced `hydrateCatalogSource`, typed top-level `sourceDiagnostics`, store-level hydration, and fail-closed preflight; retain those guarantees while closing the sticky-diagnostic lifecycle. [Source: `docs/stories/2026-09-08-a4-flow-r1-3-2-runtime-safe-catalog-boundary.md#completion-notes-list`]
- The authoritative work order supplies the complete lifecycle invariants, R133-T1..T10 matrix, forbidden scope, exact branch/base, required gates, evidence contract, and stacked-PR target. [Source: Principal Audit work order A4.FLOW.R1.3.3]
- This is domain/store/persistence work, not a Next.js API or routing change; no Next.js-specific implementation API is required.

## Testing

- Required focused suite: `tests/flow/a4-flow-r1-3-3-diagnostic-lifecycle.test.ts`, covering R133-T1..T13.
- Required focused regression: R133 + R132 + R131.
- Required browser runner: `node tests/browser/presys-a4-physical.mjs`, preserving TA-25N, TA-35N, TA-50N, zero physical failures, zero row loss/duplication, malformed production-editor survival, and fail-closed publication before remediation.
- If practical, browser evidence also covers malformed page → real remediation → diagnostic resolved → no runtime exception.
- Final gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled in `.aiox-core/core-config.yaml`; manual review and all requested local/remote gates remain mandatory.

## Forbidden Scope

- Zero SQL, migrations, RLS, dependencies, lockfile, auth, Presence/C3, Commands, Undo/Redo, Table Studio, `main` mutation, merge, or unrelated fixes.
- Do not fix the pre-existing `ConflictReviewModal` `lint:labs` issue.

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex

### Debug Log References

- Untouched baseline at `7fb68da3571748187d2fccad4c45f980d209c931`: typecheck passed; full suite passed with 194 files, 2,029 passed, 1 skipped.
- Original R133 RED before the first lifecycle implementation: 6 failed / 4 passed; T1, T2, T8, T10 passed and T3, T4, T5, T6, T7, T9 failed.
- Adversarial cross-page RED before the follow-up correction: 2 failed / 11 passed; T11 and T12 retained destination diagnostics, while T13 passed.
- Final R133: 1 file / 13 tests passed.
- Focused regression: 3 files / 36 tests passed (R133 13, R132 11, R131 12).
- Final typecheck: passed (`tsc --noEmit`).
- Final full suite: 195 files passed; 2,042 tests passed; 1 skipped (2,043 total).
- Final lint: passed with 0 errors and 268 pre-existing warnings.
- Final build: passed (`vite build`; existing chunk warnings only).
- Final `git diff --check`: passed; line-ending conversion notices only.
- Official browser runner: exit 0 against code SHA `2153e6ea8e34115289fd351cdae3b3c5a97b2f3b`.

### Completion Notes List

- Diagnostic identity is now `code + stable pageId`; source path and persisted page number remain provenance only.
- Hydration deterministically drops orphan diagnostics while unresolved diagnostics for existing pages remain fail-closed.
- Structural block mutations inspect the actual before/after block structure of every pending malformed-page diagnostic. This closes NEXT/PREVIOUS destination remediation without adding source/destination metadata.
- Explicit remediation can remove only `MALFORMED_PAGE_BLOCKS`; future diagnostic codes are not generically cleared by page identity.
- Page reorder preserves unresolved provenance and preflight resolves the current page number from stable `pageId`.
- Real autosave/cache/load coverage proves resolved diagnostics do not resurrect.
- Derived-document audit found no factual stale-diagnostic path requiring production changes: catalog duplication sources are hydrated through Supabase/Storage boundaries; save-as-new uses the hydrated active catalog; cloud/system/cached templates originate from hydrated or valid catalogs; translation clones the reconciled active document. Intentionally unresolved diagnostics continue to propagate fail-closed.
- PRESYS evidence retained 12 pages and 105/105 canonical rows for each TA-25N, TA-35N, and TA-50N; zero physical failures, row defects, blocked canonical catalogs, or runtime editor errors. Malformed string/object fixtures remained render-safe and publication-blocked.
- No SQL, migrations, RLS, dependencies, lockfile, auth, Presence/C3, Commands, Undo/Redo, or Table Studio changes were made.
- DoD self-check: all applicable requirements, tests, gates, documentation, structure, and security items are satisfied; no new lint errors/warnings, dependency, config, environment, or user-documentation change. Ready for independent review; no A4 GO/closure claim is made.

### File List

- `docs/stories/2026-09-08-a4-flow-r1-3-3-source-diagnostic-lifecycle-closure.md`
- `src/domain/catalog.schema.ts`
- `src/domain/layout-preflight.ts`
- `src/stores/useCatalogStore.ts`
- `tests/flow/a4-flow-r1-3-2-runtime-boundary.test.tsx`
- `tests/flow/a4-flow-r1-3-3-diagnostic-lifecycle.test.ts`
- `docs/qa/evidence/a4-flow-r1-1/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3-2/presys-a4-physical.json`

## QA Results

- Pending independent review.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 0.1 | Registered the user-authorized R1.3.3 source-diagnostic lifecycle closure and exact counterproof contract. | River (SM) |
| 2026-09-08 | 0.1.1 | Development started (YOLO mode) — Status: Ready → InProgress. | @dev |
| 2026-09-09 | 1.0 | Closed the stable-page diagnostic lifecycle, added T11–T13 cross-page counterproof, recorded exact-SHA PRESYS evidence, and moved the story to InReview. | @dev |
