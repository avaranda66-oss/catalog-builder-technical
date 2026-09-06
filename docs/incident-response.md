# Incident response runbook

> Status: prepared procedure; no incident or recovery exercise was executed

## Purpose and non-claims

Coordinate response to availability, integrity, confidentiality, authorization, deployment, database, Auth, Storage, Realtime, and data-loss incidents affecting Catalog Builder.

BackupModal is a partial client/local JSON snapshot. It is not a complete PostgreSQL backup, complete Storage backup, Auth backup, full disaster recovery, or proof of recoverability.

DR CLOSED: NO.
RESTORE REHEARSAL EXECUTED: NO.
PRODUCTION RECOVERY VERIFIED: NO.

## Roles

- Incident commander owns severity, decisions, timeline, and closure.
- Operations lead owns application/platform containment and restoration.
- Database recovery lead owns database inventory, backup, restore, and integrity.
- Security lead owns identity, secrets, RLS/grants/RPC/Storage/Realtime exposure and evidence.
- Application/domain lead validates canonical data and user flows.
- Communications lead issues confirmed updates without secrets or unsupported claims.
- Scribe maintains the append-only event log, evidence index, decisions, actions, and owners.

Severity follows observed impact: business interruption, data loss/corruption, unauthorized access, privilege expansion, affected scope, recoverability, and legal/contractual duties. Numeric thresholds and deadlines require organizational approval.

## First response

1. Open an incident record with UTC time, reporter, symptoms, environment, release, and evidence.
2. Name commander and leads; establish one decision channel and append-only timeline.
3. Confirm whether production is affected by verifying endpoints and project identifiers.
4. Preserve application, database, Auth, Storage, Realtime, release, configuration, and control-plane evidence. Hash exports where practical.
5. Contain through the smallest approved reversible control: stop deploys/jobs, quiesce writes, revoke affected credentials/sessions, disable a feature, or restrict access.
6. Record scope before deleting records/objects, broad credential rotation, restore, or reconciliation.

## Triage

Determine:

- availability, integrity, confidentiality, authorization, and affected users/environments;
- preceding release, configuration, migration, Auth, Storage, or policy change;
- affected durable classes: catalogs, versions, products, families, fields, workbooks, datums, datasets, source documents, evidence, canonical decisions, templates, assets/Storage bytes, Auth/profiles, workspace layouts, semantic registry, and local preferences;
- database consistency and availability of readable off-failure-domain backups;
- unintended access through Auth, profile mapping, RLS, grants, RPCs, Storage policies, or Realtime;
- whether damage affects canonical data or only rebuildable projections;
- whether client JSON import/export caused local divergence.

Treat BackupModal files only as limited client evidence, never authoritative recovery evidence.

## Response paths

| Incident | Containment | Recovery |
|---|---|---|
| Bad release | Freeze deploys/writers and preserve release/error evidence | Use release rollback after compatibility check |
| Database corruption/loss | Stop writers and preserve database/PITR evidence | Use disaster recovery in an isolated target |
| Unauthorized database access | Revoke affected access, restrict ingress, preserve audits | Security-led policy/grant/RPC correction and reconciliation |
| Auth/profile failure | Prevent privilege expansion and preserve identity events | Restore provider-supported mapping and validate active/disabled roles |
| Storage loss/exposure | Restrict bucket/object access and preserve metadata/logs | Restore bytes and metadata together; verify hashes, links, and policies |
| Realtime leakage/failure | Disable affected subscription/publication path if needed | Validate publication, replica identity, RLS, and event authorization |
| Projection/search failure | Protect canonical writes and declare derived views degraded | Rebuild deterministically from canonical payloads |
| Local client loss | Preserve browser/profile and partial JSON when available | User-level portability/reconciliation only |

## Recovery decision and validation

The commander chooses rollback, forward fix, projection rebuild, reconciliation, or disaster recovery from verified scope and compatibility. Database restore requires a verified backup, isolated target, documented restore point, accepted data-loss window, and database/security approval. Test before any production cutover.

Before service restoration:

- reconcile manifests, relation/object counts, total bytes, and hashes;
- validate FK/check/unique constraints and zero unexplained orphans;
- validate payload versions, immutable history, owners, evidence, sources, assets, layouts, and semantic references;
- rebuild and verify projections from canonical data;
- test active/disabled identities and admin/editor/viewer/anonymous authorization;
- verify RLS, grants/revokes, RPC owner/execution/CAS behavior, Storage policy, and Realtime isolation;
- run representative reads/writes, rendering, and export against the recovery target;
- obtain technical and business acceptance of known data loss and service state.

## Communication, evidence, and closure

Each update states confirmed impact, containment, recovery action, user effect, risk, next checkpoint, and owner. Label hypotheses. Keep secrets, personal data, signed URLs, and exploit detail out of public records and Git.

Close only after impact ends, integrity/security checks pass, monitoring remains stable for the approved period, residual risk is accepted, and follow-ups have owners/dates. Record root cause separately from symptoms and schedule a rehearsal when recovery controls were used or deficient.

Incident closure does not close RR018 or DR readiness.
