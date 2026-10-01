# W5.C — canonical publication review and translated PDF

Status: Ready for Review. Principal freeze: 2026-10-01, latest human Master Night Shift delegation. Local gates/proofs/adversarial audit PASS; exact-head CI and canonical promotion remain external gates.

Canonical base:49db0f976efa1c39be54a97dad83d67d85bdae80; treec04d3e6864e29d017dd9827c3459bbfe69161134; PR58 W5.B merged; push Quality Gate36818454508 attempt1 SUCCESS. W5.A assigns layout/publication/PDF/mobile/accessibility to W5.C. Actual VNext UI lacks publication despite an established renderer/readiness pipeline.

## Contract

Expose saved canonical catalog -> all-page publication review -> blocking layout/resource diagnostics -> explicit normal-editor correction -> verified native Chromium Print/Save as PDF. Translated copies retain Spanish content, protected technical tokens, geometry, immutable assets, distinct source identity and translation provenance. Source never changes during review/print. No business facts are invented.

Authorities: CatalogDocument/parseCanonicalDocument, DocumentRenderer/compilePlans, loadFonts/resolveAssets/decodeImages, measureTables/captureSnapshot/compareSnapshots/layoutReport, existing persistence binding/session/authority/authoring barrier. Native browser printing of the same render tree. No new renderer, document domain, backend or persistence authority.

Allowlist/file list below is frozen. Forbidden: domain/schema/table math/renderer changes; migrations/SQL/RLS; auth/Recovery/L1 redesign; new grants/public share; silent reflow/shrink/resize; destructive production operations; secrets/provider/dependency changes; unrelated Legacy/polish. Global print policy belongs to app, not generic renderer.

Saved current source only. Dirty/unbound/unresolved Save returns clear guidance. Every async boundary and print revalidates source/session/revision/authority; failed font/hash/decode/unstable/ERROR diagnostics block. Warnings remain visible. Print rechecks resources and snapshot. Only explicitly verified publication may print; Ctrl+P outside that path shows guidance. URL ownership cleaned on cancellation/unmount.

Translation review must keep focus after async generation, contain keyboard navigation, make editor background inert and restore connected trigger focus. Empirical390px bounds already fit; preserve baseline. Publication preview scrolls physical A4 without transform/zoom.

## Acceptance / evidence

- Production source -> Spanish review/copy -> authored overflow -> BLOCKED publication -> manual UI correction/save/reopen -> READY -> native print invocation/PDF.
- PDF two A4 pages, semantic Spanish text and technical values, Noto fonts, vector paint and legitimate image; no editor chrome or full-page raster.
- Source/authority drift, missing/bad resources and unstable layout fail closed; no authored mutation.
- Mobile390 and keyboard: contained/restored focus, inert background, reachable actions, fitting dialog, scrollable unscaled A4.
- Focused tests, lint/typecheck/full tests/build, full historical Chromium/PDF ladder, dedicated production proof, CodeRabbit and final adversarial review, exact-head PR Quality Gate SUCCESS.
- Conditional squash only with immutable exact target ledger and current matching live base; exact postmerge push SUCCESS before W6.
- Real matching browser/backend/provider acceptance may require manual shared login. Controlled CI is distinct; no credentials/cookies/tokens inspected/transferred. Factual/language and Father human acceptance remain pending.

## Tasks

- [x] Reconstruct live canonical base; freeze scope/prerequisites.
- [x] Compose canonical readiness and visible publication workflow.
- [x] Preserve async review focus/inert/restoration.
- [x] Prove failures, translation-to-PDF, mobile and keyboard.
- [x] Run full gates and audit; update accurate durable W5 roadmap.
- [ ] Exact-head promotion and canonical postmerge closeout (external immutable ledger).

## File list

- docs/stories/2026-10-01-vnext-w5c-publication-review.md
- docs/stories/2026-10-01-vnext-w5b-translation-review-copy.md
- docs/vnext/W5-CLOSEOUT.md
- docs/vnext/PROJECT-STATE.md
- docs/vnext/PRINCIPAL-HANDOFF.md
- docs/vnext/PRINCIPAL-AUDITOR-HANDOFF.md
- src/vnext/publication/review.ts
- src/vnext/app/PublicationReview.tsx
- src/vnext/app/review-dialog.ts
- src/vnext/app/TranslationReview.tsx
- src/vnext/app/VNextApp.tsx
- src/vnext/app/EditorWorkspace.tsx
- src/vnext/app/bootstrap.tsx
- src/vnext/app/styles.css
- tests/vnext/publication/publication-review.test.ts
- tests/vnext/publication/publication-dialog.test.tsx
- tests/vnext/translation/review-dialog.test.tsx
- tests/vnext/translation/translation-entry.test.tsx
- tests/vnext/proof/architecture-boundary.test.ts
- tests/vnext/proof/w5c-publication-review-proof.mjs
- .github/workflows/quality-gates.yml

## Dev record

Resumed the original worktree/diff at exact canonical base; no reset/recreation. Focused translation/publication/architecture checks and the integrated production Chromium/PDF journey passed. UI adds publication through the existing authoring barrier; readiness composes the canonical parser/renderer/font/asset/measurement/layout pipeline. Source/session/revision/access/save state are rechecked at async boundaries and before native print. Resources released on unmount/cancellation; closing during final verification cannot print. Diagnostics identify page/object and table cell row/column. Review generation preserves focus, keyboard tab wrapping, editor inert isolation and trigger restoration.

Dedicated proof: source/create/edit/table/save/Library reopen → translate/review/correct/distinct copy/provenance → authored text overflow → all-page BLOCKED → normal UI correction/save/Library reopen → READY → native print invocation → two A4 pages with semantic Spanish text, unchanged technical tokens, embedded Noto regular/bold fonts, one legitimate product image and vector paths. 390px dialogs/actions and unscaled physical A4 scrolling passed. Source remained unchanged; four error collectors empty. PDF pages rendered with bundled PDFium and visually inspected without clipping. Bundled Poppler wrapper was unavailable; no dependency changed. Controlled provider only, not linguistic/factual/real-backend acceptance; remote Desktop Commander was offline.

Classifications/fixes: TEST DEFECT — cancellation fixture reused IDs; corrected allocator without reducing assertions. TEST DEFECT — new proof selector/newline-generation mismatch; corrected exact selectors and LF generation. PRODUCT DEFECT — global print policy blocked existing runtime-only proof printing; policy now attaches only when production publication source is configured. PROOF SYNCHRONIZATION — intentional post-review unsaved adversarial mutation correctly exposed existing protected Recovery on later navigation; isolated the subsequent stale-provider scenario in a fresh context, preserving its assertions and all historical proofs. No timeout increased or historical assertion weakened. New hook warnings resolved; lint remains baseline 268 warnings, zero errors.

Final local validation: lint/typecheck/build PASS; full suite 287 files, 3070 passed, 1 skipped, 0 failed. All 28 registered historical Chromium/PDF proofs PASS, with the unchanged Text proof rerun after the product print-policy correction; existing L1 proof also rerun PASS after portal boundary completion. Dedicated W5.C Chromium/PDF proof PASS, including exact PDF technical tokens, keyboard preview scrolling, stale review and immediate hidden/inert/revoked-print portal on authority loss. Source and copy remain separate; provenance survives reopen; no renderer/document/persistence authority added. All 20 Master adversarial items reviewed against focused/full/browser/architecture evidence, with no unresolved introduced HIGH/CRITICAL.

CodeRabbit: original isolated Linux snapshot audit identified keyboard preview focus and authority-loss portal visibility. Both verified and fixed within the existing app boundary. Final fresh 20-file review completed with zero findings. Audit artifacts live outside the product worktree under `.codex/tmp/w5c-audit-20261001`; no secrets or generated logs included. The attempted secondary subagent audit was unavailable due model capacity; final audit combines CodeRabbit and Principal verification and does not claim a completed subagent review.

Following slice: coherent W6 Father path/first controlled pilot; sharing requiring schema/RLS remains a separate human authorization boundary. Exact promotion IDs are recorded externally after they exist.
