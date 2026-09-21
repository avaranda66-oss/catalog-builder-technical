# VNext W4.A — Table Selection + Axis Authoring

Status: Under Review

Date: 2026-09-20

## Provenance

- Repository: `avaranda66-oss/catalog-builder-technical`.
- Verified canonical base SHA/tree: `01c18b10051337b094e04688ff340d8032af1a75` / `7f79259be9bd19d5a5845caacb9120275d817560`.
- Canonical parent: `00b78e6d582a2868e4b0447cb3dee2bf53732299`.
- PR #39 merged; exact-head Quality Gate `35523152738` completed `SUCCESS`.
- Branch: `codex/w4a-table-selection-axis`.
- W3: COMPLETE / CANONICAL. W4.A: implementation authorized. W4.B+: not authorized.

## Goal

Deliver the first independently reviewable W4 slice: pure ephemeral Table selection, strict canonical insert/remove row/column actions, discoverable Table grid interaction, measured preview/overlay geometry, predictable Undo/Redo, and browser/mobile/publication/persistence evidence without implementing the full Advanced Table Editor.

## Acceptance Criteria

- [x] Strict `table.axis.insert` and `table.axis.remove` schemas reject unknown/malformed payloads.
- [x] Actions verify page/object/table identity, closed Group ownership, lock state, stable expected Table state, axis existence, and final canonical validity.
- [x] Insert before/after for rows and columns reuses `insertAxis`, allocates every new ID through the canonical allocator, creates empty cells, preserves surviving identities/frame/style/references, and retains span-expansion behavior.
- [x] Inserted rows explicitly use header context or body plus `AUTO`; inserted columns use explicit flex/minimum defaults without rewriting neighbours.
- [x] Remove reuses `deleteAxis`, rejects last-axis and span intersections, never auto-unmerges, and preserves unrelated annotations/legend entries.
- [x] Failure/no-op preserves document, `localSequence`, history, and Redo; one changed command is one Undo; Redo restores exact IDs.
- [x] Pure selection supports cell/range/rows/columns/table, reverse drag, covered-cell ownership, fixed-point span closure, and explicit axis intent distinct from display expansion.
- [x] Selection is absent from canonical document/history/publication and reconciles safely after insert/remove, Undo/Redo, page/session change, deletion, pointercancel, and capture loss.
- [x] Visible Object → Table Grid interaction supports click/drag/Shift, arrows/Shift+arrows, Tab boundaries, row/column/table selectors, Enter/double activation, visible enter/leave controls, and Escape.
- [x] Grid mode cannot move/resize the Table; closed Groups remain `Desagrupar → editar → Agrupar`; object-mode Ctrl/Cmd multi-selection remains intact.
- [x] Contextual Portuguese controls operate on exactly one explicit axis and explain disabled or blocked commands.
- [x] Visible preview and Table overlays use current measured canonical tracks/rows and caption offset from the exact source; stale measurements are discarded and authored frames remain unchanged.
- [x] Editor containment prevents visible ink leakage without suppressing diagnostics or clipping the hidden intrinsic measurement authority.
- [x] At 320/360/390 px no global document-level horizontal overflow occurs; A4 pans within its viewport; grid controls and Undo/Redo remain reachable without hover-only behavior.
- [x] Chromium proof exercises actual UI selection and axis edits, blocked span removal, visible Undo/Redo, fixed/min row and span alignment, unchanged frame, and zero attributable console/page errors.
- [x] Publication/PDF regressions prove editor chrome absent and document/frame immutability; existing Table/border/headerless/Group regressions pass.
- [x] Changed Table snapshots round-trip and a controlled W3 Save/reopen path is proven with environment limits stated separately from real-production Supabase E2E.
- [x] `git diff --check`, lint, typecheck, full tests, build, focused browser/mobile/PDF proofs, and CodeRabbit critical gate pass.

## Tasks / Subtasks

- [x] Record the W4 contract and this scoped story before product code. (AC: all)
- [x] Implement strict application actions and focused action/history/identity tests. (AC: 1–6)
- [x] Implement pure Table selection helpers and adversarial selection/reconciliation tests. (AC: 7)
- [x] Integrate resource-ready measured plans into the visible editor preview. (AC: 12–13)
- [x] Implement Table Grid interaction and contextual structural controls. (AC: 8–11)
- [x] Add responsive behavior and mobile assertions/screenshots. (AC: 14)
- [x] Add Chromium, publication/PDF, and controlled Save/reopen proofs. (AC: 15–17)
- [x] Run focused regressions, CodeRabbit, and all repository gates. (AC: 18)
- [x] Update this checklist, Dev Agent Record, File List, and status to Under Review without claiming canonical promotion. (AC: all)

## Technical Constraints

- Reuse `insertAxis`/`deleteAxis`; no second Table operation implementation.
- Reuse the existing canonical allocator, document validation, session history, renderer, measurement, persistence, and proof infrastructure.
- Keep application/domain/table independent of React, DOM, and rendering adapters.
- Do not add selection/action props to `DocumentRenderer`.
- Do not implement content editing, merge/unmerge UI, row-role editing, annotations/legend editing, TSV/copy/paste, markers, Fit Height, presets, reorder, drag resize, Group drill-down, W5/W6, AI, migrations, dependency modernization, merge, or production deploy.

## Test Plan

- Focused Vitest: table action schemas/execution/history, pure selection, editor workspace, rendering/measurement, architecture boundaries, persistence snapshot round-trip.
- Chromium: controlled visible `EditorWorkspace` fixture interaction through the actual editor UI, mobile 320/360/390, console/page error capture, geometry assertions, and screenshots.
- Publication: existing canonical export/PDF and Group/Table regression matrix plus W4.A chrome/frame immutability assertions.
- Persistence: existing snapshot round-trip and controlled Save/reopen fixture; report that this is not real-production Supabase Father E2E.
- Full gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`.

## CodeRabbit Integration

Primary type: Frontend + Architecture. Complexity: High.

- [x] Pre-commit: inspect uncommitted changes; zero CRITICAL issues.
- [x] Pre-PR: inspect branch against `main`; zero CRITICAL issues.
- Focus: strict action validation/CAS safety, allocator identity, selection purity, stale async measurement, keyboard/touch accessibility, responsive overflow, publication boundaries, and regression risk.

## Dev Agent Record

### Debug Log References

- Live GitHub baseline reconstructed before branch creation; no material drift from the accepted preflight.
- A full-suite boundary failure caused by the literal DOM token `contentEditable` was corrected without changing the native editable/IME keyboard guard; the isolated architecture test and subsequent full suite passed.

### Completion Notes

- Implemented the scoped W4.A Application Actions, pure selection model, Object → Grid interaction, measured canonical geometry integration, and deterministic history reconciliation.
- Reused the existing Table Engine, allocator, validator, renderer, measurement pipeline, `DocumentSession`, and W3 persistence authority.
- Controlled Save/reopen uses the deterministic in-browser repository and is not real-production Supabase E2E.
- W4.A remains under review; W4.B+ remains unstarted and W4 is not complete.

### Validation

- `npm test`: PASS — 244 files; 2,613 passed; 1 skipped; 0 failed.
- `npm run lint`: PASS — 0 errors; 268 pre-existing advisory warnings.
- `npm run typecheck`: PASS.
- `npm run build`: PASS with existing advisory warnings.
- `git diff --check`: PASS; only Windows line-ending notices.
- Visible Chromium W4.A proof: PASS on Chromium 151.0.7922.34, including desktop, 320/360/390 mobile, structural edits, failure preservation, Undo/Redo exact identity, frame immutability, controlled Save/reopen, measured geometry, and zero attributable console/page errors.
- W2.C/W2.D/W2.F/W2.G and W3.C focused regressions: PASS.
- Canonical export/PDF matrix and Group publication/PDF proof: PASS; editor chrome absent and document/frame hashes unchanged.
- CodeRabbit pre-commit and pre-PR reviews: PASS with zero critical findings.
- CodeRabbit pre-commit review completed over all 23 scoped files with zero critical findings; one major and one minor grid-exit finding were verified, fixed narrowly, and covered by the visible Chromium proof before final gates.
- CodeRabbit post-correction review also completed with zero critical findings. Its remaining major suggestion for per-cell roving focus/Space handling was dispositioned as non-applicable: W4.A intentionally keeps focus on the grid root, delegates Arrow/Shift+Arrow navigation to `EditorWorkspace`, and excludes covered cells as independent keyboard stops; the required keyboard contract is proven in Chromium.

### File List

- `docs/vnext/W4-ADVANCED-TABLE-EDITOR-CONTRACT.md`
- `docs/vnext/W4A-IMPLEMENTATION-HANDOFF.md`
- `docs/vnext/PROJECT-STATE.md`
- `docs/stories/2026-09-20-vnext-w4a-table-selection-axis-authoring.md`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/authoring-diagnostics.tsx`
- `src/vnext/app/styles.css`
- `src/vnext/app/table-grid-overlay.tsx`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/execute.ts`
- `src/vnext/application/index.ts`
- `src/vnext/editor/table-selection.ts`
- `src/vnext/rendering/PageRenderer.tsx`
- `src/vnext/rendering/measurement.ts`
- `src/vnext/rendering/render-plan.ts`
- `src/vnext/table/index.ts`
- `tests/vnext/application/table-axis-actions.test.ts`
- `tests/vnext/editor/table-grid-overlay.test.tsx`
- `tests/vnext/editor/table-selection.test.ts`
- `tests/vnext/proof/editor-table-axis-proof.mjs`
- `tests/vnext/proof/fixtures/w4a-editor-browser.html`
- `tests/vnext/proof/fixtures/w4a-editor-browser.tsx`
- `tests/vnext/proof/fixtures/w4a-table-document.ts`

### Change Log

- 2026-09-20: Contract and Ready-for-Dev story recorded on the exact verified canonical baseline before product implementation.
- 2026-09-20: W4.A implemented and validated; story moved to Under Review without canonical promotion.

## Scope Audit / Deferred

W4.A only. W4 remains incomplete and under review until canonical promotion. The user retains exclusive merge authorization.
