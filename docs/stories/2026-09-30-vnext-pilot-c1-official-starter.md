# PILOT.C.1 — Official TA-25N starter and page reuse

Status: **Ready for Review — real-backend acceptance pending**

## Objective and authorization

Implement only the two-page editable PRESYS TA-25N starter and safe page reuse authorized by Principal on 2026-09-30. Base: `3fd13fc5c00a91024c6aa7fe793640be73eb27df`, tree `f59738a6ba527188f3d4426eadc97f3ee2ea74f1`; L1 PR #56 canonical. Image approval is limited to SHA-256 `e6c377af5ce42ce0604076d1919144f823efdd345e2b2ac11f40efe003174486` for internal/team starter use.

## Acceptance criteria

- C1-01: Blank, essential and PRESYS choices remain separate.
- C1-02/03/05: Exactly two A4 pages, safe area 12 mm, canonical editable text/tables/image, only approved facts, explicit incomplete cells, zero demo dependency.
- C1-04/06/07/15: Required bytes and durable resolved metadata verified before CREATE; reopen resolves storage without upload, packaged fallback or external source.
- C1-08/09/10/11/12: Normal authoring actions, fresh structural IDs and internally consistent table references, stable durable AssetRef, collision rejection without partial page.
- C1-13/14: Pending exact create/replay precedes preparation; concurrent preparation does not duplicate a logical create; authority changes prevent linking or dispatch.
- Existing blank/essential/duplicate/save-copy, PILOT.B, L1, canonical clone and page insertion behavior stay green.
- Dedicated Chromium proof uses production bootstrap and controlled infrastructure with all four error collectors empty.
- Local lint/typecheck/full tests/build and registered Chromium/PDF proofs pass; exact-final-head Quality Gates success; one unmerged PR.

## Source freeze and architecture

The prior C.1 preflight plus explicit human image approval freezes the source contract; no new factual research. Unresolved temperature limit, dimensions, main supply, current precision, environment and heating/cooling times remain `A COMPLETAR`. Manufacturer declarations are identified as declarations, not independent certification.

Reuse CatalogCloneService, PreparedCatalogCreateCoordinator, DefaultAssetPersistenceBridge/SupabaseAssetRepository, canonical page.template.insert/asset.register actions and fresh-ID traversal. Required ordering: authority → pending create → manifest → verified packaged bytes → durable asset resolve → authority → materialize → clone → prepared CREATE/verified ACK → open.

Page 1: editable brand, model, factual description, contained image, summary/application/interfaces/auxiliary supply. Page 2: editable tables and manufacturer conformity/source note. Semantic page identifiers stay stable; structural page/object/RichText/table IDs regenerate, including nested references; AssetRef identity/version/hash remain stable.

## Tasks

- [x] Freeze machine-readable facts and verify/package approved image.
- [x] Implement starter, pre-create dependencies and safe production page reuse.
- [x] Pass C1-01 through C1-15 and affected existing regressions.
- [x] Pass dedicated Chromium, L1 and registered proofs plus all local gates.
- [x] Audit allowlist/security exclusions and prepare the one-PR / exact-final-head CI handoff.
- [x] Record real-backend acceptance availability honestly.

## Exclusions

No C.2/C.3/F04/D/D3/W5.B/W5.C/AI/Office Team, auth/L1/Recovery/CAS/engine changes, backend/SQL/RLS/migrations, publication/PDF redesign, deployment or Father provisioning. Merge and auto-merge are not authorized. No new dependencies.

## Dev Agent Record

The default registry exposes blank creation, the unchanged essential starter and `presys-ta25n-a4` revision 1 separately. The production page selector exposes only the two prepared official PRESYS pages; historical W2 fixtures remain available to their historical tests and labs.

`DefaultStarterDependencyPreparer` composes the existing asset bridge, verifies the exact 229530-byte PNG/hash/MIME/720 × 482 dimensions, and requires matching durable metadata plus resolved runtime state. Its authority-scoped cache retains finalized identity after a failed resolve. Existing pending create verification runs before any dependency preparation or new structural IDs. Same-starter concurrent requests share one attempt; a different starter receives a stale result instead of borrowing that attempt.

Page insertion prepares and resolves the image before `asset.register` and `page.template.insert`. Both actions use the same existing transaction grouping. Canonical algorithms regenerate structural IDs; asset identity/version/hash remain stable. The session binding follows canonical workspace session replacement and rejects stale authority or page intent without changing Recovery or L1.

### Focused evidence

121 tests in 12 files passed: registry, Library service/UI, pending-create preparation, official starter, dependency failures, production page reuse, existing page-template insertion, catalog clone, architecture boundaries, PILOT.A authorship and L1 authority-loss protection. C1-01 through C1-15 are covered. Historical clone/template tests additionally verify groups, RichText, annotations, legends and covered-cell reference remapping; the existing 100-insertion collision proof remains intact.

The dedicated proof uses production `/v2` bootstrap, Library, prepared creation, editor and asset adapters with controlled HTTP/RPC/storage transport. It created exactly two A4 pages, decoded the 720 × 482 official image, edited normal text and a technical cell, saved, reopened, and reopened in a fresh browser context. Counts: 1 create, 1 upload at creation, 0 additional uploads on either reopen, 1 packaged read before creation. The packaged route is unavailable after creation. No external/demo/lab dependency or temporary URL is persisted. `consoleErrors`, `pageErrors`, `failedResources` and `requestFailures` are all empty.

Chromium used for final local evidence: Playwright's expected Chromium 151.0.7922.34 (revision 1234). Windows CDN timeouts were resolved using the exact official Chrome for Testing mirror; no repository dependency or historical assertion changed.

CodeRabbit reviewed the uncommitted bounded change against the canonical base: zero critical/high findings, two minor findings addressed (starter-specific single flight and truthful page-navigation status). Architecture remains isolated from documentation/proof and Legacy runtime imports.

The scoped production secret/port-content scan found zero findings in the seven touched product files. The framework's `validate:port-denylist` npm script and secretlint package are not configured in this product. A read-only dependency audit reported 2 critical, 2 high and 4 moderate findings in the unchanged baseline dependencies (including jsPDF/Vitest/Vite); package and lockfile are byte-identical to the canonical base. Dependency upgrades and unrelated security remediation are excluded from this authorization; no generic dependency-clean claim is made.

Two full-suite runs at this Windows host's default concurrency failed the same historical PILOT.A semantic-panel entry checks. The 12-case file passed in isolation; all historical Chromium assertions passed unchanged. The same full suite is verified with two workers to bound contention on this 16-logical-CPU host. No test assertion, test timeout or repository test configuration was changed.

### Real backend evidence

`REAL_BACKEND_AUTHENTICATED_ACCEPTANCE = NOT AVAILABLE`. No existing authorized test browser/session or configured local test backend was available. No credentials were inspected or requested, no Father account was provisioned, and no real catalog was created. The controlled proof is not real-backend acceptance. Promotion requires the bounded authenticated create/open/reopen crossing in an already-authorized safe environment; final decision remains B until that evidence exists.

### Final gates and handoff

Final local evidence: lint passed (0 errors, 268 pre-existing warnings), typecheck passed, `npm test -- --maxWorkers=2 --minWorkers=1` passed (282 files; 3022 passed and 1 pre-existing infrastructure-blocked browser-E2E skip), and build passed. The skip is the unchanged company acceptance NEW/EDIT/DELETE/PUBLISH browser journey, not a C.1 test. All 26 historical registered Chromium/PDF proofs plus the dedicated C.1 proof passed; L1, PILOT.B and W3.H evidence use Chromium 151.0.7922.34 without changed assertions.

The exact PR HEAD must have a completed successful Quality Gates run, including the dedicated C.1 proof and the unchanged L1 proof. The final implementation report identifies the immutable commit/tree/PR/run after GitHub confirms them. PR creation and exact-head inspection complete the external handoff; this source document cannot name its own future run. Merge and auto-merge remain prohibited.

## File List

Modified existing files:

- `.github/workflows/quality-gates.yml`
- `src/vnext/library/starter-registry.ts`
- `src/vnext/library/service.ts`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/CatalogLibrary.tsx`
- `tests/vnext/library/catalog-starter-registry.test.ts`
- `tests/vnext/library/catalog-library-service.test.ts`

New files:

- `src/vnext/library/presys-ta25n-starter.ts`
- `src/vnext/library/starter-dependencies.ts`
- `public/assets/presys/ta-25n-starter-v1.png`
- `docs/vnext/pilot-c1-source-contract.json`
- `docs/stories/2026-09-30-vnext-pilot-c1-official-starter.md`
- `tests/vnext/library/official-presys-starter.test.ts`
- `tests/vnext/library/starter-dependencies.test.ts`
- `tests/vnext/app/presys-page-reuse.test.tsx`
- `tests/vnext/proof/pilot-c1-official-starter-proof.mjs`

All 17 files are within Principal's allowlist. No forbidden product, backend, lockfile, historical fixture or deployment file changes.

## Change Log

| Date | Version | Change | Agent |
| --- | --- | --- | --- |
| 2026-09-30 | 1.0.0 | Principal's bounded contract recorded; development started | dev |
| 2026-09-30 | 1.1.0 | Official starter, durable preparation, page reuse and focused/controlled browser evidence completed; real-backend acceptance unavailable | dev |
