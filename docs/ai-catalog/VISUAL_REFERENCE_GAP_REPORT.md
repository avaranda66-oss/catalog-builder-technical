# Institutional catalog visual benchmark — structural gap assessment

Observed 2026-10-09 on owner's authorized local reference PDFs, **not copied into Git**. Reference names: Additel 761A Datasheet (6 pages), Additel 875 Datasheet (8 pages), PRESYS TA folder (20 pages).

## Local structural evidence

These counts come from PyMuPDF page objects and are not an aesthetic quality score:

| Reference | Pages | Image objects (total counted per page) | Median page words | Median vector drawings |
| --- | ---: | ---: | ---: | ---: |
| Additel 761A | 6 | 37 | 467.5 | 252.5 |
| Additel 875 | 8 | 61 | 364 | 150 |
| PRESYS TA folder | 20 | 474 | 273 | 113 |
| VNext institutional synthetic 27-page sample | 27 | 0 | roughly 150 on technical pages | roughly 130 on technical pages |

Reference observations by page rendering (owner device only):
- Additel 875: actual product photos, branded graphic elements, high-level features and benefits, column grids combining several instrument photos with UI screenshots and explanatory labels.
- PRESYS: diagrams and illustrated interfaces with callouts and distinct editorial sections, in addition to technical specifications.
- Long-form VNext sample: clean blue-and-white cover, 12-item index, repeated source-preserving technical tables, footer/sources; good typography/pagination, **no product photos, charts, diagrams or callouts** yet.

This is a **functional baseline**, not visual equivalence with competitors. Do not claim "Additel level" until independent product/design acceptance.

## Next product design contracts

Keep the deterministic canonical compiler. Add **three content profiles** rather than one generic table:
1. Product datasheet (2–8 pages): photo(s), factual positioning, technical differentiators, applications, 1–4 large tables, original images, sources.
2. Comparison/catalog (8–30 pages): 2–4 models, product image gallery, executive summary, comparison matrices, continued tables, repeatable section hierarchy, certifications/references only when sourced.
3. Manual/reference (30+ pages): navigation/TOC, split sections, repeated table heads, notes and cross references, revision trail, optional translated copy.

For every image/figure in a real company catalog, require: source document, exact page or owned media asset, usage rights, hash, safe crop, alt text, visual quality and manual approval. Do not copy Additel competitor photographs into PRESYS documents.

For every technical table:
- literal numbers/signs/ranges/units/codes preserved;
- mapped product/model column identities and source page/bbox;
- correct multi-line notes/merged-header semantics;
- no cuts in print, no silent font shrink;
- long-table split with a new page only where rows stay whole;
- readable 8pt+ body text unless a separately approved print standard allows lower.

## Acceptance criteria for a natural-language agent

Simulate Marc asking without software vocabulary:
- 'Pegue estes PDFs e faça uma ficha PRESYS mais clara e profissional.'
- 'Quero comparar os quatro modelos em uma tabela completa.'
- 'Faltou a faixa de operação e a foto do instrumento. Corrija sem inventar valores.'
- 'Coloque primeiro o que é mais importante para o cliente.'
- 'Traduza a cópia para espanhol e inglês, sem mudar os números.'
- 'Salve na Library, faça um PDF pronto para mandar ao cliente.'

Real acceptance means the authenticated agent can plan tools, list target changes, apply authorized canonical operations, show diffs, recover from failure, reopen from cloud storage, preflight and output measured PDFs without user manually choosing technical commands.

Automated browser execution is a preliminary proxy, not a Marc uncoached usability pilot.

## Token/price control

- First index PDF bytes locally with source/page hash; cache segmentation per revision.
- Use a low-cost Gemini model for short conversation/planning requests; never regenerate long PDF in model tokens.
- For page interpretation, provide only selected text+images/page crops and demand structured results linked to source page/bbox.
- Use versioned idempotent plan/action proposals and compiled document from local canonical source.
- Keep paid calls off until a rotated provider key and durable atomic spend quota exist. Initial owner authorization: up to R$50 for the first bounded pass, remaining R$50 possible after review; no expenditure in this work phase.
