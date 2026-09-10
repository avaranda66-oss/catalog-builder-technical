# Catalog Builder VNext — W2 A4 Authoring Contract

STATUS: READY FOR PRINCIPAL AUDIT — CONTRACT ONLY, NO W2 FEATURE IMPLEMENTATION

DATE: 2026-09-10

Canonical post-W1 base: `0975953da7a8748b483ba8f64cb69c7cdb9172f6`

Canonical post-W1 tree: `d617b9089b2e5dbc94ed02b438e821d7885da6f3`

Purpose: freeze the smallest executable contract for **W2 — A4 Authoring + Primitives + Direct Manipulation** so implementation does not invent domain or mutation authority inside React, pointer handlers, or the DOM.

This document is a contract for subsequent implementation PRs. It does not authorize W2 feature implementation and does not merge anything.

## 1. Authority and preserved foundations

W2 inherits these authorities without reopening them:

- `Catalog → Pages → Objects → Properties` is the canonical hierarchy.
- Pages are finite physical A4 surfaces.
- The user owns authored page placement, `x`, `y`, `width`, `height`, z-order, overlap, and composition.
- The system may calculate snapping, guides, safe-margin feedback, overflow diagnostics, and publication validation; those calculations do not silently rewrite authorship.
- Renderer/measurement observes authored state. It does not move objects, resize frames, create continuation pages, or change authored topology.
- Authored physical calculations use deterministic integer `PhysicalLengthU`; browser measurements use integer `PhysicalPixelQ`; blocking rendered fit stays Q/Q under R0.1.4.
- The existing Table Engine remains the only Table Engine.
- W1 strict typed Application Actions, canonical validation, immutable session snapshots, semantic no-op behavior, deterministic injectable ID generation, Undo/Redo, and `transactionId` coalescing remain the mutation foundation.
- RichText paragraph/inline IDs remain local to each independent `RichText`; W2 must not globalize them.
- `src/vnext/index.ts` remains pure domain/table. Application stays React/DOM/browser independent. Rendering and publication retain their W0.1 boundaries.
- Production `DocumentRenderer` renders canonical document content only and remains usable for publication.

Historical evidence consumed for this contract:

- `docs/vnext/PROJECT-STATE.md`;
- `docs/vnext/PRINCIPAL-HANDOFF.md`;
- `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`;
- `docs/vnext/presys-mvp-r0/README.md`;
- `docs/vnext/presys-mvp-r0/03-arquitetura.md` and `04-tabelas.md` where they define authored-frame and command-boundary semantics;
- `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md`;
- `docs/vnext/presys-mvp-r0/evidence/proof-result.md`;
- `docs/stories/2026-09-09-vnext-w0-foundation-promotion.md`;
- `docs/stories/2026-09-10-vnext-w1-application-actions-shell.md`;
- `tests/vnext/proof/architecture-boundary.test.ts`;
- current `src/vnext/domain`, `table`, `application`, `rendering`, and `publication` code;
- `lab/vnext-editor-ux-astra` only as interaction evidence, especially its direct manipulation, safe-margin, content/chrome separation, Replace Image, and template-to-editable-object findings.

The following are deliberately not reopened: R0.1.4 projection math, global rowspan solving, FIXED/AUTO/MIN row behavior, the one Table Engine, canonical render-tree publication, Chromium textual/vector PDF direction, W0.1 import/CSS/footer boundaries, W1 action authority, W1 history semantics, and RichText-local identity scope.

## 2. Canonical physical geometry

The current canonical document schema stores page and frame values in authored millimetre fields:

```ts
type Frame = {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};
```

W2 **does not rename or replace this serialized schema merely to expose U in the editor**. The R0 contract already defines the boundary: authored decimal mm is normalized deterministically into integer U before physical arithmetic, and U is the authority for equality, fit inputs, snapping, action geometry, and geometry tests.

Every W2 geometry-changing Application Action therefore accepts integer U, not browser px and not unquantized pointer floats. When an action writes the existing frame schema, it materializes `U / 10_000` into the `*Mm` field and must preserve the round-trip invariant:

```text
mmToU(writtenMm) === suppliedU
```

No action may make a geometry decision using epsilon comparisons or raw DOM floating-point coordinates.

`zIndex` remains a safe integer on the object. Rendering order remains deterministic by `(zIndex, page.objects array order)` as today. User-facing reorder actions own deliberate z-order changes; renderer order is never mutation authority.

### 2.1 Legal and illegal frames

- Negative `x` and `y` are schema-legal. They represent deliberate authored placement that extends outside the physical page and produce a blocking page-bounds diagnostic.
- Objects may cross or sit outside safe margins. Safe margins are guidance, not a placement constraint.
- Objects may extend outside the physical A4 page in authored state. This is not silently clamped; it produces a blocking publication diagnostic.
- Independent objects may overlap. Overlap is legal authored composition and remains a warning by default.
- Width and height must normalize to at least `1 U`. Zero, negative, non-finite, unsafe, or non-quantizable dimensions are invalid geometry and must fail the action/schema validation path.
- `x`/`y` must normalize to safe integer U. Non-finite or unsafe values are invalid geometry.
- `zIndex` must be a safe integer.
- Primitive-specific invalid references or styles fail closed through typed validation.

The `1 U` minimum is a canonical data minimum, not a UX handle size. The editor may enforce a larger interaction minimum for usability only when the resulting minimum is explicit, deterministic, primitive-aware, and submitted through the typed action. W2 does not freeze such UX minima yet.

### 2.2 Schema errors versus diagnostics

Schema/action errors describe content that cannot become canonical: malformed action data, unknown fields, unsupported primitive variants, invalid IDs, non-finite geometry, non-positive dimensions, unsafe integers, impossible typed styles, or dangling references that canonical validation defines as errors.

Diagnostics describe canonical authored content whose physical/layout result needs attention: outside safe area, outside page, overlap, text overflow, table overflow, and resource/publication failures. A diagnostic must never silently repair the document.

## 3. Primitive contract

All implemented page primitives share the existing object base:

```ts
type ObjectBase = {
  id: string;
  frame: Frame;
  zIndex: number;
  locked?: boolean;
};
```

`id` is globally unique at `CatalogDocument` structural identity scope. `frame` is user-authored. `locked` is an editor authoring affordance that prevents ordinary UI mutation when true; renderer still renders the object. Authorization for future AI actions must obey the same lock semantics unless an explicit unlock action is invoked.

### 3.1 Text

Minimum delta: **none to the existing canonical Text shape for W2**.

Canonical properties remain `id`, `type:'text'`, `frame`, `zIndex`, `locked?`, canonical `RichText`, existing `CellStyle`, and the existing text `height` policy. The current production renderer/preflight use the authored frame as the physical width/height envelope; W2 therefore preserves the `height` field for schema compatibility but does not reinterpret it as a second physical frame authority. W2 move/resize mutates `frame` only. Removing, repurposing, or making `height.mode:'auto'` rewrite `frame.heightMm` would reopen W0 and is outside W2.

Translation relevance: **yes**. The canonical RichText is semantic source content. Existing RichText-local paragraph/inline identity rules remain intact.

Renderer responsibility: render canonical RichText with resolved document/text style inside the authored frame, measure in Q, and report overflow without changing the frame or content.

Future direct-editing seam: a later typed `text.setContent`/equivalent action may replace or structurally edit canonical RichText while preserving local identity rules. W2 does not build a rich-text editing framework merely to support object insertion/move/resize.

### 3.2 Image

W2 adds a standalone Image object with only:

```ts
type ImageObject = ObjectBase & {
  type: 'image';
  assetId: string;
  fit: 'contain' | 'cover';
};
```

`assetId` references an entry in `CatalogDocument.assets`. The asset record owns name, MIME, pixel dimensions, checksum/version, and accessibility alt text. The Image object does not duplicate that metadata.

`contain` shows the complete source inside the authored frame. `cover` fills the authored frame using deterministic centered cropping. W2 does **not** add focal point, arbitrary crop rectangles, opacity, masking, corner radius, filters, or rotation. Those remain future additions if concrete product evidence requires them.

Replace Image seam: typed `image.replace({ objectId, assetId })` changes the asset reference while preserving frame, fit, z-order, and object identity. It must reference an existing canonical asset.

Translation relevance: no visible editorial text in the W2 Image object. Asset alt/localization policy may evolve with the translation wave without changing image geometry.

Renderer responsibility: resolve only declared canonical assets through the existing asset URL/resource boundary; paint according to `fit`; never resize the authored frame. Missing/unready assets remain publication diagnostics.

### 3.3 Table

Minimum delta: **none to TableModel internals**.

The Table object remains `ObjectBase + { type:'table', table: TableModel }`. W2 treats the table as one canvas object whose frame is movable/resizable. Table rows, columns, cells, spans, annotations, legends, typed cell content, solver semantics, and IDs remain owned by the canonical Table Engine.

Translation relevance: yes, through existing semantic RichText leaves and later complete translation coverage.

Renderer responsibility: re-resolve table layout from the current authored frame width, measure intrinsic content in Q, report existing row/cell/table overflow, and never write a new object frame.

### 3.4 Shape

W2 adds a deliberately small Shape object:

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

This supports the technical-catalog evidence for color fields, banners, boxes, callouts, and simple circular/elliptical decoration. Shape contains no text; compose a Text object when copy is required.

W2 does not add gradients, arbitrary paths, Bezier editing, shadows, blend modes, rotation, or vector boolean operations.

Translation relevance: none.

Renderer responsibility: paint the chosen geometry entirely inside the authored frame. Stroke must not expand the physical object bounds outside the authored frame.

### 3.5 Line

W2 adds a straight axis-aligned line only:

```ts
type LineObject = ObjectBase & {
  type: 'line';
  axis: 'horizontal' | 'vertical';
  color: '#RRGGBB';
};
```

The authored frame is the full line ink box: the long axis is line length and the cross axis is thickness. This avoids a second hidden stroke envelope and keeps all physical paint inside the universal object frame.

W2 does not add diagonal lines, arrows, endpoints, paths, or Bezier editing. Those require separate evidence.

Translation relevance: none.

Renderer responsibility: fill the authored frame with the line color. Editor hit-target expansion, if any, belongs only to overlays and must not change publication geometry.

### 3.6 Icon

W2 adds an asset-backed Icon object:

```ts
type IconObject = ObjectBase & {
  type: 'icon';
  assetId: string;
};
```

Icon uses deterministic `contain` rendering inside its frame. It does not embed authored SVG path commands. W2 may extend `AssetRef.mime` to allow `image/svg+xml` under the same declared-asset/resource-readiness boundary; SVG is an asset capability, not a vector-authoring engine. Raster assets remain legal where appropriate.

Translation relevance: none in the W2 object. Accessibility/localization metadata remains an asset concern.

Renderer responsibility: render the declared asset inside the frame and surface missing/unready asset diagnostics. No inline arbitrary SVG/HTML is accepted from document JSON.

### 3.7 Group

Group is a required Father-V1 capability, but **W2.A–W2.E must not invent a nested coordinate system to satisfy it quickly**.

W2.0 therefore reserves Group for a dedicated **W2.F Group Contract + Implementation** slice after single-object direct manipulation and template instantiation are proven. No serialized Group shape is added in W2.A–W2.E.

The compatibility seam is explicit:

- editor selection state is modeled as an ordered set/array even while W2.C exposes only single selection;
- object actions remain object-ID based and can later gain group-specific typed actions without JSON patching;
- template insertion instantiates ordinary objects and does not require Group;
- render/publication unions remain exhaustive so Group cannot appear without an explicit renderer/preflight implementation;
- W2.F must decide child ownership, coordinate space, frame derivation, resize semantics, z-order, duplicate/delete, and ungroup atomically before any production Group object exists.

W2.F must not ship a partially defined Group whose move works but resize/z-order/ungroup semantics are ambiguous.

## 4. Selection ownership

Selection is **ephemeral application/editor interaction state**. It does not belong in `CatalogDocument`, publication snapshots, or the canonical render tree.

Minimum editor state:

```ts
type EditorSelectionState = {
  activePageId: string;
  selectedObjectIds: readonly string[];
  mode: 'select' | 'text-edit';
};
```

W2.C exposes single-object selection by keeping `selectedObjectIds` at length `0 | 1`. The array shape is the future multi-selection seam. The state references canonical IDs but does not duplicate objects or document properties.

`activePageId` is navigation/editor state. Page ordering and page IDs remain canonical; which page the editor is looking at is not authored catalog content.

`mode` is ephemeral. `text-edit` reserves the future direct RichText-editing interaction without adding edit cursors, selections, or DOM ranges to `CatalogDocument`.

Selection changes never create Undo history, never clear Redo, and never affect publication output.

## 5. W2 Application Action family

All W2 actions extend the W1 strict discriminated union. Payloads are strict and browser independent. Unknown fields fail closed. There is no unrestricted document replacement, arbitrary JSON patch, or unrestricted generic property bag.

Minimum action family:

```ts
object.insert({ pageId, object: insertSpec })
object.delete({ objectId })
object.duplicate({ objectId, xU?, yU? })
object.move({ objectId, xU, yU })
object.resize({ objectId, xU, yU, widthU, heightU })
object.reorder({ objectId, targetIndex })
image.replace({ objectId, assetId })
page.template.insert({ templateId, afterPageId? })
```

`object.resize` carries the complete final frame in U so left/top handles are representable without browser-specific delta semantics. `object.move` preserves width/height. `object.duplicate` defaults to the exact source frame; a UI that wants an offset supplies explicit `xU`/`yU`.

`object.insert` uses a strict discriminated `ObjectInsertSpec`, not arbitrary JSON and not a caller-supplied canonical `EditorialObject`. Every variant carries `frameU:{xU,yU,widthU,heightU}` plus only the typed content/style/reference fields required by that primitive; `zIndex` may be explicit or may use one documented insertion default. The action converts `frameU` through the U→authored-mm boundary described in section 2. The application layer allocates the object ID and all other canonical identities. A caller therefore does not need DOM state or globally invented IDs to insert content.

For Text insertion, the typed seed may contain semantic RichText content but application instantiation owns fresh local paragraph/inline IDs. For Table insertion, the typed seed may contain an internally referential valid TableModel/template shape; application instantiation must deep-fresh structural IDs and remap table references exactly as page duplication already does. RichText identity is regenerated independently per RichText. This is a typed instantiation boundary, not a second canonical document model.

`object.reorder` interprets `targetIndex` against the current deterministic visual order `(zIndex, existing array order)`, moves that object in the order, and normalizes the page objects' `zIndex` to contiguous safe integers. This makes z-order explicit and removes accidental dependence on whatever historical numeric gaps happen to exist. Reordering to the current index is a semantic no-op.

`locked:true` objects reject ordinary object mutation actions with a structured `OBJECT_LOCKED` failure. An explicit future unlock action may change that state; mutation actions must not silently ignore a lock.

### 5.1 Result and failure semantics

W2 preserves the W1 `ApplicationActionResult` shape:

- success returns the validated canonical document plus `actionType`, `affectedIds`, `createdIds`, and `changed`;
- semantic no-op returns `ok:true`, `changed:false`, the current canonical snapshot, no history entry, and no Redo clearing;
- failure returns a structured error and leaves document/history/ID consumption unchanged whenever the target can be validated before allocation;
- candidate documents are canonically validated before success is published.

W2 adds only action-specific error codes needed for precise failures, including at least `OBJECT_NOT_FOUND`, `OBJECT_LOCKED`, `INVALID_GEOMETRY`, `INVALID_Z_ORDER_TARGET`, `OBJECT_TYPE_MISMATCH`, `ASSET_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, and existing W1 ID/document failures.

## 6. Direct-manipulation transaction model

The first W2 direct-manipulation rule is:

> **one user gesture → one Undo-visible semantic transaction**

Pointer events are input sampling, not domain mutations.

### 6.1 Move/resize lifecycle

1. `pointerdown` records the selected object ID, the immutable canonical start frame in U, pointer-start coordinates, zoom transform, and a fresh gesture `transactionId` in editor interaction state.
2. `pointermove` derives a candidate frame from the **start frame**, not from the previous pointermove result. Browser coordinates are converted at the editor boundary into a candidate U delta. Optional snapping resolves that candidate to another U frame.
3. Intermediate candidate positions **do not enter `DocumentSession`** and do not create history.
4. During the gesture, the editor renders an ephemeral visual transform/preview from the candidate frame.
5. `pointerup` compares the final candidate U frame to the current canonical frame. If identical, the gesture ends as a semantic no-op. Otherwise it executes exactly one `object.move` or `object.resize` with the final U frame and the gesture `transactionId`.
6. Successful commit clears the preview and the normal canonical render reflects the new frame.
7. `Escape` or pointer cancellation discards the preview without executing an Application Action.

Cancelled/no-op gestures do not create history and do not clear Redo.

### 6.2 W1 `transactionId` participation

W2 drag/resize does not depend on streaming hundreds of actions into the session. The first implementation commits one final action.

The W1 `transactionId` seam remains required because a future legitimate gesture may require multiple canonical actions, such as multi-object movement. Contiguous actions carrying the same gesture transaction ID must coalesce into one Undo step under the existing W1 rules. `transactionId` is therefore semantic transaction metadata, not a license to make pointermove canonical.

## 7. Preview authority

Preview is ephemeral interaction state, not a second document authority.

Minimum model:

```ts
type InteractionPreview = {
  transactionId: string;
  objectId: string;
  kind: 'move' | 'resize';
  frameU: { xU: number; yU: number; widthU: number; heightU: number };
};
```

`DocumentSession.getSnapshot().document` remains the only canonical authored document during the gesture.

The editor may apply a temporary CSS transform/size to the already-rendered object element or render equivalent overlay geometry. That DOM presentation is explicitly **preview only** and is never read back as mutation truth. The final action payload is computed from interaction state + canonical start frame, not from `getBoundingClientRect()` at commit time.

`DocumentRenderer` does not gain `selection`, `preview`, handles, guides, or editor-state props. Publication therefore cannot accidentally include interaction state.

If final commit fails, the editor immediately clears the preview, renders the unchanged canonical snapshot, and surfaces the structured failure. No partial frame enters history.

## 8. Canonical rendering versus editor overlays

Two responsibilities remain explicit:

**Canonical document rendering** under `[data-editorial-root]` renders only pages and authored objects. It is suitable for screen preview, measurement, and publication.

**Editor overlays** live outside the canonical publication tree and may render:

- selection outline;
- resize handles;
- move affordance;
- hover state;
- snap lines;
- safe-margin emphasis;
- guide labels;
- warning badges;
- pointer hit targets larger than physical ink.

Overlays may reference canonical IDs and derived geometry. They do not become `EditorialObject`s, do not participate in measurement, and do not appear in Chromium publication output.

Architecture tests must continue proving that production renderer props contain canonical rendering inputs only and that selection/preview state does not affect publication rendering.

## 9. Snapping ownership

Snapping is a pure calculation used while resolving an explicit move/resize gesture. It does not mutate `CatalogDocument` by itself.

First W2 snapping candidates are intentionally limited to:

- physical page edges;
- page horizontal/vertical center;
- configured safe-area boundaries;
- other object left/right/top/bottom edges;
- other object horizontal/vertical centers.

Persistent user-authored ruler guides are not part of the first W2 slice. The visual snap lines returned by the calculation are ephemeral overlays.

Pure boundary:

```ts
resolveSnap({
  candidateFrameU,
  pageBoundsU,
  safeAreaU,
  siblingFramesU,
  thresholdU,
  axes
}) -> {
  frameU,
  guides
}
```

The function receives a U threshold; it does not know browser pixels, zoom, React, pointer events, or DOM nodes. The editor may derive `thresholdU` from its zoom/input policy before calling the pure function.

Tie breaking is deterministic: choose the smallest absolute U adjustment, then stable candidate-kind priority (`safe-area`, `page-edge`, `page-center`, `object-edge`, `object-center`), then stable object ID/edge order. Move resolves X and Y independently. Resize resolves only the edges controlled by the active handle.

Disabling snapping changes only candidate resolution; it does not change canonical document schema.

## 10. Safe margins

`Page.safeArea` remains the canonical optional per-side safe area. W2 does not add another margin authority.

Safe-area behavior:

- it is visually subtle at rest and may become stronger during selection/movement;
- crossing it is allowed;
- snapping may use it as a candidate when enabled;
- the system never clamps an object back inside it;
- violation is a `WARNING` and does **not** block publication by itself.

W2 canonical diagnostic name: `OBJECT_OUTSIDE_SAFE_AREA / WARNING`.

The current W0 implementation name `SAFE_AREA_VIOLATION` has the same semantics. W2.D should normalize/alias the outward code without changing the established warning behavior.

If `safeArea` is absent, no safe-area diagnostic is emitted and no implicit default is invented by preflight. New blank pages may continue using the existing explicit 12 mm default supplied by the document/page factory.

## 11. Page bounds, overflow, and overlap diagnostics

The existing diagnostic severities are `ERROR` and `WARNING`; W2 does not introduce an `INFO` level merely for terminology. In publication, `ERROR` is blocking and `WARNING` is reviewable/non-blocking.

| Condition | W2 canonical code | Severity | Publication | Required behavior |
|---|---|---|---|---|
| Frame crosses configured safe area | `OBJECT_OUTSIDE_SAFE_AREA` | `WARNING` | Non-blocking | Keep authored frame; show guidance. |
| Any frame ink box crosses physical page | `OBJECT_OUTSIDE_PAGE` | `ERROR` | Blocking | Keep authored frame; require explicit user correction. |
| Text intrinsic rendered content exceeds authored frame | `TEXT_CONTENT_OVERFLOW` | `ERROR` | Blocking | Keep text/frame; no auto-grow or font shrink. |
| Table intrinsic content exceeds authored table frame | `TABLE_CONTENT_OVERFLOW` | `ERROR` | Blocking | Keep table/frame; no automatic fit-height. |
| Independent object frames overlap | `OBJECT_OVERLAP` | `WARNING` | Non-blocking | Preserve overlap; it may be intentional composition. |

The current W0 text diagnostic `TEXT_OBJECT_OVERFLOW` has the intended R0.1.4 semantics. W2.D should normalize/alias it to `TEXT_CONTENT_OVERFLOW` without changing the Q/Q fit rule.

No separate blocking collision rule is added in the first W2 slice. Overlap remains legal. If later evidence requires a special collision class, it must be explicit and must not silently move either object.

Missing canonical asset references use `ASSET_REFERENCE_DANGLING`/`ASSET_NOT_FOUND` as blocking errors; resource load/decode failures remain blocking publication/resource diagnostics.

## 12. Text authoring seam

W2 text insertion creates a normal Text object with canonical RichText and fresh local RichText IDs allocated by application instantiation.

Move and resize use the ordinary object frame actions. Resize does not edit text content, font size, paragraph structure, or translation semantics.

The renderer continues to measure text in Q against the authored frame projection. Equality in Q fits; one-Q excess blocks according to R0.1.4. No W2 pointer gesture writes renderer measurements back to RichText or frame geometry.

Future direct editing remains possible because text content stays canonical RichText and editing mode/caret selection remains ephemeral. Future text actions must be typed domain commands, not `contentEditable` DOM extraction as canonical authority.

## 13. Table frame interaction

`object.move` on a Table changes only table-object position.

`object.resize` on a Table changes only the object frame. It must preserve the `TableModel` byte-for-byte/structurally equal except for normal immutable object sharing performed by implementation.

Width change causes the existing Table Engine to re-resolve columns against the new frame width. Fixed/flex/min/max and deterministic U/Q projection rules remain unchanged.

Height change changes only the authored envelope used for fit. Measurement continues to derive intrinsic Q height and may produce or clear `TABLE_CONTENT_OVERFLOW`; it never writes the measured height into the frame.

`Fit Height to Content` remains a future explicit Application Action and is **not** part of W2 direct resize. W2 must not smuggle fit-height behavior into renderer, measurement, pointerup, or snapping.

## 14. Shape, Line, and Icon V1 scope

The first implementation supports only the primitive contracts in section 3. It intentionally excludes:

- Bezier/path authoring;
- freehand drawing;
- diagonal/arrow line editing;
- arbitrary SVG source embedded in authored JSON;
- gradients/effects/filter stacks;
- rotation;
- text-inside-shape special engines;
- icon path editing or per-path recoloring.

Professional technical layouts that need complex diagrams may use declared SVG/high-resolution raster assets. Ordinary copy remains canonical Text beside/over those assets.

## 15. Group decision and W2.F entry criteria

Group implementation is deferred to W2.F, but the feature is not abandoned. W2.F starts only after W2.C proves single-object move/resize transaction semantics and W2.E proves deep fresh-ID instantiation.

Before Group code is written, W2.F must freeze these questions together:

- whether children are nested or page-owned references;
- whether child frames are page-absolute or group-local;
- whether group frame is authored or derived;
- exact move semantics;
- resize behavior and whether scaling content is allowed;
- z-order inside/outside the group;
- duplicate/delete/ungroup identity behavior;
- whether nested groups exist in Father V1.

Until that contract is ratified, W2 UI must not emulate Group by maintaining a hidden parallel object tree.

## 16. Page-template insertion seam

W2.E implements the minimum Easy Button seam:

```text
Page Template Definition
        ↓
page.template.insert
        ↓
fresh ordinary Page + canonical Objects
        ↓
normal editing/rendering/publication
```

Application-level template definition:

```ts
type PageTemplateDefinition = {
  templateId: string;
  safeArea?: Page['safeArea'];
  objects: readonly EditorialObjectPrototype[];
};
```

The action is `page.template.insert({ templateId, afterPageId? })`. Template lookup is an injected application dependency/registry boundary, not a renderer feature and not persistence.

Instantiation rules:

- allocate a fresh Page ID;
- deep-instantiate every object with fresh structural IDs;
- deep-remap Table references;
- allocate fresh local RichText IDs independently within each RichText;
- preserve authored template frames/styles/content values;
- validate the complete candidate canonical document before success;
- return all created structural IDs through normal action metadata;
- store **no special runtime template renderer, live template link, or hidden template authority** in the resulting page.

After insertion, the page is indistinguishable from an equivalent page authored object by object. Editing one instance never changes a template or sibling instance.

W2.E may prove the seam with one small in-repository template definition. A template browser/library, catalog starter system, remote storage, versioning, and component library remain out of scope.

## 17. Undo/Redo contract

W1 snapshot history remains the authority.

| Action | Undo | Redo |
|---|---|---|
| `object.insert` | Removes the inserted object and its newly allocated identities. | Restores the exact inserted snapshot with the same IDs; no reallocation. |
| `object.delete` | Restores the exact object, page position/z-order, IDs, frame, content, and references. | Deletes it again. |
| `object.duplicate` | Removes the duplicate. | Restores the same duplicate IDs/content/frame produced by the original action. |
| `object.move` | Restores the exact prior frame. | Restores the committed final frame. |
| `object.resize` | Restores the exact prior frame. | Restores the committed final frame. |
| `object.reorder` | Restores prior visual order/zIndex values. | Restores committed order. |
| `image.replace` | Restores prior asset reference. | Restores replacement reference. |
| `page.template.insert` | Removes the entire instantiated page atomically. | Restores the same page and all originally allocated IDs atomically. |

Semantic no-ops do not enter history. Failed actions do not enter history. Preview/cancel/selection changes do not enter history and do not clear Redo.

A direct manipulation gesture that commits one action therefore produces one Undo step. If a later gesture legitimately emits multiple actions under one `transactionId`, W1 coalescing preserves that same one-step user expectation.

## 18. Future AI compatibility

Every W2 mutation action must be invokable from plain typed data without:

- mouse state;
- DOM coordinates;
- React refs;
- pointer events;
- current CSS pixels;
- `getBoundingClientRect()`;
- editor component instances.

Examples:

```ts
object.move({ objectId, xU, yU })
object.resize({ objectId, xU, yU, widthU, heightU })
image.replace({ objectId, assetId })
page.template.insert({ templateId, afterPageId })
```

Human UI converts intent into these actions. Future AI may produce the same typed actions. Neither gains a second mutation route.

Snapping is optional intent-resolution before the action. AI may submit exact geometry directly or call the same pure snapping helper with explicit U inputs; snapping itself is not an AI-only or UI-only document mutation.

## 19. Mandatory tests before W2 implementation is considered complete

### Domain/primitive tests

- insert each implemented primitive through typed application input and obtain a valid canonical document;
- reject unknown primitive fields/types;
- reject non-finite/unsafe/non-positive geometry;
- allow negative x/y as canonical authored placement;
- validate Image/Icon asset references and missing-asset failure/diagnostic behavior;
- preserve RichText-local identity scope.

### Application action tests

- `object.insert` success with fresh IDs;
- `object.duplicate` deep fresh IDs and remapped internal Table/RichText references;
- `object.delete`;
- `object.move`;
- `object.resize` including left/top final-frame inputs;
- `object.reorder` and no-op reorder;
- semantic no-op move/resize produces `changed:false` and preserves Redo;
- invalid target;
- locked target;
- invalid geometry;
- action failure leaves document/history unchanged and avoids avoidable ID consumption;
- Undo/Redo for insert/delete/duplicate/move/resize/reorder/image replace/template insertion.

### Direct-manipulation tests

- hundreds of pointermove-equivalent preview updates produce zero canonical session writes until commit;
- pointerup commits one move/resize action;
- one drag is one Undo step;
- Escape/pointercancel clears preview with no document/history/Redo change;
- failed final commit clears preview and restores canonical visual state;
- repeated actions with one `transactionId` still coalesce under W1 when that seam is used.

### Geometry/diagnostic tests

- object outside safe area → `WARNING`, non-blocking;
- object outside page → `ERROR`, blocking;
- overlapping independent objects remain legal and emit only the overlap warning;
- text overflow uses Q/Q fit and does not mutate frame/content;
- table overflow uses existing Q/Q fit and does not mutate frame/content;
- table frame move/resize leaves `TableModel` content/IDs unchanged;
- snap result is deterministic for identical pure U inputs and deterministic ties;
- snapping itself does not mutate a document.

### Renderer/publication boundary tests

- renderer supports every implemented primitive without editor chrome;
- selection does not alter canonical renderer output;
- preview state is absent from `DocumentRenderer` props/publication tree;
- publication rendering is unaffected by selection/active-page/editor mode;
- editor handles/guides/safe-area emphasis do not appear under the publication root;
- Image/Icon resolve only declared assets;
- architecture-boundary tests continue blocking React/DOM/browser imports from application/domain/table and Legacy authority from VNext.

### Template tests

- template insertion creates an ordinary canonical Page and ordinary canonical Objects;
- every inserted structural ID is fresh against the document;
- every inserted RichText receives valid fresh local identity independently;
- Table internal references are remapped correctly;
- editing the inserted page uses ordinary object actions with no template renderer/link;
- Undo removes the inserted page atomically and Redo restores the same allocated IDs.

## 20. Principal-auditable W2 PR decomposition

### W2.A — Primitive/domain + publication-safe renderer contracts

Scope: add Image, Shape, Line, and Icon typed canonical variants; minimal asset MIME/reference delta for SVG if required; exhaustive publication-safe rendering and primitive validation; preserve Text/Table contracts.

Dependencies: merged W1 only.

Visible result: canonical documents containing the new generic primitives can be validated and rendered through the production renderer/proof harness. No editor authoring controls yet.

Required tests: primitive schema/reference tests, renderer tests, publication-no-chrome tests, architecture-boundary tests, existing W0 proof regressions.

Must not implement: selection, drag/resize, snapping, templates UI, Group, persistence, crop/focal editing, vector paths, rich-text editor, table structural editing.

### W2.B — Object Application Actions

Scope: strict `object.insert/delete/duplicate/move/resize/reorder`, `image.replace`, fresh-ID instantiation helper, lock/no-op/failure semantics, and Undo/Redo coverage.

Dependencies: W2.A.

Visible result: objects can be created and manipulated entirely through the pure Application Action/session API without browser dependencies.

Required tests: action runtime validation, identity remapping, invalid target/geometry, no-op, locked object, Undo/Redo, table-content immutability, architecture boundary.

Must not implement: pointer UI, selection persistence, snapping, template library, Group, direct text editing, table structural editing.

### W2.C — Editor selection + direct move/resize interaction

Scope: ephemeral active page/single selection, future multi-selection seam, editor overlays, move/resize gesture preview, one final canonical commit, Escape/cancel, visible Undo behavior.

Dependencies: W2.B.

Visible result: a user can select one canonical object in `/v2`, drag it, resize it, cancel a gesture, and Undo/Redo one gesture predictably.

Required tests: zero canonical writes during preview, one action on pointerup, one Undo per gesture, cancellation/failed-commit history safety, publication unaffected by selection/preview.

Must not implement: multi-selection behavior, Group, snapping, persistent guides, direct RichText editing, persistence, automatic reflow.

### W2.D — Snapping + guides + authoring diagnostics

Scope: pure U snapping, ephemeral snap guides, safe-area interaction feedback, page-bounds/overflow/overlap presentation, diagnostic name normalization described here.

Dependencies: W2.C.

Visible result: move/resize gains predictable snap assistance and clearly distinguishes safe-margin warnings from blocking physical/page/content errors.

Required tests: deterministic snapping/ties, no snap mutation, safe-area warning, page blocking error, overlap warning, Q/Q text/table overflow preservation, publication tree free of guides.

Must not implement: automatic clamp/reflow, collision avoidance, persistent ruler-guide document model, Fit Height, Group.

### W2.E — Page-template insertion seam

Scope: typed template definition/registry dependency, `page.template.insert`, deep fresh-ID instantiation, one minimal template fixture/definition, atomic Undo/Redo.

Dependencies: W2.B; may land after W2.D so the visible editor can exercise it, but domain/application work must not depend on editor UI.

Visible result: one template action produces a normal editable page made solely of canonical primitives.

Required tests: fresh IDs, RichText-local identities, Table ref remapping, ordinary renderer/action behavior after insertion, atomic Undo/Redo, no template runtime renderer.

Must not implement: template marketplace/library UX, persistence, catalog starters, components library, live template links, specialized cover engine.

### W2.F — Group contract + implementation

Scope: first freeze and then implement Group ownership/coordinates/frame/resize/z-order/duplicate/delete/ungroup semantics as one coherent contract.

Dependencies: W2.C and W2.E identity-instantiation semantics.

Visible result: a selected set of ordinary page objects can become a Group and return to equivalent ordinary objects through explicit actions without hidden topology.

Required tests: all group invariants from section 15, fresh duplicate IDs, move/resize semantics, z-order, delete/ungroup, Undo/Redo, renderer/publication parity.

Must not implement: nested groups unless separately ratified, component library, reusable live-linked groups, arbitrary transforms/rotation, vector editing.

## 21. Out of scope for this contract wave

No W2.0 documentation work implements persistence, Supabase/Auth VNext, save/autosave, translation, advanced table structural editing, TSV paste, table presets, full template library, catalog starters, components library, PIM, Presence, Realtime, CRDT, AI authoring, publication redesign, or automatic pagination/reflow.

No unrelated Legacy or lab debt is part of W2. In particular, `src/labs/product-workspace-ux/components/ConflictReviewModal.tsx` remains untouched.

## 22. Principal audit points

No unresolved question blocks W2.A after this contract is accepted. The Principal should explicitly audit these two deliberate decisions because they constrain later slices:

1. Keep the existing authored `*Mm` frame serialization while requiring integer-U action/snap/layout authority, rather than renaming the canonical Frame schema during W2.
2. Defer serialized Group modeling to W2.F so ownership/coordinate/resize semantics are frozen together rather than improvised during W2.C UI work.

Any rejection of either decision should be resolved in this contract before feature implementation starts.

READY FOR PRINCIPAL AUDIT

DO NOT MERGE

DO NOT START W2 IMPLEMENTATION
