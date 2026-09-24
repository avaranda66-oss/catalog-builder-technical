# VNext — W4.D Bulk Authoring / TSV / Clipboard / Markers + Legend Semantics

Status: **UNDER REVIEW**

## Authorization and canonical base

W4.D is the only authorized implementation slice in this worktree.

- Repository: `avaranda66-oss/catalog-builder-technical`
- Canonical dispatch main: `133f0c84def7b8985b554f73cf88874299a40472`
- Canonical tree: `f72c1d46ee00ccf4d6c867178dc4e89f369f2603`
- Direct parent: `19c852ca318ff45f31adacc7ffa29c14fc5d52ed`
- Post-W4.C Quality Gate: `35693950848` — COMPLETED / SUCCESS
- Branch: `feat/vnext-w4d-bulk-tsv-markers`

No W4.E, W4.F0 implementation, W4.F, W4.G, migration, deploy or merge is authorized.

## Product mission

Implement professional content-level bulk authoring over the canonical VNext Table foundation:

- content-only Table Grid copy/paste;
- interoperable `text/plain` TSV;
- conservative external TSV import;
- versioned same-app typed clipboard;
- deterministic rectangular paste and scalar broadcast;
- atomic multi-cell content mutation and bulk clear;
- Marker authoring with the minimum safe Legend lifecycle;
- safe cross-Table Marker transfer;
- one-step Undo/Redo semantics;
- W3 Save/reopen/autosave integration;
- canonical publication/PDF verification;
- keyboard, accessibility and mobile-reachable controls.

## Frozen architecture

Preserve exactly one `CatalogDocument`, one `TableModel`, one Table Engine, one renderer, typed Application Actions, `DocumentSession` history, W3 persistence/autosave/recovery, W4.A selection, W4.B Cell Editing and W4.C topology.

Clipboard is an adapter, never mutation authority. DOM state is never canonical authority.

Copy/paste is CONTENT ONLY. Destination style, presentation, annotations and merge topology remain untouched.

Image typed bulk paste and Image bulk clear are explicitly unsupported in W4.D.

Cut, format paste, Paste Special, HTML formatting import, annotation editing, Fit Height, pagination, presets, translation and AI remain out of scope.

## TSV / clipboard contract

Plain clipboard export is deterministic TSV:

- empty → empty field;
- RichText → flattened text;
- Technical Code → exact string;
- Measurement → qualifier symbol + exact `valueText` + unit;
- Marker → resolved `markerCode`;
- Image → canonical asset alt text.

Quoted fields support embedded TAB, newline and doubled double-quotes. External TSV imports only empty or plain RichText; it never guesses semantic types.

Same-app rich clipboard preserves empty, RichText, Technical Code, Measurement and Marker semantics. Typed Image paste fails closed.
## Paste / identity contract

V1 geometry:

- 1×1 → selected cell;
- M×N → single ordinary cell uses it as top-left;
- M×N → exact M×N selection pastes exactly;
- 1×1 → larger selection broadcasts;
- every other dimensional mismatch rejects;
- no automatic tiling.

No source canonical ID may be installed as a new destination identity. Destination Cell/row/column/Table IDs remain stable. Pasted RichText, imported Legend entries and their RichText allocate fresh canonical IDs.

W4.C remains topology authority. No implicit merge/unmerge and no direct covered-cell write. Multi-cell operations intersecting merged topology fail closed; one merged semantic owner accepts a scalar paste at the anchor only.

## Application actions

W4.D adds the smallest semantic action set:

- `table.cells.setContents`
- `table.legend.create`
- `table.legend.update`
- `table.legend.remove`

Bulk content uses narrow content + semantic geometry CAS, never ordinary full-`expectedTable` CAS. Marker reconciliation may conditionally CAS the destination Legend state.

All bulk mutations are all-or-none. One paste / broadcast / clear / bulk Marker / create+assign is one Application Action and one history entry.

## Marker / Legend lifecycle

Father-facing Marker authoring supports choosing an existing Legend or creating a new one without exposing `legendEntryId`.

Legend lifecycle in W4.D: create, choose, update markerCode, update safe simple RichText text, remove only when unused, detach Marker, textual usage count. Legend reorder and general annotations remain deferred.

Cross-Table Marker paste never copies a foreign `legendEntryId`. It reconciles by markerCode + semantic Legend RichText, cloning with fresh IDs when absent, reusing one equivalent destination entry, and rejecting conflicts/ambiguity.
## Evidence plan

Focused tests must cover TSV parser/serializer, paste geometry, merge safety, narrow CAS/atomicity, identity freshness, content preservation, Marker/Legend lifecycle, cross-Table Marker reconciliation and history.

Dedicated Chromium proof: `tests/vnext/proof/editor-table-bulk-proof.mjs` (or equivalent) must cover Grid copy/paste, typed + text clipboard, Undo/Redo, external quoted TSV, no heuristic type guessing, merged fail-closed behavior, Marker/Legend lifecycle, cross-Table safety, Save/reopen, publication/PDF and functional mobile checks at 320/360/390.

Final regression must preserve W2.C/W2.D/W2.F/W2.G, W3.C/Recovery/W3.G/Asset Insert/W3.H/Father flow, W4.A/W4.B/W4.C, canonical render/publication/native PDF/PDF.js.

Final gates: lint, typecheck, full tests, build and `git diff --check`.

## Hosting / promotion governance

Exact-head GitHub Quality Gate COMPLETED / SUCCESS is the mandatory promotion gate.

External Vercel/Netlify/other preview status is reported separately and truthfully. W4.D does not repair unrelated legacy preview infrastructure.

## Professional UX carry-forward

Track for W4.F0 review: advanced Table Inspector, typography, borders, column resize, row dimensions, axis reorder, context menu, toolbar ergonomics, Legend reorder, annotation completeness, Paste Special, format painter, style reuse, Text/Image/Object/Page controls and mobile contextual editing.

## Evidence and closeout

Implementation evidence, exact test totals, changed files, exact-head provenance, PR status and known limitations will be appended before PR closeout.

Status remains **UNDER REVIEW** until independent adversarial audit and later explicit Principal promotion.

## Final local evidence

Final feature-tree evidence before commit:

- Original focused W4.D suite remains green; amendment cross-wave focused suite: **5 files / 69 passed / 0 failed** (W2.G Text, W4.B Cell, W4.D bulk application/editor/TSV).
- `npm run typecheck`: **PASS** after final W4.D proof/UI tree.
- Dedicated Chromium proof: `tests/vnext/proof/editor-table-bulk-proof.mjs` — **PASS**.
- Chromium: `151.0.7922.34` in the controlled local proof run.
- Browser error budget: `consoleErrors=[]`, `pageErrors=[]`, `failedResources=[]`, `requestFailures=[]`.
- Controlled persistence integration: Save → other catalog → reopen original preserves Cell IDs, RichText IDs, Marker/Legend IDs and authored matrix.
- Production Supabase Father E2E: **not claimed**; proof uses the established controlled repository/runtime fixture.
- Publication: **READY**, zero ERROR diagnostics, zero editor chrome.
- Native Chromium PDF: substantive A4 output; PDF.js verified bulk text, marker code and Legend text.
- Mobile functional proof: **320×900, 360×900, 390×900 PASS** using the visible one-shot **Estender seleção** affordance in touch-capable contexts; rectangular range authoring requires **NO SHIFT / NO HARDWARE KEYBOARD**. Paste fallback, Clear, Marker apply, Legend update, referenced-delete protection, detach→remove, Save, Undo and Redo are functional; no global body/document horizontal overflow.

W4.D browser evidence also proves zero-mutation Copy, same-app typed paste, fresh RichText identity, destination style/presentation preservation, quoted external TSV, no semantic guessing, merged-topology fail-closed behavior, scalar merged-owner paste, Image clear atomic rejection, shared Legend semantics, in-use delete protection, create+assign atomicity and cross-Table Marker reconciliation.
## Regression and final gates

Canonical browser/PDF regression ladder: **16/16 PASS**:

- W2.C direct manipulation
- W2.D snapping/diagnostics
- W2.F Group and publication/PDF
- W2.G Text
- W3.C Save/reopen
- W3 Recovery
- W3.G Asset persistence
- Asset Insert
- W3.H autosave/concurrency
- Father browser flow
- W4.A selection/axis
- W4.B Cell Content/Properties
- W4.C Merge/Unmerge
- W4.D Bulk Authoring / TSV / Clipboard / Markers.

Final repository gates on the final local source tree:

- `npm run lint`: **PASS** — 0 errors; 268 repository warnings remain non-failing and outside this amendment.
- `npm run typecheck`: **PASS**
- `npm test`: **255 test files passed; 2718 passed; 1 skipped; 0 failed**
- `npm run build`: **PASS**
- `git diff --check`: **PASS**
## Scope audit and known limitations

Final W4.D scope remains narrow. Explicitly not implemented:

- Cut
- format paste / Paste Special
- HTML formatting import
- general annotation editor
- cell-image upload or typed Image paste
- Fit Height or pagination
- W4.E
- W4.F0 implementation, W4.F or W4.G
- translation or AI
- formula engine
- sort/filter
- database/Supabase migration
- second Table Engine
- second renderer
- second persistence authority
- production deploy or merge.

Known limitation: browser Save/reopen evidence is controlled persistence integration rather than production Supabase Father E2E. External hosting checks are not promotion authority and remain reported separately. Status remains **UNDER REVIEW** pending independent Gemini W4.D adversarial audit and later explicit Principal promotion.
## Final integration correction

The dedicated browser proof exposed one UI-boundary defect after the pure merged-selection regression was added: Shift+click on a covered slot could canonicalize the focus back to the merge owner and collapse an explicit range into a semantic cell selection. `TableGridOverlay` now preserves the raw slot focus only for explicit range extension/drag while ordinary single-cell activation remains canonicalized to the merged owner.

The exact merged-span browser case now proves zero mutation for explicit range + scalar paste, while a true semantic cell selection on the same merge still accepts the intended 1×1 paste. W4.A/W4.B/W4.C/W4.D proofs and the full repository gates pass after this correction.


## Independent-audit amendment F1–F4

Status remains **UNDER REVIEW**. This is a narrow amendment to existing PR #44; it does not reopen W4.D architecture.

### F1 — TAB contract harmonization

Canonical RichText continues to allow literal ASCII TAB U+0009. Supported simple RichText action inputs now use one shared editable plain-text validator: TAB and LF are allowed; unsupported C0 controls and DEL remain rejected. This applies to W2.G `text.setContent`, W4.B RichText Cell editing, `table.legend.create`, `table.legend.update`, and W4.D plain RichText bulk input without loosening document title, Marker code, Technical Code or Measurement contracts.

Adversarial coverage includes W2.G Text `A<TAB>B` edit + Undo/Redo, W4.B Cell `A<TAB>B` edit + Undo/Redo, Legend create/update retaining TAB, W4.D create+assign Legend later updated through the normal Legend action, and forbidden-control rejection.

The W4.D Chromium proof imports quoted TSV containing `A<TAB>B`, edits it through the real W4.B Cell UI, saves/reopens, publishes READY with literal TAB retained in browser text, and verifies deterministic PDF/PDF.js normalization as `A B!` rather than falsely requiring U+0009 from PDF text extraction.

### F2 — touch-safe range authoring

A narrow UI-only one-shot **Estender seleção** mode was added. It is ephemeral, creates no CatalogDocument/Application Action/DocumentSession state, and cancels on session/mode/Table context invalidation. The next Cell activation uses the current anchor and the touched raw slot as focus, then automatically disarms and restores normal Grid authority.

Desktop single click, Shift+click, drag and keyboard navigation remain intact. Touch drag is still not repurposed as rectangular selection, preserving scroll/pan behavior.

The W4.D Chromium proof now uses touch-capable mobile contexts at 320×900, 360×900 and 390×900. The acceptance flow uses `tap` on first Cell → visible `Estender seleção` button → `tap` final Cell, with **NO SHIFT and NO HARDWARE KEYBOARD**, then exercises Paste, Clear, Marker apply, Undo, Redo, Legend update, referenced-delete protection and detach→remove, with zero global overflow.

### F3 — prepared topology CAS

Each `table.cells.setContents` target now includes an additive narrow `expectedTopology`: either ordinary owner or merged owner with exact rows/columns span. Execution compares the exact live target topology before allocation/mutation and fails `TARGET_STALE` if it changed after preparation.

Existing row/column geometry CAS, target Cell identity CAS, expectedContent CAS and conditional Legend CAS remain intact; no full `expectedTable` CAS was introduced.

Application regressions cover ordinary→merged stale, merged→unmerged stale, merged 1×2→different valid span stale, stable ordinary success, stable merged-owner scalar success, unrelated style tolerance and unrelated Cell-content tolerance.

### F4 — semantic RichText no-op

RichText semantic equality is evaluated before fresh-ID allocation. `richTextCopy` equality ignores canonical IDs while preserving paragraph/list/inline kind/text/marks/line breaks/TAB semantics. `richTextPlain` is a no-op only for the exact simple representation that the action would create.

True no-op bulk actions now return `changed=false`, `createdIds=[]`, `affectedIds=[]`, preserve canonical RichText identities, create no DocumentSession history entry, do not increment `localSequence`, and do not dirty the session. Primitive equality for empty, Technical Code, exact-lexeme Measurement and existing Marker reference follows the same rule.

Mixed broadcasts allocate IDs only for changed RichText targets; unchanged destinations retain their exact canonical IDs and are omitted from affected metadata. A TAB-containing same-app RichText copy/paste no-op is covered in both application and Chromium proof.

### Amendment scope discipline

No Cut, format paste/Paste Special, HTML formatting import, general annotation editor, typed Image paste, cell-image upload, Fit Height, pagination, W4.E, W4.F0 implementation, W4.F, W4.G, translation, AI, formula engine, sort/filter, migration, second Table Engine, second renderer, second persistence authority, deploy or merge is introduced by this amendment.

The **Estender seleção** control is only the W4.D mobile-operability correction; professional Table/mobile UX remains carried forward to W4.F0.
