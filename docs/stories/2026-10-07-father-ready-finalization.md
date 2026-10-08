# Father-ready finalization and release readiness

## Status

Ready for Review. Product Owner validation: acceptance criteria below derive directly from the owner's 2026-10-07 final productization contract and resume contract. Candidate repairs, regression proofs, guides and Storage migration/rehearsal/rollback are prepared. Final exact-head PR CI and independent audit must be bound to the committed candidate before merge authorization. Authorized deployment/readback and the uncoached human pilot remain pending; the compound production acceptance criteria below remain unchecked. This status means the candidate is reviewable, not that Father-ready production acceptance is complete.

## Story

As a nontechnical PRESYS office operator, I want to create, edit, save, reopen, translate, review, publish, and export complex technical catalogs independently, so that I can use Catalog Builder for daily work without losing edits or depending on a developer.

## Authority and scope

- GitHub live repository `avaranda66-oss/catalog-builder-technical` is canonical. Starting main: `a183d67407058545102aaf06efcd7af28cbeb2e7`; recheck before release.
- Isolated branch: `release/father-ready-finalization`. Preserve existing worktrees and legitimate changes.
- Preserve the `catalog-builder-technical` design baseline. Prefer minimal repairs with regressions; no broad rewrite, redesign, speculative schema cleanup, or silent cap increase.
- Fix every observed P0/P1 and Father-facing P2. A release label requires actual production evidence and an uncoached human pilot; historical tests and local adapters cannot substitute.
- Never expose secret values or use a service role as an end-user session. Only @devops pushes or opens the single final PR. No merge without final independent audit and explicit owner authorization in this run.

## Acceptance criteria

- [x] AC01: Reconstruct live main/tree, open PRs, recent CI, deployments, local branches/worktrees, public frontend, Supabase project/functions/source/`verify_jwt`, and secret **names** with durable dated evidence. Recorded in `00-preflight/live-preflight.{json,md}`, inventories and `06-production/live-gateway`; effective budget mode/control-plane enum and final deploy identity limits are explicitly recorded rather than guessed. Release deployment acceptance remains AC14.
- [ ] AC02: Valid active admin/editor can log in, use Library, create blank/template catalog, rename/open/duplicate/archive, refresh and reopen. Anonymous, expired, inactive, viewer, editor, admin, logout and deep-link states retain server authority and truthful distinct UI feedback.
- [ ] AC03: Text/page/object authoring, selection/focus, arrangement/resize, undo/redo, zoom, destructive recovery, navigation and contextual inspector remain understandable and accessible (keyboard, labels, focus, modals) without changing the design baseline.
- [ ] AC04: Table authoring covers 2x2, 5x5, 10x10, 20x10, 50x8 and 100+ rows where supported; row/column operations, multi-cell selection, merge/unmerge, TSV/Excel paste, long text, units/symbols, sizing/equalization, rapid repeats, undo/redo, save/reopen and publication/PDF are proven. Repeated large-row entry has practical ergonomics.
- [ ] AC05: Small, medium realistic and large adversarial technical catalogs exercise multiple pages, dozens of objects, texts, large tables, images, units/symbols, dense/edge-adjacent content and consecutive edits. Record actual counts, document bytes, open/save/reopen timings, interaction fluency and publication/PDF result.
- [ ] AC06: Autosave/manual save and recovery preserve confirmed edits across reload, Library navigation, tab close, rapid concurrent edits, stale result, ambiguous commit, retry/double click, offline/transient backend failure and authority/session loss. UI plainly distinguishes saved/saving/offline/failed/local protection/retry; no silent data loss or wrong-catalog overwrite.
- [ ] AC07: Asset upload/insert/resize/focal behavior/replace/remove, invalid/interrupted upload, supported image shapes/sizes and references survive save/reopen/publication/PDF with clear messages.
- [ ] AC08: Authenticated public frontend reaches the real `vnext-translation-provider` and Gemini; validated response is reviewed, persisted as a new immutable-source copy with correct lineage, found in Library, reopened, edited and published/exported. Verify `GEMINI_API_KEY` presence by name, budget policy, ACTIVE gateway, live source and JWT configuration.
- [ ] AC09: Production-capable large translation uses deterministic sufficiently small batches, complete unique unit coverage, no silent truncation/language mixture, predictable resume/manual retry and comprehensible partial failure, bounded cost/no hidden retry explosion, and final review before copy creation. Prove small/medium/large and PT/ES/EN paths; bounded acceptance is not a permanent product cap.
- [ ] AC10: Publication diagnostics explain and support repairing legitimate documents; preview/PDF match in Chromium/Chrome and Edge for A4, fonts, accents, units, symbols, images, tables, line/page breaks and PT/ES/EN. Exercise an actual repair loop.
- [ ] AC11: Controlled offline/slow/failing requests, 401/403/500-like paths, provider unavailable/rate limits and ambiguous save do not lie, lose work, trap the user or offer invalid actions. Father-facing errors have a useful next action; technical detail stays in sanitized diagnostics.
- [ ] AC12: Security review verifies server secrets, bundle/log hygiene, auth/RLS/RPC/role enforcement, CORS, redirects, relevant input/publication/upload safety and error leakage without weakening authority.
- [ ] AC13: Every substantive repair has appropriate regressions. `git diff --check`, lint, typecheck, focused/full tests, build, Chromium/PDF/P2 and missing Father proofs pass for the final head. CodeRabbit reports no CRITICAL finding when available; independent final audit is documented.
- [ ] AC14: One cohesive final PR reaches OPEN / MERGEABLE / exact-head CI success before requesting merge authorization. After authorized merge, prove canonical main/CI/Vercel public build and changed Edge Function deployment plus live source readback before production acceptance.
- [ ] AC15: Father identity, profile, active status and editor/admin role are operationally verified without recording credentials. After engineering acceptance, record an uncoached nontechnical pilot (login→Library→catalog→text/table/image→save/reopen→translation/review→publication/PDF), observed hesitation/intervention/failure and any bounded remediation/retest.
- [ ] AC16: Deliver a short operator guide, maintainer deployment/account/cost/monitoring/rollback runbook, evidence, complete final report and honest 0–10 scorecard. READY requires all critical categories ≥9, zero known P0/P1 and production + complex catalog + tables + translation + recovery + PDF + actual human pilot.

## Tasks and validation checklist

- [x] Read owner contract, AIOX Constitution and @devops/@po source definitions.
- [x] Create and validate this story before product code changes.
- [ ] Complete live reconstruction in `00-preflight` and production/auth evidence in `06-production`.
- [x] Read relevant history, reproduce human-path findings and classify P0/P1/P2/P3.
- [x] Implement minimal bounded repairs and appropriate regression tests.
- [x] Run small/medium/large datasets and new Father proofs only where coverage is missing; retain explicit local/production limits.
- [ ] Run all mandatory gates on final head and obtain independent audit.
- [ ] Complete single-PR exact-head checks; record release/merge authorization boundary.
- [ ] Complete actual production acceptance, operational identity check and uncoached Father pilot when the owner-provided session/account is available.
- [ ] Deliver guides, rollback/runbook, scorecard, final decision and durable resume handoff for any external blocker.
- [x] Translation remediation: deterministic long-run/oversized-leaf transport fragments; exact canonical reassembly; bounded gateway validation; progress and partial retry UX; source freshness performance; final 515 translation regressions across 15 files and Chromium/Edge controlled-provider proofs.
- [x] Storage remediation prepared/rehearsed: exact live policies reproduced anonymous INSERT/UPDATE; 00026 admits only active authenticated editor/admin; public reads retained, all seven identities retain denied DELETE; secure rollback and idempotence executed in disposable PostgreSQL. Live apply remains pending.
- [x] Auth race regression reproduced/fixed: four account/logout/late-profile cases and existing auth tests passed; production rollout pending.
- [x] Table selection profiling and atomic multi-row insertion implemented with selection/span/history regressions and 110→140 row save/reopen proof. Final publication proof ladder must include any overlap-gate fixture repair.
- [x] Maintainer release/rollback and account-provisioning runbooks written with exact release boundary and no secret values; final release packet/production receipts/pilot remain pending.
- [x] Dependency advisories reviewed for actual runtime applicability. npm audit retains one critical jsPDF aggregate and one moderate DOMPurify aggregate; current calls do not reach the documented vulnerable paths. Independent QA disposition is P2 maintenance debt, documented in `08-release/dependency-reachability.md`; no dependency/lockfile change is claimed.

## Evidence

Durable root: `C:\Users\Usuario\Documents\Codex\2026-10-07\father-ready-finalization\`.
Folders: `00-preflight`, `01-product-audit`, `02-fixes`, `03-tests`, `04-large-catalog`, `05-translation`, `06-production`, `07-father-pilot`, `08-release`, `09-runbooks`.
The implementation team must distinguish live production evidence, local/browser adapter proofs, historical context and blocked checks explicitly.

## Dev notes

Relevant Next.js guides under the resolved `node_modules/next/dist/docs/` must be read before code changes. Existing quality gates and the owner contract govern this work. No secret values belong in evidence, reports, commits or tool output. A legitimate authenticated browser session and a real nontechnical pilot may require owner action; do not manufacture either.

## File List

- `docs/stories/2026-10-07-father-ready-finalization.md` (this story; maintain as repairs land)
- `docs/runbooks/father-ready-maintainer.md` (deployment/readback/cost/monitoring and per-layer secure rollback)
- `docs/runbooks/father-account-provisioning.md` (normal identity/profile/role provisioning, suspension and pilot boundary)
- `docs/runbooks/father-operations-guide.md` (short Portuguese operator steps for editing, saving, review, translation and publication)
- `.github/workflows/quality-gates.yml` (actual Chromium/Edge installation and both new Father proofs)
- `src/stores/useAuthStore.ts` (late profile response cannot affect another account/logout generation)
- `src/vnext/app/CatalogLibrary.tsx` (rename pending does not falsely display creating a catalog)
- `src/vnext/app/bootstrap.tsx` (save-before-Library integration with current authority)
- `src/vnext/app/catalog-navigation.ts` (coalesced acknowledged save before leaving, failure/authority guards)
- `src/vnext/app/save-presentation.ts` (actionable sanitized save phase copy, trusted text-composition guidance retained)
- `tests/stores/father-auth-revalidation.test.ts` (four reproduced stale profile/identity/logout cases)
- `tests/vnext/app/catalog-navigation.test.ts` (dirty save/double click/failure/authority navigation regressions)
- `tests/vnext/app/father-save-presentation.test.ts` (human save copy and raw-detail suppression)
- `tests/vnext/application/w3c-editor-persistence.test.tsx` (updated assertion for actionable local-protection copy)
- `tests/vnext/application/editor-workspace.test.tsx` (disabled bulk-row action explains unfinished cell edit, matching other axis controls)
- `tests/vnext/library/catalog-library-ui.test.tsx` (pending rename preserves truthful create-button label)
- `supabase/migrations/00026_product_image_write_authority.sql` (bounded P0 product-images anonymous write repair; production apply pending)
- `supabase/rollbacks/00026_product_image_write_authority.sql` (secure operational rollback that closes writes and preserves public reads)
- `supabase/rehearsals/00026_product_image_write_authority_rehearsal.sql` (transactional RLS INSERT/UPDATE positive/negative and unchanged denied DELETE fixtures)
- `tests/security/product-image-write-authority.test.ts` (5 migration/rollback/rehearsal regression contracts)
- `src/vnext/app/TranslationReview.tsx` (batch progress and actionable partial-failure/retry presentation)
- `src/vnext/translation/candidate.ts` (source-bounded review of assembled long runs)
- `src/vnext/translation/index.ts` (progress type export)
- `src/vnext/translation/request-preparation.ts` (deterministic transport-only fragmentation preserving technical values)
- `src/vnext/translation/review-coordinator.ts` (generation progress and human error mapping)
- `src/vnext/translation/semantic-leaves.ts` (whitespace-only rich-text inlines remain canonical but are excluded from provider eligibility)
- `src/vnext/translation/service.ts` (fragment assembly and exact-source freshness without repeated leaf hashing)
- `supabase/functions/vnext-translation-provider/index.ts` (4+ digit technical placeholder validation; targeted deployment/readback required after authorized merge)
- `tests/vnext/translation/father-translation-fixture.ts` (small/medium/large realistic authored datasets)
- `tests/vnext/translation/father-translation-batching.test.ts` (batching, identity, source, expansion headroom, bounds, retry and Unicode regressions)
- `tests/vnext/translation/p2-review-target.test.ts` (partial-generation progress/manual resume)
- `tests/vnext/translation/p2-server-gateway-runtime.test.ts` (placeholder cardinality after the 999th value)
- `tests/vnext/translation/translation-dialog.test.tsx` (progress and partial-retry/reload copy)
- `tests/vnext/proof/father-translation-batching-proof.mjs` (Chromium/Edge controlled-provider flow and six dataset measurements)
- `src/vnext/app/EditorWorkspace.tsx` (atomic quantity-based row insertion, text insertion grammar; also root-owned save copy)
- `src/vnext/app/table-grid-overlay.tsx` (one point lookup per immutable table render)
- `src/vnext/editor/table-selection.ts` (indexed selection normalization preserving span closure and identities)
- `src/vnext/application/contracts.ts` (bounded optional 1–100 axis insertion count)
- `src/vnext/application/execute.ts` (atomic multi-axis insertion preserving content/merge/undo metadata)
- `src/vnext/publication/preflight.ts` (actual printable text/table overlap detection with decorative exemptions)
- `src/vnext/app/authoring-diagnostics.tsx` (human overlap explanation)
- `src/vnext/app/layout-diagnostics-projection.ts` (actionable Portuguese/sanitized diagnostic fallback)
- `src/vnext/app/publication-diagnostic-presentation.ts` (actionable printable overlap wording)
- `tests/vnext/editor/table-selection.test.ts` (110×8 selection/navigation and immutable merged resolver regressions)
- `tests/vnext/application/table-axis-actions.test.ts` (30-row atomic insertion, bounds, history and merge coverage)
- `tests/vnext/app/layout-diagnostics-projection.test.ts` (raw English/private detail cannot leak into Father copy)
- `tests/vnext/publication/printable-content-overlap.test.ts` (visible overlap, empty-frame and decorative regression)
- `tests/vnext/proof/father-large-catalog-proof.mjs` (small/medium/large/stress HTTP-adapter Chromium/Edge/PDF proof)
- `tests/vnext/proof/fixtures/father-large-catalog-browser.html` (explicit favicon and standalone proof entry)
- `tests/vnext/proof/fixtures/father-large-catalog-browser.tsx` (real product runtime/session/persistence/publication adapter)
- `tests/vnext/proof/fixtures/father-large-catalog-data.ts` (varied technical 1/3/8-page and 110-row datasets)
- `tests/vnext/proof/editor-table-professional-style-proof.mjs` (durable post-fit geometry/report before unchanged publication assertions)
- `tests/vnext/proof/editor-table-semantic-content-proof.mjs` (durable post-fit semantic publication evidence)
- `tests/vnext/proof/fixtures/w4f2-table-document.ts` (move companion table below the actual fitted main table; preserves gate/assertions)

## Bounded remediation evidence

- Live storage ACLs grant anon INSERT/UPDATE and the two legacy product-images mutation policies constrain only bucket ID; exact metadata snapshot is in `06-production/live-gateway/supabase-authorization.json`.
- Migration 00026 replaces only those two write policies with authenticated active admin/editor authority and retains existing public image reads, bucket metadata, objects and all other storage policies. It adds no product-images path/ownership constraint that the legacy shared bucket never required.
- Focused regressions: 5/5 passed, reconfirmed on resume. Disposable PostgreSQL 18.3 / PGlite 0.5.8 executed the 14 exact live storage policies: reproduced anonymous insertion/overwrite before repair; proved five rejected identities and two allowed identities after repair; proved denied DELETE for all seven, unchanged unrelated policies, idempotent apply/rollback, public read and fixture rollback. Result: `03-tests/storage-policy-runtime/result.json`; resume logs in `03-tests/storage-policy-resume-*.log`.
- Exact live asset get/finalize RPCs reject anonymous access through internal guards before metadata access, despite their existing EXECUTE grants. No broad revoke is required.
- Current VNext uploads use product-assets with non-upsert immutable paths. Legacy product-images upload helpers convert locally; existing remote URLs still need public reads. No bucket/storage redesign or service credential workflow was introduced.
- Production policy remediation has **not** been applied. Independent review and authorized release/deployment remain required; the live P0 remains open until apply + readback + authorized-user smoke.
- The owner-completed normal login enabled genuine production create/autosave/Library/reopen/rename and ES translation/review/copy/save/reopen/refresh on the deployed main. The real saved EN copy was also inspected, reopened/refreshed and found in Library with correct lineage and publication READY. Consolidated receipt: `06-production/live-human-flow.json`. These live receipts remain distinct from local candidate proofs; new repairs are not yet deployed, the production PDF file is unverified, and current-head post-deploy acceptance plus the uncoached Father pilot require their own evidence.

## Dev Agent Record

- Translation evidence: `05-translation/translation-remediation.md` and original receipts are preserved. After final headroom/boundary/blank-run repairs, `03-tests/translation-final-focused.log` records 515/515 tests across 15 files. `03-tests/final-translation-browser-isolated.log` records current Chromium and actual Edge progress/failure/manual resume/review/copy/reopen without page errors. These are controlled-provider/repository proofs and do not claim Gemini/Supabase production acceptance.
- Large translation dataset: 8 pages, 32 top-level objects, 3 tables (two 100×8), one asset reference, 719,388 bytes, 1,635 unique eligible units, 28 bounded sequential batches per language. Browser processing ES 1,193 ms / EN 955 ms; cached replay ES 538 ms / EN 479 ms. No retry provider dispatches and original preserved.
- Production limits/modes and one-attempt center factory retained. Validated completed batches resume within the same foundation session; reload/browser close intentionally restarts the generation, now explicitly explained. No durable translated checkpoint, provider credential handling, routing-policy change or live provider call was added.
- Tables/publication evidence: durable `01-product-audit/tables-assets-publication.md`, `03-tests/tables-assets-publication.log`, four rerun proof JSONs and `04-large-catalog/result.json` plus actual Chromium/Edge PDFs. Large proof: 8 pages,64 objects,8 tables,1472 cells,176 technical rows,one image reused8 times,482075 bytes; exact save/reopen and second-browser reopen passed. Actual overlap blocked, repaired, printed. Poppler rendered all8 Chromium/Edge pages with identical paired PNG hashes and no visible clipping/glyph/table/image defects.
- Table normalization Chromium median improved 110×8 from127.7ms to0.4ms (~319×). Bulk30 rows now one command/Undo/Redo;110→140 rows saved/reopened exactly. Oversized A4 table print remains correctly blocked; automatic table pagination is not implemented or claimed. READY8-page proof uses authored23-row table sections. Controlled HTTP/provider/repository proofs are not Supabase/Gemini production acceptance or a human pilot.
- Resume tables evidence: `01-product-audit/tables-resume-audit.md`. 66/66 focused tests PASS. Style/semantic/export proofs PASS after preserving independent overflow diagnostics for an already infeasible table and minimally repairing genuine companion-table collisions in old fixtures. Final actual UI 2×2/10×10/50×8/110×8 matrix (`04-large-catalog/table-matrix-final/result.json`) passed atomic three-row insertion, two sequential single-row removals with exact undo/redo, TSV, row/column sizing, save and exact reopen. The multi-row selection removal guard is also proven; batch removal is not implemented. 2×2 and 10×10 actual A4 PDFs were rendered/visually checked; 50×8 and 110×8 single A4 tables correctly BLOCKED. Latest 110→140 insertion of 30 rows completed in 2,085.48 ms; prior 2,124.9 ms and concurrent 3,020 ms receipts remain preserved. Default CI retains the existing eight-page/Edge proof and includes the matrix; matrix-only local mode avoided repeating unchanged eight-page rendering.

## Change log

| Date | Change | Agent |
| --- | --- | --- |
| 2026-10-07 | Owner contract mapped to ready-for-development story, scope, release boundaries and acceptance checks | @po / Pax |
| 2026-10-07 | Resume preserved all repairs; File List consolidated, Storage DELETE coverage and maintainer/account runbooks added; pending release boundaries retained | @devops / @data-engineer / @po |
| 2026-10-08 | Candidate marked Ready for Review; final translation and genuine EN receipts consolidated; dependency reachability and exact post-merge Storage API smoke documented without live mutation | @devops / @data-engineer / @po |

## QA results

Independent source review and CodeRabbit completed without candidate P0/P1 or critical/major findings; CodeRabbit's single minor disabled-tooltip issue was repaired and 43 focused tests passed. The strict final full suite after the tooltip repair and final table-matrix proof passed 300 files / 3,560 tests with one preexisting skip in 154.51 s (`03-tests/final-current-tree-test.log`). Current lint/typecheck/build and controlled Chromium/Edge batching proofs passed. Final independent validation must identify the exact PR HEAD and exact-head CI result; Quality Gates explicitly checks out the PR HEAD rather than the synthetic merge ref. Ready for Review does not certify authorized deploy/readback or the human pilot; those remain explicit production acceptance work.
