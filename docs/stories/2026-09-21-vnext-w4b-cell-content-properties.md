# VNext — W4.B Cell Content + Properties

Status: **UNDER REVIEW**

## Authorization, base and scope

W4.B was implemented in the isolated worktree `C:\tmp\catalog-builder-technical-w4b` on branch `feat/vnext-w4b-cell-content-properties`.

Verified canonical base at dispatch and throughout local implementation:

- main: `2172141ebed0c8a8a8a2018c832833f472e8ddd7`
- tree: `c6dcf9a2111d06c6411801ce85172b3ad9509f7f`
- direct parent: `069111df3d01f0e60c3584b6d40d1284f8598388`
- prior canonical push Quality Gate `35626415429`: COMPLETED / SUCCESS

W4.A remains the canonical Table selection layer. W4.B adds cell content/property authoring only. W4.C+ remains unauthorized.

## Architectural invariants preserved

- One `CatalogDocument`.
- One Table Engine / renderer / persistence authority.
- Existing Table schema and canonical publication/PDF path.
- W4.A selection remains ephemeral editor state.
- W3 Save/CAS/autosave/Recovery remains authoritative.
- Integer U/Q finite-A4 geometry is unchanged.
- No second renderer, document model, Table Engine or persistence model.
- No database or Supabase migration.
- No production deployment.

`data-local-sequence` on the Table Grid overlay is read-only deterministic proof/diagnostic observability. It mirrors the supplied `DocumentSession.localSequence`; it is never read as application authority and changes no product behavior.

## Application actions

### `table.cell.setContent`

Target identity is `pageId/objectId/tableId/cellId` plus narrow `expectedContent` CAS.

The executor validates page/object/table identity, lock state, closed-group constraints, anchor/non-covered status and exact target content. Unrelated mutations elsewhere in the Table do not stale the target.

Supported authored content:

- `empty`
- `richText`
- `technicalCode`
- `measurement`

Existing `marker` and `image` content are read-only in W4.B.

Different non-empty content types require explicit `allowTypeChange: true`. UI dropdown changes remain draft-only and never mutate the document by themselves.

### `table.cell.setProperties`

Targets one or multiple unique canonical anchor cells resolved from the current W4.A selection.

Each target may carry exact `expectedStyle` / `expectedContentPresentation` snapshots. Validation is all-or-none: any stale target causes atomic `TARGET_STALE` failure with no partial mutation.

Authorized local cell overrides:

- `textAlign`
- `fontWeight`
- `color`
- `background`
- `paddingMm.top/right/bottom/left`
- `contentPresentation.wrapPolicy`

Patch semantics are strict:

- absent = unchanged
- `null` = remove that local override
- nested padding edge `null` = remove only that edge

Empty local containers are pruned. Computed/inherited style is never flattened into the cell. Existing `contentPresentation.image` survives wrap updates/resets.
## RichText authority

W4.B reuses W2.G `projectEditableRichText` / `reconcileEditableRichText` and canonical ID allocation.

The UI supplies semantic plain text only; it does not allocate RichText IDs. Existing compatible IDs are preserved and new IDs come from the canonical allocator. RichText outside the lossless W2.G editable subset fails closed/read-only instead of being destructively projected.

## Technical Code

Technical Code preserves the authored string exactly. W4.B does not silently trim, normalize or strip newlines. Canonical schema validation remains authoritative.

Plain Enter may commit Technical Code when IME composition is inactive.

## Measurement

`valueText` remains a string and preserves exact authored precision, including values such as `0.010`. Unit and optional qualifier remain semantic fields. No numeric round-trip is introduced.

Measurement form fields use normal browser Tab navigation; grid navigation does not intercept Tab from Inspector inputs.

## Draft and Inspector-first UX

Cell Editing follows the frozen hierarchy:

Object Mode → Table Grid Mode → Cell Editing.

There is no inline textarea/contenteditable over the Table. Editing is Inspector-first.

`src/vnext/editor/table-cell-draft.ts` owns ephemeral cell draft state outside `CatalogDocument`. Typing never mutates the canonical document.

Supported draft lifecycle includes:

- Enter/F2 from the Table Grid enters Cell Editing.
- Double-click resolves the visible display slot to its canonical anchor and enters Cell Editing.
- Escape cancels.
- Ctrl/Cmd+Enter commits.
- Technical Code Enter commits when not composing.
- RichText Enter remains a newline.
- Measurement Tab remains normal form traversal.
- `Concluir` commits and `Cancelar` cancels.
- Marker/Image display a read-only Cell Editing state.
- Destructive type changes require explicit confirmation.
- `Limpar conteúdo` is explicit and follows the same destructive-change confirmation boundary where required.
- IME composition blocks commit/cancel/navigation and Save preparation.

Valid dirty context changes may safely commit first. Invalid, stale or composing drafts block context change and remain visible.

## AuthoringBarrier and Recovery

W4.B integrates with the existing W3 `AuthoringBarrier`.

A dirty valid cell draft is canonicalized before Save. Invalid, stale or composing drafts block Save without dispatching persistence.

Recovery adds the additive `TABLE_CELL_DRAFT_V1` overlay. Recovery record format remains version 1; there is no schema/database migration.

Recovery evidence proves:

- JSON serialize/parse round-trip.
- Exact `expectedContent` match required.
- stale content rejected.
- missing page rejected.
- missing object/Table rejected.
- wrong Table ID rejected.
- missing cell rejected.
- covered/non-editable cell rejected.
- accepted/rejected overlay consumed exactly once.
- `compositionWasActive` is retained in the recovery contract.
- `TEXT_DRAFT_V1` remains valid.
- `INSPECTOR_FRAME_DRAFT_V1` remains valid.

## Defect found during validation — Undo/Redo draft boundary

### Symptom

A single Undo/Redo activation could first finish/commit the active cell draft through the root pointer context boundary and then also execute canonical history.

That violated the required ephemeral-draft-before-history boundary.

### Root cause

Undo/Redo buttons were treated as ordinary context-changing pointer targets before their handlers executed. The root capture path could therefore finish the cell draft before the button handler reached `session.undo()` / `session.redo()`.

### Fix

- Undo/Redo pointer targets bypass the generic cell-draft context-finishing path.
- If a cell draft exists, Undo/Redo cancels that draft and returns.
- The same user command does not fall through into canonical history.
- Final diff audit found the same fallthrough in the root keyboard path: Ctrl/Cmd+Z and Ctrl/Cmd+Y canceled the draft and then invoked canonical Undo/Redo in the same key event. That path now also cancels the draft and returns immediately; Ctrl/Cmd+Shift+Z is covered by the same Z boundary.

Browser proof confirms button Undo, Ctrl/Cmd+Z and Ctrl/Cmd+Y each close the active cell draft without changing `localSequence` or canonical cell content. A later canonical Undo/Redo remains one history operation.
## Defect found during validation — Measurement → Image selection

### Symptom

After editing a numeric cell property in the Inspector and pressing Enter on the Measurement cell, clicking the Image cell visibly reached the Table grid but the active selection remained on Measurement. A subsequent wrap command therefore targeted Measurement rather than Image.

### Causal evidence

Instrumentation during the visible Chromium investigation proved:

- `pointerdown` reached `data-table-cell="1:1"`.
- `pointerup` reached `data-table-cell="1:1"`.
- `lostpointercapture` occurred normally.
- live `DocumentSession.localSequence = 14`.
- DOM `data-local-sequence = 14`.

The defect was therefore not wrong coordinates, a generic async delay, stale DocumentSession causality, or a proof timeout.

### Root cause

The global `EditorWorkspace` keydown handler handled Enter from a numeric Inspector `<input>` as the Table Grid command for “enter Cell Editing”.

That silently re-entered `cell-edit` on the Measurement cell. The later Image click correctly reached `TableGridOverlay`, but `onSelectionChange` intentionally ignores selection movement while Cell Editing is active.

### Fix

Table Grid keyboard commands now execute only when the keyboard event genuinely originates inside:

`[data-table-grid-overlay]`

Inspector input Enter remains local to the Inspector/property commit.

### Regression

The dedicated Chromium proof explicitly executes:

Measurement selected
→ numeric property edit
→ Enter
→ assert no Cell Editing session
→ real grid click on Image
→ wrap property action
→ Image changes
→ previous Measurement wrap value remains unchanged.

This regression passes.

## Multi-cell properties and merged anchors

W4.A range selection resolves to unique canonical anchor IDs before property action preparation. One multi-cell property application creates one history command.

Visible covered slots resolve to their canonical merged anchor for normal grid interaction. Direct application actions against a covered storage cell are rejected. Marker/Image content remains read-only.

## Save / reopen evidence

Controlled canonical persistence proof:

edit content/properties
→ dirty canonical document
→ Save
→ open another catalog
→ reopen original
→ exact cells retained.

Verified after reopen:

- RichText edit retained.
- Measurement `0.010` retained exactly.
- explicit font/color/background/padding/wrap overrides retained.
- reset alignment remains absent rather than materialized.
- Image presentation remains intact after wrap reset.
- uncommitted drafts never enter `CatalogDocument`.

Claim boundary: this is controlled persistence integration, **not** a real production Supabase Father E2E.

## Chromium W4.B proof

Dedicated proof: `tests/vnext/proof/editor-table-cell-proof.mjs`.

It covers:

- Object → Grid → Cell Editing.
- RichText simple editing.
- ephemeral typing.
- Undo/Redo.
- Technical Code valid/invalid.
- Measurement valid/invalid.
- exact `0.010` preservation.
- clear to empty.
- explicit destructive type switching.
- alignment and inherited reset.
- font weight.
- color/background.
- wrap/reset with Image presentation preservation.
- padding.
- atomic multi-cell properties.
- Measurement → Image selection regression.
- merged anchor / covered storage behavior.
- Marker/Image read-only.
- invalid/stale draft preservation.
- IME Save block.
- AuthoringBarrier valid Save.
- Save/reopen.
- mobile.
- publication.
- native PDF/PDF.js.
- zero attributable browser errors.

Final headless W4.B run after proof cleanup: PASS.

Final visible/headed W4.B run on the product tree: PASS with `visibleLocalRun: true`, Chromium 151.0.7922.34, zero console errors, page errors, resource failures and request failures. A prior headed-only `/favicon.ico` 404 was fixture hygiene; the proof fixture now declares a `data:` favicon and the clean headed run has zero failures.
## Mobile evidence

Functional Chromium checks at:

- 320 × 900
- 360 × 900
- 390 × 900

For all three widths:

- Table reachable.
- Grid Mode reachable.
- Cell Editing reachable.
- Inspector reachable.
- Measurement fields reachable with normal Tab traversal.
- property controls reachable.
- Concluir/Cancelar reachable.
- Undo/Redo reachable.
- document width equals viewport width.
- body width equals viewport width.
- zero global horizontal overflow.

## Publication / PDF evidence

Committed W4.B state is handed to the existing canonical publication renderer; no second renderer exists.

Publication result:

- status: `READY`
- diagnostics: 0
- editor chrome inside publication: 0
- no Cell Editing UI, Inspector, textarea/input, selection chrome or validation state in publication.

PDF.js evidence from the dedicated W4.B proof:

- one A4 page.
- approximately 209.889 mm × 297.011 mm.
- PDF size: 120267 bytes in the final headless proof (headed fixture runs may differ slightly only in deterministic PDF metadata/encoding).
- 16 text items.
- 1 raster image paint.
- 35 vector path operations.
- expected W4.B text present, including `Texto W4.B final`, `0.010`, `mV` and `MERGED-SAVED-BARRIER`.

## Focused tests

Verified W4.B affected slice after the selection fix:

- 3 test files passed.
- 19 tests passed.
- 0 failures.

Composition:

- `tests/vnext/application/table-cell-actions.test.ts`: 11 tests.
- `tests/vnext/editor/table-grid-overlay.test.tsx`: 3 tests.
- `tests/vnext/persistence/table-cell-authoring-barrier.test.tsx`: 5 tests.

Earlier focused evidence retained:

- Draft + Recovery initial slice: 15 / 15 PASS.
- integrated Draft/Recovery/AuthoringBarrier slice: 20 / 20 PASS.
- earlier W4.A + W4.B application slice: 20 / 20 PASS.

## Regression ladder

The complete required local ladder passed without weakening historical fixtures:

- W2.C direct manipulation.
- W2.D snapping / diagnostics.
- W2.F Group editor.
- W2.F Group publication/PDF.
- W2.G direct Text editing.
- W3.C Save/reopen.
- W3 Recovery physical.
- W3 Recovery IndexedDB.
- W3.G asset persistence.
- Asset Insert.
- W3.H autosave/concurrency.
- W3 Father browser flow.
- W4.A Table selection/axis.
- canonical publication/native PDF.
- W4.B dedicated Chromium proof.

Result: `REGRESSION LADDER PASS`.

## Final repository gates

Final source-tree gates before story-only finalization:

- `npm run lint`: PASS, 0 errors; 268 non-blocking repository warnings.
- `npm run typecheck`: PASS.
- `npm test`: PASS.
  - Test Files: 250 passed / 250.
  - Tests: 2671 passed, 1 skipped / 2672 total.
  - Failed: 0.
- `npm run build`: PASS; final Vite build completed in 16.36 s.
- `git diff --check`: PASS.

The numerous React `act(...)` and intentional fail-closed stderr messages emitted by legacy tests remain non-failing baseline output and were not broadened into W4.B work.
## Quality Gate wiring

The existing `.github/workflows/quality-gates.yml` “VNext Chromium and PDF proofs” step is preserved.

W4.B adds only the minimum canonical proof commands:

- `node tests/vnext/proof/editor-table-axis-proof.mjs`
- `node tests/vnext/proof/editor-table-cell-proof.mjs`

All pre-existing W2/W3/Asset Insert proofs, lint, typecheck, tests and build remain intact. No deployment behavior was added.

## Changed files

Product / application:

- `src/vnext/application/contracts.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `src/vnext/editor/table-selection.ts`
- `src/vnext/editor/table-cell-draft.ts`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/table-grid-overlay.tsx`
- `src/vnext/app/RecoveryCenter.tsx`
- `src/vnext/recovery/contracts.ts`

Tests / proof:

- `tests/vnext/application/table-cell-actions.test.ts`
- `tests/vnext/editor/table-cell-draft.test.ts`
- `tests/vnext/persistence/table-cell-authoring-barrier.test.tsx`
- `tests/vnext/recovery/recovery-contracts.test.ts`
- `tests/vnext/proof/editor-table-cell-proof.mjs`
- `tests/vnext/proof/fixtures/w4b-editor-browser.html`
- `tests/vnext/proof/fixtures/w4b-editor-browser.tsx`
- `tests/vnext/proof/fixtures/w4b-table-document.ts`

Governance:

- `.github/workflows/quality-gates.yml`
- `docs/stories/2026-09-21-vnext-w4b-cell-content-properties.md`

## Known limitations / deferred scope

Intentionally not implemented in W4.B:

- W4.C merge/unmerge authoring.
- W4.D TSV / bulk copy-paste / marker or legend authoring.
- W4.E Fit Height.
- automatic pagination.
- W4.F presets.
- W4.G closeout.
- cell-image upload/authoring.
- row-role editor.
- annotations editor.
- legend editor.
- border editor.
- font-family editor.
- font-size editor.
- line-height editor.
- translation.
- AI.
- dashboard redesign.
- production Supabase Father E2E.

Marker and Image content remain read-only. Advanced RichText outside the W2.G lossless subset remains fail-closed/read-only.

## Scope audit

Confirmed no:

- W4.C / W4.D / W4.E / W4.F / W4.G implementation.
- second Table Engine.
- second renderer.
- second persistence authority.
- alternate document model.
- database migration.
- Supabase migration.
- production deployment.
- production merge.

W4.B remains **UNDER REVIEW** until independent adversarial audit and later authorized canonical closeout.
