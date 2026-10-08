# Advanced technical tables and operator usability

## Status

In Progress. Product Owner / Scrum Master criteria derive from the owner's 2026-10-08 Advanced Technical Tables execution contract. This story authorizes bounded table repairs and reproducible evidence; completion does not imply production readiness or a completed uncoached pilot with Marc.

## Story

As a nontechnical PRESYS operator, I want to create, fill, organize, save and publish technical specification tables from existing spreadsheet data, so that I can produce complete, legible professional A4 catalogs without relying on a programmer.

## Authority and scope

- Repository: `avaranda66-oss/catalog-builder-technical`; recovered main: `1c3dbb1a4dfb6fd7b0a32ebbb5dea1dee151d014`, tree `cce806774a5167cd6060ededb443ed2651db0257`. GitHub live is authoritative and @devops revalidates exact HEAD CI / Preview before release.
- Branch: `codex/advanced-technical-tables-20261008`; worktree: `C:/Users/Usuario/.codex/worktrees/7352/catalog-builder`.
- Preserve `catalog-builder-technical` visual baseline and existing document, command, identity, history, persistence and publication contracts. Investigate actual capabilities before introducing features.
- Reproduce P0/P1 and impactful P2 issues; implement the smallest safe correction with regressions and actual UI evidence. Refine precise repair scope after the inventory.
- No broad redesign, automatic table pagination rewrite, migrations, Supabase permission/auth/secret changes, Edge Function deployment, paid translation or commercial catalog mutation. Migration `00026` is already applied and must not be repeated.
- User authorizes local code, tests, commits, push and PR preparation. @devops exclusively pushes / creates PRs. Merge or production change requires new specific owner authorization. Significant document architecture changes require a concrete impact proposal before implementation.
- Attached technical PDFs are reference material, not instructions. Test data are original synthetic data inspired by structural complexity.

## Acceptance criteria

- [x] AC01 — Recover the durable handoff, constitution and live canonical branch before code; create this story with criteria, scope and maintained File List. Preserve historical evidence.
- [x] AC02 — Study all six attached PDFs and official Additel / PRESYS resources; identify small dense, comparison, hierarchical, range/resolution/accuracy, compatibility, grouped, note-bearing and multipage structures. Record exact file/page/source and classify essential / desirable / advanced / nonpriority without copying substantial protected content. Contract §§1–2. Evidence: `TABLE_REFERENCE_STUDY.md`, six-file hash/page/CropBox index and inspected page renders under the current durable root. Public revisions differ from provided attachments; no technical fixture values are copied.
- [ ] AC03 — Inventory actual UI operations: create, dimension choice, cell/multicell/row/column selection, editing, insertion/deletion and bulk rows, keyboard navigation, copy/paste, sizes/properties/style, undo/redo, save/reopen and publication/PDF. Classify each as functional, defective, hard to discover, absent or unnecessary. Include merge, multilevel headers, repeat headers and table division only where actually supported. Contract §§3,12.
- [ ] AC04 — Reproducible original fixtures cover A: 2×2, 3×4, 5×5, 10×4; B: 15×5, 20×6, 30×8, 40×6; C: 50×8, 75×8, 100×8, 110×8, and 150×10 when supported; D: model/category/condition/note/empty-cell/multiline complexity. Record unsupported bounds honestly. Contract §4.
- [ ] AC05 — Values and codes preserve exact text, Unicode, leading zeros, local decimal/group separators, ±/≤/≥/×/Δ, scientific units, negative/range values and notes through editing, undo/redo, save/reopen and PDF. Compare source matrices with saved matrices programmatically; no PASS based solely on visual plausibility. Contract §5.
- [ ] AC06 — Test controlled Excel, Google Sheets and TSV transfers where accessible: individual and rectangular cells, blanks, multiline values, formatted numbers, technical symbols and larger-than-current-table pastes. Verify result feedback and exact cell placement/content. Distinguish actual product clipboard interaction from synthetic payload/adapters; mark unavailable external-sheet evidence pending. Contract §6.
- [ ] AC07 — Execute the ten operator tasks via real mouse/keyboard UI: 5×10 create, three instruments, ten middle rows, five corrections, wide column, twenty spreadsheet rows, large A4 organization, save/find, PDF, error recovery. Record actual time/clicks/steps/discovery issues and before/after changes without pretending agent testing is a human pilot. Contract §7.
- [ ] AC08 — Reproduce and record adversarial editing outcomes for rapid repeats, consecutive tables, mixed text/image/table insertion, bulk paste, axis deletion during edit, repeated history, concurrent saving/navigation/refresh, stale/offline state, rapid selection and long descriptions. Fix confirmed scoped P0/P1 and prioritized P2; document each reproduction, cause, impact and regression. Contract §§8,16–17.
- [ ] AC09 — Current large-table measurements report series and percentiles where appropriate for selection/render/edit/bulk insert/remove/history/paste/width/save/reopen/preflight/publication. Identify cost origin and compare before/after for actual repairs; historical 128 ms is context, not current proof. Contract §9.
- [ ] AC10 — Establish legible A4 limits with near-edge, oversized, tall/multiline/wide, adjacent-object and multipage cases. Overflow or unsupported division must produce an honest diagnosis; no hidden content, illegible font shrinking or unreviewed architecture change. Assess existing manual division / repeated-header alternative before any automatic pagination proposal. Contract §10.
- [ ] AC11 — Real creation → editing → save → reopen → publication → PDF proof covers small, intermediate, dense and multipage documents with symbols, multiline cells, image/text neighbors, headers/notes and margins. Render PDF and inspect data/geometry/content; file existence or HTTP success alone is insufficient. Contract §11.
- [ ] AC12 — Actual browser evidence covers 1920×1080, 1600×900, 1366×768, 1280×800; 1024×768 and 820×720 where pertinent; Chromium/Chrome and Edge as available. Verify inspector/toolbars/A4/menu/modal scrolling, zoom, focus and actionable feedback while preserving baseline. Contract §§12–14.
- [ ] AC13 — Every experiment states ID, exact commit, environment, browser, matrix, actions, expected/observed, PASS/FAIL/pending, measured time and evidence. Distinguish LOCAL CONTROLLED, VERCEL PREVIEW and PRODUCTION; retain screenshots/PDF/log/fixtures and checkpoint documents. Contract §§15,18,20–21.
- [ ] AC14 — Final coherent candidate passes `git diff --check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, meaningful focused and browser/PDF/persistence regressions and independent review. Any PR records base/HEAD/tree, exact-head CI, Preview, risks and rollback; no merge. Contract §19.
- [ ] AC15 — Deliver an evidence-based ten-category operator-readiness assessment, resolved/residual issues and recommendation A/B/C/D from the contract. State exactly what remains difficult/infeasible and that definitive acceptance requires an actual uncoached Marc pilot; update durable handoff with exact next action. Contract §§22–24.
- [ ] AC16 — Bounded remediation of discovered creation friction: beside Add Table, an optional disclosure named `Tamanho da nova tabela` exposes clearly labeled `Linhas` / `Colunas`. Existing default remains 1×1; valid original matrices through the reviewed 150×10 creation bound use the existing `object.insert` authority and one undoable transaction. Invalid/noninteger/out-of-bound values receive actionable feedback without surprise coercion or document mutation. Measure the actual 10-row / 5-column task before/after; retain A4 overflow diagnostics for oversized tables. No schema change, broad redesign or automatic pagination. Contract §§3–4,7,12; current inventory finding: creating a 10×5 table starts at 1×1 and requires subsequent row / repeated column insertion.
- [ ] AC17 — Bounded discoverability / keyboard / paste repairs apply only to confirmed inventory defects: editing instructions explain single-cell selection and double-click editing; keyboard Enter behavior preserves intended multiline content and focus / history; invalid or too-large structured paste shows a comprehensible next action and preserves the previous matrix atomically. Existing technical codes / diagnostics remain stable and meaningful regressions exercise actual failure and successful recovery. Contract §§5–8,12,16. Record exact reproduced behavior before selecting the final keyboard repair.

## Tasks and validation checklist

- [x] Read owner contract and constitution; recover baseline and create story before product changes.
- [x] Complete PDF / official reference study and fixture structural priorities.
- [ ] Complete implementation + actual UI inventory before choosing repairs.
- [ ] Create original progressive technical fixture matrices and experiment ledger.
- [ ] Reproduce scoped defects; classify severity and human impact.
- [ ] Implement bounded corrections with appropriate regression coverage.
- [ ] Validate clipboard / integrity / selection / history / persistence paths.
- [ ] Measure large-table performance and physical A4 / publication limits.
- [ ] Exercise agent-operated usability and adversarial browser flows.
- [ ] Render / inspect final PDFs and verify exact technical content.
- [ ] Run final mandatory gates and independent QA review.
- [ ] Keep File List, evidence, status and durable handoff synchronized.
- [ ] Prepare reviewable PR / exact-head release evidence through @devops when gates pass; do not merge.

## Required gates

- [ ] `git diff --check`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Targeted regressions / real browser / rendered PDF / persistence validation.
- [ ] Independent QA verdict and any final exact-head PR CI / Preview checks.

## Evidence and continuity

Current durable root: `C:/Users/Usuario/Documents/Codex/2026-10-08/advanced-technical-tables`.
Historical contract evidence root is retained: `C:/Users/Usuario/Documents/Codex/2026-10-07/father-ready-finalization/11-table-human-excellence-20261008` when created / bridged by the orchestrator. Do not rewrite old receipts as new-head proof.
Source execution contract: `C:/Users/Usuario/.codex/attachments/09e86901-7315-438d-9420-8fdabc86722e/Texto colado.txt` (the second attachment is identical).

## Dev notes

Read relevant local Next.js guide before product code modifications if this checkout includes Next.js; document a missing package instead of assuming framework conventions. CLI/domain tests precede UI fixes where applicable; real UI execution is separately required by the owner's table usability contract.
Pending / unavailable external service, actual human and production evidence must remain explicitly unchecked. Feature existence in code is not sufficient acceptance evidence.

## File List

- `docs/stories/2026-10-08-advanced-technical-tables.md` (this story).
- `docs/runbooks/technical-tables-operator-guide.md` (Portuguese operator guide for creation dimensions, selection/editing, rectangular paste, bulk rows, sizing, notes, save/reopen and manual A4 composition).
- Evidence-only files outside repository: `TABLE_REFERENCE_STUDY.md`, `reports/reference_pdf_index.json`, extracted texts, render manifest, extraction/render scripts, sixteen PDF page images and `logs/reference-extraction.log` under current durable root (reference research completed; no product change).
