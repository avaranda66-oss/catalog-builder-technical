# VNext W2.C — Editor Direct Manipulation

Status: Implemented — audit pending
Date: 2026-09-10
Base SHA: `5e4b9c6f4235761872f94c5e0318a774ee456f39`
Base tree: `7e21311949db03cda0720e5fd4216bec9a001f77`
Branch: `feat/vnext-w2c-direct-manipulation-impl`
PR: pending at implementation-commit time; durable closeout records the real PR after creation.

PR #19 provenance: W2.B is represented canonically by the squash-merge base above. The preserved pre-squash local head `bec44a3654a22286c9dd3d1c86c201a3c9adee7e` is recovery evidence only and was not cherry-picked.

## Goal

Implement only W2.C: ephemeral active page and single-object selection, an editor-only overlay, immutable-start move/resize preview, one typed W2.B commit on successful pointerup, stale-safe cancellation, visible basic object actions, and an mm-facing geometry Inspector.

## Recovered implementation

The canonical W2.C worktree resumed at the exact canonical base with a coherent uncommitted W2.C-only partial implementation: this story draft, the deterministic replacement image, app-level insertion defaults, the interaction controller, an incomplete `EditorWorkspace.tsx`, and initial VNext shell/style integration. The preserved recovery worktree was not modified. No local checkpoint commit was created because the recovered workspace component had been syntactically incomplete before continuation.

## Editor state and selection

Editor state is React-local and equivalent to:

```ts
type EditorSelectionState = {
  activePageId: string;
  selectedObjectIds: readonly string[];
  mode: 'select';
};
```

W2.C maintains selection cardinality at `0 | 1`; the array shape is only a future multi-selection seam. Page and selection changes do not call `DocumentSession.execute`, do not enter Undo/Redo history, and are not serialized into `CatalogDocument`.

## Canonical renderer boundary

`DocumentRenderer` is unchanged. It receives only its existing canonical inputs (`document`, `plans`, `assetUrls`). Selection hit targets, outline, preview fill, and all eight resize handles live in a sibling `.vnext-editor-overlay` after `DocumentRenderer`, outside `[data-editorial-root]`. No editor state, preview prop, handle prop, editor-mode prop, or mutation callback was added to the renderer.

## Preview and immutable-start gesture math

`EditorInteractionController.begin()` captures the target/page, pointer id and original client coordinates, immutable canonical `startFrameU`, page physical dimensions in U, rendered page dimensions in Q, and the starting in-memory document identity.

Every pointer move computes current delta from the original pointerdown basis and derives a fresh candidate from `startFrameU`. Preview is emitted only through `onPreviewChange`; pointermove never executes an Application Action. This prevents accumulated quantization drift. A zero-delta finish is a no-op.

## Browser px → U policy and non-1 scale

Browser pixels are input sampling only. At gesture start the editor reads the canonical rendered page bounding box, converts its rendered width/height with the existing `pxToQ`, and combines pointer delta Q with canonical page extent U using integer physical arithmetic (`mul` + `roundRatio`). Final actions contain integer U only.

The visible `/v2` scale is applied once to the shared `.vnext-page-stage`, not independently to the publication renderer. The canonical renderer and sibling overlay therefore share the same `zoom` (`0.62` at the Chromium proof viewport, `0.58` under the existing narrow breakpoint). The page decoration uses `outline` so it does not shift authored geometry. Chromium proved canonical and overlay rectangles aligned at scale `0.62` and that a 42 px × 24 px drag produced the same preview/commit geometry.

## Move lifecycle

Pointerdown starts from the immutable canonical frame. Pointermove updates only the ephemeral overlay. Pointerup re-resolves canonical state, validates stale preconditions, builds exactly one `object.move({ objectId, xU, yU })`, executes it through the W2.B session seam, and clears preview. Width/height remain unchanged and negative x/y remain legal. One successful gesture is one Undo step.

## Resize lifecycle and crossing

Handles: `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`.

Resize preview and commit use complete frames. Left/top/corner math is always derived from the immutable start frame. A controlled axis that crosses the opposite edge is clamped to exactly `1 U`; the origin is adjusted to keep the opposite edge fixed, and the active handle never flips. Pointerup sends exactly one `object.resize({ objectId, xU, yU, widthU, heightU })`.

## Stale and cancellation policy

Before final commit the controller re-resolves canonical state and cancels if the active page changed, the target was deleted, reparented to another page, newly locked, or its canonical frame changed. It also rejects an in-memory document identity change, which conservatively prevents a gesture started against an older canonical snapshot from committing.

Escape, `pointercancel`, `lostpointercapture`, element/root focus loss, explicit browser-window blur, active-page change, and superseding editor commands clear the preview without a canonical write or history entry. Undo/Redo cancel any active preview before applying the history operation. A failed final W2.B action clears preview and leaves only canonical geometry visible; no ghost frame remains.

## Visible W2.B action surface

All persistent editor changes go through existing typed actions:

- Add Text/Image/Table/Shape/Line → `object.insert`
- Delete → `object.delete`
- Duplicate → `object.duplicate`
- Back/Backward/Forward/Front → `object.reorder`
- Replace Image → `image.replace`
- direct move → `object.move`
- direct resize → `object.resize`
- Add Page remains the existing `page.add`

There is no direct React mutation of `CatalogDocument` and no generic mutation API.

## Insertion defaults and asset demo seam

Insertion frames, content, style, and table seed are deterministic app-level defaults in `editor-defaults.ts`; no UX defaults were added to domain schemas. Text starts as `Novo texto`. Add Table creates one minimal valid one-column/one-row/one-cell canonical `TableModel` only.

The in-memory W2.C demo asset seam uses the existing `AssetRef` plus `assetUrls` renderer boundary:

- `public/assets/presys/ta-25n-official.jpg` → asset `w2c-demo-ta25n`, SHA-256 `9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067`, 545×767 JPEG.
- `public/assets/vnext/w2c-replacement.png` → asset `w2c-demo-replacement`, SHA-256 `181b540c50524ed4fa6e201b9ec8a3995f1d5351bc58f8112dcc48e992cdfc67`, 32×32 PNG.

This is demo/in-memory only: no Asset Library, Legacy media store, Supabase, or persistence authority is introduced.

## Numeric Inspector

For one selected object the Inspector exposes X, Y, Width, and Height in millimetres. Inputs are ephemeral strings. A finite numeric commit uses the existing `mmToU`; X/Y execute `object.move`, while Width/Height execute complete-frame `object.resize`. Invalid/empty/non-finite input and non-positive dimensions cause no canonical mutation. Raw U is never shown to the user.

## W2.B regression preservation

W2.C does not change W2.B application/domain implementation. The existing focused VNext suite remains green, preserving fresh insert identity protection, RichText-local identity scope, lock-aware sibling reorder, Table frame-only resize, Table commit-then-diagnose, Undo/Redo snapshot semantics, and the transactionId seam.

## Chromium evidence

`node tests/vnext/proof/editor-direct-manipulation-proof.mjs` passes on Chromium `151.0.7922.34` against the real `/v2` route.

Evidence recorded under ignored scratch path `scratch/w2c-editor-proof/` proves:

- Add Text selects the inserted object and exposes eight handles.
- canonical and overlay rectangles align at actual scale `0.62`.
- move preview changes overlay geometry while canonical DOM geometry remains unchanged; pointerup commits; Undo restores; Redo restores.
- west, north, and northwest resize handles preview without canonical mutation and commit on pointerup.
- Escape cancels an active preview and subsequent mouseup does not commit a ghost frame.
- Add Shape, Add Table, Add Image, and Add Line are visible and functional.
- Replace Image changes asset id from `w2c-demo-ta25n` to `w2c-demo-replacement`.
- Inspector X=`33.25` mm visibly commits canonical movement.
- selection change itself does not add a history entry; Undo removes the preceding inserted line.
- no console errors, no page errors, and no `/src/legacy-main` bootstrap request.

## Publication independence and export proof

`src/vnext/rendering`, `src/vnext/publication`, `src/vnext/domain`, and `src/vnext/application` have no W2.C diff. Editor state/chrome therefore does not enter `CatalogDocument`, `DocumentRenderer` API, publication tree, or PDF.

`node tests/vnext/proof/export-proof.mjs` exits `0` after all 900/1500 viewport × DPR 1/2 screen/print matrices pass, native PDF + PDF.js forensics pass, representative W2.A primitives Chromium/native-PDF proof passes, and ROWSPAN R0.1.4 reports `READY [100000, 307769, 100004] 507773`.

## Tests and gates

- direct W2.C controller/workspace: `2` files, `24/24` tests pass.
- focused VNext application/proof: `12` files, `148/148` tests pass.
- Chromium `/v2` proof: PASS, Chromium `151.0.7922.34`, scale `0.62`, zero console/page errors, Legacy bootstrap false.
- export/PDF proof: PASS, exit `0`.
- `git diff --check`: PASS.
- `npm run lint`: PASS, `0` errors and `268` pre-existing repository warnings; W2.C adds no lint warning.
- `npm run typecheck`: PASS.
- `npm test`: `208` files passed; `2194` passed, `1` skipped (`2195` total).
- `npm run build`: PASS; Vite transformed `2323` modules and completed production build (`12.56s` in recorded final gate), with existing chunk-size/dynamic-import warnings only.

## Acceptance Criteria

- [x] Editor page/selection/mode and preview state remain ephemeral and outside publication/history.
- [x] Selection uses `selectedObjectIds: readonly string[]` with cardinality `0 | 1`.
- [x] Selection outline and eight resize handles are siblings of, not props inside, `DocumentRenderer`.
- [x] Pointermove performs zero canonical writes; successful pointerup executes exactly one move or resize action.
- [x] Gesture math always derives from immutable pointerdown frame and captured physical display basis.
- [x] Escape, pointercancel, capture/focus loss, page change, stale target, and failed commit clear preview safely.
- [x] Undo/Redo cancel an active gesture before history navigation.
- [x] Resize crossing clamps controlled dimensions to the canonical `1 U` minimum without handle flipping.
- [x] Add Text/Image/Table/Shape/Line, Delete, Duplicate, reorder, Replace Image, Move, Resize and Inspector use existing W2.B actions.
- [x] Inspector displays/accepts mm and quantizes finite values with `mmToU`; invalid input does not mutate state.
- [x] Chromium proof, export proof, focused tests, lint, typecheck, full tests and build pass.
- [x] No W2.D+ scope enters the implementation.

## Tasks

- [x] Implement interaction state machine and tests.
- [x] Implement app-level demo assets/default insert specs.
- [x] Implement visible authoring controls, overlay/handles and Inspector.
- [x] Add Chromium proof and publication/architecture regressions.
- [x] Run required gates and scope audit.
- [ ] Open exactly one PR and record merge-durable project/handoff memory with its real number.

## File List

- `docs/stories/2026-09-10-vnext-w2c-direct-manipulation.md`
- `public/assets/vnext/w2c-replacement.png`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/editor-defaults.ts`
- `src/vnext/app/editor-interaction.ts`
- `src/vnext/app/styles.css`
- `tests/vnext/application/editor-interaction.test.ts`
- `tests/vnext/application/editor-workspace.test.tsx`
- `tests/vnext/proof/editor-direct-manipulation-proof.mjs`

## Scope audit / Deferred

Explicitly deferred and absent from this implementation: W2.D snapping, W2.D guides, W2.E templates, W2.F Group, W2.G direct Text editing / `text.setContent` / `contentEditable`, advanced Table editing, persistence/localStorage fake persistence, Supabase/Auth, Library, translation, AI, PIM, and Realtime/Presence.

W2.0 deviation: NONE.
