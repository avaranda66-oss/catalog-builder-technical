# PRESYS Catalog Builder — AI-native table variety, bounded A4 composition

2026-10-10. Branch `codex/agent-table-variations-20261010` stacked on PR #84.

## Problem actually observed
The 4-turn, 12-page PDF acceptance on PR84 proved the native editor, CAS save/reopen and real PublicationReview PDF path; however, all tables used the same generic border style. Full PDF had fewer than 40 words per page, zero photos and empty technical values, so `FAIL_FATHER_READY_VISUAL_ACCEPTANCE` was correctly recorded.

## Implemented
- `native-table-design.ts` offers only **comparison**, **datasheet** and **matrix**. Same editable engine and A4 physical preflight, but three different native fonts, spacing, column geometry, header and row styling:
  - comparison: deep navy header, white bold labels, pale first column, subtle zebra rows;
  - datasheet: softer light-blue technical datasheet, roomier cells, dark text, distinct first column;
  - matrix: 8pt denser layout, thin grey grid, compact padding and narrower first column.
- The model may propose `table.design` from that strict enumeration only. Arbitrary CSS, custom HTML, unknown layout keys and technical numeric values remain excluded. Old model proposals without `design` remain accepted; the safe default is `comparison`.
- Extended the Supabase Edge composer strict request/response validation and Google JSON response schema to recognize these three profiles, without widening the operation set or enabling paid calls.
- Added dedicated tests for the three native shapes, schema validation, hidden styling injection rejection, exact 6-column × 13-row A4 editing, 60 still-empty technical cells, and Undo.
- Updated the **actual editor + CAS repository + publication A4 browser proof** to generate 4 comparison pages using at least 3 visually distinct style fingerprints across 12 pages. The receipt now records table colors/fonts/padding; the browser test rejects the same-style-only regression.
- Rendered real PDF pages 3, 5 and 8 with PyMuPDF to inspect physical appearance. Different profiles are visibly real in the final PDF rather than only data attributes.

## Proven and not proven
**PASS (local):** model-schema simulation, provider strictness, native editable objects, 12 page/4 table PDF, 4-turn dialogue, save/reopen and all tables not identical. Exact PDF and receipt SHA checked in user's evidence folder.

**FAIL for Father-ready:** this remains an editorial skeleton with empty numerical specifications, no source-certified engineering values, no images, no product photography, no complex merged group headers and too little copy. More visual variety alone does not resolve Father's production acceptance. DO NOT portray these tests as live Gemini, Supabase persistence or client-quality catalog.

## Deployment gate
The Supabase production project previously received the securely disabled Edge composer v1. **This branch changes the Edge response schema** and requires a separately reviewed, exact-SHA deploy **with JWT enabled and composer flags left disabled**, then authenticated acceptance and actual provider calls. Do not merge or activate from this document alone.

## Durable screenshot/PDF evidence
On DESKTOP-2EI1IA1, the contemporaneous acceptance folder is under:
`C:\Users\Usuario\Documents\Codex\2026-10-10\CATALOG_BUILDER_REAL_ACCEPTANCE\06_AGENT_VARIACOES_TABELAS_QA`

GitHub CI exact HEAD runs `tests/vnext/proof/agent-native-full-workflow-proof.mjs` and attaches its PDF + machine-readable receipt to the workflow artifact.
