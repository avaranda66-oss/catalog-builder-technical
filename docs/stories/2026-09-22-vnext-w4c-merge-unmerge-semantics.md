# VNext — W4.C Merge / Unmerge + Semantics

Status: **UNDER REVIEW**

## Authorization, base and scope

W4.C is implemented in isolated worktree `C:\tmp\catalog-builder-technical-w4c` on branch `feat/vnext-w4c-merge-semantics`.

Verified canonical dispatch base:

- main: `19c852ca318ff45f31adacc7ffa29c14fc5d52ed`
- tree: `82afef0d99520a5c0104817c273bc749b0e2c5e5`
- direct parent: `2172141ebed0c8a8a8a2018c832833f472e8ddd7`
- canonical push Quality Gate `35679097482`: COMPLETED / SUCCESS

Only W4.C is authorized. W4.D+ remains deferred. No merge, deployment or database migration is part of this wave.

## Canonical domain authority

W4.C reuses the existing `src/vnext/table/table-model.ts` `mergeCells()` and `unmergeCell()` operations. No second Table Engine exists and the canonical engine was not modified.

The existing renderer is also reused unchanged. Publication continues through the same `TableRenderer`, `orderedAnchors()` topology, span geometry and semantic `aria-rowspan` / `aria-colspan` output.

## Typed structural actions and CAS

Two strict Application Actions were added:

- `table.cells.merge`
- `table.cell.unmerge`

Both carry `pageId/objectId/tableId`, `anchorCellId`, full `expectedTable`, and merge additionally carries semantic `rows/columns`. Unknown fields are rejected.

Both use the existing full `tableTarget()` structural CAS. Any row/column order, topology, content, annotation or other Table change after preparation produces `TARGET_STALE` with zero partial mutation.

## Top-left anchor and range-only merge

Merge is enabled only for W4.A `range` selections containing at least two slots. Row, column, whole-table and single-cell selections remain ineligible.

The structural anchor is derived from the normalized rectangle's `rowStart/columnStart`, never blindly from drag anchor/focus. Forward and reverse range tests produce the same top-left `anchorCellId`, `rows` and `columns`.

## Zero-data-loss / existing topology / header boundary

Anchor content is preserved for all valid canonical content types. Every non-anchor slot must be empty and carry no annotations or the operation fails closed.

Any existing span/covered topology inside the requested rectangle is rejected. There is no implicit unmerge, span absorption or merge-of-merges.

Header + non-header crossing is rejected. Body + section remains compatible with the frozen domain semantics.

## Covered-cell latent state

Covered cells remain canonical Cell records with stable IDs. Merge adds only topology (`coveredBy`) and never flattens/deletes local style or presentation.

Dedicated tests/proof preserve background, padding, text alignment, font weight, color, wrap policy and content presentation through merge → unmerge.

## 1×1 / metadata / history

The canonical engine's 1×1 semantic no-op remains intact: `changed=false`, no history entry and no `localSequence` increment.

Merge/unmerge never allocate identities: `createdIds=[]`. `affectedIds` include object, Table and cells whose topology changed.

Each successful structural action is one Application Action and therefore one history entry. Undo/Redo restores exact topology and IDs without regenerating cells.

## W4.B draft boundary

Structural merge/unmerge preparation calls the existing `finishCellDraftForContextChange()` first. Only after a successful draft commit does the code re-read `session.getSnapshot().document`, resolve the live Table/selection, derive eligibility and capture `expectedTable`.

The visible Chromium proof demonstrates a dirty valid merged-anchor draft committing first and then unmerge succeeding as the second history transition. This would fail `TARGET_STALE` if the pre-draft Table snapshot were reused. Invalid and IME-composing drafts block the structural action and preserve the draft.

## Selection semantics

After merge, ephemeral selection becomes one canonical top-left owner cell and focus returns to the Table Grid.

Before unmerge, the current anchor position/span is captured for UI only. After unmerge, W4.A selection covers the former rectangle; anchor-cell fallback is safe if reconciliation unexpectedly fails.

Selection is never persisted or added to DocumentSession history. Existing W4.A reconciliation remains authoritative after Undo/Redo.

## Father UX / accessibility

The existing contextual Table surface adds only real `<button>` controls:

- `Mesclar células`
- `Desmesclar células`

Disabled reasons are Portuguese and distinguish single/range eligibility, existing topology, header crossing, non-anchor content and non-anchor annotation. No spreadsheet ribbon, span modal or keyboard shortcut was added.

## W4.B content/property compatibility

After merge, the canonical owner remains editable through W4.B and properties continue to apply to the anchor. Direct covered storage cells remain fail-closed at Application Action level. After unmerge, former child cells become independently usable again.

No frame, width, row-height policy, Fit Height, pagination or page creation is performed by merge/unmerge.

## Axis interaction

The existing domain engine remains authoritative: inserting inside a span expands it; removing an intersecting row/column fails with `MERGE_INTERSECTION`; no automatic unmerge is introduced.

## Save / reopen and autosave

Successful structural actions flow through ordinary W3 dirty/autosave behavior. Controlled persistence proof covers merge → Save → switch catalog → reopen and exact topology/style/presentation/frame restoration, then unmerge → Save → switch → reopen.

Claim boundary: this is controlled repository persistence, not a production Supabase Father E2E.

## Publication / semantic output / PDF

The dedicated W4.C browser proof sends the authored document through canonical publication and native Chromium PDF/PDF.js. The post-unmerge Save/reopen state is published before remerge and is `READY` with zero ERROR diagnostics and zero editor chrome; the former merged owner has no merge colspan/rowspan and the formerly covered cell is present again as its own semantic cell. The proof then remerges the same range: merged publication is `READY`, the owner has the correct semantic colspan, the covered cell is not duplicated, and the native PDF/PDF.js assertions remain green.

## Dedicated proof and focused tests

Dedicated visible proof: `tests/vnext/proof/editor-table-merge-proof.mjs` with W4.C controlled fixture.

Focused W4.C/domain slice passes 19/19 tests across:

- `tests/vnext/proof/table.test.ts`
- `tests/vnext/application/table-merge-actions.test.ts`
- `tests/vnext/editor/table-merge-authoring.test.ts`

The visible Chromium W4.C proof passes locally on Chromium 151.0.7922.34 with zero console errors, page errors, failed resources and request failures. Mobile functional checks at 320×900, 360×900 and 390×900 execute merge and unmerge through real `EditorWorkspace` controls, restore the formerly covered cell to independent topology, keep Undo/Redo reachable, and preserve zero global horizontal overflow.

## Deferred / scope audit

Explicitly not implemented: W4.D TSV/bulk copy-paste/marker/legend authoring; W4.E Fit Height/pagination; W4.F presets; W4.G closeout; row-role editor; annotation editor; cell-image upload; border/font-family/font-size/line-height editors; column drag resize; axis reorder UI; translation; AI; dashboard redesign.

No second Table Engine, second renderer, alternate persistence, database/Supabase migration, production deploy or merge.

## Regression ladder

The required local regression ladder passes without weakening historical fixtures:

- W2.C direct manipulation: PASS.
- W2.D snapping / diagnostics: PASS.
- W2.F Group editor: PASS.
- W2.F Group publication / native PDF: PASS.
- W2.G direct Text editing: PASS.
- W3.C Save/reopen: PASS.
- W3.D physical Recovery: PASS.
- W3.D IndexedDB adapter Recovery: PASS.
- W3.G asset persistence: PASS.
- Asset Insert: PASS.
- W3.H autosave/concurrency: PASS.
- W3 Father browser flow: PASS.
- W4.A Table selection/axis: PASS.
- W4.B Cell Content + Properties: PASS.
- W4.C Merge / Unmerge + Semantics: PASS.
- canonical render/publication/native PDF: PASS.

Final marker: `REGRESSION_LADDER_PASS`.

## Final repository gates

Final frozen-source local gates:

- `npm run lint`: PASS; 0 errors, 268 non-blocking repository warnings.
- `npm run typecheck`: PASS.
- `npm test`: PASS.
  - Test Files: 252 passed / 252.
  - Tests: 2683 passed, 1 skipped / 2684 total.
  - Failed: 0.
- `npm run build`: PASS; Vite build completed in 10.82 s.
- `git diff --check`: PASS.

The intentional fail-closed stderr emitted by legacy PDF tests remains baseline test evidence; those tests pass and W4.C does not alter that behavior.

## W4.C Chromium / PDF evidence

Final headed/local W4.C proof:

- Chromium: 151.0.7922.34.
- visibleLocalRun: true.
- controlled persistence: true.
- production Supabase E2E claim: false.
- post-unmerge publication: READY, zero ERROR diagnostics, zero editor chrome.
- post-unmerge semantic owner `w4c-cell-1-0`: ordinary individual cell with no merge colspan/rowspan; content `DRAFT-W4C` present once.
- post-unmerge former covered cell `w4c-cell-1-1`: present again as an independent semantic cell.
- merged publication: READY, zero error diagnostics.
- semantic merged anchor: correct `aria-colspan=2`.
- covered semantic cell: absent as duplicate.
- native PDF: 6680 bytes, approximately 209.889 mm × 297.011 mm.
- vector path operations: 56.
- mobile 320×900 / 360×900 / 390×900: merge reachable, unmerge reachable and functional, Undo/Redo reachable, zero global horizontal overflow.
- console errors: 0.
- page errors: 0.
- failed resources: 0.
- request failures: 0.

W4.A and W4.B dedicated browser proofs also pass after W4.C. W4.B publication remains READY with PDF 120374 bytes, 1 raster image paint and 35 vector path operations.

## Quality Gate wiring

`.github/workflows/quality-gates.yml` preserves every prior proof command and adds only:

`node tests/vnext/proof/editor-table-merge-proof.mjs`

No deployment workflow change exists.

## Changed files

Product/application:

- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `src/vnext/editor/table-merge-authoring.ts`

Tests/proof:

- `tests/vnext/proof/table.test.ts`
- `tests/vnext/application/table-merge-actions.test.ts`
- `tests/vnext/editor/table-merge-authoring.test.ts`
- `tests/vnext/proof/editor-table-merge-proof.mjs`
- `tests/vnext/proof/fixtures/w4c-editor-browser.html`
- `tests/vnext/proof/fixtures/w4c-editor-browser.tsx`
- `tests/vnext/proof/fixtures/w4c-table-document.ts`

Governance/CI:

- `.github/workflows/quality-gates.yml`
- `docs/stories/2026-09-22-vnext-w4c-merge-unmerge-semantics.md`

Presumptively protected surfaces remain unchanged:

- `src/vnext/table/table-model.ts`: unchanged.
- `src/vnext/rendering/TableRenderer.tsx`: unchanged.

## Known limitations

W4.C intentionally does not add border authoring, cell image upload/authoring, annotation editing, row-role editing, Fit Height, pagination, TSV/bulk paste, presets, translation or AI. Controlled persistence/browser evidence is not represented as a real-production Supabase Father E2E.

## Exact-head provenance / CI

PR #43 is the W4.C review vehicle on branch `feat/vnext-w4c-merge-semantics`, based on canonical main `19c852ca318ff45f31adacc7ffa29c14fc5d52ed`. This story remains **UNDER REVIEW** until Principal promotion. The exact current PR head and exact-head Quality Gate are GitHub-live authority and are reported in the final implementation/amendment report rather than hardcoded here.

Independent audit amendment evidence requested and completed:

1. mobile functional unmerge proof at 320 / 360 / 390;
2. semantic publication proof after unmerge;
3. stale provenance wording cleanup.

Local amendment evidence: PASS. All three mobile widths execute merge + unmerge functionally with zero global overflow; post-unmerge publication is READY with zero ERROR diagnostics and independent semantic cells restored; merged publication/PDF remains PASS. No product source changed.
