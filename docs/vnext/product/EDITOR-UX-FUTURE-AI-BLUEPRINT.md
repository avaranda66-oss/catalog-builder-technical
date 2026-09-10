# Catalog Builder VNext — Editor UX & Future AI Blueprint

STATUS: **PROPOSED PRODUCT BLUEPRINT**

**NOT ALL UX DETAILS ARE FROZEN**

**USER TEST REQUIRED**

DATE: 2026-09-09

This blueprint describes the recommended product experience and the architectural boundaries it must respect. It deliberately separates durable contracts from interaction hypotheses that should change when user testing gives better evidence.

## POST-W0 EVIDENCE UPDATE

PR #14 merged the proven W0 foundation plus W0.1 production-boundary hardening at engineering base `865251dc023148b349a9ceba8051c249c0bbb647`. Production foundation authority is now `src/vnext/`; W1 has not started.

Two product-evidence sources now sharpen this blueprint without changing the foundation architecture:

- the experimental `lab/vnext-editor-ux-astra` interaction lab, initiated by Astra and continued by Gemini after Astra quota exhaustion;
- a 24-page editorial-capability audit across Additel 875, Additel 761A, Fluke 9140/9142/9143/9144 material, and Isotech Europa/Venus/Calisto.

The lab is **EXPERIMENTAL / NOT PRODUCTION / DO NOT MERGE BLINDLY**. Its mock state, approximate layout logic, and native-table shortcuts are not production authority. The reference documents are capability evidence only; do not copy competitor branding.

Both evidence streams support the existing generic architecture. They strengthen Father-V1 requirements for direct rich-text editing, standalone Image/Shape/Line/Group capability, spreadsheet-like table interaction, TSV paste, marker bulk toggle, explicit Fit Height, highly discoverable Replace Image, and a minimum easy-button layer of table presets, page templates, catalog starters, and reusable components before the first father pilot.

## PRODUCT EXPERIENCE TARGET

The editor should feel like a professional document/canvas tool specialized for technical catalogs, not like a developer console, database form, or rigid vertical-flow generator.

The primary user is a non-technical PRESYS professional, especially the user's father.

The target workflow is template-first and direct:

```text
Choose catalog/template
→ edit pages visually
→ add/replace content
→ validate layout
→ translate
→ publish PDF
→ share
```

The user should understand the document through pages and visible objects. Internal architecture should remain invisible.

## RECOMMENDED EDITOR SHELL

Recommended shell:

- left tool rail for creating/selecting capabilities;
- page panel for page navigation and page operations;
- central finite A4 canvas;
- right capability Inspector;
- contextual toolbar for table/object actions when useful;
- top-level document controls for save state, Undo/Redo, preview/preflight, translation, and publication.

This shell is a **testable UX hypothesis**. The information architecture is recommended; exact widths, button counts, and placements are not frozen.

## TOOL RAIL CONCEPT

The tool rail should expose the primitive authoring model without requiring the user to understand domain internals.

Likely entry points:

- Select;
- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- reusable Components/Templates.

Group may be a command on selection rather than a permanent creation tool.

Exact icon count and ordering are **TESTABLE UX HYPOTHESIS**.

## PAGE PANEL

The page panel should make physical document structure obvious.

Minimum first-pilot actions:

- add page;
- duplicate page;
- delete page;
- reorder page;
- select page;
- show small page preview/identity.

Page operations must preserve explicit A4 page authority. The system must not silently move authored objects between pages.

Exact thumbnail size and panel width are UX hypotheses.

## CENTRAL A4 CANVAS

The canvas represents real finite A4 pages.

The user authors object frames directly by position and size.

Recommended behavior:

- visible page boundary;
- predictable zoom/pan;
- selection handles;
- move/resize;
- snapping;
- optional guides;
- safe-margin feedback;
- overflow diagnostics without hidden reflow.

Safe-margin violation is guidance. Physical-page overflow can block publication.

The default zoom and always-on/off guide presentation are UX hypotheses.

## RIGHT CAPABILITY INSPECTOR

The Inspector should expose properties based on the current selection.

Examples:

- frame position/size;
- typography;
- fill/stroke;
- image fit/crop/replace;
- table structure/style;
- translation status/policy;
- data binding status in the future;
- diagnostics relevant to the selection.

Use progressive disclosure. A father-usable default should show common choices first and reveal advanced technical controls deliberately.

Inspector width, tab count, grouping, and exact control density are **TESTABLE UX HYPOTHESIS**.

## CONTEXTUAL TABLE TOOLBAR

Tables need high-frequency structural commands near the editing context.

Candidate contextual actions:

- add/delete row;
- add/delete column;
- merge/unmerge;
- header/group/section role;
- alignment;
- row height policy;
- column sizing;
- borders/fill;
- table preset;
- title/note/footnote actions.

The exact position of this toolbar is not architecture. Test top toolbar, inline/context toolbar, and Inspector grouping with real users.

## PROGRESSIVE DISCLOSURE

The editor must remain approachable while preserving professional capability.

Recommended principle:

- common actions visible;
- advanced controls discoverable;
- dangerous/destructive commands explicit;
- technical semantics visible when relevant;
- no hidden auto-correction that changes authored composition.

Do not solve simplicity by removing advanced table, translation, or publication capability.

## ADVANCED TABLE EDITING

There is one canonical Table Engine.

The UX should allow users to configure that engine rather than choose between multiple specialized table implementations.

Capabilities expected across V1 and its first father pilot:

- insert canonical table;
- spreadsheet-like range/row/column selection;
- add/delete rows and columns;
- grouped headers;
- section rows;
- headerless configurations where appropriate;
- merge/unmerge fail-closed;
- typed technical values;
- image/marker/rich-text cells;
- TSV/spreadsheet clipboard paste for bulk technical data entry;
- marker-cell bulk toggle for compatibility matrices;
- table title;
- caption;
- note;
- footnote;
- legend;
- table presets;
- explicit **Fit Height to Content / Ajustar altura**;
- independent table frames;
- deterministic physical fit diagnostics.

The product should explain impossible layout rather than silently shrinking content or changing structure. Fit Height is an explicit Application Action/user command that may update authored height only when invoked; measurement must never resize the frame silently.

## RICH COLORS

The editor should support professional PRESYS styling beyond a tiny fixed palette.

Recommended capability:

- theme/brand swatches;
- recent/document colors;
- custom color entry;
- fills, borders, and text colors;
- reusable style presets.

The prominence of custom-color controls is a **TESTABLE UX HYPOTHESIS**. A non-technical user may benefit from strong brand defaults with advanced color controls one level deeper.

## TEXT EDITING

Text should support direct editing on canvas plus structured properties in the Inspector.

Expected capabilities:

- direct text edit;
- font family/size/weight/style;
- alignment;
- line/paragraph controls as needed;
- direct rich-text editing backed by the canonical content model;
- technical-symbol insertion UX for common symbols such as `±`, `°C`, `Ω`, `µ`, `≤`, `≥`, and `≈`, without treating that sample as exhaustive;
- technical tokens that remain semantically protected for translation;
- overflow diagnostics against authored frames.

Do not rasterize text as canonical content.

## IMAGE EDITING

Expected image workflow:

- insert from Asset Library/upload;
- highly discoverable **Replace Image** without rebuilding the surrounding composition;
- fit/fill/crop presentation controls;
- retain source/provenance metadata;
- show broken/missing asset diagnostics;
- preserve authored frame unless the user explicitly resizes it.

Asset choice should be simple enough for the father persona.

## COVER WORKFLOW

Cover creation should be template/component driven.

Recommended flow:

1. choose a cover/page template;
2. replace product visual/background;
3. edit canonical title/subtitle/model text;
4. edit logo/contact objects where permitted;
5. run diagnostics/preflight.

Cover is a composition of canonical objects. It should not become a separate editor engine.

## BANNER / HEADER / FOOTER WORKFLOW

Treat Banner, Header, and Footer as reusable compositions/components/templates built from canonical primitives.

The user should be able to insert/apply them, then edit canonical objects.

V1 should avoid surprise live propagation across all existing instances.

## COMPONENTS / PRESETS / TEMPLATES

Persist the taxonomy:

- **STYLE PRESET** — reusable style values;
- **TABLE PRESET** — reusable canonical Table Engine configuration/style;
- **COMPONENT** — reusable object composition;
- **PAGE TEMPLATE** — reusable page composition;
- **CATALOG TEMPLATE** — reusable multi-page starting document.

Examples:

- PRESYS Dense Specifications;
- Technical Header;
- Blue Product Banner;
- Specifications + Image;
- TA Family Catalog.

Applying a preset/template produces canonical editable content/style. A catalog starter likewise resolves to an ordinary canonical editable document.

The father-facing easy-button layer consists of table presets, page templates, catalog starters, reusable components/`Blocos`, and contextual commands. `Preset != Engine`, `Template != New Renderer`, and `Component != Special Block Engine`.

A **minimum** version of this easy-button layer must exist before the first father pilot; W7 remains the later maturation/expansion wave.

No surprise global live propagation in V1.

## CATALOG LIBRARY

Catalog Library is the father-facing entry point for persisted documents.

Expected V1 capabilities:

- create from template;
- open existing catalog;
- duplicate catalog;
- see save/update state;
- reopen reliably;
- later access generated publication artifacts and basic share state.

The library must not expose database jargon.

## ASSET LIBRARY

Asset Library should centralize professional reusable media.

Expected concepts:

- product images;
- logos;
- icons;
- approved backgrounds;
- uploaded assets;
- provenance/source metadata;
- usage/search labels.

V1 may reuse Legacy asset/media infrastructure selectively if it does not import Legacy authority into the VNext document model.

## TRANSLATION WORKFLOW

Translation is **MUST HAVE for father-usable V1**.

Recommended workflow:

1. choose target language;
2. run translation coverage extraction from typed semantic leaves;
3. protect technical semantics;
4. translate eligible leaves through provider gateway/memory/cache;
5. validate provider response strictly;
6. apply translated leaves without overwriting unrelated content;
7. mark translated leaf source/version metadata;
8. run coverage audit;
9. run layout QA/preflight;
10. review any `STALE`, overflow, or missing-translation diagnostics.

Explicit coverage includes text objects, **TABLE TITLE**, captions, group headers, column headers, row headers, section rows, rich-text cells, notes, footnotes, legends, cover copy, headers/footers, and component/template text.

When source text changes, affected localized leaves become **STALE**. Do not silently overwrite prior translation work.

Translation-driven growth must produce a diagnostic plus an explicit corrective action. It must not silently mutate authored geometry or topology, and architecture must not assume unsupported average translation-expansion percentages.

## PRODUCT DATA SEAM

PIM is **FUTURE**, but the editor can prepare a visible seam.

Content is either literal or an explicit typed `DataBinding`.

Example:

```text
literal: TA-25N
binding: product.ta25n.modelName
```

Future binding updates should be reviewable. The user chooses to apply the update or detach/convert to literal.

No invisible live refresh.

## FUTURE AI

Future target: an AI agent can create professional catalogs from a small number of natural-language commands inside the same editor/domain model.

Future AI must operate through the **same typed Application Actions** as human UI commands.

```text
Human UI ─┐
          ├─> Typed Application Actions -> Canonical Document
Future AI ┘
```

Do not create:

- a second AI-only mutation architecture;
- DOM automation as canonical mutation authority;
- unrestricted whole-document JSON replacement.

AI should compose safe, validated, undo-compatible actions and receive structured results/IDs. It should eventually invoke the same ordinary actions as the user: add page, insert object, move, resize, edit text, insert/populate table, merge, apply preset, and related canonical commands.

Autonomous authoring is **FUTURE**, not V1 scope.

## AI-GENERATED IMAGES

AI image generation is **FUTURE**.

Preferred design:

```text
AI-generated visual/background
+
canonical editable title/model/logo/contact objects
```

Do not make generated raster text the canonical catalog copy.

Generated assets should later store provenance.

## SAFE MARGINS AND GUIDES

Safe margins/guides support authorship; they do not own authorship.

Recommended behavior:

- snapping is optional/predictable;
- guide visibility is user-controllable;
- safe-margin crossing is visible;
- physical-page overflow is clearly distinguished from safe-margin warning;
- warnings never silently move objects.

The UX lab gives high-confidence support to a hybrid guidance principle: safe margins stay subtle in repose, become stronger during selection/movement, and warn rather than hard-constrain. Exact opacity, color, line style, and trigger timing remain **TESTABLE UX HYPOTHESIS**.

## DIAGNOSTICS

Diagnostics should be actionable and localized.

Examples:

- object outside page;
- text overflow;
- table overflow;
- row/cell overflow;
- missing asset/font;
- stale translation;
- publication-blocking validation;
- persistence conflict.

The UI should explain what is wrong and let the user decide the editorial correction.

Do not fix layout silently during validation.

## UNDO / REDO

Undo/Redo is practically mandatory before the father test.

The UI should expose standard Undo/Redo controls and keyboard shortcuts where appropriate.

Underlying Application Actions must support transaction/coalescing semantics so drag, resize, table operations, and text edits produce understandable history.

## ONBOARDING

Recommended onboarding goal: the father persona reaches a successful first PDF quickly without learning the whole editor.

Candidate onboarding sequence:

1. choose a catalog template;
2. replace cover/title content;
3. edit one text block;
4. replace one image;
5. edit one table value/row;
6. duplicate/add a page;
7. save and reopen;
8. run Spanish translation;
9. review diagnostics;
10. export PDF.

The exact onboarding sequence is **TESTABLE UX HYPOTHESIS**.

## FATHER WORKFLOW

First father pilot should be deliberately narrow but real.

Required milestone:

- new catalog from a starter/template;
- real A4 pages;
- page add/duplicate/reorder;
- direct title/rich-text edit;
- product image insert/replace;
- one canonical technical table;
- row/column add;
- grouped headers and section rows;
- table title/note/footnote;
- move/resize;
- safe-margin feedback;
- visible predictable Undo/Redo;
- save, close, and reopen;
- local recovery;
- translation to Spanish;
- warning/preflight review;
- professional Chromium PDF publication.

Observe task completion, errors, hesitation, terminology confusion, and whether the user trusts save/recovery/publication.

Do not wait for PIM, Presence, Realtime, autonomous AI, or approval workflows.

## FROZEN CONTRACT

These are architectural/product boundaries, not interface-position preferences:

- one canonical document model;
- `Catalog → Pages → Objects → Properties`;
- finite physical A4 authored frames;
- user authority over placement/composition;
- system diagnostics do not silently reauthor;
- one canonical Table Engine;
- typed translation leaves and policies;
- **TABLE TITLE** included in translation coverage;
- typed Application Actions as mutation contract;
- same Application Actions for Human UI and Future AI;
- Undo/Redo-compatible action design;
- versioned whole-document persistence + CAS direction;
- no silent last-write-wins;
- publication snapshot → PDF artifact → share/download;
- Chromium textual/vector publication path;
- no raster page export as VNext authority;
- literal or explicit typed `DataBinding` seam;
- presets/templates yield canonical editable content;
- a minimum easy-button layer exists before the first father pilot.

## TESTABLE UX HYPOTHESIS

These should be tested rather than frozen prematurely:

- exact Tool Rail icon count;
- exact contextual toolbar composition and placement;
- exact Inspector width/tab/group organization;
- exact safe-guide visual treatment;
- `Blocos` vs `Componentes` wording;
- exact Pages/Layers defaults;
- exact zoom;
- exact keyboard workflow/shortcut set;
- exact color-palette presentation and custom-color prominence;
- right-click density;
- page thumbnail size;
- exact onboarding order;
- how much table structure appears inline versus in the Inspector.

Changing one of these after user testing is normal product iteration and does not imply an architecture rollback.

## FUTURE

Explicit future capabilities:

- live PIM/product binding;
- Presence;
- Realtime collaboration / CRDT;
- AI image generation;
- autonomous AI catalog authoring;
- complex approval/workflow automation;
- advanced offset-print features if later justified.

Design seams where cheap and clear, but do not make these V1 prerequisites.

## FIRST IMPLEMENTATION WAVES

### W0 — Foundation promotion + W0.1 boundary hardening

**MERGED / COMPLETE.** The proven foundation is production-owned under `src/vnext/` with the W0.1 public-API, footer-side-channel, scoped-CSS, and `@page` boundaries protected by architecture tests.

### W1 — Application Actions + minimal VNext shell

**NOT STARTED.** Establish typed mutation actions, Undo/Redo-compatible transaction semantics, and the minimal editor shell that invokes them.

### W2 — A4 authoring/direct manipulation + primitives

Deliver canonical primitive authoring, move/resize, guides/diagnostics, and a minimum page-template insertion seam.

### W3 — Save/Reopen/Catalog Library

Add versioned persistence, CAS, autosave/local recovery, reopen, visible conflicts, father-facing catalog access, and a persistable starter/catalog creation path.

### W4 — Advanced Table Editor

Expose the one proven table engine through father-usable structural editing, spreadsheet-like selection, TSV paste, marker bulk toggle, explicit Fit Height, table presets, grouped headers, titles/notes/footnotes, and advanced controls.

### W5 — Complete Translation VNext

Implement complete semantic leaf coverage, Legacy translation salvage, protection, stale tracking, coverage audit, and layout QA.

### W6 — Publication integration + minimum easy-button layer + First Father Pilot

Integrate immutable publication snapshot/PDF artifacts/basic sharing and ensure minimum usable page templates, catalog starter, and starter reusable components exist before running the first father pilot including Spanish translation.

### W7 — Evidence-driven maturation

Use father-pilot evidence to broaden templates/components, Asset Library, sharing, and polish, and to correct tested UX friction.

No exact dates are frozen. Detailed W6/W7 boundaries may evolve, but the **minimum easy-button layer before the father pilot** is a durable product requirement.
