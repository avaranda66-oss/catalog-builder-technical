# W3.E AMBIGUOUS CREATE — NARROW READ-ONLY MICRO-AUDIT

Act as an independent adversarial reviewer. Read the current dirty worktree only. Do not modify any file, branch, commit, remote, PR, story, or evidence.

Scope is STRICTLY limited to the Principal amendment for ambiguous Blank Create. Inspect only what is needed in:
- src/vnext/library/service.ts
- src/vnext/app/CatalogLibrary.tsx
- src/vnext/library/index.ts
- tests/vnext/library/catalog-library-service.test.ts
- tests/vnext/library/catalog-library-ui.test.tsx
- tests/vnext/proof/fixtures/w3e-library-browser.tsx
- tests/vnext/proof/w3e-catalog-library-proof.mjs
- canonical persistence create/idempotency contracts only as necessary to validate replay semantics.

Review exactly these questions:
1. Does an ambiguous Create retain one immutable logical attempt identity (authority, catalog/document snapshot, mutationId, origin if any)?
2. While that pending attempt belongs to the current authority, can any retry allocate a new catalogId/mutationId or substitute a new title?
3. Does authoritative GET NOT_FOUND make forward progress only by exact replay of the SAME create request?
4. Do transport-unavailable GET outcomes preserve the pending attempt and avoid blind replay/new identity?
5. Does a successful GET or replay ACK require exact catalog/document/mutation/revision/archive/equivalence proof before clearing pending?
6. Does a divergent envelope/ACK fail closed without allocating a second logical catalog?
7. Does authority A -> B make A's pending create inert and prevent reconciliation/replay under B?
8. Does Father UI avoid refresh guidance, project pending state as “Verificar criação” (or equivalent), and keep mutation identity out of React?
9. Does the controlled browser proof genuinely demonstrate ambiguous first dispatch -> GET NOT_FOUND -> exact replay same catalogId/mutationId/document/origin -> one logical catalog -> canonical exact Open?
10. Can you reproduce any ghost-duplicate or no-forward-progress counterexample remaining inside this scope?

Treat existing green test/proof results as supporting evidence, but review the code itself. Do not suggest style, refactors, broader W3.E changes, W3.F work, persistence redesign, or future improvements.

Return exactly one verdict class:
A — ACCEPT
or
B — BLOCKER with one or more concrete reproducible counterexamples
or
C — MATERIAL ARCHITECTURE ISSUE with concrete evidence.

Keep the output concise and evidence-based.
