# Catalog Builder VNext — Principal Handoff

## Current resume checkpoint — 2026-10-01

W5.A/W5.B are canonical. Main `49db0f976efa1c39be54a97dad83d67d85bdae80`, tree `c04d3e6864e29d017dd9827c3459bbfe69161134`; PR #58 merged; post-merge gate `36818454508` attempt 1 SUCCESS. W5.C is implemented in the preserved `codex/w5c-publication-review` worktree, pending final verification/promotion. [W5 closeout](W5-CLOSEOUT.md) is the current reconstruction entry point.

The latest human Master Night Shift delegates safe completion, conditional squash after all gates and continued bounded W6 Father readiness after W5.C canonical push SUCCESS. Human boundaries remain migrations/SQL/RLS, auth or Recovery/L1 redesign, secrets, destructive production operations and rewritten history. GitHub live outranks this checkpoint. The following W4 snapshot is historical; its W5-not-started/preflight-only statements are superseded and must not restart completed work.

## Historical W4 closeout snapshot

STATUS: **W4 COMPLETE / CANONICAL; W5 NOT STARTED; GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-28

PURPOSE: durable reconstruction and operating guide for a fresh Principal after canonical Wave 4 closeout.

## PRINCIPAL GOVERNANCE

Repository: `avaranda66-oss/catalog-builder-technical`.

GitHub live is authority. Before directing work, reconstruct current `main` SHA/tree/parent, PR state, exact-head checks, and any changed branch head. Historical stories preserve point-in-time truth but do not override current GitHub state.

The user is the exclusive explicit merge authority. A merge authorization is valid for one named PR, is exact-target bound, is consumed once, and cannot be reused. A changed head invalidates prior exact-head acceptance unless explicitly re-audited and re-authorized.

No next implementation wave begins before its predecessor is canonical and the Principal issues the required gate. W4 is now **COMPLETE / CANONICAL**. W5 is **NOT STARTED** and is not implicitly authorized by this handoff.

The one-use W4.G merge authorization was consumed by PR #51. It cannot be reused and does not transfer to this durable-handoff PR or to W5.

### Proactive continuity requirement

After each report, audit, amendment, PR, CI result, merge, canonical closeout, research wave, or implementation wave, the Principal must:

1. reconstruct GitHub live;
2. issue a clear Principal decision;
3. identify the next acting agent;
4. provide the complete copy-paste prompt;
5. define required return evidence;
6. define the following gate.
## LIVE CANONICAL BASE

Canonical post-W4 `main`:

- SHA: `9e4e96c6307aa355489dbb200d53eb457b456eee`
- tree: `1165ae3c4a099948ef0d8b5d9b294a6ac3f80037`
- direct parent: `25e577587a1713cb93dfcdc41a6ba13d378fdd2f`
- canonical commit: `test(vnext): close out Wave 4 integration (#51)`
- PR #51: **MERGED / CLOSED**
- merged: `2026-09-28T04:08:23Z`
- accepted source head: `3e1327bff0ee517a689df9fa0bd7763937f95c9b`
- post-merge Quality Gate: `36376434751 — COMPLETED / SUCCESS`
- job: `108783134478 — SUCCESS`
- tests: `270 / 270` files, `2886` passed, `1` skipped, `0` failed
- proof ladder tail: **W4.E → W4.G = 7 / 7 PASS**

Wave state:

- W0 — COMPLETE / CANONICAL
- W0.1 — COMPLETE / CANONICAL
- W1 — COMPLETE / CANONICAL
- W2 — COMPLETE / CANONICAL
- W3 — COMPLETE / CANONICAL
- W4 — COMPLETE / CANONICAL
- W5 — NOT STARTED
- W6 — NOT STARTED
- W7 — NOT STARTED
## FATHER NORTH STAR

Catalog Builder VNext / PRESYS is a professional technical-catalog authoring platform for non-technical office users. The primary acceptance persona is the user's father: he must be able to create, edit, save, reopen, recover, translate, publish, and share a professional PRESYS catalog without developer help.

Father V1 remains an end-to-end workflow, not a collection of disconnected technical waves. It includes:

- Blank, Starter, and template entry paths;
- finite A4 pages and editable canonical objects;
- direct Text editing and discoverable engineering symbols;
- insert/replace Image through durable assets;
- advanced technical Table authoring;
- move/resize, grouping, arrangement, locking, Undo/Redo, diagnostics, and explicit corrective actions;
- Save, autosave, reopen, local Recovery, conflict handling, Rename, Duplicate, and Archive;
- complete translation coverage/review in W5;
- professional publication/share/pilot work in W6;
- evidence-driven maturation in W7.

W4 advanced authoring is now canonical. Translation and later publication/share work remain future gates.

## FROZEN A4 / EDITOR ARCHITECTURE

Canonical hierarchy:

`Catalog → Pages → Objects → Properties`

Pages are finite physical A4 surfaces. Canonical primitives remain Text, Image, Table, Shape, Line, Icon, and Group.
Preserve these invariants:

- authored geometry uses integer U;
- rendered/browser measurement uses integer Q where established;
- one canonical editorial render tree and renderer;
- one canonical generic Table Engine;
- stable IDs, typed Cell content, explicit merge/span ownership, deterministic measurement, and structured diagnostics;
- one `DocumentSession` / history authority;
- typed Application Actions are the mutation seam;
- only explicitly allowed geometry/topology changes occur;
- publication preflight blocks residual overflow rather than silently restructuring the document;
- the user owns authored position, size, composition, and page placement;
- no silent page creation, cross-page reflow, frame resizing, object relocation, or topology mutation;
- editor chrome is not publication authority;
- no vendor-specific Table engine, parallel Table domain, or second renderer.

W4 advanced authoring extends the existing generic Table Engine. Complex technical tables remain configurations/compositions of canonical Table semantics.

## W3 PERSISTENCE AUTHORITIES REMAIN FROZEN

- `CatalogDocument` is the sole authored-document model.
- Persistence stores one validated complete snapshot plus thin lifecycle metadata.
- Remote revision is server-owned and remains outside authored document state.
- `SupabaseCatalogRepository` is the production remote adapter.
- `SaveCoordinator` is the normal Save / strict-CAS authority.
- `AutosaveCoordinator` schedules/flushes that same authority.
- `CanonicalReopenCoordinator` owns reopen.
- `PreparedCatalogCreateCoordinator` owns Create/pending reconciliation.
- `ConflictResolutionCoordinator` owns conflict-resolution single-flight.
- `CatalogCloneService` owns complete authored-identity cloning.
- W3.D Recovery is local protection only, never remote Saved authority.
- `AssetPersistenceBridge` keeps bytes/runtime URLs outside `CatalogDocument`; immutable `AssetRef` remains canonical.
## W4 CANONICAL LEDGER

| Wave | Purpose | PR | Canonical squash | Post-merge gate |
| --- | --- | ---: | --- | ---: |
| W4.A | Table Selection + Axis Authoring | #40 | `069111df3d01f0e60c3584b6d40d1284f8598388` | `35556438978` SUCCESS |
| W4.B | Cell Content + Properties | #42 | `19c852ca318ff45f31adacc7ffa29c14fc5d52ed` | `35679097482` SUCCESS |
| W4.C | Merge / Unmerge + Semantics | #43 | `133f0c84def7b8985b554f73cf88874299a40472` | `35693950848` SUCCESS |
| W4.D | Bulk Authoring / TSV / Clipboard / Markers | #44 | `0237de6c5685300bd61cb7a3d1b271f2a291f02f` | `35943635952` SUCCESS |
| W4.E | Fit Height + Layout Diagnostics | #45 | `85cd5dfb95564250a2edc752e8bd88b2a0bf6590` | `36029158003` SUCCESS |
| W4.F.1 | Professional Table Dimensions | #46 | `e72c111bd02143a1ed1689f4bb80b058845584ff` | `36137096369` SUCCESS |
| W4.F.2 | Professional Table Presentation / Style Cascade / Presets | #47 | `0671bd5664816140981c42c1b88208d6ad09a2f3` | `36209727282` SUCCESS |
| W4.F.3 | Table Semantic Surfaces | #48 | `aca60baf0acace66017cbafd14c89339d18faa95` | `36252023348` SUCCESS |
| W4.F.4 | Standalone Image Professional Authoring | #49 | `b678421cba3b7b0e85aeb75a6952584537c1800b` | `36281588953` SUCCESS |
| W4.F.5 | Professional Object Arrangement + Locking | #50 | `25e577587a1713cb93dfcdc41a6ba13d378fdd2f` | `36330907923` SUCCESS |
| W4.G | Wave 4 Integration / Stabilization / Closeout | #51 | `9e4e96c6307aa355489dbb200d53eb457b456eee` | `36376434751` SUCCESS |

All rows are **COMPLETE / CANONICAL**.
Canonical history also includes PR #41, `fix(vnext): connect image insertion to canonical assets`, squash `2172141ebed0c8a8a8a2018c832833f472e8ddd7`, gate `35626415429` SUCCESS, between W4.A and W4.B.

## W4 CANONICAL PRODUCT CAPABILITIES

W4 now provides:

- advanced Table selection across row/column/range/table scopes;
- row/column axis authoring;
- Cell content/properties;
- merge/unmerge;
- bulk TSV/clipboard authoring;
- Markers and Legend;
- explicit Fit Height and layout diagnostics;
- row/column professional dimensions and axis reorder;
- Table typography, colors, padding, borders, vertical alignment, style cascade/inheritance/reset, and presets;
- title/caption/note/footnote/annotation surfaces;
- Legend lifecycle/reorder/navigation;
- Image Cell authoring;
- standalone Image fit/focal/replacement/upload;
- top-level object lock/unlock;
- modifier-free multi-selection;
- align/distribute and existing z-order presentation;
- integrated history/persistence/publication/mobile closeout evidence.

## W4.G CLOSEOUT EVIDENCE

W4.G added no new feature family. It closed Wave 4 through representative integration and stabilization across W4.A → W4.F.5.
The closeout exercised real `VNextApp`, `EditorWorkspace`, `DocumentSession`, Application Actions, persistence runtime, `AssetPersistenceBridge`, renderer, diagnostics/preflight, native Chromium PDF, and PDF.js.

It proved:

- Table ↔ object lifecycle transitions;
- exact-one semantic history boundaries;
- Save → another catalog → reopen;
- immutable AssetRef integrity;
- publication after reopen;
- Table presentation and object geometry parity;
- 320/360/390 mobile evidence;
- bounded accessibility sanity;
- clean browser error budget;
- seven-token W4.E → W4.G proof preservation.

Evidence boundary: W4.G used **controlled persistence** for deterministic closeout evidence and does **not** claim production Supabase Father E2E. W3 real-database evidence remains separate historical production-database evidence.

## HISTORICAL W3 CONTEXT

W3 remains **COMPLETE / CANONICAL**. Its persistence, recovery, concurrency, asset, library, and Father browser-flow authorities remain the foundation beneath W4.

PR #39, `docs(vnext): close W3 canonical handoff`, is the structural precedent for this durable docs-only synchronization. Its post-W3 status was historically correct at the time and is superseded only as current operating state by this post-W4 handoff.

W3.B real-database rehearsal remains separate production-database evidence: run `34720465558`, SUCCESS, on accepted PR #31 head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.
## DEFERRED PROFESSIONAL BACKLOG

Do not erase or silently mark these items complete:

- professional Page management/thumbnails/naming;
- professional Text/RichText authoring;
- Shape/Line professional styling;
- user zoom controls;
- Format Painter;
- Paste Special;
- richer context menus;
- Group resize;
- Group drill-down;
- bulk lock;
- pagination / Table splitting.

These are backlog/future decisions. Do not automatically assign them to W5.

## TRANSLATION / AI / EASY-BUTTON INVARIANTS

W5 should salvage valuable Legacy translation concepts—provider gateway, technical-token protection, memory/cache, language/font support, strict response validation, retries, coverage auditing, layout QA, and review workflow—but must target canonical VNext semantic text leaves. Legacy block models must not become VNext authority.

Human UI and future AI must use the same typed actions/structured services over the canonical document. Future AI must not require DOM authority, a second document model, second renderer, or AI-only mutation semantics.

Preserve:

`Preset != Engine`

`Template != Renderer`

`Component != Special Engine`
## CURRENT ROADMAP

- **W4 — COMPLETE / CANONICAL**
- **W5 — Complete Translation VNext — NOT STARTED**
- **W6 — Publication + Easy Button + First Father Pilot — NOT STARTED**
- **W7 — evidence-driven maturation — NOT STARTED**

## NEXT GATE

NEXT ACTOR: **PRINCIPAL**

NEXT GATE: **W5 PRINCIPAL PREFLIGHT / CONTRACT DISCOVERY**

This is not W5 implementation authorization.

Before W5 implementation, Principal must perform fresh GitHub-live reconstruction, translation archaeology, canonical text-leaf inventory, Legacy salvage analysis, provider/memory/cache review, font/language/layout boundaries, Father review workflow analysis, and freeze the W5 contract.

## EXTERNAL / DEPENDENCY ADVISORIES

- canonical W4.G GitHub Quality Gate: **SUCCESS**;
- canonical W4.G Vercel: **SUCCESS**;
- Netlify W4.G PR failures were historical/external/non-authoritative without proven product causality;
- historical W3.I dependency-audit observation: **2 critical, 1 high, 4 moderate**; do not present this as a current audit;
- no dependency modernization is authorized by this durable closeout.

## RECONSTRUCTION ORDER

1. `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`
2. `docs/vnext/PROJECT-STATE.md`
3. this handoff
4. W4 stories W4.A → W4.G
5. W3 persistence contract and W3 historical stories
6. W2 A4 authoring contract
7. product/editor blueprint
8. current `src/vnext/` and proof ownership boundaries
