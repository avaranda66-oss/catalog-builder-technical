# P1.B — Productization: Contextual inspector and progressive disclosure

## Contract
Base: `dc765d4243aadfdc21b03c068f9acf25606fae5e`
Tree: `7ee33471ca36b11c1fe6a354f850ac04d29a1a73`

Objective: reduce inspector cognitive load in the productionized VNext workspace without changing canonical authoring engines.
P1.A is canonical. Father Pilot and P2 remain paused.

## Post-P1.A evidence
The main toolbar is now compact and the canvas is visually dominant, but a selected object still opens the inspector with raw geometry and locking before the task-specific controls.
Table selection can additionally expose dimensions, semantic cell properties, image-cell tooling and technical styling in one long surface.

## P1.B decisions
- Production `simpleByDefault` gets a contextual inspector heading based on the selected object type.
- Advanced inspector disclosures reset when the selected object/page context changes, so a new selection always returns to the simple surface.
- Universal lock and X/Y/width/height controls move behind **Mais propriedades** in simple mode.
- Full technical mode keeps the historical inspector surface open by default.
- Task-specific image and table controls remain reachable; ordinary editing is not removed.
- Deep table dimensions and semantic styling receive a separate advanced disclosure in simple mode, while ordinary cell-content editing remains available when relevant.
- Diagnostics remain collapsed by default as established by P1.A.
- No capability is deleted and no second editor/table engine is introduced.

## Acceptance intent
A novice selecting Text, Image or Table should first see controls that explain what the object is and what can ordinarily be changed.
Raw positioning, locking and deep technical table controls must not dominate the initial inspector.
Every hidden capability must remain discoverable with keyboard-accessible disclosure controls.
Technical fixtures without `simpleByDefault` must retain their existing full surface and labels.

## Proof obligations
- Text selection: contextual heading; geometry absent by default; **Mais propriedades** reveals geometry and lock.
- Image selection: ordinary image controls remain visible while universal geometry remains disclosed.
- Table selection: ordinary title/content path remains visible; deep dimensions/styling are hidden until requested.
- Closing and reopening disclosures must not mutate the document.
- Existing keyboard/focus semantics remain intact.
- 820 px viewport has no global horizontal overflow.
- Existing historical Chromium/PDF proofs remain green.

## Hard boundaries
No migration, SQL/RLS, auth, Recovery, persistence, renderer, asset engine, table engine, translation engine or dependency change.
No P2 multilingual expansion. No Father Pilot.
