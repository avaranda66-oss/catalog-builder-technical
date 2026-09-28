# Catalog Builder VNext — Principal / Auditor Executive Handoff

**W4 COMPLETE / CANONICAL**

**W5 NOT STARTED**

**GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-28

PURPOSE: first-read reconstruction for a completely fresh Principal/Auditor. Verify GitHub live before acting, then use `PROJECT-STATE.md` and `PRINCIPAL-HANDOFF.md` for detail.

## 1. LIVE CANONICAL STATE

Repository: `avaranda66-oss/catalog-builder-technical`.

Canonical post-W4 `main`:

- SHA `9e4e96c6307aa355489dbb200d53eb457b456eee`
- tree `1165ae3c4a099948ef0d8b5d9b294a6ac3f80037`
- direct parent `25e577587a1713cb93dfcdc41a6ba13d378fdd2f`
- canonical commit `test(vnext): close out Wave 4 integration (#51)`
- PR #51 — **MERGED / CLOSED**
- merged `2026-09-28T04:08:23Z`
- post-merge Quality Gate `36376434751 — COMPLETED / SUCCESS`
- job `108783134478 — SUCCESS`
- tests: `270 / 270` files, `2886` passed, `1` skipped, `0` failed
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

W4.G consumed its one-use PR #51 merge authorization and completed the Wave 4 implementation/evidence closeout. That authorization cannot be reused.

The next gate is **W5 PRINCIPAL PREFLIGHT / CONTRACT DISCOVERY**, not implementation.

## 2. W4 CANONICAL LEDGER

| Wave | Purpose | PR | Canonical merge SHA | Tree | Post-merge gate |
| --- | --- | ---: | --- | --- | ---: |
| W4.A | Table Selection + Axis Authoring | #40 | `069111df3d01f0e60c3584b6d40d1284f8598388` | `b94b237c4c8f31752b98e710d66fd5ea69ad309a` | `35556438978` SUCCESS |
| W4.B | Cell Content + Properties | #42 | `19c852ca318ff45f31adacc7ffa29c14fc5d52ed` | `82afef0d99520a5c0104817c273bc749b0e2c5e5` | `35679097482` SUCCESS |
| W4.C | Merge / Unmerge + Semantics | #43 | `133f0c84def7b8985b554f73cf88874299a40472` | `f72c1d46ee00ccf4d6c867178dc4e89f369f2603` | `35693950848` SUCCESS |
| W4.D | Bulk Authoring / TSV / Clipboard / Markers | #44 | `0237de6c5685300bd61cb7a3d1b271f2a291f02f` | `10853ba2f2350d8b935292f21065bfc9a74b3e65` | `35943635952` SUCCESS |
| W4.E | Fit Height + Layout Diagnostics | #45 | `85cd5dfb95564250a2edc752e8bd88b2a0bf6590` | `1f6c89c349d88bbdc5c46eaf90b529819c946dbe` | `36029158003` SUCCESS |
| W4.F.1 | Professional Table Dimensions | #46 | `e72c111bd02143a1ed1689f4bb80b058845584ff` | `a645b32ba7ee1b5aae4bf1270af4973bef354cfe` | `36137096369` SUCCESS |
| W4.F.2 | Professional Table Presentation / Style Cascade / Presets | #47 | `0671bd5664816140981c42c1b88208d6ad09a2f3` | `73b82b1fc0784f7046bd289701188d52ce22f4d4` | `36209727282` SUCCESS |
| W4.F.3 | Table Semantic Surfaces | #48 | `aca60baf0acace66017cbafd14c89339d18faa95` | `d2f4671c9b6a70fdbdb73e97ea2154934b8f96c9` | `36252023348` SUCCESS |
| W4.F.4 | Standalone Image Professional Authoring | #49 | `b678421cba3b7b0e85aeb75a6952584537c1800b` | `6a7f7fcc30d30b758a5a7dedf51c9effdf6611d1` | `36281588953` SUCCESS |
| W4.F.5 | Professional Object Arrangement + Locking | #50 | `25e577587a1713cb93dfcdc41a6ba13d378fdd2f` | `2a23c91e3b1a2657c326eca8d31f796b76bfb724` | `36330907923` SUCCESS |
| W4.G | Wave 4 Integration / Stabilization / Closeout | #51 | `9e4e96c6307aa355489dbb200d53eb457b456eee` | `1165ae3c4a099948ef0d8b5d9b294a6ac3f80037` | `36376434751` SUCCESS |

Every row is **COMPLETE / CANONICAL**.
Canonical history also contains PR #41, `fix(vnext): connect image insertion to canonical assets`, squash `2172141ebed0c8a8a8a2018c832833f472e8ddd7`, gate `35626415429` SUCCESS, between W4.A and W4.B.

## 3. WHAT W4 NOW GIVES THE PRODUCT

Wave 4 canonically provides:

- advanced Table row/column/range selection and axis authoring;
- Cell content/properties;
- merge/unmerge;
- bulk TSV/clipboard authoring;
- Markers/Legend;
- explicit Fit Height and diagnostics;
- professional row/column dimensions and axis reorder;
- Table typography/colors/padding/borders, style cascade/inheritance, and presets;
- title/caption/note/footnote/annotation surfaces;
- Legend lifecycle/reorder/navigation and Image Cell authoring;
- standalone Image fit/focal/replacement;
- top-level object lock/unlock;
- modifier-free multi-selection;
- align/distribute and existing z-order presentation;
- integrated history/persistence/publication/PDF/mobile closeout evidence.

There is still **one canonical generic Table Engine**. No vendor-specific engine, second Table domain, or parallel renderer is canonical.
## 4. W4.G EVIDENCE BOUNDARY

W4.G added no new feature family. It closed Wave 4 through representative real-browser integration across W4.A → W4.F.5.

It used real `VNextApp`, `EditorWorkspace`, `DocumentSession`, typed Application Actions, the existing persistence runtime, `AssetPersistenceBridge`, canonical renderer, diagnostics/preflight, native Chromium A4 PDF, and PDF.js.

It proved:

- cross-feature Table ↔ object lifecycle;
- exact-one history boundaries;
- Save → another catalog → reopen;
- immutable AssetRef integrity;
- publication after reopen;
- Table presentation parity;
- object geometry parity;
- 320 / 360 / 390 mobile evidence;
- bounded accessibility sanity;
- clean browser error budget;
- seven-token W4.E → W4.G ladder.

Persistence in W4.G was **controlled** for deterministic closeout evidence. W4.G does **not** claim production Supabase Father E2E. W3 real-database evidence remains separate.

## 5. FROZEN ARCHITECTURE

Preserve:
- one `CatalogDocument`;
- finite physical A4 pages;
- integer-U authored geometry;
- integer-Q browser/render measurement where established;
- one canonical renderer;
- one generic Table Engine;
- one `DocumentSession` / history authority;
- typed Application Actions as mutation seam;
- one W3 persistence authority family;
- `AssetPersistenceBridge` / immutable `AssetRef`;
- explicit diagnostics/preflight;
- no silent geometry/topology mutation;
- no second vendor-specific Table engine.

Controlled fixtures are proof tools, never product authorities.

## 6. HISTORICAL W3 FOUNDATION

W3 remains **COMPLETE / CANONICAL**. Its whole-document persistence, strict CAS, Save/reopen, Recovery, Library, Starter/Duplicate, AssetRef bridge, autosave/concurrency, and Father browser closeout remain canonical foundations.

PR #39, `docs(vnext): close W3 canonical handoff`, is the structural precedent for this docs/governance synchronization. Its post-W3 state is historical evidence, not current operating state.

W3.B real-database evidence remains separately preserved: run `34720465558`, SUCCESS, on accepted PR #31 head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.

## 7. DEFERRED BACKLOG

Still deferred/future-decision items include professional Page management/thumbnails/naming, professional Text/RichText, Shape/Line styling, user zoom, Format Painter, Paste Special, richer context menus, Group resize, Group drill-down, bulk lock, and pagination/Table splitting.

Do not automatically assign those items to W5.
## 8. ROADMAP / GOVERNANCE

- W4 — COMPLETE / CANONICAL
- W5 — Complete Translation VNext — NOT STARTED
- W6 — Publication + Easy Button + First Father Pilot — NOT STARTED
- W7 — evidence-driven maturation — NOT STARTED

NEXT ACTOR: **PRINCIPAL**

NEXT GATE: **W5 PRINCIPAL PREFLIGHT / CONTRACT DISCOVERY**

W5 requires fresh GitHub-live reconstruction, translation archaeology, canonical text-leaf inventory, Legacy salvage analysis, provider/memory/cache review, font/language/layout boundaries, Father review workflow, and Principal-frozen contract before implementation authorization.

Governance invariants:

- GitHub live is authority.
- Historical story status does not override live canonical state.
- User is the exclusive explicit merge authority.
- Merge authorization is single-use and exact-target bound.
- Head changes invalidate prior exact-head acceptance.
- No next implementation wave starts without predecessor canonical state and Principal gate.

## 9. ADVISORIES

- canonical W4.G GitHub Quality Gate: SUCCESS;
- canonical W4.G Vercel: SUCCESS;
- Netlify W4.G PR failures were external/non-authoritative without proven product causality;
- historical W3.I dependency observation: 2 critical, 1 high, 4 moderate; it is not a current dependency audit;
- dependency modernization is not authorized here.
