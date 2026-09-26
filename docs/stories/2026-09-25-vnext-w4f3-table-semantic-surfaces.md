# W4.F.3 — Table Semantic Surfaces

Status: **IMPLEMENTED / UNDER REVIEW**

Canonical base:

`0671bd5664816140981c42c1b88208d6ad09a2f3`

Branch:

`feat/vnext-w4f3-table-semantic-surfaces`

## Scope

W4.F.3 completes the remaining Table semantic authoring surfaces without
introducing another Table engine, renderer, persistence authority, annotation
store, image store, or selection model.

Implemented scope is limited to Table title, caption/note/footnote authoring,
annotation references/reorder, Legend reorder/usage navigation, and Image Cell
authoring.
## Table title

`TableModel.title?: RichText` is now an explicit optional canonical surface.
Existing documents without a title remain valid.

The application action `table.title.set` supports create, safe simple-text
edit, no-op, and clear with title-local CAS. Existing advanced RichText is
preserved and simple editing fails closed rather than flattening formatting.

The canonical renderer places the title before captions and the grid.
Measurement captures a dedicated Table-title fact so intrinsic height reacts
to authored title content.

## RichText identity and clone

Table-title RichText participates in authored identity audit, ID reservation,
instantiation seed validation, Table instantiation, object/page duplication,
and catalog cloning.

RichText-local IDs remain outside the canonical structural-ID boundary, in
the same deliberate manner as Cell RichText, annotation text, and Legend
entry text.
## Annotations

Typed application actions now cover create, update, attach, detach, remove,
and reorder for `caption`, `note`, and `footnote`.

Creation plus initial reference attachment is one atomic application action.
Captions are Table-only. Notes and footnotes can reference either the Table or
one anchor Cell.

Updates use the existing safe simple-RichText reconciliation seam. Referenced
annotations cannot be removed; detach and remove remain separate explicit
operations. Reorder changes only canonical annotation order, while display
numbering remains derived from that order.

## Legend professional UX

The existing W4.D Legend model remains authoritative. W4.F.3 adds
`table.legend.reorder` with membership/order CAS and a father-facing
`Localizar usos` navigation affordance.

Usage navigation projects existing marker references into the existing
`TableSelection`; it does not mutate the document, history, or
`localSequence`.
## Image Cell authoring

Typed `table.cell.setImage` and `table.cell.clearImage` actions support
existing assets, replacement, clear, contain/cover, and numeric target width
and height.

The application boundary accepts integer-U target dimensions and materializes
canonical millimeters. Content and content-presentation are the narrow CAS
surfaces. Cell identity, style, annotations, and span/topology remain
independent.

Clear removes the Cell image content/presentation but intentionally does not
garbage-collect the referenced asset from the catalog.

## Asset Persistence Bridge

Table Cell upload reuses the existing `AssetPersistenceBridge.upload`
orchestration and lineage/staleness checks.

A successful upload is linked only by the typed `table.cell.setImage`
application action through `DocumentSession`. Runtime URL/state is installed
only after that canonical link succeeds. Upload callbacks do not mutate
`CatalogDocument` directly.
## History and authoring boundaries

Accepted semantic mutations participate in normal `DocumentSession`
Undo/Redo and `localSequence` causality. No-op operations create no history.

Active Cell drafts block unsafe semantic writes without silent commit or
cancel. Locked Tables remain application-authority failures. Closed Group
child Tables remain non-authorable without drill-down or automatic ungroup.
Covered Cells are not valid Image Cell targets.

## W4.E interaction

Title, referenced annotations, Legend, and Image Cell presentation contribute
to canonical rendering/measurement and can increase intrinsic Table height.

W4.F.3 does not resize the authored outer Table frame automatically.
`TABLE_CONTENT_OVERFLOW` may therefore reappear. The father-facing
`Ajustar altura` action remains the explicit W4.E resolution path.

## Persistence, publication and PDF

All new semantic state remains ordinary `CatalogDocument` data and therefore
uses the existing save/CAS/reopen flow.

The canonical renderer is shared by editor preview and publication. Dedicated
Chromium proof covers save/reopen, publication readiness after explicit Fit
Height, image presence, native A4 PDF generation, and substantive PDF.js text
assertions.
## Mobile and accessibility

The dedicated browser proof exercises the semantic route at 320, 360, and
390 px touch viewports, including title editing, annotation creation and
references, reorder, Legend usage navigation, Image Cell contain/cover and
dimensions, remove/replace, Undo/Redo, and Save.

All three widths are checked for global horizontal overflow. Disabled semantic
controls reuse explicit disabled-reason guidance and `aria-describedby`
rather than presenting a false remediation cause.

## Focused evidence

Focused suites cover semantic application actions, Table-title identity/clone,
pure authoring projections, renderer behavior, and shared image-upload
orchestration, including in-flight Cell staleness.

Dedicated proof:

`node tests/vnext/proof/editor-table-semantic-content-proof.mjs`

PASS token:

`W4.F.3 Table Semantic Content Chromium proof: PASS`
## Known limitations and next-wave boundary

W4.F.3 deliberately does **not** implement:

- professional RichText editing or bold/italic/list authoring UX;
- Text presets;
- standalone Image-object W4.F.4 controls;
- object/page W4.F.5 controls;
- Shape/Line professional work;
- page operations, zoom, pagination, or Table splitting;
- translation implementation;
- migrations or production deployment.

Those remain outside this wave. W4.F.3 is not canonical until independent
adversarial audit, Principal promotion, authorized merge, and post-merge
canonical closeout complete.
