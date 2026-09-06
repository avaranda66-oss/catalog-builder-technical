# W3-B.1 / RR015 — Picker cross-session isolation

Status: Ready for Review

## Acceptance Criteria

- [x] A real picker unmount/remount with the same provider, product and query starts a new search.
- [x] A late result from the prior lifetime cannot render in the new picker lifetime.
- [x] The current lifetime renders only its own result.
- [x] StrictMode effect replay inside one component lifetime remains deduplicated.
- [x] Closed picker, local selection/filtering, debounce and stale-response suppression retain the RR015 request budget.

## Dev Agent Record

### Completion Notes List

- Scoped pending picker searches to the component lifetime while retaining provider + product + query in-flight dedupe.
- Added the cross-lifetime deferred regression proving a real remount issues a second request, rejects `A_PRIVATE`, and renders only `B_CURRENT`.
- RR015: 7/7 passed. RR006 + PIM integration: 46/46 passed. Full suite: 170 files / 1761 tests passed.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed. Lint retains pre-existing warnings with zero errors.
- CodeRabbit CLI could not run because the configured WSL binary and a native `coderabbit` executable are not installed in this environment.

### Agent Model Used

- GPT-5.6 SOL

### File List

- `src/components/editor/picker/ProductKnowledgePickerModal.tsx`
- `tests/domain/table-core/product-knowledge-picker-request-budget.test.tsx`
- `docs/stories/2026-09-06-w3b1-rr015-picker-session-isolation.md`

### Change Log

- 2026-09-06: Added W3-B.1 regression coverage for picker lifetime isolation.
- 2026-09-06: Isolated in-flight picker dedupe to the mounted component lifetime and completed local validation gates.
