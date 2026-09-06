# Recovery rehearsal plan

> Status: plan only; no restore rehearsal was executed
> Safety rule: disposable environments and synthetic/non-sensitive fixtures only; never production

## Objective and non-claims

Prove that an authorized team can create data in disposable environment A, produce a complete backup, destroy A, provision independent fresh environment B, restore, verify, and destroy B. A successful future run must produce evidence. This plan is not proof of execution or recoverability.

BackupModal is a partial client/local JSON snapshot. It is not a complete PostgreSQL backup, complete Storage backup, Auth backup, full disaster recovery, or proof of recoverability. It is outside the DR backup path.

DR CLOSED: NO.
RESTORE REHEARSAL EXECUTED: NO.
PRODUCTION RECOVERY VERIFIED: NO.

## Roles and go/no-go

- Rehearsal lead: authorizes each destructive checkpoint and owns the timeline.
- Database/platform operator: provisions A/B and handles database, Auth test identities, and Storage.
- Security verifier: tests credentials, roles, RLS, grants, RPCs, Storage policy, and Realtime isolation.
- Application verifier: creates fixtures and performs domain checks.
- Evidence recorder: maintains manifests, hashes, timings, defects, and approvals.

Proceed only when A and B are confirmed disposable, endpoint controls exclude production, data is synthetic, credentials are rehearsal-only, backup encryption/key access is testable, and destroy approvals name exact resource identifiers. Any ambiguous endpoint, production credential, real user, or unexplained inventory difference stops the rehearsal.

## A → backup → destroy A → fresh B → restore → verify → destroy B

### 1. Provision disposable A

1. Create an isolated project/account namespace with rehearsal-only database, Auth, Storage, and application configuration.
2. Record identifiers and endpoints and add a visible REHEARSAL marker to logs and fixtures.
3. Apply the selected schema strategy and capture migration/control-plane inventory.
4. Create synthetic admin, editor, viewer, disabled, and unauthorized/anonymous identities only.

### 2. Create fixture state in A

Create a small relationally complete set covering:

- Auth/profile mappings and role/activation changes;
- families, fields, products, catalogs, catalog-product links, templates, workspace layouts, and version history;
- product-owned and family-owned workbooks where supported, with datums, datasets, source documents, evidence, canonical decisions, and audit history;
- assets and Storage objects with known hashes, sizes, MIME types, approval/provenance, links, and a non-ASCII key if supported;
- semantic registry references and generated projections/search data;
- optional local preferences recorded separately from authoritative recovery data.

Exercise authorized success and unauthorized denial, direct DML denial where RPC-only writes apply, revision/CAS conflicts, Storage access, and Realtime visibility. Sign expected IDs, hashes, counts, and byte totals.

### 3. Back up A

1. Quiesce writers or use a documented consistency method.
2. Capture schema/control-plane state, transactionally consistent database data, provider-supported test Auth recovery material, all Storage buckets/bytes, and release identifiers.
3. Generate relation/object counts, total bytes, hashes, dependency map, encryption/key reference, retention metadata, and tool versions.
4. Verify readability and decryptability through the supported mechanism.
5. Store backup and evidence outside A's failure domain.

### 4. Destroy A

Two operators match the exact disposable A identifier to the rehearsal record. The lead authorizes destruction. Destroy A through the provider-supported operation and confirm its endpoints no longer serve fixtures.

### 5. Provision fresh B

Create B from scratch with new rehearsal-only credentials and no shared mutable database, Auth tenant, bucket, or resource from A. Record identifiers and prove production endpoints are absent.

### 6. Restore B

Follow this order:

1. schema strategy and migration compatibility;
2. Auth/profiles;
3. families/products/catalogs/templates, links, and versions;
4. source documents;
5. workbooks/evidence;
6. assets/Storage bytes and links;
7. deterministic projections/rebuilds;
8. FK/RLS/grants/RPC/Auth/Storage/Realtime validation.

Record commands/tool versions and timings without secrets. Do not silently repair discrepancies. Log defects and rerun from a clean B after correction.

### 7. Verify B

Compare B to the signed A manifest:

- exact expected relation counts and appropriate hashes;
- object count, total bytes, and every fixture object checksum/metadata;
- IDs, links, versions, owners, datum/dataset/source/evidence/asset/layout/semantic references;
- zero unexplained FK/check/unique violations or orphans;
- canonical payload versions and deterministic projection parity;
- admin/editor/viewer/disabled/anonymous access matrix;
- RLS, grants/revokes, RPC/CAS behavior, Auth login/refresh/revocation, Storage authorization, and Realtime isolation;
- application startup, representative read/write, rendering, asset display, and export/PDF behavior.

Record backup duration, declaration, provisioning, restore, rebuild, validation, and service-ready timestamps. Record the latest durable A transaction included so observed data loss can be measured. Measurements may inform later RPO/RTO proposals; they do not approve business SLAs.

### 8. Destroy B

After evidence is secured and the result is signed as PASS, FAIL, or INCOMPLETE, two operators verify the exact B identifier and the lead authorizes destruction. Destroy all disposable B resources and revoke rehearsal credentials. Retain only approved evidence and backup artifacts according to the rehearsal retention decision.

## Acceptance

The rehearsal passes only when production remained untouched, A was destroyed, B was independently provisioned and restored solely from declared inputs, all integrity/security/application checks passed, B was destroyed, no critical recovery defect remains, key access was demonstrated, and accountable owners signed the result.

A failed criterion yields FAIL or INCOMPLETE, assigned remediation, and a new rehearsal. Never rewrite a failed report into a pass.

Required evidence includes charter/approvals, A/B identifiers and production exclusion, source SHA, migration/control-plane capture, backup manifest and hashes/counts/bytes, destroy approvals for A and B, restore transcript/timings, verification outputs, defects, owners, and signed result.

No such evidence bundle was produced by this documentation mission. RESTORE REHEARSAL EXECUTED: NO.
