# W0 — VNext Foundation Promotion

Status: IN PROGRESS
Date: 2026-09-09
Base SHA: `09fe9d49b65b3d4501c4079b6df38f2d97f595c6`
Base tree: `c62699243c9678f0166de7c2393798aa0f80f847`
Branch: `feat/vnext-w0-foundation-promotion`

## Goal

Promote the Principal-approved FOUNDATION-PROOF-01 engine from `src/labs/presys-editorial-proof/` into production-owned `src/vnext/` without changing layout, table, R0.1.4, publication, or resource-readiness semantics. The lab remains only a fixture/browser/PDF harness.

## Promotion map

- Domain: physical arithmetic, diagnostics, canonical editorial model.
- Table: structural validation/merge operations and deterministic column/row layout.
- Rendering: style resolution, render planning, CSS Grid renderers, measurement, border paint, resource readiness, production editorial CSS.
- Publication: structured physical preflight.
- Lab retained: bootstrap, G01–G05/rowspan fixtures, proof controls, lab shell CSS, TA-25N fixture asset.

## Acceptance criteria

- [ ] `src/vnext` owns the single reusable foundation; no duplicated lab engine remains.
- [ ] Production domain/table arithmetic has no React, DOM, Legacy, lab, test, or scratch dependency.
- [ ] R0.1.4 U/Q, cumulative row projection, FIXED/AUTO/MIN, rowspan, track, and paint behavior is unchanged.
- [ ] Lab and proof tests consume `src/vnext` implementation.
- [ ] Production source contains no proof/fixture/G01–G05 naming.
- [ ] Automated import-boundary regression test blocks Legacy authority and reverse proof dependencies.
- [ ] Baseline/post-promotion browser fact hash and semantic evidence match.
- [ ] Focused and global gates pass; unrelated known lab lint issue remains out of scope.
- [ ] `docs/vnext/PROJECT-STATE.md` records W0 IN REVIEW only after verification.
- [ ] PR opened against `main` with DO NOT MERGE pending Principal audit.

## Gates

- [ ] `npx eslint src/vnext src/labs/presys-editorial-proof tests/vnext/proof`
- [ ] `npx vitest run tests/vnext/proof`
- [ ] explicit architecture-boundary test
- [ ] `npx tsc --noEmit`
- [ ] `node tests/vnext/proof/export-proof.mjs`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `git diff --check`

## PR

Pending.

## Principal decision

Pending Principal audit. Do not merge. Do not start W1.

## File list

To be completed after implementation and verification.
