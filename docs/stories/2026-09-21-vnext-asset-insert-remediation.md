# VNext — Asset insert production remediation

Status: **UNDER REVIEW**

## Contract and authorization

Isolated Father-blocking remediation authorized by the execution contract supplied on 2026-09-21. W4.A is canonical; W4.B is NOT STARTED. No merge or production deployment.

Verified GitHub main: `069111df3d01f0e60c3584b6d40d1284f8598388`, tree `b94b237c4c8f31752b98e710d66fd5ea69ad309a`, parent `01c18b10051337b094e04688ff340d8032af1a75`. Push Quality Gate `35556438978`: completed/success at that head. Historical W3/W4.A handoffs remain point-in-time evidence.

Root cause: production Image insertion uses `createInsertSpec('image')` with `w2c-demo-ta25n`, absent from canonical blank `assets: []`; application correctly rejects ASSET_NOT_FOUND. Production replacement also exposes a demo toggle.

## Acceptance criteria

- [x] Optional canonical AssetRef on object.insert/image; matching identity; identical metadata reuse; divergent metadata rejected; missing reference rejected; final document validation.
- [x] Candidate-aware allocator; createdIds[0] is object ID; one Undo/Redo restores exact snapshots without uploading or deleting bytes.
- [x] Shared real upload insertion/replacement; stable picker intent; authority/session/catalog/page stale rejection; safe Portuguese errors; no invented size limit.
- [x] Runtime state/URLs only after successful canonical action; explicit demo isolation; real no-bridge workspace reports unavailable.
- [x] Visible Chromium blank insertion, selection, move/resize, Save/reopen, replacement, publication/PDF, mobile 320/360/390.
- [x] Focused and complete regression proofs, exact test totals, scoped file review. Publication acceptance additionally requires the single PR's exact-head Quality Gate; see the final delivery report for post-commit provenance and CI.

## Boundaries

Keep the existing 58 × 58 mm contain frame, canonical asset bridge, application actions, session history, CAS/Save/autosave/Recovery and renderer. Durable uploads may remain orphaned after stale completion, action failure or Undo; no rollback, remote deletion or garbage collection. Browser persistence evidence is controlled integration, not production Supabase E2E.

No W4.B, migration, schema redesign, second asset system, renderer, translation, dashboard redesign, library/search/AI, deployment or merge.

## Dev record

### Recovery and provenance

Continued the same isolated worktree `C:/Users/Usuario/.codex/worktrees/vnext-asset-insert/catalog-builder` and branch `fix/vnext-asset-insert-production` after the usage interruption. No reset, rebase, replacement worktree or branch. HEAD still equalled the verified canonical base on resume. GitHub main was independently rechecked and remained unchanged; no remediation PR existed.

Both background validation chains had completed. Original gates passed: 246 test files, 2,644 passed, 1 skipped; lint/typecheck/build succeeded. The original matrix had ten successful runners and one W2.C failure; the incorrectly named `editor-save-reopen-proof` was not run. The actual W3.C runner is `w3c-save-reopen-proof.mjs`.

The concrete W2.C failure was a historical fixture using an unavailable persistence runtime while expecting implicit demo insertion. Its direct-manipulation runner now explicitly requests `?demo=1`, and only that explicit fixture path mounts the in-memory demo. Production no-Bridge behavior remains fail-closed. Reran all 12 regressions successfully, added no-Bridge UI evidence, and reran the dedicated visible proof and final repository gates. No finished product implementation was replaced during resume.

The published commit containing this story is the delivery head. Its SHA/tree, parent, actual commit count, PR URL and exact-head CI are recorded in the final delivery report; this file does not predict its own commit hash. Historical W3.G/W4.A evidence was not rewritten.

### Application contract

`ImageObjectInsertSpecSchema` alone gains `asset?: AssetRefSchema`. The action schema parses the canonical payload before execution. A supplied ID must match `assetId`; identical registered metadata is reused, divergent metadata fails `ACTION_INVALID`, and a missing reference without payload fails `ASSET_NOT_FOUND`. Icon behavior is unchanged. `parseCanonicalDocument(candidate)` remains the final gate.

The executor appends a genuinely new AssetRef to a local candidate, allocates the Image against that candidate's complete identity set, and appends the Image. The allocator rejects a colliding generated ID rather than retrying; failure preserves the original document and history. `createdIds` lists the complete canonical object identity set first and the new asset ID last, preserving `createdIds[0]` for selection.

One `session.execute(object.insert)` creates one history entry. One Undo restores the pre-action document, removing both Image and newly introduced AssetRef. Redo restores the exact post-action identities and metadata without another upload. Remote storage is never deleted by Undo.

### Father UX and safety

One hidden file input and `pendingAssetIntentRef` capture insert page or replacement object, session and authority lineage when the picker opens. One shared `uploadWorkspaceImage` coordinator reads bytes, invokes the existing Bridge, rechecks current session/auth/scope/open-session/catalog and insert page, then executes `object.insert` or `image.replace`. Runtime URLs/states are installed only after canonical linking succeeds. Busy/consumed intent prevents duplicate handling; resetting input value permits selecting the same file again.

Toolbar and inspector replacement buttons plus the existing upload control use that same real path. Production without Bridge shows `Envio de imagens indisponível neste ambiente.` and does not mutate demo references. Deliberate demo insertion/toggling is limited to the in-memory harness; real runtime props take precedence over demo mode.

States: `Enviando imagem…`, `Imagem adicionada.`, `Imagem substituída.`, or a truthful added/replaced-but-preview-unavailable message. Existing 58 × 58 mm, contain fit and centered focal point remain. Portuguese mappings cover UNSUPPORTED_MEDIA, INVALID_DIMENSIONS, OFFLINE, UPLOAD_FAILED, STALE_RESULT and AMBIGUOUS_COMMIT_OUTCOME, with safe generic fallback. No raw storage errors or invented file-size limit.

### Final evidence

- Focused tests: **3 files, 34 passed, 0 failed** (12 atomic action tests, 20 upload orchestration cases, 2 UI/demo separation cases).
- Complete unit suite: **247 files passed, 2,647 tests passed, 1 skipped, 0 failed**.
- Final local gates: lint **PASS**, 0 errors / 268 existing warnings; typecheck **PASS**; build **PASS** (existing chunk-size/dynamic-import advisories); `git diff --check` **PASS**.
- Dedicated proof: `editor-asset-insert-proof.mjs`, **PASS**, visible Chromium **151.0.7922.34** locally; CI uses headless Chromium.
- Blank canonical assets, native file chooser event, actual PNG bytes through `DefaultAssetPersistenceBridge` with deterministic external storage/repository, automatic selection, pointer move/resize, one Undo/Redo with no upload replay.
- Controlled strict-CAS Save, visible switch to another catalog and exact original reopen preserve full document, Image ID/frame and AssetRef; runtime URLs/states are re-resolved and the image decodes visibly. Serialized snapshots explicitly reject blob/http/base64/bytes content.
- Canonical DocumentRenderer, resource resolution, font/image readiness, measurement and publication diagnostics pass; native PDF includes raster image operators verified by PDF.js. No editor/input chrome in publication, and canonical document is unchanged.
- Mobile 320/360/390: chooser and upload status reachable, Image selected, move inspector and existing resize handle reachable; document scroll widths exactly 320/360/390. No claim of desktop ergonomics on mobile.
- Four desktop uploads correspond to insertion, toolbar replacement, upload-button replacement and inspector replacement; same file can be selected repeatedly. Zero attributable console/page errors.

| Regression | Runner | Final result |
| --- | --- | --- |
| W2.G Text | editor-text-proof | PASS |
| W2.C move/resize/demo | editor-direct-manipulation-proof | PASS |
| W2.D snapping/diagnostics | editor-snapping-diagnostics-proof | PASS |
| W2.E templates | editor-template-insertion-proof | PASS |
| W2.F Group | editor-group-proof | PASS |
| W2.F publication/PDF | group-export-proof | PASS |
| Canonical render/publication/native PDF/PDF.js | export-proof | PASS: 900/1500 px, DPR 1/2, screen/print; rowspan READY |
| W3.C Save/reopen | w3c-save-reopen-proof | PASS |
| W3.G Asset Bridge | w3g-asset-persistence-proof | PASS |
| W3.H concurrency | w3h-autosave-concurrency-proof | PASS |
| Father browser flow | w3i-father-browser-flow-proof | PASS |
| W4.A selection/axis | editor-table-axis-proof | PASS |

Reproducible local logs, screenshots, report.json and inserted-image.pdf live under ignored `scratch/asset-insert-proof/`. Workflow change adds exactly one dedicated proof command to the existing Quality Gates job; no previous command, trigger, protection assumption or deployment behavior changes.

### Limitations and next gate

This is **CONTROLLED repository/Bridge integration**, not real-production Supabase Father E2E. Durable finalized bytes may remain orphaned after stale completion, action failure or Undo. No distributed rollback, remote deletion or garbage collection. Signed/blob URLs remain ephemeral. PNG/JPEG/WebP support remains byte-sniffed by the canonical Bridge; the dedicated new browser fixture uploads PNG, while canonical Bridge tests cover its media contract.

CodeRabbit CLI review was attempted with the installed CLI's current `review --agent --uncommitted --include-untracked` syntax. Windows worktree paths required explicit WSL Git context; the service then treated the checkout as 2,142 files and rejected it under its 150-file free allowance (`too_many_files`). No CodeRabbit findings or successful CodeRabbit review are claimed. Scope inspection and all repository gates were completed independently; Gemini remains the next independent auditor.

Status stays **UNDER REVIEW**. Next actor: **INDEPENDENT GEMINI ASSET INSERT AUDIT** after exact-head Quality Gate success. No merge authorization is consumed or implied.

## File list

- `.github/workflows/quality-gates.yml`
- `docs/stories/2026-09-21-vnext-asset-insert-remediation.md`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/VNextApp.tsx`
- `src/vnext/app/image-upload.ts`
- `src/vnext/application/contracts.ts`
- `src/vnext/application/execute.ts`
- `tests/vnext/application/image-insert.test.ts`
- `tests/vnext/application/image-upload.test.ts`
- `tests/vnext/application/image-upload-ui.test.tsx`
- `tests/vnext/proof/editor-asset-insert-proof.mjs`
- `tests/vnext/proof/editor-direct-manipulation-proof.mjs`
- `tests/vnext/proof/fixtures/editor-asset-insert-browser.html`
- `tests/vnext/proof/fixtures/editor-asset-insert-browser.tsx`
- `tests/vnext/proof/fixtures/w2-editor-browser.tsx`
- `tests/vnext/proof/w3g-asset-persistence-proof.mjs`
- `tests/vnext/proof/w3i-father-browser-flow-proof.mjs`

All changed files inspected. NO W4.B/cell editing/merge-unmerge UI/TSV/Fit Height/Table presets; NO translation/dashboard redesign/asset library/media search/AI; NO new document model/renderer/asset registry/persistence redesign; NO database migration or migration hardening; NO asset GC or remote deletion on Undo; NO production deployment; NO merge.
