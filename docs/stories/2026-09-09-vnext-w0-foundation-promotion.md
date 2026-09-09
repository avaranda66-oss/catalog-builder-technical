# W0 — VNext Foundation Promotion

Status: IN REVIEW
Date: 2026-09-09
Base SHA: `09fe9d49b65b3d4501c4079b6df38f2d97f595c6`
Base tree: `c62699243c9678f0166de7c2393798aa0f80f847`
Branch: `feat/vnext-w0-foundation-promotion`
Safety checkpoint: `11518b72a2109366eb4f0c67629400ca50be3583`

## Goal

Promote the Principal-approved FOUNDATION-PROOF-01 engine from `src/labs/presys-editorial-proof/` into production-owned `src/vnext/` without changing layout, table, R0.1.4, publication, or resource-readiness semantics. The lab remains only a fixture/browser/PDF harness.

## Promotion map

- Domain: physical arithmetic, diagnostics, canonical editorial model.
- Table: structural validation/merge operations and deterministic column/row layout.
- Rendering: style resolution, render planning, CSS Grid renderers, measurement, border paint, resource readiness, production editorial CSS.
- Publication: structured physical preflight.
- Lab retained: bootstrap, G01–G05/rowspan fixtures, proof controls, lab shell CSS, TA-25N fixture asset.

## Acceptance criteria

- [x] `src/vnext` owns the single reusable foundation; no duplicated lab engine remains.
- [x] Production domain/table arithmetic has no React, DOM, Legacy, lab, test, or scratch dependency.
- [x] R0.1.4 U/Q, cumulative row projection, FIXED/AUTO/MIN, rowspan, track, and paint behavior is unchanged.
- [x] Lab and proof tests consume `src/vnext` implementation.
- [x] Production source contains no proof/fixture/G01–G05 naming.
- [x] Automated import-boundary regression test blocks Legacy authority and reverse proof dependencies.
- [x] Baseline/post-promotion browser fact hash and semantic evidence match.
- [x] Focused and global gates pass; unrelated known lab lint issue remains out of scope.
- [x] `docs/vnext/PROJECT-STATE.md` records W0 IN REVIEW only after verification.
- [x] PR #14 opened against `main` with DO NOT MERGE pending Principal audit.

## Gates

- [x] `npx eslint src/vnext src/labs/presys-editorial-proof tests/vnext/proof`
- [x] `npx vitest run tests/vnext/proof`
- [x] explicit architecture-boundary test
- [x] `npx tsc --noEmit`
- [x] `node tests/vnext/proof/export-proof.mjs`
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `git diff --check`

## PR

PR #14: https://github.com/avaranda66-oss/catalog-builder-technical/pull/14

Closure commit before PR creation: `8120c3cd571d37bb797a942f666a75f8f20f6f8e`.

DO NOT MERGE pending Principal audit.

## Principal decision

Pending Principal audit. Do not merge. Do not start W1.

## File list

- `src/vnext/**` — promoted production foundation and public API.
- `src/labs/presys-editorial-proof/**` — fixture/browser/PDF consumer harness.
- `tests/vnext/proof/**` — production regression proof plus architecture boundary.
- `docs/vnext/PROJECT-STATE.md` — W0 IN REVIEW state.
- `docs/stories/2026-09-09-vnext-w0-foundation-promotion.md` — W0 closure record.
