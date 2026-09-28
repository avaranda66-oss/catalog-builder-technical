# Catalog Builder VNext — Project State

STATUS: **W4 COMPLETE / CANONICAL; W5 NOT STARTED; GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-28

PURPOSE: give a fresh Principal/Auditor the current canonical facts, authority boundaries, Wave 4 ledger, evidence boundary, deferred backlog, roadmap, and next gate without relying on chat memory.

## CURRENT CANONICAL STATE

Repository: `avaranda66-oss/catalog-builder-technical`.

Canonical `main` after the W4.G / Wave 4 closeout:

- SHA: `9e4e96c6307aa355489dbb200d53eb457b456eee`
- tree: `1165ae3c4a099948ef0d8b5d9b294a6ac3f80037`
- direct parent: `25e577587a1713cb93dfcdc41a6ba13d378fdd2f`
- commit: `test(vnext): close out Wave 4 integration (#51)`
- PR #51: **MERGED / CLOSED**
- merge timestamp: `2026-09-28T04:08:23Z`
- accepted source head: `3e1327bff0ee517a689df9fa0bd7763937f95c9b`
- post-merge Quality Gate: `36376434751 — COMPLETED / SUCCESS`
- post-merge job: `108783134478 — SUCCESS`
- tests: `270 / 270` files, `2886` passed, `1` skipped, `0` failed
- proof ladder tail: **W4.E → W4.G = 7 / 7 PASS**
Current roadmap state:

- **W0 — COMPLETE / CANONICAL**
- **W0.1 — COMPLETE / CANONICAL**
- **W1 — COMPLETE / CANONICAL**
- **W2 — COMPLETE / CANONICAL**
- **W3 — COMPLETE / CANONICAL**
- **W4 — COMPLETE / CANONICAL**
- **W5 — NOT STARTED**
- **W6 — NOT STARTED**
- **W7 — NOT STARTED**

W4.G completed the Wave 4 implementation/evidence closeout. The one-use merge authorization for PR #51 was consumed by the canonical squash merge and cannot be reused.

The next gate is **W5 PRINCIPAL PREFLIGHT / CONTRACT DISCOVERY**, not W5 implementation. No W5 branch, worktree, code, proof, or PR is authorized by this durable synchronization.

Always reconstruct GitHub live before acting. GitHub commits, PR state, checks, repository evidence, and later canonical contracts outrank historical story status lines or prior agent reports.

## W4 CANONICAL LEDGER

Every W4 row below was reconstructed from GitHub live, canonical commits, merged PRs, repository stories, and post-merge `push` Quality Gate runs.

| Wave | Canonical purpose | PR | Accepted head | Canonical squash | Canonical tree | Post-merge gate | Status |
| --- | --- | ---: | --- | --- | --- | ---: | --- |
| W4.A | Table Selection + Axis Authoring | #40 | `cb8b5cf8a80b1f035f5e858fd264b1424b0d4f2e` | `069111df3d01f0e60c3584b6d40d1284f8598388` | `b94b237c4c8f31752b98e710d66fd5ea69ad309a` | `35556438978` SUCCESS | COMPLETE / CANONICAL |
| W4.B | Cell Content + Properties | #42 | `3cdc9a72c45624d5f2c8507714966b4de60363d6` | `19c852ca318ff45f31adacc7ffa29c14fc5d52ed` | `82afef0d99520a5c0104817c273bc749b0e2c5e5` | `35679097482` SUCCESS | COMPLETE / CANONICAL |
| W4.C | Merge / Unmerge + Semantics | #43 | `239be41f5e0a3589466b2d46dd6d00a88598b6fa` | `133f0c84def7b8985b554f73cf88874299a40472` | `f72c1d46ee00ccf4d6c867178dc4e89f369f2603` | `35693950848` SUCCESS | COMPLETE / CANONICAL |
| W4.D | Bulk Authoring / TSV / Clipboard / Markers | #44 | `565e9692258d5b0b77e840e0cda9d944b1fadb44` | `0237de6c5685300bd61cb7a3d1b271f2a291f02f` | `10853ba2f2350d8b935292f21065bfc9a74b3e65` | `35943635952` SUCCESS | COMPLETE / CANONICAL |
| W4.E | Fit Height + Layout Diagnostics | #45 | `8bdbc156dabc2d831d4766c901d8b987a205276f` | `85cd5dfb95564250a2edc752e8bd88b2a0bf6590` | `1f6c89c349d88bbdc5c46eaf90b529819c946dbe` | `36029158003` SUCCESS | COMPLETE / CANONICAL |
| W4.F.1 | Professional Table Dimensions | #46 | `e560193c72a6184d1a5bd763c92c7e667e3447aa` | `e72c111bd02143a1ed1689f4bb80b058845584ff` | `a645b32ba7ee1b5aae4bf1270af4973bef354cfe` | `36137096369` SUCCESS | COMPLETE / CANONICAL |
| W4.F.2 | Professional Table Presentation / Style Cascade / Presets | #47 | `10ab1b224c72dfbcb06bcbf92976018d9bc718ff` | `0671bd5664816140981c42c1b88208d6ad09a2f3` | `73b82b1fc0784f7046bd289701188d52ce22f4d4` | `36209727282` SUCCESS | COMPLETE / CANONICAL |
| W4.F.3 | Table Semantic Surfaces | #48 | `9dcc245dd6fa8499afc76f63149978849f0dac95` | `aca60baf0acace66017cbafd14c89339d18faa95` | `d2f4671c9b6a70fdbdb73e97ea2154934b8f96c9` | `36252023348` SUCCESS | COMPLETE / CANONICAL |
| W4.F.4 | Standalone Image Professional Authoring | #49 | `b7617e58263f098665b3187132b48134d96d0b00` | `b678421cba3b7b0e85aeb75a6952584537c1800b` | `6a7f7fcc30d30b758a5a7dedf51c9effdf6611d1` | `36281588953` SUCCESS | COMPLETE / CANONICAL |
| W4.F.5 | Professional Object Arrangement + Locking | #50 | `2e42984f4bce217b6ee5a8eb3d54876efb9a2e53` | `25e577587a1713cb93dfcdc41a6ba13d378fdd2f` | `2a23c91e3b1a2657c326eca8d31f796b76bfb724` | `36330907923` SUCCESS | COMPLETE / CANONICAL |
| W4.G | Wave 4 Integration / Stabilization / Closeout | #51 | `3e1327bff0ee517a689df9fa0bd7763937f95c9b` | `9e4e96c6307aa355489dbb200d53eb457b456eee` | `1165ae3c4a099948ef0d8b5d9b294a6ac3f80037` | `36376434751` SUCCESS | COMPLETE / CANONICAL |

Intervening canonical remediation between W4.A and W4.B:

- PR #41 — `fix(vnext): connect image insertion to canonical assets`
- accepted head: `43bdc6070af3b43c9687163b8a88eca91a19a47e`
- canonical squash: `2172141ebed0c8a8a8a2018c832833f472e8ddd7`
- canonical tree: `c6dcf9a2111d06c6411801ce85172b3ad9509f7f`
- post-merge Quality Gate: `35626415429` SUCCESS

That remediation is part of the canonical history but is not a separate W4 slice.

## W4.G CANONICAL CLOSEOUT EVIDENCE

W4.G did not add a new product feature family. It closed Wave 4 through integration, stabilization, cross-feature lifecycle evidence, persistence/reopen evidence, publication/PDF evidence, mobile/accessibility sanity, and regression preservation.

Canonical post-merge proof ladder tail:

- `W4.E Fit Height + Layout Diagnostics Chromium proof: PASS`
- `W4.F.1 Professional Table Dimensions Chromium proof: PASS`
- `W4.F.2 Professional Table Presentation Chromium proof: PASS`
- `W4.F.3 Table Semantic Content Chromium proof: PASS`
- `W4.F.4 Standalone Image Professional Authoring Chromium proof: PASS`
- `W4.F.5 Object Arrangement + Locking Chromium proof: PASS`
- `W4.G Wave 4 Closeout Chromium proof: PASS`

The representative W4.G Father journey used the real `VNextApp`, `EditorWorkspace`, `DocumentSession`, typed Application Actions, existing persistence runtime, `AssetPersistenceBridge`, canonical renderer, diagnostics/preflight, native Chromium PDF, and PDF.js inspection.

It proved representative integration across W4.A → W4.F.5, including cross-feature transitions, exact-one history boundaries, Save → another catalog → reopen, immutable AssetRef integrity, publication after reopen, Table presentation parity, object geometry parity, mobile widths 320/360/390, bounded accessibility sanity, and a clean browser error budget.

### W4.G evidence boundary

W4.G used **controlled persistence** for deterministic closeout evidence.

W4.G does **not** claim a production Supabase Father end-to-end run. W3 real-database evidence remains separate historical production-database evidence.

## WHAT W4 NOW GIVES THE PRODUCT

Wave 4 canonically adds:

- advanced Table row/column/range selection and axis authoring;
- Cell content and Cell properties;
- merge/unmerge with canonical span semantics;
- bulk TSV / clipboard authoring;
- Markers and Legend integration;
- explicit Fit Height / `Ajustar altura`;
- layout diagnostics and locate/navigation behavior;
- professional row/column dimensions and axis reorder;
- Table typography, colors, padding, borders, vertical alignment, style cascade, inheritance/reset, and presets;
- Table title, caption, note, footnote, annotation surfaces, Legend lifecycle/reorder/navigation, and Image Cell authoring;
- standalone Image fit, focal point, replacement/upload authoring;
- top-level object lock/unlock;
- modifier-free multi-selection;
- align/distribute;
- existing z-order presentation;
- cross-feature history, persistence/reopen, publication, PDF, mobile, and accessibility-closeout evidence.

W4 advanced authoring extends the existing generic canonical Table Engine. Complex technical tables remain configurations/compositions of canonical Table semantics.

## FROZEN ARCHITECTURE AFTER W4

Preserve these canonical boundaries:

- one `CatalogDocument` is the authored-document authority;
- finite physical A4 pages;
- authored geometry uses integer U;
- rendered/browser measurement uses integer Q where established;
- one canonical render tree and one canonical renderer;
- one canonical generic Table Engine;
- one `DocumentSession` / history authority;
- typed Application Actions are the mutation seam;
- one W3 persistence authority family;
- `AssetPersistenceBridge` keeps bytes/runtime URLs outside `CatalogDocument`; the document stores immutable `AssetRef` identity;
- explicit diagnostics/preflight;
- no silent geometry, page, frame, or topology mutation;
- no vendor-specific Table engine, second Table model, second renderer, or parallel persistence domain.

Canonical Table authority remains generic. There is no Additel engine, Fluke engine, vendor engine, or special renderer.
## HISTORICAL W3 CLOSEOUT CONTEXT

W3 remains **COMPLETE / CANONICAL**. PR #39, `docs(vnext): close W3 canonical handoff`, established the durable-governance precedent used by this synchronization: exactly the same three reconstruction documents were updated after W3 implementation closeout, with no product changes.

The post-W3 durable state was historically accurate on 2026-09-20. It is now superseded as current operating state by this post-W4 synchronization; W3 architecture/evidence remains historical canonical foundation.

W3 canonical ledger remains:

| Wave | Purpose | PR | Canonical merge | Tree | Post-merge gate |
| --- | --- | ---: | --- | --- | ---: |
| W3.0 | Persistence contract freeze | #28 | `b34156c597dcd47a5ab6d154f73ffa7a323d4664` | `0df4eedfcf649a10423a4a3153233ff6c424020f` | `34668097170` SUCCESS |
| W3.A | Persistence contracts + exact round-trip | #29 | `4199108c2e4e0cd2d09a3ec02e2700528a373ff3` | `1fa5b5f0d6a53149c38c95c5f3282de79fa5ff35` | `34706862089` SUCCESS |
| W3.B | Supabase strict CAS + immutable history | #31 | `a0bee489deff7af78e056463cf763f3ba4844105` | `8c87e59a32f3761d9d6d21a023e132e3b08a6f09` | `34723686552` SUCCESS |
| W3.C | Manual Save + canonical reopen | #32 | `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7` | `d08158a1c2f3e0e10c6812008e1356322815d81f` | `34730115210` SUCCESS |
| W3.D | Revision-aware local Recovery | #33 | `e37cdf3105626ce83763964f8d2a56a1fda1e01b` | `c7bf0865b9f51dd4ea624a196f08dec496aeed67` | `34844237602` SUCCESS |
| W3.E | Catalog Library | #34 | `cd4d20fbdfd89d1896385317a46052f0239c9ac4` | `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d` | `34875954678` SUCCESS |
| W3.F | Starter / Duplicate identity closure | #35 | `266331618c5677e1079865f8d57e2d479a9601f1` | `a6f3df2125e697d2e5ebf855db194afcaf99d5a0` | `35020085786` SUCCESS |
| W3.G | Asset Persistence Bridge | #36 | `a44a710836ed8cbaba48dccd541614304e10cb8a` | `1bc573e061bb2a732751c8650ba86fc0d5c92835` | `35034657054` SUCCESS |
| W3.H | Autosave / adversarial concurrency | #37 | `ac2b45bd5fe6971c0f1885b88884102d01114b98` | `18dc40ce8856483d011a7f0d266f02c4a39ff347` | `35453791083` SUCCESS |
| W3.I | Father Browser Flow / W3 closeout | #38 | `00b78e6d582a2868e4b0447cb3dee2bf53732299` | `e198bc8c576a54537ad0b031743b53091ed0ed60` | `35516528303` SUCCESS |

W3.B real-database evidence remains separate: run `34720465558`, **SUCCESS**, on accepted PR #31 head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.

## DEFERRED PROFESSIONAL BACKLOG

These items remain backlog/future decisions and are **not** silently complete:

- professional Page management, thumbnails, and naming;
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

Do not automatically assign this backlog to W5.
## ROADMAP AND NEXT GATE

Current roadmap:

- **W4 — COMPLETE / CANONICAL**
- **W5 — Complete Translation VNext — NOT STARTED**
- **W6 — Publication + Easy Button + First Father Pilot — NOT STARTED**
- **W7 — evidence-driven maturation — NOT STARTED**

NEXT ACTOR: **PRINCIPAL**

NEXT GATE: **W5 PRINCIPAL PREFLIGHT / CONTRACT DISCOVERY**

Before any W5 implementation authorization, the Principal must reconstruct GitHub live and perform translation archaeology, canonical text-leaf inventory, Legacy salvage analysis, provider/memory/cache review, font/language/layout-boundary review, Father review-workflow analysis, and contract freeze.

## FATHER NORTH STAR

The primary acceptance persona remains the user's father, a non-developer PRESYS office user. Father V1 must let him create, edit, save, reopen, recover, translate, publish, and share a professional technical catalog without developer help.

W4 advanced authoring is now canonical. Translation remains W5. Publication/share/pilot integration remains later roadmap work.

## GOVERNANCE

- GitHub live is authority.
- Historical stories are delivery snapshots and do not override current live canonical state.
- The user is the exclusive explicit merge authority.
- Merge authorization is single-use and exact-target bound.
- Any head change invalidates prior exact-head acceptance unless separately re-audited/authorized.
- No next implementation wave starts without predecessor canonical state and Principal gate.
- Principal must proactively provide next actor, prompt, required evidence, and following gate.

## EXTERNAL / DEPENDENCY ADVISORIES
- Canonical W4.G post-merge GitHub Quality Gate: **SUCCESS**.
- Canonical W4.G Vercel deployment: **SUCCESS**.
- Netlify failures observed on the W4.G PR were external/non-authoritative; no W4.G product causality was established.
- Historical W3.I dependency-audit observation was **2 critical, 1 high, 4 moderate**. Treat that count as historical, not as a current dependency audit.
- No dependency modernization is authorized by this durable synchronization.

## RECONSTRUCTION ORDER

1. `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`
2. this file
3. `docs/vnext/PRINCIPAL-HANDOFF.md`
4. W4 stories from W4.A through W4.G
5. `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md`
6. W3 stories and PR #39 historical durable closeout
7. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
8. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`
9. current `src/vnext/` and proof ownership boundaries

This document is the detailed durable canonical state beneath GitHub live.
