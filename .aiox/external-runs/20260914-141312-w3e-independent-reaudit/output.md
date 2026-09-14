W3.E Catalog Library — Second Independent Adversarial Re-Audit

**Verdict: B — not ready for Principal implementation audit.** The remediation fixed three of the five prior findings completely and materially improved the other two, but **two localized blockers remain**: production auth-lifetime isolation on an already-open catalog, and unresolved ambiguous-create handling.

### Material findings

**1\. HIGH — production** `**/v2?catalog=...**` **can retain and later re-render identity A’s document after auth changes to identity B.**

The Library service itself now captures both auth lineage and authority scope and rechecks them after asynchronous operations. `list`, `rename`, and `archive` therefore fail stale operations closed. See [src/vnext/library/service.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/library/service.ts:107), especially lines 107–120, 148–154, 194–243, and 245–267.

The `/v2` Library also reloads when the actual identity changes, so stale A rows are not intentionally retained there: [src/vnext/app/bootstrap.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/app/bootstrap.tsx:102), lines 102–108.

The remaining defect is the production exact-open/editor lifetime:

- Initial auth is captured at `bootstrap.tsx:86–90`.
- The exact catalog reopen is awaited at `bootstrap.tsx:140–143`.
- The auth listener is registered only **after that await**, at `bootstrap.tsx:156–161`.
- After the editor is open, an identity change merely calls `runtime.updateAuthContext(...)` at line 160.

`updateAuthContext` changes the active scope/lineage but preserves the current `DocumentSession`, catalog binding, and authored document. See [src/vnext/persistence/workspace.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/persistence/workspace.ts:278), lines 278–289, and [src/vnext/persistence/runtime.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/persistence/runtime.ts:157), lines 157–162.

`VNextApp` temporarily gates authoring when the authority scope changes, but when Recovery for B releases, it mounts `EditorWorkspace` using the existing `snapshot.session`: [src/vnext/app/VNextApp.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/app/VNextApp.tsx:34), lines 34–44 and 63–69.

Concrete counterexample:

A opens catalog X → X is installed in A's session → auth changes A→B → runtime scope becomes B but X's session remains → B's Recovery discovery completes with no candidate → the editor can render A's already-loaded X under B.

There is also an initialization race because auth changes occurring while the initial `reopenCoordinator.open()` is awaiting its GET cannot be observed by the runtime: the listener does not exist yet.

That violates the required fail-closed service/session lifetime across authority changes and the exact unauthorized-path contract.

**Required correction:** production identity change must invalidate the open catalog session and force a fresh authority-bound route/bootstrap, or otherwise structurally prevent the old session from becoming renderable under the new authority. The listener also needs to cover the initial exact-open await.

There is no W3.E production bootstrap test exercising this A→B transition. The auth-race tests I found are runtime/recovery-level tests, while the W3.E Library auth test stops at service operations: [tests/vnext/library/catalog-library-service.test.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/library/catalog-library-service.test.ts:351), lines 351–397.

* * *

**2\. MEDIUM — ambiguous Create is correlated correctly when verification succeeds, but an unresolved ambiguous Create can still produce ghost duplicate semantics.**

The acknowledgement correlation itself is now strong. `verifiedCreateAcknowledgement()` requires:

- exact `catalogId`;
- exact `documentSnapshot.id`;
- exact mutation ID;
- revision `1`;
- active/non-archived state;
- exact canonical document equivalence.

See [src/vnext/library/service.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/library/service.ts:123), lines 123–146.

When `createCatalog()` returns `AMBIGUOUS_COMMIT_OUTCOME`, the service performs an exact GET for the generated catalog ID and accepts it only through that verification path: `service.ts:157–191`.

But if both events happen:

1. the server commits catalog C1 and the create response is lost;
2. the exact verification GET also fails or is unavailable;

then lines 176–178 simply return the ambiguous failure. No unresolved create attempt, mutation ID, or catalog ID is retained for reconciliation.

The UI then clears `busy` immediately at [src/vnext/app/CatalogLibrary.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/app/CatalogLibrary.tsx:171), lines 171–180. Both Create buttons are disabled only while `busy` is true, at lines 233–236 and 299–305.

A second click therefore generates a new root catalog ID and mutation ID. If C1 actually committed, C2 can also commit. C1 becomes a ghost catalog.

The current ambiguous-create test covers only the successful reconciliation case—commit + lost response + successful GET: [tests/vnext/library/catalog-library-service.test.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/library/catalog-library-service.test.ts:199), lines 199–226. It does not cover create committed + verification unavailable + retry.

The UI message itself tells the user to refresh before repeating the action at `CatalogLibrary.tsx:53`, but that rule is advisory rather than enforced.

**Required correction:** preserve/reconcile the unresolved Create identity/mutation, or block a fresh Create until the prior exact catalog identity has been decisively reconciled. Add the adversarial double-failure → retry test.

### Re-check of the five prior findings

| Prior finding | Re-audit |
| --- | --- |
| 1\. Auth-lineage/service lifetime | **PARTIALLY RESOLVED — BLOCKING.** Library service operations now fail stale results closed and `/v2` reloads on identity change, but an already-open production catalog can survive A→B as described above. |
| 2\. Create acknowledgement / ghost duplicate | **PARTIALLY RESOLVED — BLOCKING.** Exact ACK/mutation/equivalence verification is fixed; unresolved ambiguity followed by a fresh Create remains unsafe. |
| 3\. Stale Library loads | **RESOLVED.** `loadGeneration` at [CatalogLibrary.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/app/CatalogLibrary.tsx:108), with generation comparison at lines 150–161, prevents an older archived/search/list result from replacing a newer result. The adversarial UI test is at [catalog-library-ui.test.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/library/catalog-library-ui.test.tsx:37), lines 37–77. |
| 4\. Production route integration | **RESOLVED, apart from the auth-lifetime defect above.** `/v2` is the real Library; exact catalog URLs use canonical reopen; missing IDs render a failure surface with no demo editor; W2 browser proofs now use their isolated editor fixture. |
| 5\. Dialog keyboard semantics | **RESOLVED.** Rename has initial input focus, Archive initial Cancel focus, Escape close, focus restoration, and Tab containment/wrap at `CatalogLibrary.tsx:109–148, 315–342`; the behavioral test is [catalog-library-ui.test.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/library/catalog-library-ui.test.tsx:79), lines 79–114. |

### Full W3.E contract audit

The remaining contract is in good shape.

Metadata listing stays projection-only. `CatalogLibraryService.list()` calls only `listCatalogs()` at `service.ts:148–155`; the Supabase repository parses the lightweight `ListSchema` and calls `list_vnext_catalogs_v1` at [src/vnext/persistence/supabase-repository.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/persistence/supabase-repository.ts:178), lines 178–184. The test explicitly proves no `getCatalog()` N+1 at `catalog-library-service.test.ts:163–172`.

Rename uses the canonical authored mutation and persistence authority: `document.rename` at `service.ts:213–215`, followed by `VNextPersistenceRuntime`/`SaveCoordinator` at lines 218–239. `SaveCoordinator` independently verifies catalog, mutation, revision, and canonical equivalence before ACK at [src/vnext/persistence/save-coordinator.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/persistence/save-coordinator.ts:195), lines 195–241. The stale-Rename conflict test is `catalog-library-service.test.ts:265–273`.

Archive uses current-revision CAS at `service.ts:245–267`. The physical persistence authority rejects normal Save once archived and uses expected revision for archive CAS in [supabase/migrations/00024\_vnext\_catalog\_persistence.sql](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/supabase/migrations/00024_vnext_catalog_persistence.sql:507), especially lines 542–543, 566 onward, and archive handling around 625–703. Stale Save and Rename resurrection tests are at `catalog-library-service.test.ts:293–317`.

Exact reopen is correctly fail-closed. [src/vnext/persistence/reopen-coordinator.ts](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/vnext/persistence/reopen-coordinator.ts:61) checks async lineage/session staleness at lines 61–84, exact requested/document identity at lines 99–101, and archived state at lines 102–110 before installing the session.

W3.D Recovery remains structurally gated before authoring. `VNextApp.tsx:34–69` does not mount `EditorWorkspace` until the Recovery gate releases. The W3.E integration test establishes the editor and Save action are absent before the decision at [catalog-library-open-recovery.test.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/library/catalog-library-open-recovery.test.tsx:64), lines 64–105. The browser proof also verifies that choosing cloud/open and returning to Library does not broadly delete the recoverable local record at [w3e-catalog-library-proof.mjs](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/proof/w3e-catalog-library-proof.mjs:126), lines 126–141.

Production routing is materially proven. [src/main.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/src/main.tsx:5), lines 5–10, maps `/v2` only to VNext bootstrap. The browser proof opens production `/v2`, then a nonexistent production `/v2?catalog=<exact-id>` and proves there is no demo editor fallback at `w3e-catalog-library-proof.mjs:39–45`.

Historical W2 browser proofs have been moved to the isolated [tests/vnext/proof/fixtures/w2-editor-browser.tsx](C:/Users/Usuario/.codex/worktrees/972f/catalog-builder/tests/vnext/proof/fixtures/w2-editor-browser.tsx:41), lines 41–63, instead of treating production `/v2` as an editor backdoor.

I found no Catalog-level Duplicate, Starter, Restore/Unarchive, hard Delete, Save-as-copy, or W3.F+ implementation in the W3.E Library surface. The explicit contract test is `catalog-library-service.test.ts:319–324`.

Mobile evidence covers exactly **320, 360, and 390 px**, asserts body/document/Library shell widths do not exceed the viewport, checks touch target heights, search width, view switching, and dialog geometry: `w3e-catalog-library-proof.mjs:145–186`.

The browser proof generally establishes underlying state transitions rather than UI-only success: exact canonical open at lines 64–82, authoritative archive state at 93–112, canonical create/open at 114–124, Recovery precondition/intermediate gate/postcondition at 126–141, and mobile geometry at 145–186.

`git diff --check e37cdf3105626ce83763964f8d2a56a1fda1e01b` reports no whitespace errors; only the existing Windows LF→CRLF warnings were emitted.

I remained strictly read-only. No source, test, branch, commit, push, or PR was modified.

**Principal gate: HOLD.** Fix the two blockers above, add adversarial tests for production A→B auth transition and unresolved ambiguous Create → retry, then perform another independent re-audit. The rest of W3.E does not presently require architectural rework.