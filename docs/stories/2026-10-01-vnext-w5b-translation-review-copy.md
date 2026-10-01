# W5.B — Review and persist a translated catalog copy

Status: Done / Canonical — PR #58, main `49db0f976efa1c39be54a97dad83d67d85bdae80`, post-merge Quality Gates `36818454508` attempt 1 SUCCESS (revalidated 2026-10-01).

## Principal contract

Base: 8cdd1e66ccc1d7cc5829cd47c184f97ed7675cc1; tree bad84702bbb47909e659c1ca8617cf0b2c0b98a5. C.1 canonical gate 36811810354 attempt 2 is SUCCESS. This bounded contract is frozen under the user's MASTER CODEX NIGHT SHIFT sections 6–11 and 28. W5.A story assigns candidate/review/copy/provenance; W3 already provides clone, whole-document CREATE/verified ACK, source origin metadata and CAS/reopen. No business facts are required.

Purpose: a saved Portuguese catalog can generate a Spanish translation, review/correct or reject it, and explicitly save/open a separate canonical copy. Source is never mutated. Preserve RichText topology/marks/IDs during candidate assembly; allocate fresh structural IDs only through CatalogCloneService at copy creation. Preserve geometry/style/immutable assets and excluded typed content. Provenance uses existing originKind=translation, originId=source catalog, originRevision=source revision; copy locale records es-ES. No schema extension or speculative Translation Memory.

Entry requires a saved persisted pt-BR source with no pending authoring draft. Generation/review are ephemeral. Full source identity/content and authority are checked at async boundaries and before dispatch; remote source revision/content is verified before copy creation. Corrections cannot remove/change protected technical tokens or introduce HTML/placeholder output. Reject/cancel before dispatch creates nothing. Ambiguous CREATE retains the same prepared document/mutation, reconciles before retry, blocks new generation/cancellation, and never duplicates a logical copy. Verified success offers explicit open; source and copy remain distinct. Layout review is explicitly required; diagnostics and publication remain unchanged for W5.C.

## Acceptance

- B01: Discoverable Translate action in production VNext; Spanish target, saved-source guidance and bounded visible failures.
- B02: W5.A validated result covers every current eligible leaf/run; wrong/duplicate/missing locator/hash/run fails closed.
- B03: Candidate preserves source RichText structure, marks, breaks, lists, geometry/style/assets/typed exclusions; source byte-equivalent.
- B04: Review shows source and editable translated runs; corrections preserve technical tokens; cancel/reject writes nothing.
- B05: Source edits/replacement, remote revision drift, dirty drafts or authority change reject stale generation/materialization.
- B06: Explicit copy uses canonical clone IDs and W3 verified CREATE; existing origin metadata survives save/reopen; no parallel persistence engine.
- B07: Concurrent/double acceptance and ambiguous ACK retry create one logical copy; pending work cannot be replaced/cancelled silently.
- B08: Production bootstrap/UI controlled Chromium journey proves generate/review/correct/create/open/edit/save/reopen, source unchanged, tokens/assets/geometry, provenance and four empty error collectors.
- B09: Lint/typecheck/full tests/build, historical proofs, dedicated Chromium, exact-head CI and adversarial audit pass. Conditional squash requires all section 11 conditions, matching live base and recorded immutable IDs; post-merge push gate must succeed before W5.C.

## Allowlist / non-goals

Allowlist: src/vnext/translation/candidate.ts, review-coordinator.ts; src/vnext/app/TranslationReview.tsx, VNextApp.tsx, EditorWorkspace.tsx, bootstrap.tsx, styles.css; focused tests under tests/vnext/translation and app; dedicated tests/vnext/proof/w5b-translation-review-copy-proof.mjs; this story; one proof registration in .github/workflows/quality-gates.yml. Supporting architecture regression assertions may be added in existing architecture tests if necessary.

Forbidden: backend/functions/migrations/SQL/RLS, auth/Recovery/L1/CAS redesign, provider credentials/client BYOK, Legacy authority, renderer/measurement/engine changes, dependency upgrades, factual/source/image changes, production data deletion. W5.C PDF/layout integrated closeout follows after canonical W5.B. Existing controlled provider is deterministic CI authority; real provider/backend acceptance is attempted only in an already-authorized safe environment and otherwise reported pending.

## Tasks

- [x] Implement canonical candidate and review/copy coordination.
- [x] Expose production translation/review/copy UI and gateway composition.
- [x] Prove focused invariants and controlled production Chromium journey.
- [x] Pass full gates and unchanged historical proofs.
- [x] Adversarial audit, exact-head CI, conditional promotion and canonical gate.

## File List

- src/vnext/translation/candidate.ts
- src/vnext/translation/review-coordinator.ts
- src/vnext/app/TranslationReview.tsx
- src/vnext/app/VNextApp.tsx
- src/vnext/app/EditorWorkspace.tsx
- src/vnext/app/bootstrap.tsx
- src/vnext/app/styles.css
- tests/vnext/translation/translation-review-copy.test.ts
- tests/vnext/translation/translation-entry.test.tsx
- tests/vnext/proof/architecture-boundary.test.ts
- tests/vnext/proof/w5b-translation-review-copy-proof.mjs
- .github/workflows/quality-gates.yml
- docs/stories/2026-10-01-vnext-w5b-translation-review-copy.md

## Dev Agent Record

Contract discovery resolved minimal durable provenance using existing strict origin metadata. No new stored provider/reviewer fields are needed for this slice. Review changes only text runs in an ephemeral canonical candidate, followed by ordinary canonical clone/create. No second document domain.

Focused verification: all translation tests plus architecture boundary PASS (8 files, 95 tests), including 20 review/candidate/persistence and two keyboard entry regressions. Full suite PASS: 284 files, 3045 passed, one skipped (four local workers). Lint/typecheck/build PASS. All 27 historical Chromium/PDF proofs PASS, including unchanged C.1 and L1. Controlled production Chromium PASS: keyboard entry, corrected translation, invalid-review blocking across multiple fields, exactly one copy, immutable original/assets/geometry, source origin revision, copy edit/save/reopen, stale pending-provider rejection and four empty error collectors. Artifact: scratch/w5b-translation-review-copy-proof/result.json. Source title/hash/run/locator and technical-token checks remain strict.

Adversarial self-review found and fixed a multi-field review hole: correcting a second field could clear the first field's invalid state. Invalid corrections are now tracked by unit/run until every invalid edit is corrected. The historical direct-Text boundary sentinel now permits only the external onRequestTranslation callback; it still rejects translation operations in the editor, and new graph checks require canonical clone/PreparedCatalogCreateCoordinator reuse.

Local infrastructure diagnosis: an ignored dependency junction parked under scratch was scanned by Vite as HTML entries, causing startup timeouts; it was moved outside the worktree. No historical proof assertion or timeout changed. Production lint retains the baseline 268 warnings with zero errors. Real provider/backend acceptance remains separate and pending a matching deployed slice; existing CDP Chrome editor sessions were inventoried by DOM only, without credentials inspection.

CodeRabbit completed the 12-file audit-only Linux snapshot review with one minor and zero HIGH/CRITICAL. Its keyboard context-transition finding was verified by two failing-before/passing-after UI regressions and fixed by calling the existing authoring barrier directly on click. Final self-review found no unresolved introduced HIGH/CRITICAL. An agent-caused Windows/WSL snapshot preparation error briefly unpacked tracked baseline files locally; the exact preserved overlay restored them before promotion. The interrupted historical export proof passed unchanged after restoration. No canonical commit/history was changed by the incident.

Promotion closeout: PR #58 is merged, canonical SHA `49db0f976efa1c39be54a97dad83d67d85bdae80`, tree `c04d3e6864e29d017dd9827c3459bbfe69161134`; exact main push Quality Gates `36818454508` attempt 1 completed successfully. This durable update records the already-completed promotion, not a new W5.B implementation or rerun. Real-provider/backend acceptance remains separate.
