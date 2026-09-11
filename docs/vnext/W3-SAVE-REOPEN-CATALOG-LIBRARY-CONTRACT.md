# Catalog Builder VNext — W3 Save / Reopen / Catalog Library Contract

STATUS: **W3.0 UNDER REVIEW / NOT CANONICAL YET**

DATE: 2026-09-11

PURPOSE: freeze the W3 persistence/lifecycle architecture before any W3 implementation begins.

Canonical base verified before this contract was authored: `main` SHA `6321155d0b88e52758cfb7138070c036845c359b`, tree `29b5964878914828778c2125cd177b81b068af17`, direct parent `3810b4c70b9415f43c7cb0360d6525b5a1823c22`. PR #27 is merged. Post-closeout Quality Gate run `34649885701` completed `SUCCESS` on the canonical SHA.

Input provenance: independent W3 repository research by Gemini is **COMPLETE**. Principal confrontation verdict is **A — W3 RESEARCH ACCEPTED**. This document converts that accepted research and Principal decisions into a reviewable repository contract. It is not canonical until its PR is Principal-audited and explicitly authorized for merge.

W3 implementation is **NOT STARTED**.

## Father V1 north star

W3 must eventually enable the ordinary office-user flow:

```text
create
→ edit
→ save
→ close
→ reopen
→ continue safely
```

The Father V1 user must not need to understand CAS, revision numbers, database rows, JSON, storage paths, conflict internals, or Git-style versions.

Roadmap remains:

```text
W3 Save/Reopen/Catalog Library
→ W4 Advanced Table Editor
→ W5 Complete Translation
→ W6 Publication Integration + Minimum Easy Button Layer
→ FIRST FATHER PILOT
→ W7 evidence-driven maturation
```

## 1. Canonical authority

`CatalogDocument` remains the sole authored document authority.

Persistence stores a validated representation of that existing canonical authority. W3 must not introduce normalized Pages/Objects/Tables as a second persistence document model, Legacy `Catalog` as VNext authority, persisted Zustand state as canonical authority, or React state as persistence authority.

## 2. Logical catalog identity

`CatalogDocument.id` is the stable logical `catalogId`.

For new W3 catalog roots, `catalogId` must be UUID-compatible with durable persistence. This does not authorize a global conversion of all nested canonical IDs to UUID. Nested Page/Object/Table/Cell/RichText identities remain governed by the existing canonical allocator.

Duplicate and Starter creation require a fresh complete canonical identity closure. Shared immutable `AssetRef`s may remain shared references.

## 3. Remote revision

Remote revision is persistence/session state, not authored content.

Conceptual persistence/session handle:

```text
catalogId
remoteRevision
localEditSequence
saveStatus
```

`CatalogDocument.source.serverVersion` must not become the live CAS token. A save acknowledgement that advances remote revision must not mutate the authored canonical document or create Undo history. Existing `source.serverVersion` remains provenance semantics unless a future authored-schema contract explicitly changes it.

## 4. Persistence representation

Persist one complete validated `CatalogDocument` snapshot surrounded by thin persistence/index metadata.

Conceptually:

```text
catalogId
remoteRevision
title projection
locale projection
createdAt
updatedAt
createdBy
updatedBy
archivedAt
origin metadata
document schema metadata
document payload
```

Do not normalize the canonical document hierarchy into a parallel database document authority. Metadata projections must remain consistent with the canonical snapshot.

## 5. Explicit VNext persistence boundary

Legacy `brand` is not the semantic VNext persistence contract. Legacy `save_catalog_v3` is not the final VNext repository authority.

W3 may salvage proven mechanisms: Supabase infrastructure, Auth/session, RLS, `require_document_editor_v1()`, row locking, expected revision, strict CAS, server-owned monotonic revision, and atomic document/history persistence.

The eventual W3.B implementation must establish an explicit VNext persistence namespace/payload/repository/RPC boundary. Exact SQL/table/RPC names are not frozen in W3.0. The architectural requirement is that VNext persistence does not hydrate or depend on the Legacy `Catalog` document model.

## 6. Save semantics

Canonical save flow:

```text
capture immutable CatalogDocument
→ canonical validation
→ expected remote revision
→ server transaction / lock
→ strict CAS
→ persist snapshot
→ increment revision
→ append immutable revision history
→ remote ACK
```

`Saved` means the server acknowledged the canonical snapshot corresponding to the latest relevant local edit state.

IndexedDB/localStorage writes, queued requests, optimistic UI, toasts, or request-start events do not mean `Saved`.

## 7. Concurrency

No silent last-write-wins.

Only one remote save per catalog/session may be in flight. Additional local edits remain pending/dirty. Late or stale completion must never regress the document, local edit sequence, remote revision, or save status.

CAS remains the correctness authority. Realtime/Presence is not required for W3 correctness.

## 8. Conflict

Stale saves fail closed and local work remains protected.

Father V1 conflict choices are:

- **Open latest server version**
- **Save my work as a copy**

Do not silently retry stale local content against a newer revision. Do not expose remote overwrite as a normal Father V1 action. Do not implement automatic document merging in W3. Local conflict work must be protected before any destructive discard.

## 9. Manual Save / autosave

Final W3 includes both manual Save and autosave. Both use the same `SaveCoordinator` authority.

Implementation order is manual Save/CAS first; autosave only after concurrency invariants are proven.

Manual Save is an immediate flush. Autosave debounces/coalesces. Exact debounce duration is not architectural contract. Conflict suspends automatic remote save until explicitly resolved.

## 10. Local recovery

Local recovery is separate from canonical remote persistence. Recovery is not `Saved`.

Minimum conceptual recovery record:

```text
catalogId
baseRemoteRevision
documentSchemaVersion
canonical snapshot
local edit sequence or content digest
recoveryUpdatedAt
```

Recovery must be exact-catalog scoped and must never silently overwrite a newer remote revision. If both server and local recovery advanced, require explicit user choice. Legacy "load any cached catalog" behavior must not return.

## 11. Reopen

Frozen reopen pipeline:

```text
fetch persistence record
→ verify catalog identity
→ inspect document schema version
→ supported pure migration if necessary
→ CatalogDocument schema parse
→ canonical domain/table validation
→ verify persistence catalogId == document.id
→ bind remote revision outside authored document
→ resolve/check AssetRefs
→ create fresh DocumentSession
→ render
```

The renderer does not repair persisted data. React does not migrate persisted documents. Invalid persisted data never enters `DocumentSession`.

## 12. Undo / Redo

Save does not clear Undo. Autosave does not create Undo entries. Persistence acknowledgements do not create authored history.

Undo/Redo remains session-only. Reopen begins a new session with empty Undo/Redo. W3 does not persist Undo history.

## 13. Catalog Library

Minimum Father V1 W3 Library:

- Create
- Open
- Rename
- Duplicate
- Archive

Minimum list metadata:

- title
- locale
- last updated
- active/archived state

Library listing must use lightweight metadata. Do not download every full `CatalogDocument` merely to render a list.

Hard Delete is deferred. Folders, approval workflow, advanced owner management, collaboration, and realtime are outside the W3 minimum.

## 14. Archive

Father V1 W3 exposes Archive, not permanent Delete.

Do not silently reuse the Legacy `catalog_status` enum for archive. Repository evidence shows its original values are `draft`, `review`, `approved`, and `published`, while later Legacy RPCs attempted to accept `archived`.

W3 must resolve archive explicitly, preferably through dedicated lifecycle metadata such as `archivedAt` / `archived_at` or an equivalently explicit VNext design. Legacy enum semantics must not be casually extended.

## 15. Starter / Duplicate

Blank and Starter-created catalogs become ordinary `CatalogDocument`s.

```text
Starter != Special Document Engine
Template != Renderer
Component != Special Engine
```

Fresh canonical identities are mandatory across the complete identity graph, including document, pages, objects, tables, rows, columns, cells, annotations, legends, RichText paragraphs/inlines, Groups/descendants, and any other canonical identity-bearing structures.

Shared immutable `AssetRef`s may remain shared references. Optional origin metadata may include `originKind`, `originId`, and `originRevision`. There is no live Starter/Template linkage.

## 16. Assets

`CatalogDocument` stores `AssetRef`, not binary media and not signed URLs.

Future asset flow:

```text
upload bytes
→ finalize durable asset
→ construct/validate AssetRef
→ typed canonical document mutation
→ catalog save
```

If upload fails, do not create a document reference. If asset finalization succeeds but catalog save fails, the document remains dirty/recoverable.

If a referenced asset later becomes unavailable, preserve the `AssetRef`, open the catalog in degraded repair mode, show an explicit placeholder/diagnostic, and block publication until resolved. Never silently remove or replace the reference.

## 17. Supabase / Legacy salvage

SALVAGE:

- Supabase bootstrap/client
- auth/session refresh
- `team_role()`
- `require_document_editor_v1()`
- RLS patterns
- row-lock/CAS transaction pattern
- asset storage infrastructure

ADAPT:

- save RPC concepts
- recovery storage technology
- Legacy save queue/concurrency algorithms
- asset service
- Legacy persistence tests as evidence/specification

REJECT AS VNEXT AUTHORITY:

- Legacy `Catalog` model
- `useCatalogStore`
- `catalogRowToCatalog`
- Legacy document lifecycle authority
- Realtime/Presence as a correctness requirement

## 18. Owner UX

W3 Father V1 does not require owner display or ownership-management UI. Auth/RLS and actor metadata remain infrastructure. Shared corporate/team access is sufficient unless later product evidence requires ownership UX.

## 19. Document schema

`CatalogDocument.schemaVersion` remains `1` unless the authored document schema actually changes. Database migration version and document `schemaVersion` are distinct concepts.

Future loading:

```text
raw snapshot
→ inspect schemaVersion
→ supported pure migration
→ canonical parse/validation
```

Unsupported newer schema fails explicitly. No renderer repair. No React migration. No silent field dropping.

## 20. AI-ready authoring

Persistence/lifecycle authority must live below React. Human UI and future AI should eventually share the same structured services/Application Actions.

Saving a complete validated canonical snapshot is legitimate persistence. It must not become an arbitrary editing primitive equivalent to `replaceDocument(arbitraryJson)`.

There are no privileged AI-only mutation semantics. Autonomous AI remains future work.

## 21. Failure UX

Father-facing states must support:

- Opening
- Saved
- Unsaved changes
- Saving
- Offline
- Save failed
- Conflict detected
- Recovery available
- Open failed
- Invalid/incompatible document
- Missing asset

Normal Father UX hides CAS/revision terminology.

## 22. Out of scope

W3 does not introduce CRDT, Presence, live cursors, Google-Docs-style merging, enterprise locking, approval workflow, branch/version browser, PIM/ERP integration, translation engine, W4 advanced table editing, or autonomous AI authoring.

## Frozen implementation slicing

After W3.0 becomes canonical, implementation order is:

1. **W3.A — Persistence contracts + exact canonical round-trip**
2. **W3.B — VNext-specific Supabase snapshot/CAS/revision history**
3. **W3.C — Manual Save + canonical Reopen**
4. **W3.D — Local Recovery**
5. **W3.E — Catalog Library**
6. **W3.F — Starter/Duplicate complete identity proof**
7. **W3.G — Asset persistence bridge**
8. **W3.H — Autosave + adversarial concurrency**
9. **W3.I — Father workflow browser proof + W3 closeout**

W3.0 implements none of these slices.

## Future evidence contract

W3 implementation must eventually prove at minimum:

- exact `CatalogDocument` serialize/reopen equality;
- exact preservation of integer-U geometry;
- Text/RichText identity preservation;
- Table IDs/spans/annotations/legends preservation;
- Group-local frame preservation;
- `AssetRef` preservation;
- stable logical `catalogId`;
- exact monotonic remote revision increment;
- strict stale-CAS rejection;
- two-tab conflict behavior;
- in-flight edit preservation;
- late response inertness;
- `Saved` only after the correct remote ACK;
- remote failure remains dirty/recoverable;
- exact-catalog recovery;
- stale recovery never auto-overwrites;
- unsupported-schema failure;
- fresh UUID-compatible blank catalog root;
- full fresh identity closure for Starter/Duplicate;
- archive prevents stale recreation;
- missing-asset degraded editing plus publication block;
- Save/autosave do not alter Undo history;
- reopen starts new Undo history;
- React has no independent persistence authority;
- Father browser flow `create → edit → save → close → reopen → continue`;
- safe Father conflict flow.

## Governance gate

This contract is **UNDER REVIEW / NOT CANONICAL YET**.

Next gate: Principal audit of the W3.0 contract PR. W3 implementation remains blocked until this contract is accepted and merged with explicit user authorization.
