# Gemini catalog agent — bounded implementation checkpoint

2026-10-09. This branch is **stacked on Draft PR #68**, NOT on current main. No merge or deployment is authorized.

## Implemented in this isolated source branch

- A source-fact-free, typed presentation planner: natural-language intent plus model/section metadata -> strictly validated catalog plan or one clarification. Models cannot invent section identities, rewrite specifications, emit HTML, execute arbitrary tools, or directly mutate the canonical document.
- `GeminiPlannerChat` UI stages a reply and requires explicit acceptance before invoking `compileCatalog`; the mock provider remains the default behavior. Live mode is exposed only with `VITE_VNEXT_CATALOG_AGENT_ENABLED=true` and an existing Supabase client/session. A user must still sign in normally.
- `gemini-client.ts` calls a named authenticated Supabase Edge Function, never directly calls Google's API and never accepts a browser-supplied provider key.
- New independent `vnext-catalog-agent` Edge Function source is **disabled by default**. Requires server flags `VNEXT_CATALOG_AGENT_ENABLED=true` and `VNEXT_CATALOG_AGENT_BUDGET_MODE=bounded-acceptance`; JWT via Supabase getUser; active admin/editor profile; exact origin allowlist; strict JSON body/section set; model pinned to `gemini-3.5-flash-lite`; pre-request countTokens; 12k input / 512 output token caps; responseSchema and exact section validation; model cannot write documents.
- Native PDF local `pdfjs-dist` ingestion: byte-level SHA-256, page number, text-index and explicitly marked low-text pages; bounded page-aware context selection. No file contents are uploaded in this stage.
- 13 new focused tests: 7 contract, 2 UI, 4 PDF (including synthetic 41-page document); actual local reference PDFs Additel761A 6 pages, Additel875 8 pages, PRESYS manual 41 pages and PRESYS folder 20 pages read successfully, privately; one of the manual pages needs visual fallback.

## Important release blockers — NOT ready for employees or live Gemini

1. **Rotate the credential pasted into chat**. It must not be reused. Provision a replacement only through authenticated Supabase Edge secrets; never via chat, frontend, Git or logs.
2. **Set a dollar limit before paid calls**, and add a durable per-user/time-window quota with an atomic reservation/settlement design, rate limit, fraud prevention, and expense monitoring. Per-call countTokens prevents oversized *individual requests*, but **does not cap aggregate spend**. The gateway MUST NOT be deployed/enabled for production until this exists and is tested.
3. Read-only Edge function source is not tested in a real Supabase Edge runtime. Need a separate isolated end-to-end integration with authenticated admin/editor, viewer/inactive denial, expired JWT, origin and body negatives, provider timeouts and injected mocked Google responses. Existing translation Edge function is untouched.
4. PDF extraction here creates a discovery index, **not a certified technical fact extraction**. For each engineering datum require literal page-grounded quote or verified text+coordinates, original PDF byte hash, conflict/missing review, and readback before compiling. Scanned diagrams, images and dense table topology require a separately authorized vision pipeline.
5. The current `TechnicalInputSchema` only admits `original-synthetic-specifications`; do NOT relabel real PDFs as synthetic. Introduce a separately versioned real-document intake contract and deterministic provenance before any real PDF -> catalog claim.
6. Two earlier pending release lines: Draft PR #67 technical-table code (CI success, immutable URL human login pending) and Draft PR #68 deterministic AI prototype (its own CI pending). Do not merge or modify either without separate authorization.
7. Gemini planning and PDF reading are now separate foundations; **there is not yet a full live chat that converts arbitrary PDF requests into final catalogs**. Do not claim completed AI-agent acceptance or human usability.

## Cost model and minimization

Google AI Developer Standard Gemini 3.5 Flash-Lite prices, checked 2026-10-09: US$0.30 / 1M text input tokens and US$2.50 / 1M output tokens, including thinking output. These rates are subject to future change. Hard per-request maximum estimate at 12k input/512 output: US$0.00488; this does NOT include retries, other operations, caching storage, taxes, or cumulative budget. Actual model reports `usageMetadata`; compare against cap and ledger on the server. Do not rely on a client-side counter.

- Index source PDFs locally and send only selected page snippets once permission is granted; reuse short document hashes, not full PDF for every conversational turn.
- Prefer cheap deterministic transformations for table order, style presets, A4 layout, PDF proof and typography. AI is needed for extraction/semantic grouping or ambiguous natural language, not for each mouse click.
- Treat imported files and their text as **untrusted data**, never developer instructions.
- For the later real-document path, the Gemini Files API supports temporary uploads for reuse; files expire after 48h. Uploads and provider access have their own privacy/tenant/cost controls.
- For corporate documents, confirm acceptable provider data handling before transmitting; free-tier and paid-tier policy may differ.

Official documentation: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/document-processing

## Continuation plan

1. Land existing foundations in a **Draft stacked PR** on `codex/ai-first-catalog-prototype-20261009` after focused tests, TS, lint, build, and CI; do not merge.
2. Complete negative tests and role/tenant/budget design for Edge gateway with mocked provider, then request separate owner permission for deployment and a fresh budget.
3. Build page-grounded real-PDF structured extraction with text first, visual fallback and conflict review (no uncontrolled upload).
4. End-to-end simulated father dialogue against several original/synthetic complex catalogs; verify exact values + page layout + PDF re-open + translation workflows by approved existing translation service.
5. Authenticated owner pilot with a newly rotated secret and explicit budget, then actual Marc uncoached pilot. Only then consider employee release.

Continuity worktree: `C:/Users/Usuario/.codex/worktrees/gemini-catalog-agent-20261009/catalog-builder`.
