# Catalog Builder VNext — Principal Handoff

STATUS: DURABLE INTELLECTUAL MEMORY

DATE: 2026-09-09

This document is the durable reasoning and governance handoff for a new ChatGPT Principal. It is intentionally independent of conversation transcripts.

## ROLE OF PRINCIPAL

The Principal is simultaneously:

- **Auditor** — verifies code, math, browser behavior, PDF evidence, and claims;
- **Orientador** — keeps implementation aligned with the product mission and frozen contracts;
- **Pesquisador** — investigates unknowns before freezing them;
- **Confrontador** — actively searches for counterexamples, hidden authority, false assumptions, and accidental complexity.

The Principal does not treat implementation-agent confidence as evidence.

**Agent reports are not authority.**

Always verify GitHub, code, tests, browser evidence, PDF evidence, and artifacts independently.

Never merge without explicit user authorization.

## AGENT ROUTING

Use scarce/expensive capability only when the task needs it.

- **Terra** — mechanical/simple work.
- **Sol Medium** — bounded implementation and governance.
- **Sol High** — architecture, domain, persistence, hard implementation, hard audits.
- **Gemini Flash High** — bounded implementation or adversarial review after the contract is precise.
- **Astra** — scarce; use only when computer-use or visual empirical work materially matters.

Do not spend Astra on work Sol can do.

Model choice never replaces evidence or acceptance criteria.

## PRODUCT MISSION

Build **Catalog Builder VNext / PRESYS** so a non-technical PRESYS employee, especially the user's father, can create, edit, save, reopen, translate, export, and share professional technical catalogs.

VNext must be simpler internally than Legacy while becoming more capable, more editable, more professional, and easier to use.

Do not simplify architecture by shrinking the product into a limited page/template editor.

## PRODUCT ARCHITECTURE

Canonical hierarchy:

```text
Catalog
→ Pages
→ Objects
→ Properties
```

Pages are finite physical A4 surfaces.

The user owns:

- position;
- size;
- composition;
- page placement.

The system owns:

- snapping;
- guides;
- safe-margin warnings;
- overflow diagnostics;
- publication validation.

The system must not silently:

- move an object to another page;
- create continuation pages;
- resize authored frames;
- restructure the document.

Measurement and preflight observe authored geometry. They do not become hidden authors.

## CANONICAL PRIMITIVES

Current direction:

- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- Group.

Connector is allowed only if a later use case justifies it.

Banner, Header, Footer, and Cover should primarily be compositions, templates, or components built from canonical primitives, not separate mutation/rendering engines.

## ONE TABLE ENGINE

There is one canonical Table Engine.

Never recreate specialized engines for:

- specifications;
- electrical;
- accessories;
- ordering;
- compatibility;
- inserts.

Presets and semantic configuration must specialize one engine.

Required/proven capability set:

- stable IDs;
- typed `CellContent`;
- `rowSpan`;
- `colSpan`;
- merge/unmerge fail-closed;
- group headers;
- section rows;
- headerless tables;
- marker cells;
- image cells;
- technical codes;
- measurements;
- annotations;
- footnotes;
- legends;
- independent frames;
- deterministic physical layout.

The table engine is infrastructure for multiple visual catalog patterns. A visual preset must not fork domain/layout authority.

## FOUNDATION-PROOF HISTORY

### R0

Established the proposed VNext foundation: physical pages, authored frames, selective Legacy salvage, one table engine, deterministic publication, and an isolated proof before production implementation.

### R0.1.2

Closed many deterministic geometry, content, border, text-flow, annotation, and publication contracts.

Its rowspan sequential/equal-deficit policy was empirically falsified by overlapping span constraints that could allocate excess height and create practical false overflow.

Lesson: local sequential deficit distribution was not a valid global optimum.

### R0.1.3

Introduced the global interval/prefix solver for rowSpan height constraints.

Corrected the table-frame false-overflow boundary by comparing rendered table extent in Q against the authored frame projected to Q.

Lesson: a rendered equality in Q must not be converted back through lossy Q→U rounding to manufacture overflow.

### R0.1.4

Principal review found the same Q→U class of bug still present for row/text fit and an additional cumulative projection-phase counterexample.

R0.1.4 keeps browser-measured rendered extent in Q for blocking fit, keeps authored/solver state in U, and uses projection-safe cumulative boundaries with an exact monotone inverse where U growth is required.

R0.1.4 is the current amendment.

### Principal verdict

FOUNDATION-PROOF-01: **GO as architectural foundation**.

Audits completed:

- code: GO;
- math: GO;
- Chromium/browser evidence: GO;
- PDF forensic evidence: GO;
- visual artifact inspection: GO.

Do not translate this verdict into "finished editor" or "production ready".

## FOUNDATION PROMOTION RULE

Production code has not yet been promoted into `src/vnext`.

The next production foundation must **move/promote the proven core** from the lab into the VNext production boundary. Do not let a lab engine and a newly invented production engine evolve in parallel.

The expected promotion destinations remain conceptually:

- `src/vnext/domain/`;
- `src/vnext/render/`;
- `src/vnext/editor/`.

Exact filenames are an implementation detail; preservation of proven authority is the architectural requirement.

## TRANSLATION — CRITICAL CONTRACT

Translation is a father-usable V1 requirement.

Legacy translation is valuable and should be selectively salvaged.

High-value Legacy translation concepts:

- technical token protection;
- language registry;
- font management;
- translation memory/cache;
- provider gateway;
- chunking/retry;
- strict response validation;
- source/version metadata;
- coverage audit;
- layout QA.

Do **not** port Legacy block-specific extractor/applier authority.

VNext invariant:

> Every user-editable editorial text has stable semantic identity and an explicit translation policy: `translate`, `protect`, or `system`.

Explicit translation coverage includes:

- text object;
- **TABLE TITLE**;
- table caption;
- column header;
- group header;
- row header;
- section row;
- rich-text cell;
- note;
- footnote;
- legend;
- banner text;
- header;
- footer;
- cover title;
- cover subtitle;
- contact labels;
- component/template text.

Typed technical values should be protected by semantics rather than regex whenever possible:

- measurement;
- unit;
- technicalCode;
- modelId;
- orderCode;
- protocol;
- standard;
- marker;
- formula.

When source content changes, mark affected localized leaves **STALE**.

Do not silently overwrite an existing translation.

AI Translation remains **MUST HAVE for father-usable V1**.

Autonomous AI authoring remains **FUTURE**.

## APPLICATION ACTIONS — HUMAN AND FUTURE AI BOUNDARY

Frozen direction:

```text
Human UI ─┐
          ├─> Typed Application Actions -> Canonical Document
Future AI ┘
```

Typed Application Actions are the mutation contract.

They must:

- runtime validate inputs;
- return structured IDs/results;
- respect permissions;
- be atomic where appropriate;
- be Undo/Redo compatible;
- respect CAS/versioning;
- surface structured failures instead of partial hidden mutation.

React components are presentation/controllers, not mutation contracts.

Zustand is not the domain mutation API.

No separate AI mutation architecture.

No DOM automation as canonical mutation path.

No unrestricted `ReplaceDocument` JSON operation.

Future AI should call the same actions a human-triggered command uses.

## UNDO / REDO

Undo/Redo is practically mandatory before the father test.

Action design must carry transaction/coalescing semantics from the start.

Examples of actions that may need coalescing include drag/resize gestures and continuous text editing. The exact implementation is not frozen, but the action boundary must make safe history possible.

## PRODUCT DATA / PIM

PIM is **FUTURE**.

Define the seam now so future product-data integration does not infect editorial semantics.

Content is either:

- literal content; or
- explicit typed `DataBinding`.

Example literal:

```text
TA-25N
```

Example binding:

```text
product.ta25n.modelName
```

No invisible live refresh.

Future product-data updates must be surfaced as:

- review;
- apply;
- detach / convert-to-literal.

The authored catalog remains reviewable and deterministic.

## PRESETS / COMPONENTS / TEMPLATES

Persist this taxonomy:

- **STYLE PRESET**;
- **TABLE PRESET**;
- **COMPONENT**;
- **PAGE TEMPLATE**;
- **CATALOG TEMPLATE**.

Examples:

- PRESYS Dense Specifications;
- Technical Header;
- Blue Product Banner;
- Specifications + Image;
- TA Family Catalog.

Applying a preset produces canonical editable content/style.

Do not introduce surprise global live propagation in V1.

If reusable instances become linked in a future version, that behavior must be explicit and reviewable.

## AI-GENERATED IMAGES

AI-generated imagery is **FUTURE**.

Preferred architecture:

```text
AI-generated visual/background
+
canonical editable title/model/logo/contact objects
```

Do not burn catalog copy into a generated raster as the canonical design.

Generated assets should later carry provenance.

## PERSISTENCE

Father-usable V1 requires:

- save;
- autosave;
- reopen;
- local recovery;
- visible conflict handling.

Current direction:

```text
versioned canonical whole-document persistence
+ CAS
```

No silent last-write-wins.

The same Supabase/Auth infrastructure may be reused if validated, but VNext storage must be isolated from Legacy authority.

The canonical persisted document is versioned product data, not UI component state.

## PUBLICATION

Persist this chain:

```text
canonical document
-> immutable publication snapshot
-> generated PDF artifact
-> share/download
```

The Chromium textual/vector publication path is proven by FOUNDATION-PROOF-01.

Do not port Legacy `html2canvas`/`jsPDF` raster page export.

Publication preflight must surface blocking errors and warnings without silently changing authored layout.

## FATHER-USABLE V1

MUST HAVE:

- create/open/duplicate catalog;
- A4 pages;
- text;
- images/assets;
- advanced canonical tables;
- move/resize;
- page management;
- Undo/Redo;
- save/reopen;
- autosave/local recovery;
- table presets;
- cover/page templates;
- translation;
- layout QA;
- publication preflight;
- professional PDF;
- stored PDF artifact;
- basic read-only sharing.

This list is the product acceptance direction. Do not demote translation, Undo/Redo, or recovery because they were outside the technical proof.

## FIRST FATHER TEST

Do not wait for the entire V1.

Start the first father pilot when these are present:

- template-first creation;
- real A4 pages;
- page add/duplicate/delete/reorder;
- direct text edit;
- image insert/replace;
- one canonical table;
- basic grouped headers;
- row/column add/delete;
- table title/note/footnote;
- move/resize;
- snap/safe guide;
- Undo/Redo;
- autosave;
- reopen;
- local recovery;
- basic diagnostics;
- real PDF;
- first Spanish translation walkthrough.

The father pilot is empirical UX evidence. It is expected to change testable UX details without reopening the canonical architecture by default.

## LEGACY SALVAGE MAP

### HIGH VALUE SALVAGE

- translation machinery;
- Table Core invariants/pure operations;
- Auth;
- Supabase infrastructure;
- CAS/versioning concepts;
- assets/media concepts;
- fonts/icons;
- PRESYS fixtures/goldens;
- publication/preflight lessons.

### REBUILD INSIDE VNEXT

- document model;
- page authority;
- free/constrained canvas;
- Inspector;
- authoring state;
- production renderer;
- table editing UX;
- translation leaf extraction/application.

### DO NOT PORT AS AUTHORITY

- giant `useCatalogStore`;
- `useLibraryStore` authority;
- Legacy A4 vertical flow;
- Smart Flow authored topology;
- legacy `TableCoreRenderer`;
- table adapters/bridges;
- multiple specialized table engines;
- `html2canvas`/`jsPDF` publication;
- Presence/Realtime as a V1 prerequisite.

Salvage concepts and pure invariants. Do not carry hidden Legacy authority into VNext merely because code already exists.

## CURRENT ROADMAP

- **W0 — Foundation promotion**.
- **W1 — Application Actions + minimal VNext shell**.
- **W2 — A4 authoring/direct manipulation + primitives**.
- **W3 — Save/Reopen/Catalog Library**.
- **W4 — Advanced Table Editor**.
- **W5 — Complete Translation VNext**.
- **W6 — Publication integration + First Father Pilot**.
- **W7 — UX corrections + templates/components/assets/sharing**.

No exact dates are frozen.

## FROZEN CONTRACT VS UX HYPOTHESIS VS FUTURE

### FROZEN CONTRACT

- one document model;
- one Table Engine;
- A4 authored frames;
- typed translation leaves;
- typed Application Actions;
- save/version/CAS direction;
- publication snapshot chain;
- user owns authored placement;
- system diagnostics do not silently reauthor;
- one mutation path for human UI and Future AI.

### TESTABLE UX HYPOTHESIS

- exact number of tool icons;
- Inspector width;
- contextual table toolbar position;
- Layers default visibility;
- safe-guide visibility;
- default zoom;
- right-click density;
- custom-color prominence;
- exact panel grouping and shortcuts;
- exact onboarding sequence.

Treat these as hypotheses to test with the father persona and other PRESYS users.

### FUTURE

- PIM;
- Presence;
- Realtime;
- AI image generation;
- autonomous AI authoring;
- approval workflows.

Future does not mean forbidden to design seams. It means do not implement it as a V1 dependency.

## CURRENT GOVERNANCE STATE

Production main verified before this governance update: `616332d6048a4259d2e2b562d8d5e781cea334bd`.

PR #12 remains open and unmerged on `docs/vnext-r0-1-principal-amendments`.

PR #13 remains open and unmerged on `vnext/foundation-proof-01`, stacked on PR #12.

Implementation proof head verified before this update: `c8808adf0dd3a9dbc4473aafc2f4007267ff67df`.

PR #13 GitHub Quality Gates were successful at that head.

Known unrelated gate issue: `npm run lint:labs` reports the pre-existing conditional `useState` in `src/labs/product-workspace-ux/components/ConflictReviewModal.tsx:21:57`. Do not fix it as VNext proof/institutional-memory scope.

## NEXT PRINCIPAL ACTION

The current wave is **W0 Foundation promotion**.

Prepare and audit a narrow W0 promotion story that moves the proven foundation into production VNext authority without redesign and without leaving a parallel lab/production engine split.

Before any implementation:

1. fetch and verify main, PR #12, and PR #13 heads;
2. verify stacked ancestry;
3. read `PROJECT-STATE.md`, this handoff, the product blueprint, R0.1.4, and PR #13 proof evidence;
4. freeze the exact promotion boundary and acceptance checks;
5. only then route implementation.

Do not merge PR #12 or PR #13 without explicit user authorization.
