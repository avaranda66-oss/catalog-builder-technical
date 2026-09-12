# Catalog Builder VNext — W3 Save / Reopen / Catalog Library Contract

STATUS: **W3.0 CANONICAL**

DATE: 2026-09-11

PURPOSE: freeze the W3 persistence/lifecycle architecture before any W3 implementation begins.

Canonical base verified before this contract was authored: `main` SHA `6321155d0b88e52758cfb7138070c036845c359b`, tree `29b5964878914828778c2125cd177b81b068af17`, direct parent `3810b4c70b9415f43c7cb0360d6525b5a1823c22`. PR #27 is merged. Post-closeout Quality Gate run `34649885701` completed `SUCCESS` on the canonical SHA.

Input provenance: independent W3 repository research by Gemini is **COMPLETE**. Principal confrontation verdict is **A — W3 RESEARCH ACCEPTED**. This document converts that accepted research and Principal decisions into the canonical repository contract. PR #28 was merged; canonical promotion SHA is `b34156c597dcd47a5ab6d154f73ffa7a323d4664`.

W3.0 is canonical. W3.A is implemented, amended, under review, and not canonical. W3.B is **NOT STARTED**. The final W3.A persistence-identity amendment was discovered during independent W3.B adversarial preflight; it freezes forward contracts only and does not implement W3.B infrastructure.

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

For new W3 catalog roots, `catalogId` must use the canonical lowercase UUID textual form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, with lowercase hexadecimal characters only. Input is never trimmed, lowercased, regenerated, or otherwise normalized to satisfy this rule. This does not authorize a global conversion of all nested canonical IDs to UUID. Nested Page/Object/Table/Cell/RichText identities remain governed by the existing canonical allocator.

Duplicate and Starter creation require a fresh complete canonical identity closure. Shared immutable `AssetRef`s may remain shared references.

An already-valid `CatalogDocument` whose root ID is not persistence-compatible, including an uppercase UUID or a non-UUID root, remains valid canonical/in-memory/import/proof content when it otherwise satisfies the authored schema. Ordinary Save or Reopen must not silently rewrite that root identity. If such a document must enter durable W3 catalog persistence, the supported boundary is explicit creation of a new persistence-compatible catalog/copy/import result with a fresh canonical lowercase UUID root, complete fresh canonical identity closure, semantically preserved authored content, intentionally shareable immutable `AssetRef`s, and new persistence/recovery lineage while leaving the original document identity untouched. Direct persistence under the old incompatible identity may instead fail explicitly as persistence-incompatible and then offer that controlled creation path. The old and new roots must never be treated as the same logical catalog.

## 3. Remote revision

Remote revision is persistence/session state, not authored content.

Conceptual persistence/session handle:

```text
catalogId
remoteRevision
lastMutationId
localEditSequence
saveStatus
```

`lastMutationId` is persistence/session metadata recording the server-confirmed identity of the latest durable mutation. It is not authored state and never enters `CatalogDocument` or Undo/Redo. `CatalogDocument.source.serverVersion` must not become the live CAS token. A save acknowledgement that advances remote revision must not mutate the authored canonical document or create Undo history. Existing `source.serverVersion` remains provenance semantics unless a future authored-schema contract explicitly changes it.

## 4. Persistence representation

Persist one complete validated `CatalogDocument` snapshot surrounded by thin persistence/index metadata.

After canonical validation, the durable JSON-safe representation maps optional object-property `undefined` to property absence and numeric `-0` to numeric `0`; all other defined canonical authored structure and values remain exact. No other normalization, default insertion, rounding, array reordering, ID change, unit conversion, or renderer repair is authorized.

Conceptually:

```text
catalogId
remoteRevision
lastMutationId
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

Because new durable roots use the frozen canonical lowercase UUID textual form, a future persistence adapter may store the root in a native database UUID type provided it proves exact textual round-trip equality back to the authored `CatalogDocument.id`. Existing uppercase or otherwise incompatible roots are never normalized into that storage form; they use the controlled copy/import creation path above when durable persistence is desired.

## 6. Save semantics

Canonical save flow:

```text
capture immutable CatalogDocument
→ canonical validation
→ allocate required persistence mutationId before dispatch
→ expected remote revision
→ server transaction / lock
→ strict CAS
→ persist snapshot
→ increment revision
→ append immutable revision history
→ remote ACK
```

Create, Save CAS, and Archive CAS each carry a required `mutationId` using the same canonical lowercase UUID textual rule as durable roots. The identifier is persistence metadata, is allocated before dispatch, survives ambiguous-outcome handling unchanged, and never enters the authored snapshot or changes `CatalogDocument.schemaVersion`.

`Saved` means the server acknowledged the canonical snapshot corresponding to the latest relevant local edit state.

IndexedDB/localStorage writes, queued requests, optimistic UI, toasts, or request-start events do not mean `Saved`.

An asynchronous Save success, error, or timeout completion may affect active-session persistence state only when it is proven to belong to the still-relevant logical catalog, editing/open-session lineage, save operation/attempt lineage, and captured local edit state. Exact implementation fields are not frozen.

Required acknowledgement behavior:

```text
L1 exists
→ Save S1 captures L1 and starts
→ user creates L2 while S1 is in flight
→ S1 returns success
```

If S1 is still a valid operation for that session, its acknowledgement may advance the confirmed remote base revision and acknowledges only the local edit state captured by S1. L2 remains dirty/pending. The UI must not become `Saved` merely because S1 succeeded.

If a request was sent but the client times out or loses transport before learning the authoritative result, commit outcome is ambiguous: the server may or may not have committed. Transport timeout therefore proves neither failure nor success. The client must not advance its expected remote revision merely because the request may have succeeded, must not claim `Saved`, must not blindly retry stale authored content against a newly observed revision, and must preserve local work. Before the next remote mutation it must reconcile against authoritative remote state/revision plus the server-confirmed `lastMutationId`.

For an ambiguous mutation `M1`, a future authoritative read may conclude: `lastMutationId === M1` means that exact mutation committed; prior remote revision with a different `lastMutationId` means `M1` did not commit; remote state advanced under a different mutation means conflict/reconciliation is required. No revision guessing and no blind automatic retry are authorized. W3.A freezes only the information required for this future W3.B/W3.C behavior.

Mutation identity uniqueness is scoped by logical catalog, conceptually `UNIQUE(catalogId, mutationId)`. Replaying the same mutation ID with the same operation and effective payload may return the already-committed result idempotently and must not advance revision again. Reusing the same mutation ID with different intent or payload fails closed and creates no new revision. W3.A records this principle without adding SQL or a repository implementation.

## 7. Concurrency

No silent last-write-wins.

Only one remote save per catalog/session may be in flight. Additional local edits remain pending/dirty. Late or stale completion must never regress the document, local edit sequence, remote revision, or save status.

A completion from a previous catalog, a previous open/reopen session, a previous login/session lineage, or a stale save attempt is inert with respect to the current editing session.

CAS remains the correctness authority. Realtime/Presence is not required for W3 correctness.

## 8. Conflict

Stale saves fail closed and local work remains protected.

Father V1 conflict choices are:

- **Open latest server version**
- **Save my work as a copy**

Do not silently retry stale local content against a newer revision. Do not expose remote overwrite as a normal Father V1 action. Do not implement automatic document merging in W3. Local conflict work must be protected before any destructive discard.

**Save my work as a copy** is a new-catalog creation path. It must perform the same complete fresh identity closure required for Starter/Duplicate: fresh UUID-compatible root `catalogId`; fresh Page, Object, Group/descendant, Table/Row/Column/Cell, annotation/legend, RichText paragraph/inline, and every other canonical identity-bearing node. Immutable `AssetRef`s may remain shared. The copy inherits no remote revision and no active CAS authority, establishes new persistence lineage and a recovery namespace keyed to the new catalog, and has no live relationship capable of later mutating, overwriting, unarchiving, or resurrecting the original conflicting catalog. The stale source document remains preserved until explicit conflict resolution is safely completed. Exact future action/service naming is not frozen.

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

The W3.A type boundary keeps `lastMutationId` on exact catalog/mutation persistence state while omitting it from `CatalogListItem`; Library rows also contain no `documentSnapshot`.

Hard Delete is deferred. Folders, approval workflow, advanced owner management, collaboration, and realtime are outside the W3 minimum.

### Rename authority

`CatalogDocument.title` is canonical authored content. Catalog Library Rename therefore must mutate `CatalogDocument.title` through structured lifecycle/application authority below React; it must not update only a Library/database metadata title or create an independent metadata title authority.

Rename must persist the resulting complete validated `CatalogDocument` snapshot using strict expected-revision CAS. A successful Rename advances the same remote persistence revision used by canonical Save, updates the canonical snapshot and lightweight title projection atomically/consistently, and participates in revision history. A stale Rename fails closed and must not create a Library-only document authority.

The exact future TypeScript action/service name is not frozen here. Names such as `catalog.rename` are illustrative only; the semantic authority above is frozen.

## 14. Archive

Father V1 W3 exposes Archive, not permanent Delete.

Do not silently reuse the Legacy `catalog_status` enum for archive. Repository evidence shows its original values are `draft`, `review`, `approved`, and `published`, while later Legacy RPCs attempted to accept `archived`.

W3 must resolve archive explicitly, preferably through dedicated lifecycle metadata such as `archivedAt` / `archived_at` or an equivalently explicit VNext design. Legacy enum semantics must not be casually extended.

Archive is persistence/lifecycle metadata. Archiving a catalog does not mutate authored `CatalogDocument` content merely to encode lifecycle state; metadata such as `archivedAt` remains outside the authored document.

Archive must execute through structured lifecycle authority below React and must be CAS-protected against the current remote revision/concurrency token. A successful Archive must atomically change lifecycle state and advance or otherwise invalidate that same concurrency token so already-open stale sessions cannot write through it.

After Archive, ordinary Save against the archived catalog fails closed. Stale Rename against the archived catalog fails closed. A stale open tab must not recreate, implicitly unarchive, or overwrite an archived catalog through normal Save. Hard Delete remains outside Father-V1 W3.

Conceptually:

```text
open r8
→ Archive expected r8
→ lifecycle state changes atomically
→ concurrency token becomes r9 or equivalent
→ any stale operation using r8 fails
```

Exact SQL, table, RPC, or token representation is not frozen in W3.0; the concurrency invariant is.

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

The same fail-safe class applies when durable resolution materially disagrees with canonical `AssetRef` integrity metadata such as asset version, SHA-256, MIME type, or dimensions. Preserve the canonical `AssetRef`; treat the resource as unavailable/corrupt/integrity-failed for publication; surface an explicit diagnostic; allow degraded repair editing where safe; and block publication while the required asset cannot be verified. Changing the canonical reference requires explicit repair/relink/replacement. Signed-URL expiration alone is runtime resource resolution and must not mutate authored integrity metadata.

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

The future structured persistence layer must distinguish semantic outcomes sufficient to drive safe retry/lifecycle policy. Exact transport errors, HTTP/PostgreSQL codes, enum names, and TypeScript names are not frozen, but outcomes equivalent to at least the following are required:

- `NOT_FOUND`
- `UNAUTHORIZED`
- `ARCHIVED`
- `CONFLICT`
- `INVALID_DOCUMENT`
- `UNSUPPORTED_VERSION`
- `OFFLINE`
- `REMOTE_FAILURE`
- `AMBIGUOUS_COMMIT_OUTCOME`

Safety semantics are frozen: `CONFLICT` suspends blind automatic remote retry and enters explicit conflict flow while preserving local work; `ARCHIVED` never falls through to "not found, therefore create" and cannot implicitly recreate/unarchive; `UNAUTHORIZED`, `INVALID_DOCUMENT`, and `UNSUPPORTED_VERSION` do not enter normal autosave retry loops; `OFFLINE` and `REMOTE_FAILURE` leave local work unsaved/recoverable and never produce false `Saved`; `AMBIGUOUS_COMMIT_OUTCOME` requires authoritative reconciliation before the next mutation and no guessed revision advancement; `NOT_FOUND` does not imply create for an existing catalog unless the explicit lifecycle operation is catalog creation.

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

- exact semantic/structural `CatalogDocument` serialize/reopen equality in the durable JSON-safe representation, where optional object-property `undefined` is absence and numeric `-0` is numeric `0`, with all other defined canonical authored structure and values exact;
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
- async completion acceptance is bound to the relevant catalog/session/save-attempt/captured-edit lineage, including the L1/S1/L2 case where S1 may advance confirmed remote base revision but L2 remains dirty;
- late/stale completions from old catalog/open/login/save-attempt lineage are inert;
- ambiguous timeout/unknown commit outcome preserves local work, does not guess revision or `Saved`, and reconciles authoritative remote state before the next mutation;
- `Saved` only after the correct remote ACK;
- remote failure remains dirty/recoverable;
- exact-catalog recovery;
- stale recovery never auto-overwrites;
- unsupported-schema failure;
- fresh UUID-compatible blank catalog root;
- full fresh identity closure for Starter/Duplicate;
- Save-as-copy has zero forbidden canonical identity overlap with the source, may intentionally share immutable `AssetRef`s, uses a fresh UUID-compatible root and new persistence/recovery lineage, inherits no source remote revision, and does not mutate the original;
- a valid pre-W3 non-UUID-root document remains valid canonical content, ordinary persistence never silently rewrites its root, and explicit compatible copy/import creation yields a UUID-compatible root with complete fresh identity closure while preserving the original identity;
- archive prevents stale recreation;
- Library Rename mutates canonical `CatalogDocument.title`, survives save/reopen, and keeps the lightweight title projection equal to the canonical title;
- successful Rename advances the remote revision and participates in revision history;
- stale Rename CAS is rejected and no metadata-only title authority exists;
- Archive race proof: if Tab A and Tab B open revision N and Tab A archives successfully, Tab B normal Save using N is rejected;
- the same Archive race rejects Tab B stale Rename using N, does not recreate or silently unarchive the catalog, and does not mutate authored snapshot content merely to represent archive;
- missing-asset degraded editing plus publication block;
- asset hash/version/dimension/MIME mismatch preserves canonical `AssetRef`, produces explicit integrity diagnostic/degraded repair behavior, and blocks publication until explicit repair;
- repository/service outcome semantics distinguish not-found, unauthorized, archived, conflict, invalid document, unsupported version, offline, remote failure, and ambiguous commit outcome sufficiently to prevent unsafe retries, false `Saved`, guessed revision advancement, stale recreation, or archive resurrection;
- Save/autosave do not alter Undo history;
- reopen starts new Undo history;
- React has no independent persistence authority;
- Father browser flow `create → edit → save → close → reopen → continue`;
- safe Father conflict flow.

## Governance gate

This contract is **CANONICAL**.

PR #28 merged and promoted W3.0 canonically at `b34156c597dcd47a5ab6d154f73ffa7a323d4664`. The W3.0 governance gate is closed; implementation slices proceed under their own review and merge gates.
