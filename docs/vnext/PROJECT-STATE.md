# Catalog Builder VNext — Project State

STATUS: **W3 COMPLETE / CANONICAL; W4 NOT STARTED; GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-20

PURPOSE: give a fresh agent the current canonical facts, authority boundaries, roadmap, and next gate without relying on chat memory.

## CURRENT CANONICAL STATE

Repository: `avaranda66-oss/catalog-builder-technical`.

Canonical `main` verified at the start of this durable closeout:

- SHA: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- direct parent: `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- commit: `test(vnext): prove W3 Father browser flow closeout (#38)`
- merge timestamp: `2026-09-20T14:27:11Z`
- post-merge Quality Gate: run `35516528303`, event `push`, branch `main`, exact head `00b78e6d582a2868e4b0447cb3dee2bf53732299`, **COMPLETED / SUCCESS**

Current roadmap state:

- **W0 — COMPLETE / CANONICAL**
- **W0.1 — COMPLETE / CANONICAL**
- **W1 — COMPLETE / CANONICAL**
- **W2 — COMPLETE / CANONICAL**
- **W3 — COMPLETE / CANONICAL**
- **W4 — NOT STARTED**
- **W5 — NOT STARTED**
- **W6 — NOT STARTED**
- **W7 — NOT STARTED**

The durable W3 closeout is **COMPLETE / CANONICAL**. W4 is the next implementation wave, but it is **NOT STARTED** and is not implicitly authorized. Before any W4 implementation, the Principal must reconstruct GitHub live, perform the W4 preflight, freeze the W4 scope/contract, and provide a separate implementation prompt. The canonical SHA, tree, and Quality Gate provenance of this durable closeout must be reconstructed from GitHub live; this document does not predict them.

Always reconstruct GitHub live before acting. GitHub commits, PR state, checks, and repository evidence outrank historical story status lines or agent reports.

## W3 CANONICAL LEDGER

All rows below were reconstructed from live merged PRs, canonical commits, repository stories, and exact-head `push` Quality Gate runs.

| Wave | Canonical purpose | PR | Canonical merge SHA | Canonical tree | Post-merge Quality Gate | Status |
| --- | --- | ---: | --- | --- | ---: | --- |
| W3.0 | Freeze the Save / Reopen / Catalog Library persistence contract | #28 | `b34156c597dcd47a5ab6d154f73ffa7a323d4664` | `0df4eedfcf649a10423a4a3153233ff6c424020f` | `34668097170` SUCCESS | COMPLETE / CANONICAL |
| W3.A | Pure persistence contracts and exact canonical round-trip | #29 | `4199108c2e4e0cd2d09a3ec02e2700528a373ff3` | `1fa5b5f0d6a53149c38c95c5f3282de79fa5ff35` | `34706862089` SUCCESS | COMPLETE / CANONICAL |
| W3.B | Supabase strict-CAS persistence, mutation replay, and immutable history | #31 | `a0bee489deff7af78e056463cf763f3ba4844105` | `8c87e59a32f3761d9d6d21a023e132e3b08a6f09` | `34723686552` SUCCESS | COMPLETE / CANONICAL |
| W3.C | Manual Save and canonical exact reopen | #32 | `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7` | `d08158a1c2f3e0e10c6812008e1356322815d81f` | `34730115210` SUCCESS | COMPLETE / CANONICAL |
| W3.D | Revision-aware local crash Recovery | #33 | `e37cdf3105626ce83763964f8d2a56a1fda1e01b` | `c7bf0865b9f51dd4ea624a196f08dec496aeed67` | `34844237602` SUCCESS | COMPLETE / CANONICAL |
| W3.E | Catalog Library, Blank creation, Rename, and Archive | #34 | `cd4d20fbdfd89d1896385317a46052f0239c9ac4` | `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d` | `34875954678` SUCCESS | COMPLETE / CANONICAL |
| W3.F | Registered Starter and Duplicate with complete identity closure | #35 | `266331618c5677e1079865f8d57e2d479a9601f1` | `a6f3df2125e697d2e5ebf855db194afcaf99d5a0` | `35020085786` SUCCESS | COMPLETE / CANONICAL |
| W3.G | Immutable AssetRef persistence bridge | #36 | `a44a710836ed8cbaba48dccd541614304e10cb8a` | `1bc573e061bb2a732751c8650ba86fc0d5c92835` | `35034657054` SUCCESS | COMPLETE / CANONICAL |
| W3.H | Debounced autosave and adversarial concurrency/conflict lifecycle | #37 | `ac2b45bd5fe6971c0f1885b88884102d01114b98` | `18dc40ce8856483d011a7f0d266f02c4a39ff347` | `35453791083` SUCCESS | COMPLETE / CANONICAL |
| W3.I | Father Browser Flow and W3 closeout | #38 | `00b78e6d582a2868e4b0447cb3dee2bf53732299` | `e198bc8c576a54537ad0b031743b53091ed0ed60` | `35516528303` SUCCESS | COMPLETE / CANONICAL |

The W3.B real-database rehearsal is separate evidence: PR #31 check `VNext W3.B real DB CAS/history proof`, run `34720465558`, completed **SUCCESS** on accepted PR head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.

## W3.I CANONICAL CLOSEOUT

PR #38, `test(vnext): prove W3 Father browser flow closeout`, is **MERGED / CLOSED**.

- accepted source head: `48ac1c11d09f4d1c73ad055dc9c2462b679f4d4c`
- accepted source tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical squash merge: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- canonical tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical parent: `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- merge timestamp: `2026-09-20T14:27:11Z`
- post-merge Quality Gate: `35516528303`, **COMPLETED / SUCCESS**

The accepted review tree and promoted canonical tree are identical. The one-use merge authorization for PR #38 was consumed by that merge and cannot be reused.

The W3.I story is a historical delivery snapshot written before publication. Its pre-merge status lines do not override the live canonical state above.

## WHAT W3 NOW GIVES THE PRODUCT

W3 canonically provides:

- whole-document persistence of one validated `CatalogDocument` snapshot;
- snapshot validation as the persistence authority, without a second normalized document model;
- strict optimistic concurrency / compare-and-swap;
- server-owned monotonic remote revision;
- mutation identity, replay safety, and ambiguous-write reconciliation;
- exact Manual Save and exact canonical reopen behavior;
- reopen with a new `openSessionId` and empty Undo/Redo history;
- revision-aware local Recovery that protects work without claiming remote Saved authority;
- Catalog Library with active/archived views;
- Blank creation;
- registered Starter creation;
- Duplicate with complete authored-identity closure and independent persistence lineage;
- immutable `AssetRef` persistence while asset bytes and runtime URLs remain outside the canonical document;
- debounced autosave through the same Save authority as Manual Save;
- an active-authoring-draft barrier that prevents remote save while a draft remains uncommitted;
- offline / retry lifecycle without false Saved state;
- deterministic two-session stale-write conflict behavior;
- `Abrir versão mais recente` / Open latest;
- `Salvar meu trabalho como cópia` / Save my work as copy;
- single-flight conflict resolution;
- Rename through canonical document title mutation;
- Archive with strict CAS and stale autosave fail-closed behavior;
- a Father-facing integrated browser-flow proof;
- Portuguese Father presentation labels for Save state while internal `SaveProjection` semantics remain unchanged;
- Recovery and conflict surfaces proved responsive at 320, 360, and 390 px, plus desktop sanity;
- protected Recovery preview actually mounted and proved through visible UI.

No persistence decision depends on translated labels.

## FROZEN W3 AUTHORITY BOUNDARIES

- `CatalogDocument` is the sole canonical authored-document model.
- Persistence stores one validated canonical snapshot plus thin persistence/lifecycle metadata. It is not a second normalized document model.
- `SupabaseCatalogRepository` is the production remote adapter.
- `SaveCoordinator` is the sole normal Save / strict-CAS authority.
- `AutosaveCoordinator` only schedules or flushes the same `SaveCoordinator`.
- `CanonicalReopenCoordinator` is the reopen authority.
- `PreparedCatalogCreateCoordinator` is the Create / pending-reconciliation authority.
- `ConflictResolutionCoordinator` is the conflict-resolution single-flight authority.
- `CatalogCloneService` is the complete authored-identity cloning authority.
- W3.D Recovery is local protection only and never remote Saved authority.
- `AssetPersistenceBridge` keeps asset bytes and runtime URLs outside `CatalogDocument`; the document contains immutable canonical `AssetRef`s.
- Strict CAS, server-owned revision, mutation identity, stale-result rejection, authority/open-session lineage, and archive fail-closed behavior remain canonical.
- Controlled fixtures and deterministic adapters are evidence tools, never product authorities.

## W3.I EVIDENCE BOUNDARY

Layer 1 is a **real production `/v2` bootstrap smoke**. It proves that VNext bootstrap is selected, Legacy bootstrap is not selected, and canonical W3 production seams are wired. It does not prove the complete Father journey against real Supabase.

Layer 2 is a **controlled Father browser integration**. It uses real React/UI interactions and canonical product coordinators/services with deterministic external repository timing, controlled strict CAS, IndexedDB Recovery, and deterministic asset dependencies.

The integrated flow covers:

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

W3.I does **not** claim a full real-production Supabase Father E2E or real cloud multi-tab Father execution. The W3.B real-database rehearsal remains the separate production-database proof.

## FROZEN A4 / EDITOR ARCHITECTURE

Canonical hierarchy:

```text
Catalog → Pages → Objects → Properties
```

Preserve:

- finite physical A4 pages;
- authored geometry in integer U and rendered/browser measurement in integer Q;
- one canonical render tree;
- one canonical Table Engine;
- stable IDs, typed content, explicit span ownership, deterministic measurement, and structured diagnostics;
- canonical primitives: Text, Image, Table, Shape, Line, Icon, Group;
- typed Application Actions as the mutation seam for human UI and future AI;
- user ownership of authored geometry, placement, and composition;
- no silent page creation, cross-page reflow, frame resizing, object relocation, or authored topology mutation.

`src/vnext/` is production authority. `src/labs/presys-editorial-proof/` and controlled proof fixtures are harnesses only and must not become a second engine.

## ROADMAP

- **W4 NEXT / NOT STARTED — Advanced Table Editor.** Direction may include spreadsheet-like row/column/range selection; add/remove rows and columns; merge/unmerge; grouped headers; section rows; titles/notes/footers/legends; TSV/spreadsheet paste; technical matrices; presets; marker-cell ergonomics; and explicit **Fit Height / Ajustar altura**.
- **W5 — Complete Translation VNext.** NOT STARTED.
- **W6 — Publication + Easy Button + First Father Pilot.** NOT STARTED.
- **W7 — evidence-driven maturation.** NOT STARTED.

W4 must extend the **one canonical Table Engine**. No Additel engine, Fluke engine, vendor-specific table engine, second renderer, or parallel table model is authorized. Complex technical tables are configurations/compositions of the generic engine. This closeout does not authorize W4 implementation.

## CURRENT ADVISORIES

Advisories are separate from canonical acceptance:

- Vercel on accepted PR #38 head: **SUCCESS**.
- Netlify: historical external failure pattern; not a required branch-protection context; no W3.I causal change demonstrated.
- dependency audit baseline at W3.I closeout: **2 critical, 1 high, 4 moderate**.
- PR #38 amendment/closeout changed no package manifest or lockfile.
- dependency modernization is not part of this docs closeout.

## HISTORICAL STATUS AND RECONSTRUCTION

Status/delivery lines in historical W3 stories and status/delivery preface text in the W3 persistence contract are point-in-time historical evidence. They do not override GitHub live or the current durable handoffs. The frozen architecture and contract content itself remains authoritative unless a later canonical contract supersedes it.

Recommended reconstruction order:

1. `docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md`
2. this file
3. `docs/vnext/PRINCIPAL-HANDOFF.md`
4. `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md`
5. W3 stories from `2026-09-11-vnext-w3-0-persistence-contract.md` through `2026-09-19-vnext-w3i-father-browser-flow-closeout.md`
6. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`
7. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`
8. the R0 proof package and current `src/vnext/` / proof ownership boundaries
