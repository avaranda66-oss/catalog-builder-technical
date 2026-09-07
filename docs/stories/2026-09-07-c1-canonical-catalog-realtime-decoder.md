# C1 — Canonical Catalog Realtime Decoder

Status: Ready for Review

## Goal

Ensure every persistent catalog row is materialized through one canonical decoder so authoritative loads, realtime active-catalog adoption, and realtime saved-list adoption preserve the same legitimate Catalog metadata.

## Base and Branch

- Frozen base: `81c13e4cf1d7f5160b3a16bac250a0e32b076adf` (`origin/main`).
- Target branch: `remediation/c1-canonical-catalog-realtime-decoder`.
- Do not merge or push to `main`.

## Acceptance Criteria

1. Canonical load and realtime decode preserve equivalent domain metadata.
2. A clean active catalog receives remote updates without dropping translation or localization metadata.
3. The `OTHER_CATALOG` saved-list path preserves the same metadata.
4. Existing self-echo and stale-event behavior remains operational.
5. Dirty local catalogs are not replaced to achieve metadata parity.
6. The structural defensive removal guard remains operational.
7. A rich canonical Catalog survives realtime row decoding, adoption, and normal save serialization without canonical metadata loss.

## Tasks / Subtasks

- [x] Task 1 — Map all persistent row-to-Catalog materialization paths and capture deterministic RED metadata-loss tests.
- [x] Task 2 — Establish one canonical row-to-Catalog decoder and use it in authoritative and realtime paths without weakening validation.
- [x] Task 3 — Run focused realtime/persistence regressions and all required quality gates.
- [x] Task 4 — Prepare the focused remediation branch for commit, push, and exact-SHA Quality Gates observation.

## Scope Guard

- Preferred production files: `src/services/realtime.service.ts`, the existing canonical persistence/decoder module or one small pure decoder module, and tests.
- Forbidden: `App.tsx`, Product Knowledge workspace/runtime, workbook realtime, presence, table components, editor selection, Undo, Product Excellence architecture, SQL, migrations, live database access, dependencies, `package.json`, and `package-lock.json`.

## Dev Agent Record

### Agent Model Used

- GPT-5 via Codex desktop task.

### Debug Log References

- Base proof: `origin/main`, initial `HEAD`, and `merge-base` all resolved to `81c13e4cf1d7f5160b3a16bac250a0e32b076adf` after `git fetch origin`.
- RED: C1-T1, C1-T2, C1-T3, and C1-T7 failed because realtime adoption lost locale/translation/extension metadata and allowed payload `createdAt` to override the database row.
- Focused GREEN: C1 7/7 passed; catalog realtime/persistence regressions 116/116 passed.
- Full GREEN: 177/177 files passed; 1,835 tests passed and 1 skipped.
- Static gates: lint exited 0 with 268 pre-existing warnings, typecheck exited 0, build exited 0, and diff-check exited 0.
- CodeRabbit local CLI unavailable in WSL (`~/.local/bin/coderabbit` missing); no local CodeRabbit result was fabricated.

### Completion Notes List

- Authoritative workspace loads and single-catalog reads already used `catalogRowToCatalog`, which preserves the complete persistent payload before applying authoritative row identity, title, version, and timestamps.
- Realtime active-catalog and `OTHER_CATALOG` saved-list adoption now reuse that same mapper instead of maintaining reduced manual projections.
- `SELF_ECHO`, stale rejection, local-conflict handling, the remote-version barrier, and structural removal defenses remain in their original decision flow.
- Normal save serialization retains decoded locale, translation, localization, and supported passthrough metadata; `lastMutation` continues to follow the existing save-mutation rule.
- No forbidden UI, workbook realtime, presence, SQL, migration, live database, dependency manifest, or lockfile path was changed.

### File List

- `docs/stories/2026-09-07-c1-canonical-catalog-realtime-decoder.md`
- `src/services/realtime.service.ts`
- `tests/services/realtime-canonical-decoder-c1.test.ts`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-07 | 0.1.0 | Story created from the user-authorized C1 remediation mission. | River (SM) |
| 2026-09-07 | 1.0.0 | Unified realtime catalog materialization with the canonical mapper and completed C1 regression coverage. | Dex (Dev) |
