# W2.A — Primitive Domain + Publication-Safe Rendering

Status: Ready for Review
Date: 2026-09-10
Base SHA: `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`
Base tree: `fa61d3e8cc978a0af928423fc9c21550e618e675`
Branch: `feat/vnext-w2a-primitives-rendering`

## Goal

Implement the first executable slice of the Principal-accepted W2.0 contract: finalize the canonical Text, Image, Table, Shape, Line, and Icon primitive/domain contracts needed by W2 and render them through the production VNext renderer in a publication-safe way. Resolve Text physical-height authority so `frame.heightMm` is the sole authored physical Text height, add the normalized Image `focalPoint` seam, and preserve all accepted W0/W0.1/W1 boundaries.

The verified canonical base for this story is `origin/main` at SHA `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`, tree `fa61d3e8cc978a0af928423fc9c21550e618e675`. This is the post-W2.0 promotion base to use for W2.A implementation.

## Scope

- Canonical primitive/domain contracts for `Text`, `Image`, `Table`, `Shape`, `Line`, and `Icon` only.
- Repository-wide consumer audit of the legacy/redundant Text-specific `height` field before changing it; remove it when it has no independent required semantic meaning so `frame.heightMm` remains the sole authored physical Text height authority.
- Canonical RichText rendering inside the authored Text frame without editor/selection state becoming document or renderer authority.
- Standalone Image primitive with declared-asset reference, `contain | cover` fit, normalized optional `focalPoint`, and deterministic centered default `{ x: 0.5, y: 0.5 }`.
- Existing canonical Table object integration with the primitive rendering system without changing or forking `TableModel` or its deterministic layout engine.
- Minimal Shape primitive with `rectangle | ellipse` variants and the W2.0 fill/stroke contract.
- Minimal axis-aligned Line primitive with `horizontal | vertical` axis and canonical frame as the complete ink box.
- Asset-backed Icon primitive rendered deterministically with `contain`; allow only the minimal declared-asset MIME/reference change needed for safe SVG assets if implementation proves it necessary.
- Exhaustive production primitive rendering usable by both editor content and publication, with deterministic `(zIndex, page.objects array order)` ordering.
- Publication/preflight behavior that remains independent of selection, hover, handles, drag preview, guides, snapping, Inspector state, pointer events, and editor mode.
- Tests for primitive parsing/validation, Text-height authority, Image focal-point semantics, renderer completeness, publication safety, architecture boundaries, and W0/Table regressions.
- A deterministic in-repo proof fixture/harness containing representative Text, Image, Table, Shape, Line, and Icon objects may be added when it uses production renderers and remains test/proof evidence rather than a second production editor or architecture authority.

## Canonical primitive contracts

All primitives use the existing object base and canonical `Frame` for physical placement. No primitive may introduce duplicate authored `x`, `y`, `width`, or `height` geometry authority.

### Text

- `type: 'text'` continues to own canonical RichText content and accepted text style semantics.
- `frame.heightMm` is the sole authored physical Text height authority.
- Any measured content extent is derived rendering/publication data only and must not become another authored height field.
- RichText paragraph/inline IDs remain local to each independent RichText; duplicate paragraph/inline IDs across different RichTexts remain legal.

### Image

```ts
type ImageObject = ObjectBase & {
  type: 'image';
  assetId: string;
  fit: 'contain' | 'cover';
  focalPoint?: {
    x: number;
    y: number;
  };
};
```

- `focalPoint.x` and `focalPoint.y` are normalized and valid only in the inclusive range `0..1`.
- Missing `focalPoint` resolves deterministically to `{ x: 0.5, y: 0.5 }`.
- `cover` uses the focal point only for deterministic source positioning while preserving the authored frame.
- `contain` shows the complete source and remains deterministic; focal point must not create cropping behavior.
- `assetId` resolves through the existing declared asset/resource boundary.

### Table

- Remains `ObjectBase + { type: 'table', table: TableModel }`.
- Existing `TableModel`, column/row solving, `compilePlans`, AUTO/MIN/FIXED row behavior, R0.1.4 projection, integer-U geometry, integer-Q measurement, Q/Q fit, diagnostics, cell typing, IDs, and references remain canonical.
- Primitive rendering integration must not mutate `TableModel` or create editor-only table geometry.

### Shape

```ts
type ShapeObject = ObjectBase & {
  type: 'shape';
  shape: 'rectangle' | 'ellipse';
  style: {
    fill?: '#RRGGBB';
    stroke?: Border;
  };
};
```

- Shape contains no special text engine; text-over-shape is composition of independent primitives.
- Paint, including stroke, remains inside the authored frame.

### Line

```ts
type LineObject = ObjectBase & {
  type: 'line';
  axis: 'horizontal' | 'vertical';
  color: '#RRGGBB';
};
```

- The authored frame is the complete ink box: long axis is length and cross axis is thickness.
- No diagonal/path/Bezier/connector semantics are introduced.

### Icon

```ts
type IconObject = ObjectBase & {
  type: 'icon';
  assetId: string;
};
```

- Icon uses deterministic `contain` rendering inside its authored frame.
- Document JSON must not embed arbitrary executable SVG/HTML markup.
- SVG, if enabled, stays behind the existing declared-asset/resource-readiness safety boundary.

## Acceptance criteria

- [x] A01 W2.A is implemented from verified base SHA `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`, tree `fa61d3e8cc978a0af928423fc9c21550e618e675`, without rebuilding from a pre-W2.0 branch.
- [x] A02 Canonical primitive validation supports exactly Text, Image, Table, Shape, Line, and Icon for this slice; unsupported/invalid discriminants fail closed and Group is absent.
- [x] A03 Every primitive uses canonical `frame.xMm/yMm/widthMm/heightMm` for authored physical placement with no primitive-specific duplicate geometry authority.
- [x] A04 A repository-wide Text-height consumer audit covers schema declarations, factories, fixtures, tests, renderer, preflight, publication, serialization, labs, and proofs before removal/migration.
- [x] A05 `frame.heightMm` is the sole authored physical Text height authority; the obsolete Text-specific secondary height field is removed if the audit confirms no independent required W0 semantic consumer.
- [x] A06 If the Text-height audit finds a real required W0 semantic conflict, that specific removal is stopped and the exact consumer/conflict is documented for Principal review without inventing another height authority.
- [x] A07 Canonical RichText still renders inside the authored Text frame, remains independent of editor/selection state, and preserves RichText-local paragraph/inline identity rules.
- [x] A08 Duplicate paragraph/inline IDs across separate independent RichTexts remain valid.
- [x] A09 Image validates `assetId`, `fit`, and optional normalized `focalPoint`; omitted focal point resolves deterministically to center.
- [x] A10 Image accepts inclusive focal-point boundaries `0` and `1`, rejects values outside `0..1`, and preserves canonical focal point through schema/serialization roundtrip.
- [x] A11 Image `cover` positioning changes deterministically with focal point while preserving frame geometry; `contain` remains deterministic and does not introduce focal-point cropping.
- [x] A12 Table remains backed by the existing canonical `TableModel` and Table Engine with no fork, duplicate solver, or editor-only geometry model.
- [x] A13 Existing Table Engine behavior, R0.1.4 projection, Q/Q fit, stable diagnostics, and representative W0 proof behavior remain unchanged.
- [x] A14 Shape validates only `rectangle | ellipse` plus the accepted minimum fill/stroke semantics and keeps all paint inside its authored frame.
- [x] A15 Line validates only `horizontal | vertical` plus canonical color and uses the authored frame as the entire ink box.
- [x] A16 Icon validates as an asset-backed primitive and renders with deterministic `contain` without accepting arbitrary executable document markup.
- [x] A17 The production renderer handles every W2.A primitive exhaustively and does not require selection, hover, active handles, drag preview, guides, snapping, Inspector, pointer events, or editor mode.
- [x] A18 Primitive rendering order remains deterministic by `zIndex` and then stable page-object array order where required by the contract.
- [x] A19 Canonical rendering remains suitable for both editor content and publication; no separate editor/export semantic renderer is introduced.
- [x] A20 Publication/preflight consumes canonical document semantics without editor state and does not gain editor chrome or DOM mutation authority.
- [x] A21 Ordinary intentional frame overlap remains legal authored composition and is not newly emitted as universal publication failure/warning noise.
- [x] A22 Existing canonical diagnostic identifiers remain stable, including `SAFE_AREA_VIOLATION`, `TEXT_OBJECT_OVERFLOW`, `OBJECT_OUTSIDE_PAGE`, `OBJECT_OVERLAP`, `TABLE_CONTENT_OVERFLOW`, and `TABLE_WIDTH_INFEASIBLE`; no alias vocabulary is introduced.
- [x] A23 `src/vnext/index.ts` remains pure domain/table exports; React/rendering stays under `src/vnext/rendering`; publication/preflight stays under `src/vnext/publication`.
- [x] A24 Domain/application/table modules do not acquire React/DOM/browser dependencies and rendering modules do not become canonical document mutation authority.
- [x] A25 Architecture-boundary tests are strengthened or extended only as required by the accepted W2.A surface and are not weakened to make implementation pass.
- [x] A26 Focused W2.A tests and relevant VNext/W0 proof suites pass, including the existing Table Engine regressions.
- [x] A27 `git diff --check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass before handoff.
- [x] A28 Final self-audit confirms no persistence, Supabase/Auth, translation, dragging, selection, Inspector, Tool Rail, Group implementation, advanced Table Editor, AI authoring, second geometry authority, second Table Engine, second renderer authority, or second Text-height authority entered the diff.
- [x] A29 Story checklist and File List are updated with the exact implementation/test files before W2.A is handed off for review.
- [x] A30 W2.A remains an implementation candidate until its PR is independently reviewed and merged; this story does not claim W2 or W2.A complete merely because local implementation exists.

## Tasks

- [x] Audit the secondary Text-specific height field and every repository consumer before changing the canonical schema.
- [x] Finalize primitive schemas/validation for Text, Image, Table, Shape, Line, and Icon only.
- [x] Remove the redundant Text-specific height authority when the audit confirms it has no independent required semantic meaning; otherwise record the Principal-review conflict without introducing replacement authorities.
- [x] Implement normalized Image focal-point validation/defaulting and deterministic `cover`/`contain` rendering semantics.
- [x] Integrate Shape, Line, Icon, and existing Table semantics into the exhaustive production primitive renderer.
- [x] Preserve deterministic z-order and the existing declared asset/resource-readiness boundary.
- [x] Update publication/preflight only as required for W2.A primitive parity and intentional-overlap behavior while preserving diagnostic vocabulary.
- [x] Add counterexample-focused tests for Text height, RichText-local identity, focal-point bounds/default/roundtrip/rendering, primitive discriminants/frame authority, renderer completeness, publication independence, Table preservation, and architecture boundaries.
- [x] Add/update an accepted in-repo proof fixture only if useful to exercise all six primitives through production renderers.
- [x] Run focused VNext/W0 proof suites and then the complete repository gates.
- [x] Perform the explicit scope-creep and duplicate-authority self-audit before handoff.
- [x] Update this story's checklist, test evidence, completion notes, and exact File List during implementation.

## Test plan

### Text

- [x] Prove `frame.heightMm` is the only authored physical Text height authority in the canonical schema.
- [x] Prove obsolete Text-specific height cannot roundtrip/persist as a second physical authority after the selected cleanup.
- [x] Prove representative canonical RichText still renders inside the authored frame.
- [x] Prove duplicate paragraph/inline IDs across separate RichTexts remain legal while local RichText identity validation remains intact.

### Image

- [x] Omitted `focalPoint` resolves to deterministic center `{ x: 0.5, y: 0.5 }`.
- [x] Inclusive focal-point boundary values `0` and `1` are accepted.
- [x] Values below `0`, above `1`, non-finite values, and malformed focal points fail closed.
- [x] `cover` source positioning changes deterministically with focal point.
- [x] `contain` remains deterministic and shows the complete source without focal-point-driven cropping.
- [x] Schema/serialization roundtrip retains canonical focal point.

### Primitives and renderer

- [x] Text, Image, Table, Shape, Line, and Icon each parse/validate correctly.
- [x] Invalid primitive discriminants and invalid primitive-specific fields fail closed.
- [x] Frame remains the sole authored geometry authority for every primitive.
- [x] Production renderer handles every supported primitive exhaustively.
- [x] Rendering order remains deterministic by `(zIndex, stable array order)`.
- [x] Renderer requires no editor chrome or editor interaction state.

### Table regressions

- [x] Existing Table Engine tests remain green.
- [x] Existing W0/R0.1.4 proof behavior remains green.
- [x] Primitive integration does not mutate `TableModel`, its IDs, or its deterministic solver semantics.

### Publication and diagnostics

- [x] Publication/preflight runs from canonical document state without selection/editor state.
- [x] Ordinary intentional overlap is not introduced as universal publication failure/noise.
- [x] Existing stable diagnostic codes remain unchanged.
- [x] Missing/unready declared Image/Icon assets remain publication diagnostics through the existing resource boundary.

### Architecture

- [x] Rendering modules do not become canonical document mutation authority.
- [x] Domain/application/table layers remain React/DOM/browser independent.
- [x] `src/vnext/index.ts`, `src/vnext/rendering`, and `src/vnext/publication` ownership boundaries remain enforced by tests.

### Final gates

- [x] `git diff --check`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] Relevant focused VNext/W0 proof suites are run explicitly when the full-suite output is insufficient for auditability.

## Explicit exclusions

W2.A does not implement Object Application Actions or visible editor authoring/manipulation. The following are explicitly excluded from this story:

- `object.insert`, `object.delete`, `object.duplicate`, `object.move`, `object.resize`, `object.reorder`, `image.replace`, and direct Text editing actions;
- selection, dragging, resize handles, snapping, guides, Inspector, Tool Rail, and visible Add Text/Image/Table/Shape/Line controls;
- page-template insertion/materialization and any template/library UI;
- Group or any nested/group coordinate model;
- advanced table structural editing, spreadsheet selection, TSV paste, marker bulk toggle, Fit Height, and table presets;
- crop rectangles, free crop, rotation, masks, filters, arbitrary transforms, diagonal lines, connectors, SVG-path/Bezier authoring, or a vector-editor model;
- persistence, save/autosave/reopen, Supabase/Auth for `/v2`, translation, PIM, AI authoring, Presence/Realtime/CRDT;
- automatic pagination/reflow, automatic collision resolution, or publication redesign;
- W0/W1 redesign, Legacy authority restoration, or unrelated lab debt.

No Cover, Header, Footer, Banner, Accessories, Ordering, Compatibility, Additel, or PRESYS special primitive is introduced. Those concepts must compose ordinary canonical primitives when later product work requires them.

## Deferred items

- **W2.B:** strict Object Application Actions (`object.insert/delete/duplicate/move/resize/reorder`, `image.replace`), lock/no-op/failure semantics, identity instantiation, Undo/Redo coverage.
- **W2.C:** ephemeral active-page/selection state, direct move/resize interaction, editor overlays, minimum visible Add/Delete/Duplicate/Move/Resize/z-order/Replace Image controls, and mm-facing geometry input quantized to U.
- **W2.D:** pure deterministic snapping, ephemeral guides, safe-area interaction feedback, and authoring diagnostic presentation.
- **W2.E:** page-template materialization into ordinary canonical pages/objects.
- **W2.F:** complete canonical Group contract and implementation; this remains a required gate before W3 serialization freeze.
- **W2.G:** minimum direct Text editing through typed Application Actions with ephemeral DOM/caret/composition state.
- **W3+:** persistence/reopen, advanced table editing, translation, publication integration/easy-button layer, components/starters, sharing, PIM, Realtime/Presence, and AI authoring according to later wave ownership.

## Dev Agent Record

### Agent Model Used

GPT-6 Codex continuation executor (Dex / aiox-dev workflow).

### Debug Log References

- Story preparation base verified locally from `origin/main`: SHA `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`, tree `fa61d3e8cc978a0af928423fc9c21550e618e675`.
- W2.0 contract authority: `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`.
- Current durable state/handoff consulted: `docs/vnext/PROJECT-STATE.md` and `docs/vnext/PRINCIPAL-HANDOFF.md`.
- Prior implementation-story convention consulted: `docs/stories/2026-09-10-vnext-w1-application-actions-shell.md`.
- Recovery found the implementation branch checked out in worktree `780d` with all W2.A implementation changes uncommitted at the canonical base; no prior W2.A commit, remote branch, partial push, or PR existed.
- Amendment recovery rechecked worktree ownership after an interrupted detached session: worktree `98d5` was detached at `c9739529bff29f5e3837d56bcf3570b4e852cf47`, while `feat/vnext-w2a-primitives-rendering` was already cleanly owned by worktree `780d` at the same SHA. Recovery therefore followed Case C and continued in `780d` without moving refs, forcing checkout, resetting, stashing, cleaning, or deleting worktrees.
- Text-height audit found the obsolete Text-specific `height` only in historical R0 documentation plus the W2.A negative test; no runtime, renderer, preflight, publication, serialization, application, fixture, or proof consumer remains.
- Amendment TextStyle proof: dedicated strict `TextStyleSchema` accepts only `fontFamily`, `fontSizePt`, `lineHeight`, `fontWeight`, `color`, and `textAlign`; standalone Text rejects `background`, `paddingMm`, `borders`, and unknown fields while `CellStyleSchema` remains the Table/cell style contract.
- Focused VNext proof/application validation: `npx vitest run tests/vnext/proof tests/vnext/application` — 9 files, 98/98 tests PASS.
- Browser/PDF proof: `node tests/vnext/proof/export-proof.mjs` — original 8/8 viewport/DPR/media matrix cases PASS; representative `W2A` page PASS through production `DocumentRenderer -> PrimitiveRenderer/TableRenderer`; declared Image/Icon assets resolve to blob URLs and decode at 545×767; cover Image resolves non-centered `20% 80%`; Icon resolves `contain` + `50% 50%`; Shape stroke ink bounds equal its authored frame in screen/print; Line ink bounds equal its authored frame in screen/print; Text remains DOM text; canonical Table Renderer remains in use; representative page reaches native Chromium PDF; PDF.js forensics PASS; optional host `pdftoppm` rasterization PASS; `ROWSPAN R0.1.4: READY`.
- W1 page-duplication regression now exercises Text/Image/Table/Shape/Line/Icon through the real session action path, proving fresh Page/Object/Table structural/local RichText IDs, preserved Image focal point and asset reference, preserved Shape stroke/style, preserved Line/Icon payload, no asset duplication, and unchanged source document.
- Full repository tests: 205 files PASS; 2144 tests PASS, 1 skipped (2145 total).
- Final gates: `git diff --check` PASS; `npm run lint` PASS with 0 errors / 268 pre-existing warnings; `npm run typecheck` PASS; `npm test` PASS; `npm run build` PASS (`built in 12.16s`).
- CodeRabbit CLI review was attempted through the project-prescribed Windows/WSL path but the binary was absent; runtime tool inventory also exposed no CodeRabbit tool. This environment limitation is recorded for Principal review and is not represented as a passed gate.
- PR/head evidence: PR #18 (`https://github.com/avaranda66-oss/catalog-builder-technical/pull/18`) is the single W2.A review vehicle from `feat/vnext-w2a-primitives-rendering` into `main`; GitHub remains authority for live PR state.

### Completion Notes List

- Recovered and preserved the interrupted W2.A work rather than recreating it; implementation remained based directly on verified post-PR-#17 canonical main.
- `frame.heightMm` is the sole authored physical Text height authority; no replacement secondary authority was introduced.
- Standalone Text now uses strict `TextStyleSchema`; cell-only background/padding/border semantics cannot enter a Text object as silent no-ops.
- Added canonical Image, Shape, Line, and Icon variants while retaining the existing Table object and one canonical Table Engine.
- Image `focalPoint` is optional, normalized to inclusive `0..1`, defaults to center for `cover`, and does not affect deterministic `contain` behavior.
- `PrimitiveRenderer` is exhaustive for Text/Image/Table/Shape/Line/Icon and remains free of selection/editor-state dependencies; `PageRenderer` preserves deterministic `(zIndex, stable array order)` ordering.
- Intentional overlap remains legal authored composition; the `OBJECT_OVERLAP` diagnostic identifier remains stable while universal publication emission is removed.
- Existing resource readiness/hash/decode flow covers standalone Image/Icon through the same declared asset boundary; no second resource or renderer authority was added.
- Real Chromium evidence now covers all six W2.A primitives together, including Shape stroke containment, exact Line frame/ink geometry, screen/print semantic parity, and native Chromium PDF output.
- W1 page duplication compatibility is directly regression-tested across all six primitives while RichText paragraph/inline identity remains local to each independent RichText.
- Durable project state/handoff wording now treats `8dc43027...` / `fa61d3e...` as PR #18 implementation provenance and requires live GitHub verification plus reconstruction of canonical `main` before W2.B; it does not self-freeze PR #18 as open or claim final Principal acceptance.
- W2.B–W2.G, persistence/Auth/Supabase, translation, AI, PIM, Realtime/Presence, Group, and advanced table editing remain deferred.
- This story is ready for independent review only. W2.A is not claimed merged or canonical until its PR is independently reviewed, merged, and reconstructed from GitHub.

### File List

- `docs/stories/2026-09-10-vnext-w2a-primitives-rendering.md`
- `src/labs/presys-editorial-proof/fixtures.ts`
- `src/vnext/application/document.ts`
- `src/vnext/domain/editorial-model.ts`
- `src/vnext/domain/index.ts`
- `src/vnext/publication/preflight.ts`
- `src/vnext/rendering/PageRenderer.tsx`
- `src/vnext/rendering/PrimitiveRenderer.tsx`
- `src/vnext/rendering/index.ts`
- `src/vnext/table/table-model.ts`
- `tests/vnext/application/application-actions.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `tests/vnext/proof/export-proof.mjs`
- `tests/vnext/proof/primitives-rendering.test.tsx`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`

### Change Log

- 2026-09-10: Dedicated W2.A implementation story created from the verified post-W2.0 canonical base and Principal-accepted authoring contract. No production code, project-memory document, commit, push, or PR change is part of this story-preparation edit.
- 2026-09-10: Interrupted W2.A implementation recovered from its existing worktree, validated against the merged W2.0 contract, completed through focused/browser/PDF/full-repository gates, and prepared for independent review without starting W2.B.
- 2026-09-10: PR #18 opened as the single W2.A review vehicle; durable project state/handoff updated to record the verified PR #17 base and PR #18 review state without claiming W2.A merged or canonical.
- 2026-09-10: W2.A amendment recovery completed in the existing branch-owning worktree (Case C): strict standalone `TextStyleSchema`, representative production Chromium/native-PDF primitive proof, six-primitive W1 page-duplication regression, explicit Shape/Line geometry evidence, and merge-durable project memory added without starting W2.B.
