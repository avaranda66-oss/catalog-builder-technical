# VNext — W4.E Fit Height + Layout Diagnostics

Status: **IMPLEMENTED / UNDER REVIEW**

Date: 2026-09-24

## Authorization and canonical base

- Repository: `avaranda66-oss/catalog-builder-technical`.
- Canonical base: `0237de6c5685300bd61cb7a3d1b271f2a291f02f`.
- Canonical tree: `10853ba2f2350d8b935292f21065bfc9a74b3e65`.
- Direct parent: `133f0c84def7b8985b554f73cf88874299a40472`.
- Post-W4.D Quality Gate `35943635952`: COMPLETED / SUCCESS.
- Branch: `feat/vnext-w4e-fit-height-diagnostics`.
- W4.A/W4.B/W4.C/W4.D are canonical.
- W4.F0/W4.F/W4.G remain unauthorized.

## Goal

Implement explicit Father-facing Fit Height plus truthful canonical layout diagnostics without introducing a second renderer, row solver, persistence path, pagination engine, automatic page creation, or automatic reflow.

## Preserved architecture

W4.E preserves:

- one `CatalogDocument`;
- one Table Engine;
- one `DocumentRenderer`;
- integer-U authored physical geometry;
- integer-Q browser measurement;
- typed Application Actions;
- `DocumentSession` history;
- existing W3 persistence/autosave/recovery authority.

Measurement remains read-only. Fit Height is explicit and never runs automatically after editing, paste, save, publication, merge/unmerge, or row insertion/removal.

## Fit Height semantic contract

The dedicated action is `table.fitHeight`.

The prepared payload contains target identity, complete expected frame, complete expected TableModel, layout-relevant document typography, `measuredIntrinsicHeightQ`, and conservative `preparedHeightU`.

The sole measured-height authority is the current stable Table `PhysicalLayoutFact.renderedIntrinsicHeightQ` captured from the canonical renderer's intrinsic Table wrapper.

The Q → U conversion is:

```ts
minimumUForProjectedQ(renderedIntrinsicHeightQ)
```

This guarantees the prepared authored height is the minimum U whose projected Q is not smaller than the measured intrinsic Q.

Execution mutates only `TableObject.frame.heightMm`. It never changes x, y, width, rows, row policies, columns, cells, content, spans, annotations, Legend, styles, page order, or page count.

Fit Height is exact in both directions: it grows a short frame and shrinks excess height. An already-fitted invocation is a semantic no-op with `changed=false`, `affectedIds=[]`, `createdIds=[]`, no history entry, and no local-sequence increment.

## Staleness / CAS

Execution fails closed when prepared layout inputs are stale.

- complete frame mismatch → `TARGET_STALE`;
- complete TableModel mismatch → `TARGET_STALE`;
- layout-relevant `fonts/defaultText` mismatch → `TARGET_STALE`;
- invalid measured-Q/prepared-U arithmetic → `ACTION_INVALID`;
- locked target → existing `OBJECT_LOCKED`;
- closed Group child → existing action boundary; no implicit Group resize/reflow.

Unrelated document palette changes are intentionally not over-CASed.

## Measurement readiness and stability

The editor's hidden measurement root continues to use the canonical `DocumentRenderer`, waits for `document.fonts.ready`, waits for relevant image decode readiness, and runs the existing Table measurement pipeline.

W4.E upgrades editor Fit preparation to publication-grade stability by capturing two current snapshots and reusing the existing `compareSnapshots()` primitive.

If snapshots differ, geometry diagnostics are present, the source document is stale, a plan/fact is unavailable, or resources have not produced a current stable snapshot, Fit Height is disabled. No timeout-based height estimate, scroll-height authority, fallback row solver, or React DOM heuristic is used.

## Row policy semantics

- `AUTO`: content-driven row growth remains derived; Fit Height fits the outer Table frame to the resulting canonical intrinsic height.
- `MIN_MM`: the minimum remains authored and rows may grow from content; Fit Height fits only the outer frame.
- `FIXED_MM`: a fixed row does not grow. `ROW_CONTENT_OVERFLOW` remains an independent error and Fit Height is not presented as its fix.

## Diagnostic UX

W4.E projects canonical diagnostics into Father-facing Portuguese copy without creating a second diagnostic authority.

Key mappings:

- `TABLE_CONTENT_OVERFLOW` → “Conteúdo excede a altura da tabela” + **Ajustar altura** when measurement is current/stable.
- `ROW_CONTENT_OVERFLOW` → “Linha fixa não comporta o conteúdo” + **Localizar**, no Fit action.
- `CELL_CONTENT_OVERFLOW` → “Conteúdo excede a largura da célula” + **Localizar**, no Fit action.
- `CELL_CONTENT_BOX_NONPOSITIVE`, `TABLE_WIDTH_INFEASIBLE`, `RENDER_GEOMETRY_MISMATCH`, `LAYOUT_UNSTABLE`, page/safe-area and border diagnostics remain explanatory/navigation conditions, not heuristic fixes.

Canonical severities remain exactly `ERROR` and `WARNING`. The editor displays publication consequence from canonical severity: ERROR blocks publication, WARNING requests review.

Diagnostics remain ephemeral and never dirty the document or enter history.

## Navigation and editing boundaries

Object-level diagnostics select/focus the object. Row/Cell diagnostics enter the existing Table Grid selection path and focus the canonical target/anchor when safe.

While W4.B Cell Editing is active, Fit Height is disabled with the explicit message to conclude or cancel the Cell draft first. W4.E does not implement an asynchronous commit→remeasure→fit macro.

One top-level Table is supported at a time. Locked Tables and closed Group children are not bypassed.

## Page and safe-area behavior

Fit Height never clamps or moves the object.

If the exact fitted bottom exceeds A4, the authored resize succeeds and canonical `OBJECT_OUTSIDE_PAGE` remains/appears as an ERROR. No page is created and no Table is split.

A safe-area crossing remains a canonical WARNING. A Table taller than one A4 page receives Father-facing advisory text; pagination/manual splitting remains out of W4.E.

## W4.A–D interactions

- W4.A row insert/remove: no automatic frame change; measurement refreshes and Fit remains explicit.
- W4.B Cell content/property edits: no automatic fit; active Cell draft blocks Fit until editing ends.
- W4.C merge/unmerge: no automatic fit; topology changes stale the prior prepared action.
- W4.D bulk/TSV/clipboard paste: no automatic fit. The proof explicitly shows paste increasing intrinsic height, `TABLE_CONTENT_OVERFLOW` returning, and a later explicit Fit resolving the outer-frame overflow.

## History, persistence, recovery

A successful Fit Height is one ordinary canonical document mutation and therefore one `DocumentSession` history transition.

Undo restores the exact previous frame. Redo restores the exact fitted frame.

The mutation enters the existing W3 dirty/autosave/save path. No Fit-specific autosave or recovery format was added. Diagnostics and measurement do not dirty the document.

Save/reopen proof confirms the exact authored fitted frame height survives persistence. Reopen starts a new history boundary; W4.E does not claim Undo history survives reopening.

## Accessibility and mobile

The Father-facing control is a real button labeled **Ajustar altura** with explicit disabled reason via `aria-describedby`.

Diagnostics expose **Erro/Aviso**, publication consequence, actionable buttons, and deterministic focus/navigation behavior.

The dedicated Chromium proof covers 320, 360, and 390 px touch viewports, including Fit Height, diagnostics show/hide, Undo, Redo, Save, and zero global horizontal overflow.

## Focused automated tests

New focused tests cover:

- strict `table.fitHeight` schema;
- exact grow and shrink;
- conservative Q → U projection;
- semantic no-op metadata/history;
- frame CAS including x/y/width/height;
- complete Table CAS;
- typography CAS;
- unrelated-palette tolerance;
- locked and closed-Group boundaries;
- current/stale/no-plan/no-fact/unstable measurement preparation;
- page/safe-area advisory behavior;
- Father-facing diagnostic projection and actionability.

Focused result before full regression: **3 files / 16 tests / 16 PASS**.

## Dedicated Chromium / PDF proof

`tests/vnext/proof/editor-table-fit-height-proof.mjs` uses the real `EditorWorkspace`, real typed Application Actions and `VNextPersistenceRuntime` with a controlled in-browser repository.

It proves:

1. initially short Table and visible canonical `TABLE_CONTENT_OVERFLOW`;
2. measurement causes zero document/history/dirty mutation;
3. current stable measured Q and prepared U are exposed;
4. active Cell Editing disables Fit;
5. actual UI Fit changes height only;
6. one history transition;
7. overflow clears after fresh measurement;
8. Undo restores old frame/overflow;
9. Redo restores fitted frame;
10. repeated Fit is a semantic no-op;
11. W4.D TSV paste changes content without auto-growing frame;
12. overflow returns and explicit Fit is required again;
13. stale prepared Fit after manual frame mutation is rejected with `TARGET_STALE`;
14. FIXED-row and horizontal Cell overflow are not misrepresented as Fit fixes;
15. diagnostic navigation is functional;
16. page-bound Fit succeeds without clamp/move/page creation and canonical publication is BLOCKED;
17. safe-area warning remains diagnostic;
18. Save/reopen preserves exact fitted height and resets session history;
19. the valid fitted catalog publishes READY;
20. native A4 PDF + PDF.js content/vector forensics pass;
21. mobile 320/360/390 remains operable without hover/keyboard;
22. zero console errors, page errors, failed resources, or unexpected request failures.

The proof was executed successfully **three consecutive times** after removing an irrelevant remote-image dependency from the page-bound proof fixture. Product image readiness semantics were not weakened.

Stable representative evidence:

- Chromium: `151.0.7922.34`;
- `measuredIntrinsicHeightQ = 9592`;
- `preparedHeightU = 396524`;
- publication: `READY`, zero ERROR diagnostics for the valid fitted catalog;
- native PDF: A4 approximately 209.889 × 297.011 mm, substantive text, 60 vector paths;
- 320/360/390: document/body width equals viewport;
- console/page/resource/request failures: zero.

## Full local quality gates

Executed after the implementation:

- `npm run lint`: PASS, zero errors; repository-wide warnings remain non-blocking.
- `npm run typecheck`: PASS.
- `npm test`: **258/258 test files PASS; 2736 PASS, 1 skipped**.
- `npm run build`: PASS.
- `git diff --check`: PASS.

The local environment was then normalized with a real `npm ci`, matching CI, before running the full Chromium/PDF regression ladder.

## Full Chromium / PDF regression ladder

One clean chained execution completed with exit code 0 across the canonical W2/W3/W4 proofs plus W4.E:

- editor Text;
- direct manipulation;
- Asset Insert;
- snapping/diagnostics;
- template insertion;
- Group;
- Group publication/PDF;
- representative publication/PDF;
- W3.G asset persistence;
- W3.H autosave/concurrency;
- Father browser flow;
- W4.A Table axis;
- W4.B Cell content/properties;
- W4.C Merge/Unmerge;
- W4.D Bulk/TSV/Clipboard/Markers;
- W4.E Fit Height + Layout Diagnostics.

The dedicated W4.E proof was first validated locally/manual. During Principal post-implementation review, the existing exact-head Quality Gate was found not to execute that proof. A narrow CI/evidence amendment therefore adds `node tests/vnext/proof/editor-table-fit-height-proof.mjs` to the existing `VNext Chromium and PDF proofs` stage while preserving every prior proof command and leaving W4.E product code unchanged. W4.E remains **UNDER REVIEW**; final exact-head authority is the new PR-head Quality Gate produced by that amendment.

## Explicitly out of scope

W4.E does not implement row-height policy editing, column drag resize, typography UI, border editor, format painter, Paste Special, automatic page creation, Table splitting, pagination engine, auto-fit on edits/paste/save/publication, translation, AI, database migrations, production deployment, or W4.F0 functionality.

Professional row/column controls, richer Inspector/diagnostic ergonomics, typography/borders/context menus, Legend/annotation polish, manual split/pagination UX and other capability-completeness work remain carry-forward for W4.F0 or later explicitly authorized waves.

## Review state

Implementation and local evidence are complete on the isolated W4.E branch.

**DO NOT MERGE.**

**DO NOT START W4.F0.**
