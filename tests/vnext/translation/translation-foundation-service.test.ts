import { describe, expect, it } from 'vitest';
import {
  ControlledTranslationProvider,
  MemoryTranslationRequestCache,
  TranslationFoundationError,
  TranslationFoundationService,
  VNextTranslationGatewayClient,
  W5_TRANSLATION_CONTRACT_VERSION,
  W5_TRANSLATION_MODEL_ID,
  W5_TRANSLATION_PROFILE,
  W5_TRANSLATION_PROFILE_VERSION,
  W5_TRANSLATION_PROVIDER_ID,
  buildTranslationRequestCacheKey,
  vnextTranslationGatewayInvokeFromFunctionsClient,
  type TranslationProfile,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from '@/vnext/translation';
import { createW5ATranslationDocument } from './w5a-fixture';

function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  return {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
    profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: request.requestId,
    targetLocale: request.targetLocale,
    units: request.units.map((unit) => ({
      unitId: unit.unitId,
      runs: unit.runs.map((run) => ({
        runId: run.runId,
        translatedText: `ES: ${run.protectedText}`,
      })),
    })),
    provider: { providerId: W5_TRANSLATION_PROVIDER_ID, modelId: W5_TRANSLATION_MODEL_ID },
  };
}

function requestFixture(): TranslationProviderRequest {
  return {
    contractVersion: W5_TRANSLATION_CONTRACT_VERSION,
    profileVersion: W5_TRANSLATION_PROFILE_VERSION,
    requestId: 'cache-request-1',
    sourceCatalogId: 'catalog-1',
    sourceLocale: 'pt-BR',
    targetLocale: 'es-ES',
    units: [{
      unitId: 'leaf-1',
      sourceHash: 'hash-1',
      kind: 'textObject',
      context: 'Text object',
      runs: [{ runId: 'run-1', protectedText: 'Texto [[VNEXT_TECH_001]]' }],
    }],
  };
}

describe('W5.A translation foundation service', () => {
  it('uses the controlled provider contract end-to-end, excludes technical/asset surfaces, restores tokens, and preserves source', async () => {
    const source = createW5ATranslationDocument();
    const before = JSON.stringify(source);
    const cache = new MemoryTranslationRequestCache();
    let next = 1;
    const provider = new ControlledTranslationProvider();
    const service = new TranslationFoundationService(provider, {
      cache,
      requestId: () => `request-${next++}`,
      sleep: async () => undefined,
    });

    const result = await service.translateCatalog(source);
    expect(result.sourceCatalogId).toBe(source.id);
    expect(result.sourceLocale).toBe('pt-BR');
    expect(result.targetLocale).toBe('es-ES');
    expect(result.providerRequests).toBe(1);
    expect(result.cacheHits).toBe(0);
    expect(provider.requests).toHaveLength(1);
    expect(cache.size).toBe(1);

    const browserPayload = JSON.stringify(provider.requests[0]);
    expect(browserPayload).not.toContain('apiKey');
    expect(browserPayload).not.toContain('providerSecret');
    expect(browserPayload).not.toContain('ALT IMUTÁVEL NÃO TRADUZIR');
    expect(browserPayload).not.toContain('PCON-Y18');
    expect(browserPayload).toContain('[[VNEXT_TECH_');
    expect(result.units.flatMap((unit) => unit.runs.map((run) => run.translatedText)).join('\n')).toContain('TA-25N');
    expect(result.units.flatMap((unit) => unit.runs.map((run) => run.translatedText)).join('\n')).toContain('0 a 70 bar');
    expect(JSON.stringify(source)).toBe(before);

    const cached = await service.translateCatalog(source);
    expect(cached.providerRequests).toBe(0);
    expect(cached.cacheHits).toBe(1);
    expect(provider.requests).toHaveLength(1);
    expect(cached.units).toEqual(result.units);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('rejects unsupported language pairs without provider invocation', async () => {
    const provider = new ControlledTranslationProvider();
    const service = new TranslationFoundationService(provider, { requestId: () => 'request-unsupported' });
    await expect(service.translateCatalog(createW5ATranslationDocument(), 'en-US'))
      .rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'UNSUPPORTED_LANGUAGE' }));
    expect(provider.requests).toHaveLength(0);
  });

  it('rejects stale provider results when source semantic content changes during the request', async () => {
    const source = createW5ATranslationDocument();
    const provider = new ControlledTranslationProvider((request) => {
      source.title = 'Catálogo alterado durante tradução';
      return responseFor(request);
    });
    const service = new TranslationFoundationService(provider, {
      requestId: () => 'request-stale',
      sleep: async () => undefined,
    });
    await expect(service.translateCatalog(source))
      .rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'STALE_RESULT' }));
  });

  it('makes a cancelled job non-authoritative even when the controlled provider returns late', async () => {
    const controller = new AbortController();
    const provider = new ControlledTranslationProvider((request) => {
      controller.abort();
      return responseFor(request);
    });
    const service = new TranslationFoundationService(provider, { requestId: () => 'request-cancelled' });
    await expect(service.translateCatalog(createW5ATranslationDocument(), 'es-ES', controller.signal))
      .rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'ABORTED' }));
  });

  it('retries only a transient provider error and succeeds deterministically', async () => {
    const provider = new ControlledTranslationProvider((request, invocation) => {
      if (invocation === 1) throw new TranslationFoundationError('PROVIDER_RATE_LIMIT', 'controlled rate limit');
      return responseFor(request);
    });
    const service = new TranslationFoundationService(provider, {
      requestId: () => 'request-retry',
      sleep: async () => undefined,
    });
    const result = await service.translateCatalog(createW5ATranslationDocument());
    expect(result.providerRequests).toBe(1);
    expect(provider.requests).toHaveLength(2);
  });

  it('never caches an invalid provider result', async () => {
    const cache = new MemoryTranslationRequestCache();
    const provider = new ControlledTranslationProvider(() => ({ invalid: true }));
    const service = new TranslationFoundationService(provider, {
      cache,
      requestId: () => 'request-invalid',
      sleep: async () => undefined,
    });
    await expect(service.translateCatalog(createW5ATranslationDocument()))
      .rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({ code: 'INVALID_PROVIDER_RESPONSE' }));
    expect(cache.size).toBe(0);
  });
});

describe('W5.A request cache key', () => {
  it('ignores transport requestId but separates every translation-semantic dimension', async () => {
    const base = requestFixture();
    const key = await buildTranslationRequestCacheKey(base);
    expect(await buildTranslationRequestCacheKey({ ...base, requestId: 'other-request' })).toBe(key);

    const variants: TranslationProviderRequest[] = [
      { ...base, sourceCatalogId: 'other-catalog' },
      { ...base, units: [{ ...base.units[0], sourceHash: 'hash-2' }] },
      { ...base, units: [{ ...base.units[0], context: 'Table title' }] },
      { ...base, units: [{ ...base.units[0], runs: [{ ...base.units[0].runs[0], protectedText: 'Outro [[VNEXT_TECH_001]]' }] }] },
      { ...base, sourceLocale: 'pt-PT' } as unknown as TranslationProviderRequest,
      { ...base, targetLocale: 'es-MX' } as unknown as TranslationProviderRequest,
    ];
    for (const variant of variants) {
      expect(await buildTranslationRequestCacheKey(variant)).not.toBe(key);
    }

    const profileVariants: TranslationProfile[] = [
      { ...W5_TRANSLATION_PROFILE, providerId: 'provider-v2' },
      { ...W5_TRANSLATION_PROFILE, modelId: 'model-v2' },
      { ...W5_TRANSLATION_PROFILE, promptVersion: 'prompt-v2' },
      { ...W5_TRANSLATION_PROFILE, tokenPolicyVersion: 'tokens-v2' },
      { ...W5_TRANSLATION_PROFILE, contractVersion: 'contract-v2' },
      { ...W5_TRANSLATION_PROFILE, profileVersion: 'profile-v2' },
    ];
    for (const profile of profileVariants) {
      expect(await buildTranslationRequestCacheKey(base, profile)).not.toBe(key);
    }
  });
});

describe('W5.A VNext gateway client boundary', () => {
  it('adapts the existing authenticated functions-client shape without importing Legacy authority', async () => {
    const request = requestFixture();
    const calls: Array<{ functionName: string; body: TranslationProviderRequest }> = [];
    const invoke = vnextTranslationGatewayInvokeFromFunctionsClient({
      functions: {
        invoke: async (functionName, options) => {
          calls.push({ functionName, body: options.body });
          return { data: responseFor(options.body), error: null };
        },
      },
    });
    const client = new VNextTranslationGatewayClient(invoke);
    expect(await client.translate(request)).toEqual(responseFor(request));
    expect(calls).toEqual([{ functionName: 'vnext-translation-provider', body: request }]);
    expect(JSON.stringify(calls)).not.toContain('apiKey');
    expect(JSON.stringify(calls)).not.toContain('providerSecret');
  });

  it('sends the strict translation request without browser provider secret and keeps provider metadata separate', async () => {
    const request = requestFixture();
    let captured: TranslationProviderRequest | undefined;
    const client = new VNextTranslationGatewayClient(async (body) => {
      captured = body;
      return { data: responseFor(body), error: null };
    });
    const raw = await client.translate(request);
    expect(captured).toEqual(request);
    expect(JSON.stringify(captured)).not.toContain('apiKey');
    expect(JSON.stringify(captured)).not.toContain('providerSecret');
    expect(raw).toEqual(responseFor(request));
    expect((raw as TranslationProviderResponse).provider).toEqual({
      providerId: W5_TRANSLATION_PROVIDER_ID,
      modelId: W5_TRANSLATION_MODEL_ID,
    });
  });

  it.each([
    ['CREDENTIAL_UNAVAILABLE', 'CREDENTIAL_UNAVAILABLE'],
    ['PROVIDER_RATE_LIMIT', 'PROVIDER_RATE_LIMIT'],
    ['PAYLOAD_TOO_LARGE', 'PAYLOAD_TOO_LARGE'],
    ['INVALID_PROVIDER_RESPONSE', 'INVALID_PROVIDER_RESPONSE'],
  ] as const)('maps sanitized server error %s to typed client error %s', async (serverCode, expectedCode) => {
    const client = new VNextTranslationGatewayClient(async () => ({
      data: { error: serverCode },
      error: { message: 'sanitized' },
    }));
    await expect(client.translate(requestFixture()))
      .rejects.toEqual(expect.objectContaining<Partial<TranslationFoundationError>>({ code: expectedCode }));
  });
});
