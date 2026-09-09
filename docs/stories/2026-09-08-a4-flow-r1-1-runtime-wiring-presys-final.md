# A4.FLOW.R1.1 — Complete Runtime Wiring + PRESYS Finalization

Status: Ready for Review

## Executor Assignment

- executor: `@dev`
- quality_gate: `@qa`
- quality_gate_tools: factual RED/GREEN regressions, Vitest/component/store/render integration, browser physical measurement, full local gates, exact-SHA CI and Preview evidence

## Story

**As a** catalog editor and final-publication operator,
**I want** the measured A4 page-flow plan to be the single runtime authority for editor and export,
**so that** table continuations remain editable without duplicating canonical data and no final PRESYS PDF can silently crop, lose, or duplicate technical content.

## Canonical Provenance

- Required `origin/main`: `5ddaaa3a659ee137c72c0f683073f175a76c7303`.
- Required R1 base: `origin/feature/a4-smart-flow-table-pagination-r1` at `19b841b0c758d8d3d54faaebb3eea36ae4567a99`.
- Target branch: `remediation/a4-flow-r1-1-runtime-wiring-presys-final`, created directly from R1.
- Preserve PR #5 and the R1 branch as evidence; do not rewrite, force-push, delete, or merge them.
- Do not push or merge `main`. Open a new PR only after all gates pass; do not merge that PR.

## Acceptance Criteria

### Principal RED matrix

1. R1.1-T1–T3 factually prove that `A4Canvas` and `CleanA4Document` ignore `PageFlowPlan` and omit table slices before remediation.
2. R1.1-T4–T5 and T13 prove that layout preflight is not a fail-closed final-publication gate and that a missing measured plan cannot establish physical safety.
3. R1.1-T6 proves the existing overflow action can target the wrong persisted block.
4. R1.1-T7–T9 prove cover geometry contamination, unsafe missing-measurement fallback, and undercounted fixed table/page chrome.
5. R1.1-T10–T12 prove manual breaks, real Smart/Manual mode, and continuation mutation routing are not operational end to end.
6. R1.1-T14–T15 prove that current PRESYS fit evidence is not physical browser proof and compaction is not operational end to end.
7. Any already-solved finding must be reported with exact code evidence; RED must never be fabricated.

### Domain and render authority

8. Persistence remains one canonical `Catalog -> CatalogPage[] -> ContentBlock -> Table V2 -> row set`; continuation pages are deterministic view projections and never persisted duplicate tables/rows.
9. Measured physical facts feed one deterministic `PageFlowPlan`; one shared render-plan bridge resolves projected pages/blocks to canonical page/block provenance and optional `TablePaginationSlice`.
10. Identical canonical input and measured facts produce an identical converged plan and deterministic virtual IDs without `Date.now()` or `Math.random()` in pure normalization/projection.
11. `ProjectedBlock` carries canonical provenance sufficient for all mutation APIs; editing/deleting/inserting a row from a continuation updates the canonical page/block/row exactly once and replans without persisting projections.
12. Canonical row order is preserved, rows are never split, section-plus-first-child protection and manual breaks remain valid, and every canonical row appears exactly once across slices.
13. Oversized blocks/rows and every vertical hard defect propagate to top-level unresolved state and block final publication.
14. Cover and technical page geometry are separate contracts; a full-page cover is exclusive, logical `210mm x 297mm`, and never becomes standard technical-page capacity.
15. Missing required measurement is pending/missing—not a guessed fit—and fixed page gaps, block chrome, table title/header/borders/legend/continuation notices/footer/padding participate in the physical measurement contract.
16. Browser/editor transforms, zoom, device pixel ratio, and font readiness do not change logical A4 millimeters; the reactive measurement/plan loop converges without persistence/save storms or oscillation.

### Runtime behavior

17. In Smart mode, `A4Canvas` renders projected pages and row slices from the shared render plan; atomic blocks move only when required and splittable tables paginate by rows.
18. `CleanA4Document` consumes the same render plan and slices; editor and export have equal physical page counts, rows per page, and continuation metadata, with no editor controls in export.
19. In Manual mode, persisted page assignment stays visible and overflow diagnostics remain active; no implicit reflow occurs.
20. The UI exposes distinct `Modo de Fluxo: Inteligente | Manual`; `Distribuir Espaço` remains an independent presentation control.
21. Manual table breaks can be created in the editor, are persisted in existing typed/custom presentation metadata without a schema migration, survive reload, and affect editor/export identically.
22. Overflow actions target the actual offending canonical block and expose only valid remedies: move next/previous, auto-paginate table, break before row, and resolve mixed-cover composition as applicable.
23. Manual moves preserve cover composition invariants, page numbering, selection/canonical mutation routing, intentional empty-page behavior, and future undo/history compatibility; no ghost pages are created.
24. Explicit authored page boundaries remain distinct from derived continuation boundaries and are not flattened by Smart Flow.
25. Compaction is either implemented with real measured density candidates above the readability floor and deterministic convergence, or explicitly marked `COMPACTION_DEFERRED` with all operational claims/UI removed.

### Publication safety

26. Existing `auditCatalogPublishSafety()` factual/PIM/sync/CAS checks remain intact and compose with layout safety.
27. Final publication fails closed on: mixed full-page cover, vertical/horizontal overflow, oversized block/row, missing layout measurement/plan, clipped row, row loss, or row duplication.
28. Draft/preview may warn but cannot weaken the final gate; static validity without a current measured plan is never reported as layout-valid.
29. A long unbroken technical value either wraps/normalizes safely or creates a blocking horizontal defect; `overflow-x: hidden` alone is not accepted.

### PRESYS finalization and evidence

30. TA-25N, TA-35N, and TA-50N preserve the exact audited N-family facts from the mission, contain no N/NL/NLL/P/PL/PLL cross-family contamination, and leave every unsupported fact as editable `A COMPLETAR`.
31. Official PRESYS imagery is used only when safely extractable from the provided official source; no hardware or Additel imagery is fabricated. Otherwise report `PRESYS_PRODUCT_ASSET_PENDING` without changing factual content.
32. Each PRESYS cover is exclusive; actual semantic sections are Quick Specs, Electrical/Measurement Inputs, Automation/Connectivity, Main Technical/Metrological Specs, Inserts, Standard Delivery/Accessories, and Ordering Information, with physical page count derived rather than hard-coded.
33. Real browser measurements for every projected PRESYS page prove `scrollHeight <= clientHeight + tolerance` and `scrollWidth <= clientWidth + tolerance`, with no warning, hidden row, clipped bottom text, or clipped right column.
34. For every paginated table, canonical row count and row-ID set equal the rendered slices, with zero duplicate canonical data-row IDs; repeated headers are allowed.
35. Editor page count equals export page count for all three templates and applying each system template succeeds.
36. Browser evidence includes a per-page measurement table and screenshots for the three covers/longest tables, inserts, delivery/accessories, ordering, manual-break demonstration, and Smart Flow demonstration.
37. Dynamic dogfood adds rows, grows a row through long text, and deletes rows in Smart mode with deterministic reflow and no loss; Manual mode warns without silent rearrangement and explicit remediation actions work.
38. Cover exclusivity is verified for system preset, template creation, catalog-from-template, clone/duplicate, and import paths where applicable; historical mixed documents are diagnosed without silent load-time rearrangement.

### Gates, scope, and delivery

39. Tests use the appropriate level: pure planner unit, React projection component, Zustand/store integration, editor/export render integration, real browser physical A4, and Preview E2E smoke.
40. Focused suites and final `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, and strict merge-marker audit pass at branch HEAD with no new changed-file warnings.
41. Scope audits classify every production file in both `R1...HEAD` and `main...HEAD` diffs.
42. There are zero changes to SQL, migrations, RLS, auth, Presence, GitHub governance, Vercel settings, dependencies, package lock, secrets, or live DB.
43. A small number of logical, non-amended commits is pushed only to the remediation branch by `@devops`.
44. A new PR titled `fix(flow): complete A4 runtime pagination and PRESYS catalogs` targets `main`, explicitly supersedes incomplete runtime claims in PR #5, and remains unmerged.
45. Required GitHub checks succeed on the exact final SHA; Vercel Preview is for the same SHA, is not promoted, and passes the specified browser dogfood.
46. Final report follows the mission format and ends with a factual `GO FOR PRINCIPAL AUDIT` or `NO-GO` recommendation.

## Tasks / Subtasks

- [x] Task 1 — Freeze provenance and reproduce R1 findings (AC: 1–7, 40–42).
  - [x] Verify exact remote SHAs and create the remediation branch from R1.
  - [x] Map current planner, renderer, measurement, publication, template, and PDF paths.
  - [x] Add focused factual RED coverage and record baseline results before production edits.
- [x] Task 2 — Establish the deterministic measured render authority (AC: 8–16, 24–25).
  - [x] Correct geometry, missing-measurement, fixed-chrome/gap, unresolved-state, oversized-row, and deterministic-ID contracts.
  - [x] Add canonical provenance and one shared render-plan bridge.
  - [x] Implement a reactive, non-persisted measurement loop with deterministic convergence.
  - [x] Explicitly defer compaction and remove operational claims.
- [x] Task 3 — Wire editor, export, and canonical editing (AC: 11, 17–24).
  - [x] Render shared projected pages/slices in `A4Canvas` and `CleanA4Document`.
  - [x] Route continuation edits/deletes/inserts to canonical store APIs exactly once.
  - [x] Add Smart/Manual UX, persistent manual breaks, and safe actionable overflow controls.
- [x] Task 4 — Compose fail-closed final publication safety (AC: 26–29).
  - [x] Integrate current measured layout safety with existing factual publish safety across every final export/publication entry point.
  - [x] Preserve draft warning behavior and add horizontal/row-conservation blockers.
- [x] Task 5 — Finalize and physically validate PRESYS templates (AC: 30–38).
  - [x] Audit exact TA-25N/35N/50N facts and imagery against official provided source.
  - [x] Validate semantic structure, template application, cover entry points, row conservation, and editor/export parity.
  - [x] Execute local real-browser measurement and dynamic Smart/Manual dogfood with screenshots/evidence.
- [ ] Task 6 — Complete QA and delivery without merge (AC: 39–46).
  - [x] Run focused/full local gates, scope/marker audits, and Principal QA review.
  - [x] Update this story's Dev Agent Record, checklists, File List, Change Log, status, and QA Results.
  - [ ] Create logical commits; delegate push/new PR/CI verification to `@devops`.
  - [ ] Verify exact-SHA Vercel Preview and produce the required final report.

## Dev Notes

- The product is a React 18.3/TypeScript client with Zustand + Immer editor state; preview/export paths must share an immutable snapshot/authority rather than make independent domain decisions. [Source: `package.json`; `docs/architecture/system-architecture.md#visao-geral`; `docs/architecture.md#exportacao-e-publicacao`]
- The approved product baseline is an A4 technical-catalog editor; visual redesign is outside scope. [Source: `docs/briefing.md#contexto`; `docs/framework/coding-standards.md`]
- PDF architecture fixes logical A4 pages at `210mm x 297mm` and requires print/export fidelity without hidden clipping. [Source: `docs/adr-001-brownfield-architecture.md#27-estrategia-de-pdf-com-alta-qualidade-grafica-de-impressao`]
- Strict TypeScript, explicit domain types, pure use cases with isolated adapters, absolute `@/` imports in new modules, and domain/integration tests before visual detail are mandatory. [Source: `docs/framework/coding-standards.md`]
- Existing editor state uses Zustand/Immer; no new dependency or persistence schema is authorized. [Source: `docs/framework/tech-stack.md`; mission scope]
- Prior export work established `document audited == document rendered == document exported` and requires the same immutable confirmed snapshot across publication paths. [Source: `docs/stories/2026-09-06-w2b-rr009-export-snapshot-consistency.md#dev-notes`]
- R1 at `19b841b...` is the only implementation base. Its pure planner, table pagination, cover policy, store moves, and PRESYS source changes must be audited and preserved when correct; claims without runtime evidence must be corrected.
- Project-structure note: current production code is under `src/`, while the generic planned source-tree document names `components/`, `features/`, and `lib/domain/`. This remediation follows the established `src/components`, `src/domain`, `src/services`, `src/stores`, and `tests` layout already present in R1.

## Testing

- Vitest unit tests for deterministic planner/pagination/policy contracts.
- Testing Library component tests for projected React rendering, Smart/Manual UX, slice delivery, export control exclusion, and canonical callback provenance.
- Zustand/store integration tests for continuation mutation, manual break persistence/reload, moves, and replan.
- Editor/export render integration for identical page/slice/row plans.
- Real browser tests for fonts/measurement convergence, logical-mm invariance, A4 vertical/horizontal bounds, covers, dynamic editing, and publication gating.
- Exact-head Vercel Preview smoke/dogfood after local and GitHub gates pass.

## Scope Guard

Forbidden changes:

- `src/services/presence.service.ts`
- `src/stores/usePresenceStore.ts`
- `src/components/editor/CollaboratorPresenceBar.tsx`
- SQL, migrations, RLS, auth, live DB, dependencies, package manifests/lockfiles, GitHub governance, Vercel settings, secrets
- full Undo/Redo/history implementation
- `main`, R1 rewrite/force-push/deletion, PR #5 merge, or remediation PR merge

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled in `.aiox-core/core-config.yaml`; the mission still requires an attempted CLI review when the configured binary is available, with factual reporting if unavailable.

## Dev Agent Record

### Agent Model Used

- GPT-5 Codex.

### Debug Log References

- Provenance gate: `origin/main == 5ddaaa3a659ee137c72c0f683073f175a76c7303`; `origin/feature/a4-smart-flow-table-pagination-r1 == HEAD == 19b841b0c758d8d3d54faaebb3eea36ae4567a99` before branch creation.
- Interruption recovery: 29 initial `git status --short` entries were recovered in place; all valuable uncommitted changes were preserved and no work was lost.
- Factual RED: the 15-case R1.1 contract suite failed 15/15 before production remediation; the same suite passed 15/15 afterward.
- Focused final suite: 8 files, 78/78 tests passed.
- Full Vitest: 190 files passed; 1,983 passed, 1 skipped, 0 failed, 1,984 total.
- Physical evidence: `docs/qa/evidence/a4-flow-r1-1/presys-a4-physical.json` plus 11 browser screenshots.
- Local gates: lint 0 errors/268 warnings (pre-existing baseline warnings; no warning introduced on added/changed lines), typecheck PASS, build PASS, diff-check PASS, strict marker audit PASS.

### Completion Notes List

- `A4Canvas` and `CleanA4Document` now consume one measured `A4RenderPlan`; table projections carry the same canonical page/block provenance and `TablePaginationSlice`.
- Continuations remain view projections only. Store/component integration proves an edit from a continuation updates one canonical row exactly once and no projected table is persisted.
- Smart mode paginates deterministically; Manual mode retains authored assignment, reports real blockers, and persists row breaks through schema serialization/reload.
- Final export/publication composes existing factual/sync safety with measured layout preflight and fails closed for all nine required physical defect codes, including missing measurement.
- Real Chromium measured all three PRESYS catalogs at 12 physical pages each, maximum vertical/horizontal overflow 0 px, 105/105 rows rendered, no missing/duplicate/clipped rows, and exclusive 794 x 1123 px full-page covers.
- Dynamic dogfood grew 12 -> 13 pages after row insertion, reflowed deterministically after long-cell growth, and returned 13 -> 12 after deletion. Manual overflow remained blocked without silent rearrangement and an explicit row break changed the projection while conserving rows.
- TA-25N uses an authentic product image extracted from the official PRESYS PDF. TA-35N and TA-50N remain `PRESYS_PRODUCT_ASSET_PENDING`; no model image was fabricated or reused deceptively.
- `COMPACTION_DEFERRED`: pagination is the safe R1.1 behavior and no non-operational compaction action is exposed.
- R1-to-working-tree and canonical-main-to-working-tree audits found only A4 flow, rendering/export, publication preflight, PRESYS, tests, story, and evidence changes. No forbidden Presence, auth, SQL/RLS/migration, dependency/lockfile, GitHub/Vercel, secret, or live-DB change exists.

### File List

- Runtime authority: `src/domain/a4-render-plan.ts`, `src/domain/page-flow-planner.ts`, `src/domain/table-core/table.pagination.ts`, `src/domain/layout-preflight.ts`, `src/domain/page-composition-policy.ts`, `src/domain/catalog.schema.ts`.
- Measurement: `src/components/a4/a4-layout-measurement.ts`, `src/components/a4/useMeasuredA4RenderPlan.ts`.
- Editor: `src/components/editor/A4Canvas.tsx`, `src/components/editor/blocks/CustomTableBlock.tsx`, `src/components/editor/blocks/TechnicalTableBlock.tsx`, `src/components/editor/table-core/TableCoreRenderer.tsx`, `src/components/technical-table/TechnicalTable.tsx`, `src/stores/useCatalogStore.ts`.
- Export/publication: `src/components/export/CleanA4Document.tsx`, `src/components/export/PrintDocumentView.tsx`, `src/components/editor/ExportPDFModal.tsx`, `src/components/publications/PublicationsView.tsx`, `src/services/pdf.service.ts`.
- PRESYS: `src/data/presys-technical-catalogs.ts`, `public/assets/presys/ta-25n-official.jpg`.
- Browser proof surface: `src/main.tsx`, `src/labs/a4-physical-proof/A4PhysicalProofPage.tsx`, `tests/browser/presys-a4-physical.mjs`.
- Tests: `tests/flow/a4-runtime-wiring-r1-1.test.tsx`, `tests/flow/a4-runtime-store-integration-r1-1.test.tsx`, `tests/flow/page-flow-stability-editing.test.ts`, `tests/integration/export-snapshot-version-consistency-rr009.test.tsx`, `tests/services/pdf-service-rr009.test.ts`.
- Evidence: `docs/qa/evidence/a4-flow-r1-1/` (one JSON measurement record and 11 PNG screenshots).
- Story/QA: `docs/stories/2026-09-08-a4-flow-r1-1-runtime-wiring-presys-final.md`, `docs/qa/gates/a4-flow-r1-1-runtime-wiring-presys-final.yml`.

## QA Results

- Principal QA local gate: PASS, score 100, no open issues or acceptance gaps.
- Static Chromium acceptance: TA-25N, TA-35N, and TA-50N each render 12 physical pages at 0 px/0 mm vertical overflow and 0 px horizontal overflow; each conserves 105/105 canonical rows with zero missing, duplicate, bottom-clipped, or right-clipped content.
- Dynamic Smart Flow: PASS. Manual Flow: PASS (intentional overflow remains fail-closed until explicitly remedied). Final publication gate: PASS. Compaction: DEFERRED.
- Remaining delivery-only evidence at this story revision: exact-head GitHub checks and Vercel Preview smoke after branch publication/PR creation.

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-08 | 0.1 | Registered the user-authorized R1.1 remediation with exact provenance, factual RED matrix, runtime/layout authority, PRESYS physical acceptance, scope guards, and no-merge delivery contract. | River (SM) |
| 2026-09-08 | 0.2 | Story draft checklist passed and status advanced to Approved for autonomous implementation. | River (SM) |
| 2026-09-08 | 1.0 | Completed shared measured runtime wiring, fail-closed publication safety, PRESYS factual/asset finalization, real Chromium physical proof, dynamic Smart/Manual dogfood, and all local quality gates; advanced to Ready for Review pending remote CI/Preview evidence. | Dex / Quinn |
