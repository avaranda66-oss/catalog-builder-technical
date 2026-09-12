# Catalog Builder VNext — Principal / Auditor Executive Handoff

STATUS: W2 COMPLETE / CANONICAL; W3.0 CONTRACT CANONICAL; W3.A IMPLEMENTED / UNDER REVIEW / NOT CANONICAL; W3.B NOT STARTED; GITHUB IS LIVE-STATE AUTHORITY

DATE: 2026-09-11

PURPOSE: this is the **first executive reconstruction document** for a fresh Principal/Auditor. Read it before the longer project state and handoff documents, then verify live GitHub before acting.

Repository: `avaranda66-oss/catalog-builder-technical`.

W2 implementation closeout: PR #26 is merged. Accepted W2.G review head/tree: `f827d660b9f63548830b15477f843727dd9a70e2` / `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`. Canonical squash SHA/tree: `3810b4c70b9415f43c7cb0360d6525b5a1823c22` / `c4f4b8e25aa2be6b358afd042e7010a7b37ce43a`, direct parent `2d24935b507a240b11165d2e9357f1975cf389ba`. The canonical merge tree exactly equals the audited review tree. Post-merge required Quality Gate run `34642762581` completed **SUCCESS**.

Durable W2 closeout: PR #27 is merged at canonical `main` SHA `6321155d0b88e52758cfb7138070c036845c359b`, tree `29b5964878914828778c2125cd177b81b068af17`, direct parent `3810b4c70b9415f43c7cb0360d6525b5a1823c22`. Post-closeout Quality Gate run `34649885701` completed **SUCCESS**.

## A. PRODUCT MISSION / FATHER NORTH STAR

Catalog Builder VNext / PRESYS is a professional technical-catalog authoring platform.

The primary acceptance persona is the user's father, a non-developer professional at PRESYS. Father V1 must let him:

- create a catalog;
- start from blank, starter, or template;
- add, duplicate, and reorder pages;
- edit text directly;
- insert and replace images;
- create and edit advanced technical tables;
- use grouped headers and section rows;
- add titles, notes, and footnotes;
- move and resize authored objects;
- use Undo/Redo;
- see diagnostics;
- save;
- close;
- reopen;
- recover;
- translate to Spanish;
- review translation and layout issues;
- publish a professional PDF;
- access and share the result.

The roadmap must remain connected to this end-to-end office-user workflow. Technical waves are only valuable when they advance Father V1.

## B. EDITORIAL CAPABILITY TARGET

Reference capability evidence includes:

- Additel 875;
- Additel 761A;
- Fluke 9140 / 9142 / 9143 / 9144;
- Isotech Europa / Venus / Calisto.

The target is equivalent professional technical-catalog capability and complexity using PRESYS content and identity.

Never copy competitor branding, claims, specifications, or visual identity. Never introduce vendor-specific engines merely to reproduce a reference page.

## C. FROZEN ARCHITECTURE

Canonical hierarchy:

```text
Catalog
→ Pages
→ Objects
→ Properties
```

Pages are finite physical A4 surfaces.

Canonical primitives:

- Text;
- Image;
- Table;
- Shape;
- Line;
- Icon;
- Group.

There is one canonical Table Engine.

Authored geometry uses integer U. Rendered/browser measurement uses integer Q. There is one canonical render tree.

The user owns authored geometry, placement, and composition. The system supplies snapping, guides, diagnostics, and preflight.

The system must not silently:

- move authored objects to another page;
- create continuation pages;
- mutate authored frames;
- restructure authored document topology.

## D. PRODUCTION BOUNDARIES

`src/vnext/index.ts` is pure domain/table public authority.

`src/vnext/rendering` owns rendering, browser measurement, and render resources.

`src/vnext/publication` owns publication/preflight.

Editor chrome never becomes publication authority.

`src/labs/presys-editorial-proof` is a proof/browser/PDF harness only. It is not a second production engine.

## E. COMPLETED WAVES

- **W0 — Foundation Promotion:** complete/canonical. Promoted the proven finite-A4, U/Q, deterministic table/layout, render-tree, preflight, and Chromium PDF foundation.
- **W0.1 — Production Boundary Hardening:** complete/canonical. Locked root API purity, rendering/publication layering, scoped renderer CSS, and publication authority boundaries.
- **W1 — Application Actions + Minimal VNext Shell:** complete/canonical. Established typed mutation actions, predictable session/history semantics, and the human/future-AI action seam.
- **W2.0 — A4 Authoring Contract:** complete/canonical contract.
- **W2.A — Primitives + Publication-Safe Rendering:** complete/canonical.
- **W2.B — Object Application Actions:** complete/canonical.
- **W2.C — Selection + Direct Move/Resize:** complete/canonical.
- **W2.D — Snapping + Guides + Authoring Diagnostics:** complete/canonical.
- **W2.E — Page Template Insertion Seam:** complete/canonical.
- **W2.F — Canonical Group:** complete/canonical.
- **W2.G — Minimum Direct Text Editing:** implemented, independently audited, Principal accepted, merged, canonical via PR #26.

Do not reproduce every historical story here. Detailed durable evidence lives in `docs/vnext/PROJECT-STATE.md`, `docs/vnext/PRINCIPAL-HANDOFF.md`, `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`, the R0 proof package, and the W0-W2 stories under `docs/stories/`.

## F. CURRENT ROADMAP

- **W3 — Save/Reopen/Catalog Library:** independent research complete; Principal research verdict **A — W3 RESEARCH ACCEPTED**; W3.0 contract canonical via PR #28; W3.A implemented / under review / not canonical; W3.B not started.
- **W4 — Advanced Table Editor.**
- **W5 — Complete Translation VNext.**
- **W6 — Publication Integration + Minimum Easy Button Layer + First Father Pilot.**
- **W7 — Evidence-driven maturation.**

After Father V1 stabilizes, richer automation and autonomous AI catalog authoring may be pursued as future work.

## G. PROACTIVE PRINCIPAL CONTINUITY

The Principal is responsible not only for auditing state but for proactively orchestrating the next project step.

After each report, audit, amendment, PR, CI result, merge, canonical closeout, research wave, or implementation wave, the Principal must:

1. reconstruct live GitHub state;
2. issue a Principal decision;
3. identify the next acting agent;
4. provide the user a complete copy-paste prompt for that agent;
5. define the evidence that must return;
6. define the following gate.

Do not force the product owner to manually reconstruct the technical workflow between agents.

Agent routing:

- **Codex Native2** — implementation/execution: code, tests, proofs, docs, branch, commit, push, PR creation/update, CI remediation;
- **Gemini** — independent adversarial audit/research: read-only architectural research, counterexamples, audits, amendment re-audits, pre-wave investigation;
- **Principal** — architecture, contracts, confrontation, gates, roadmap, orchestration, and next-agent prompts;
- **User** — exclusive explicit merge authorization.

Never merge without explicit user authorization. One authorization applies only to one PR and is consumed once.

If an audited or Principal-accepted PR head changes, the prior acceptance does not automatically apply to the new head. The new exact head/tree must be reverified, and re-audited when required, before promotion.

No next implementation wave begins before the previous canonical gate is complete, unless the Principal explicitly documents a justified exception.

## H. AI-READY AUTHORING INVARIANT

Every meaningful editorial capability added in W3-W6 should, whenever reasonably possible, expose domain/Application Action or structured service authority independent from React/UI mechanics.

Target architecture:

```text
Human UI ─┐
          ├─> Typed Application Actions / structured commands
Future AI ┘
                         ↓
                 Canonical Document
                         ↓
              renderer / diagnostics
                         ↓
                    publication
```

Future AI must not require:

- DOM manipulation as canonical authority;
- arbitrary whole-document JSON replacement;
- a second document model;
- a second renderer;
- AI-only mutation semantics.

The long-term goal is that Gemini/OpenAI/future agents can build professional PRESYS catalogs by invoking the same validated operations as a human.

Examples include:

- create catalog;
- insert page/template;
- edit Text;
- insert/replace Image;
- populate Table;
- merge;
- apply preset/component;
- move/resize;
- run diagnostics;
- translate;
- publish.

Autonomous AI authoring is **FUTURE**. It is not implemented and must not become a prerequisite for Father V1.

## I. FUTURE AI IMAGE GENERATION PRINCIPLE

This is **FUTURE** architecture only.

AI-generated images and backgrounds may later enter VNext as ordinary Assets with provenance.

Technical catalog copy, model names, measurements, tables, claims, and other editable information remain canonical document content.

Preferred composition:

```text
generated visual asset
+
canonical editable Text / Table / other primitives
```

Avoid embedding authoritative technical copy as rasterized AI-image text.

## J. TRANSLATION LEGACY SALVAGE PRINCIPLE

Legacy translation machinery is explicitly high-value salvage for W5.

Potential salvage includes:

- provider gateway;
- `TechnicalTokenProtector`;
- translation memory/cache;
- language registry;
- font/multiscript support;
- strict response validation;
- chunking/retry/cancel concepts;
- coverage auditing;
- layout QA;
- review workflow.

Legacy block-specific extractors/appliers must not become VNext authority. W5 must adapt translation to canonical VNext semantic text leaves.

Every printable/editable textual leaf must have stable identity and an explicit policy such as:

- `translate`;
- `protect`;
- `system`.

Source edits make affected localized leaves **STALE**. Existing translations must not be silently overwritten.

Translation-driven growth produces diagnostics and explicit corrective actions. It must not silently mutate authored geometry or topology.

Spanish remains the first Father-Pilot translation target.

VNext translation is not implemented here. W5 has not started.

## K. EASY BUTTON LAYER

Preserve these equivalences:

```text
Preset != Engine
Template != Renderer
Component != Special Engine
```

Minimum Father Pilot easy-button layer:

- table presets;
- page templates;
- catalog starter;
- reusable Components / Blocos;
- contextual commands.

These must materialize ordinary canonical editable primitives. They are also natural future AI tools because the same typed operations can be invoked by a human UI or a future agent.

## L. NEXT EXACT ACTION

Independent W3 repository research is **COMPLETE** and the Principal research verdict is **A — W3 RESEARCH ACCEPTED**.

The W3.0 docs/governance contract freeze in `docs/vnext/W3-SAVE-REOPEN-CATALOG-LIBRARY-CONTRACT.md` is **CANONICAL** through merged PR #28 at `main` SHA/tree `b34156c597dcd47a5ab6d154f73ffa7a323d4664` / `0df4eedfcf649a10423a4a3153233ff6c424020f`; Quality Gate run `34668097170` completed **SUCCESS**. W3.A is **IMPLEMENTED / UNDER REVIEW / NOT CANONICAL** and W3.B is **NOT STARTED**.

Next exact action: Principal audits the exact W3.A implementation PR head/tree and CI against the canonical W3.0 contract and W0-W2 architecture. Do not begin W3.B and do not merge W3.A without explicit user authorization.

For a fresh reconstruction, read next:

1. `docs/vnext/PROJECT-STATE.md`;
2. `docs/vnext/PRINCIPAL-HANDOFF.md`;
3. `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`;
4. `docs/vnext/W2-A4-AUTHORING-CONTRACT.md`;
5. the current W2.G story and the foundation proof documents referenced by those handoffs.
