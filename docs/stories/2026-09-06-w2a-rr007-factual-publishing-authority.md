# W2-A RR007 — Factual Publishing Authority

Status: Ready for Review

## Goal

Ensure every current publication/export path uses factual knowledge eligible for publishing while preserving the existing editing semantics and all RR006 read-authority invariants.

## Reproduction

- [x] Base verified at `ef61db30e6cdc659566a3d8f5831d1de82ed43c1` with parent `175639f3a53f6a0461325388540f1da1feb4f703`.
- [x] H1 counterexample reproduced: runtime `ready`, editing resolution selected a draft product override (`0.05 °C`), publish safety returned `canPublish: true`, while canonical `effective_for_publishing` selected the approved family value (`0.1 °C`).
- [x] Direct `PublicationsView` export bypass and print/export rendering path were confirmed against the same base.
- [x] Permanent RR007 regression test was RED on H1 and GREEN after remediation.

## Acceptance Checklist

- [x] Approved product facts remain publishable.
- [x] Eligible inherited/family facts remain publishable.
- [x] Standalone draft technical facts fail closed.
- [x] Draft local overrides cannot shadow an eligible inherited publishing fact.
- [x] Runtime `unavailable` fails closed.
- [x] Existing `partial` snapshot fallback semantics are preserved.
- [x] Conflicting factual resolution remains blocked.
- [x] `ExportPDFModal` uses the canonical publishing resolver and safety audit.
- [x] `PublicationsView` preloads and audits before direct PDF export.
- [x] `PrintDocumentView` preloads and audits before print/PDF/autoprint.
- [x] Technical table rendering switches to publishing truth for export/PDF capture while normal editor rendering keeps editing truth.
- [x] Publishing projection is materialized from the same authoritative RR006 reads; no duplicate network reads or retries were introduced.
- [x] RR006 permanent regression suites remain green.

## Validation

- [x] `npx vitest run tests/integration/factual-publishing-authority-rr007.test.ts` — 4/4 passed after remediation.
- [x] RR006 + RR007 focused suites — 16/16 passed.
- [x] Table Core / publish / export integration regression set — 74/74 passed.
- [x] `npm run lint` — exit 0, 0 errors (267 pre-existing warnings).
- [x] `npm run typecheck` — exit 0.
- [x] `npm test` — 166 files, 1736/1736 tests passed.
- [x] `npm run build` — exit 0; existing Vite chunk/dynamic-import warnings only.

## File List

- `src/domain/table-binding/product-knowledge.runtime.ts`
- `src/stores/useCatalogStore.ts`
- `src/domain/table-core/publish-safety.audit.ts`
- `src/components/editor/blocks/TechnicalTableBlock.tsx`
- `src/components/editor/ExportPDFModal.tsx`
- `src/components/publications/PublicationsView.tsx`
- `src/components/export/PrintDocumentView.tsx`
- `tests/integration/factual-publishing-authority-rr007.test.ts`
- `docs/stories/2026-09-06-w2a-rr007-factual-publishing-authority.md`

## Scope Guard

- No Supabase, SQL, migration, SourceDocument/RR011, dependency, lockfile, build-tooling, or `main` changes.
- RR009 snapshot/versioning architecture remains outside this remediation.
