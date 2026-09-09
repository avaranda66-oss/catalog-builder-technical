# FOUNDATION-PROOF-01 — implementation and empirical verification

Status: Ready for Review

## Authority

User-authorized implementation, isolated from production, based exactly on frozen
documentation commit 65b524afbf75c99acbf87e8374dd91be92bb4ba7.
Contract: ../vnext/presys-mvp-r0/tasks/MVP-01-prova-editorial.md and D3/D4/D5.
Branch: vnext/foundation-proof-01. Stacked PR base:
docs/vnext-r0-1-principal-amendments. No merge, deployment or core promotion.

## Acceptance criteria

Implement the frozen model and deterministic U/Q geometry, one Grid renderer,
G01–G05, resource readiness, immutable preflight/stability, real Chromium PDF,
PDF.js operator forensics and PDF-derived visual inspection. Record counterexamples
without changing frozen decisions; Principal owns any promotion verdict.

## Tasks

- [x] Verify exact production/frozen SHAs, PR #12 open and isolated worktree.
- [x] RED tests; strict model, decimal arithmetic, columns, merges and row policies.
- [x] Single editorial tree, Grid projection, border paint, text flow and annotations.
- [x] G01–G05 and independent table frames.
- [x] Chromium matrix, resources, stability and authored-document immutability.
- [x] Native PDF, PDF.js forensics, PDF-derived PNG inspection and parity.
- [x] Rowspan counterexample/density investigation.
- [x] Focused and global gates; evidence and performance observations.
- [x] Commit, push and stacked PR; no merge/promotion/deploy.

## Dev Agent Record

Models: GPT-6 Astra for the original implementation/proof exercise; Sol High for recovery and the targeted R0.1.3 closure corrections.

### Debug log references

scratch/presys-editorial-proof/logs/

### Completion notes

Astra implemented and empirically exercised the proof and found two narrow architecture counterexamples: overlapping-rowspan artificial expansion/false practical overflow and a Q→U false overflow at projection equality. Sol High recovered the existing worktree and produced the targeted R0.1.3 implementation corrections without reopening the broader architecture.

Final local evidence: focused ESLint PASS; proof suite 62/62 PASS; `npx tsc --noEmit` PASS; Chromium/PDF runner PASS with 8/8 viewport/DPR/media combinations and 1478 normalized facts per run; 4-page PDF with 149278 bytes, 879 text items, one declared product-photo image paint, 1359 `constructPath`, and 1355 `fill`; global lint/typecheck/tests/build PASS except the known pre-existing out-of-scope `ConflictReviewModal.tsx` hook-order error in `lint:labs`.

### File list

- docs/stories/2026-09-09-foundation-proof-01.md
- docs/vnext/presys-mvp-r0/evidence/proof-result.md
- docs/vnext/presys-mvp-r0/07-estado-e-riscos.md
- src/labs/presys-editorial-proof/proof-layout.ts
- src/labs/presys-editorial-proof/proof-preflight.ts
- tests/vnext/proof/arithmetic-adversarial.test.ts
- tests/vnext/proof/export-proof.mjs
- tests/vnext/proof/geometry.test.ts

## Change log

2026-09-09: Created implementation story from the user-approved frozen packet.
2026-09-09: FOUNDATION-PROOF-01 empirically completed after the targeted R0.1.3 rowspan and Q/U boundary corrections; final local evidence recorded for Principal audit.
