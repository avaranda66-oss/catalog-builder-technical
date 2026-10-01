# W6.A — Recognize and reopen translated copies

Status: **IMPLEMENTED / LOCAL VALIDATION IN PROGRESS**

## Canonical base

- Base: `9009dedcb811c28e6cf7f4be042ec2ec869ec3cc`
- Base tree: `f9b5a90db6fb72fa3e19d7699bf52c0a1e44be2e`
- W5.C PR #59: merged
- W5.C post-merge Quality Gate: `36877251185` attempt 1 — SUCCESS
- Branch: `codex/w6a-copy-identification`

## Father-facing objective

A normal PRESYS office user returning to the Library after translation must be able to identify the translated copy without reading locale codes or technical IDs, understand its relationship to the original when that source is already visible, and reopen the correct catalog.

## Bounded behavior

- `pt-BR` is shown as **Português (Brasil)**.
- `es-ES` is shown as **Espanhol (Espanha)**.
- Only `originKind === "translation"` receives the **Cópia traduzida** badge.
- When the source catalog is already in the loaded Library projection, the row shows `Origem: <título>`.
- Otherwise it falls back to `Origem: catálogo original`, never a UUID.
- Duplicate and starter origins are not mislabeled as translations.
- Existing open/rename/duplicate/archive identity and behavior remain unchanged.
- The row remains usable at 390 px.

## Architecture

W6.A is presentation-only. It consumes metadata already present in `CatalogListItem` and does not add a fetch, persistence field, schema, RPC, migration, renderer, translation authority, or editable source link.

Source-title resolution is deliberately bounded to the already loaded Library result.

## Evidence

Focused Library UI coverage verifies human locale labels, translation-only badge semantics, source-title/fallback behavior, duplicate exclusion and exact translated catalog opening.

The registered W5.C Chromium/PDF proof is extended at its existing return-to-Library point. It now verifies the translated row, original row, 390 px layout and reopening the translated copy before continuing publication/PDF assertions.

## Exclusions

No migration, SQL/RLS, backend change, auth/Recovery/L1 redesign, persistence identity change, dependency change, provider change, source-document mutation, sharing implementation or unrelated polish.

## Promotion

Promotion requires focused tests, full suite, lint/typecheck/build, the extended registered browser proof, adversarial diff review and exact-head Quality Gate SUCCESS. Any merge remains subject to the active night-shift conditional delegation and canonical post-merge push gate.
