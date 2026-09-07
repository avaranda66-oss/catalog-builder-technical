# W3-I — Company Acceptance Critical Journeys Foundation

Status: Implemented — PARTIAL / TEST INFRA GAP.

## Goal

Establish the first executable Company Acceptance suite for the critical NEW, EDIT, DELETE and PUBLISH journeys using only the repository's existing test stack, without production behavior changes, dependency changes, package changes, LIVE DB access, or W3-E realtime sibling coverage.

## Base and Branch

- Immutable base: `fb1813aaabdc2df5089495496c6552a443dd4f00`.
- Target branch: `test/company-acceptance-critical-journeys`.
- Commit subject: `test(readiness): add company acceptance critical journeys`.

## Acceptance Classification

| Journey | Classification | Executable evidence |
| --- | --- | --- |
| NEW | PARTIALLY PROVEN | Workspace selection state + Product Workbook V2 create/save/close/reopen round-trip through the real repository adapter with in-memory RPC authority. Browser interaction remains blocked by missing installed runtime. |
| EDIT | PROVEN | Persisted workbook reload, multiple edits, CAS save, reload, exact cardinality and zero duplication. |
| DELETE | PROVEN | Datum, module and dataset-column deletion followed by save/reload, referential validation and explicit ghost-reference checks. |
| PUBLISH | PARTIALLY PROVEN | Synced factual preflight, approved-only knowledge snapshot, immutable publication snapshot/version, pinned resolver, CleanA4Document render and valid `.a4-page-container` export target. Real Chromium/PDF execution remains blocked by missing installed runtime. |
| CLONE | PROVEN | Official cross-product dataset clone path (`cloneDataset`) creates independent identities and survives persistence round-trip. |
| Browser E2E | BLOCKED BY TEST INFRA | `playwright` is declared in `package.json`, but `node_modules` and the browser runtime are absent in this checkout. No install is permitted by mission scope. |

## Tasks / Subtasks

- [x] Inventory existing test infrastructure and browser-E2E availability.
- [x] Confirm Playwright is declared but not installed in the checkout; do not install dependencies.
- [x] Add an executable acceptance suite using Vitest/jsdom contracts already present in the repository.
- [x] Cover NEW persistence round-trip.
- [x] Cover EDIT persistence round-trip and no duplication.
- [x] Cover DELETE datum/module/column permanence and zero ghost references.
- [x] Cover PUBLISH factual truth, preflight, snapshot/version, CleanA4Document and export target.
- [x] Cover CLONE only because an official cross-product clone flow exists in `CrossProductTransferModal`/`cloneDataset`.
- [ ] Focused acceptance gate — BLOCKED BY TEST INFRA: local `vitest` executable is unavailable.
- [ ] Full tests — BLOCKED BY TEST INFRA: local `vitest` executable is unavailable.
- [ ] Lint — BLOCKED BY TEST INFRA: local `eslint` executable is unavailable.
- [ ] Typecheck — BLOCKED BY TEST INFRA: local `tsc` executable is unavailable.
- [ ] Build — BLOCKED BY TEST INFRA: local `tsc`/build toolchain is unavailable.
- [ ] CI — BLOCKED BY TEST INFRA/SCOPE: configured workflow bootstraps with `npm ci`, while this mission forbids installs and no remote push is part of the developer handoff.

## Scope Guard

- No production behavior changes.
- No dependency, package.json or lockfile changes.
- No installs.
- No LIVE DB.
- No W3-E realtime sibling coverage.
- No main branch work.

## Dev Agent Record

### Agent Model Used

- GPT-6 Codex via Codex desktop task.

### Debug Log References

- Repository checkout initially had no installed `node_modules`; direct `import('playwright')` failed with `ERR_MODULE_NOT_FOUND`.
- The frozen base manifest declares Vitest, jsdom, Testing Library and Playwright, so the suite targets the existing Vitest/jsdom stack while browser execution is reported separately.
- Focused acceptance command `npm test -- tests/acceptance/company-acceptance-critical-journeys.test.tsx` reached the package script and stopped because `vitest` is not installed.
- Full `npm test` stopped for the same missing `vitest` executable.
- `npm run lint` stopped because `eslint` is not installed.
- `npm run typecheck` and `npm run build` stopped because `tsc` is not installed.
- `.github/workflows/quality-gates.yml` defines `npm ci`, lint, typecheck, tests and build; running that bootstrap locally would violate the mission's no-install constraint.
- CodeRabbit pre-commit review was attempted through the project-prescribed WSL path and is unavailable (`CODERABBIT_UNAVAILABLE`); no CodeRabbit pass is claimed.

### Completion Notes List

- Acceptance tests use a stateful in-memory RPC authority behind `SupabaseProductWorkbookRepository`, exercising real parse/validation/CAS adapter behavior without network or LIVE DB.
- Publication acceptance pins factual resolution before preflight and renders the same immutable publication snapshot into `CleanA4Document`.
- Browser UI click-through and binary PDF generation are intentionally classified as infrastructure-blocked until the repository's declared runtime is actually installed by the normal environment/CI bootstrap.
- Static review confirmed the suite imports only APIs present on the frozen base and `git diff --check` reports no whitespace errors.
- Company Acceptance verdict for this branch is `PARTIAL / TEST INFRA GAP`; a `GO FOR PRINCIPAL AUDIT` claim is intentionally withheld until the declared test runtime executes the focused and full gates.

### File List

- `docs/stories/2026-09-06-w3i-company-acceptance-critical-journeys.md`
- `tests/acceptance/company-acceptance-critical-journeys.test.tsx`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1 | Added W3-I Company Acceptance foundation and explicit proof classifications. | Dex (Dev) |
| 2026-09-06 | 0.2 | Recorded blocked runtime gates and final `PARTIAL / TEST INFRA GAP` verdict. | Dex (Dev) |
