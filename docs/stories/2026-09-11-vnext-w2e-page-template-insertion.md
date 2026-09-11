# VNext W2.E - Page Template Insertion Seam

Status: Ready for Review
Date: 2026-09-11
Base SHA: c220ed1d047d862d8bac30bb8c20702889793fac
Base tree: 9c018983f2636f318c9092605ca660d33f1bd6f7
Branch: feat/vnext-w2e-page-template-insertion
PR: #22 — https://github.com/avaranda66-oss/catalog-builder-technical/pull/22

## Goal

Implement W2.E only: treat a page template as a typed instantiation source that resolves through an injected registry and materializes once into an ordinary canonical Page containing ordinary canonical Objects with fresh identities.

## Provenance

GitHub and origin/main independently report PR #21 merged as squash commit c220ed1d047d862d8bac30bb8c20702889793fac, tree 9c018983f2636f318c9092605ca660d33f1bd6f7, with direct parent 467942edc14a563a44533edba473b1493bade1e6. This exact W2.D merge result is the W2.E implementation base.

## Acceptance Criteria

- PageTemplateDefinition is small, strict, runtime-validated, contains no page ID, uses canonical serialized Frame geometry in millimetres, optional explicit Page.safeArea, and reuses ObjectInstantiationSeed semantics.
- PageTemplateRegistry is typed, injected into application execution/session construction, deterministic, validates definitions at construction, rejects duplicate IDs, and has no global singleton/network/Zustand/Supabase/realtime authority.
- page.template.insert accepts only templateId and optional afterPageId; omission inserts at the end and a supplied page inserts immediately after it.
- Template validation, target-page resolution, object geometry, Image/Icon assets, and Table validation happen before materialization.
- Materialization reuses the W2.B allocator/remapping machinery, reserves document plus seed identities before generation, creates a fresh Page ID and fresh canonical object/Table identities, preserves Table internal references, and keeps RichText identity local to each RichText.
- Template AssetRefs are preserved and shared; W2.E creates no assets.
- Inserting the same template twice yields fully independent Page/Object/Table/RichText instances with no live template link.
- metadata.createdIds contains the new Page ID plus canonical structural IDs created on that Page, excluding shared Asset IDs and RichText-local IDs.
- A failed insertion is atomic: document/history/listener state does not change.
- One successful insertion is one Undo step; Redo restores the exact prior snapshot and IDs without registry lookup or allocator calls.
- Registry mutation/removal after insertion does not affect the materialized document or later Undo/Redo.
- /v2 exposes one minimal "Inserir modelo" seam, activates the inserted Page on success, and normal W2.C move/resize plus W2.D snapping/diagnostics continue to work on inserted objects.
- DocumentRenderer/publication receive only canonical Page/Object data and acquire no template-specific knowledge or metadata.
- One representative fixture covers Text, Shape, Image and Table, including span/coveredBy, annotations, legend, marker legendEntryId and RichText, with an explicit 12 mm safeArea.
- Adversarial tests cover missing/malformed templates and assets, table cell image assets, target-page failures, repeated insertion including 100x identity reuse detection, atomic history, ordinary object actions, diagnostics, compilation, renderer/publication independence.
- Chromium proof covers insertion, activation, Text/Shape/Image/Table visibility, move, snap, resize, atomic Undo/Redo exact identity, zero console/page errors, no Legacy bootstrap, and no template editor chrome inside [data-editorial-root].

## Tasks

- [x] Add typed template definition/validation and injected static registry.
- [x] Reuse/generalize W2.B instantiation helpers for whole-page fresh-ID materialization.
- [x] Add strict page.template.insert action with validation, atomicity, createdIds, and asset/table checks.
- [x] Wire registry dependency through session construction without changing ApplicationExecutionContext.
- [x] Add one representative application/demo template fixture with explicit 12 mm safeArea and existing VNext-local AssetRef ownership.
- [x] Add minimal /v2 "Inserir modelo" control and activate the created Page after success.
- [x] Add focused/adversarial application tests including same-template-twice and 100x identity proof.
- [x] Prove W2.C move/resize and W2.D snapping/diagnostics on inserted content.
- [x] Prove renderer/publication independence and compilePlans acceptance.
- [x] Add and run W2.E Chromium proof plus W2.C/W2.D Chromium regressions and export/PDF proof.
- [x] Run diff check, lint, typecheck, full tests, build, and scope audit.
- [x] Create the real PR without merging, then update durable PROJECT-STATE and PRINCIPAL-HANDOFF with its branch/base/PR facts.

## Identity model

The existing W2.B IdAllocator, ObjectInstantiationSeed, RichText fresh-ID helper, Table remapping helper, reservation identities, and canonicalObjectIdentityIds remain the authority. W2.E may expose the smallest additional helper needed to materialize a full Page, but it must not duplicate the allocator or Table remapping algorithm and must not globalize RichText-local identity.

## Asset policy

Templates may reference canonical assets already owned by the document/demo environment. Root Image/Icon references and Table image-cell references preserve assetId. W2.E creates no AssetRef and no asset-library authority.

## Undo/Redo and registry independence

Template resolution and materialization happen only during the original action. Session history stores the canonical document snapshot. Undo removes the inserted Page as one step and Redo restores the exact snapshot without consulting the registry or generating identities.

## Deferred W2.F+

Group, reusable components/blocks, direct text editing, persistence, translation, AI, template marketplace/library UX, live-linked templates, special renderers, Supabase template backend, and realtime remain out of scope.

## Dev Agent Record

### Debug Log References

- Provenance gate verified against GitHub and origin/main before branch creation.

### Completion Notes

- Added strict PageTemplateDefinition runtime parsing over the existing ObjectInstantiationSeed semantics. Root object IDs and arbitrary document payload are rejected; canonical Frame millimetres are the only template geometry.
- Added injected PageTemplateRegistry with deterministic get/list behavior, duplicate-ID rejection, definition validation, immutable parsed definitions, and runtime revalidation at the action boundary.
- Added page.template.insert with TEMPLATE_NOT_FOUND, strict action input, target-page resolution, root Image/Icon asset checks, canonical validateTable coverage including image CellContent, and fail-closed registry identity checks before ID generation.
- Added instantiatePageWithFreshIds using the existing W2.B IdAllocator, Table remapper, RichText remapper, reservation identities, and canonical structural identity contract. No second allocator or Table remapping algorithm was introduced.
- The representative app fixture uses explicit 12 mm Page.safeArea, Text/Shape/Image/Table, span/coveredBy, annotations, legend, marker legendEntryId, RichText, and the existing w2c-demo-ta25n AssetRef.
- Same-template-twice and 100x tests prove fresh Page/Object/Table/RichText identities with preserved internal references and shared AssetRef identities.
- Session tests prove failure atomicity, one insertion/one Undo entry, exact snapshot Redo, zero allocator/registry calls on Redo, and independence after registry mutation/removal.
- Inserted objects pass ordinary move/resize, W2.D snapping/diagnostics, TABLE_WIDTH_INFEASIBLE commit-then-diagnose, and compilePlans without template-specific renderer/publication state.
- /v2 exposes one "Inserir modelo" action outside canonical rendering and activates the created page after success.
- Chromium W2.E proof passed on Chromium 151.0.7922.34. Evidence: scratch/w2e-editor-proof/evidence.json and w2e-v2.png. It verified activation, Text/Shape/Image/Table rendering, move with page-edge snapping, resize, insertion Undo/Redo exact Page/Object identities, no Legacy bootstrap, no template chrome under [data-editorial-root], and zero console/page errors.
- Existing W2.C Chromium proof passed with zero console/page errors and no Legacy bootstrap. Evidence: scratch/w2c-editor-proof/evidence.json.
- Existing W2.D Chromium proof passed with snapping/diagnostics, editorialChromeCount=0, zero console/page errors, and no Legacy bootstrap. Evidence: scratch/w2d-editor-proof/evidence.json.
- Export/PDF proof passed: 8 Chromium matrix combinations, native PDF + PDF.js forensics, W2.A representative primitives, and optional pdftoppm rasterization. Manifest: scratch/presys-editorial-proof/proof-manifest.json.
- Focused regression matrix: 8 files, 123 tests passed. Final W2.E/architecture hardening recheck: 2 files, 21 tests passed.
- Full gates: git diff --check PASS; npm run lint PASS with 0 errors / 268 existing warnings; npm run typecheck PASS; npm test PASS with 211 files, 2244 passed, 1 skipped (2245 total); npm run build PASS (Vite build 11.88s).
- CodeRabbit pre-PR review was attempted through the repository-configured Windows/WSL command, but the configured WSL binary `~/.local/bin/coderabbit` is not installed; no CodeRabbit report was produced.
- Scope audit of added production lines found no special renderer, persisted/live template metadata, global template singleton, Zustand/Supabase/realtime template authority, duplicate Table remapping, geometry duality, hidden template safeArea default, asset creation, Group, direct text editing, persistence, translation, or AI.
- Real promotion PR is #22 on branch `feat/vnext-w2e-page-template-insertion`, based exactly on canonical W2.D squash merge `c220ed1d047d862d8bac30bb8c20702889793fac` / tree `9c018983f2636f318c9092605ca660d33f1bd6f7`. Durable PROJECT-STATE and PRINCIPAL-HANDOFF were updated without claiming W2.E merged, canonical, or Principal accepted.

### File List

- docs/stories/2026-09-11-vnext-w2e-page-template-insertion.md
- src/vnext/application/contracts.ts
- src/vnext/application/document.ts
- src/vnext/application/execute.ts
- src/vnext/application/index.ts
- src/vnext/application/session.ts
- src/vnext/application/template-registry.ts
- src/vnext/app/EditorWorkspace.tsx
- src/vnext/app/VNextApp.tsx
- src/vnext/app/page-template-fixtures.ts
- tests/vnext/application/editor-workspace.test.tsx
- tests/vnext/application/page-template-insertion.test.ts
- tests/vnext/proof/architecture-boundary.test.ts
- tests/vnext/proof/editor-template-insertion-proof.mjs

### Change Log

- 2026-09-11: Story created from the W2.E work order on canonical W2.D base c220ed1d.
- 2026-09-11: W2.E implementation, adversarial identity/history coverage, Chromium proof, W2.C/W2.D regressions, export/PDF proof, and full gates completed.
- 2026-09-11: PR #22 created without merge; durable project state and Principal handoff synchronized to the real W2.E review vehicle.

## W2.0 deviation

NONE
