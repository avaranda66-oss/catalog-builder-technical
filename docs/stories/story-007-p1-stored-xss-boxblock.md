# Story 007 — P1 Stored XSS in BoxBlock

Status: Ready for Review

## Story

As a catalog editor user, I need `BoxBlock.textContent` rendered as plain user text with only the supported `**bold**` and `*italic*` inline syntax so that stored, imported, copied, or legacy raw HTML can never become executable DOM markup in editor or print surfaces.

## Acceptance Criteria

1. `src/components/editor/blocks/BoxBlock.tsx` no longer uses `dangerouslySetInnerHTML` for `block.textContent`.
2. Raw HTML stored in `BoxBlock.textContent` renders literally; it does not create user-authored HTML elements or event handlers.
3. Existing lightweight `**bold**` and `*italic*` formatting still renders semantically as `<strong>` and `<em>` React nodes.
4. Legacy persisted markup is neutralized at render time without rewriting catalog data.
5. The editor/A4 preview and `CleanA4Document` print path both render the same safe BoxBlock behavior.
6. The existing local persistence reload path and backup JSON import path preserve the raw string while rendering it safely.
7. Templates/copies that reuse the shared BoxBlock renderer inherit the same safe boundary; no independent BoxBlock HTML sink remains.
8. Repository-wide searches for `dangerouslySetInnerHTML`, `innerHTML =`, `insertAdjacentHTML`, and `document.write` classify every production result and reveal no second user-controlled BoxBlock sink.
9. Security regressions use inert structural assertions only and never trigger scripts, events, external requests, credential reads, live database writes, or destructive data migration.
10. No new dependency is added and `package.json` / `package-lock.json` remain unchanged.
11. Targeted security tests, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check` pass on the isolated remediation branch.

## Tasks / Subtasks

- [x] Replace the BoxBlock HTML string sink with deterministic safe React-node rendering.
- [x] Preserve `**bold**` and `*italic*` formatting and existing empty-content placeholder behavior.
- [x] Add inert regressions for raw span markup, event-bearing image markup, supported formatting, persistence/reload, backup import, editor preview, and print rendering.
- [x] Verify template/copy reuse and classify all production HTML sinks without refactoring unrelated code.
- [x] Run targeted and full validation gates.
- [x] Update this story's Dev Agent Record, File List, Change Log, and Status after successful validation.

## Dev Agent Record

### Agent Model Used

- GPT-6 Codex

### Debug Log References

- Base verified at `2720b7cd30f3ac0b461165444f3e930ec38c09d5` in isolated branch `remediation/security-xss-p1`.
- Targeted security suite: `tests/components/box-block-xss-security.test.tsx` — 7/7 passing.
- Full suite: 157 files / 1669 tests passing.
- `npm run typecheck`: PASS.
- `npm run build`: PASS (existing Vite/pdfjs/chunk warnings only).
- `git diff --check`: PASS.
- `npm run lint`: unavailable on H0A because `package.json` defines no `lint` script, as anticipated by the remediation mission.
- CodeRabbit CLI: unavailable in the configured WSL environment (`CODERABBIT_NOT_INSTALLED`).
- Final production sink audit: no executable `dangerouslySetInnerHTML`, `.innerHTML =`, `insertAdjacentHTML`, or `document.write` sink remains; the sole `dangerouslySetInnerHTML` text match is a comment in `TextBlock.tsx`.

### Completion Notes List

- Removed the BoxBlock HTML-string/browser-parser boundary and replaced it with React text nodes plus `<strong>` / `<em>` nodes for the two supported inline markers.
- Raw stored/imported HTML is preserved as data and rendered literally, protecting legacy records without migration.
- `A4Canvas` and `CleanA4Document` both reuse the remediated `BoxBlock`, so editor preview and print share the same safe rendering boundary.
- Page thumbnails and inspector fields render `textContent` through ordinary React text/value bindings and are not HTML sinks.
- Catalog duplication/template flows preserve content as data and return to the shared renderer; no independent BoxBlock HTML sink was found.
- No package, quality-gate, Supabase migration, SemanticEditor, G1 store, or live database changes were made.

### File List

- `docs/stories/story-007-p1-stored-xss-boxblock.md`
- `src/components/editor/blocks/BoxBlock.tsx`
- `tests/components/box-block-xss-security.test.tsx`

## Change Log

- 2026-09-05: Story created for `COMPANY.READINESS.SECURITY.XSS.FIX1` from the confirmed P1 remediation mission.
- 2026-09-05: Removed the stored-XSS sink, added seven inert security regressions, and completed targeted/full validation.
