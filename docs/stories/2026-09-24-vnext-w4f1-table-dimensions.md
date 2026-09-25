# W4.F.1 — Table Dimensions + Semantic Row/Column Authoring

STATUS: **IMPLEMENTED / UNDER REVIEW**

Canonical base: `85cd5dfb95564250a2edc752e8bd88b2a0bf6590`
Canonical base tree: `1f6c89c349d88bbdc5c46eaf90b529819c946dbe`
Branch: `feat/vnext-w4f1-table-dimensions`

## Scope

This slice implements only professional Row/Column dimension and semantic authoring on the one canonical VNext Table Engine. W4.F.2+, W4.G, database migrations, production deployment, and merge are not authorized.

## Reused canonical authorities

- `CatalogDocument` / `TableModel` remain sole authored authority.
- `resolveColumns()`, `resolveRows()`, `projectTracks()`, and `projectRows()` remain the sizing authorities.
- `reorderAxis()` remains the reorder/topology authority.
- integer-U remains physical authoring authority; renderer measurement stays integer-Q.
- `DocumentSession`, W3 persistence/autosave/recovery, canonical diagnostics and publication remain unchanged.
## Application actions

Added strict typed semantic actions:

- `table.rows.setProperties`
- `table.columns.setProperties`
- `table.axis.reorder`

Rows use narrow CAS over stable Row ID, role and height policy. Columns use narrow CAS over stable Column ID, dimension state, Table frame width and stable column order. Reorder is merge-sensitive and uses full expected Table CAS plus explicit stable axis order.

All multi-target mutations are atomic. Semantic no-ops produce no history/localSequence change and no affected/created IDs. Dimension/reorder commands preserve Table, Row, Column, Cell, RichText, Legend and annotation identities.

## Row authoring

Father-facing Row controls expose:

- Cabeçalho / Corpo / Seção;
- Automática / Mínima / Exata height;
- numeric mm value for MIN/FIXED;
- reset to Automática;
- one-step move up/down;
- multi-row property authoring.

Row boundary drag is preview-only during pointer movement and commits one `FIXED_MM` semantic action on pointerup. It does not resize the Table frame or call Fit Height.

A small ephemeral pending-height-mode state was required so an AUTO Row can choose Mínima/Exata even before a stable measured height is available: the document remains unchanged until Father supplies a numeric value.
## Column authoring

Father-facing Column controls expose:

- Flexível / Fixa;
- fixed width in mm;
- flex weight;
- minimum width;
- optional maximum width;
- multi-column property authoring;
- Igualar larguras;
- one-step move left/right.

Internal column-boundary drag resolves current canonical widths, previews ephemerally, authors only the adjacent pair atomically, preserves their combined integer-U width, and validates the final candidate through `resolveColumns()`.

Equalize preserves the selected combined integer-U width exactly, uses stable-order remainder allocation, writes fixed widths, and fails closed when min/max constraints prevent equality.

## Principal drag-calibration amendment

Independent Principal review found that the original Row/Column boundary drag incorrectly treated viewport/client pixels as canonical renderer pixels while the page stage is responsively scaled.

The amendment reuses the existing direct-manipulation calibration from `editor-interaction.ts`: viewport pointer displacement is calibrated from the canonical Page extent in integer U and the actual rendered Page extent measured at gesture start. The browser geometry is ephemeral interaction input only; it is never persisted or treated as CatalogDocument authority.

The flow is now:

`client delta px → calibrated canonical delta U → uToQ(deltaU) preview → existing W4.F.1 Row/Column preparation → existing typed action`.

No CSS zoom constant is hardcoded. No Application Action contract, CAS strategy, Table Engine solver, renderer, persistence contract or authored physical representation changed.

Focused calibration coverage exercises effective rendered scales corresponding to approximately 1.00, 0.62, 0.58 and 0.35. The dedicated Chromium proof now verifies externally observable pointer/preview/committed-boundary fidelity at two distinct desktop rendered scales, plus canonical authored Row/Column dimensions and exact adjacent-column total preservation.

## Reorder / merged topology

Axis reorder preserves semantic Row/Column IDs and Cell identity. It delegates to canonical `reorderAxis()`; merged topology that cannot be reordered fails closed with no implicit unmerge. Selection remains anchored by stable semantic ID after successful reorder.

## W4.E / diagnostics interaction

Row/Column changes never auto-run `table.fitHeight`. FIXED rows can continue to surface `ROW_CONTENT_OVERFLOW`. Narrower columns may increase wrapping and cause `TABLE_CONTENT_OVERFLOW` while the authored outer Table frame remains unchanged. Father must explicitly invoke **Ajustar altura** when appropriate.
## Father UX / accessibility / mobile

The existing Inspector was evolved; no second Professional Inspector was created. Common Row/Column controls are shown contextually, while min/max/flex-weight details sit under **Avançado**.

Selectors, buttons, inputs and selects are semantic controls. Resize handles have accessible names and numeric Inspector controls remain the mandatory accessible alternative to drag.

Dedicated Chromium evidence exercises touch-visible routes at 320×900, 360×900 and 390×900 with no global body/document horizontal overflow.

## Draft / history / persistence

Active W4.B Cell Editing disables dimension/reorder mutation and hides drag handles; no dimension action silently commits/cancels an active draft.

Each logical command is one `DocumentSession` history transition. Pointer preview is zero history; cancel/no-op is zero mutation. Committed state flows through existing W3 dirty/autosave/Save/reopen authority—no W4.F-specific persistence/recovery coordinator exists.

Controlled Save/reopen proof preserves exact Row roles/policies/order, Column modes/constraints/order and stable IDs; reopened history resets normally.
## Evidence

Focused tests:

- `tests/vnext/application/table-professional-dimensions-actions.test.ts`
- `tests/vnext/editor/table-dimension-authoring.test.ts`

Dedicated real-browser proof:

- `tests/vnext/proof/editor-table-professional-dimensions-proof.mjs`

It covers Row role/AUTO/MIN/FIXED, Row drag, Column fixed/flex/weight/min/max, Column drag, equalize, stable-ID reorder, merged-topology rejection, W4.B draft barrier, W4.E explicit-Fit separation, Save/reopen, mobile 320/360/390, canonical publication and native Chromium A4 PDF. Error budget requires zero console/page/resource/request failures.

The proof is appended after W4.E in the existing **VNext Chromium and PDF proofs** Quality Gate stage; no prior proof command or workflow trigger/job is removed.

## Exact exclusions / scope audit

No typography, vertical Cell alignment, border editor, Table style editing, presets, Table title, annotations, Legend reorder, Image Cell authoring, professional RichText editor, Text/Image/Object/Page W4.F controls, pagination, Table splitting, automatic Fit, second solver, second Table Engine, second renderer, second persistence authority, database migration, production deploy, W4.F.2, W4.G or merge.

## Known limitations / W4.F.2 carry-forward

W4.F.1 intentionally does not add presentation styling. Typography, borders, vertical alignment, style cascade authoring and Table presets remain W4.F.2. Desktop drag complements—never replaces—the numeric/touch route.

Final status remains **IMPLEMENTED / UNDER REVIEW** pending independent adversarial audit and explicit Principal gate.
