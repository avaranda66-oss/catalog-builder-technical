# VNEXT-EDITOR-UX-LAB — interaction story
EXPERIMENTAL · NOT PRODUCTION · DO NOT MERGE · DO NOT PORT CODE BLINDLY · USER TEST REQUIRED.

Base: 09fe9d49b65b3d4501c4079b6df38f2d97f595c6. Branch: lab/vnext-editor-ux-astra.
This self-contained story lives in the permitted lab directory to respect this task's explicit file boundary.

## Run
From the repository root with existing dependencies installed:
`node src/labs/vnext-editor-ux-prototype/serve.mjs`
Open http://localhost:5198. No production route or deployment. Refresh resets all work.

## Acceptance checklist
- [x] Independent runnable shell, finite A4, editable objects, contextual Inspector.
- [x] Drag/resize, delete/duplicate, keyboard nudge, undo/redo.
- [x] Table workflow and contextual controls.
- [x] Compare safe margins A/B/C through browser interaction.
- [x] Execute father workflow, inspect desktop/laptop and capture evidence.
- [x] Required gates, evidence report and pushed checkpoints.

## File list
README.md, index.html, serve.mjs, main.tsx, Editor.tsx, fixtures.tsx, editor.css.
All state, geometry, diagnostics and HTML tables are disposable interaction mocks.
No production document schema, solver, persistence, AI, translation or publication implementation.

