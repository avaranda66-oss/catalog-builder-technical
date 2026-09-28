# W4.G — Wave 4 Integration / Stabilization / Closeout

Status: **IMPLEMENTED / UNDER REVIEW**

Date: 2026-09-27

## Canonical starting provenance

- Repository: avaranda66-oss/catalog-builder-technical
- Canonical base: 25e577587a1713cb93dfcdc41a6ba13d378fdd2f
- Canonical tree: 2a23c91e3b1a2657c326eca8d31f796b76bfb724
- Previous canonical slice: W4.F.5 — COMPLETE / CANONICAL
- PR #50: MERGED
- Post-merge Quality Gate 36330907923: COMPLETED / SUCCESS
- Starting test baseline: 270 files / 2886 passed / 1 skipped / 0 failed

GitHub live was revalidated before branch/worktree creation. No W4.G branch, PR, or worktree existed.

## Mission and scope

W4.G is a closeout wave, not a new feature family. Its purpose is integrated evidence and stabilization of already-canonical Wave 4 behavior.

The implementation adds no new product semantics, domain fields, Application action family, persistence protocol, history model, renderer semantics, schema version, migration, or Supabase migration.

Primary implementation state:
- branch: feat/vnext-w4g-wave4-closeout
- worktree: C:\tmp\catalog-builder-technical-w4g
- dedicated proof: tests/vnext/proof/editor-w4-wave4-closeout-proof.mjs
- controlled fixture: tests/vnext/proof/fixtures/w4g-wave4-closeout-browser.html and .tsx
## Explicit exclusions

No professional Page management, thumbnails, page naming, new Page panel, zoom/pan system, professional Text/RichText editor, Text presets, Shape/Line professional styling, Format Painter, Paste Special, context-menu authority, bulk locking, Group resize/drill-down, automatic ungroup, pagination, Table splitting, automatic Fit, translation, AI, PIM, Realtime, Presence, CRDT, publication artifact sharing, new Components system, new Catalog Template architecture, W5, W6, W7, migration, production deploy, or merge.

The durable PROJECT-STATE / PRINCIPAL-HANDOFF / PRINCIPAL-AUDITOR-HANDOFF files remain intentionally unchanged for the separate post-W4.G governance gate.

## Integrated Father journey

One real Chromium workflow uses the actual VNextApp, EditorWorkspace, DocumentSession, Application Actions, VNextPersistenceRuntime, controlled CatalogRepository, AssetPersistenceBridge seam, DocumentRenderer, publication diagnostics, native Chromium PDF, and PDF.js.

Representative integrated path:
1. select the canonical Table and observe a real TABLE_CONTENT_OVERFLOW diagnostic;
2. enter the real Table Grid and verify measured Cell geometry;
3. induce an existing fixed-row overflow through W4.F.1 controls, use the canonical W4.E `Localizar` diagnostic action from Table mode with zero history, then restore the row height;
4. insert an axis through existing W4.A UI;
5. edit a W4.B Cell through ephemeral draft then canonical commit;
6. merge then unmerge an eligible W4.C range;
7. apply W4.D TSV bulk paste and existing Marker/Legend assignment;
8. change an existing W4.F.1 Row semantic property;
9. apply an existing W4.F.2 Table preset;
10. author a W4.F.3 Table title;
11. invoke explicit W4.E Ajustar altura;
12. exercise W4.F.4 standalone Image fit/focal authoring;
13. exercise W4.F.5 modifier-free multi-selection, alignment, lock and unlock;
14. verify Undo/Redo boundaries;
15. Save through the persistence runtime, open another catalog, and reopen the original;
16. verify canonical authored state;
17. render publication, run diagnostics, generate native A4 PDF, and inspect with PDF.js.
## Controlled evidence boundary

The closeout uses deterministic controlled persistence, not production Supabase E2E.

The controlled repository still exercises:
- VNextPersistenceRuntime
- SaveCoordinator
- CanonicalReopenCoordinator
- DocumentSession
- canonical Application Actions
- AssetPersistenceBridge resolution seam

The proof reports controlledPersistence=true and productionSupabaseE2E=false.

## Assets

The integrated document reuses the canonical W4.F.3 immutable AssetRef. The standalone Image uses that same canonical asset identity.

The fixture installs only the runtime URL/state outside CatalogDocument. Publication reuses the already-resolved AssetPersistenceBridge seam and waits for the real rendered image decode before canonical measurement. After Save/reopen the proof asserts the standalone Image still references the canonical immutable `asset-ta25n` AssetRef (`repo-616332d` plus the canonical SHA-256) and asserts that no blob URL, controlled runtime asset URL, or URL-bearing field was serialized into CatalogDocument.

## Publication / PDF

After reopen, the same canonical document is rendered through DocumentRenderer.

The proof requires:
- zero publication ERROR diagnostics;
- zero editor action/grid chrome inside publication;
- authored Table title visible;
- Image painting present in the PDF operator stream;
- one native A4 page with approximately 210 × 297 mm dimensions;
- CatalogDocument unchanged by publication and PDF generation.

## Mobile and accessibility sanity

Substantive touch closeout coverage runs at:
- 320 × 900
- 360 × 900
- 390 × 900

Each width proves no document/body horizontal overflow, reachable Table controls, explicit Fit Height, modifier-free multi-selection, lock/unlock, Save, Undo and Redo.

This is delivered-flow accessibility sanity, not a formal WCAG certification. The proof exercises native semantic buttons, aria-pressed state, keyboard Table/Cell editing, escapable Table mode, and touch flows.
## Integration defects discovered

No canonical product defect was discovered.

Two early proof assumptions were corrected without product changes:
- TABLE_CONTENT_OVERFLOW exposes the canonical Fit Height action but not a Locate control on that diagnostic row; the proof now observes the diagnostic and enters Table Grid through the existing Editar tabela UI.
- after leaving Table Grid the Table remains selected by design; the mobile multiselect proof now explicitly clears selection before arming modifier-free multi-selection.

A controlled fixture asset-integrity mismatch was also removed from the proof harness: publication now uses the AssetPersistenceBridge-resolved runtime asset already installed in workspace and waits for rendered image decode instead of invoking integrity verification against synthetic fixture bytes.

These are proof/fixture corrections only and do not change product semantics.

## Dedicated Chromium closeout proof

Frozen success token:

W4.G Wave 4 Closeout Chromium proof: PASS

Local proof result before Quality Gate wiring:
- Chromium 151.0.7922.34
- W4.A through W4.F.5 representative coverage: PASS
- Undo/Redo: PASS
- Save/reopen: PASS
- publication/preflight: PASS
- native PDF/PDF.js: PASS
- mobile 320/360/390: PASS
- accessibility sanity: PASS
- consoleErrors: []
- pageErrors: []
- failedResources: []
- requestFailures: []

## Quality Gate

After the dedicated proof became locally stable, the existing VNext Chromium and PDF proofs stage was appended with exactly:

node tests/vnext/proof/editor-w4-wave4-closeout-proof.mjs

It is appended after the W4.F.5 proof. No historical proof was removed, reordered, weakened, or skipped.

## Promotion state

W4.G remains **IMPLEMENTED / UNDER REVIEW** only.

It is not audited, merge authorized, complete, or canonical.

Do not merge. Do not start W5, W6, or W7. The next actor after final exact-head CI is the independent W4.G closeout adversarial auditor.

## Full local gates

Final local validation before commit:
- lint: PASS — 0 errors / 268 repository-baseline warnings
- typecheck: PASS
- full tests: 270 / 270 test files PASS
- tests: 2886 passed / 1 skipped / 0 failed
- build: PASS
- dedicated W4.G Chromium/PDF proof: PASS
- git diff --check: PASS

No focused product regression was added because no canonical product defect was discovered and no production source file changed.
