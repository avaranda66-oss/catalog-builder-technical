# Catalog Builder VNext — Principal Handoff

STATUS: DURABLE W2.E CANONICAL MEMORY + W2.F REVIEW HANDOFF; PR #24 OPEN; W2.F NOT MERGED / NOT CANONICAL / NOT PRINCIPAL ACCEPTED; GITHUB IS LIVE-STATE AUTHORITY

DATE: 2026-09-11

This file is the durable reconstruction guide for a completely fresh Principal. Verify GitHub and code before trusting any agent summary. Never merge without explicit user authorization.

## PRINCIPAL ROLE AND GOVERNANCE

The Principal acts as:

- **Auditor** — independently verifies code, tests, browser/PDF evidence, and claims;
- **Orientador** — keeps implementation aligned with the product mission and frozen contracts;
- **Pesquisador** — investigates unknowns before freezing them;
- **Confrontador** — actively searches for counterexamples, hidden authority, and accidental complexity.

Agent reports are not authority. GitHub, code, tests, and artifacts outrank summaries. Never merge without explicit user authorization.

### AGENT ROUTING

- **Terra** — mechanical, simple, and inventory work;
- **GPT-5.6 Sol Medium** — bounded implementation, documentation, and governance;
- **GPT-5.6 Sol High** — architecture, domain, persistence, difficult implementation, concurrency/races, and independent hard audit;
- **Gemini Flash High** — bounded implementation or adversarial/read-only review after contracts are precise;
- **Astra** — scarce; use only when actual computer-use or visual empirical testing materially adds evidence. Do not spend Astra on work Sol can do.

Model choice never replaces evidence.

## WHAT WE ARE BUILDING

Catalog Builder VNext / PRESYS is a professional technical-catalog authoring system. A non-technical PRESYS employee must be able to create, edit, save, reopen, translate, publish, and share polished technical catalogs on finite physical A4 pages.

The primary acceptance persona is the user's father: a professional office user who needs direct manipulation, predictable recovery, powerful technical tables, translation, and publication without understanding JSON, DOM internals, renderer math, database schemas, or Git.

VNext must remain simpler internally than Legacy while delivering a more capable and easier product.

## VERIFIED W2.E CANONICAL PROVENANCE AND W2.F REVIEW BASE

Repository: `avaranda66-oss/catalog-builder-technical`.

PR #22 / W2.E was independently verified squash-merged into canonical `main` at SHA `b8dd75103c5d0cdd73b22d5997281b5efa0a4b80`.

Its tree is `470c34f567b2353d17c04330e2bb1cada50983a8`; its direct parent is `c220ed1d047d862d8bac30bb8c20702889793fac`.

PR #23 then merged the W2.E closeout documentation into `main` at SHA `162531024107e1376912363c877f23bdc3389426`, tree `c3df17b54c3aca8673f52f13efcbabdfca8e0a0a`. That post-closeout `main` is the actual W2.F branch base. Treat GitHub as live authority and verify `origin/main` before acting.

PR #12: **MERGED**.

PR #13 — FOUNDATION-PROOF-01: **MERGED**.

PR #14 — W0 Foundation Promotion + W0.1 Boundary Hardening: **MERGED**.

W0: **COMPLETE**.

W0.1: **COMPLETE**.

PR #15 — post-W0 handoff synchronization: **MERGED / COMPLETE**.

PR #16 — W1 Application Actions + Minimal VNext Shell: **MERGED / COMPLETE**.

W1: **COMPLETE**.

PR #17 — W2.0 A4 Authoring Contract: **MERGED / COMPLETE** at `8dc43027a8f676fe0cc2e1474e2c02aee9e55cdf`.

W2.0 contract: **PRINCIPAL ACCEPTED**.

PRs #18 / W2.A, #19 / W2.B, #20 / W2.C, #21 / W2.D, #22 / W2.E, and #23 / W2.E closeout are merged. **W2.F — Group is implemented on OPEN PR #24**, branch `feat/vnext-w2f-group`, base `main`. Initial pushed implementation head/tree: `f11acb8ab86dbfd27f6af79dc4410fd13b6c2085` / `baac8b47904b36118b06cfb050c9862bffc24cc1`. Documentation synchronization may advance the live PR head; verify GitHub before audit. W2.F remains unmerged, non-canonical, and not Principal accepted.

## WHAT IS CANONICAL NOW

Production foundation authority lives under `src/vnext/`:

- `src/vnext/domain/` — physical arithmetic, diagnostics, canonical editorial model;
- `src/vnext/table/` — canonical table model operations and deterministic layout;
- `src/vnext/rendering/` — React/browser rendering, measurement, resources, render planning, scoped editorial CSS;
- `src/vnext/publication/` — publication/preflight.

`src/labs/presys-editorial-proof/` is now a fixture, browser harness, and PDF proof harness only. It is not a second engine and must not regain foundational authority.

The production root API `src/vnext/index.ts` exports pure domain/table only. React/browser/rendering imports belong under `src/vnext/rendering`; publication/preflight belongs under `src/vnext/publication`.

## WHAT W0 PROVED AND PROMOTED

FOUNDATION-PROOF-01 passed Principal code, mathematical, Chromium/browser, PDF forensic, and visual artifact review before promotion. W0 then promoted that proven foundation into production ownership without redesigning it.

Preserve these invariants:

- finite physical A4 pages;
- authored object frames;
- authored geometry in integer U;
- renderer/browser measurement in integer Q;
- exact monotone `minimumUForProjectedQ`;
- cumulative projected row boundaries;
- global deterministic rowspan constraint solving;
- only `AUTO` / `MIN` rows grow;
- `FIXED` rows never grow;
- blocking rendered fit is Q/Q;
- a final postcondition blocks residual overflow;
- one canonical Table Engine;
- stable IDs;
- typed `CellContent`;
- explicit span/merge ownership;
- CSS Grid editorial rendering;
- deterministic resource readiness;
- structured preflight diagnostics;
- one canonical editorial render tree;
- Chromium textual/vector PDF proof.

The mathematical history is already preserved. Do not rewrite or casually reinterpret it. Read `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md` and `docs/vnext/presys-mvp-r0/evidence/proof-result.md` when touching fit, rowspan, measurement, or publication semantics.

## WHAT W0.1 CORRECTED

Principal re-audit before PR #14 merge found two production-boundary defects and closed them.

First, production `DocumentRenderer` renders canonical document content only. It must not accept renderer-authored footer/page-copy. Proof footer/page numbering is lab-only decoration.

Second, public APIs are layered. The root/domain/table public graph remains pure; rendering/browser/resource code is accessed through `src/vnext/rendering`; publication/preflight is accessed through `src/vnext/publication`.

Renderer CSS is scoped beneath `[data-editorial-root]`. Generic production renderer CSS does not own global `@page` policy.

`tests/vnext/proof/architecture-boundary.test.ts` protects these boundaries. Treat failures there as architecture regressions, not test inconvenience.

## PRODUCT MODEL THAT MUST NOT BE REDESIGNED BY DEFAULT

Canonical hierarchy:

```text
Catalog
→ Pages
→ Objects
→ Properties
```

Pages are finite physical A4 surfaces. The user owns authored position, size, composition, and page placement. The system owns snapping, guides, safe-margin warnings, overflow diagnostics, and publication validation.

The system must not silently move objects to other pages, create continuation pages, resize authored frames, or restructure authored topology.

Measurement and preflight observe authored geometry. They do not become hidden authors.

## ONE TABLE ENGINE

There is one canonical Table Engine. Do not introduce specialized Additel, Fluke, specifications, electrical, accessories, ordering, compatibility, or inserts engines.

The same engine must support generic editorial variation through typed content, semantics, styles, presets, and canonical composition. Existing proven concepts include stable IDs, typed `CellContent`, spans, merge/unmerge fail-closed, group headers, section rows, headerless tables, marker cells, image cells, technical codes, measurements, annotations, footnotes, legends, independent frames, and deterministic physical layout.

Father-V1 UX additionally requires spreadsheet-like selection, TSV/spreadsheet paste, marker-cell bulk toggle, table presets, and an explicit **Fit Height to Content / Ajustar altura** command.

Fit Height is an Application Action/user command. It may write a new authored frame height only when invoked. Renderer measurement must never perform that mutation silently.

## REFERENCE AUDIT — WHAT ADDITEL / FLUKE / ISOTECH TAUGHT US

A reproducibility audit visually inspected 24 reference pages:

- Additel 875 — 8 pages;
- Additel 761A — 6 pages;
- Fluke Field Metrology Wells material covering 9140 / 9142 / 9143 / 9144 — 6 pages;
- Isotech Europa / Venus / Calisto — 4 pages.

The audit studied editorial capability only. Competitor branding, visual identity, product claims, and specifications are not PRESYS source material.

Core result: **the VNext architectural direction remains sound**. The references revealed product-capability gaps rather than a new foundation contradiction.

The smallest coherent primitive set remains approximately:

- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- Group.

Complex reference pages should be compositions of those generic primitives, the one canonical Table Engine, and presets/components/templates. Technical diagrams that do not justify a vector editor may be imported as SVG or high-resolution raster assets.

## ASTRA + GEMINI UX LAB

Experimental branch: `lab/vnext-editor-ux-astra`.

Status: **EXPERIMENTAL / NOT PRODUCTION / DO NOT MERGE BLINDLY**.

The work began with Astra and was continued by Gemini after Astra quota exhaustion. The branch is evidence for interaction design, not production domain authority. Do not copy its mock table/domain state, approximate overflow math, ephemeral `useState` persistence, or native HTML-table shortcuts into production.

High-confidence interaction findings:

- direct manipulation should be primary;
- frequent actions should be contextual;
- Inspector should own deeper and lower-frequency properties;
- table range/row/column selection should feel spreadsheet-like;
- table interaction chrome must remain visually separate from document content;
- table content must not visually leak uncontrolled beyond its authored frame;
- explicit Fit Height is preferable to silent geometry mutation;
- Undo/Redo must be visible and predictable;
- cover/page templates should create ordinary editable canonical objects;
- safe margins should probably use hybrid guidance: subtle in repose, stronger during movement, warning rather than hard constraint.

Do not freeze exact toolbar layout, Inspector width, colors, opacity, icon count, button wording, or panel placement solely from the lab.

## UX FACT VS HYPOTHESIS

### HIGH-CONFIDENCE PRODUCT RULES

- finite A4;
- direct manipulation;
- contextual common actions;
- deeper Inspector;
- spreadsheet-like table selection;
- visible and predictable Undo/Redo;
- explicit overflow fixes;
- templates become editable canonical objects;
- no silent authored geometry mutation.

### USER-TEST HYPOTHESES

- exact Tool Rail icon count;
- exact contextual toolbar composition;
- exact Inspector width;
- exact safe-guide treatment;
- `Blocos` vs `Componentes` wording;
- exact Pages/Layers defaults;
- exact zoom;
- exact keyboard workflow;
- exact color-palette presentation.

A lab preference becoming a hypothesis does not make it architecture.

## FATHER V1 — EXPLICIT SCOPE

Father V1 includes professional editing, canonical advanced tables, templates/starters/components, save/reopen, autosave/recovery, complete translation, professional PDF publication, basic sharing, and diagnostics/preflight.

Product evidence now makes the following explicit requirements rather than optional ideas:

- standalone Image primitive;
- Shape primitive;
- Line primitive;
- Group capability;
- direct rich-text editing;
- discoverable insertion UX for common technical symbols such as `±`, `°C`, `Ω`, `µ`, `≤`, `≥`, `≈`; this sample is not exhaustive;
- TSV/spreadsheet clipboard paste into tables;
- marker-cell bulk toggle for compatibility matrices;
- explicit Fit Height to Content / Ajustar altura command;
- table presets;
- minimum page templates before the first father pilot;
- minimum catalog starter before the first father pilot;
- minimum reusable Components / `Blocos` capability before or by the first father pilot;
- highly discoverable Replace Image;
- complete semantic translation coverage;
- professional Chromium PDF publication.

## THE EASY BUTTON LAYER

Powerful internals must produce a fast father-facing path through:

- table presets;
- page templates;
- catalog starters;
- reusable components / `Blocos`;
- contextual commands.

A preset is configuration/content for the canonical engine. A template is a composition that resolves into canonical editable objects. A component is a reusable canonical object composition. None creates a second renderer or special block engine.

Governance rule: **MINIMUM EASY-BUTTON LAYER BEFORE FATHER PILOT**.

## ROADMAP AFTER W1

No exact dates are frozen, and detailed W6/W7 implementation boundaries may move with evidence. The minimum easy-button requirement may not move behind the first father pilot.

- **W1 — Application Actions + Minimal VNext Shell:** typed actions, immutable session, Undo/Redo/coalescing, and isolated `/v2` shell. **MERGED / COMPLETE — PR #16**.
- **W2 — A4 Authoring + Primitives + Direct Manipulation:** W2.A primitive/domain + publication-safe rendering with Text-height resolution and Image focal point; W2.B typed Object Application Actions; W2.C ephemeral selection/direct manipulation plus minimum visible basic authoring and mm-facing geometry; W2.D pure snapping/guides/authoring diagnostics; W2.E page-template materialization; W2.F real canonical Group; W2.G minimum direct Text editing. W2 is not complete until A–G and the visible basic-authoring path are executable.
- **W3 — Save/Reopen/Catalog Library:** versioned persistence, autosave/local recovery, visible conflicts, and a persistable starter/catalog creation path.
- **W4 — Advanced Table Editor:** structural editing, spreadsheet-style selection, TSV paste, marker bulk toggle, explicit Fit Height, table presets, titles/notes/footnotes.
- **W5 — Complete Translation:** full semantic coverage, stale tracking, protection, coverage audit, and layout review.
- **W6 — Publication Integration + Minimum Easy-Button Layer + First Father Pilot:** professional PDF/publication plus minimum usable page templates, catalog starter, and starter reusable components before the pilot.
- **W7 — Evidence-driven maturation:** broaden templates/components, Asset Library, sharing, polish, and father-test corrections.

The old idea that templates/components can wait entirely until W7 is no longer acceptable.

## FIRST FATHER PILOT ACCEPTANCE PATH

Run the first real father pilot once the user can approximately complete this end-to-end workflow:

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

## TRANSLATION — COMPLETE COVERAGE CONTRACT

Translation is required for Father V1. Every editable editorial text surface must be represented by stable semantic leaves/policies.

Explicit coverage includes:

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

Technical values/tokens should be protected semantically whenever possible. Source edits make affected localized leaves **STALE**; do not silently overwrite existing translations.

If translation makes content no longer fit, surface a diagnostic plus an explicit corrective action. Translation must not silently mutate authored topology or geometry. Do not bake unsupported average expansion percentages into architecture.

## APPLICATION ACTIONS — HUMAN UI AND FUTURE AI

Frozen direction:

```text
Human UI ─┐
          ├─> Typed Application Actions -> Canonical Document
Future AI ┘
```

W1 established this mutation seam. Actions validate inputs, return structured IDs/results, fail without mutating canonical state, and support predictable Undo/Redo/coalescing semantics. W2 extends that same strict boundary rather than creating a UI-specific mutation API.

React components are presentation/controllers. Zustand or equivalent client state is not the canonical domain mutation API.

Future AI should eventually be able to invoke the same ordinary actions as the user, including add page, insert object, move, resize, edit text, insert table, populate table, merge, apply preset, and related safe commands.

AI must not manipulate the DOM directly and must not have unrestricted arbitrary-document-JSON replacement authority.

Do not implement autonomous AI authoring during W1 merely because the action seam supports it later.

## PERSISTENCE

Father V1 requires save, autosave, reopen, local recovery, and visible conflict handling. Direction remains a versioned canonical whole-document model with CAS semantics.

No silent last-write-wins. Existing Supabase/Auth infrastructure may be reused later if validated, but VNext persistence authority must remain isolated from Legacy authority.

PIM is not a persistence prerequisite for Father V1.

## FUTURE PRODUCT-DATA / PIM SEAM

PIM remains **FUTURE** and is not a Father-V1 dependency. Preserve the product-data seam so future bindings do not infect editorial semantics.

Authored content is conceptually:

```text
literal | explicit typed DataBinding

literal: TA-25N
binding: product.ta25n.modelName
```

Rules:

- no invisible live refresh;
- product-data changes must be reviewable;
- future refresh flow is explicit: **review → apply**;
- the user can detach / convert-to-literal;
- the canonical authored document remains deterministic and reviewable.

Do not implement PIM as part of Father V1 and do not make current V1 depend on it.

## PUBLICATION

Publication remains:

```text
canonical document
→ immutable publication snapshot
→ generated PDF artifact
→ share / download
```

The Chromium textual/vector path is proven. Do not port Legacy `html2canvas`/`jsPDF` raster page export as VNext publication authority.

Preflight reports blocking errors and warnings. It does not repair authored geometry silently.

## FATHER V1 VS FUTURE

### FATHER V1

- professional editing;
- canonical tables;
- minimum templates/starters/components;
- save/reopen and recovery;
- translation;
- PDF publication;
- basic sharing;
- diagnostics/preflight.

### FUTURE

- live PIM binding;
- Presence/Realtime;
- CRDT;
- autonomous AI authoring;
- complex workflow/approval;
- advanced offset-print features if later justified.

There is no PIM or realtime dependency for Father V1.

## DO NOT OVERBUILD

The 24-page audit did not justify Father-V1 implementation of:

- Bezier/Pen vector editing;
- full Illustrator-like path editing;
- automatic cross-page reflow;
- InDesign-style scripting/master hierarchy;
- arbitrary HTML/CSS inside cells;
- complex CRDT/realtime;
- full PIM/ERP sync.

Use imported SVG/high-resolution raster assets for complex technical diagrams when generic primitives are insufficient and editable vector paths are not required.

## LEGACY — WHAT MUST NEVER RETURN AS AUTHORITY

Salvage concepts and proven invariants, not Legacy authority.

High-value salvage candidates include translation machinery, pure table invariants/operations, Auth/Supabase infrastructure where later validated, CAS/version concepts, asset/media concepts, fonts/icons, PRESYS fixtures/goldens, and publication/preflight lessons.

Do not restore as canonical VNext authority:

- giant `useCatalogStore` / `useLibraryStore` domain authority;
- Legacy A4 vertical flow;
- Smart Flow authored topology;
- legacy `TableCoreRenderer` authority;
- adapter/bridge layers that recreate parallel domains;
- specialized table engines;
- raster page publication;
- Presence/Realtime as a V1 prerequisite;
- hidden automatic geometry or topology mutation.

## WHAT IS HISTORICAL VS CURRENT

R0 package documents and the W0 execution story preserve facts from the points in time when they were written. Some historical sections mention open PRs or pre-promotion status. Do not treat those historical status lines as the current project state.

Current status authority is `docs/vnext/PROJECT-STATE.md`, this handoff, and verified GitHub state.

## NEXT EXACT ACTION

PRs #12 through #23 are merged for the promoted VNext slices through W2.E closeout. PR #24 is the open W2.F review vehicle.

Canonical W2.F base: `162531024107e1376912363c877f23bdc3389426`, tree `c3df17b54c3aca8673f52f13efcbabdfca8e0a0a`.

Next action: **independent adversarial audit of OPEN PR #24 against the frozen W2.F Group contract and exact-head CI**.

The ratified W2.F contract implemented by PR #24 is:

- Page owns top-level objects; Group directly owns leaf-only children;
- Group frame is Page-absolute; child frames are Group-local; geometry resolution uses integer U;
- Group frame is persisted and is the exact tight child envelope created explicitly by `group.create`;
- selected sources must form one contiguous canonical visual interval ordered by zIndex then page array index;
- Group move changes x/y only; Group resize is rejected in W2.F;
- grouped leaves remain discoverable but direct structural/geometric mutation is rejected while grouped;
- delete/duplicate/reorder/ungroup are closure-aware and honor descendant locks;
- duplicate uses the existing allocator/Table/RichText remappers, renews the full identity closure, preserves AssetRefs, and has no implicit positional offset;
- ungroup preserves child identities and emits them in the Group's current visual slot;
- nested Groups are forbidden;
- one pure canonical traversal/frame-resolution authority is shared across validation, lookup, rendering, render planning, measurement, preflight, and editor snap-target filtering;
- W2.E templates support valid Group closures through the existing instantiation machinery;
- schemaVersion remains 1;
- W2.G direct text editing remains out of scope.

Audit evidence includes focused W2.F tests, the real `/v2` Chromium Group proof, unchanged W2.C/W2.D/W2.E Chromium regressions, grouped Text/Image/Table publication/PDF proof, the existing export/PDF screen-print-DPR matrix, and full lint/typecheck/test/build gates. Verify all evidence on the exact live PR head.

W2.F independent audit and Principal acceptance remain required before merge and before W3 serialization freeze.

Do not begin W2.G until W2.F is implemented, independently audited, Principal accepted, explicitly authorized for merge, and verified canonical.

## REQUIRED RECONSTRUCTION ORDER

1. `docs/vnext/PROJECT-STATE.md`.
2. `docs/vnext/PRINCIPAL-HANDOFF.md`.
3. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`.
4. `docs/vnext/presys-mvp-r0/README.md`.
5. `docs/vnext/presys-mvp-r0/R0.1.4-rendered-extent-row-projection-amendment.md`.
6. `docs/vnext/presys-mvp-r0/evidence/proof-result.md`.
7. `docs/stories/2026-09-09-vnext-w0-foundation-promotion.md`.
8. `docs/stories/2026-09-10-vnext-w1-application-actions-shell.md`.
9. `tests/vnext/proof/architecture-boundary.test.ts` and current `src/vnext/` ownership.
10. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`.
11. `docs/stories/2026-09-10-vnext-w2-0-authoring-contract.md`.
12. `docs/stories/2026-09-10-vnext-w2a-primitives-rendering.md`.
13. `docs/stories/2026-09-10-vnext-w2b-object-actions.md`.
14. `docs/stories/2026-09-10-vnext-w2c-direct-manipulation.md` — W2.C implementation/evidence record.
15. `docs/stories/2026-09-11-vnext-w2d-snapping-diagnostics.md` — W2.D implementation/evidence record.
16. `docs/stories/2026-09-11-vnext-w2e-page-template-insertion.md` — W2.E implementation/evidence record for merged PR #22.
