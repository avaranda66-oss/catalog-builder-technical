# Institutional technical catalog — long-form acceptance

Date: 2026-10-09. Repo: `avaranda66-oss/catalog-builder-technical`.
This phase is stacked on Draft PR #69, itself stacked on Draft PR #68.
**No merge, commercial data modification, production deployment or paid Gemini call.**

## Scope and user task

Simulated request: "Crie um catálogo institucional extenso com tabelas técnicas."

The controlled flow now includes:

1. Upload validated original *synthetic* specifications (not arbitrary PDFs).
2. Compile a deterministic four-model comparison, preserving literal values, units, signs, decimal separators and per-cell source citations.
3. Select an allowlisted institutional template with an original PRESYS-style visual direction.
4. Produce a cover, section index, 24 technical pages and a sources/revision page.
5. Review/approve technical data, save, reopen from the isolated local Library and pass the existing publication preflight.
6. Issue "Deixe mais compacto", preview the actual changed padding, undo, redo, and ensure all technical content remains byte-for-byte the same.
7. Print through the existing verified action and export actual Chromium PDF with print CSS.
8. Compare PDF cell contents and physical positions against the DOM and original synthetic fixture.

## Verified scale

| Scope | Pages | PDF cells compared | Source-model values | Result |
| --- | ---: | ---: | ---: | --- |
| basic early capacity | 4 | 252 | 128 | PASS |
| basic 8-page | 8 | 504 | 256 | PASS |
| basic 16-page | 16 | 1,008 | 512 | PASS |
| basic max tested | 24 | 1,512 | 768 | PASS |
| institutional layout | 27 (24 + 3) | 1,512 | 768 | PASS |
| institutional after agent-like compact + undo/redo | 27 | 1,512 | 768 | PASS |
| **production bundle**, institutional plus compact/undo/redo | **27** | **1,512** | **768** | **PASS** |

Exact production PDF SHA256: `5a7ac8189d08539ad40a909a406feefb89b6da6703703481ccc32173d73f1266`.
Production PDF filesize: 116,107 bytes. PDF pages all ~210×297mm.
Production total cycle ~22 seconds on this workstation (not an SLA).
No missing, duplicate or displaced cells found; no preflight overflow, application console errors, or external requests.

Detailed proof artifacts (synthetic only):
`C:/Users/Usuario/.codex/worktrees/long-catalog-agent-20261009/catalog-builder/scratch/long-institutional-a4/12x16-premium/`

The report includes `institutional-24-pages-A4.pdf` (the filename is historical; **the PDF has 27 actual pages**), `result.json`, first/last screenshots, and PNGs rendered with PyMuPDF. The worktree's `scratch/` is excluded from Git. Exact bytes differ between browser print runs: rely on the current receipt's SHA.

## Negative and structural checks

- 193 source rows are rejected at the current 192-row cap rather than silently cut.
- Forged page quotation fails before composition.
- 24 pages / 768 source model positions / 1,512 total table cells are all checked in local Vitest.
- Existing PDF preflight and UI tests continue unchanged.
- The original 48-row cap was expanded to 192 only with a separately reviewable bounded new test.
- Maximum 16 source sections and an allowlisted institutional template; the model cannot supply freeform HTML/CSS, arbitrary commands or made-up technical numbers.
- The new workflow step requires production-bundle Chromium proof with 27 pages and attaches the PDF and receipt on the PR's exact HEAD.

## Independent visual assessment

The rendered cover, index, first technical page and final sources page were viewed.
Color, Noto Sans typography, tabular alignment, margins, footers and pagination are clean and consistent. This is stronger than merely asserting PDF bytes or successful print.

**However, it is NOT yet an Additel-equivalent commercial catalog**: the visual system presently lacks product photography, original technical diagrams, complex mixed editorial layouts, varying table hierarchies and captions, charts, custom cover visuals, multilingual page design and actual manufacturer-sourced facts. The long-form benchmark uses synthetic values, deliberately repetitive section labels, and controlled widths.

## Critical unresolved integration

- The *real* Gemini service is not enabled. Previous chat credential must be rotated and never reused.
- The gateway is disabled by default and has no durable aggregate per-user budget. The user's R$50 initial spending authority cannot be safely exercised before key rotation, an actual quota and sanitized acceptance.
- The local PDF reader can index native PDF text and source bytes, but does not yet construct a verified `TechnicalInput` from real manufacturer PDFs, interpret scanned tables, or certify technical meaning.
- Current VNext translation registered targets are pt-BR→es-ES and pt-BR→en-US; other target languages need separate profiles and quality gates.
- Cloud Library, role/tenant matrix, provider integration, failure injection, and uncoached Marc pilot are NOT verified for this new agent path.

## Release decision

**B — BOUNDED REMEDIATION REQUIRED.** Functional long-format PDF and deterministic command control demonstrated in the synthetic environment. Production Gemini-assisted document extraction/editing still pending. Draft PR only, no merge.

## Continuity

Branch: `codex/long-institutional-catalog-validation-20261009`
Worktree: `C:/Users/Usuario/.codex/worktrees/long-catalog-agent-20261009/catalog-builder`
Base HEAD from PR #69: `9df81b4d904feee0960d14ad0604ac6a43c7235a`.
Current branch SHA to be filled after commit and CI.
Source diff is tightly scoped: contracts, new template, planner/gateway allowlist, long fixtures, browser proof, CI gate and report.
No real reference PDF or secret may be committed.

Next exact: finish full suite, check typecheck/lint/build outputs, run exact-production-bundle script, commit/push into a separate stacked Draft PR, monitor exact-HEAD CI+artifacts, then start a new secure real-PDF extraction acceptance phase requiring an owner-provisioned fresh key in server secrets and a real aggregate budget.
