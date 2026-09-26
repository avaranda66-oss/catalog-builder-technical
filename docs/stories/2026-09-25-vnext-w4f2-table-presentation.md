STATUS: **IMPLEMENTED / UNDER REVIEW**

Canonical base: `e72c111bd02143a1ed1689f4bb80b058845584ff`
Canonical base tree: `a645b32ba7ee1b5aae4bf1270af4973bef354cfe`
Branch: `feat/vnext-w4f2-table-presentation`

## Scope

W4.F.2 implements only professional Table presentation authoring on the one canonical VNext Table Engine. It adds typography, vertical content alignment, palette-first colors, padding, borders, inheritance/reset, mixed-state projection, and four curated Table presets. W4.F.3+, W4.G, migration, production deploy and merge remain explicitly out of scope.

## Existing style cascade authority

The existing canonical cascade remains unchanged and authoritative:

`Document default → Table base → Row role → Column → Row → Cell`.

No React-only cascade and no alternate style model were introduced. `resolveCellStyle()` remains the canonical resolver used by editor projection, renderer, measurement and publication. During the final full-suite architecture gate, the resolver was moved from the presentation-named `rendering/style.ts` module into pure `domain/style-resolution.ts`; `rendering/style.ts` now reexports that same authority. This keeps Application below Presentation without duplicating cascade semantics.

## Additive domain delta: verticalAlign

`CellStyle` gains exactly one additive property:

`verticalAlign?: 'top' | 'middle' | 'bottom'`.

`ResolvedStyle` defaults unresolved vertical alignment to `top`. The canonical `TableRenderer` places the existing Cell flow inside the already-resolved Cell box using top/middle/bottom flex placement. The property does not participate in `resolveRows()`, intrinsic content requirement, authored Table frame, Column dimensions or Fit Height calculation.

Renderer regression coverage includes merged Cells and Image Cells without changing span topology or image fit semantics.

## Semantic Application Actions

W4.F.2 adds strict style-layer actions:

- `table.style.setBase`
- `table.style.setRowRole`
- `table.rows.setStyle`
- `table.columns.setStyle`
- `table.preset.apply`

Existing `table.cell.setProperties` is extended for professional Cell-local style properties instead of creating a duplicate Cell-style engine.

The shared style patch supports font family, font size, line height, 400/700 weight, text/background color, horizontal/vertical alignment, padding and canonical per-side borders. Absent means unchanged; value means set local override; `null` means delete local override and inherit.

## Narrow CAS / atomicity / no-op

CAS is intentionally scoped to the authored style layer:

- Table base: expected base style, plus expected annotation gap only when changing that gap.
- Row role: role + expected role style.
- Row: stable Row ID + expected Row style.
- Column: stable Column ID + expected Column style.
- Cell: expected Cell style; contentPresentation participates only when wrap is actually being changed.
- Preset: complete relevant presentation snapshot plus stable Row IDs/roles/order and Column IDs/order.

Unrelated content changes do not stale style-only actions. Actual target-style changes do. Multi-target Row/Column mutations are atomic. Semantic no-ops produce `changed=false`, empty affected/created IDs and zero history/localSequence.

## Inherit/reset and mixed state

Reset never copies the currently resolved value into the local layer. It removes the local property, allowing the lower cascade layer to become effective.

The pure authoring projection reports both effective value and ownership. Father-facing UI distinguishes `Local`, `Herdado...` and `Misto` textually.

A browser-discovered defect where the Inspector rendered the Father-facing string `Local` but compared it against the canonical ownership token `local` was fixed by separating canonical ownership from the display label. This restores the real **Herdar** affordance.

## Font validation

Font family is selected only from normal faces declared in `DocumentStyle.fonts`; arbitrary CSS font strings are not accepted. Available 400/700 weights are projected per family. Executor validation rejects undeclared families and declared family/weight combinations that do not exist in the document font registry.

The Chromium proof includes a second declared family (`Noto Sans JP`), confirms the real browser font resource loads, applies it through the visible Inspector, saves, switches catalog and reopens with the exact authored family preserved.

## Color policy

Quick colors come from `DocumentStyle.palette` with accessible names containing their canonical HEX value. Advanced authoring accepts only canonical `#RRGGBB` values. Text and background colors use the existing `CellStyle` fields.

## Padding

Quick deterministic recipes are:

- Compacto: 0.6 mm all sides
- Normal: 1.2 mm all sides
- Amplo: 2.0 mm all sides

Advanced mode exposes top/right/bottom/left with linked or independent editing and per-side inheritance reset. No CSS px or browser geometry is persisted.

## Borders

Canonical `CellStyle.borders` and the existing border conflict/paint engine remain authority. W4.F.2 supports only the already-canonical `none` and `solid` patterns.

Quick recipes:

- Sem bordas
- Todas
- Externas
- Internas
- Somente horizontais
- Somente verticais
- Separador de cabeçalho

For explicit Cell ranges, topological presets such as Externas/Internas materialize ordinary per-Cell canonical side borders; no borderPresetId is persisted. Advanced mode exposes each side's type, thickness in pt and color. `BORDER_CONTENT_CLEARANCE` remains canonical and padding is never silently changed to hide it.

Because border authoring can change the canonical paint-edge set at runtime, the hidden diagnostics probe now waits for the rendered `data-paint-edge` identity set to converge to the just-recomputed canonical `plan.edges` before snapshot capture. This is a renderer/probe synchronization guard only: the border engine, measurement authority and diagnostic rules are unchanged.

## Annotation gap

For Table scope, Advanced exposes the existing `TableStyle.annotationGapMm` as **Espaçamento das notas/legenda**. No caption/note/Legend content authoring is added.

## Curated Table presets

Exactly four deterministic presets are registered:

1. Especificação Técnica
2. Grade Técnica
3. Comparação
4. Minimalista

Each preset is a pure recipe executed through one typed `table.preset.apply` action and materializes ordinary canonical Table base + role styles. No `presetId` is persisted and no renderer magic exists. Presets preserve IDs, content, contentPresentation, row roles, dimensions, spans, coveredBy, annotations, Legend, marker references and object frame. They remain fully editable immediately after application.

Undo/Redo restore exact pre/post materialization and reapplying an identical preset is a semantic no-op.

## Inspector / Father UX

The existing Inspector is evolved; there is no second Professional/Mobile/Preset Inspector system.

Default scope follows selection:

- Cell → Célula
- Row → Linha
- Column → Coluna
- whole Table → Tabela

Row-role style is an explicit Table-style submode: Cabeçalho / Corpo / Seção.

Primary controls expose common typography, colors, horizontal/vertical alignment and quick padding. Advanced exposes line height, per-side padding, per-side borders and Table annotation gap.

Active W4.B Cell Editing or a locked Table disables presentation mutation rather than silently committing/cancelling the draft. Closed Group boundaries remain enforced by the existing Application Action target guard; no Group drill-down or automatic ungroup was added.

## W4.F.1 regression boundary

Presentation actions do not mutate Row roles/height policies, Column dimensions/constraints, axis order, integer-U drag calibration, Table frame or reorder semantics. Existing W4.F.1 remains the dimensions authority.

The first regression run exposed a UI-layout interaction: the taller W4.F.2 Inspector could make browser focus scroll the shared canvas area far enough that W4.F.1 physical drag handles were outside the viewport. The fix is presentation-only: on desktop `.vnext-info` owns its vertical scroll; mobile restores normal visible document flow. No W4.F.1 drag, solver, calibration or action code changed. The clean W4.F.1 Chromium proof then passed at both desktop scales and 320/360/390 mobile.

## W4.E interaction

Typography/padding/border changes rerun canonical measurement. They never auto-run `table.fitHeight` and never resize the authored outer Table frame.

The dedicated proof increases Body vertical padding until canonical publication reports `TABLE_CONTENT_OVERFLOW`, confirms the frame is unchanged, then uses the real explicit **Ajustar altura** path. Fit changes height only and publication returns to READY once no blocking ERROR remains.

## Accessibility / mobile

Controls are real buttons/inputs/selects. Advanced uses `aria-expanded`; disabled controls receive the existing disabled reason; palette swatches have accessible HEX names; `Misto`, `Local` and inheritance are textual.

Touch-visible proof runs independently at:

- 320×900
- 360×900
- 390×900

At each width it exercises Cell font size, colors, horizontal/vertical alignment, inheritance reset, Row style, Column style, Table base style, one preset, quick padding, quick border, Advanced reachability, Undo, Redo and Save. Document/body scroll width remains exactly within the viewport.

## Save / reopen / W3 authority

No W4.F.2 autosave/recovery coordinator exists. Committed style actions flow through the existing `DocumentSession → dirty → W3 persistence` authority.

Controlled Save/switch/reopen deep-compares Table base, role styles, Row/Column/Cell styles and the exact materialized preset result. Stable Table/Row/Column/Cell IDs, content and topology remain unchanged; reopened history resets normally.

## Publication / PDF

The canonical renderer is shared by editor measurement and publication. The dedicated proof verifies styled output through publication with no editor chrome, Inspector, palette or selection overlay.

It produces a native Chromium A4 PDF and uses PDF.js for substantive text extraction (`Parâmetro`). Border paint remains canonical. The final dedicated-browser error budget requires zero console, page, resource and request failures.

## Focused evidence

Focused W4.F.2 tests:

- `tests/vnext/application/table-professional-style-actions.test.ts`
- `tests/vnext/editor/table-style-authoring.test.ts`
- `tests/vnext/rendering/table-style-cascade.test.ts`
- `tests/vnext/rendering/table-style-renderer.test.tsx`

Final focused total:

- 4 files
- 28 passed
- 0 failed

Dedicated proof:

- `tests/vnext/proof/editor-table-professional-style-proof.mjs`
- Chromium `151.0.7922.34`
- PASS
- mobile 320/360/390 PASS
- publication/PDF PASS
- `consoleErrors=[]`
- `pageErrors=[]`
- `failedResources=[]`
- `requestFailures=[]`

Full local suite after the final architecture correction:

- 264 test files passed / 264
- 2789 tests passed
- 1 skipped
- 0 failed

Final local gates:

- ESLint: 0 errors / 268 pre-existing repository warnings
- TypeScript: PASS
- Build: PASS
- `git diff --check`: PASS
- W4.F.1 dedicated Chromium regression: PASS
- W4.F.2 dedicated Chromium proof: PASS

The Quality Gate appends W4.F.2 immediately after `editor-table-professional-dimensions-proof.mjs` in the existing **VNext Chromium and PDF proofs** step; no prior proof is removed.

## Known limitations / W4.F.3 boundary

W4.F.2 intentionally does not provide Table title, annotation authoring, Legend reorder/navigation, Image Cell authoring, professional RichText marks/lists, Text presets, standalone Image/Object/Page presentation tooling, Format Painter, Paste Special, zebra-striping engine, pagination or Table splitting.

Font authoring remains limited to declared normal document faces and the current 400/700 canonical weight boundary. Border patterns remain none/solid only. Externas/Internas require an explicit Cell selection because their topology cannot be represented truthfully as one repeating Table/Row/Column style patch.

Those later professional authoring capabilities remain deferred to W4.F.3+ or later authorized slices.

## Scope audit

No Table title, annotation authoring, Legend reorder, Image Cell authoring, professional RichText editor, Text preset, Image object presentation, object alignment, Page UX, zoom control, context-menu authority, Format Painter, Paste Special, zebra-striping engine, pagination, Table splitting, automatic Fit, second style engine, second renderer, second Table Engine, second persistence authority, database migration, production deploy, W4.F.3, W4.F.4, W4.F.5, W4.G or merge.

Final status remains **IMPLEMENTED / UNDER REVIEW** pending exact-head CI, independent adversarial audit and explicit Principal promotion gate.
