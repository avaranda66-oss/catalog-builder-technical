# A4.FLOW.R1.3.4 — Ambiguous Page Identity Guard

Status: InReview

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- quality_gate_tools: Vitest domain/store integration, exact-SHA browser counterproof, full local gates, stacked-PR CI

## Story

**As a** final-publication operator,
**I want** duplicate catalog page identifiers to remain fail-closed and unable to authorize page-scoped diagnostic remediation,
**so that** a mutation of one duplicate page cannot erase source-corruption evidence belonging to another.

## Provenance and Scope

- Direct user-authorized Principal Audit follow-up to A4.FLOW.R1.3.3 and immutable PR #10.
- Exact base: `207708e2f75b00322fdc70b8e1c833f9a38ecebe` on `remediation/a4-flow-r1-3-3-source-diagnostic-lifecycle`.
- Branch: `remediation/a4-flow-r1-3-4-ambiguous-page-identity-guard`.
- Worktree: `C:\Users\Usuario\Desktop\CONFIGURATOR PCON\catalog-builder-a4-flow-r1-3-4`.
- Do not modify `main`, PR #10, or prior PRs directly. Do not merge.
- Preserve the R133/R132/R131 and PRESYS guarantees; do not reopen A4 architecture.

## Acceptance Criteria

1. R134-T1 — Two otherwise valid pages with the same `pageId` produce a derived blocking `DUPLICATE_PAGE_ID` preflight issue and `canPublish === false`.
2. R134-T2 — Updating a block on the first duplicate page cannot clear a `MALFORMED_PAGE_BLOCKS` diagnostic originating from the second duplicate page; both corruption blockers remain and publication stays closed.
3. R134-T3 — Page-scoped structural remediation rejects a `pageId` unless it has exactly one match before and after the mutation; no arbitrary first/last match authorizes remediation.
4. R134-T4 — A uniquely identified malformed page still supports factual structural remediation and clears only its `MALFORMED_PAGE_BLOCKS` diagnostic.

## Architectural Invariants

- A unique `pageId` may act as stable identity; a duplicated `pageId` is ambiguous source/document corruption.
- Duplicate identities are never silently regenerated, renamed, or resolved by choosing an arbitrary occurrence.
- Preflight derives `DUPLICATE_PAGE_ID` from the current catalog and fails publication closed.
- Mutation reconciliation requires exactly one matching page before and after before comparing block structure.
- Zero matches after hydration/mutation retain R1.3.3 orphan removal; more than one match cannot prove remediation.
- The page-scoped mechanism may remove only `MALFORMED_PAGE_BLOCKS`.

## Tasks / Subtasks

- [x] Task 1 — Establish the exact isolated baseline and story (AC: 1–4).
  - [x] Create the requested worktree/branch at exact SHA `207708e2f75b00322fdc70b8e1c833f9a38ecebe` without modifying existing worktrees.
  - [x] Confirm the new worktree is clean and load project governance.
- [x] Task 2 — Add and capture factual R134 RED before production changes (AC: 1–4).
  - [x] Add R134-T1..T4 in a focused flow test file.
  - [x] Record the exact pre-fix pass/fail matrix and observed counterexample.
- [x] Task 3 — Implement the minimum ambiguous-identity guard (AC: 1–4).
  - [x] Derive duplicate-page blockers in layout preflight.
  - [x] Require one before/after page match for structural block-delta remediation.
  - [x] Preserve orphan handling and independently prevent ambiguous reconciliation.
- [x] Task 4 — Verify and prepare delivery without merge (AC: 1–4).
  - [x] Run R134, R133, R132, R131, full tests, lint, typecheck, build, and `git diff --check`.
  - [x] Commit code, run official PRESYS against the exact code SHA, and record evidence.
  - [x] Prepare the evidence-only commit and exact stacked-PR handoff for `@devops` execution.

## Dev Notes

- Keep TypeScript strict and use established domain/store boundaries. [Source: `docs/framework/coding-standards.md`]
- No dependency, persistence schema, SQL, ID-generation, or editor-ID workflow change is authorized. [Source: Principal Audit work order A4.FLOW.R1.3.4]
- R1.3.3 currently derives remediation from per-page block deltas and reconciles typed source diagnostics in `src/domain/catalog.schema.ts`, `src/stores/useCatalogStore.ts`, and `src/domain/layout-preflight.ts`; harden only the identity assumption. [Source: `docs/stories/2026-09-08-a4-flow-r1-3-3-source-diagnostic-lifecycle-closure.md#completion-notes-list`]
- This is domain/store publication safety; no Next.js route or API implementation is involved.

## Testing

- Focused RED/GREEN: `tests/flow/a4-flow-r1-3-4-ambiguous-page-identity.test.ts` (R134-T1..T4).
- Regression: R133-T1..T13, R132, and R131.
- Full gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- Browser proof after the code commit: `node tests/browser/presys-a4-physical.mjs`, against the exact code SHA, preserving 12 pages and 105/105 canonical rows for TA-25N, TA-35N, and TA-50N with zero physical/runtime failures.

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled; manual review and all requested local/remote gates remain mandatory.

## Forbidden Scope

- No Presence, Command Core, Undo, Inspector, Tables, SQL, migrations, persistence schema, page-ID generation, ID editor, dependencies, lockfile, `main`, PR #10 mutation, or merge.

## Dev Agent Record

### Agent Model Used

- GPT-5.6 Sol (High)

### Debug Log References

- Factual pre-fix R134 RED at exact base `207708e2f75b00322fdc70b8e1c833f9a38ecebe`: 1 file, 4 tests, 3 failed / 1 passed. T1 lacked `DUPLICATE_PAGE_ID`; T2 removed the second duplicate's `MALFORMED_PAGE_BLOCKS` after `updateBlock` mutated the first duplicate; T3 accepted the ambiguous page ID as remediated; T4 passed.
- Final R134: 1 file / 4 tests passed.
- Focused regression: 4 files / 40 tests passed (R134 4, R133 13, R132 11, R131 12).
- Full suite: 196 files passed; 2,046 tests passed; 1 skipped (2,047 total).
- Lint: passed with 0 errors and 268 pre-existing warnings.
- Typecheck: passed (`tsc --noEmit`).
- Build: passed (`tsc && vite build`; existing chunk-size warning only).
- `git diff --check`: passed; line-ending conversion notices only.
- Code commit: `e2464fd5430048ebfc770c513f0c396fa4b7530a` (`fix(flow): fail closed on ambiguous page identity`).
- Official browser runner: exit 0 against code SHA `e2464fd5430048ebfc770c513f0c396fa4b7530a`.

### Completion Notes List

- `auditLayoutPreflight` derives one blocking `DUPLICATE_PAGE_ID` issue per repeated current page ID, so even otherwise valid duplicate pages cannot publish.
- Structural block-delta remediation now requires exactly one matching page before and exactly one after the transaction. No `.find()` result is authoritative under ambiguous identity.
- `reconcileCatalogSourceDiagnostics` independently permits page-scoped removal only when the final page ID has one match and the diagnostic code is `MALFORMED_PAGE_BLOCKS`; zero matches still remove orphan provenance and duplicate matches stay unresolved.
- No page ID was generated, renamed, migrated, or edited, and no persistence schema or unrelated editor subsystem changed.
- PRESYS retained 12 physical pages and 105/105 canonical rows for each TA-25N, TA-35N, and TA-50N; zero missing rows, duplicate rows, physical failures, blocked canonical catalogs, or runtime editor errors.
- Adversarial browser gates remained true for delayed/failed image readiness, malformed source publication blocking, terminal-section blocking, and runtime-boundary safety.
- Residual risk is intentionally fail-closed: duplicate IDs remain document corruption requiring an out-of-scope repair path; this change prevents publication and diagnostic mis-reconciliation but does not repair IDs.
- Ready for independent Principal Audit; no A4 GO/closure claim is made.

### File List

- `docs/stories/2026-09-09-a4-flow-r1-3-4-ambiguous-page-identity-guard.md`
- `src/domain/catalog.schema.ts`
- `src/domain/layout-preflight.ts`
- `src/stores/useCatalogStore.ts`
- `tests/flow/a4-flow-r1-3-4-ambiguous-page-identity.test.ts`
- `docs/qa/evidence/a4-flow-r1-1/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3/presys-a4-physical.json`
- `docs/qa/evidence/a4-flow-r1-3-2/presys-a4-physical.json`

## QA Results

- Pending independent review.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-09 | 0.1 | Registered the user-authorized R1.3.4 ambiguous page identity counterproof and began implementation. | River (SM) / @dev |
| 2026-09-09 | 1.0 | Added fail-closed duplicate identity guards, closed R134, preserved all regressions, and recorded exact-code-SHA PRESYS evidence. | @dev |
