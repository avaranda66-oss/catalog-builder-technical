# W2.F Group

Status: Ready for Review locally; GitHub promotion pending.

## Provenance

- Canonical base SHA: `162531024107e1376912363c877f23bdc3389426`.
- Canonical base tree: `c3df17b54c3aca8673f52f13efcbabdfca8e0a0a`.
- Branch: `feat/vnext-w2f-group`.
- Worktree: `C:\Users\Usuario\.codex\worktrees\0cd1\catalog-builder`.
- PR: pending; this story must not claim merged/canonical/Principal accepted before those events exist.

## Objective

Implement the ratified W2.F Group capability as canonical document ownership:

```text
Page
  -> ordinary leaf
  -> Group
       -> leaf
       -> leaf
  -> ordinary leaf
```

Group owns only existing leaf primitives (Table, Text, Image, Shape, Line, Icon). Group coordinates are Page-absolute; child coordinates are Group-local. Canonical geometry is resolved in integer U.

## Frozen contract

- Group is a canonical `EditorialObject`; Page owns top-level objects and Group directly owns leaf children.
- No `parentId`, `memberIds`, hidden React topology, runtime membership registry, or nested Group.
- Group has at least two children and a strict schema.
- Group frame is persisted and equals the exact tight child envelope.
- `group.create` accepts at least two unique unlocked top-level leaves from one page and requires one contiguous interval in visual order (`zIndex`, then page array index).
- Creation preserves child root IDs, Table IDs, RichText local IDs, and AssetRefs; only Group gets a fresh root ID.
- `object.move(Group)` changes only Group x/y.
- `object.resize(Group)` fails with `ACTION_INVALID`; W2.F has no Group scaling.
- Grouped leaves are discoverable but reject direct move/resize/delete/duplicate/reorder/image.replace.
- Group structural operations are blocked when Group or any descendant is locked.
- `object.delete(Group)` removes the entire closure atomically.
- `object.duplicate(Group)` uses existing allocator/remappers, renews Group/child/Table/RichText identities, preserves AssetRefs, preserves the source frame unless explicit x/y are supplied.
- `group.ungroup` preserves child identities, converts local to Page-absolute U, and emits children in the Group's current visual slot.
- One pure domain traversal/frame-resolution authority is shared by lookup, validation, rendering, render planning, measurement, preflight, and snap-target filtering.
- Rendering uses one canonical render tree, one Group wrapper, existing leaf renderers, exactly one DOM identity per canonical object, and no transforms.
- W2.E templates support valid Group closures through the existing instantiation machinery.
- Selection remains ephemeral; W2.F adds only click single-selection and Ctrl/Cmd top-level toggle selection needed for Group creation.
- `schemaVersion` remains `1`.

## Acceptance criteria

- [x] Canonical leaf/Group domain split and strict schema.
- [x] Tight persisted Group envelope validation.
- [x] Canonical traversal with ownership context and resolved Page-space U geometry.
- [x] Group-aware identity enumeration/reservation and lookup.
- [x] `group.create` with pre-allocation validation and visual-contiguity enforcement.
- [x] `group.ungroup` with identity preservation and current-slot z-order semantics.
- [x] Group move and resize rejection.
- [x] Direct grouped-child mutation rejection.
- [x] Closure-aware Group locking.
- [x] Group delete, duplicate, and reorder semantics.
- [x] Descendant document/Table/asset validation.
- [x] W2.E Group template materialization and pre-allocation validation.
- [x] Group-aware render planning, rendering, measurement, and preflight.
- [x] Page-level snapping uses closed Group frame only.
- [x] Minimum Ctrl/Cmd top-level multi-selection and Group/Ungroup editor commands.
- [x] Group has no resize handles; Inspector X/Y editable and width/height read-only.
- [x] Chromium Group proof.
- [x] Existing W2.C/W2.D/W2.E Chromium regressions.
- [x] Group publication/PDF proof plus existing export/PDF matrix.
- [x] Architecture-boundary protection.
- [x] Final lint/typecheck/test/build gates on final local implementation.
- [ ] Clean commit, normal push, one OPEN PR, and exact-head CI evidence.

## Test plan and evidence

Focused Vitest:

```text
npx vitest run tests/vnext/application/editor-interaction.test.ts tests/vnext/application/editor-workspace.test.tsx tests/vnext/application/group-actions.test.ts tests/vnext/proof/primitives-rendering.test.tsx tests/vnext/proof/authoring-diagnostics.test.ts tests/vnext/proof/architecture-boundary.test.ts

6 files passed
79 tests passed
```

Focused coverage includes strict Group/domain validation, Group assets/Table validation, canonical traversal, 2-object and 100-object create, duplicate/missing/cross-page/locked/nested-source rejection before allocation, adversarial visual non-contiguity, equal-z array-index ordering, move, resize rejection, grouped-child mutation rejection, Redo preservation, delete Undo/Redo, deep duplicate identity/asset behavior, 100 duplicates, adversarial allocator collision, lock closure, ungroup after move/reorder, grouped templates, editor chrome, snapping target filtering, rendering identity, measurement, diagnostics, and architecture boundaries.

## Proof plan and evidence

- [x] `node tests/vnext/proof/editor-group-proof.mjs` — PASS on Chromium `151.0.7922.34`.
  - Real `/v2` Ctrl/Cmd multi-select -> Group -> move preview/commit with snapping -> reorder -> Ungroup -> Undo/Redo -> regroup -> duplicate -> delete -> Undo/Redo.
  - Zero console errors, zero page errors, no Legacy bootstrap, zero Group editor chrome inside `[data-editorial-root]`.
- [x] `node tests/vnext/proof/editor-direct-manipulation-proof.mjs` — W2.C PASS.
- [x] `node tests/vnext/proof/editor-snapping-diagnostics-proof.mjs` — W2.D PASS.
- [x] `node tests/vnext/proof/editor-template-insertion-proof.mjs` — W2.E PASS.
- [x] `node tests/vnext/proof/group-export-proof.mjs` — PASS.
  - Grouped Text/Image/Table render exactly once across screen/print and DPR 1/2.
  - Group wrapper uses no transform/translate/scale/rotate.
  - Native PDF preserves text items, one image paint, and vector path/fill operators.
  - Document/frame hashes remain stable across export.
- [x] `node tests/vnext/proof/export-proof.mjs` — existing screen/print/DPR + native PDF proof PASS, including W2.A representative primitives and R0.1.4 row-span readiness.

## Full local gates

- [x] `git diff --check` — PASS (line-ending conversion warnings only).
- [x] `npm run lint` — PASS with pre-existing repository warnings, zero errors.
- [x] `npm run typecheck` — PASS.
- [x] `npm test` — PASS: 212 files, 2267 passed, 1 skipped.
- [x] `npm run build` — PASS.

## Files

Production/domain/application:

- `src/vnext/domain/editorial-model.ts`
- `src/vnext/domain/object-tree.ts`
- `src/vnext/domain/index.ts`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/document.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `src/vnext/application/template-registry.ts`
- `src/vnext/table/table-model.ts`
- `src/vnext/rendering/PageRenderer.tsx`
- `src/vnext/rendering/PrimitiveRenderer.tsx`
- `src/vnext/rendering/render-plan.ts`
- `src/vnext/rendering/measurement.ts`
- `src/vnext/publication/preflight.ts`
- `src/vnext/app/editor-interaction.ts`
- `src/vnext/app/EditorWorkspace.tsx`

Proof/test infrastructure:

- `src/labs/presys-editorial-proof/main.tsx`
- `tests/vnext/application/group-actions.test.ts`
- `tests/vnext/application/object-actions.test.ts`
- `tests/vnext/application/editor-interaction.test.ts`
- `tests/vnext/application/editor-workspace.test.tsx`
- `tests/vnext/proof/primitives-rendering.test.tsx`
- `tests/vnext/proof/authoring-diagnostics.test.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `tests/vnext/proof/editor-group-proof.mjs`
- `tests/vnext/proof/group-export-proof.mjs`

Durable documentation:

- `docs/stories/2026-09-11-vnext-w2f-group.md`
- `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
- `docs/vnext/PROJECT-STATE.md` (promotion metadata after PR exists)
- `docs/vnext/PRINCIPAL-HANDOFF.md` (promotion metadata after PR exists)

## Scope exclusions

No W2.G direct text editing, contenteditable/caret/IME work, nested Groups, arbitrary transforms, rotation, Group scaling, multi-object move/resize, lasso/marquee, child drill-down, component/live-linked Group system, persistence/Supabase/Auth/CAS, translation/AI/collaboration, Legacy runtime reuse, new Table Engine, new snap engine, or new publication renderer.

## Notes

- The Group publication proof exposed a Q quantization non-additivity case when Group and local child positions were projected independently. Rendering now derives grouped-child local CSS offsets from resolved Page-absolute U projected to Q, then subtracts the Group origin Q. This preserves structural local positioning and makes browser Page geometry equal to the canonical resolved U->Q expectation without transforms or float-mm summation.
- `src/vnext/editor/snapping.ts`, `src/vnext/table/table-layout.ts`, `src/vnext/rendering/TableRenderer.tsx`, `src/vnext/rendering/RichTextRenderer.tsx`, `src/vnext/domain/physical.ts`, and DocumentSession history architecture remain unchanged.
