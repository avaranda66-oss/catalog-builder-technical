import { describe, expect, it } from 'vitest';
import {
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  protectTechnicalTokens,
  translationRunKey,
  validateProviderResponse,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from '@/vnext/translation';
import {
  VNEXT_TRANSLATION_MODEL_ID, VNEXT_TRANSLATION_PROFILES, isAcceptedTranslationModelId,
} from '@/vnext/translation/language-registry';
import {
  GEMINI_BYOK_DEFAULT_MODEL, GEMINI_COMPOSER_MODEL, GEMINI_RETIRED_TRANSLATION_MODELS, GEMINI_TRANSLATION_MODEL,
} from '@/vnext/ai-catalog/gemini-models';
import { PROVIDER_CONFIG } from '@/vnext/ai-catalog/provider-vault';

// FR-86: translation leaves the restricted 2.5 family through the single model
// registry, while the client keeps accepting answers of the gateway still deployed.
function exchange(modelId: string) {
  const protection = protectTechnicalTokens('Faixa TA-25N de 0 a 70 bar');
  const request: TranslationProviderRequest = {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION, profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: 'req-1', sourceCatalogId: 'catalog-1', sourceLocale: 'pt-BR', targetLocale: 'es-ES',
    units: [{ unitId: 'unit-1', sourceHash: 'hash-1', kind: 'textObject', context: 'Text object',
      runs: [{ runId: 'run-1', protectedText: protection.protectedText }] }],
  };
  const response: TranslationProviderResponse = {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION, profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: 'req-1', targetLocale: 'es-ES',
    units: [{ unitId: 'unit-1', runs: [{ runId: 'run-1', translatedText: `ES: ${protection.protectedText}` }] }],
    provider: { providerId: W5_TRANSLATION_PROVIDER_ID, modelId },
  };
  const context = { currentSourceHashes: new Map([['unit-1', 'hash-1']]),
    protectedRuns: new Map([[translationRunKey('unit-1', 'run-1'), protection]]) };
  return () => validateProviderResponse(request, response, context);
}

describe('single Gemini model registry (FR-86, FR-73)', () => {
  it('uses gemini-3.5-flash-lite everywhere and nothing from the 2.5 family', () => {
    expect(GEMINI_TRANSLATION_MODEL).toBe('gemini-3.5-flash-lite');
    expect(VNEXT_TRANSLATION_MODEL_ID).toBe(GEMINI_TRANSLATION_MODEL);
    expect(W5_TRANSLATION_MODEL_ID).toBe(GEMINI_TRANSLATION_MODEL);
    expect(VNEXT_TRANSLATION_PROFILES.map(profile => profile.modelId)).toEqual([GEMINI_TRANSLATION_MODEL, GEMINI_TRANSLATION_MODEL]);
    expect(GEMINI_COMPOSER_MODEL).toBe(GEMINI_TRANSLATION_MODEL);
    expect(PROVIDER_CONFIG.gemini.configuredDefaultModel).toBe(GEMINI_BYOK_DEFAULT_MODEL);
    for (const model of [GEMINI_TRANSLATION_MODEL, GEMINI_COMPOSER_MODEL, GEMINI_BYOK_DEFAULT_MODEL]) {
      expect(model).not.toMatch(/2\.5|preview/);
    }
  });

  it('keeps the profile versions, so old and new clients and gateways still talk to each other', () => {
    expect(VNEXT_TRANSLATION_PROFILES.map(profile => profile.profileVersion)).toEqual(['w5-ptbr-eses-v2', 'p2-ptbr-enus-v1']);
  });

  it('accepts the current model and, until the gateway is redeployed, the retired one; nothing else', () => {
    const [profile] = VNEXT_TRANSLATION_PROFILES;
    expect(isAcceptedTranslationModelId(profile, GEMINI_TRANSLATION_MODEL)).toBe(true);
    expect(GEMINI_RETIRED_TRANSLATION_MODELS).toEqual(['gemini-2.5-flash']);
    expect(isAcceptedTranslationModelId(profile, 'gemini-2.5-flash')).toBe(true);
    expect(isAcceptedTranslationModelId(profile, 'gemini-2.5-pro')).toBe(false);
    expect(isAcceptedTranslationModelId(profile, 'other-model')).toBe(false);
    expect(exchange(GEMINI_TRANSLATION_MODEL)).not.toThrow();
    // Answer of the translation gateway deployed today (e932e87).
    expect(exchange('gemini-2.5-flash')).not.toThrow();
    expect(exchange('other-model')).toThrow(/provider profile metadata mismatch/);
  });
});
