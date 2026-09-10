# VNext — Post-W0 Durable Handoff Sync

Status: READY FOR REVIEW / PRINCIPAL AUDIT PENDING
Date: 2026-09-09
Base SHA: `865251dc023148b349a9ceba8051c249c0bbb647`
Base tree: `ede5e561717546a69899f1008c952efeb317b7ad`
Branch: `docs/vnext-post-w0-handoff-sync`

## Purpose

Synchronize durable VNext project memory after PR #14 merged W0 Foundation Promotion plus W0.1 Production Boundary Hardening, so a future Principal can reconstruct the canonical state from GitHub before W1 starts.

## Facts synchronized

- PR #12, PR #13 / FOUNDATION-PROOF-01, and PR #14 are merged.
- `src/vnext/` is the canonical production foundation owner; the PRESYS editorial proof lab is fixture/browser/PDF harness only.
- W0/W0.1 foundation and production-boundary invariants are recorded without duplicating the R0.1.4 mathematical history.
- Astra/Gemini UX-lab findings are separated into high-confidence interaction rules and user-test hypotheses; lab state is explicitly non-production.
- The 24-page Additel/Fluke/Isotech capability audit is preserved without importing competitor branding.
- Father-V1 requirements now explicitly include standalone primitives, direct rich text, technical-symbol UX, TSV paste, marker bulk toggle, explicit Fit Height, table presets, discoverable Replace Image, complete translation, and professional Chromium PDF.
- The minimum Easy Button Layer — table presets, page templates, catalog starter, reusable components/`Blocos`, contextual commands — is required before the first father pilot.
- Roadmap timing is corrected while leaving detailed W6/W7 boundaries flexible.
- Human UI and Future AI remain converged on typed Application Actions; W1 remains not started.

## Files updated

- `docs/vnext/PROJECT-STATE.md`
- `docs/vnext/PRINCIPAL-HANDOFF.md`
- `docs/vnext/product/EDITOR-UX-FUTURE-AI-BLUEPRINT.md`
- `docs/vnext/presys-mvp-r0/README.md` — only the stale current-status pointer was reframed as historical and redirected to current state.
- `docs/stories/2026-09-09-vnext-post-w0-handoff-sync.md`

## Intentionally unchanged

- `src/vnext/**` and all other product implementation.
- Legacy code.
- tests and proof artifacts.
- historical R0/W0 story evidence whose old OPEN/IN REVIEW language correctly records the state at the time.
- Supabase, persistence implementation, translation implementation, PIM, `/v2`, Application Actions, and W1 product work.

## Next wave

**W1 — Application Actions + Minimal VNext Shell** remains **NOT STARTED**.

A Principal audit of this handoff synchronization is pending. Do not merge this docs PR and do not start W1 until that audit/authorization path is complete.
