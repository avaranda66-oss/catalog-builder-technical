# P1.C — Product coherence and office-user presentation

## Status: Ready for Review

## Story

As a PRESYS employee, I want a clear, coherent catalog library and editing experience,
so that I can create, edit, translate and review a professional catalog without learning implementation terminology.

## Frozen contract

- Repository: `avaranda66-oss/catalog-builder-technical`.
- Base: `c17851f6aa3a03f3e051a431dd2b3d7e8c9e1641`.
- Base tree: `8823bec5eba68676c2ae2166c08e713f462cc96f`.
- Branch: `codex/p1c-product-coherence`.
- Worktree: `C:\Users\Usuario\.codex\worktrees\p1c-product-coherence\catalog-builder`.
- P1.A / PR #61 and P1.B / PR #62 are canonical and remain closed.
- Scope is product presentation only. Father Pilot and P2 remain paused.

## Context and verified BEFORE findings

Source: the user's 2026-10-02 autonomous productization request, canonical P1.A/P1.B stories,
and the actual browser audit completed before product edits.

1. Library places four prominent actions on each catalog row, which competes with the normal open task.
2. Create options have equal priority; wording about an independent copy explains internals instead of the next user task.
3. The empty inspector talks about geometry before the user has selected anything.
4. Selected tables show unstyled native title controls with tight label/button spacing.
5. Existing table disclosures are visually calm, but do not explain which capabilities they reveal.
6. Login uses a different product name and visual treatment. Its BEFORE proof must include the actual `index.css`.

The baseline navy identity, document/canvas dominance and existing capability inventory are retained.
The read-only TA-35N workflow observations inform discoverability and diagnostic language only;
no laboratory source or document is promoted into this branch.

## Acceptance criteria

- [x] AC1 — A single reusable presentation token block defines app surfaces, text, borders, radii, spacing, focus and semantic status colors; ordinary controls and dialog shells use coherent scoped primitives. Renderer and canvas document styles are unaffected.
- [x] AC2 — Library clearly shows catalog title, readable locale, last update and translated-copy lineage without visible internal IDs. Opening a catalog is the primary row task; Duplicate, Rename and Archive remain reachable with their historical action names and behavior.
- [x] AC3 — Create retains Blank, Ficha técnica essencial and PRESYS TA-25N with unchanged starter semantics. Ficha técnica essencial is visually recommended; descriptions explain editable outcomes without starter-engine terminology.
- [x] AC4 — Workspace title/save feedback, empty inspector, contextual headings and table title/content controls have calm hierarchy and consistent form styling. Advanced controls explain what they contain while remaining collapsed initially.
- [x] AC5 — P1.A/P1.B simple-mode defaults, selected-object behavior and disclosure reset on page/object context changes remain unchanged. Technical fixtures retain historical labels/capability surfaces.
- [x] AC6 — Translation dialog/review clearly distinguishes source and target language, progress, review fields and its primary action. Existing Spanish-only/provider/copy/review/cancel semantics remain unchanged; errors identify a usable next step.
- [x] AC7 — Publication presents checking, ready and blocked states, human-readable problem location and correction guidance. Exact diagnostic code and original technical detail remain available in collapsed disclosure. Fail-closed printing/publication and source authority remain unchanged.
- [x] AC8 — Login, Library loading/empty/search-empty/archive/error/confirmation, create pending, save pending/success/error, missing-image, translation and publication states feel like the same app. Failures explain what happened and the next action without claiming successful remote persistence prematurely.
- [x] AC9 — At 1600-ish, 1280-ish and 820 px, no global horizontal overflow occurs and the document remains dominant. Keyboard names/order, focus-visible, modal focus trapping/restore, Escape, aria-expanded and clear disabled states are preserved or improved.
- [x] AC10 — Dedicated Chromium product proof covers Library → create/open → Workspace → Text → Image → Table → advanced disclosure → Translation dialog/review → Publication dialog → Library, with representative BEFORE/AFTER screenshots visually reviewed.
- [x] AC11 — Focused tests, full suite, lint, typecheck, build and every historical Chromium/PDF proof pass. Historical proofs are not removed, reordered, weakened or skipped. Adversarial product/code review leaves no unresolved HIGH/CRITICAL issue.
- [ ] AC12 — Promotion uses conditional delegated squash authority only after exact-head CI success and immediate base/head/tree verification. P1.C becomes canonical only after the exact post-merge Quality Gate succeeds; fresh screenshots then support decision A or one concrete bounded remediation B.

## Implementation tasks

- [x] Read the constitution, UX/PO guidance and canonical P1.A/P1.B stories.
- [x] Inspect app primitives, integration points and historical proof inventory.
- [x] Inspect current product in browser and capture BEFORE evidence before product mutation.
- [x] Freeze the bounded contract from verified visual findings.
- [x] Normalize shared scoped styles/tokens and button/form/dialog/status/focus primitives.
- [x] Quiet Library secondary actions; clarify Library/create copy and recommendation.
- [x] Refine Workspace/inspector and Login presentation without behavior changes.
- [x] Refine Translation and Publication presentation, diagnostics and review readability.
- [x] Add focused tests where behavior or visible contracts require verification.
- [x] Add dedicated P1.C Chromium proof and append it to the existing Quality Gate.
- [x] Visually compare BEFORE/AFTER, including responsive and keyboard states.
- [x] Run required local gates and all historical proofs.
- [x] Complete adversarial UX/code review and keep this checklist/file list current.
- [ ] Commit, push, create PR and verify exact-head Quality Gate.
- [ ] Revalidate base/head/tree, squash merge when all delegated conditions hold, then verify exact post-merge gate.
- [ ] Fresh canonical screenshot audit and explicit P1 decision A/B.

## Dev technical guidance and ownership

Existing app is React/Vite. Reuse current components and data attributes; add no framework or dependencies.
Shared CSS is scoped to app shells, inspector controls and dialogs so canonical renderer measurements are isolated.
P1.C does not change action/service/runtime implementations, document contracts or persistence behavior.

- UX/PO: this story; `CatalogLibrary.tsx`; shared `styles.css`.
- Root implementation: `EditorWorkspace.tsx`; `LoginView.tsx`.
- Dialog implementation: `TranslationReview.tsx`; `PublicationReview.tsx`.
- QA/DevOps: proof, focused regression tests, historical verification and promotion.

Library keeps actions directly reachable with historical names; visual styling supplies hierarchy.
Semantic table controls receive scoped styling only. Disclosure toggles must not mutate the document.
The created/translated/publication states must continue to reflect existing coordinator results.

## Quality review / CodeRabbit integration

- Type: Frontend presentation / accessibility; complexity medium; risk medium.
- Integration points: Login, Library/starter chooser, workspace/inspector, translation review, publication review, proof/CI.
- Agents: @dev and @ux-design-expert implement; @qa reviews; @devops owns remote promotion.
- [x] Pre-commit: focused accessibility/workflow tests and adversarial diff review.
- [x] Pre-PR: visual consistency and existing-flow regression review; run CodeRabbit when available and record its result or availability explicitly.
- [ ] Promotion: no unresolved HIGH/CRITICAL; exact-head and post-merge Quality Gate success.

## Risks and rollback

- Broad CSS can change rendered geometry: scope selectors to app UI and verify historical Chromium/PDF proofs.
- Form/button styling can break small layouts: min-width constraints, wrapping and 820/1280/1600 visual proof.
- Disclosure edits can regress context reset: preserve existing state/effect logic and P1.B proof.
- Human diagnostics can conceal useful evidence: retain exact code/details in technical disclosure; verification logic remains unchanged.
- Rollback is a Git revert of this isolated presentation commit/PR; no data migration or persisted contract changes are introduced.

## Hard boundaries

No database schema, migration, SQL, RLS, auth architecture, Recovery/L1, persistence/CAS,
renderer authority, table engine, asset engine, translation provider/semantic engine,
publication engine or dependency changes. No detached/dirty laboratory base. No TA-35N cherry-pick,
merge or wholesale copy. No new automation engine. No P2 code in this branch.

## File list

Created:
- `docs/stories/2026-10-02-p1c-product-coherence.md`
- `src/vnext/app/product-primitives.css`
- `src/vnext/app/publication-diagnostic-presentation.ts`
- `tests/vnext/proof/productization-p1c-product-coherence-proof.mjs`
- `tests/vnext/publication/publication-presentation.test.ts`
- `tests/vnext/translation/translation-dialog.test.tsx`

Modified:
- `src/App.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/app/CatalogLibrary.tsx`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/components/auth/LoginView.tsx`
- `src/vnext/app/TranslationReview.tsx`
- `src/vnext/app/PublicationReview.tsx`
- `src/vnext/app/VNextApp.tsx`
- `tests/components/auth-gate.test.tsx`
- `tests/vnext/application/editor-workspace.test.tsx`
- `tests/vnext/proof/pilot-b-access-entry-proof.mjs`
- `tests/vnext/publication/publication-dialog.test.tsx`
- `.github/workflows/quality-gates.yml`

## Evidence / results

BEFORE audit: dedicated P1.C Chromium proof PASS at 1600/1280/820 with 84 captures in
`scratch/p1c-product-coherence-proof/before/` and a result record. The controlled transport
exercises the real bootstrap/product UI; it does not claim production Supabase E2E.
P1.C AFTER Chromium proof PASS at all three required widths, with evidence in
`scratch/p1c-product-coherence-proof/after/result.json`. It covers the production bootstrap
through a controlled transport, not production Supabase E2E.

Focused Library verification: 13 tests PASS (`catalog-library-ui` and `catalog-library-open-recovery`).
Root's focused workspace/auth verification: 45 tests PASS. Dialog presentation and historical
entry-focused verification: 24 tests PASS. The final frozen-product local gates all PASS in
`scratch/p1c-final-gates.json`: typecheck; lint with 0 errors and 268 warnings; full suite with
289 files, 3091 passing tests and 1 skipped test; build. Build retains its existing large-chunk
warning. Logs are `scratch/p1c-final-{typecheck,lint,test,build}.log`.

All 31 historical Chromium/PDF proofs PASS, each with exit code 0, recorded in
`scratch/p1c-historical/results.json`. The historical ladder remains present and ordered in CI;
the dedicated P1.C proof is appended after P1.B without replacing any historical proof.

Adversarial visual review viewed actual saved screenshots across 1600/1280/820, including
BEFORE/AFTER Library, create, table controls, canvas, translation and Login, plus text/image,
advanced table, publication blocked/technical details, save/error/empty/loading and confirmation states.
No material visible product problem requiring a further P1 wave was found in those reviewed screens.
The centered 820 canvas materially improves the formerly small left-aligned preview.

Final proof recapture verifies the primitive button specificity against `index.css`, Login heading
weight, and correctly painted 1600 Library/create headers. The earlier blank header strip was
capture timing. The final AFTER record contains 119 captures at 1600/1280/820, 114 recorded
global bounds checks with no overflow, and 69 header raster checks with nonzero brand pixels.
Console, page, resource and request errors are empty. The proof uses Chromium 151.0.7922.34.

Final adversarial visual review opened the refreshed 1600 Library/translated-copy, create and
workspace images; the 820 scrolled text properties, image controls, table title and advanced
table controls; and 820 Login, translation review/error and publication ready/blocked images.
The document remains dominant; secondary Library actions are quieter and reachable; advanced
controls remain discoverable through named disclosures; dialogs share clear heading, form,
status and action hierarchy. The 820 inspector remains usable after scrolling. No unresolved
HIGH/CRITICAL presentation issue or concrete material defect requiring another P1 wave was
found. Final independent @qa adversarial review of the complete product/test/CI/helper diff
is PASS with no unresolved HIGH/CRITICAL issue and no engine, auth, CAS or dependency boundary
violation. AC1–AC11 are supported by the completed product proof, focused/full tests, local gates,
historical ladder and visual/code reviews.

CodeRabbit local CLI was authenticated but could not review this managed Windows worktree from
WSL because its `.git` location was not discoverable there. This is an availability limitation,
not a CodeRabbit approval. @devops will attempt remote review after push and record its exact
result or limitation in the PR/external handoff before deciding promotion.

Historical proof maintenance: `pilot-b-access-entry-proof.mjs` changes only three expected visible
Login heading literals from `PRESYS Catalog Studio` to `Acesse seus catálogos`. Its strict heading
wait/count checks and all authorization, routing, Library/editor exclusion, logout/return/refresh
assertions remain intact; no assertion or coverage was removed or weakened.

Provisional product decision: A, subject to exact-head CI, merge,
post-merge green and the required fresh canonical screenshot audit. No canonical claim is made here.
Implementation, focused/local gates, dedicated Chromium proof and the historical proof ladder
and independent QA review are complete. Remote CodeRabbit disposition, exact commit/tree, PR, exact-head CI,
squash merge and post-merge gate remain pending. AC12 and canonical closure are recorded in
the final handoff only after that evidence exists; this feature-tree story is not rewritten after merge.
