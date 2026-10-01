# P1.A — Productization: Simple-by-default workspace

## Contract
Base: `90fdb3c57e1a638003a2ba8608f0920fa7a79173`
Tree: `c9615b2213f651d136a421c508508861085d88c7`

Objective: improve the visible VNext product without replacing its canonical engines.
Father Pilot remains paused.

## V1 × VNext gap matrix

| Area | GOOD IN V1 | GOOD IN VNEXT | MISSING / TOO COMPLEX IN VNEXT | SHOULD NOT RETURN FROM V1 |
| --- | --- | --- | --- | --- |
| Library / home | Familiar entry and catalog framing | Safer library lifecycle, search/sort, translated-copy identity, accessible dialogs | Visual coherence will continue in P1.C | Legacy state/document authority |
| Editor shell | Predictable pages → canvas → properties layout | Canonical session, direct manipulation, Recovery/persistence integration | Too many expert controls compete with canvas | Legacy store/editor architecture |
| Page navigation | Obvious page list | Canonical add/template insertion | Template reuse exposed by default | Prompt-driven page operations |
| Canvas | Central A4 working surface | Strong rendering fidelity and manipulation | Toolbar density reduces visual dominance | Legacy rendering path |
| Object editing | Basic actions are easy to discover | Text, image, table and grouping are substantially more capable | Shape/layer/snapping/multiselect shown before needed | Duplicate editor engine |
| Table editing | Fewer concepts visible | Canonical advanced table engine | Axis, merge, TSV, markers, semantics and style compete simultaneously | Legacy table authority |
| Save feedback | Human-readable save state near document | Correct CAS/conflict/offline semantics | State was visually duplicated and secondary | Fake/local-only saved state |
| Translation / publication | Familiar user-facing actions | Canonical W5 translation/review/publication | Entry should remain prominent without dominating | Legacy publication/translation architecture |
| Dialogs / errors | Simple vocabulary in places | Better focus, modal and failure handling | Product wording needs continuing polish | `alert` / `prompt` workflows |

## P1.A decisions
- Production `/v2` opts into an explicit `simpleByDefault` presentation mode.
- Canonical authoring/persistence/recovery/publication engines are unchanged.
- Technical proof fixtures keep the full capability surface by default.
- The default toolbar exposes Text, Image and Table; expert tools move behind **Mais opções**.
- Table structural/bulk operations are hidden until **Opções da tabela** is opened.
- Page template reuse moves behind **Usar modelo…**.
- Save state moves into the document header in productized mode.
- Translate and Publish/PDF remain top-level document actions.
- No capability is deleted.

## Acceptance intent
A novice must be able to enter the workspace, see the page/canvas, add ordinary content,
select an object and find the relevant edit action without seeing the complete expert toolset.
Advanced controls remain reachable on demand.
## Hard-boundary confirmation
No rendering-engine rewrite.
No table-engine rewrite.
No asset-engine rewrite.
No persistence or Recovery rewrite.
No auth change.
No schema, migration or RLS change.
No Legacy document authority import.

## Follow-on slices
P1.B: contextual inspector / advanced disclosure, especially geometry and deep table semantics.
P1.C: Library/dialog visual coherence and remaining product-language polish.

This slice does not declare Father Pilot readiness.
