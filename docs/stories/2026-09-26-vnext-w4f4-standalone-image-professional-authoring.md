# W4.F.4 — Standalone Image Professional Authoring

Status: **IMPLEMENTED / UNDER REVIEW**

## Canonical base

- Repository: `avaranda66-oss/catalog-builder-technical`
- Authorized base: `aca60baf0acace66017cbafd14c89339d18faa95`
- Authorized tree: `d2f4671c9b6a70fdbdb73e97ea2154934b8f96c9`
- Previous canonical slice: W4.F.3

W4.F.4 preserves the existing canonical Image domain. No schema migration, database
migration, second renderer, second uploader, second persistence path, or alternate
selection/history authority was introduced.

## Implemented capability

Standalone Image now exposes Father-facing professional authoring for:

- Ajuste: Conter / Preencher
- continuous normalized focal positioning
- 2D touch/pointer focal pad
- keyboard-operable Horizontal / Vertical range controls
- Centralizar
- existing document AssetRef replacement
- uploaded replacement through the existing Asset Persistence Bridge
- lock-aware Inspector guidance
- mobile authoring at narrow widths

The canonical authored representation remains:

- `ImageObject.assetId`
- `ImageObject.fit`
- optional `ImageObject.focalPoint`
- generic `object.frame`

## ImageExpectedState and CAS

An action-only `ImageExpectedState` protects exactly:

- assetId
- fit
- effective focalPoint

Missing focalPoint and explicit `{x:0.5,y:0.5}` compare semantically equal.
Frame, zIndex, selection, unrelated assets, and unrelated document state are
intentionally outside Image CAS.

The helper `projectImageExpectedState()` is shared by UI, upload orchestration,
and execution instead of duplicating comparison logic.

## image.setPresentation

The typed `image.setPresentation` action:

1. resolves the live target;
2. rejects direct grouped-child mutation;
3. enforces live lock authority;
4. enforces Image type;
5. verifies expected Image semantic state;
6. detects semantic no-op;
7. mutates from the live Image object.

Fit-only changes preserve raw focalPoint representation. In particular, changing
an Image whose optional focalPoint is absent at effective center does not
materialize an explicit center merely because fit changed.

Focal edits intentionally materialize the requested focal point.

## image.replace amendment

The existing `image.replace` action was amended rather than versioned.

Validation order is now:

target lookup
→ Group barrier
→ live lock
→ Image type
→ expected Image CAS
→ optional AssetRef validation
→ target asset resolution/reuse
→ no-op evaluation
→ one final candidate

A supplied new AssetRef and the Image assetId replacement therefore commit as one
semantic action after CAS succeeds.

A stale or invalid target produces no canonical AssetRef registration.

Replacement preserves the live:

- object ID
- frame
- zIndex
- lock state
- fit
- raw/effective focalPoint

## Upload stale protection

Standalone replace upload intent captures the original expected Image state before
the asynchronous upload begins.

The existing lineage checks remain authoritative for auth lineage, authority
scope, open session, catalog/session identity, and mounted/current UI context.

After upload completes, the original expected Image snapshot is passed to the
typed `image.replace` action.

Runtime AssetRuntimeState and runtime URL are installed only after the semantic
link is accepted.

Covered adversarial races include:

- focal changes while upload is pending
- fit changes while upload is pending
- another asset replacement wins
- target deletion
- target grouping
- auth / authority / open-session / catalog / live-session drift
- locked target
- frame-only mutation
- zIndex-only mutation

Frame and zIndex changes deliberately do not stale Image replacement. The final
replacement uses the live Image so newer geometry/order survive.

## Focal gesture/history

Pointer/touch focal movement is a local Inspector draft during the gesture.

One pointer gesture captures one expected Image snapshot and dispatches one
`image.setPresentation` action on completion.

Pointer cancellation/capture loss discards the draft and resynchronizes from the
canonical Image.

Range controls provide 0%–100% authoring with 0.1% UI precision and normalize to
the existing 0..1 domain.

Semantic no-ops remain zero-history and do not advance `localSequence`.

## Contain semantics

Contain keeps focal semantics intact while rendering through the existing centered
contain behavior.

Focal controls remain visible but disabled under contain with Father-facing
guidance:

> A posição é usada no modo Preencher e será preservada.

Switching back to cover reuses the preserved focal state.

## Existing asset and upload UX

The Image Inspector reuses `document.assets` as the existing asset authority.

Selecting an asset is UI-only. `Usar imagem` dispatches typed
`image.replace` with a freshly projected expected Image state.

`Enviar nova imagem…` and existing toolbar replacement shortcuts share the
same preparation/CAS/upload route.

No media library or DAM was added.

## Renderer / persistence / clone

The standalone Image renderer is unchanged.

Existing rendering remains:

- contain → object-fit contain + visual center
- cover → object-fit cover + object-position from effective focal point

Existing full-document persistence, clone, duplicate, and Save/reopen authorities
remain unchanged and are covered by regression tests.

## Focused evidence

Focused W4.F.4/application/upload suites currently pass:

- `tests/vnext/application/image-professional-authoring.test.ts`
- `tests/vnext/application/image-upload.test.ts`
- `tests/vnext/application/object-actions.test.ts`
- `tests/vnext/asset/asset-persistence-bridge.test.ts`

Additional regression suites pass:

- catalog clone
- application actions
- primitive rendering
- persistence contracts

## Dedicated browser proof

Dedicated proof:

`tests/vnext/proof/editor-standalone-image-professional-authoring-proof.mjs`

Controlled fixture:

- `tests/vnext/proof/fixtures/w4f4-editor-browser.html`
- `tests/vnext/proof/fixtures/w4f4-editor-browser.tsx`

The proof uses real VNextApp / EditorWorkspace, Application Actions,
DocumentSession, controlled persistence, Asset Persistence Bridge-compatible
upload, Save/reopen, canonical DocumentRenderer publication, native Chromium PDF,
and PDF.js.

It covers:

- contain / cover
- focal pad
- exact focal boundaries
- Centralizar
- Undo / Redo
- existing AssetRef replacement
- uploaded replacement
- stale focal upload race
- stale replacement race
- frame concurrency
- duplicate
- Save → other catalog/session → reopen
- publication fit/position/asset
- native A4 PDF text/image evidence
- mobile/touch at 320 / 360 / 390
- global horizontal-overflow checks
- empty console/page/resource/request error budget

Local dedicated PASS token:

`W4.F.4 Standalone Image Professional Authoring Chromium proof: PASS`

## Quality Gate

After the dedicated proof passed locally, it was appended immediately after the
W4.F.3 semantic-content proof in the existing VNext Chromium/PDF proof stage.

No historical proof was removed, skipped, reordered, or weakened.

## Local validation

Final local validation before commit:

- lint: PASS (0 errors; repository baseline warnings remain)
- typecheck: PASS
- full test suite: 269 test files passed
- tests: 2854 passed / 1 skipped / 0 failed
- build: PASS
- dedicated W4.F.4 Chromium proof: PASS
- `git diff --check`: PASS

## Scope

Not implemented:

- W4.F.5
- W4.G
- generic lock/unlock authoring
- align/distribute
- z-order redesign
- Shape/Line professional styling
- professional Text/RichText
- page professional UX
- crop rectangles/masks/destructive crop
- filters/effects/opacity
- compression pipeline
- DAM/media library
- asset garbage collection
- AI image editing
- migration
- production deployment

## Promotion state

Implementation exists only on the isolated W4.F.4 implementation branch.

Merge is not authorized.

This story must remain **IMPLEMENTED / UNDER REVIEW** until independent
adversarial audit, Principal decision, separately authorized merge, and post-merge canonical closeout.
