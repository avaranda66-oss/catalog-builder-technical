# Local PDF intake and source-grounded facts

2026-10-09: stacked on draft PR #70; branch codex/real-pdf-grounding-20261009.

## Delivered
- Experimental Criar com IA upload: up to five PDF files, entirely local page text index and actual PDF-byte hash. Reports pages requiring visual review. No provider call, upload, catalog mutation or implicit generation.
- Browser PDF.js now loads a Vite-bundled pdf.worker asset. This fixes a real Chromium upload failure.
- Real PDF-grounded technical source schema is distinct from synthetic fixtures, requires the PDF original-byte hash and page quote including model, label, exact literal value and unit.
- Fail closed for unknown PDF source/page, forged quote, swapped model, rounding, malformed PDFs, and missing source citation. Saved catalog real-byte reauthentication not yet implemented.
- Controlled original locally generated PDF files with six literal technical values compile to canonical CatalogDocument and approval digest.

## Evidence
- Local focused Vitest: 4 suites / 39 tests PASS.
- Browser upload 2 original generated PDFs (2 and 3 pages), byte-hash and page summaries PASS, malformed PDF rejection PASS, zero external requests. See scratch/real-pdf-local-index/result.json (not in Git).
- TypeScript PASS, ESLint PASS 0 errors (268 tracked warnings), production Vite build PASS.
- Real Gemini calls = ZERO; test budget R$50 initially authorized but not used.

## Release blockers
- This is not a fully automatic PDF table extractor: no 2D layout/bbox association, OCR or scan handling. Ambiguous manufacturer tables must be verified visually/human reviewed.
- UI can index PDFs but does NOT offer an automatic Gemini-created catalog from them. Grounded extraction boundary is an internal API for reviewed proposals, not an end-to-end flow.
- Existing production cloud Library/roles, real provider gateway, saved source PDF revalidation, failure recovery and uncoached Marc pilot not proven.
- Parent draft PR #70 CI 38013731979 FAILED on Linux: new 27-page proof waited 120s for publication READY after compact/undo/redo, despite local Windows passing. Must diagnose and retain original preflight assertion; no merge.
- Exposed old API key must be revoked and rotated. Server-only secret and persistent atomic spending quota needed before real calls.

## Next precise mission
1. Add exact-HEAD GitHub CI proof for browser worker + native local PDF read, no external provider.
2. Diagnose parent CI publication READY stall with preflight diagnostics on its original branch.
3. Create source-page/bbox evidence + multimodal table review with defensive validation, no hallucinated values.
4. Add agent tool plans for existing cloud catalogs (revision fences, user confirmation, atomic undo/redo).
5. Pilot full workflow with owner-authorized materials in preview; no production deployment, migrations, secrets, paid Gemini calls or merge in this stage.
