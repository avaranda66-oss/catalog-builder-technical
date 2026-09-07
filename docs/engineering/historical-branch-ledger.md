# Historical Branch Reconciliation Ledger

| Metadata | Value |
|---|---|
| Reconciliation | ARCH.R1 / ARCH.R1-CLOSE |
| Canonical product SHA | `726203fe7d633e629b732deb8e1e96a0ad25c73c` |
| Date | 2026-09-07 |
| Repository | `avaranda66-oss/catalog-builder-technical` |

## Executive Guarantee

At this canonical SHA:

- `MISSING_DELTA = 0`
- `UNKNOWN_REQUIRES_REVIEW = 0`

Every known useful productive historical delta identified during the complete remote-branch archaeology is either:

- literally reachable from canonical main; or
- semantically represented by an audited canonical implementation.

This guarantee does not mean that browser E2E is complete, production disaster recovery is proven, migration clean-baseline debt is resolved, all future roadmap work is implemented, or operational and evidence branches belong in product main.

## Frozen Semantic Census

| Classification | Count |
|---|---:|
| IN_MAIN | 48 |
| SEMANTICALLY_INTEGRATED | 29 |
| MISSING_DELTA | 0 |
| EXPERIMENTAL | 1 |
| EVIDENCE_ONLY | 2 |
| INTENTIONAL_ISOLATED | 2 |
| DUPLICATE | 1 |
| UNKNOWN_REQUIRES_REVIEW | 0 |
| **Total** | **83** |

## Complete Branch Ledger

Cleanup status is frozen at the principal-approved ARCH.R1-CLOSE result. `SAFE_TO_DELETE` authorizes only a later, separately approved cleanup operation; it does not record a deletion performed by this reconciliation.

| Branch | Head SHA | Classification | Canonical disposition | Cleanup status | Notes |
|---|---|---|---|---|---|
| audit/rr011-disposable-db-rehearsal | `65e0702633515afcdf63ce774ed9857ec9fa244c` | EVIDENCE_ONLY | Product CAS behavior integrated through the H1 train; empirical PostgreSQL rehearsal remains branch evidence | KEEP_FOR_NOW | Preserve until empirical concurrency evidence has a canonical archive |
| codex/catalogbuilder-rebuild | `f9c8a55fd7a7a73d8bc494d9dfec431cf03dec5e` | EXPERIMENTAL | Isolated alternate rebuild; current product architecture supersedes it | KEEP_FOR_NOW | Optional archive/cleanup candidate after explicit preservation decision |
| codex/remote-rollout | `3255d1c3b17461d4bd83dae4066928f3419ffaf8` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Historical rollout line |
| design/product-workbook-persistence | `eabbdb5c6f4a017a8d1366c53d685017f4e1693b` | SEMANTICALLY_INTEGRATED | Later Product Workbook W2B/W2C implementation and hardening | SAFE_TO_DELETE | W2A persistence blueprint represented by later architecture |
| feat/pim-mega-workspace-foundation-v1-synced | `3bbbc3a960136e383055f37a3602541df01050b8` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Synced foundation line |
| feat/pim-mega-workspace-foundation-v1 | `2ba0815cd75fb9659931c3991dc42b89094570ab` | SEMANTICALLY_INTEGRATED | Stable patch replay into the PIM integration train | SAFE_TO_DELETE | Mega Workspace foundation and provenance |
| feat/pim-mega-workspace-ux-v1 | `d862f55506fd45a0b08c6fa7bfd348492c9bff06` | SEMANTICALLY_INTEGRATED | Stable patch replay into the PIM integration train | SAFE_TO_DELETE | Mega Workspace UX |
| feat/pim-production-core-v1 | `03d6d2670ad00925b61dd069e1598be403c190d6` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | PIM production core |
| feat/table-v2-production-experience-v1 | `008df742113ea3ccc4039a067c2cb138a70e8601` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table V2 production experience |
| feature/table-core-v2-renderer | `943f92ee137bb60ba6f004275ec20ac51ace21e7` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table Core V2 renderer |
| fix/product-workbook-persistence-w2c-preflight | `34d6b212be3f532229eed4be3bb7b40dbdfdaa8a` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Product Workbook preflight |
| fix/product-workbook-revision-contract | `be6302683cb3169b8425037f468bd22d3be79a22` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Revision contract |
| fix/product-workbook-source-edge-parity-w2c3 | `5e2957678028dace74ab65888617424d60dfc7e2` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Source edge parity |
| fix/product-workbook-source-runtime-parity-w2c2 | `458f47d36e25ddd141850d0569814b05ee289866` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Source runtime parity |
| fix/product-workbook-source-validator-parity-w2c1 | `d9af162849ff8cc95cb336d400de999ae7fa7026` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Source validator parity |
| fix/product-workbook-temporal-parity-w2c4 | `d4a90325cc2a9678ff15e0fb1822928ffcc6b63e` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Temporal parity |
| fix/table-binding-semantic-projection-b1-1 | `14e6d77088f81456061bc714b2dbf89f0c049213` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table binding projection |
| fix/table-data-truth-h1 | `8b234e8e130929a3b42eb26048a36c1d5291f905` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table data truth |
| fix/table-v2-official-activation | `00da4e8026569df16cb7fb820deaca08ecf37e64` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table V2 activation |
| foundation/product-workbook-domain | `17568ec11481419da5cc3826b3aadfb550e2f129` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Product Workbook domain |
| foundation/table-core-v2-domain | `14c886b41ff9d63d87d09e751c108f9f5fe77605` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table Core V2 domain |
| hardening/product-workbook-persistence-w2b | `032d29d658560d2fcb5c4b5f541927f9d45e08a4` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Product Workbook persistence hardening |
| hardening/table-core-specs-binding-b1 | `91050eae518a9e702ee7e53ecccd4975a5e6066f` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table Core specs binding |
| integration/canonical-correctness-c1-c2-c4 | `958f2f0fa0154bc808eb156b8c376550c2824a82` | IN_MAIN | Literal ancestor and former canonical main | SAFE_TO_DELETE | Canonical C1/C2/C4 integration point |
| integration/company-readiness-r4-consolidated | `81c13e4cf1d7f5160b3a16bac250a0e32b076adf` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | R4 consolidated train |
| integration/company-readiness-w3-core | `27a4837b5a7669490f337753d5c208981bd9437f` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | W3 core train |
| integration/company-readiness-w3-train-rr015 | `fb1813aaabdc2df5089495496c6552a443dd4f00` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | W3 RR015 train |
| integration/company-readiness-w3-train | `071aadf71f8003f9ea367ac293926c9a84052ce4` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | W3 integration train |
| integration/lib-f1-current-main | `c8ce25efe0b69a063ac7b1f32f0a0bd6609acd50` | SEMANTICALLY_INTEGRATED | Stable patch replay as canonical LIB.F1 implementation | SAFE_TO_DELETE | Family rename/delete behavior |
| integration/pim-mega-workspace-v1 | `8ea3d923f6a5ed5eda7ed488195942f2dbde94a9` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | PIM Mega Workspace integration |
| integration/pim-table-core-final-v2 | `d4a90325cc2a9678ff15e0fb1822928ffcc6b63e` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Final Table Core V2 integration |
| integration/pim-table-core-final | `82304c877840e6d74e5c36e7cedc7ea15189e8ff` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Final Table Core integration |
| integration/pim-table-core-preflight | `0111e2d52177142f044b89e2ae63c9f2bd66ac6d` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table Core preflight |
| integration/pim-table-production-v1 | `a070ea7f8b43d2f95966b2c4c268c6cc17c6eeab` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | PIM table production integration |
| integration/product-workbook-domain | `17568ec11481419da5cc3826b3aadfb550e2f129` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Product Workbook domain integration ref |
| integration/table-core-v2-foundation | `14c886b41ff9d63d87d09e751c108f9f5fe77605` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table Core foundation integration ref |
| main | `726203fe7d633e629b732deb8e1e96a0ad25c73c` | IN_MAIN | CANONICAL AUTHORITY | DO_NOT_DELETE | Latest principal-approved canonical product state |
| ops/db-release0-ci-rehearsal | `65a6d86525e7bb479e63e7c7de4f5a2a0e4050d1` | INTENTIONAL_ISOLATED | Disposable database migration rehearsal; not product application code | KEEP_FOR_NOW | Preserve unique CI/rehearsal workflow pending canonical operations home |
| parallel/library-family-management | `bb779186bd1af2cddc23e4b3cde37b554849bf92` | DUPLICATE | Same stable patch as canonical LIB.F1 implementation | SAFE_TO_DELETE | No independent product delta |
| pilot/table-core-specs-table-inspector | `b8b1d7ab470c58de919b7aa2d89491deda029890` | SEMANTICALLY_INTEGRATED | Stable patch replay into Table Core integration | SAFE_TO_DELETE | Inspector bridge pilot |
| pilot/table-core-specs-table | `e943cf6d0de78a4a45b5a19a30c4ccacb63acedb` | SEMANTICALLY_INTEGRATED | Stable patch replay into Table Core integration | SAFE_TO_DELETE | Specs table renderer pilot |
| release/main-production-sync-v1 | `7ea3e814af0577cefeafd6b3a373c208fcd5bb47` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Production sync release line |
| release/pim-table-production-v1-rc1 | `a070ea7f8b43d2f95966b2c4c268c6cc17c6eeab` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | PIM table RC1 ref |
| remediation/c1-canonical-catalog-realtime-decoder | `f5684f0b08215cf0ad1f5a9e7ee6dba3462aa4c7` | SEMANTICALLY_INTEGRATED | Stable patch replay as `19b7507b751fa6576f5be073400c077688a6f185` | SAFE_TO_DELETE | Canonical catalog realtime decoder |
| remediation/c2-active-editing-context-save-routing | `04558056ef0d8365310a4424809722002396089a` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Active editing context and save authority |
| remediation/c4-table-export-editability-parity | `b18da24f8627e065e83285cd30cc4829dfe00088` | SEMANTICALLY_INTEGRATED | Stable patch replay through canonical correctness at `958f2f0fa0154bc808eb156b8c376550c2824a82` | SAFE_TO_DELETE | Specialized table export parity |
| remediation/company-readiness-h0a | `2720b7cd30f3ac0b461165444f3e930ec38c09d5` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Company readiness H0A |
| remediation/company-readiness-h0b | `c1b264b1675731638f8cf288738d88cdf15f1f84` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Company readiness H0B |
| remediation/company-readiness-h0c-github | `175639f3a53f6a0461325388540f1da1feb4f703` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Company readiness H0C |
| remediation/company-readiness-h1-github | `ef61db30e6cdc659566a3d8f5831d1de82ed43c1` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Company readiness H1 |
| remediation/company-readiness-wave0 | `e3e581870fe345d6e13198e413c601b842477403` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Company readiness Wave 0 |
| remediation/g1-save-draft-design | `176061632cafdbc9481ef2beace4369315fe1cd2` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Save-draft design |
| remediation/h1a-read-authority-github | `9cae3eee37d624578ccb08248f7a754f3cc6ebeb` | SEMANTICALLY_INTEGRATED | Reconciled H1 implementation at `ef61db30e6cdc659566a3d8f5831d1de82ed43c1` | SAFE_TO_DELETE | RR006 read authority |
| remediation/h1b-source-cas-github | `5443b249f8d3c0d6b678105de709e3465a298f1a` | SEMANTICALLY_INTEGRATED | Reconciled H1 implementation at `ef61db30e6cdc659566a3d8f5831d1de82ed43c1` | SAFE_TO_DELETE | Source-document CAS V2 |
| remediation/r1-new-001-boxblock-fidelity | `a1a411fa60036dd1a386edf51761ef389850fc64` | SEMANTICALLY_INTEGRATED | RECON.R1.1 at `726203fe7d633e629b732deb8e1e96a0ad25c73c` | SAFE_TO_DELETE | Former missing delta; source fidelity is closed |
| remediation/recon-r1-boxblock-source-fidelity | `726203fe7d633e629b732deb8e1e96a0ad25c73c` | IN_MAIN | Exact canonical main; RECON.R1.1 | SAFE_TO_DELETE | Promoted BoxBlock reconciliation branch |
| remediation/rr005-help-hooks | `36f73ebbb2bcdb2092c6eb1b2a6238dc6cb58194` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Help hooks remediation |
| remediation/rr012-typed-cell | `370c8c979e6807ee9f9c08aa4412123b9cdb85e1` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Typed cell remediation |
| remediation/rr018-recovery-prep-docs | `7c5043d9b736c32e7f7291371a254ec9eb4e0d9c` | EVIDENCE_ONLY | Recovery preparation documentation; not a missing product delta | KEEP_FOR_NOW | Retain until runbooks are canonicalized or archived |
| remediation/security-pdfjs-p1 | `9f0223e2b6244e0b2e6fda5bf418dd212ea6e0c8` | SEMANTICALLY_INTEGRATED | Security tree integrated through `175639f3a53f6a0461325388540f1da1feb4f703` | SAFE_TO_DELETE | PDF.js ingestion security |
| remediation/security-xss-p1 | `742b83b5d64098611ff4ab991efcf6c6bafca03d` | SEMANTICALLY_INTEGRATED | Security tree integrated through `175639f3a53f6a0461325388540f1da1feb4f703` | SAFE_TO_DELETE | BoxBlock stored-XSS boundary |
| remediation/w2a-rr007-publishing-authority | `a4ca260e36b5af5c9ecde69d3c5973884783ee75` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Publishing authority |
| remediation/w2b-rr009-export-snapshot-consistency | `de6ed28ed184c8a0dbfd61b5985143eab8caf9ef` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Export snapshot consistency |
| remediation/w2b1-rr009-export-ui-draft-isolation | `d3d5d969ee5ea951a082f47b3efb4592e394fa0a` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Export UI-draft isolation |
| remediation/w3a-aud012-catalog-session-lineage | `9bbe89d5cc51ae66ecdc92d74d667b2478a4697c` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Catalog async lineage |
| remediation/w3b-rr015-picker-request-budget | `ad67e713439679f12823ffbfe169e89dfce9b897` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Picker request budget |
| remediation/w3b1-rr015-picker-session-isolation | `dd530a0499227f9fbdc697ef8b6f9885323ba90e` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Picker session isolation |
| remediation/w3c-aud013-workbook-delete-lifecycle | `46af502c62bb159260348e70bea4d52eaedc3466` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Workbook deletion lifecycle |
| remediation/w3d-rr018-disposable-recovery-drill | `7d02f494d5372d1f90fd5f025aeb162380f9bc93` | INTENTIONAL_ISOLATED | Disposable recovery workflow and evidence; not product application code | KEEP_FOR_NOW | Preserve until recovery evidence has a canonical operations home |
| remediation/w3e-aud012-workbook-realtime-catchup | `de2f515ede9e60413370a4ca0be0b21910f36270` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Workbook realtime catch-up |
| remediation/w3e1-aud012-registry-freshness-retry | `dba82c023549ef65b9a99b588890614dcf07f337` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Registry freshness retry |
| remediation/w3e2-aud012-owner-catchup-retry | `a094b11a3a286fc141646c0469d74eb2d9033f40` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness train | SAFE_TO_DELETE | Owner catch-up retry |
| remediation/w3f-aud013-delete-catalog-ack | `046d5eb9c18d507362e997bae0cecf3bf32a92ba` | SEMANTICALLY_INTEGRATED | Stable patch replay into R4 integration | SAFE_TO_DELETE | Delete-catalog acknowledgement |
| remediation/w3g1-aud013-editorial-column-ghosts-canonical | `478c18060175442fe4aea9c511753cda70680f9d` | SEMANTICALLY_INTEGRATED | Stable patch replay into R4 integration | SAFE_TO_DELETE | Editorial column removal |
| remediation/w3g2-aud013-hybrid-custom-table-authority | `245a0e1170e4bf6aed27a5331eb82a9468d93779` | SEMANTICALLY_INTEGRATED | Stable patch replay into R4 integration | SAFE_TO_DELETE | Hybrid custom-table authority |
| remediation/w3h-aud012-library-conflict-ux | `92b81d7e7d4d0aedf4c87af6ddc68a62c2ecad58` | SEMANTICALLY_INTEGRATED | Behavioral reconciliation into the R4 architecture | SAFE_TO_DELETE | Library conflict recovery UX |
| remediation/wave0b-g1-save-draft | `c6495afeef2e7f80ea9eccd465ce27df2a0ba65c` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness integration | SAFE_TO_DELETE | Bounded save-draft lifecycle |
| remediation/wave0b-quality-hook-001 | `598100e14fda67290893d14aaac7a10a07fa89c4` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness integration | SAFE_TO_DELETE | SemanticEditor hook lifecycle |
| remediation/wave0b-rr004c-containment | `9c3df740a89c9f50dbf2e5e769eeeb0dfcee57ad` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness integration | SAFE_TO_DELETE | Unauthoritative technical-facts containment |
| remediation/wave0b-rr016-quality-gates | `9d21da430cba872c333d47cf42f666ad7cd1abfa` | SEMANTICALLY_INTEGRATED | Stable patch replay into company-readiness integration | SAFE_TO_DELETE | Quality-gate remediation |
| test/company-acceptance-critical-journeys | `dc356b8362499864c3ea40eb58e8163011876d0d` | SEMANTICALLY_INTEGRATED | Stable patch replay into R4 integration | SAFE_TO_DELETE | Company acceptance suite |
| ux/library-v2-guided-v1 | `23ab359d73e9f6305f943c06db1c95344ee2e327` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Guided Library V2 UX |
| ux/table-design-system-v1 | `7ea3e814af0577cefeafd6b3a373c208fcd5bb47` | IN_MAIN | Literal ancestor of canonical main | SAFE_TO_DELETE | Table design system |

## Explicit Retention Set

The following branches remain intentionally retained. None represents a missing historical product delta.

- `audit/rr011-disposable-db-rehearsal` — empirical disposable-PostgreSQL concurrency and CAS evidence; retain until archived canonically.
- `ops/db-release0-ci-rehearsal` — unique branch-scoped disposable migration rehearsal workflow; retain until it has an approved operations home.
- `remediation/rr018-recovery-prep-docs` — recovery preparation and limitations record; retain until its runbooks are canonicalized or archived.
- `remediation/w3d-rr018-disposable-recovery-drill` — disposable recovery drill, verification assets, and evidence; retain until canonical operations retention is decided.
- `codex/catalogbuilder-rebuild` — isolated experimental rebuild with potential design evidence; retain pending explicit archival or cleanup approval.

## Canonical Authority

`main` is `DO_NOT_DELETE` and is the canonical authority. At this reconciliation it resolves to `726203fe7d633e629b732deb8e1e96a0ad25c73c`.

## BoxBlock Historical Closure

| Record | Value |
|---|---|
| Historical branch | `remediation/r1-new-001-boxblock-fidelity` |
| Historical head | `a1a411fa60036dd1a386edf51761ef389850fc64` |
| Canonical remediation branch | `remediation/recon-r1-boxblock-source-fidelity` |
| Canonical SHA | `726203fe7d633e629b732deb8e1e96a0ad25c73c` |
| Status | `SEMANTICALLY_INTEGRATED / CLOSED` |

Raw `block.textContent` is now authoritative. The rendered presentation DOM no longer reconstructs persisted source, no-op editing performs no mutation, placeholder text is not persisted, and exact whitespace, newlines, and intentional edits are preserved while HTML-like input remains inert.

## Known Open Debt Outside Historical Reconciliation

1. **Browser E2E — OPEN.** Historical reconciliation does not assert complete browser-level coverage.
2. **Production DR evidence — OPEN.** Disposable rehearsal evidence does not prove production recovery.
3. **Migration clean-baseline debt — OPEN.** The numbered migration chain still relies on the current bridge files:
   - `scripts/db-release0-live-baseline.sql`
   - `scripts/db-release0-gap2-pre14.sql`
   - `scripts/db-release0-gap2-post14.sql`

These items are not forgotten historical product deltas and do not change `MISSING_DELTA = 0`.

## Permanent Branch Policy

Every future implementation branch must end in one explicit state:

- `MERGED`
- `FROZEN_FOR_INTEGRATION`
- `REJECTED`
- `SUPERSEDED`
- `EVIDENCE_ONLY`

No branch may end merely as “finished in a chat.”

The canonical cycle is:

`main` → feature/remediation branch → focused gates → full gates → principal audit → canonical integration/promotion → main CI → ledger/disposition → branch cleanup

Main must remain the latest approved canonical product state.
