# Release rollback runbook

> Status: prepared procedure; no rollback or recovery was executed

## Purpose and non-claims

Return the application to a known-good immutable release while preserving durable data and evidence. Application rollback does not prove database recovery.

BackupModal is a partial client/local JSON snapshot. It is not a complete PostgreSQL backup, complete Storage backup, Auth backup, full disaster recovery, proof of recoverability, or rollback material.

DR CLOSED: NO.
RESTORE REHEARSAL EXECUTED: NO.
PRODUCTION RECOVERY VERIFIED: NO.

## Decision table

| Change type | Default response and gate |
|---|---|
| Application-only and schema-compatible | Deploy the last known-good immutable artifact after compatibility check |
| Feature/config flag | Revert the smallest approved configuration change and audit it |
| Additive backward-compatible schema | Roll back code only if old code is proven compatible; otherwise forward-fix |
| Destructive/data-transforming schema | Require database operator, verified backup, explicit data-preserving plan, and incident approval |
| Auth/RLS/grants/RPC/Realtime/Storage policy | Preserve security evidence and validate allow/deny behavior after correction |
| Data corruption or loss | Contain writes and invoke recovery/reconciliation; do not improvise a deployment rollback |

Prefer forward correction when durable writes from the new release are unsafe or unreadable to old code. Never down-migrate or restore a database solely to match old code without an approved and tested data-preserving procedure.

## Preconditions

Record incident ID, commander, current and target release SHAs/artifact digests, environment, deployment times, impact, migration ledger, feature/config changes, jobs, and write activity. Confirm the target artifact is immutable, available, verified, compatible, and free of revoked credentials. Preserve logs and affected data before changing state.

## Procedure

1. Declare rollback and record authority and communications.
2. Quiesce unsafe writers, jobs, and deployments through approved controls.
3. Capture release/config/schema state and a verified pre-change backup when required.
4. Check old application compatibility with current schema, API/RPC signatures, payload versions, Auth/RLS/grants, Storage policy/paths, and Realtime contracts.
5. Deploy the exact target artifact; do not rebuild from an unpinned branch.
6. Apply only target-compatible configuration from the approved secret/config system.
7. Validate health, Auth/profile roles, authorized/denied reads/writes, RPC/CAS, catalog/product/template/workbook operations, assets/Storage, Realtime, layouts, semantic references, rendering, and export.
8. Re-enable writers gradually and monitor errors, latency, failed jobs, authorization, integrity, and version conflicts.
9. Record final artifact, migration ledger, evidence, residual risk, and approval. Keep the incident open while reconciliation or DR work remains.

## Migration rules

Each release migration must be classified as backward-compatible, expand/contract, data-transforming, or irreversible. Record old/new application compatibility, backup checkpoint, and forward/rollback path. Down SQL is not presumed safe. Preserve source data during transformations until verification and retention approval.

Abort rollback when the target artifact is unverified, compatibility is unknown, a migration is destructive, backup verification fails, environment scope is ambiguous, integrity checks fail, or rollback increases impact. Maintain containment and choose an approved forward fix or recovery path.

## Verification

Verify artifact SHA/digest; schema ledger; FK/check/unique constraints; RLS and policies; grants/revokes; function owner/search path and RPC permissions; Auth/profile mapping; Storage objects/policies; Realtime authorization/delivery; canonical catalogs, versions, products, families, fields, templates, workbooks, sources/evidence, assets, layouts and semantic data; and monitoring stability for the approved observation period.
