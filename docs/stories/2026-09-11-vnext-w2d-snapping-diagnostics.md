# VNext W2.D - Snapping + Authoring Diagnostics

Status: Implementation Complete Locally - Promotion Pending
Date: 2026-09-11
Base SHA: 467942edc14a563a44533edba473b1493bade1e6
Base tree: b9930fd3679e3f73bd6b4221644a1d317176174b
Branch: feat/vnext-w2d-snapping-diagnostics
PR: pending canonical ancestry promotion

## Goal

Implement W2.D only: deterministic pure-U snapping, ephemeral editor guides, safe-area feedback, and presentation of canonical publication diagnostics without changing authored frames or W2.C gesture transaction semantics.

## Provenance

GitHub independently reports PR #20 merged into main as squash commit 467942edc14a563a44533edba473b1493bade1e6, tree b9930fd3679e3f73bd6b4221644a1d317176174b. The recovery worktree currently descends from final pre-squash W2.C head 57e900c10377f9f406772ae1e1cc62660fb9d5a6, whose tree is identical. No W2.D branch may be pushed from that ancestry. The completed W2.D commit must be transplanted onto the canonical squash parent before remote promotion.

## Pure snap model

- src/vnext/editor/snapping.ts is browser-independent and operates only on integer U geometry.
- Candidates: page edges/centers, configured Page.safeArea edges, and sibling object edges/centers.
- Tie order: smallest absolute U adjustment, then safe-area, page-edge, page-center, object-edge, object-center, then stable object ID / edge ordering.
- Move resolves X and Y independently.
- Resize resolves only edges owned by the active handle and preserves the uncontrolled opposite edge.
- Canonical minimum dimension remains 1 U.
- Threshold is supplied in U. The editor converts an 8 CSS px visual radius to U at gesture start; no snap setting is serialized.
- Disabled snapping returns the raw candidate and no guides.

## W2.C integration

Gesture start captures the immutable authored frame and transaction ID. Pointer moves derive raw candidates from the immutable start frame, resolve snapping, and update preview only. Pointer up repeats stale validation and final snap resolution, then emits at most one object.move / object.resize using the original transaction ID. A zero-delta selection click remains a semantic no-op even when the start frame lies inside snap range.

## Guide lifecycle and safe area

Snap guides are ephemeral U-space descriptions rendered only in editor chrome outside [data-editorial-root]. They clear when the candidate stops snapping, snapping is disabled, the gesture commits/cancels, page changes, focus/capture is lost, or Undo/Redo cancels the gesture.

Page.safeArea remains the only canonical safe-area authority. The editor renders a subtle safe-area rectangle and stronger manipulation feedback. Crossing it remains legal authored geometry and is never clamped.

## Diagnostic ownership and measurement probe

authoredFrameDiagnostics(document) is exported from canonical preflight and reused by layoutReport(). The editor combines those canonical frame diagnostics with canonical compilation diagnostics.

Text/Table measurement diagnostics are obtained through an editor-only probe that reuses compilePlans -> DocumentRenderer -> measureTables/captureSnapshot -> layoutReport. The probe renders into a closed ShadowRoot so canonical object identities do not leak into document-level editor selectors. ShadowRoot creation is StrictMode-safe via a synchronous ref guard. Probe results are accepted only when the source CatalogDocument object is still the exact current snapshot; cancellation and animation-frame cleanup prevent stale or leaked work.

Required diagnostics remain unchanged:

- SAFE_AREA_VIOLATION -> WARNING
- OBJECT_OUTSIDE_PAGE -> ERROR
- TEXT_OBJECT_OVERFLOW -> ERROR
- TABLE_CONTENT_OVERFLOW -> ERROR
- TABLE_WIDTH_INFEASIBLE -> ERROR

Diagnostics never rewrite authored frames. Safe-area crossings remain legal, outside-page geometry remains authored but blocking, text overflow does not resize Text, and infeasible Table resizes remain committed.

## Intentional overlap policy

W2.D adds no global pairwise overlap warnings and no collision solver. Intentional Text-over-Shape and comparable layered composition remain publication-legal.

## Validation evidence

Focused Vitest matrix: 12 files, 144/144 PASS, including snapping, W2.C interaction, editor workspace, canonical diagnostics, architecture boundary, primitive/publication overlap, model, geometry, paint, table, stability, and arithmetic adversarial coverage.

Chromium W2.C regression: PASS on Chromium 151.0.7922.34, scale 0.62, with zero console errors, zero page errors, and no Legacy bootstrap.

Chromium W2.D proof: PASS on Chromium 151.0.7922.34, scale 0.62, pxPerMm=2.3433035714285713, zero console/page errors, no Legacy bootstrap, and editorialChromeCount=0. Deterministic evidence includes disabled raw X 1.003mm, page-center Text X 64mm, Text overflow frame height 1mm, infeasible Table width 0.0001mm, and final authored Shape x=140mm, width=64mm.

Export/PDF proof: PASS for the 900/1500 matrix at DPR 1/2 in screen/print modes, native PDF + PDF.js forensics, W2.A representative primitives, and rowspan proof.

Full repository gates after final code changes:

- git diff --check: PASS
- npm run lint: PASS with 0 errors / 268 existing warnings
- npm run typecheck: PASS
- npm test: 210 files PASS; 2230 passed, 1 skipped (2231 total)
- npm run build: PASS; 2327 modules transformed

## Tasks

- [x] Add pure snap engine and adversarial test matrix.
- [x] Integrate snapping into W2.C preview/final commit with visible toggle and no pointermove canonical writes.
- [x] Render ephemeral guides and safe-area interaction feedback outside the publication root.
- [x] Present canonical safe-area/page/text/table diagnostics with friendly editor wording.
- [x] Add diagnostic, W2.C regression, publication-independence, and overlap tests.
- [x] Add deterministic Chromium W2.D proof.
- [x] Run focused proofs, W2.C Chromium regression, export proof, full gates, and scope audit.
- [ ] Transplant the W2.D implementation commit onto canonical 467942ed ancestry.
- [ ] Open exactly one PR and verify base/head/tree/files/commits/mergeability.
- [ ] Update durable project/handoff memory with the real PR number.

## File List

- docs/stories/2026-09-11-vnext-w2d-snapping-diagnostics.md
- src/vnext/app/EditorWorkspace.tsx
- src/vnext/app/authoring-diagnostics.tsx
- src/vnext/app/editor-interaction.ts
- src/vnext/app/styles.css
- src/vnext/editor/snapping.ts
- src/vnext/publication/index.ts
- src/vnext/publication/preflight.ts
- tests/vnext/application/editor-interaction.test.ts
- tests/vnext/application/editor-workspace.test.tsx
- tests/vnext/editor/snapping.test.ts
- tests/vnext/proof/authoring-diagnostics.test.ts
- tests/vnext/proof/editor-snapping-diagnostics-proof.mjs

## Scope audit

No automatic clamp/reflow, collision avoidance, persistent guides, Fit Height, W2.E templates, W2.F Group, W2.G direct text editing, persistence, translation, AI, auto-grow, or automatic pagination was added. Snap/guide state remains absent from CatalogDocument, publication, PDF, and history. DocumentRenderer API is unchanged.

## Deferred W2.E+

Page templates, Group, direct Text editing, persistence, translation, and AI remain deferred. Fit Height, persistent ruler guides, collision avoidance, automatic clamp/reflow, auto-grow, and automatic pagination remain absent.

## W2.0 deviation

NONE