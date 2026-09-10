# Catalog Builder VNext — Project State

STATUS: POST-W2.0 CANONICAL BASE; W2.A PR #18 OPEN FOR PRINCIPAL REVIEW

DATE: 2026-09-10

PURPOSE: provide the current VNext facts and next action so the project can be reconstructed from GitHub without chat memory.

## PRODUCT

**Catalog Builder VNext / PRESYS** is a professional technical-catalog authoring system for non-technical PRESYS users. The primary acceptance persona is the user's father: a professional office user who must be able to create, edit, save, reopen, translate, publish, and share a catalog without developer help.

VNext must be simpler internally than Legacy while becoming more capable, editable, professional, and easy to use.

## CURRENT CANONICAL ENGINEERING BASE

Repository: `avaranda66-oss/catalog-builder-technical`.

Current canonical main SHA after W2.0 contract promotion: `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`.

Current canonical tree: `fa61d3e8cc978a0af928423fc9c21550e618e675`.

This is the independently verified merge result after PR #17. Future documentation-only commits do not make this paragraph a self-updating SHA pointer; always verify live `origin/main` and GitHub before acting.

PR #12: **MERGED**.

PR #13 — FOUNDATION-PROOF-01: **MERGED**.

PR #14 — W0 Foundation Promotion + W0.1 Production Boundary Hardening: **MERGED**.

Handoff sync vehicle: **PR #15 — MERGED / COMPLETE** at `ff4ce7302fe79ce9c2f431a09b94dd0e0ddaed7f`.

W1 review vehicle: **PR #16 — MERGED / COMPLETE** at `0975953da7a8748b483ba8f64cb69c7cdb9172f6`.

W2.0 contract promotion vehicle: **PR #17 — MERGED / COMPLETE** at `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`.

W2.A implementation review vehicle: **PR #18 — OPEN / PRINCIPAL REVIEW REQUIRED**. Its branch is `feat/vnext-w2a-primitives-rendering`; GitHub is authority for its live state. Do not treat W2.A as canonical until that PR is independently reviewed and merged.

Always run `git fetch origin --prune` and verify GitHub before acting. Git history and repository evidence outrank agent reports.

## CURRENT PHASE

Post-W2.0 canonical engineering base: **ESTABLISHED**.

Handoff synchronization: **COMPLETE** via merged PR #15.

W0 — Foundation Promotion: **MERGED / COMPLETE**.

W0.1 — Production Boundary Hardening: **MERGED / COMPLETE**.

W1 — Application Actions + Minimal VNext Shell: **MERGED / COMPLETE**.

W2.0 — A4 Authoring Contract: **PRINCIPAL ACCEPTED / MERGED VIA PR #17**.

W2.A — Primitive Domain + Publication-Safe Rendering: **IMPLEMENTATION CANDIDATE IN PR #18 / PRINCIPAL REVIEW REQUIRED**.

Foundation: **production-owned and strongly validated**.

Product: **still under construction**.

Do not encode conversational progress percentages as project truth.

PR #15 is merged and the post-W0 handoff sync is **COMPLETE**. PR #16 is merged, so W1 is canonical on `main` and closed. PR #17 is also merged; the amended W2.0 contract is **PRINCIPAL ACCEPTED** and the verified canonical base is SHA `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`, tree `fa61d3e8cc978a0af928423fc9c21550e618e675`. W2.A has an implementation candidate in **PR #18**. GitHub is authority for that PR’s live state; do not claim W2.A complete or canonical before independent review and merge.

## CANONICAL PRODUCTION OWNERSHIP

Production VNext foundation owner: `src/vnext/`.

It currently owns the proven foundation layers for:

- domain;
- table;
- rendering;
- publication preflight.

`src/labs/presys-editorial-proof/` is now only a fixture, browser harness, and PDF proof harness. It is **not** foundational engine authority.

Do not recreate a second production engine from the lab.

## W0 FOUNDATION CONTRACT

W0 promoted the Principal-approved FOUNDATION-PROOF-01 engine without reopening its architecture. Preserve these established invariants:

- finite physical A4 pages and authored object frames;
- authored geometry in integer U;
- browser/render measurement in integer Q;
- exact monotone `minimumUForProjectedQ`;
- cumulative projected row boundaries;
- global deterministic rowspan constraint solving;
- only `AUTO` / `MIN` rows grow; `FIXED` rows never grow;
- blocking rendered fit is Q/Q;
- the final postcondition blocks residual overflow;
- one canonical Table Engine;
- stable IDs and typed `CellContent`;
- spans and explicit merge ownership;
- CSS Grid editorial rendering;
- deterministic resource readiness;
- structured preflight diagnostics;
- one canonical editorial render tree;
- Chromium textual/vector PDF proof.

Do not restate or reinvent the mathematical history during feature work. See `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md` and `docs/vnext/presys-mvp-r0/evidence/proof-result.md`.

## W0.1 PRODUCTION BOUNDARIES

Two production-boundary corrections were required before PR #14 merged.

First, production `DocumentRenderer` renders canonical document content only. It has no renderer-authored footer/page-copy side channel. Proof footer/page numbering remains lab-only decoration.

Second, public APIs are layered:

- `src/vnext/index.ts` — pure domain/table only;
- `src/vnext/rendering` — React/browser/rendering/measurement/resources;
- `src/vnext/publication` — publication/preflight.

Renderer CSS is scoped under `[data-editorial-root]`. Generic production renderer CSS does not own global `@page` policy. `tests/vnext/proof/architecture-boundary.test.ts` protects these boundaries.

## CANONICAL PRODUCT ARCHITECTURE

Canonical hierarchy:

```text
Catalog
→ Pages
→ Objects
→ Properties
```

The user owns position, size, composition, and page placement. The system owns snapping, guides, safe-margin warnings, overflow diagnostics, and publication validation.

The system must never silently move objects between pages, create continuation pages, resize authored frames, or restructure the document.

## CANONICAL PRIMITIVES

Father V1 requires the generic primitive set:

- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- Group.

The 24-page reference audit did not justify vendor- or document-specific engines. Complex pages are compositions of these primitives plus the one canonical Table Engine, presets, components, and templates.

## TABLE ENGINE

There is **one canonical Table Engine**.

Do not create Additel, Fluke, accessories, ordering, electrical, compatibility, or other specialized table/rendering engines.

Father-V1 table UX must include advanced structural editing and explicitly support:

- spreadsheet-like range/row/column selection;
- add/delete rows and columns;
- group headers and section rows;
- merge/unmerge;
- table title, captions, notes, footnotes, and legends;
- TSV/spreadsheet clipboard paste;
- marker-cell bulk toggle for compatibility matrices;
- table presets;
- explicit **Fit Height to Content / Ajustar altura**.

Fit Height is an Application Action/user command that may mutate the authored frame only when explicitly invoked. Measurement or rendering must never silently resize the frame.

## UX LAB EVIDENCE

Experimental branch: `lab/vnext-editor-ux-astra`.

Status: **EXPERIMENTAL — NOT PRODUCTION — DO NOT MERGE BLINDLY**.

The lab was initiated by Astra and continued by Gemini after Astra quota exhaustion. It must not contribute its mock domain/table state, approximate layout logic, or ephemeral React state to production.

High-confidence interaction findings:

- direct manipulation should be primary;
- common actions should be contextual;
- Inspector should own deeper and low-frequency properties;
- table selection should feel spreadsheet-like;
- interaction chrome must remain visually separate from document content;
- table content overflow must not visually leak uncontrolled outside its authored frame;
- explicit Fit Height is preferable to silent frame mutation;
- Undo/Redo must be visible and predictable;
- cover/page templates should yield normal editable canonical objects;
- safe margins should behave as hybrid guidance: subtle in repose, stronger during movement, warning rather than hard constraint.

Do **not** freeze from the lab alone: exact toolbar layout, Inspector width, color/opacity, icon count, button labels, or panel placement.

## UX FACT VS USER-TEST HYPOTHESIS

### HIGH-CONFIDENCE PRODUCT RULES

- direct manipulation;
- contextual common actions;
- deeper Inspector;
- finite A4;
- explicit overflow corrections;
- templates resolve to editable canonical objects;
- visible/predictable Undo/Redo;
- spreadsheet-like table selection;
- no silent authored geometry mutation.

### USER-TEST HYPOTHESES

- exact Tool Rail icon count;
- exact contextual toolbar composition;
- exact Inspector width;
- exact safe-guide visual treatment;
- `Blocos` vs `Componentes` wording;
- exact Pages/Layers defaults;
- exact zoom;
- exact keyboard workflow;
- exact color-palette presentation.

Lab preferences are evidence for testing, not frozen architecture.

## 24-PAGE REFERENCE AUDIT

External reproducibility audit visually inspected 24 pages:

- Additel 875 — 8 pages;
- Additel 761A — 6 pages;
- Fluke 9140 / 9142 / 9143 / 9144 material — 6 pages;
- Isotech Europa / Venus / Calisto — 4 pages.

The audit studied editorial capability only. Do not copy competitor branding, visual identity, product claims, or specifications.

Core conclusion: **THE VNEXT ARCHITECTURAL DIRECTION REMAINS SOUND.**

The references exposed product-capability gaps rather than a contradiction in the foundation. The smallest coherent primitive set remains approximately Text, Image, Table, Shape, Line, Icon, Group. Complex diagrams may be imported as SVG or high-resolution raster assets.

## FATHER-V1 REQUIREMENTS CONFIRMED BY PRODUCT EVIDENCE

The following are explicit Father-V1 requirements:

- standalone Image primitive;
- Shape primitive;
- Line primitive;
- Group capability;
- direct rich-text editing;
- discoverable technical-symbol insertion for common engineering symbols such as `±`, `°C`, `Ω`, `µ`, `≤`, `≥`, `≈`, without treating that sample as exhaustive;
- TSV/spreadsheet clipboard paste into tables;
- marker-cell bulk toggle;
- explicit Fit Height to Content / Ajustar altura command;
- table presets;
- minimum page templates before the first father pilot;
- minimum catalog starter before the first father pilot;
- minimum reusable Components / `Blocos` capability before or by the first father pilot;
- highly discoverable Replace Image;
- complete semantic translation coverage;
- professional Chromium PDF publication.

## THE EASY BUTTON LAYER

Internal architecture can remain powerful while common professional outputs stay fast through:

- table presets;
- page templates;
- catalog starters;
- reusable components / `Blocos`;
- contextual commands.

`Preset != Engine`.

`Template != New Renderer`.

`Component != Special Block Engine`.

Every preset, template, starter, or component must resolve into normal canonical editable primitives.

**MINIMUM EASY-BUTTON LAYER BEFORE FATHER PILOT.**

## ROADMAP

No exact dates or detailed W6/W7 implementation boundary are frozen.

- **W0 — Foundation Promotion + W0.1 Boundary Hardening:** merged / complete.
- **W1 — Application Actions + Minimal VNext Shell:** typed mutation actions, Undo/Redo foundations, isolated `/v2` shell. **MERGED / COMPLETE — PR #16**.
- **W2 — A4 Authoring + Primitives + Direct Manipulation:** W2.A primitive/domain + publication-safe rendering (including Text-height resolution and Image focal point); W2.B typed Object Application Actions; W2.C ephemeral selection/direct manipulation plus minimum visible basic authoring and mm-facing geometry; W2.D pure snapping/guides/authoring diagnostics; W2.E page-template materialization; W2.F real canonical Group; W2.G minimum direct Text editing. W2 is not complete until A–G and the visible basic-authoring path are executable.
- **W3 — Save/Reopen/Catalog Library:** versioned persistence, recovery/reopen, and a persistable starter/catalog creation path.
- **W4 — Advanced Table Editor:** structural table editing plus TSV paste, marker bulk toggle, explicit Fit Height, and table presets.
- **W5 — Complete Translation:** complete semantic translation coverage and layout review.
- **W6 — Publication Integration + Minimum Easy-Button Layer + First Father Pilot:** professional publication plus minimum usable page templates, catalog starter, starter reusable components, then the first father pilot.
- **W7 — Evidence-driven maturation:** expand templates/components, Asset Library, sharing, polish, and father-test corrections.

W7 remains the maturation/expansion wave. The minimum template/component/starter layer must exist before the W6 father pilot.

## TRANSLATION INVARIANT

Complete semantic translation is a **Father-V1 requirement**.

Every editable editorial text surface must have stable semantic identity and explicit policy (`translate`, `protect`, or `system`). Coverage includes:

- text objects;
- table TITLE;
- captions;
- group headers;
- column headers;
- row headers;
- section rows;
- rich-text cells;
- notes;
- footnotes;
- legends;
- cover copy;
- headers/footers;
- components/templates.

Technical tokens remain protected semantically. Source changes make affected localized leaves stale; existing translations are never silently overwritten.

Translation-driven growth must surface a diagnostic plus an explicit corrective action. It must not silently mutate topology or authored geometry. No unsupported average expansion percentage is an architectural assumption.

## APPLICATION ACTIONS AND FUTURE AI

Frozen direction:

```text
Human UI ─┐
          ├─> Typed Application Actions -> Canonical Document
Future AI ┘
```

W1 established the action boundary. Future AI should eventually invoke the same ordinary actions a user invokes: add page, insert object, move, resize, edit text, insert/populate table, merge, apply preset, and similar validated commands.

AI must not manipulate the DOM directly and must not replace arbitrary document JSON.

Autonomous AI authoring is future work; do not implement it in W1 merely because the seam is defined now.

## FATHER V1 VS FUTURE

### FATHER V1

- professional editing;
- canonical advanced tables;
- minimum templates/starters/components;
- save/reopen, autosave, and recovery;
- complete translation;
- professional PDF publication;
- basic sharing;
- diagnostics and preflight.

### FUTURE

- live PIM binding;
- Presence/Realtime;
- CRDT;
- autonomous AI authoring;
- complex workflow/approval;
- advanced offset-print features if later justified.

Father V1 has **no PIM dependency** and **no realtime dependency**.

## DO NOT OVERBUILD

The reference audit does not justify Father-V1 implementation of:

- Bezier/Pen vector editing;
- full Illustrator-like path editing;
- automatic cross-page reflow;
- InDesign-style scripting/master hierarchy;
- arbitrary HTML/CSS inside cells;
- complex CRDT/realtime;
- full PIM/ERP sync.

## FIRST FATHER PILOT ACCEPTANCE PATH

Run the first real father pilot once the user can complete an end-to-end workflow approximately like:

```text
New catalog from starter/template
→ add / duplicate / reorder page
→ edit title/text directly
→ insert / replace product image
→ insert / edit technical table
→ add rows / columns
→ create group header / section row
→ add title / note / footnote
→ move / resize
→ receive safe-margin feedback
→ Undo / Redo
→ save
→ close / reopen
→ translate to Spanish
→ review warnings
→ generate professional PDF
```

Do not wait for every W7 polish item before testing with the father.

## LEGACY SALVAGE AND FAILURES NOT TO REINTRODUCE

High-value salvage remains translation machinery, table invariants/pure operations, Auth/Supabase infrastructure where later validated, CAS/versioning concepts, asset/media concepts, fonts/icons, PRESYS fixtures/goldens, and publication/preflight lessons.

Do not port as VNext authority: giant Legacy stores, Legacy A4 vertical flow, Smart Flow authored topology, Legacy specialized table renderers/adapters, raster publication, or Presence/Realtime as a V1 prerequisite.

## HISTORICAL DOCUMENTS

Older R0 and W0 story documents intentionally preserve the state that existed when those records were written. They may mention open PRs or pre-promotion status as historical facts. Current status authority is this file plus GitHub.

## KNOWN UNRELATED ISSUE

`src/labs/product-workspace-ux/components/ConflictReviewModal.tsx:21:57` has a pre-existing conditional `useState` / rules-of-hooks issue surfaced by `lint:labs`.

Governance rule: do **not** fix this as part of unrelated VNext waves unless a task explicitly targets it. Keep unrelated lab lint debt out of VNext scope.

## POST-W2.0 STATE / NEXT PRINCIPAL ACTION

PR #15 is **MERGED / COMPLETE** and established the exact W1 base `ff4ce7302fe79ce9c2f431a09b94dd0e0ddaed7f`.

PR #16 is **MERGED / COMPLETE** and established the current canonical post-W1 main `0975953da7a8748b483ba8f64cb69c7cdb9172f6`, tree `d617b9089b2e5dbc94ed02b438e821d7885da6f3`.

PR #17 is **MERGED / COMPLETE** and established the verified W2.0 canonical base `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`, tree `fa61d3e8cc978a0af928423fc9c21550e618e675`.

W2.A implementation candidate: **PR #18 — OPEN / PRINCIPAL REVIEW REQUIRED**. Independently audit the primitive/domain contracts, Text-height authority cleanup, Image focal-point seam, canonical renderer/publication behavior, preserved Table Engine, and proof/gate evidence before merge. Do not start W2.B from this durable record until W2.A review/merge state is resolved through GitHub.

## RECONSTRUCTION READING ORDER

1. `docs/vnext/PROJECT-STATE.md` — current facts, scope, roadmap, and next action.
2. `docs/vnext/PRINCIPAL-HANDOFF.md` — durable architectural/product governance for a fresh Principal.
3. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md` — product/UX design with evidence vs hypothesis boundaries.
4. `docs/vnext/presys-mvp-r0/README.md` — foundation package index; historical status inside that package is subordinate to this current-state file.
5. `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md` — exact mathematical amendment.
6. `docs/vnext/presys-mvp-r0/evidence/proof-result.md` — empirical browser/PDF proof.
7. `docs/stories/2026-09-09-vnext-w0-foundation-promotion.md` — historical W0 execution record.
8. `docs/stories/2026-09-10-vnext-w1-application-actions-shell.md` — historical W1 execution record.
9. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md` — executable W2 authoring contract under Principal audit.
10. `docs/stories/2026-09-10-vnext-w2-0-authoring-contract.md` — W2.0 documentation/review story.
