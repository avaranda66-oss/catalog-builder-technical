# W3.H — Autosave + Adversarial Concurrency

Status: **Ready for Principal Review**

Date: 2026-09-15

Canonical implementation base: `a44a710836ed8cbaba48dccd541614304e10cb8a`

Canonical base tree: `1bc573e061bb2a732751c8650ba86fc0d5c92835`

Required branch: `feat/vnext-w3h-autosave-concurrency`

Promotion vehicle: one PR to `main`; **do not merge**. The USER is the sole authority for explicit merge authorization.

Promotion PR: **#37** — `feat(vnext): add W3.H autosave and adversarial concurrency`.

---

## Story

Como o Pai (usuário não técnico), quero que minhas alterações sejam salvas automaticamente sem perder trabalho em corridas de rede, duas abas, falhas ambíguas ou conflitos, e quero escolhas simples quando outro estado do servidor avançar: **Abrir versão mais recente** ou **Salvar meu trabalho como cópia**.

## Canonical predecessors

- W3.G is canonical through merged PR #36 at `a44a710836ed8cbaba48dccd541614304e10cb8a`.
- Post-merge Quality Gate run `35034657054`, run number `218`, completed `SUCCESS` on that exact SHA.
- `CatalogDocument` remains the sole authored authority.
- `SaveCoordinator` remains the sole remote Save/CAS authority.
- W3.D recovery remains local protection, never remote `Saved` authority.
- W3.F `CatalogCloneService` remains the complete fresh authored-identity closure authority for Duplicate/Starter/Save-as-copy.

## Acceptance criteria

- [x] **AUTOSAVE-01** dirty persisted documents debounce/coalesce and produce one remote mutation for one stable edit burst.
- [x] **AUTOSAVE-02** Manual Save cancels pending debounce and immediately flushes through the same save authority.
- [x] **AUTOSAVE-03** one catalog/session has at most one remote save in flight.
- [x] **AUTOSAVE-04** L1/S1/L2 keeps L2 live and dirty after S1 ACK; S2 uses the acknowledged revision and a fresh mutation ID.
- [x] **AUTOSAVE-05** Undo back to acknowledged equivalence cancels pending autosave and sends no mutation.
- [x] **AUTOSAVE-06** an active authoring barrier prevents unsafe autosave dispatch and does not tight-loop.
- [x] **AUTOSAVE-07** OFFLINE/REMOTE_FAILURE preserves local dirty work, never claims Saved, and retries only after a meaningful trigger.
- [x] **AUTOSAVE-08** ambiguous commit outcome reconciles/replays the same mutation before any newer mutation is allocated.
- [x] **AUTOSAVE-09** CONFLICT suspends automatic remote save until explicit conflict resolution.
- [x] **AUTOSAVE-10** UNAUTHORIZED/ARCHIVED/INVALID_DOCUMENT/UNSUPPORTED_VERSION/REMOTE_DIVERGENCE do not enter blind autosave retry loops.
- [x] **AUTOSAVE-11** runtime autosave is opt-in so temporary Library/internal runtimes cannot autosave accidentally.
- [x] **AUTOSAVE-12** autosave/manual save create no Undo entries and do not clear authored history.
- [x] **CONCURRENCY-01** two sessions at revision N race; first ACK advances remote, second strict CAS fails closed with local work preserved.
- [x] **CONCURRENCY-02** stale completion after catalog/open/auth/authority change is inert with respect to the active editing session.
- [x] **CONCURRENCY-03** stale autosave after Archive cannot recreate, unarchive, rename, or overwrite the archived catalog.
- [x] Father conflict UI exposes exactly **Abrir versão mais recente** and **Salvar meu trabalho como cópia**, without CAS/revision jargon or overwrite/merge actions.
- [x] Open-latest flushes W3.D local protection first, validates/fetches the authoritative latest, resolves assets through the canonical path, installs a fresh `DocumentSession`, and leaves local work intact on failure.
- [x] Save-as-copy uses `CatalogCloneService`, has zero forbidden authored structural identity overlap with the conflicting source, may share immutable `AssetRef`s, creates a new persistence/recovery lineage, and does not mutate the source.
- [x] Save-as-copy reuses the W3.E create/reconciliation authority so ambiguous create never generates a ghost second copy or a second mutation identity.
- [x] Dedicated Chromium proof demonstrates Father autosave and conflict flow with controlled strict-CAS concurrency; a separate production `/v2?catalog=…` smoke proves W3.H bootstrap wiring.
- [x] Existing W3.G/W3.F/W2 browser/PDF proof matrix remains green.

## Implementation tasks

- [x] Extract the W3.E prepared Create + ambiguous reconciliation path into reusable structured authority below React.
- [x] Add a React-independent `AutosaveCoordinator` with injectable clock/timer and disposal.
- [x] Route Manual Save through autosave immediate flush when autosave is enabled.
- [x] Add structured conflict-resolution authority below React.
- [x] Bind conflict actions to catalog/open/auth/authority/captured local-state lineage and make stale completion inert.
- [x] Wire production runtime autosave explicitly; leave temporary/internal runtimes disabled by default.
- [x] Add Father-facing conflict actions and simple persistence status copy.
- [x] Add deterministic autosave/concurrency/conflict/archive/recovery/Undo tests.
- [x] Add `tests/vnext/proof/w3h-autosave-concurrency-proof.mjs` and wire it into required Quality Gates.
- [x] Run focused tests, lint, typecheck, full tests, build, W3.H Chromium proof, and canonical proof regressions.
- [x] Commit, push, and open exactly one PR (#37). Exact-head CI is the final promotion evidence; do not merge.

## File list

- `.github/workflows/quality-gates.yml`
- `docs/stories/2026-09-15-vnext-w3h-autosave-adversarial-concurrency.md`
- `src/vnext/app/EditorWorkspace.tsx`
- `src/vnext/app/bootstrap.tsx`
- `src/vnext/library/service.ts`
- `src/vnext/persistence/autosave-coordinator.ts`
- `src/vnext/persistence/conflict-resolution-coordinator.ts`
- `src/vnext/persistence/create-coordinator.ts`
- `src/vnext/persistence/index.ts`
- `src/vnext/persistence/runtime.ts`
- `src/vnext/persistence/save-coordinator.ts`
- `src/vnext/recovery/session-manager.ts`
- `tests/vnext/application/w3h-online-retry.test.ts`
- `tests/vnext/persistence/archive-race-w3h.test.ts`
- `tests/vnext/persistence/autosave-concurrency.test.ts`
- `tests/vnext/persistence/conflict-resolution.test.ts`
- `tests/vnext/persistence/create-coordinator-w3h.test.ts`
- `tests/vnext/persistence/w3h-fixtures.ts`
- `tests/vnext/proof/architecture-boundary.test.ts`
- `tests/vnext/proof/fixtures/w3h-autosave-browser.html`
- `tests/vnext/proof/fixtures/w3h-autosave-browser.tsx`
- `tests/vnext/proof/w3h-autosave-concurrency-proof.mjs`

## Validation

### Architecture and behavior

- `SaveCoordinator` remains the one remote Save/CAS authority. `AutosaveCoordinator` only schedules, joins, flushes, suspends and retries that coordinator.
- Manual Save routes through `VNextPersistenceRuntime.manualSave()` and therefore through the same coordinator.
- `PreparedCatalogCreateCoordinator` centralizes Create acknowledgement and ambiguous same-attempt reconciliation for Blank/Starter/Duplicate/Save-as-copy consumers.
- `ConflictResolutionCoordinator` binds conflict actions to the captured catalog/open/auth/authority/revision/local-equivalence guard before destructive replacement.
- Open latest protects recoverable B1 locally where recovery is available, then reopens through canonical envelope validation and W3.G asset resolution. Failed read/validation leaves B1 intact.
- Save-as-copy clones through `CatalogCloneService`; complete authored structural identity closure remains covered by `catalog-clone.test.ts`, while immutable `AssetRef` identity may remain shared.
- Production autosave remains explicit opt-in (`autosave: {}` only on the real editor bootstrap). Temporary/internal runtimes remain disabled by default.
- Browser `online` retry is coalesced and disposable; runtime/page/auth lifecycle disposal cancels obsolete listeners/timers.

### Deterministic focused tests

Command used the 16 paths recorded in `scratch/w3h-focused-tests.txt` with:

`node node_modules/vitest/vitest.mjs run <16 focused files>`

Result: **16 files passed / 184 tests passed**.

Coverage includes AUTOSAVE-01..12, L1/S1/L2 success/conflict/ambiguous/stale-authority/Undo cases, strict two-session CAS races, conflict resolution, prepared-create ghost-copy safety, archive race, recovery lifecycle, Library UI/service/open recovery, complete clone identity closure, W3.G asset regressions and architecture boundaries.

### Full local gates

- `npm run typecheck` — PASS.
- `npm run lint` — PASS with **0 errors / 268 warnings**; lint output contains **no warning under `src/vnext`**.
- `npm test` — **239 files passed / 2585 tests passed / 1 skipped (2586 total)**.
- `npm run build` — PASS.

### Controlled Father-flow Chromium proof

`node tests/vnext/proof/w3h-autosave-concurrency-proof.mjs` — PASS.

The proof uses two independent browser pages/runtimes opened from the same revision N and one shared controlled strict-CAS repository authority. It proves edit-without-Save → Saving… → Saved, L1/S1/L2 without regression, exactly one latest follow-up, stale B CAS conflict generated by repository revision rejection, Father conflict surface, autosave suspension, Open latest, repeated conflict, Save my work as copy, fresh copied catalog identity, unchanged authoritative source, and zero console/page errors.

### Production bootstrap wiring smoke

The same W3.H proof separately loads the real `/v2?catalog=<controlled-id>` production route far enough to prove the VNext bootstrap is selected, Legacy bootstrap is not loaded, editor runtime construction explicitly enables `autosave: {}`, and the disposable `attachPersistenceOnlineRetry(runtime)` wiring is present. This is **not** evidence of real Supabase/cloud multi-tab execution.

### Canonical browser/PDF regression matrix

All passed after the full local build:

- W3.H controlled Father-flow Chromium proof + production bootstrap smoke.
- W3.G Asset Persistence Chromium proof.
- W3.F Starter / Duplicate Chromium + mobile proof.
- W2.G direct Text editing Chromium proof.
- W2.C direct manipulation Chromium proof.
- W2.D snapping/diagnostics Chromium proof.
- W2.E template insertion Chromium proof.
- W2.F Group editor Chromium proof.
- W2.F Group publication/PDF proof.
- canonical export matrix at 900/1500 px, DPR 1/2, screen/print, native PDF + PDF.js forensics, and representative primitive native PDF proof.

### Known limitation

The adversarial multi-session proof deliberately uses a controlled shared repository in Chromium so strict revision CAS and response timing are deterministic. Production bootstrap wiring is separately smoked, but W3.H does not claim that this local proof executed real cloud Supabase multi-tab traffic.

## Scope guard

**W3.I HAS NOT STARTED.**
