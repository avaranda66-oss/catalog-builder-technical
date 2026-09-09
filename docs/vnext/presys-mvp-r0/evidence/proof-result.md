# FOUNDATION-PROOF-01 RESULT

## Provenance

- Production main: `616332d6048a4259d2e2b562d8d5e781cea334bd`.
- R0.1.2 freeze: `65b524afbf75c99acbf87e8374dd91be92bb4ba7`.
- R0.1.3 targeted amendment: `4ba520ef86b745eb58d979a9ce27d21ad14202fd`.
- Remote implementation checkpoint: `b21963fef7aae04c90a896f6d029247f06f0f57e`.
- Pre-final implementation head after adopting R0.1.3: `df56abf3c553d33c19c9e9353af181de8a92c865`.
- Final implementation head: the commit containing this evidence record; the closure report records its resolved SHA after commit.
- Branch: `vnext/foundation-proof-01`.

## Purpose

Exercise the frozen FOUNDATION-PROOF-01 editorial architecture empirically in a lab-only implementation, preserve falsification evidence, and determine whether the proof is ready for independent Principal code/PDF audit. This record does not claim production readiness or authorize merge, deployment, Supabase work, or promotion to `src/vnext`.

## Implemented proof architecture

The proof uses authored A4 object frames in integer physical units (U), deterministic integer geometry, a single CSS Grid editorial tree for screen and Chromium PDF, renderer-only Q projection, immutable authored input, resource readiness gates, normalized layout snapshots, stability checks, and PDF.js forensic inspection.

## Legacy salvage

Salvage is limited to proven assets and lessons: existing PRESYS product imagery, pinned Noto font assets, domain lessons from prior table work, and repository infrastructure needed to run the isolated lab proof.

## Legacy code intentionally rejected

The proof does not port the legacy `TableCoreRenderer.tsx` as the VNext renderer because that path can synthesize a header when none is authored. The proof also avoids legacy runtime authority, production routes, persistence, Supabase, and a parallel PDF renderer.

## G01

**PASS.** G01 remained READY in the combined Chromium matrix and in the four-page native PDF. Page-1 PDF extraction retained expected technical text including `-10.000 mV`, `0.001 Ω`, `23 °C`, and `1 / 4`.

## G02

**PASS.** Three independent table frames remained independent; changing table A left 208 normalized facts for sibling tables B/C unchanged. Headerless G02-C rendered 8 rows and zero synthetic column headers. PDF extraction retained technical code `06.04.0121-00/IN1P`.

## G03

**PASS.** Mixed content, caption/note/footnote participation, and the declared PRESYS product photograph rendered successfully. Annotations increased the measured table envelope from `16667 Q` to `22775 Q`. PDF page 3 retained note/footnote text including `Observação de montagem:` and `Fotografia proveniente...` and contained the single legitimate raster image paint.

## G04

**PASS.** The matrix remained READY with pinned custom fonts and print parity. PDF page 4 retained expected configuration/compatibility text and used only Noto Sans family PDF fonts, including the expected Japanese Noto Sans subset where applicable.

## G05

**PASS.** The adversarial fixture correctly blocked export in both `screen` and `print`. Expected blocking diagnostics included `TABLE_WIDTH_INFEASIBLE`, `ROW_CONTENT_OVERFLOW`, `TABLE_CONTENT_OVERFLOW`, `CELL_CONTENT_OVERFLOW`, and `OBJECT_OUTSIDE_PAGE`; safe-area and overlap warnings were also present. Source/document hashes remained immutable.

## R0.1.2 counterexamples

### rowspan

R0.1.2 frozen sequential distribution produced:

- base: `[100000,100000,100000]`
- requirements: `[407789,407789]`
- result: `[203895,255842,151947]`
- total: `611684 U`
- frame: `550000 U`
- false practical overflow: **YES**

This was a real falsification: the frozen algorithm added `103895 U` beyond a feasible witness and created a practical false overflow.

### Q/U height

R0.1.2 could classify projection equality as overflow through a lossy Q→U diagnostic round-trip:

- `tableHeightQ = 4838`
- authored frame projection = `4838 Q`
- authored height = `200000 U`
- historical `qToU(4838) = 200008 U`

`Q == Q` must not become overflow because a renderer-only quantized value rounds back to a slightly larger U value.

## R0.1.3 corrections

The row solver now treats rowSpan requirements as interval/prefix constraints and solves the minimum total extra height deterministically in integer U. The canonical result for the falsified case is `[100000,307789,100000]`, total `507789 U`, with false practical overflow **NO**.

Final table-height overflow compares `renderedIntrinsicHeightQ > uToQ(authoredFrameHeightU)` in renderer projection space. Equality in Q is not overflow. Authored geometry remains U and Q is not persisted as authored geometry. Final boundary status: **READY / no false overflow**.

## Physical arithmetic

Physical conversion and arithmetic remain deterministic and integer-based after authored decimal conversion. Focused arithmetic tests cover signed ties, unsafe magnitudes, exact CSS-Q round-trips, and projection overflow protection.

## Column solver

The solver conserves exact available width in U, rejects infeasible minima/fixed/max combinations, caps weighted flex columns before redistribution, and uses stable largest-remainder tie handling. Adversarial coverage includes 250 deterministic heterogeneous cases.

## Merge integrity

Merged-cell topology and paint suppression remained within the existing frozen proof model. Border/span probes ran across 56 browser combinations and preserved the same normalized facts for each configuration.

## Row-height solver

The R0.1.3 solver preserves fixed rows, never shrinks authored/intrinsic bases, handles zero deficits, crossing fixed rows, nested constraints, same-start constraints, exact integer-U ties, and is invariant to constraint permutation. The Astra counterexample is exercised as a regression case, but the implementation itself contains no fixture-specific branch or special-case detection.

## CellContent

The proof retains the frozen discriminated content model and preserves technical-code content through browser render and PDF text extraction. No test or implementation shortcut rasterizes technical text to obtain a green result.

## Annotations

Notes and footnotes participate in intrinsic height. The runner proves that removing annotations decreases the measured table envelope while the authored frame remains unchanged.

## Chromium evidence

- Chromium: `151.0.7922.34`.
- Matrix: 8/8 PASS.
- Viewports: `900`, `1500` CSS px.
- DPR: `1`, `2`.
- Media: `screen`, `print`.
- Normalized facts per run: `1478`.
- Facts hash for every run: `535c98d7315d9aea3bbabf0b633b596da7d79468a8d05bea9f5b4fc50c81af32`.
- Tables: `7`; native HTML tables: `0`; G02-C synthetic headers: `0`; G02-C rows: `8`.
- Declared image readiness: complete, natural size `545×767`.

## PDF forensic evidence

- PDF: `scratch/presys-editorial-proof/pdf/presys-foundation-g01-g04.pdf`.
- Pages: `4`.
- Bytes: `149278`.
- SHA-256: `b7a1f2e0c2d54345b4f8605c2441faae91e5d34259eaa3cdabe8624d0df27763`.
- Text items: `879`.
- Image paints: `1` total, on G03 only.
- `constructPath`: `1359`.
- `fill`: `1355`.
- PDF fonts: `NotoSans-Bold`, `NotoSans-Regular`, `NotoSans-Italic`, and `NotoSansJPThin-Regular` subsets only.
- Technical-code extraction: `06.04.0121-00/IN1P` present in PDF text.
- Notes/footnotes extraction: G03 note and footnote strings are present in PDF text.
- PDF line parity: 5 samples / 10 lines matched Chromium print lines.

## Fonts/assets readiness

**PASS.** The matrix waited for fonts/assets/images before measurement. Missing font manifest, font HTTP failure, dangling asset, image HTTP failure, and image decode failure all blocked export. A deliberately delayed image response held the proof busy until the resource completed.

## Screen/print parity

**PASS.** All 8 viewport/DPR/media runs produced byte-for-byte-equivalent normalized fact arrays and the same fact hash. G05 blocked in both screen and print with the expected diagnostics.

## Layout stability

**PASS.** Late text reflow, font-family change, loaded-font weight change, row-height change, image layout change, and image intrinsic change all produced `LAYOUT_UNSTABLE` evidence and rejected export. Transform-only UI zoom did not alter normalized facts.

## Immutability

**PASS.** Before/after PDF hashes were identical:

- document hash: `39c5de6e581fcbee0f065858eee25262c87a763cefc2ad13bff33b38e4fd014d`
- frame hash: `fed72f2dd903554318a7d2a022d82c998b966f9521fea2567aa08461a528d9ea`

The post-export report also recorded `layoutStable: true`. Adversarial runs likewise preserved authored source/frame hashes.

## Performance observations

These are lab observations only: the 8 baseline matrix runs completed in roughly `1.12–1.25 s` each on the recorded Windows/Ryzen 7 5700G machine; native PDF generation took `225.83 ms`; the complete proof runner took `36.65 s`. Node RSS at completion was about `543.5 MB`, with about `335.0 MB` heap used. These values are not production capacity claims.

## Focused gates

| Command | Exit | Result |
|---|---:|---|
| `npx eslint src/labs/presys-editorial-proof tests/vnext/proof` | 0 | PASS |
| `npx vitest run tests/vnext/proof` | 0 | PASS — 6 files, 62/62 tests |
| `npx tsc --noEmit` | 0 | PASS |
| `node tests/vnext/proof/export-proof.mjs` | 0 | PASS — 8/8 browser matrix, PDF forensics, adversarial checks |
| `git diff --check` | 0 | PASS |

## Global gates

| Command | Exit | Classification / summary |
|---|---:|---|
| `npm run lint:labs` | 1 | **PRE-EXISTING OUT-OF-SCOPE** — only `src/labs/product-workspace-ux/components/ConflictReviewModal.tsx:21:57`, conditional `useState`; FOUNDATION-PROOF focused ESLint PASS |
| `npm run lint` | 0 | PASS — 0 errors / 268 warnings |
| `npm run typecheck` | 0 | PASS |
| `npm test` | 0 | PASS — 202 files, 2108 passed / 1 skipped |
| `npm run build` | 0 | PASS — 2292 modules transformed; existing Vite import/chunk-size warnings only |
| `git diff --check` | 0 | PASS |

## Remaining limitations

- This is a lab proof, not a production editor or production-ready VNext release.
- The known unrelated `ConflictReviewModal.tsx` hook-order lint error remains outside FOUNDATION-PROOF scope.
- Product acceptance, official commercial product data/assets, print-shop PDF/X/CMYK requirements, hosted worker capacity, and end-user usability remain unproven.
- No Supabase, production route, deployment, or `src/vnext` promotion is included.

## Recommendation

FOUNDATION-PROOF-01 has sufficient empirical browser/PDF evidence for independent Principal code/PDF audit after the targeted R0.1.3 corrections. Do not merge or treat this result as production readiness.
