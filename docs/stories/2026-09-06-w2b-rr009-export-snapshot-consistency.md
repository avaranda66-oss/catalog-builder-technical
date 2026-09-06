# W2-B RR009 — Export Snapshot & Version Consistency

Status: Ready for Review

## Story

**As a** publication/export operator,
**I want** print/PDF/export to use the exact document identity, content, version, and publishing truth that passed preflight,
**so that** a confirmed version can never silently render or export another document state.

## Base and Dependency

- Base branch: `remediation/w2a-rr007-publishing-authority`.
- Immutable base SHA: `a4ca260e36b5af5c9ecde69d3c5973884783ee75`.
- Expected parent: `ef61db30e6cdc659566a3d8f5831d1de82ed43c1`.
- Depends on W2-A RR007 frozen behavior in `docs/stories/2026-09-06-w2a-rr007-factual-publishing-authority.md`.
- Central invariant: `document audited == document rendered == document exported` in identity, content, version, and publishing truth.

## Acceptance Criteria

1. `PublicationsView` exports through a real publication DOM target; an empty selector cannot be treated as success.
2. A print route with requested version `N` parses and validates that version and only proceeds when the loaded document is version `N`.
3. A requested/loaded version mismatch fails closed; no latest-version substitution is allowed.
4. Missing or malformed required print version has explicit fail-closed behavior.
5. Conflict save failure blocks export/print.
6. Non-conflict save failure, including offline/network failure, blocks any output represented as a confirmed version unless an existing canonical policy proves otherwise.
7. The last successful save/flush yields the confirmed document used for publication preflight and immutable render input.
8. Preflight and renderer use the same snapshot identity/version and publishing truth.
9. Realtime or remote mutations after snapshot creation do not silently alter the rendered/exported document.
10. PDF filename/metadata describes the snapshot actually exported.
11. Template print/export obeys the same version consistency invariant when the shared route/contract applies.
12. `PrintDocumentView` continues to use `effective_for_publishing`.
13. `ExportPDFModal` continues to use `effective_for_publishing`.
14. `PublicationsView` continues to use factual publishing preflight.
15. All RR007 permanent regression tests remain green.
16. All permanent RR006 read-authority regression suites remain green.

## Required Reproduction / RED Evidence

- [x] A — Reproduce that `PublicationsView` calls `PDFService.exportToPDF('.a4-page-container', ...)` while its catalogs tab tree mounts no `.a4-page-container`, yielding `Nenhuma página A4 encontrada para exportar o PDF.`.
- [x] B — Reproduce `confirmed N -> print URL version=N -> server latest N+1 -> PrintDocumentView loads N+1` because the current route ignores `version`.
- [x] C — Reproduce non-conflict save failure followed by export/print continuation in `ExportPDFModal`.
- [x] D/E — Reproduce or deterministically prove the mutation window between audit and DOM capture, including remote/realtime update after snapshot.
- [x] F — Verify template parity for shared print/export behavior.
- [x] Convert applicable counterexamples into permanent RR009 tests; A and B must be RED on the immutable base before remediation and GREEN after.

## Tasks / Subtasks

- [x] Task 1 — Reconstruct current export/print call paths and existing version/snapshot contracts (AC: 1–16).
  - [x] Verify remote base SHA and parent before edits.
  - [x] Inspect `PublicationsView`, `ExportPDFModal`, `PrintDocumentView`, `CleanA4Document`, `PDFService`, catalog/template reads, save/flush semantics, and RR006/RR007 regressions.
  - [x] Stop before SQL if historical version recovery would require persistence expansion.
- [x] Task 2 — Add RR009 RED tests from current-code counterexamples (AC: 1–11).
  - [x] Use deterministic deferred promises for race cases; no arbitrary sleeps.
  - [x] Preserve RR007 assertions and publishing policy.
- [x] Task 3 — Implement minimal snapshot/version remediation (AC: 1–14).
  - [x] Prefer an immutable/local materialized confirmed `Catalog` snapshot over new persistence.
  - [x] Pin print route version and fail closed on mismatch/malformed version.
  - [x] Ensure direct Publications export mounts/targets clean publication DOM for the same audited snapshot.
  - [x] Block every unconfirmed save outcome before export/print.
  - [x] Keep rendering on `effective_for_publishing`.
- [x] Task 4 — Validate regressions and quality gates (AC: 15–16).
  - [x] Focused RR009 tests.
  - [x] RR007 permanent regression suite.
  - [x] RR006 permanent regression suites.
  - [x] Existing export/print/publish regressions.
  - [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - [ ] CodeRabbit pre-commit review; no CRITICAL issues.
- [x] Task 5 — Diff audit, commit, and handoff.
  - [x] Audit diff from immutable base for scope violations.
  - [x] Commit only after GREEN as `fix(readiness): pin export snapshot and version`.
  - [x] Remote push/PR is delegated to `@github-devops`; no merge.

## Dev Notes

- The project uses strict TypeScript, React, Zustand/Immer, Vite, Vitest, Tailwind, Supabase adapters, and Node/npm gates. [Source: `docs/framework/coding-standards.md`, `docs/framework/tech-stack.md`]
- New modules should use absolute `@/` imports where practical; tests should cover domain/integration behavior before visual details. [Source: `docs/framework/coding-standards.md`]
- W2-A froze publishing behavior: draft facts are not publishable, runtime unavailable fails closed, publication preflight is factual, and `TechnicalTableBlock` uses `effective_for_publishing` for export while editor rendering uses `effective_for_editing`. [Source: `docs/stories/2026-09-06-w2a-rr007-factual-publishing-authority.md`]
- Current RR009 authority is the immutable base code itself; historical reports may only motivate counterexamples and cannot choose the remediation architecture.
- Persistence expansion is explicitly out of scope. If exact historical version retrieval requires a new table, migration, or structural persistence change, stop with `W2-B RR009: BLOCKED / PERSISTENCE EXPANSION REQUIRED`.

## Allowlist

- `src/components/editor/ExportPDFModal.tsx`
- `src/components/publications/PublicationsView.tsx`
- `src/components/export/PrintDocumentView.tsx`
- `src/components/export/CleanA4Document.tsx` only as needed for stable snapshot identity/render input
- `src/services/pdf.service.ts` only if needed for capture/metadata contract
- helper/type under `src/domain/` strictly necessary for snapshot/version identity
- RR009 tests
- this story file
- `src/components/editor/blocks/TechnicalTableBlock.tsx` only if absolutely necessary to preserve frozen publishing truth across the snapshot boundary; RR007 policy must not change

## Forbidden Scope

- `supabase/**`, SQL, migrations, LIVE DB
- RR011 CAS
- SourceDocument persistence/realtime
- RR006 read-authority semantics
- RR015 request-budget
- RR018 backup/recovery
- dependencies, lockfiles, tooling
- `main`
- broad refactors, unrelated formatting, weakened tests, debug code

## Test Matrix T1–T16

- [x] T1 PublicationsView has a real render target when exporting.
- [x] T2 Empty selector is not treated as success.
- [x] T3 Requested version equals loaded version -> allowed.
- [x] T4 Requested version differs from loaded version -> fail closed.
- [x] T5 Missing/malformed required version -> explicit canonical behavior.
- [x] T6 Save conflict -> no export.
- [x] T7 Non-conflict save failure -> no export unless an existing intentional offline policy is proven safe.
- [x] T8 Preflight and renderer use the same snapshot identity/version.
- [x] T9 Realtime/remote update after snapshot does not silently change exported document.
- [x] T10 PDF filename/metadata matches exported snapshot.
- [x] T11 Template path obeys the same invariant when applicable.
- [x] T12 PrintDocumentView keeps `effective_for_publishing`.
- [x] T13 ExportPDFModal keeps `effective_for_publishing`.
- [x] T14 PublicationsView keeps factual publishing preflight.
- [x] T15 RR007 permanent regressions green.
- [x] T16 RR006 permanent regressions green.

## CodeRabbit Integration

> CodeRabbit is not enabled through `.aiox-core/core-config.yaml`; the developer agent's local definition still requires a pre-commit CLI review when the CLI is available. No production/deployment change is part of this story.

## Dev Agent Record

### Agent Model Used

- GPT-6 Codex via Codex desktop task.

### Debug Log References

- Base authority verified before edits: `a4ca260e36b5af5c9ecde69d3c5973884783ee75`, parent `ef61db30e6cdc659566a3d8f5831d1de82ed43c1`.
- Initial immutable-base RED: 9 failed / 1 passed across the first 10 RR009 cases; A, B, C and F reproduced.
- Residual D/E RED added before resolver remediation: 1 failed / 13 passed; audited `AUDITED R1` was not present in the export DOM after the runtime value changed.
- Post-remediation RR009 focused run: 18/18 green. RR006+RR007+RR009: 34/34 green. Existing export/print regressions: 53/53 green.
- Final gates: lint exit 0 with 267 existing warnings and 0 errors; typecheck green; full test suite 169 files / 1754 tests green; production build green with existing Vite chunk/dynamic-import warnings.
- CodeRabbit review was attempted as required by local developer governance but is unavailable: no registered CodeRabbit tool and `~/.local/bin/coderabbit` is absent in WSL. No CodeRabbit pass is claimed.
- The DevOps-only `validate:port-denylist` gate cannot run because this repository has no such npm script; adding tooling is forbidden by this story.

### Completion Notes List

- Added immutable in-memory publication snapshot identity `kind:id:vN` and strict required-version parsing.
- Publication direct export now mounts a clean, snapshot-specific DOM and `PDFService` fails explicitly when its selector resolves to no pages.
- Save/flush failures of every category fail closed before confirmed output; no offline continuation policy was found.
- Print catalog/template routes reject missing, malformed or mismatched versions rather than substituting latest.
- Publishing datum results are eagerly materialized before preflight and the same cache-only resolver is injected into render, closing the D/E audit-to-DOM mutation window while preserving RR007 `effective_for_publishing`.
- No persistence/history expansion, SQL, migration, RR011, dependency, lockfile or tooling changes were required.

### File List

- `docs/stories/2026-09-06-w2b-rr009-export-snapshot-consistency.md`
- `src/components/editor/ExportPDFModal.tsx`
- `src/components/editor/blocks/TechnicalTableBlock.tsx`
- `src/components/export/CleanA4Document.tsx`
- `src/components/export/PrintDocumentView.tsx`
- `src/components/publications/PublicationsView.tsx`
- `src/domain/publication-export-snapshot.ts`
- `src/services/pdf.service.ts`
- `tests/domain/publication-export-snapshot-rr009.test.ts`
- `tests/integration/export-snapshot-version-consistency-rr009.test.tsx`
- `tests/services/pdf-service-rr009.test.ts`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1 | Initial W2-B RR009 implementation story derived from the user-authorized readiness wave. | River (SM) |
| 2026-09-06 | 1.0 | Implemented and validated RR009 snapshot/version consistency remediation; ready for principal review. | Dex (Dev) |
