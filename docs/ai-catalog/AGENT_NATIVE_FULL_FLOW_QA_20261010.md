# PRESYS Catalog Builder VNext — Conversational agent through persisted catalog and PDF

Data: 2026-10-10. Branch `codex/agent-full-a4-workflow-proof-20261010` stacked on PR #83. **This is a technical pipeline acceptance, NOT a Father-ready catalog.**

## Scope and method

New reproducible Chromium test:
`tests/vnext/proof/agent-native-full-workflow-proof.mjs`.
It mounts the **real** `VNextApp` + `EditorWorkspace` with `VNextPersistenceRuntime`, a fake Gemini functions adapter, an isolated CAS repository and the actual `PublicationReview` print/PDF pipeline. No production catalog, Google API, secret, billable database transaction or Supabase storage is touched.

1. Start with a brand-new one-page A4 catalog.
2. Open `Assistente IA → Criar com Gemini`.
3. Encrypt **fake test credential** in device vault, then unlock it.
4. Four sequential human prompts, with bounded conversation context, each resulting in a structured three-page proposal. Validate no change before approval, then accept and apply through canonical `page.add`/`object.insert`.
5. Check autosave committed the new document, that the account-local CAS revision advances, and technical value cells remain blank.
6. Review publication with the real VNext publication engine, print and save A4 PDF in Chromium.
7. Independently parse every PDF page using PDF.js, check physical A4 page dimensions and selected text. Hash both persisted snapshot and PDF.
8. Reopen from the persisted repository and verify 12 pages, 4 tables, 12 chat messages, document snapshot exactness, and **no extra provider request**.

## Technical PASS criteria (confirmed locally)

- 4 user requests, 4 **simulated** provider calls; after approval: 12 pages, 4 native editable comparison tables, 4 saves in controlled CAS repository.
- In the real A4 publication route: physically 12 PDF pages, correctly sized A4, searchable headings and table labels, SHA-256 proof receipt; PDF ~22.8 KB.
- Reopen exact snapshot and conversation localStorage. Device key is fake and never included in input/output receipts. Zero off-host HTTP requests.
- Four user prompts and outputs recorded as machine-readable JSON; browser screenshots and PDF attached to CI run artifacts and local evidence folder.

## Product and visual QA: FAIL / NOT FATHER READY

Full PDF was rendered with PyMuPDF, including pages 1, 3 and 12.

- All 12 pages have **fewer than 40 words**; most contain only a heading/subtitle. These are editorial skeletons, not real catalog copy.
- 0 source images, no treated product photography, and no cover composition comparable to established professional catalog designs.
- The four tables repeat one simple comparison layout. All engineering value cells remain empty on purpose until per-cell source verification; this is safe, but not a client deliverable.
- Existing PDF-source verification and document import lanes do **not** yet feed automated verified figures and illustrations into this Gemini composer; this remains the primary product blocker.
- This test uses FAKE Gemini transport and LOCAL CAS repository. It proves engineering integration, not production Supabase save/auth, live Gemini schema reliability, costs or latency.
- The end user Marc has NOT performed an uncoached pilot. No production/father-ready signoff is authorized by this proof.

The machine receipt includes `editorialQuality.result: FAIL_FATHER_READY_VISUAL_ACCEPTANCE`. This is intentional: a green technical CI must never be paraphrased as an acceptable finished catalog.

## Durable evidence on the user's machine

`C:\Users\Usuario\Documents\Codex\2026-10-10\CATALOG_BUILDER_REAL_ACCEPTANCE\04_AGENT_NATIVO_12P_SINTETICO_INPUT_OUTPUT_PDF`

Contains full PDF, four-turn input/output receipt, SHA/step receipt, authoring screenshots, page images and README. The CI run uploads `scratch/agent-native-full-workflow-proof` as artifact under the exact HEAD.

## Next required product stages

1. Recover verified technical per-cell values from real source PDFs, preserving page/glyph geometry, conflicts, units, conditions and explicit reviewer approval. Refuse unsupported associations.
2. Implement more than one native table design, including multi-level headers, grouping, dense pagination and image/diagram regions, without clipping.
3. Connect the model to typed editorial tools for edits to existing material, not only creating new pages and simple text rewrites.
4. Deploy and enable Gemini with BYOK, authenticated user, quota, bounded sampling and explicit cost approval; record actual prompt/result/usage from the provider, then save/reopen/publish in the real Supabase.
5. Test long chats, conflicts, browser/device limits, true source images and complex family PDFs. Conduct Marc's uncoached pilot.
