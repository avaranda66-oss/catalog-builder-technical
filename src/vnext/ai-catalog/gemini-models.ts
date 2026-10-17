/**
 * Single registry of the Gemini models used by VNext: the browser, the Edge
 * Functions (vnext-catalog-composer, vnext-translation-provider) and the
 * scripts/probe-composer.mjs CLI all read these constants.
 *
 * Rules (plan FR-86/FR-73):
 * - no preview models and no 2.5 family (Google restricts 2.5 to legacy users);
 * - pure module, no imports and only erasable TypeScript syntax, because Deno
 *   and Node (type stripping) import this file by relative path.
 */
export const GEMINI_COMPOSER_MODEL = 'gemini-3.5-flash-lite' as const;
export const GEMINI_TRANSLATION_MODEL = 'gemini-3.5-flash-lite' as const;
export const GEMINI_BYOK_DEFAULT_MODEL = 'gemini-3.5-flash-lite' as const;
/**
 * Reads PDFs and photos for the fact extraction (FR-66, vnext-catalog-draft).
 * Chosen by the FR-66a spike: most stable and best verified coverage
 * (docs/ai-catalog/SPIKE_EXTRACAO_20261015.md §7).
 */
export const GEMINI_EXTRACTION_MODEL = 'gemini-3.8-flash' as const;

/**
 * Models pinned by gateways that may still be deployed. A response that names
 * one of them is tolerated only so the new client keeps working with the
 * previous deployed function until it is redeployed from the merged SHA.
 */
export const GEMINI_RETIRED_TRANSLATION_MODELS: readonly string[] = Object.freeze(['gemini-2.5-flash']);

/**
 * USD per 1M tokens (ai.google.dev pricing read on 2026-10-14). Thinking tokens bill as output.
 * gemini-3.8-flash costs US$ 0.75 / 3.75 until 2026-12-31 and US$ 1.50 / 7.50 after
 * (spike FR-66a, read on 2026-10-15); the later price is registered so that budget
 * reservations and ceilings never undercount (fail closed).
 */
export const GEMINI_PRICING_USD_PER_MTOK: Readonly<Record<string, { readonly input: number; readonly output: number }>> =
  Object.freeze({
    'gemini-3.5-flash-lite': Object.freeze({ input: 0.30, output: 2.50 }),
    'gemini-3.8-flash': Object.freeze({ input: 1.50, output: 7.50 }),
  });

/**
 * Cost in micro-USD (1e-6 USD). Tokens x USD-per-1M-tokens is already micro-USD.
 * Unknown models are priced at the most expensive known rate (fail closed).
 */
export function geminiCostMicrousd(model: string, inputTokens: number, outputTokens: number): number {
  const known = GEMINI_PRICING_USD_PER_MTOK[model];
  const price = known ?? Object.values(GEMINI_PRICING_USD_PER_MTOK).reduce((worst, item) => ({
    input: Math.max(worst.input, item.input), output: Math.max(worst.output, item.output),
  }), { input: 0, output: 0 });
  const tokensIn = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const tokensOut = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  // toFixed removes binary float drift (0.3 * 6000 must stay 1800, not 1801).
  return Math.ceil(Number((tokensIn * price.input + tokensOut * price.output).toFixed(6)));
}
