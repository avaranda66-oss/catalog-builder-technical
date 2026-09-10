# W2.0 — VNext A4 Authoring Contract

Status: UNDER PRINCIPAL REVIEW — AMENDED FOR RE-AUDIT
Date: 2026-09-10
Base SHA: `0975953da7a8748b483ba8f64cb69c7cdb9172f6`
Base tree: `d617b9089b2e5dbc94ed02b438e821d7885da6f3`
Branch: `docs/vnext-w2-authoring-contract`

## Goal

Close W1 durably after PR #16 merged and freeze the smallest implementable W2 contract for A4 primitive authoring, object-frame mutation, direct manipulation, minimum visible authoring, diagnostics, page-template insertion, real Group semantics, and minimum direct Text editing without starting W2 feature implementation or reopening W0/W1 architecture.

## Scope

- Documentation-only W1 closure in current operational memory.
- Canonical W2 primitive contracts for Text, Image, Table, Shape, Line, Icon, plus a dedicated W2.F Group implementation boundary and W2.G minimum direct Text editing.
- Canonical object-frame, selection, action, preview, gesture transaction, snapping, safe-margin, overflow, renderer/overlay, Undo/Redo, template insertion, and future-AI contracts.
- Minimum visible W2.C authoring surface for common object creation/manipulation and mm-facing numeric geometry.
- Required implementation tests and Principal-auditable W2 PR decomposition.
- No production implementation in this story.

## Acceptance criteria

- [x] GitHub confirms PRs #12, #13, #14, #15, and #16 are merged.
- [x] Exact `origin/main` is `0975953da7a8748b483ba8f64cb69c7cdb9172f6`.
- [x] Exact current tree is `d617b9089b2e5dbc94ed02b438e821d7885da6f3`.
- [x] `PROJECT-STATE.md` and `PRINCIPAL-HANDOFF.md` durably record W0/W0.1/W1 as merged/complete and point to W2.0 contract review.
- [x] W0 R0.1.4 U/Q, row-solving, Table Engine, rendering, publication, and W0.1 layer boundaries are preserved.
- [x] W1 strict typed Application Actions, immutable session, Undo/Redo, semantic no-op, deterministic ID generation, transaction coalescing, and RichText-local identity scope are preserved.
- [x] W2 geometry distinguishes canonical authored `*Mm` serialization from integer-U command/layout authority without reopening the Frame schema merely for naming.
- [x] Negative positions, safe-area crossing, page crossing, legal intentional overlap, invalid geometry, minimum canonical dimensions, and z-order semantics are explicit without making overlap a universal publication warning.
- [x] Text, Image, Table, Shape, Line, and Icon have minimum canonical contracts tied to actual technical-catalog evidence.
- [x] `frame.heightMm` is the sole authored physical Text height authority; W2.A must resolve the secondary Text height field before W3 persistence freeze.
- [x] Image has a minimal normalized `focalPoint` seam with deterministic centered default for `cover` positioning only.
- [x] Selection, active page, editing mode, and gesture preview are explicitly ephemeral and excluded from `CatalogDocument`.
- [x] Minimum typed W2 object action family is explicit and browser/DOM independent.
- [x] One drag/resize produces one Undo-visible semantic transaction; pointermove does not mutate the canonical session; stale/deleted/locked/page-changed targets and Undo/Redo-during-gesture are explicitly handled.
- [x] Renderer content and editor overlays are explicitly separated so publication cannot include interaction chrome.
- [x] Snapping is a deterministic pure calculation, not an independent mutation authority.
- [x] Safe-margin and overflow/page/table diagnostics preserve the existing canonical W0 code vocabulary; no stylistic aliases are introduced.
- [x] Image replacement, W2.G direct Text editing, Table frame-only mutation/commit-then-diagnose semantics, and Shape/Line/Icon limits are explicit.
- [x] Group is dedicated to W2.F, must freeze ownership/coordinates/frame/resize/z-order/identity/nesting semantics coherently, and gates W3 serialization freeze.
- [x] Page-template insertion resolves to an ordinary Page plus ordinary canonical objects with fresh IDs and no special template renderer.
- [x] W2.C visibly owns Add Text/Image/Table/Shape/Line, Delete, Duplicate, Move, Resize, z-order, Replace Image, and numeric x/y/width/height controls in mm quantized to U at the application boundary.
- [x] W2.G visibly owns minimum direct Text editing through typed Application Actions with controlled Undo/Redo, Escape cancellation, frame preservation, overflow diagnostics, RichText-local identity, and technical symbols.
- [x] Mandatory W2 tests are specified before implementation.
- [x] W2 is decomposed into Principal-auditable W2.A through W2.G slices rather than one giant implementation PR, and W2 is not complete until A–G plus the visible basic-authoring path are executable.
- [x] No persistence, Supabase/Auth VNext, translation, advanced table editing, full template/component library, PIM, Presence/Realtime/CRDT, AI authoring, publication redesign, or automatic pagination/reflow is implemented.
- [x] `src/labs/product-workspace-ux/components/ConflictReviewModal.tsx` remains untouched.

## Principal re-audit focus

The amendment applies the reconciled Principal decisions without reopening W0/W1. Re-audit should verify: authored `xMm/yMm/widthMm/heightMm` serialization with integer-U operational authority and mm-facing Inspector input; sole Text physical height in `frame.heightMm`; Image focal point; Table resize commit-then-diagnose; stable W0 diagnostic codes; legal overlap without universal publication-warning noise; stale-safe gesture cancellation/preconditions; canonical `1 U` minimum separated from editor UX minima; W2.F Group as a W3 gate; minimum visible authoring in W2.C; and minimum direct Text editing in W2.G.

## Required gates

- [x] Amendment rerun: `git diff --check` — PASS; no whitespace errors (Git emitted only working-copy LF→CRLF notices for the four documentation files).
- [x] Amendment rerun: `npm run lint` — PASS: 0 errors, 268 pre-existing/unrelated warnings.
- [x] Amendment rerun: `npm run typecheck` — PASS (`tsc --noEmit`).
- [x] Amendment rerun: `npm test` — PASS: 204 test files passed; 2134 tests passed, 1 skipped (2135 total).
- [x] Amendment rerun: `npm run build` — PASS: 2319 modules transformed; Vite built successfully in 11.79s with existing non-blocking dynamic-import/chunk-size warnings.

## File list

- `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
- `docs/stories/2026-09-10-vnext-w2-0-authoring-contract.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`

## Out of scope

No W2 feature implementation is authorized by this story. Historical W0/W1 execution stories remain historical records and are not rewritten to simulate current state.

READY FOR PRINCIPAL RE-AUDIT

DO NOT MERGE

DO NOT START W2 IMPLEMENTATION
