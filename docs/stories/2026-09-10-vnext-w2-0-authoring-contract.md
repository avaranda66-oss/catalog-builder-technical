# W2.0 — VNext A4 Authoring Contract

Status: READY FOR REVIEW — PRINCIPAL AUDIT
Date: 2026-09-10
Base SHA: `0975953da7a8748b483ba8f64cb69c7cdb9172f6`
Base tree: `d617b9089b2e5dbc94ed02b438e821d7885da6f3`
Branch: `docs/vnext-w2-authoring-contract`

## Goal

Close W1 durably after PR #16 merged and freeze the smallest implementable W2 contract for A4 primitive authoring, object-frame mutation, direct manipulation, diagnostics, and page-template insertion without starting W2 feature implementation or reopening W0/W1 architecture.

## Scope

- Documentation-only W1 closure in current operational memory.
- Canonical W2 primitive contracts for Text, Image, Table, Shape, Line, Icon, plus a deliberate Group implementation boundary.
- Canonical object-frame, selection, action, preview, gesture transaction, snapping, safe-margin, overflow, renderer/overlay, Undo/Redo, template insertion, and future-AI contracts.
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
- [x] Negative positions, safe-area crossing, page crossing, overlap, invalid geometry, minimum canonical dimensions, and z-order semantics are explicit.
- [x] Text, Image, Table, Shape, Line, and Icon have minimum canonical contracts tied to actual technical-catalog evidence.
- [x] Selection, active page, editing mode, and gesture preview are explicitly ephemeral and excluded from `CatalogDocument`.
- [x] Minimum typed W2 object action family is explicit and browser/DOM independent.
- [x] One drag/resize produces one Undo-visible semantic transaction; pointermove does not mutate the canonical session.
- [x] Renderer content and editor overlays are explicitly separated so publication cannot include interaction chrome.
- [x] Snapping is a deterministic pure calculation, not an independent mutation authority.
- [x] Safe-margin and overflow/page diagnostics have explicit severity/publication behavior.
- [x] Image replacement, Text direct-editing seam, Table frame-only mutation, and Shape/Line/Icon limits are explicit.
- [x] Group is deliberately deferred to W2.F until child ownership/coordinate/resize semantics can be frozen coherently.
- [x] Page-template insertion resolves to an ordinary Page plus ordinary canonical objects with fresh IDs and no special template renderer.
- [x] Mandatory W2 tests are specified before implementation.
- [x] W2 is decomposed into small Principal-auditable PR slices rather than one giant implementation PR.
- [x] No persistence, Supabase/Auth VNext, translation, advanced table editing, full template/component library, PIM, Presence/Realtime/CRDT, AI authoring, publication redesign, or automatic pagination/reflow is implemented.
- [x] `src/labs/product-workspace-ux/components/ConflictReviewModal.tsx` remains untouched.

## Principal review focus

Two W2.0 decisions deserve explicit Principal review before W2.A begins:

1. Preserve the existing authored `xMm/yMm/widthMm/heightMm` document shape while requiring integer-U inputs and comparisons at the Application Action/snapping/layout boundary.
2. Defer production Group modeling to W2.F so child ownership, coordinate space, frame derivation, resize, z-order, duplicate/delete, and ungroup semantics are frozen together rather than invented during direct-manipulation UI work.

## Required gates

- [x] `git diff --check` — PASS.
- [x] `npm run lint` — PASS with 0 errors and 268 pre-existing/unrelated warnings.
- [x] `npm run typecheck` — PASS.
- [x] `npm test` — PASS: 204 test files passed; 2134 tests passed, 1 skipped.
- [x] `npm run build` — PASS with existing non-blocking Vite chunk/dynamic-import warnings.

## File list

- `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
- `docs/stories/2026-09-10-vnext-w2-0-authoring-contract.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`

## Out of scope

No W2 feature implementation is authorized by this story. Historical W0/W1 execution stories remain historical records and are not rewritten to simulate current state.

READY FOR PRINCIPAL AUDIT

DO NOT MERGE

DO NOT START W2 IMPLEMENTATION
