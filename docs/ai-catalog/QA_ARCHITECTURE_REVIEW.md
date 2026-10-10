# Independent QA architecture review

Date: 2026-10-09. Scope: independent bounded architecture/source/test/proof review of the additive local synthetic prototype.
Base: main `1c3dbb1a4dfb6fd7b0a32ebbb5dea1dee151d014`; PR #67 at `893b382` remains isolated.

## Disposition

The bounded structured-specification → typed plan → canonical compiler design is compatible with the existing application. **Implementation accepted for the frozen local synthetic prototype**, based on independent source/persistence/history tests, four local gates and independent source/saved-record/PDF audits of built Chromium and Edge runs. No skills, external model calls or production actions were used for this review. Current receipts bind source bytes before commit; remote exact-head CI is pending.

Existing authorities can be reused without a second document format: `parseCanonicalDocument` combines the strict schema and document/table validation; `page.template.insert` validates registry identity, tables and assets before allocation; `instantiatePageWithFreshIds` remaps a complete page; `DocumentSession` retains immutable history. `reviewPublication` loads resources, measures the canonical renderer, compares two physical snapshots and rejects stale source authority. Static page limits must never substitute for that publication review.

## Required contract boundaries

- Intake owns literal values, units, conditions, model/section associations, explicit missing reasons and all conflicting candidates. Source identity identifies the declared fixture UTF-8 page payload, not a PDF byte stream.
- The planner chooses allowlisted presentation, ordering and complete-row chunks only. It cannot return new technical strings, arbitrary HTML/CSS, commands or canonical IDs.
- The compiler validates input and source references, builds page templates and applies commands in an isolated candidate session. A failed action cannot expose a partially generated candidate or overwrite the confirmed document.
- Technical text uses RichText and explicit empty content. Number conversion, decimal localization and the canonical measurement grammar must not rewrite source strings. Preserve leading zeros, commas, signs, Unicode, multiline and legitimate blanks.
- Each technical cell has a unique complete binding to its model, section, fact, selected candidate and source. Exact cell content must match the selected source literal; quote substring presence alone is insufficient to prove that association.
- Missing information and conflicts remain distinct from a legitimate empty value. Approval requires explicit missing acknowledgment or selected conflict candidate, retaining alternatives in provenance.
- Approval binds the complete current canonical document, the source/provenance data and review dispositions. Exclude the approval token itself from its hash. Changes to content, style, geometry, source, plan or disposition invalidate the token. Reaching an earlier approved snapshot by Undo is valid only if all bound data also match.
- Persist the document, sidecar and approval as one atomic record. Reopen and publication check the same digest and saved revision. Do not create an approval that is current only for an unsaved or unrelated snapshot.
- A localStorage adapter must not imply authenticated tenant security or atomic cross-tab CAS. If hashing awaits before commit, revision must be reread after the await; cross-tab serialization requires a real lock or an explicit single-context boundary.

Generation can be the initial session snapshot, with refinements handled by existing history. If the UI promises one-step generation Undo, coalesce the isolated command sequence under one transaction ID and verify the complete before/after graph. No generic replace-document action is needed for initial candidate generation.

## Meaningful independent tests planned

The root owns compiler/layout tests. QA's 23 source/review/persistence tests cover association tampering; quote/value/unit/condition/model mismatch; legitimate blank versus missing/conflict; approval invalidation after style/content/source/disposition changes; complete document Undo/Redo equality for a typed refinement; saved sidecar/document consistency across real asynchronous hashing; exact replay; stale/conflicting adapter CAS; and corrupted reopen rejection. Two deferred-promise UI tests cover cancelled generation and a late Library query. All 31 focused prototype tests are included in the full 3,602-PASS local suite.

Built Chromium/Edge proofs demonstrate the original three-model fixture READY and a supported-valid 160-character value physically BLOCKED without printing or changing the earlier saved record. QA independently verifies each PDF's full source/canonical/saved approval binding, all 96 cells and bounds, and visually inspects both pages. The earlier 16 mm unit-header overflow was resolved by a 20 mm track without shrinking the 10 pt table font or changing values. Publication continues to use existing renderer, resource, physical measurement, freshness and print authorities.

The local adapter uses a namespaced localStorage record and browser Web Locks for cross-tab asynchronous CAS. Generation sidecar and canonical envelope are committed together; reopen revalidates their approval and full equality. Source hashes identify the declared UTF-8 synthetic page payload, not PDF bytes or source authenticity. Approval of technically reviewed input is distinct from physical READY: the long-value negative can be saved and remains unprintable.

The gate manifests differ only in the standalone browser-proof driver, strengthened during the gate run. The raw `SOURCE_CHANGED` receipt is retained; independent verification accepts stable product/test/config gate inputs and binds the final driver to both subsequent production proofs. Details, hashes, visual evidence and the non-reproduced save-closure robustness observation are in `QA_SOURCE_FINDINGS.md`.

This review does not certify real extraction, real AI, source authenticity, authenticated cloud persistence, all arbitrary supported layouts, a native PDF save dialog, remote exact-head execution or a human pilot. No second editor/document/PDF authority or schema migration was introduced.
