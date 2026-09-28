# W5.A — Semantic Translation Foundation

STATUS: IMPLEMENTED / UNDER REVIEW

## Canonical base

- Base: `a9c4b87a94c5c65dc5dfd28830656be0a96b3a01`
- Base tree: `339746d0af97a534b83a261f50a2d07e10388899`
- Parent: `9e4e96c6307aa355489dbb200d53eb457b456eee`
- W4 post-merge Quality Gate: `36435718988 — SUCCESS`
- Implementation branch: `feat/vnext-w5a-semantic-translation-foundation`

W5.A was created from the exact canonical base after live GitHub/worktree revalidation found no pre-existing W5 implementation state.

## Principal product decisions P1–P4

The W5 contract is frozen.

- P1: provider credential is server-managed. Father/browser never configures or receives the Gemini secret.
- P2: canonical W5 acceptance pair is `pt-BR -> es-ES` only.
- P3: `AssetRef.alt` is excluded from W5 translation and immutable AssetRef semantics remain unchanged.
- P4: future translated copies may exist with `LAYOUT REVIEW REQUIRED`; canonical publication diagnostics remain blocking. W5.A does not implement copy/layout integration.

## Global W5 architecture

W5 uses canonical VNext document semantics, schema-driven text-leaf extraction, technical-token protection, a provider-independent request/response contract, a server-mediated provider, strict validation, ephemeral results, and later W5.B materialization.

Invariants preserved:

- translation is not a Legacy document;
- translation is not active source mutation;
- provider output is never canonical document authority;
- request cache is non-authoritative;
- translation metadata is not a second document;
- translation is not automatic layout;
- translation is not application localization;
- later translated copies use the same canonical VNext renderer.

## W5.A scope

Implemented only:

1. semantic leaf registry/extractor;
2. explicit exclusions;
3. VNext technical-token protection;
4. provider-independent contracts;
5. dedicated server-side VNext gateway;
6. strict response validation;
7. non-authoritative request cache;
8. foundation orchestration;
9. sourceHash/request identity/stale-result primitives;
10. controlled deterministic browser evidence.

No translated catalog is created in W5.A.

## Semantic leaf inventory

Eligible kinds are exactly:

- `catalogTitle`;
- `textObject`;
- `tableCell` for `richText` content only;
- `tableTitle`;
- `tableAnnotation` for caption/note/footnote;
- `tableLegend`.

Group is not a leaf. Existing canonical Group descendants are traversed with `walkPageObjects`.

Each leaf carries a stable leaf ID, canonical locator, source locale, deterministic SHA-256 `sourceHash`, semantic context, and canonical text-run identities.

## Explicit non-translatable policy

W5.A excludes typed/non-text surfaces rather than masking them into provider payloads:

- `technicalCode`;
- `measurement`;
- `marker`;
- image Cell identity;
- standalone Image/Icon identity;
- Shape;
- Line;
- Group container;
- empty Cells/RichText;
- immutable `AssetRef.alt`.

Structural IDs, geometry, style, asset identity/hash/version, diagnostics and persistence metadata are never provider-translated.

Unknown future canonical object/cell surfaces fail closed as `UNCLASSIFIED_TEXT_SURFACE`.

## RichText preservation

Provider units contain only existing text-run IDs and protected text.

W5.A never asks the provider to create:

- paragraphs;
- inline IDs;
- ordering;
- list structure;
- line breaks;
- marks;
- HTML;
- Markdown.

The canonical source RichText remains unchanged.

## SourceHash / stale-result contract

`sourceHash` is SHA-256 over stable canonical semantic material including kind, locator, locale and RichText structure/text.

An unchanged source hashes identically.

Relevant source mutation changes the hash.

After provider/cache resolution W5.A re-extracts current semantic leaves and rejects mismatches as `STALE_RESULT`.

Translation request IDs are independent from W3 persistence mutation IDs.

## Technical-token strategy

The VNext protector was adapted from Legacy concepts without importing Legacy block authority.

Evidence-backed forms include PRESYS/ISOPLAN/model codes, standards, protocols, units, ranges, uncertainty forms and NPT/BSP/thread notation.

Deterministic collision-safe placeholders use the `[[VNEXT_TECH_...]]` family.

Validation rejects missing, extra, modified, duplicated or unresolved placeholders.

The historical `0 a 70 bar` ambiguity is explicitly tested: lowercase Portuguese connector `a` remains language while uppercase Ampere `A` remains context-safe technical content.

Typed technical/measurement Cells are never sent to the provider.

## Language contract

The only supported W5.A pair is:

`pt-BR -> es-ES`

Source locale comes from `CatalogDocument.locale`.

No source-language detection, per-leaf language fields, RTL, CJK, Thai, Russian, Arabic, Hebrew or broad Legacy language claims were introduced.

## Provider contract

Application code talks to `TranslationProvider.translate(request)`, not Gemini response semantics.

Request carries:

- contract/profile version;
- request ID;
- source catalog ID;
- source/target locale;
- semantic units;
- unit sourceHash/kind/context;
- protected text runs with stable run IDs.

It does not carry CatalogDocument, geometry, assets, URLs, persistence envelope or provider credential material.

Response carries exact request/profile/target identities, exact unit/run mappings, translated text, and provider metadata outside authored content.

## VNext server gateway

Dedicated gateway:

`supabase/functions/vnext-translation-provider/index.ts`

It is separate from Legacy `translation-provider-v1`.

It requires authenticated Supabase user/profile with active admin/editor role, strict request shape and bounded payloads.

W5.A bounds:

- max 60 units/request;
- max 4,000 chars/run;
- max 30,000 chars/request.

Initial adapter uses Gemini `gemini-2.5-flash` behind the frozen profile.

The provider credential is read only from server environment:

`GEMINI_API_KEY`

Browser-supplied `apiKey`, provider secret, Gemini key or credential fields are rejected.

No provider secret is stored in CatalogDocument/browser storage or logged.

## Strict validation

Client validation requires exact:

- contract/profile/request/target;
- provider profile metadata;
- unit count and ID set;
- run count and ID set;
- plain non-empty string results;
- no schema extras;
- no markup;
- protected-placeholder integrity;
- current sourceHash.

The server gateway independently validates the provider unit/run identity and placeholder multiset before returning semantic output.

## Error taxonomy / retry / cancellation

Typed errors include:

- `UNSUPPORTED_LANGUAGE`;
- `INVALID_REQUEST`;
- `CREDENTIAL_UNAVAILABLE`;
- `PROVIDER_UNAVAILABLE`;
- `PROVIDER_RATE_LIMIT`;
- `INVALID_PROVIDER_RESPONSE`;
- `TECHNICAL_TOKEN_MISMATCH`;
- `STALE_RESULT`;
- `ABORTED`;
- `PAYLOAD_TOO_LARGE`;
- `UNCLASSIFIED_TEXT_SURFACE`.

Only provider unavailable/rate-limit errors are retried, bounded by default to three attempts.

Abort makes a late result non-authoritative.

## Request cache

`MemoryTranslationRequestCache` is disposable and outside CatalogDocument.

Only strictly validated, fresh responses enter cache.

Cache identity excludes transport-only request ID but includes semantic request content/sourceHash, source/target locale, kind/context, protected text, provider/model, prompt, token-policy, contract and profile versions.

Every cache hit is validated again against current sourceHash.

No human-reviewed durable Translation Memory was introduced.

## Tests

Focused W5.A tests cover:

- complete whole-catalog extraction and Group descendants;
- all eligible leaves;
- explicit typed/asset/non-text exclusions;
- RichText identities/marks/lists/line breaks;
- deterministic sourceHash and mutation sensitivity;
- fail-closed future surface;
- adversarial technical-token vectors;
- `0 a 70 bar`;
- placeholder collisions/corruption;
- strict provider response permutations;
- stale result;
- unsupported pair;
- request-cache separation;
- invalid-output no-cache;
- retry/cancel;
- gateway secret boundary and error mapping;
- source document immutability;
- server gateway contract.

## Controlled Chromium proof

Dedicated proof:

`tests/vnext/proof/w5a-semantic-translation-foundation-proof.mjs`

Fixture:

`tests/vnext/proof/fixtures/w5a-translation-foundation-browser.html`

`tests/vnext/proof/fixtures/w5a-translation-foundation-browser.tsx`

The proof uses the same application/provider contracts as the real client path and verifies extraction, exclusions, masking, strict validation, restoration, RichText identity, stale rejection, safe cache reuse, source immutability, secret absence and unsupported-language rejection.

Required success token:

`W5.A Semantic Translation Foundation Chromium proof: PASS`

Real provider calls are intentionally not authoritative CI evidence in W5.A.

## W5.B / W5.C exclusions

W5.A does not modify:

- CatalogCloneService;
- clone identity behavior;
- candidate/copy materialization;
- Father translation UI;
- CatalogRepository;
- create/save/autosave/reopen/recovery;
- DocumentSession;
- Supabase catalog persistence tables/RPCs;
- migrations;
- renderer/measurement/diagnostics;
- fonts;
- publication/PDF.

W5.B remains responsible for candidate/review/copy/provenance persistence.

W5.C remains responsible for layout/publication/PDF/mobile/accessibility integrated closeout.

## Quality Gate

W5.A appends exactly one proof after W4.G in `.github/workflows/quality-gates.yml`.

All historical proofs remain ordered and unchanged.

Exact-head CI must be COMPLETED / SUCCESS before independent audit. The exact run/job and final totals are reported from GitHub live after the final branch push.

## Promotion state

W5.A is implemented but not independently audited.

No merge authorization exists.

W5.B, W5.C, W6 and W7 remain not started.
