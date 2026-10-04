import { describe, expect, it } from 'vitest';
import { ControlledTranslationProvider, MemoryTranslationRequestCache, TranslationFoundationService, VNextTranslationGatewayClient, VNEXT_TRANSLATION_LANGUAGES, VNEXT_TRANSLATION_FUTURE_LANGUAGES, VNEXT_TRANSLATION_PROFILES, W5_TRANSLATION_PROFILE, assertProtectedTokenIntegrity, buildTranslationRequestCacheKey, getTranslationLanguage, protectTechnicalTokens, resolveTranslationProfile, restoreTechnicalTokens, translationRunKey, validateProviderResponse, type TranslationProviderRequest } from '@/vnext/translation';
import { materializeTranslationCandidate, requireReviewText } from '@/vnext/translation/candidate';
import { createW5ATranslationDocument } from './w5a-fixture';

describe('P2 exact language registry and profile isolation', () => {
  it('keeps the active Latin font-compatible source and two targets separate from unavailable planning metadata', () => {
    expect(VNEXT_TRANSLATION_LANGUAGES.map(language => [language.locale, language.role])).toEqual([
      ['pt-BR', 'source'], ['es-ES', 'target'], ['en-US', 'target'],
    ]);
    expect(VNEXT_TRANSLATION_LANGUAGES.every(language => language.direction === 'ltr' && language.script === 'Latn'
      && language.fontFamily === 'Noto Sans' && language.fontProfile === 'noto-sans-latin-v1' && language.nativeName && language.englishName)).toBe(true);
    expect(VNEXT_TRANSLATION_FUTURE_LANGUAGES.map(language => language.locale)).toEqual(['en-GB', 'es-MX', 'fr-FR', 'de-DE', 'it-IT', 'pt-PT']);
    expect(VNEXT_TRANSLATION_FUTURE_LANGUAGES.every(language => language.availability === 'NOT_AVAILABLE')).toBe(true);
    expect(getTranslationLanguage('en-GB')).toBeUndefined();
    expect(Object.isFrozen(VNEXT_TRANSLATION_LANGUAGES)).toBe(true);
    expect(VNEXT_TRANSLATION_LANGUAGES.every(Object.isFrozen)).toBe(true);
    expect(W5_TRANSLATION_PROFILE).toBe(VNEXT_TRANSLATION_PROFILES[0]);
    expect(VNEXT_TRANSLATION_PROFILES.map(profile => profile.promptVersion)).toEqual(['w5-technical-es-v2', 'p2-technical-en-v1']);
    expect(VNEXT_TRANSLATION_PROFILES.every(profile => profile.tokenPolicyVersion === 'p2-tech-tokens-v2')).toBe(true);
  });

  it.each([['pt-BR', 'en-GB'], ['pt-BR', 'es-MX'], ['es-ES', 'en-US'], ['en-US', 'es-ES'], ['pt-PT', 'es-ES'], ['pt-BR', 'pt-BR']])('rejects %s → %s before provider dispatch', async (sourceLocale, targetLocale) => {
    const provider = new ControlledTranslationProvider();
    const source = createW5ATranslationDocument(); source.locale = sourceLocale;
    await expect(new TranslationFoundationService(provider).translateCatalog(source, targetLocale)).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    expect(provider.requests).toHaveLength(0);
  });

  it('rejects obsolete Spanish and cross-target profiles without fallback', () => {
    expect(() => resolveTranslationProfile('pt-BR', 'es-ES', 'w5-ptbr-eses-v1')).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }));
    expect(() => resolveTranslationProfile('pt-BR', 'en-US', W5_TRANSLATION_PROFILE.profileVersion)).toThrow(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  });
  it('rejects an unsupported or forged request directly in the gateway client before transport', async () => {
    const provider = new ControlledTranslationProvider();
    await new TranslationFoundationService(provider).translateCatalog(createW5ATranslationDocument(), 'en-US');
    const request = provider.requests[0]; const calls: TranslationProviderRequest[] = [];
    const client = new VNextTranslationGatewayClient(async value => { calls.push(value); return { data: 'fixture', error: null }; });
    await expect(client.translate({ ...request, targetLocale: 'en-GB' } as unknown as TranslationProviderRequest)).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' });
    await expect(client.translate({ ...request, profileVersion: W5_TRANSLATION_PROFILE.profileVersion })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(client.translate({ ...request, contractVersion: 'unknown' } as unknown as TranslationProviderRequest)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(calls).toHaveLength(0); expect(await client.translate(request)).toBe('fixture');
    expect(calls).toEqual([request]);
  });

  it('shares a cache safely across both targets and only reuses the matching versioned profile', async () => {
    const provider = new ControlledTranslationProvider(); const cache = new MemoryTranslationRequestCache();
    const service = new TranslationFoundationService(provider, { cache }); const source = createW5ATranslationDocument();
    const spanish = await service.translateCatalog(source, 'es-ES');
    const english = await service.translateCatalog(source, 'en-US');
    const spanishAgain = await service.translateCatalog(source, 'es-ES');
    const englishAgain = await service.translateCatalog(source, 'en-US');
    expect(provider.requests.map(request => request.targetLocale)).toEqual(['es-ES', 'en-US']);
    expect(cache.size).toBe(2);
    expect([spanishAgain.cacheHits, englishAgain.cacheHits]).toEqual([1, 1]);
    expect(spanishAgain.units).toEqual(spanish.units); expect(englishAgain.units).toEqual(english.units);
    expect(spanish.profileVersion).not.toBe(english.profileVersion);
    const request = provider.requests[1]; const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale);
    const key = await buildTranslationRequestCacheKey(request);
    expect(key).toBe(await buildTranslationRequestCacheKey(request, profile));
    for (const field of ['sourceLocale', 'targetLocale', 'providerId', 'modelId', 'promptVersion', 'tokenPolicyVersion', 'contractVersion', 'profileVersion'] as const) {
      expect(await buildTranslationRequestCacheKey(request, { ...profile, [field]: 'different' })).not.toBe(key);
    }
  });
});

describe.each(VNEXT_TRANSLATION_PROFILES)('P2 response and candidate $targetLocale', profile => {
  function fixture() {
    const protection = protectTechnicalTokens('PRESYS TA-25N; IEC 61010-1; TCP/IP; ±0,05 % (k = 2); 100 Ω');
    const request: TranslationProviderRequest = { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion,
      requestId: 'request', sourceCatalogId: 'catalog', sourceLocale: profile.sourceLocale, targetLocale: profile.targetLocale,
      units: [{ unitId: 'unit', sourceHash: 'hash', kind: 'textObject', context: 'Text', runs: [{ runId: 'run', protectedText: protection.protectedText }] }] };
    const response = { contractVersion: request.contractVersion, profileVersion: request.profileVersion, requestId: request.requestId,
      targetLocale: request.targetLocale, provider: { providerId: profile.providerId, modelId: profile.modelId },
      units: [{ unitId: 'unit', runs: [{ runId: 'run', translatedText: protection.protectedText }] }] };
    const context = { currentSourceHashes: new Map([['unit', 'hash']]), protectedRuns: new Map([[translationRunKey('unit', 'run'), protection]]) };
    return { request, response, context, protection };
  }
  it('rejects forged pair/profile/contract/provider and stale hashes', () => {
    const f = fixture(); expect(validateProviderResponse(f.request, f.response, f.context)).toEqual(f.response);
    const other = VNEXT_TRANSLATION_PROFILES.find(item => item.targetLocale !== profile.targetLocale)!;
    for (const patch of [{ targetLocale: other.targetLocale }, { profileVersion: other.profileVersion }, { profileVersion: 'w5-ptbr-eses-v1' },
      { contractVersion: 'unknown' }, { requestId: 'unknown' }, { provider: { providerId: 'other', modelId: profile.modelId } }]) {
      expect(() => validateProviderResponse(f.request, { ...f.response, ...patch }, f.context)).toThrow();
    }
    expect(() => validateProviderResponse({ ...f.request, profileVersion: other.profileVersion }, f.response, f.context)).toThrow();
    expect(() => validateProviderResponse(f.request, f.response, { ...f.context, currentSourceHashes: new Map([['unit', 'stale']]) })).toThrow(expect.objectContaining({ code: 'STALE_RESULT' }));
  });
  it.each(['missing-unit', 'duplicate-unit', 'unknown-unit', 'missing-run', 'duplicate-run', 'unknown-run', 'markup', 'control', 'empty', 'long', 'missing-token', 'duplicate-token'])('rejects %s output', mutation => {
    const f = fixture(); const response = structuredClone(f.response); const run = response.units[0].runs[0];
    if (mutation === 'missing-unit') response.units = [];
    if (mutation === 'duplicate-unit') response.units.push(response.units[0]);
    if (mutation === 'unknown-unit') response.units[0].unitId = 'unknown';
    if (mutation === 'missing-run') response.units[0].runs = [];
    if (mutation === 'duplicate-run') response.units[0].runs.push(run);
    if (mutation === 'unknown-run') run.runId = 'unknown';
    if (mutation === 'markup') run.translatedText += '<b>text</b>';
    if (mutation === 'control') run.translatedText += String.fromCharCode(0);
    if (mutation === 'empty') run.translatedText = '  ';
    if (mutation === 'long') run.translatedText += 'x'.repeat(4001);
    if (mutation === 'missing-token') run.translatedText = run.translatedText.replace(f.protection.tokens[0].placeholder, '');
    if (mutation === 'duplicate-token') run.translatedText += f.protection.tokens[0].placeholder;
    expect(() => validateProviderResponse(f.request, response, f.context)).toThrow();
  });
  it('preserves the original and supplies human page/type context; forged candidate profile is rejected', async () => {
    const source = createW5ATranslationDocument(); const before = structuredClone(source);
    const result = await new TranslationFoundationService(new ControlledTranslationProvider()).translateCatalog(source, profile.targetLocale);
    const candidate = await materializeTranslationCandidate(source, result);
    expect(candidate.document.locale).toBe(profile.targetLocale); expect(source).toEqual(before);
    expect(candidate.runs[0].locationLabel).toBe('Catálogo · Título do catálogo');
    expect(candidate.runs.some(run => run.pageLabel === 'Página 2' && run.typeLabel === 'Texto')).toBe(true);
    expect(candidate.runs.every(run => !run.locationLabel.includes(run.unitId))).toBe(true);
    const other = VNEXT_TRANSLATION_PROFILES.find(item => item.targetLocale !== profile.targetLocale)!;
    await expect(materializeTranslationCandidate(source, { ...result, profileVersion: other.profileVersion })).rejects.toThrow();
  });
});

describe('P2 limited evidence-backed technical protection', () => {
  it('preserves an authored placeholder-looking literal while rejecting new foreign or partial transport placeholders', () => {
    const source = 'Literal [[VNEXT_TECH_001]] e PRESYS TA-25N.';
    const protectedValue = protectTechnicalTokens(source);
    expect(restoreTechnicalTokens(protectedValue.protectedText, protectedValue)).toBe(source);
    expect(() => requireReviewText(source, source)).not.toThrow();
    expect(() => requireReviewText(source, source.replace('001', '002'))).toThrow();
    for (const added of ['[[VNEXT_TECH_FOREIGN_999]]', '[[VNEXT_TECH_BROKEN']) {
      expect(() => assertProtectedTokenIntegrity(protectedValue.protectedText + added, protectedValue)).toThrow();
      expect(() => requireReviewText(source, source + added)).toThrow();
    }
  });
  it.each(['IEC 61010-1', 'IEC 61010-1:2020', 'IEC 61326-1', 'ISO/IEC 17025', 'TCP/IP', 'USB', 'Ethernet', '−20–+80 °C', '100 Ω', '±0,05 %', '2', 'µA', 'mA', 'mV', 'ohms', 'TCs', 'RTDs', 'Ω', '%', '±', '°C', '≤', '≥', '≈', 'µ', '1.234,56 mV'])('protects exact %s without interpreting it', token => {
    const protection = protectTechnicalTokens(`Valor (${token}) conforme a origem.`);
    expect(protection.tokens.map(item => item.value)).toContain(token);
  });
  it.each([
    ['IEC 61010-1:2020', 'IEC 61010-1:2021'], ['Protocolos USB e Ethernet.', 'Protocolos CAN e Ethernet.'],
    ['Protocolos USB e Ethernet.', 'Protocolos USB e WiFi.'], ['Unidades mA e mV.', 'Unidades V e mV.'],
    ['Unidades mA e mV.', 'Unidades mA e A.'], ['Exatidão ≤ 0,1 %.', 'Exatidão ≥ 0,1 %.'],
    ['Valor ≈ 23 °C.', 'Valor = 23 °C.'], ['Ano:2020; fator=2.', 'Ano:2021; fator=2.'],
    ['Valor 1.234,56 mV.', 'Valor 1.234.56 mV.'],
  ])('rejects technical corruption from %s to %s', (source, changed) => {
    expect(() => requireReviewText(source, changed)).toThrow(expect.objectContaining({ code: 'TECHNICAL_TOKEN_MISMATCH' }));
  });
  it('does not freeze the ordinary Portuguese article A or connector a as a standalone Ampere unit', () => {
    const protectedValue = protectTechnicalTokens('A medição de 0 a 70 bar usa 12 A.');
    expect(protectedValue.protectedText.startsWith('A medição de ')).toBe(true);
    expect(protectedValue.protectedText).toContain(' a ');
    expect(protectedValue.tokens.map(token => token.value)).toContain('12 A');
  });
  it('protects signed endpoints, standalone units and uncertainty coverage factor while leaving prose translatable', () => {
    const source = 'Faixa −20 a +80 °C; incerteza ±0,05 % (k = 2); µA, Ω e %.';
    const protection = protectTechnicalTokens(source);
    for (const value of ['−20', '+80 °C', '±0,05 %', '2', 'µA', 'Ω', '%']) expect(protection.tokens.map(token => token.value)).toContain(value);
    expect(protection.protectedText).toContain(' a ');
    expect(() => requireReviewText(source, source.replace('k = 2', 'k = 3'))).toThrow();
  });
});
