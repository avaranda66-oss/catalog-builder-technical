# W3-F / AUD013 — Delete Catalog ACK Safety

Status: Ready for Review

## Goal

Ensure a catalog is never removed from local storage or adopted as deleted by the UI before the persistent remote authority acknowledges a successful deletion.

## Base and Branch

- Frozen base: `fb1813aaabdc2df5089495496c6552a443dd4f00` (`integration/company-readiness-w3-train-rr015`).
- Target branch: `remediation/w3f-aud013-delete-catalog-ack`.
- Do not merge or push.

## Acceptance Criteria

1. A remote delete failure leaves the local cache, current catalog, and saved list intact and reports a recoverable error.
2. A successful remote ACK is required before cache removal, workspace reconciliation, or active-catalog replacement.
3. A stale workspace load begun before a successful delete cannot resurrect the deleted catalog after the ACK.
4. An ACK that completes after an identity/session switch is inert.
5. A known newer remote version blocks deletion rather than silently destroying it.
6. When the active catalog is successfully deleted, replacement follows the existing canonical remote-list policy.

## Tasks / Subtasks

- [x] Task 1 — Map the current deletion lifecycle and reproduce ACK-safety failures with deterministic RED tests.
- [x] Task 2 — Apply the minimal store-level remediation without server or schema changes.
- [x] Task 3 — Run focused, regression, and full quality gates; review scope and commit only if the bug is real.

## Scope Guard

- Preferred files: `src/stores/useCatalogStore.ts`, focused store tests, and this story.
- Forbidden: App, ProductKnowledgeRuntime, workbook realtime, RR015 picker, SQL, migrations, and live DB.

## Dev Agent Record

### Agent Model Used

- GPT-5.6 Terra via Codex desktop task.

### Debug Log References

- RED: D1, D3, and D5 failed before the fix. A remote `{ success: false }` still removed local state; a stale `loadWorkspace` resurrected an inactive deleted catalog; and a known newer remote version still invoked delete.
- Focused post-fix: AUD013 7/7 green.
- Required regressions: catalog consistency, AUD012/W3-A, and RR009 65/65 green.
- Full gate: 173/173 files and 1,782/1,782 tests green; `npm run typecheck` and `npm run build` exit 0; `npm run lint` exits 0 with the pre-existing 267 warnings.

### Completion Notes List

- Delete now requires a successful persistent remote response before touching the cache, saved list, or active catalog.
- A successful ACK starts a fresh catalog session before local deletion and reconciliation, which makes older workspace-load completions inert and prevents cache/list resurrection.
- A known newer remote-version barrier blocks deletion and retains the conflict state.
- If remote deletion succeeds but workspace reconciliation fails, the deleted active catalog is cleared and no replacement is invented. The existing remote list ordering remains the active-catalog replacement policy when reconciliation succeeds.
- No App, ProductKnowledgeRuntime, realtime workbook, RR015 picker, SQL, migrations, or live database surface was changed.

### File List

- `docs/stories/2026-09-06-w3f-aud013-delete-catalog-ack-safety.md`
- `src/stores/useCatalogStore.ts`
- `tests/stores/delete-catalog-ack-aud013.test.ts`

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-09-06 | 0.1.0 | Story created from the user-authorized W3-F/AUD013 audit mission. | Dex (Dev) |
| 2026-09-07 | 1.0.0 | Fixed delete ACK safety, stale workspace reconciliation, and known-version conflict handling; completed local gates. | Dex (Dev) |
