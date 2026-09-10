# Catalog Builder VNext — Project State

STATUS: CURRENT RECONSTRUCTION INDEX

DATE: 2026-09-09

PURPOSE: restore the project safely in a new Principal session without chat memory.
## PRODUCT
**Catalog Builder VNext / PRESYS** is a professional technical-catalog authoring system.

The product must let a non-technical PRESYS employee create, edit, save, reopen, translate, export, and share professional catalogs.

The primary persona is the user's father: a non-technical professional who must be able to complete real catalog work without developer assistance.

VNext must be **simpler internally than Legacy** while simultaneously being:
- more capable;
- more editable;
- more professional;
- easier to use.

Architectural simplification must not produce a more limited editor.
## COMMERCIAL MISSION
Turn PRESYS technical content into professional, editable, reusable A4 catalogs with reliable technical typography, advanced tables, translation, publication, and simple sharing.

The end state is a tool a PRESYS employee can use for day-to-day catalog work, not a developer-facing proof or layout laboratory.
## PRIMARY PERSONA
The acceptance lens is a **father-usable workflow**:
- non-technical;
- professional office user;
- needs direct manipulation and predictable recovery;
- should not need to understand JSON, DOM structure, renderer internals, database schemas, or Git;
- must be able to trust save, reopen, Undo/Redo, translation, preflight, PDF, and sharing.
## CURRENT REFS
Repository: `avaranda66-oss/catalog-builder-technical`.

W0 base SHA: `09fe9d49b65b3d4501c4079b6df38f2d97f595c6`.

W0 base tree: `c62699243c9678f0166de7c2393798aa0f80f847`.

PR #12: **MERGED**.

PR #13: **MERGED**.

FOUNDATION-PROOF-01 had Principal GO before W0 began.

W0 branch: `feat/vnext-w0-foundation-promotion`.

Always run `git fetch origin --prune` and verify GitHub heads before acting. Git history and repository evidence outrank agent reports.
## FOUNDATION STATUS
FOUNDATION-PROOF-01 has passed the required Principal review layers:
- code audit: **GO**;
- mathematical audit: **GO**;
- Chromium/browser evidence: **GO**;
- PDF forensic evidence: **GO**;
- Principal visual artifact inspection: **GO**.

Principal verdict: **GO as architectural foundation**.

This is **not a finished editor** and is **not production VNext**.

The approved proof is being promoted on the W0 branch; `src/vnext` ownership is **IN REVIEW** and is not yet canonical on main.
## R0.1 FOUNDATION HISTORY
R0 established the proposed VNext editorial foundation.

R0.1.2 froze deterministic physical layout, canonical table behavior, parity, and proof obligations, but its sequential/equal-deficit rowspan policy was empirically falsified.

R0.1.3 introduced the global interval/prefix solver and corrected the final table-frame Q/U false-overflow boundary.

Principal review then found the same Q→U fit bug in row/text rendered extents.

R0.1.4 corrected rendered-extent fit using Q/Q comparisons and projection-safe cumulative boundaries while keeping authored geometry in U.

R0.1.4 is the current foundation amendment.
## WHAT IS FROZEN
The following are durable architecture directions unless a new Principal amendment explicitly reopens them:
- one canonical document model;
- physical A4 pages with authored object frames;
- `Catalog → Pages → Objects → Properties`;
- user authority over position, size, composition, and page placement;
- system authority over snapping, guides, safe-margin warnings, overflow diagnostics, and publication validation;
- one canonical Table Engine;
- canonical primitives: Text, Image, Table, Shape, Line, Icon, Group;
- typed semantic translation leaves with explicit translation policy;
- Human UI and Future AI mutating through the same typed Application Actions;
- Application Actions as the mutation contract, not React components or Zustand setters;
- versioned whole-document persistence plus CAS direction;
- publication through immutable snapshot → generated PDF artifact → share/download;
- Chromium textual/vector publication path;
- lab foundation must be promoted, not reimplemented as a second production engine.

The system must never silently move objects to another page, create continuation pages, resize authored frames, or restructure the document.
## CANONICAL PRIMITIVES
Current primitive set:
- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- Group.

Connector is deferred unless a later use case justifies it.

Banner, Header, Footer, and Cover are primarily compositions/templates/components, not independent rendering engines.
## TABLE ENGINE
There is **one canonical Table Engine**.

Do not recreate specialized engines for specifications, electrical data, accessories, ordering, compatibility, or inserts.

Presets and semantics configure the same engine.

Proven/required table capabilities include stable IDs, typed `CellContent`, `rowSpan`, `colSpan`, merge/unmerge fail-closed, group headers, section rows, headerless tables, marker cells, image cells, technical codes, measurements, annotations, footnotes, legends, independent frames, and deterministic physical layout.
## TRANSLATION INVARIANT
AI Translation is a **MUST HAVE for father-usable V1**.

Legacy translation machinery has high salvage value, but Legacy block-specific extractor/applier authority must not be ported.

Every user-editable editorial text must have stable semantic identity and an explicit policy:
- `translate`;
- `protect`;
- `system`.

Coverage must explicitly include text object, **TABLE TITLE**, table caption, column header, group header, row header, section row, rich-text cell, note, footnote, legend, banner text, header, footer, cover title, cover subtitle, contact labels, and component/template text.

Typed technical values should be protected semantically whenever possible: measurement, unit, technicalCode, modelId, orderCode, protocol, standard, marker, formula.

Source edits mark affected localized leaves **STALE**. Never silently overwrite translations.
## APPLICATION ACTIONS
Frozen direction:
```text
Human UI ─┐
          ├─> Typed Application Actions -> Canonical Document
Future AI ┘
```

Actions must runtime-validate input, return structured IDs/results, respect permissions, be atomic where appropriate, support Undo/Redo semantics, and respect CAS/versioning.

No unrestricted `ReplaceDocument` JSON mutation path.

No DOM automation as the canonical mutation path.
## UNDO / REDO
Undo/Redo is practically mandatory before the father test.

Application Actions must be designed with transaction and coalescing semantics from the beginning.
## PERSISTENCE
Father-usable V1 requires save, autosave, reopen, local recovery, and visible conflict handling.

Current direction: versioned canonical whole-document persistence plus CAS.

No silent last-write-wins.

Existing Supabase/Auth infrastructure may be reused, but VNext storage authority must remain isolated from Legacy authority.
## PUBLICATION
Publication chain:
```text
canonical document
-> immutable publication snapshot
-> generated PDF artifact
-> share/download
```

The Chromium textual/vector path is proven.

Do not port Legacy `html2canvas`/`jsPDF` raster page export.
## FATHER-USABLE V1 MUST HAVE
- create/open/duplicate catalog;
- real A4 pages;
- text;
- images/assets;
- advanced canonical tables;
- move/resize;
- page management;
- Undo/Redo;
- save/reopen;
- autosave and local recovery;
- table presets;
- cover/page templates;
- translation;
- layout QA;
- publication preflight;
- professional PDF;
- stored PDF artifact;
- basic read-only sharing.
## FIRST FATHER TEST MILESTONE
Do not wait for complete V1.

Run the first father pilot when the product has template-first creation, real A4 pages, page add/duplicate/delete/reorder, direct text editing, image insert/replace, one canonical table, basic grouped headers, row/column add/delete, table title/note/footnote, move/resize, snap/safe guide, Undo/Redo, autosave, reopen, local recovery, basic diagnostics, real PDF, and the first Spanish translation walkthrough.
## CURRENT ACTIVE WAVE
**W0 — Foundation Promotion.**

STATUS: **IN REVIEW**.

FOUNDATION OWNERSHIP: `src/vnext` now owns the promoted editorial foundation on the W0 branch.

LAB: `src/labs/presys-editorial-proof/` is consumer/harness only.

W1: **NOT STARTED**.
## ROADMAP
- W0 — Foundation promotion.
- W1 — Application Actions + minimal VNext shell.
- W2 — A4 authoring/direct manipulation + primitives.
- W3 — Save/Reopen/Catalog Library.
- W4 — Advanced Table Editor.
- W5 — Complete Translation VNext.
- W6 — Publication integration + First Father Pilot.
- W7 — UX corrections + templates/components/assets/sharing.

No exact dates are frozen.
## WHAT IS STILL A UX HYPOTHESIS
Architecture does not freeze button placement.

Test with the father persona before fixing details such as exact tool icon count, Inspector width, contextual toolbar position, Layers default visibility, safe-guide visibility, default zoom, right-click density, and prominence of custom colors.
## FUTURE
These are explicit future seams, not V1 implementation requirements:
- PIM/product knowledge;
- Presence;
- Realtime collaborative editing;
- AI-generated images;
- autonomous AI catalog authoring;
- approval workflows.

Future AI authoring must use the same typed Application Actions as the human UI.
## PRODUCT DATA / PIM SEAM
PIM is future, but the document model should distinguish literal content from an explicit typed `DataBinding`.

Example literal: `TA-25N`.

Example binding: `product.ta25n.modelName`.

No invisible live refresh. A future product-data update must be reviewed and then applied, or the binding must be detached/converted to literal.
## PRESETS / COMPONENTS / TEMPLATES
Taxonomy:
- STYLE PRESET;
- TABLE PRESET;
- COMPONENT;
- PAGE TEMPLATE;
- CATALOG TEMPLATE.

Applying a preset produces canonical editable content/style. V1 must not introduce surprise global live propagation.
## LEGACY SALVAGE
High-value salvage:
- translation machinery;
- Table Core invariants/pure operations;
- Auth;
- Supabase infrastructure;
- CAS/versioning concepts;
- assets/media concepts;
- fonts/icons;
- PRESYS fixtures/goldens;
- publication/preflight lessons.

Rebuild inside VNext: document model, page authority, free/constrained canvas, Inspector, authoring state, production renderer, table editing UX, and translation leaf extraction/application.

Do not port as authority: giant `useCatalogStore`, `useLibraryStore` authority, Legacy A4 vertical flow, Smart Flow authored topology, legacy `TableCoreRenderer`, adapters/bridges, specialized table engines, raster publication, or Presence/Realtime as a V1 prerequisite.
## KNOWN OUT-OF-SCOPE ISSUE
`src/labs/product-workspace-ux/components/ConflictReviewModal.tsx:21:57` has the pre-existing conditional `useState` issue reported by `npm run lint:labs`.

Do not repair it as part of FOUNDATION-PROOF/VNext institutional-memory work.
## MERGE STATUS
PR #12: **MERGED**.

PR #13: **MERGED**.

W0 Foundation Promotion: **IN REVIEW** on its feature branch. Do not merge pending Principal audit.
## PROMOTION STATUS
Production VNext foundation: **PROMOTED ON W0 BRANCH / IN REVIEW**.

The promoted foundation is not yet merged or canonical on main.
## NEXT PRINCIPAL ACTION
Independent Principal audit of the W0 Foundation Promotion PR.

W1 is **NOT STARTED**.
## WHAT MUST NOT HAPPEN
- Do not merge the W0 Foundation Promotion PR pending Principal audit.
- Do not deploy from these governance/proof branches.
- Do not treat FOUNDATION-PROOF-01 as a finished editor.
- Do not rebuild the proven engine independently under `src/vnext`.
- Do not let React/Zustand become the canonical mutation API.
- Do not introduce unrestricted whole-document replacement for AI.
- Do not make DOM automation the canonical AI mutation path.
- Do not recreate specialized table engines.
- Do not silently mutate authored layout during measurement/preflight.
- Do not silently overwrite translations.
- Do not silently last-write-win persistence conflicts.
- Do not port raster page publication.
- Do not reduce VNext capability merely to simplify internals.
## RECONSTRUCTION READING ORDER
1. `docs/vnext/PROJECT-STATE.md` — current facts and next action.
2. `docs/vnext/PRINCIPAL-HANDOFF.md` — durable architectural memory and governance.
3. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md` — product/UX blueprint with frozen/hypothesis/future labels.
4. `docs/vnext/presys-mvp-r0/README.md` — R0.1.4 package index.
5. PR #13 `docs/vnext/presys-mvp-r0/evidence/proof-result.md` — empirical proof record.
