# W4.F.5 — Professional Object Arrangement + Locking

Status: **IMPLEMENTED / UNDER REVIEW**

W4.F.5 implements only the Principal-frozen professional Object arrangement and
locking slice on the canonical VNext editor. It does not authorize merge,
deployment, W4.G, Page professional UX, Shape/Line professional styling,
professional RichText, zoom, Format Painter, Paste Special, migrations, or any
parallel document/render/persistence/history authority.

## Canonical base

Implementation started from:

- main: `b678421cba3b7b0e85aeb75a6952584537c1800b`
- tree: `6a7f7fcc30d30b758a5a7dedf51c9effdf6611d1`
- previous canonical slice: W4.F.4
- previous post-merge Quality Gate: `36281588953 — COMPLETED / SUCCESS`

GitHub live was revalidated before the isolated W4.F.5 worktree was created.
No W4.F.5/W4.G branch or PR existed.

## Single-authority preservation

W4.F.5 reuses without replacement:

- `CatalogDocument`
- `EditorialObject` and existing `locked?: boolean`
- existing mm-shaped persisted `Frame`
- `FrameUSchema` at the Application boundary
- `EditorSelectionState.selectedObjectIds`
- the canonical Application Action union/executor
- `DocumentSession` history/localSequence
- existing `object.reorder`
- existing Group ownership/closure-lock rules
- existing renderer/publication/PDF path
- existing persistence runtime and Save/reopen path

There is no ObjectStateV2, AlignmentState, LayerState, second selection model,
second renderer, second persistence authority, or new history system.

## object.setLocked

Added strict action:

```ts
{
  type: 'object.setLocked';
  objectId: string;
  expectedLocked: boolean;
  locked: boolean;
}
```

`expectedLocked` protects only the root object's own effective bit:

`object.locked === true`

It intentionally does not use Group closure lock as the CAS value.

Execution:

1. lookup root target;
2. reject direct grouped-child mutation;
3. compare own-lock with `expectedLocked`;
4. stale mismatch returns `TARGET_STALE`;
5. same desired state is a semantic no-op;
6. lock writes only `locked:true`;
7. explicit unlock removes the optional `locked` property;
8. children remain unchanged.

An unlocked Group that contains a locked descendant can therefore still expose
`Bloquear objeto` for its root while ordinary Group mutations remain blocked by
the pre-existing closure-lock authority.

## Group closure lock

Existing closure semantics remain authoritative for move/delete/duplicate/reorder/
ungroup and now arrangement.

Align/distribute reject the entire operation with `OBJECT_LOCKED` if any selected
root or Group descendant is locked.

Direct grouped children remain non-authorable in F.5.

The UI distinguishes:

- own root lock; from
- an unlocked Group root containing a locked internal object.

It does not claim that unlocking the Group root will unlock descendants.

## Multi-selection

The only selection authority remains:

`EditorSelectionState.selectedObjectIds`.

Existing Ctrl/Meta + pointer toggle behavior remains.

F.5 adds only ephemeral `multiSelectArmed` workspace state and the Father-facing
button:

`Selecionar vários`

with `aria-pressed`.

While armed, top-level click/tap toggles membership without beginning move.
Selection is not persisted.

Page changes clear/disarm it. Entering Text/Table/Cell editing disarms and narrows
selection to the singular editing target.

## objects.align

Added strict atomic action:

```ts
{
  type: 'objects.align';
  pageId: string;
  targets: Array<{ objectId: string; expectedFrame: FrameU }>;
  alignment:
    | 'left'
    | 'horizontal-center'
    | 'right'
    | 'top'
    | 'vertical-center'
    | 'bottom';
}
```

At least two unique top-level same-page targets are required.

All target existence/page/Group/closure-lock/frame-CAS checks complete before
candidate construction.

Bounding geometry is computed in safe integer U only:

- left = min xU
- top = min yU
- right = max add(xU,widthU)
- bottom = max add(yU,heightU)

Center operations use canonical `roundRatio`. Overflow fails before candidate
construction.

Only x/y are replaced. Width, height, zIndex, lock state, identity, children,
content, styles, assets, Image presentation, Table state and RichText are
preserved from the live objects.

## objects.distribute

Added strict atomic action:

```ts
{
  type: 'objects.distribute';
  pageId: string;
  targets: Array<{ objectId: string; expectedFrame: FrameU }>;
  axis: 'horizontal' | 'vertical';
}
```

At least three unique targets are required.

Ordering is deterministic:

Horizontal:

xU → yU → existing canonical visual order.

Vertical:

yU → xU → existing canonical visual order.

First and last geometric targets remain fixed. Intermediate objects use the
frozen equal edge-to-edge formula with safe integer arithmetic and
`roundRatio(corridorU * i, n - 1)`.

Negative spacing/intentional overlap is legal. F.5 does not clamp authored
geometry to safe area or page boundaries; canonical diagnostics continue to own
publication warnings/errors.

## CAS / concurrency

Arrangement protects exactly the expected canonical FrameU of each target:

- xU
- yU
- widthU
- heightU

Live frame move/resize stales.

Live target deletion/page mismatch/grouping/lock are current-state barriers.

Frame-stable concurrent mutations survive and are preserved, including:

- Text/RichText changes
- Image asset / fit / focal changes
- Table changes
- Shape state
- z-order changes
- unrelated edits
- page-order changes

No whole-document CAS is introduced.

## Atomicity / history

Align/distribute produce one candidate only after every target validates.

No partial mutation is possible.

One changed multi-object command is:

one Application Action
→ one DocumentSession transition
→ localSequence +1
→ one Undo
→ one Redo.

Semantic no-op and failures create zero history/localSequence and preserve Redo.

## Group-root arrangement

A top-level unlocked Group is a legal arrangement target.

Only the Group root page position changes.

Group width/height, zIndex, identity and child local frames remain unchanged.
No Group envelope reconstruction or child translation occurs.

## Locked-object UX

One selected top-level object exposes section `Objeto` with:

- `Bloquear objeto`
- `Desbloquear objeto`

A locked root remains selectable but ordinary authoring controls are disabled:

- geometry
- move
- resize handles
- duplicate/delete
- Layer controls
- type-specific authoring

Explicit unlock remains enabled.

An unlocked Group with a locked child shows:

`Este grupo contém um objeto interno bloqueado e não pode ser organizado nesta versão.`

For multi-selection, arrangement controls project lock barriers with non-misleading
guidance and the executor remains final authority.

## Layer UX

No z-order action was added.

The existing `object.reorder` authority is presented with:

- Enviar para o fundo
- Recuar uma camada
- Avançar uma camada
- Trazer para frente

Boundary operations are disabled at their existing boundary. Multi-selection does
not invent collective z-order semantics.

## Persistence

No persistence schema change exists.

Persisted W4.F.5 mutations use only existing canonical fields:

- `locked?`
- `frame.xMm`
- `frame.yMm`

Selection and `multiSelectArmed` remain ephemeral.

The dedicated proof performs real controlled:

authoring → Save → clean → another catalog/session → reopen original

and verifies exact saved/reopened lock and arrangement state.

## Renderer / publication

No renderer code is changed by W4.F.5.

Canonical publication continues through the existing `DocumentRenderer`.

The dedicated proof validates the arranged canonical object geometry in the
publication DOM and generates native Chromium A4 PDF. Lock has no publication
visual semantics.

## Mobile / accessibility

The dedicated proof exercises substantive touch authoring at:

- 320×900
- 360×900
- 390×900

At each width it performs modifier-free multi-selection, align, distribute,
lock, unlock, Undo and Redo and verifies no global document/body horizontal
overflow.

Controls use native buttons, accessible labels, `aria-pressed`, disabled
semantics, selected-count text and visible lock guidance. Commands are not
pointer-only; button/Inspector routes remain keyboard-operable.

## Tests

Focused coverage includes:

- strict action schemas
- lock/unlock/own-lock CAS/no-op
- Group root vs descendant closure lock
- all six align operations
- half-U center rounding
- horizontal/vertical distribution
- 3 and >3 target distribution
- negative placement/spacing
- deterministic remainder/tie ordering
- input-order independence
- safe-integer overflow
- target deletion/cross-page/group-after-prepare
- live frame stale
- live lock/closure lock
- Text/RichText/z-order concurrency
- Image asset/presentation concurrency
- Table concurrency
- all-or-nothing failure
- one-step history
- Undo/Redo
- Redo preservation on no-op/failure
- existing Ctrl/Meta selection regression
- modifier-free/touch-like selection
- selected-count and arrangement wiring
- root lock UI
- closure-lock guidance
- Layer labels/disablement
- page-change lifecycle
- Text-edit disarm/narrowing
- existing Group/object regressions

## Dedicated Chromium/PDF proof

Proof:

`tests/vnext/proof/editor-object-arrangement-locking-proof.mjs`

Fixture:

`tests/vnext/proof/fixtures/w4f5-editor-browser.{html,tsx}`

Required token:

`W4.F.5 Object Arrangement + Locking Chromium proof: PASS`

The proof uses real:

- VNextApp / EditorWorkspace
- Application Actions
- DocumentSession
- selectedObjectIds
- controlled persistence runtime
- Asset Persistence Bridge for a real Image object
- canonical DocumentRenderer
- native Chromium PDF
- PDF.js inspection

No proof-only CatalogDocument mutation is used to satisfy authoring assertions.

## Quality Gate

The W4.F.5 proof command is appended immediately after W4.F.4 in the existing
VNext Chromium/PDF stage. No historical proof is removed or reordered.

Historical W4 ladder remains:

W4.E
→ W4.F.1
→ W4.F.2
→ W4.F.3
→ W4.F.4
→ W4.F.5.

## Evidence

Final local validation on the implementation candidate:

- lint: PASS with 0 errors (repository baseline warnings remain)
- typecheck: PASS
- focused W4.F.5 application tests: 24/24 PASS
- EditorWorkspace UI tests: 36/36 PASS
- Object/Group/W4.F.5 focused regressions: 68/68 PASS
- full suite: 270/270 test files PASS; 2885 PASS, 1 skipped, 0 failed
- build: PASS
- dedicated Chromium/PDF proof: PASS
- mobile proof: 320×900, 360×900 and 390×900 with no global horizontal overflow
- proof error budget: consoleErrors/pageErrors/failedResources/requestFailures all empty
- git diff --check: PASS

Immutable final PR number, exact-head SHA/tree, and final exact-head CI/run evidence
are recorded in the implementation report after the branch is pushed and the
authoritative GitHub Quality Gate completes.

## Promotion state

This story remains:

**IMPLEMENTED / UNDER REVIEW**

It is not canonical.

Merge remains unauthorized until independent adversarial audit, Principal review,
a separate one-use merge authorization, merge, and post-merge canonical
validation.
