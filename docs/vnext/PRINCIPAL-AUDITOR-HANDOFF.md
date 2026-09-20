# Catalog Builder VNext — Principal / Auditor Executive Handoff

**W3 COMPLETE / CANONICAL**

**W4 NOT STARTED**

**GITHUB LIVE IS AUTHORITY**

DATE: 2026-09-20

PURPOSE: first-read reconstruction for a completely fresh Principal/Auditor. Verify GitHub live before acting, then use `PROJECT-STATE.md` and `PRINCIPAL-HANDOFF.md` for detail.

## 1. LIVE CANONICAL STATE

Repository: `avaranda66-oss/catalog-builder-technical`.

Canonical `main` at the start of this durable closeout:

- SHA `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- tree `e198bc8c576a54537ad0b031743b53091ed0ed60`
- direct parent `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- merged `2026-09-20T14:27:11Z`
- post-merge Quality Gate `35516528303`: exact-head `push` on `main`, **COMPLETED / SUCCESS**

Wave state:

- W0 — COMPLETE / CANONICAL
- W0.1 — COMPLETE / CANONICAL
- W1 — COMPLETE / CANONICAL
- W2 — COMPLETE / CANONICAL
- W3 — COMPLETE / CANONICAL
- W4 — NOT STARTED
- W5 — NOT STARTED
- W6 — NOT STARTED
- W7 — NOT STARTED

No next implementation wave starts before the durable W3 closeout docs PR is canonical. The current gate is the single docs/governance-only PR from `docs/vnext-w3-canonical-closeout`; it must pass exact-head CI, be audited on that exact head/tree, and must not merge without explicit user authorization.

## 2. W3 CANONICAL LEDGER

| Wave | Purpose | PR | Canonical merge SHA | Tree | Post-merge gate |
| --- | --- | ---: | --- | --- | ---: |
| W3.0 | Persistence contract freeze | #28 | `b34156c597dcd47a5ab6d154f73ffa7a323d4664` | `0df4eedfcf649a10423a4a3153233ff6c424020f` | `34668097170` SUCCESS |
| W3.A | Persistence contracts + exact round-trip | #29 | `4199108c2e4e0cd2d09a3ec02e2700528a373ff3` | `1fa5b5f0d6a53149c38c95c5f3282de79fa5ff35` | `34706862089` SUCCESS |
| W3.B | Supabase strict CAS + immutable history | #31 | `a0bee489deff7af78e056463cf763f3ba4844105` | `8c87e59a32f3761d9d6d21a023e132e3b08a6f09` | `34723686552` SUCCESS |
| W3.C | Manual Save + canonical reopen | #32 | `296eed6cf66c529ea5ee53c1a1a65bee4878a7b7` | `d08158a1c2f3e0e10c6812008e1356322815d81f` | `34730115210` SUCCESS |
| W3.D | Local revision-aware Recovery | #33 | `e37cdf3105626ce83763964f8d2a56a1fda1e01b` | `c7bf0865b9f51dd4ea624a196f08dec496aeed67` | `34844237602` SUCCESS |
| W3.E | Catalog Library | #34 | `cd4d20fbdfd89b6385317a46052f0239c9ac4` | `fa95ce03a7c4726e0e4bd7c9af6dedcb08610f8d` | `34875954678` SUCCESS |
| W3.F | Starter / Duplicate identity closure | #35 | `266331618c5677e1079865f8d57e2d479a9601f1` | `a6f3df2125e697d2e5ebf855db194afcaf99d5a0` | `35020085786` SUCCESS |
| W3.G | Asset Persistence Bridge | #36 | `a44a710836ed8cbaba48dccd541614304e10cb8a` | `1bc573e061bb2a732751c8650ba86fc0d5c92835` | `35034657054` SUCCESS |
| W3.H | Autosave / adversarial concurrency | #37 | `ac2b45bd5fe6971c0f1885b88884102d01114b98` | `18dc40ce8856483d011a7f0d266f02c4a39ff347` | `35453791083` SUCCESS |
| W3.I | Father Browser Flow / W3 closeout | #38 | `00b78e6d582a2868e4b0447cb3dee2bf53732299` | `e198bc8c576a54537ad0b031743b53091ed0ed60` | `35516528303` SUCCESS |

Every row is **COMPLETE / CANONICAL**. Historical story statuses written before each merge are not current-state authority.

## 3. W3.I EXACT CLOSEOUT

PR #38: `test(vnext): prove W3 Father browser flow closeout` — **MERGED / CLOSED**.

- accepted source head: `48ac1c11d09f4d1c73ad055dc9c2462b679f4d4c`
- accepted source tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical squash merge: `00b78e6d582a2868e4b0447cb3dee2bf53732299`
- canonical tree: `e198bc8c576a54537ad0b031743b53091ed0ed60`
- canonical parent: `ac2b45bd5fe6971c0f1885b88884102d01114b98`
- merge timestamp: `2026-09-20T14:27:11Z`
- post-merge Quality Gate: run `35516528303`, **COMPLETED / SUCCESS**

The accepted review tree and promoted canonical tree are identical. The one-use merge authorization for PR #38 was consumed and cannot be reused.

## 4. FATHER NORTH STAR

The primary acceptance persona is the user's father, a non-developer PRESYS office user. Father V1 must let him create, edit, save, reopen, recover, translate, publish, and share a professional technical catalog without developer help.

W3 closes the persistence portion of that path: Library, Blank/Starter/create, visible authoring, active-draft barrier, autosave, durable asset, exact reopen, Duplicate independence, local Recovery, strict-CAS conflict, Open latest, second conflict, Save as copy, Rename, Archive, and stale-autosave protection.

Father-facing Save state is Portuguese. Internal `SaveProjection` semantics remain unchanged, and persistence logic does not depend on translated labels. The protected Recovery preview is mounted and proved. Recovery/conflict evidence covers 320, 360, and 390 px plus desktop sanity.

## 5. FROZEN ARCHITECTURE

Canonical hierarchy: `Catalog → Pages → Objects → Properties`.

Preserve finite A4 pages, integer-U authored geometry, integer-Q browser measurement, one canonical render tree, typed Application Actions, and the canonical primitives Text, Image, Table, Shape, Line, Icon, and Group. The user owns authored geometry and composition; the system provides guides, diagnostics, and preflight without silent geometry or topology mutation.

There is **one canonical Table Engine**.

W3 authority boundaries:

- `CatalogDocument` is the sole authored-document model.
- Persistence stores one validated whole-document snapshot, not a normalized parallel domain.
- `SupabaseCatalogRepository` is the production remote adapter.
- `SaveCoordinator` is the sole normal Save / strict-CAS authority.
- `AutosaveCoordinator` schedules/flushes that same authority.
- `CanonicalReopenCoordinator` owns reopen.
- `PreparedCatalogCreateCoordinator` owns Create / pending reconciliation.
- `ConflictResolutionCoordinator` owns conflict-resolution single-flight.
- `CatalogCloneService` owns complete authored-identity cloning.
- W3.D Recovery is local protection only, never remote Saved authority.
- `AssetPersistenceBridge` keeps bytes/runtime URLs outside `CatalogDocument`.
- strict CAS, server-owned monotonic revision, mutation identity, ambiguous-write reconciliation, stale-result rejection, and archive fail-closed behavior remain canonical.

Controlled fixtures are proof tools, not product authorities.

## 6. EVIDENCE BOUNDARY

Layer 1 is a real production `/v2` bootstrap smoke. It proves VNext bootstrap selected, Legacy bootstrap not selected, and canonical W3 production seams wired.

Layer 2 is controlled Father browser integration using real React/UI and canonical coordinators/services with deterministic external repository timing, controlled strict CAS, IndexedDB Recovery, and deterministic asset dependencies.

W3.I does **not** claim full real-production Supabase Father E2E or real cloud multi-tab Father execution.

W3.B real-database evidence remains separate: PR #31 check `VNext W3.B real DB CAS/history proof`, run `34720465558`, **SUCCESS** on accepted head `b2f61305fca125fbc760e588d5b98bf9a9d8f2ae`.

## 7. AI / TRANSLATION / EASY BUTTON INVARIANTS

Human UI and future AI must invoke the same typed actions/structured services over the canonical document. Future AI must not require DOM authority, arbitrary whole-document replacement, a second document model, a second renderer, or AI-only mutation semantics. Autonomous AI authoring remains future work.

W5 should salvage valuable Legacy translation concepts—provider gateway, token protection, memory/cache, language/font support, strict validation, retries, coverage, layout QA, review—but must target canonical VNext semantic text leaves. Legacy block models do not become authority. W5 has not started.

Easy Button invariants:

```text
Preset != Engine
Template != Renderer
Component != Special Engine
```

Presets, templates, Starters, Components / `Blocos`, and contextual commands must materialize ordinary editable canonical primitives.

## 8. CURRENT ROADMAP AND W4 BOUNDARY

- **W3 — COMPLETE / CANONICAL**
- **W4 — NEXT / NOT STARTED: Advanced Table Editor**
- **W5 — Complete Translation VNext**
- **W6 — Publication + Easy Button + First Father Pilot**
- **W7 — evidence-driven maturation**

W4 direction may include spreadsheet-like row/column/range selection; add/remove rows and columns; merge/unmerge; grouped headers; section rows; titles/notes/footers/legends; TSV/spreadsheet paste; technical matrices; presets; marker-cell ergonomics; and explicit **Fit Height / Ajustar altura**.

W4 is advanced Table **authoring UX**, not a second table engine. No Additel engine, Fluke engine, vendor-specific table engine, parallel table domain, or second renderer. Complex technical catalog tables remain configurations/compositions of the one canonical generic Table Engine.

This docs closeout does not design or authorize W4 implementation.

## 9. GOVERNANCE AND NEXT GATE

The user is the exclusive merge authority. One explicit authorization applies to one named PR and is consumed once. If a PR head changes, prior exact-head audit and CI do not transfer automatically.

The Principal must proactively reconstruct live state, decide the gate, name the next actor, provide the complete execution prompt, define required return evidence, and define the following gate.

Next exact action: finish the single docs/governance-only durable closeout PR from `docs/vnext-w3-canonical-closeout`, require exact-head Quality Gate **COMPLETED / SUCCESS**, audit its exact head/tree and three-file allowlist, and do not merge without explicit user authorization. Only after that PR becomes canonical is W4 the next implementation wave.

## 10. ADVISORIES

- Vercel on accepted W3.I head: **SUCCESS**.
- Netlify: historical external failure pattern; not a required branch-protection context; no W3.I causal change demonstrated.
- dependency audit baseline: **2 critical, 1 high, 4 moderate**.
- W3.I amendment/closeout changed no package manifest or lockfile.
- these advisories do not change W3 canonical acceptance and do not authorize dependency modernization here.
