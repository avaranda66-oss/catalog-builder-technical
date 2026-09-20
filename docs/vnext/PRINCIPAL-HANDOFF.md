# Catalog Builder VNext — Principal Handoff

STATUS: **W3 COMPLETE / CANONICAL; W4 NEXT / NOT STARTED; GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-20

PURPOSE: durable reconstruction and operating guide for a fresh Principal after canonical W3 closeout.

## PRINCIPAL GOVERNANCE

Repository: `avaranda66-oss/catalog-builder-technical`.

GitHub live is authority. Before directing work, reconstruct the current `main` SHA/tree/parent, PR state, exact-head checks, and any changed branch head. Historical stories preserve point-in-time truth but do not override current GitHub state.

The user is the exclusive merge authority. Never merge without explicit user authorization. An authorization is valid for one named PR, is consumed once, and cannot be reused. If an accepted head changes, prior audit/acceptance and exact-head CI do not automatically transfer to the new head.

No next implementation wave begins before the previous canonical gate and its durable handoff are complete unless the Principal explicitly documents a justified exception. The durable W3 closeout is **COMPLETE / CANONICAL**. W4 is next, has not started, and requires its own live reconstruction, Principal preflight, frozen scope/contract, and separate implementation prompt.

### Proactive continuity requirement

After each report, audit, amendment, PR, CI result, merge, canonical closeout, research wave, or implementation wave, the Principal must:

1. reconstruct GitHub live;
2. issue a clear Principal decision;
3. identify the next acting agent;
4. provide the user a complete copy-paste prompt for that agent;
5. define the evidence that must return;
6. define the following gate.

Do not make the product owner reconstruct the technical workflow between agents.

### Agent routing

- **Executor / Codex** — scoped implementation, tests, proofs, docs, branch, commit, push, PR creation/update, and CI remediation.
- **Independent auditor / research agent** — read-only adversarial research, counterexamples, exact-head audits, and amendment re-audits.
- **Principal** — architecture, contracts, confrontation, decisions, gates, roadmap, and orchestration.
- **User** — exclusive explicit merge authorization.

## LIVE CANONICAL BASE AT THIS CLOSEOUT

Canonical `main` at the start of the durable W3 closeout:

- SHA: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- direct parent: `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- merge timestamp: `2026-09-20T14:27:11Z`
- post-merge Quality Gate run `35516528303`: event `push`, branch `main`, exact head `00b78e6d582a2868e4b0447cb3dee2bf53732299`, **COMPLETED / SUCCESS**

Top-level state:

- W0 — COMPLETE / CANONICAL
- W0.1 — COMPLETE / CANONICAL
- W1 — COMPLETE / CANONICAL
- W2 — COMPLETE / CANONICAL
- W3 — COMPLETE / CANONICAL
- W4 — NOT STARTED
- W5 — NOT STARTED
- W6 — NOT STARTED
- W7 — NOT STARTED

The next durable gate is **W4 PRINCIPAL PREFLIGHT**, not W4 implementation. Before authorizing implementation, the Principal must reconstruct GitHub live, perform the W4 preflight, freeze the W4 scope/contract, and issue a separate implementation prompt.

## FATHER NORTH STAR

Catalog Builder VNext / PRESYS is a professional technical-catalog authoring platform for non-technical office users. The primary acceptance persona is the user's father: he must be able to create, edit, save, reopen, recover, translate, publish, and share a professional PRESYS catalog without developer help.

Father V1 must remain an end-to-end workflow, not a collection of disconnected technical waves. It includes:

- Blank, Starter, and template entry paths;
- finite A4 pages and editable canonical objects;
- direct Text editing and discoverable engineering symbols;
- insert/replace Image through durable assets;
- advanced technical Table authoring;
- move/resize, grouping, Undo/Redo, diagnostics, and explicit corrective actions;
- Save, autosave, reopen, local Recovery, conflict handling, Rename, Duplicate, and Archive;
- complete Spanish translation coverage and review in W5;
- professional Chromium PDF publication and minimum sharing in W6;
- an Easy Button layer that accelerates ordinary canonical authoring without creating hidden engines.

Technical waves are valuable only when they advance this office-user journey.

## FROZEN A4 / EDITOR ARCHITECTURE

Canonical hierarchy:

```text
Catalog
→ Pages
→ Objects
→ Properties
```

Pages are finite physical A4 surfaces. Canonical primitives are Text, Image, Table, Shape, Line, Icon, and Group.

Preserve these established invariants:

- authored geometry uses integer U;
- rendered/browser measurement uses integer Q;
- deterministic measurement and fit use the proven U/Q boundary;
- there is one canonical editorial render tree;
- there is one canonical Table Engine;
- Table has stable IDs, typed `CellContent`, explicit merge/span ownership, deterministic row solving, and structured diagnostics;
- only explicitly allowed rows grow; fixed authored rows do not silently grow;
- publication preflight blocks residual overflow rather than silently restructuring the document;
- the user owns authored position, size, composition, and page placement;
- the system owns snapping, guides, diagnostics, and validation;
- the system never silently moves objects between pages, creates continuation pages, resizes authored frames, or changes authored topology;
- editor chrome is not publication authority;
- complex diagrams may enter as durable SVG/raster assets when generic primitives are insufficient.

Production boundaries:

- `src/vnext/index.ts` remains the pure domain/table public boundary;
- `src/vnext/rendering` owns rendering, browser measurement, and render resources;
- `src/vnext/publication` owns publication/preflight;
- `src/vnext/` is production authority;
- `src/labs/presys-editorial-proof/` and browser/PDF fixtures are proof harnesses only, not a second engine.

Typed Application Actions remain the mutation seam. React/UI mechanics do not become canonical mutation authority.

## W3 PERSISTENCE ARCHITECTURE

The W3 contract and implementation freeze these authorities:

- `CatalogDocument` is the sole canonical authored-document model.
- Persistence stores one complete validated canonical snapshot plus thin persistence/lifecycle metadata. It is not a second normalized document model.
- `CatalogDocument.source.serverVersion` is authored provenance, never the live CAS token.
- Remote revision remains outside authored document state and is server-owned and monotonic.
- `SupabaseCatalogRepository` is the production remote adapter.
- `SaveCoordinator` is the sole normal Save / strict-CAS authority.
- Manual Save and autosave use the same `SaveCoordinator`.
- `AutosaveCoordinator` schedules/debounces/flushes; it does not create another save authority.
- `CanonicalReopenCoordinator` is the reopen authority.
- `PreparedCatalogCreateCoordinator` is the Create / pending-reconciliation authority.
- `ConflictResolutionCoordinator` is the conflict-resolution single-flight authority.
- `CatalogCloneService` is the complete authored-identity clone authority.
- W3.D Recovery is revision-aware local protection only and never remote Saved authority.
- `AssetPersistenceBridge` persists immutable `AssetRef`s while asset bytes, blob/signed URLs, base64, and runtime URLs remain outside `CatalogDocument`.
- strict CAS, mutation identity, ambiguous-write reconciliation, replay safety, stale-result rejection, authority/catalog/open-session lineage, and archive fail-closed behavior remain canonical.
- controlled repositories, deterministic timing, and fixtures are evidence mechanisms only; they are not product authorities.

No second document model, save path, clone path, recovery model, repository authority, renderer, or table engine may be introduced by default.

## W3 CANONICAL LEDGER

| Wave | Purpose | PR | Canonical merge SHA | Canonical tree | Post-merge gate | Status |
| --- | --- | ---: | --- | --- | ---: | --- |
| W3.0 | Persistence contract freeze | #28 | `b34156c597dcd47a5ab6d154f73ffa7a323d4664` | `0df4eedfcf649a10423a4a3153233ff6c424020f` | `34668097170` SUCCESS | COMPLETE / CANONICAL |
| W3.A | Contracts + exact canonical round-trip | #29 | `4199108c2e4e0cd2d09a3ec02e2700528a373ff3` | `1fa5b5f0d6a53149c38c95c5f3282de79fa5ff35` | `34706862089` SUCCESS | COMPLETE / CANONICAL |
| W3.B | Supabase strict CAS + immutable history | #31 | `a0bee489deff7af78e056463cf763f3ba4844105` | `8c87e59a32f3761d9d6d21a023e132e3b08a6f09` | `34723686552` SUCCESS | COMPLETE / CANONICAL |
| W3.C | Manual Save + canonical reopen | #32 | `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7` | `d08158a1c2f3e0e10c6812008e1356322815d81f` | `34730115210` SUCCESS | COMPLETE / CANONICAL |
| W3.D | Local revision-aware Recovery | #33 | `e37cdf3105626ce83763964f8d2a56a1fda1e01b` | `c7bf0865b9f51dd4ea624a196f08dec496aeed67` | `34844237602` SUCCESS | COMPLETE / CANONICAL |
| W3.E | Catalog Library | #34 | `cd4d20fbdfd89d1896385317a46052f0239c9ac4` | `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d` | `34875954678` SUCCESS | COMPLETE / CANONICAL |
| W3.F | Starter / Duplicate identity closure | #35 | `266331618c5677e1079865f8d57e2d479a9601f1` | `a6f3df2125e697d2e5ebf855db194afcaf99d5a0` | `35020085786` SUCCESS | COMPLETE / CANONICAL |
| W3.G | Asset Persistence Bridge | #36 | `a44a710836ed8cbaba48dccd541614304e10cb8a` | `1bc573e061bb2a732751c8650ba86fc0d5c92835` | `35034657054` SUCCESS | COMPLETE / CANONICAL |
| W3.H | Autosave / adversarial concurrency | #37 | `ac2b45bd5fe6971c0f1885b88884102d01114b98` | `18dc40ce8856483d011a7f0d266f02c4a39ff347` | `35453791083` SUCCESS | COMPLETE / CANONICAL |
| W3.I | Father Browser Flow / W3 closeout | #38 | `00b78e6d582a2868e4b0447cb3dee2bf53732299` | `e198bc8c576a54537ad0b031743b53091ed0ed60` | `35516528303` SUCCESS | COMPLETE / CANONICAL |

W3.B's real-database evidence is deliberately separate: check `VNext W3.B real DB CAS/history proof`, run `34720465558`, **SUCCESS** on accepted PR #31 head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.

## W3 CANONICAL PRODUCT CAPABILITIES

W3 now supplies the product with:

- canonical whole-document persistence;
- validated `CatalogDocument` snapshot authority;
- strict optimistic concurrency / CAS;
- server-owned monotonic revision;
- mutation identity, same-intent replay, and ambiguous-write reconciliation;
- exact Manual Save and canonical reopen;
- reopen with a fresh `openSessionId` and empty Undo/Redo;
- revision-aware local Recovery;
- Catalog Library and active/archived views;
- Blank creation;
- registered Starter creation;
- Duplicate with complete fresh authored identity closure and independent persistence lineage;
- immutable `AssetRef` persistence bridge;
- debounced autosave through the shared Save authority;
- active-authoring-draft autosave barrier;
- offline/retry lifecycle without false Saved state;
- two-session stale-write conflict behavior;
- Open latest;
- Save my work as copy;
- conflict-resolution single-flight;
- canonical Rename;
- CAS-protected Archive;
- stale autosave fail-closed after Archive;
- Father-facing integrated browser proof;
- Portuguese Father Save presentation while internal `SaveProjection` semantics remain unchanged;
- Recovery/conflict surfaces proven at 320, 360, and 390 px plus desktop sanity;
- protected recovered A4 preview mounted and proved through visible UI.

Persistence logic never depends on translated presentation labels.

## W3.I EXACT CANONICAL PROVENANCE

PR #38: `test(vnext): prove W3 Father browser flow closeout` — **MERGED / CLOSED**.

- accepted source head: `48ac1c11d09f4d1c73ad055dc9c2462b679f4d4c`
- accepted source tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical squash merge: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- canonical tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical parent: `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- merge timestamp: `2026-09-20T14:27:11Z`
- post-merge Quality Gate run `35516528303`: **COMPLETED / SUCCESS**

The accepted review tree and promoted canonical tree are identical. The one-use merge authorization for PR #38 has been consumed and cannot be reused.

Status/delivery lines in historical W3 stories and status/delivery preface text in the W3 persistence contract are point-in-time historical evidence. They do not override GitHub live or the current durable handoffs. The frozen architecture and contract content itself remains authoritative unless a later canonical contract supersedes it.

## W3.I EVIDENCE BOUNDARY

### Layer 1 — real production `/v2` bootstrap smoke

It proves:

- VNext bootstrap selected;
- Legacy bootstrap not selected;
- canonical W3 production seams wired.

It does not prove the complete Father journey against real Supabase.

### Layer 2 — controlled Father browser integration

It uses:

- real React and visible Father UI interactions;
- canonical product coordinators and services;
- deterministic external repository timing;
- controlled strict CAS;
- IndexedDB Recovery;
- deterministic asset dependencies.

The integrated flow proved:

```text
Library
→ Starter/create
→ visible authoring
→ active draft barrier
→ autosave
→ durable asset
→ exact reopen
→ Duplicate independence
→ local Recovery
→ strict-CAS conflict
→ Open latest
→ second conflict
→ Save as copy
→ Rename
→ Archive
→ stale-autosave protection
```

Father-facing persistence/save labels are Portuguese. Internal Save projection semantics did not change, and no persistence logic depends on translated labels. The proof opens `Ver alterações recuperadas`, mounts the protected Recovery inspection and recovered A4 preview, and verifies fit/action reachability at 320, 360, 390, and desktop widths.

W3.I does **not** prove a full real-production Supabase Father E2E or real cloud multi-tab Father execution. The W3.B real-database rehearsal remains separate evidence.

## AI-READY AUTHORING INVARIANT

Meaningful editorial capabilities should expose typed domain/Application Actions or structured services independent of React/UI mechanics whenever reasonably possible:

```text
Human UI ─┐
          ├─> typed Application Actions / structured commands
Future AI ┘                    ↓
                       canonical document
                              ↓
                    renderer / diagnostics
                              ↓
                         publication
```

Future AI must not require DOM manipulation as authority, arbitrary whole-document JSON replacement, a second document model, a second renderer, or AI-only mutation semantics. Human and future-AI authoring should use the same validated operations.

Autonomous AI authoring is future work. It is not implemented and is not a Father V1 prerequisite.

## TRANSLATION LEGACY SALVAGE PRINCIPLE

Legacy translation machinery is a high-value W5 salvage source, not VNext authority. Potential salvage includes provider gateway concepts, `TechnicalTokenProtector`, translation memory/cache, language registry, font/multiscript support, strict response validation, chunking/retry/cancel concepts, coverage auditing, layout QA, and review workflow.

W5 must adapt translation to canonical VNext semantic text leaves. Legacy block-specific extractors/appliers must not become VNext authority.

Every printable/editable textual leaf needs stable identity and an explicit policy such as `translate`, `protect`, or `system`. Source edits make affected localized leaves stale; translations are not silently overwritten. Translation growth produces diagnostics and explicit user actions, never silent geometry/topology mutation.

Spanish remains the first Father-pilot target. W5 has not started.

## EASY BUTTON PRINCIPLES

Preserve:

```text
Preset != Engine
Template != Renderer
Component != Special Engine
```

The Easy Button layer should include table presets, page templates, catalog Starters, reusable Components / `Blocos`, and contextual commands. Each must materialize ordinary editable canonical primitives and invoke ordinary validated actions. Easy Button constructs are also natural future-AI tools because they do not create parallel authority.

## CURRENT ROADMAP

- **W3 — COMPLETE / CANONICAL.**
- **W4 — NEXT / NOT STARTED: Advanced Table Editor.** Expected direction may include spreadsheet-like row/column/range selection; add/remove rows and columns; merge/unmerge; grouped headers; section rows; titles/notes/footers/legends; TSV/spreadsheet paste; technical matrices; presets; marker-cell ergonomics; explicit **Fit Height / Ajustar altura**.
- **W5 — Complete Translation VNext.** NOT STARTED.
- **W6 — Publication + Easy Button + First Father Pilot.** NOT STARTED.
- **W7 — evidence-driven maturation.** NOT STARTED.

W4 must preserve **one canonical Table Engine**. No Additel engine, Fluke engine, vendor-specific table engine, second renderer, or parallel table domain is authorized. Complex technical tables remain configurations/compositions of the canonical generic engine.

This durable closeout does not design or authorize W4 implementation.

## EXTERNAL ADVISORIES

These are advisories, separate from W3 canonical acceptance:

- Vercel on accepted W3.I head: **SUCCESS**.
- Netlify: historical external failure pattern; not a required branch-protection context; no W3.I causal change demonstrated.
- dependency audit baseline at W3.I closeout: **2 critical, 1 high, 4 moderate**.
- no package manifest or lockfile changed in the W3.I amendment/closeout.
- the durable W3 closeout did not authorize dependency modernization.

## NEXT DURABLE GATE

**W4 PRINCIPAL PREFLIGHT** is next. W4 implementation is not automatically authorized. Before issuing any W4 implementation prompt, the Principal must:

1. reconstruct GitHub live;
2. perform the W4 preflight;
3. freeze the W4 scope/contract;
4. provide a separate implementation prompt with its required evidence and gate.

## RECONSTRUCTION ORDER

1. `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`
2. `docs/vnext/PROJECT-STATE.md`
3. this detailed handoff
4. `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md`
5. W3.0–W3.I stories under `docs/stories/`
6. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
7. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`
8. `docs/vnext/presys-mvp-r0/README.md` and its final amendments/evidence
9. current `src/vnext/` ownership and architecture-boundary proofs
