import { describe, expect, it, vi } from 'vitest';
import {
  ControlledTranslationProvider,
  MemoryTranslationRequestCache,
  TranslationFoundationError,
  VNextTranslationGatewayClient,
  createTranslationCenterFoundation,
  resolveTranslationProfile,
  vnextTranslationGatewayInvokeFromFunctionsClient,
  type TranslationProviderRequest,
  type TranslationProviderResponse,
} from '@/vnext/translation';
import { createW5ATranslationDocument } from './w5a-fixture';

function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
  return {
    contractVersion: profile.contractVersion,
    profileVersion: profile.profileVersion,
    requestId: request.requestId,
    targetLocale: profile.targetLocale,
    units: request.units.map(unit => ({
      unitId: unit.unitId,
      runs: unit.runs.map(run => ({ runId: run.runId, translatedText: `Tradução: ${run.protectedText}` })),
    })),
    provider: { providerId: profile.providerId, modelId: profile.modelId },
  };
}

function largerCatalog() {
  const source = createW5ATranslationDocument();
  for (let index = 0; index < 70; index += 1) {
    const id = `attempts-extra-${index}`;
    source.pages[0].objects.push({
      id, type: 'text', zIndex: 100 + index,
      frame: { xMm: 10, yMm: 200, widthMm: 100, heightMm: 10 },
      text: { paragraphs: [{ id: `${id}:p`, inlines: [{ kind: 'text', id: `${id}:t`, text: 'Descrição técnica editável', marks: [] }] }] },
      style: {},
    });
  }
  return source;
}

describe.each(['es-ES', 'en-US'])('P2 Translation Center single attempt for %s', targetLocale => {
  it.each([
    ['PROVIDER_RATE_LIMIT', 429],
    ['PROVIDER_UNAVAILABLE', 502],
    ['CREDENTIAL_UNAVAILABLE', 503],
  ] as const)('does not redispatch a real-shaped %s gateway failure', async (code, status) => {
    const invoke = vi.fn(async () => {
      const context = new Response(JSON.stringify({ error: code }), { status });
      return { data: null, error: { message: 'Gateway failed', context }, response: context };
    });
    const sleep = vi.fn(async () => undefined);
    const cache = new MemoryTranslationRequestCache();
    const foundation = createTranslationCenterFoundation(
      new VNextTranslationGatewayClient(vnextTranslationGatewayInvokeFromFunctionsClient({ functions: { invoke } })),
      { cache, sleep }
    );
    await expect(foundation.translateCatalog(createW5ATranslationDocument(), targetLocale)).rejects.toMatchObject({ code });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('does not redispatch an ambiguous transport failure', async () => {
    const invoke = vi.fn(async () => { throw new Error('Controlled transport failure'); });
    const sleep = vi.fn(async () => undefined);
    const foundation = createTranslationCenterFoundation(new VNextTranslationGatewayClient(invoke), { sleep });
    await expect(foundation.translateCatalog(createW5ATranslationDocument(), targetLocale))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('pins one attempt even if runtime options try to reintroduce automatic retries', async () => {
    const provider = new ControlledTranslationProvider(() => {
      throw new TranslationFoundationError('PROVIDER_RATE_LIMIT', 'Controlled rate limit');
    });
    const sleep = vi.fn(async () => undefined);
    const runtimeOptions = { maxAttempts: 3, sleep };
    const foundation = createTranslationCenterFoundation(provider, runtimeOptions);
    await expect(foundation.translateCatalog(createW5ATranslationDocument(), targetLocale))
      .rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    expect(provider.requests).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('permits an explicit manual retry and then reuses only the validated result', async () => {
    const source = createW5ATranslationDocument();
    const before = JSON.stringify(source);
    const cache = new MemoryTranslationRequestCache();
    const provider = new ControlledTranslationProvider((request, invocation) => {
      if (invocation === 1) throw new TranslationFoundationError('PROVIDER_UNAVAILABLE', 'Controlled provider failure');
      return responseFor(request);
    });
    const foundation = createTranslationCenterFoundation(provider, { cache });
    await expect(foundation.translateCatalog(source, targetLocale)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(provider.requests).toHaveLength(1);
    expect(cache.size).toBe(0);
    const manualRetry = await foundation.translateCatalog(source, targetLocale);
    expect(manualRetry.targetLocale).toBe(targetLocale);
    expect(provider.requests).toHaveLength(2);
    expect(cache.size).toBe(1);
    const cached = await foundation.translateCatalog(source, targetLocale);
    expect(cached.cacheHits).toBe(1);
    expect(cached.providerRequests).toBe(0);
    expect(provider.requests).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('preserves larger catalog batching with one dispatch per uncached batch', async () => {
    const source = largerCatalog();
    const before = JSON.stringify(source);
    const provider = new ControlledTranslationProvider();
    const foundation = createTranslationCenterFoundation(provider);
    const result = await foundation.translateCatalog(source, targetLocale);
    expect(provider.requests).toHaveLength(2);
    expect(result.providerRequests).toBe(2);
    expect(provider.requests.every(request => request.units.length <= 60)).toBe(true);
    expect(result.units.length).toBe(result.coverage.eligible.length);
    const identities = provider.requests.flatMap(request => request.units.map(unit => unit.unitId));
    expect(new Set(identities).size).toBe(identities.length);
    const cached = await foundation.translateCatalog(source, targetLocale);
    expect(cached.cacheHits).toBe(2);
    expect(provider.requests).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('stops a multi-batch job after the first failure without retrying or dispatching later batches', async () => {
    const provider = new ControlledTranslationProvider(() => {
      throw new TranslationFoundationError('PROVIDER_RATE_LIMIT', 'Controlled rate limit');
    });
    const foundation = createTranslationCenterFoundation(provider);
    await expect(foundation.translateCatalog(largerCatalog(), targetLocale)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    expect(provider.requests).toHaveLength(1);
  });

  it('fails closed on invalid output without a second provider dispatch', async () => {
    const provider = new ControlledTranslationProvider(() => ({ units: [] }));
    const cache = new MemoryTranslationRequestCache();
    await expect(createTranslationCenterFoundation(provider, { cache }).translateCatalog(createW5ATranslationDocument(), targetLocale))
      .rejects.toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
    expect(provider.requests).toHaveLength(1);
    expect(cache.size).toBe(0);
  });
});
