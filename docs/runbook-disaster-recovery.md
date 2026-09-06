# Disaster recovery runbook

> Mission: COMPANY.READINESS.RR018.RECOVERY-PREP.DOCS1
> Status: prepared procedure; disaster recovery is not closed
> Scope: operational documentation only; no live system was accessed

## Purpose and non-claims

This runbook defines how an authorized recovery team should inventory, back up, restore, and validate Catalog Builder durable state. It is preparation, not evidence that backups exist, restore tooling works, a rehearsal passed, or recovery objectives are approved.

BackupModal is a partial client/local JSON snapshot. At the reviewed base it exports products, family columns, the current catalog, and custom presets from browser/client state. It is not a complete PostgreSQL backup, complete Storage backup, Auth backup, full disaster recovery, or proof of recoverability. It does not capture a database-consistent point in time, all catalogs, schema, users, profiles, policies, grants, RPCs, triggers, Realtime configuration, Storage buckets and objects, or every durable domain record.

DR CLOSED: NO.
RESTORE REHEARSAL EXECUTED: NO.
PRODUCTION RECOVERY VERIFIED: NO.

## Authority and preconditions

Only the designated incident commander may authorize recovery. A database/platform operator performs database, Auth, and Storage work; a security owner validates identity and authorization; an application owner validates domain behavior; and a release owner controls application rollback. Names and approvals belong in the incident record.

Before recovery:

1. Identify the incident, commander, operators, approvers, environment, intended restore point, and accepted data-loss window.
2. Freeze application and automated writes through an approved reversible control.
3. Preserve logs and forensic evidence before remediation.
4. Record deployed application SHA, migration ledger, database version/extensions, Auth configuration, Storage buckets, policies, grants, RPCs, and Realtime state.
5. Verify all endpoints and credentials. Rehearsals use disposable credentials and never production credentials.
6. Inventory the actual environment. Repository migrations express intended state and are not evidence of live deployment.

## Durable data inventory

The recovery manifest must resolve the actual authoritative relation, object path, or canonical payload for every class. Unknown authority or deployed/repository divergence is a stop condition.

| Durable class | Expected authority | Backup requirement | Restore dependency and integrity checks |
|---|---|---|---|
| Catalogs | Database catalog rows and deployed catalog-version snapshots | Consistent rows, links, status/version metadata, and complete payloads | After identities; verify IDs, counts, statuses, JSON schema, links, and snapshot immutability |
| Versions | Catalog and product version relations where deployed | Every revision with parent, author, time, status, and immutable payload/hash | After parents; verify unique parent/version, monotonic history, authors, hashes, and immutability |
| Products | Database products | IDs, SKU, family/catalog references, status, version, technical payload, provenance | After families; verify IDs/SKUs under the deployed contract and all references |
| Families | Product family relation where deployed | Stable IDs/slugs, ordering, status, audit metadata | Before products, family fields, and family workbooks; verify unique slugs and references |
| Fields | Catalog and family field definitions plus confirmed canonical embedded definitions | Key, label, type, order, visibility, system flags, and parent | After catalog/family parents; verify parent, key uniqueness, supported types, and order |
| Workbooks | Canonical full workbook payload and revision where deployed | Full JSON with owner, schema version, revision, sources, data, and datasets | After owners and sources; verify one-per-owner rules, schema, revision, and reference closure |
| Datums | Canonical datum map inside workbook; indexes are projections | Preserve inside full workbook payload | With workbooks; verify datum ID, semantic key, type, unit, status, and evidence |
| Datasets | Canonical datasets inside workbook; search index is a projection | Preserve inside full workbook payload | With workbooks; verify dataset/row/column IDs, cell coordinates, datum references, types, and units |
| Source documents | Source-document metadata plus hosted bytes or durable external reference | Metadata, checksums, immutable bytes where hosted, and provenance | Before workbooks/evidence; verify checksum, formats, reachability, and no orphan evidence |
| Evidence | Evidence references in canonical payloads and any deployed evidence records | Canonical containing payload plus referenced source metadata/bytes | After sources; verify every document and locator reference |
| Canonical decisions | Approved/versioned domain decisions and audit/change history | State, actors, timestamps, linked evidence, and immutable history | After identities and parents; verify actor/reference chain and no history rewrite |
| Templates | Database templates and deployed version/CAS metadata | All server templates and revisions; client presets separately | After identities; verify IDs, ownership, versions, schema, and references |
| Assets | Asset metadata, product links, legacy media if present, and audit history | Metadata plus bucket/key, checksum, size, MIME, approval, provenance, and bytes | After products; verify each row/object pair, checksums, approval, and primary-link uniqueness |
| Storage bytes | Objects in every inventoried bucket | Provider-supported export with bucket config, keys, versions, checksums, sizes, and metadata | After bucket creation; compare object count, total bytes, hashes, and orphan rows/objects |
| Auth/profiles | Auth provider identities/config and database profiles | Provider-supported identity recovery path plus profiles, roles, activation and stable mapping | Before authored data; verify identity mapping, disabled state, roles, login, refresh, and revocation |
| Workspace layouts | Confirmed canonical catalog/template/workbook payload location | Complete layout JSON, version, order, dimensions, and references | After dependencies; validate schema, geometry, order, assets, templates, and representative render |
| Semantic registry | Deployed canonical registry or proven versioned domain definitions | Exact version, keys, aliases, types, units, constraints, and provenance | Before semantic validation; verify key uniqueness, referential closure, type/unit compatibility |
| Local preferences | Browser storage such as learn mode, tour state, palettes, styles, family columns, and presets | Optional per-user export with consent and schema/version | Restore last; validate shape and prevent overwrite of shared authoritative data |

Also inventory catalog-product links, audit logs, library change events, AI execution logs, asset audit logs, migration metadata, enums, extensions, constraints, indexes, triggers, functions, policies, grants, publications, and configuration references. Never place credentials or secret values in a manifest.

## Complete backup set

A usable backup set includes:

- schema/control-plane capture: migration ledger, schema, types, extensions, constraints, indexes, triggers, functions/RPCs, grants, RLS policies, Realtime publications/replica identity, Auth metadata, and Storage bucket configuration;
- a transactionally consistent database data backup for every inventoried durable relation;
- a provider-supported Auth export or documented identity recovery path with stable profile mapping;
- Storage object export with bucket/key, size, checksum, MIME, object version where available, and metadata;
- immutable application/release identifiers;
- a manifest with backup ID, source environment, consistency method, timestamps, encryption/key reference, retention class, tool versions, row/object counts, total bytes, checksums, operator, and reviewer.

A successful command alone does not prove usability. A second authorized reviewer verifies readability, checksums, decryptability, retention, and storage outside the protected failure domain.

## Restore dependency order

1. Schema strategy: provision a compatible target; restore captured schema or apply the exact reviewed migration path selected for the backup schema version. Record migrations, extensions, enums, constraints, indexes, triggers, functions, and owners.
2. Auth/profiles: restore test or authorized identities through the provider-supported path, then profiles, roles, and activation mapping.
3. Families/products/catalogs/templates: load parent/reference data, links, and versions in dependency-safe order.
4. Sources: restore source metadata and hosted bytes/references; verify checksums.
5. Workbooks/evidence: restore canonical workbook payloads and revisions; validate owners and every evidence reference.
6. Assets/Storage: create buckets/configuration, restore bytes, then asset metadata, links, approval/provenance, and audit records.
7. Projections/rebuilds: rebuild technical/dataset/search indexes, views, caches, thumbnails, PDFs, and other derived state from canonical data.
8. Security/integration validation: validate FK/check/unique constraints, RLS and policies, grants/revokes, function ownership/search path, RPC execution and CAS behavior, Auth, Storage access, Realtime publications, replica identity, and authorized event delivery.

Do not mix an old backup with unreviewed newer migrations. Do not use backed-up projections to overwrite canonical payloads.

## Acceptance checks

The restore is technically acceptable only when evidence shows:

- row counts, object counts, total bytes, and hashes reconcile with every difference explained;
- zero unexplained FK, owner, source/evidence, catalog-product, or asset row/object orphans;
- canonical payload versions are recognized and immutable histories remain immutable;
- projections rebuild deterministically from canonical data;
- admin/editor/viewer/disabled/anonymous tests prove intended allow and deny behavior;
- RLS, grants, RPC permissions, CAS/revision handling, Storage policy, and Realtime isolation pass;
- representative catalogs, products, templates, layouts, workbooks, sources, evidence, assets, and exports render correctly;
- the isolated application smoke test uses no production endpoint or credential.

The incident commander, security owner, and system owner record acceptance. Failed or waived mandatory checks keep DR open.

## RPO and RTO categories

No business SLA number is defined here.

| Category | RPO subject | RTO subject |
|---|---|---|
| Identity and authorization | Identity, role, and activation changes | Restore safe access without privilege expansion |
| Canonical operational data | Catalog, product, family, field, template, workbook, datum, dataset, evidence, and decision commits | Restore validated read/write operation |
| Version and audit history | Snapshots, approvals, and audit/change events | Make history available for validation and rollback |
| Assets and sources | Uploaded/changed bytes and metadata | Restore complete verified media/source availability |
| Derived projections | Confirm any non-rebuildable exception | Rebuild search, caches, thumbnails, and derived output |
| Local preferences | Per-user convenience tolerance | Optional preference restoration |

RPO and RTO remain TBD and unapproved until owners approve numeric targets based on measured evidence.

## Closure

DR closure requires an approved backup policy, monitored execution, retention/encryption/key-recovery evidence, a successful end-to-end disposable rehearsal, measured and approved RPO/RTO, resolved critical defects, and signed acceptance. This document closes none of those gates.

See the recovery rehearsal plan, release rollback runbook, incident response runbook, and RR018 recovery preflight in this documentation set.
