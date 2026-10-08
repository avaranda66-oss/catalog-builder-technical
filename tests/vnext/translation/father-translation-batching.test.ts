import { describe, expect, it } from 'vitest';
import { CatalogDocumentSchema, plainRichText } from '@/vnext';
import {
  ControlledTranslationProvider, MemoryTranslationRequestCache, TranslationFoundationError,
  createTranslationCenterFoundation, extractSemanticTranslationCoverage, resolveTranslationProfile,
  type TranslationBatchProgress, type TranslationProviderRequest, type TranslationProviderResponse,
} from '@/vnext/translation';
import { materializeTranslationCandidate } from '@/vnext/translation/candidate';
import { fatherTranslationCatalog, technicalNarrative } from './father-translation-fixture';

function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
  return { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: request.requestId,
    targetLocale: profile.targetLocale, provider: { providerId: profile.providerId, modelId: profile.modelId },
    units: request.units.map(unit => ({ unitId: unit.unitId,
      runs: unit.runs.map(run => ({ runId: run.runId, translatedText: run.protectedText })) })) };
}

function addNarrative(source: ReturnType<typeof fatherTranslationCatalog>, text: string) {
  const rich = plainRichText('father-long-rich', text);
  const inline = rich.paragraphs[0].inlines[0];
  if (inline.kind === 'text') inline.marks = ['bold', 'italic'];
  source.pages[0].objects.push({ id: 'father-long-text', type: 'text', zIndex: 99,
    frame: { xMm: 10, yMm: 10, widthMm: 180, heightMm: 260 }, text: rich, style: {} });
  return rich;
}

function expectBounded(requests: readonly TranslationProviderRequest[]) {
  for (const request of requests) {
    expect(request.units.length).toBeLessThanOrEqual(60);
    expect(request.units.flatMap(unit => unit.runs).reduce((sum, run) => sum + run.protectedText.length, 0)).toBeLessThanOrEqual(30_000);
    expect(request.units.flatMap(unit => unit.runs).every(run => run.protectedText.length <= 4_000)).toBe(true);
  }
}

describe.each(['es-ES', 'en-US'] as const)('Father translation transport and assembly %s', targetLocale => {
  it('preserves whitespace-only frames, cells and marked inlines without requesting or reviewing blank prose', async () => {
    const source = fatherTranslationCatalog('small');
    const mixed = addNarrative(source, 'Descrição técnica útil.');
    mixed.paragraphs[0].inlines.push({ id: 'father-blank-inline', kind: 'text', text: ' '.repeat(3_500), marks: ['bold'] });
    source.pages[0].objects.push({ id: 'father-blank-frame', type: 'text', zIndex: 100,
      frame: { xMm: 10, yMm: 10, widthMm: 180, heightMm: 20 }, style: {}, text: plainRichText('father-blank-rich', ' ') });
    const table = source.pages[0].objects.find(object => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Expected realistic table');
    table.table.cells[0].content = { type: 'richText', value: plainRichText('father-blank-cell', ' '.repeat(3_500)) };
    CatalogDocumentSchema.parse(source);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(responseFor);
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale);
    expect(result.coverage.excluded.filter(item => item.reason === 'empty-rich-text')).toHaveLength(2);
    expect(result.coverage.eligible.flatMap(leaf => leaf.runs).every(run => run.text.trim())).toBe(true);
    expect(provider.requests.flatMap(request => request.units.flatMap(item => item.runs)).every(run => run.protectedText.trim())).toBe(true);
    const candidate = await materializeTranslationCandidate(source, result);
    expect(candidate.document).toEqual({ ...before, locale: targetLocale });
    expect(candidate.runs.some(run => run.runId === 'father-blank-inline')).toBe(false);
    expect(source).toEqual(before);
  });

  it('rejects changes to excluded whitespace during a multi-batch generation', async () => {
    const source = fatherTranslationCatalog('medium');
    const rich = addNarrative(source, ' ');
    const provider = new ControlledTranslationProvider((request, invocation) => {
      if (invocation === 2) {
        const inline = rich.paragraphs[0].inlines[0];
        if (inline.kind === 'text') inline.text = '  ';
      }
      return responseFor(request);
    });
    await expect(createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale)).rejects.toMatchObject({ code: 'STALE_RESULT' });
    expect(provider.requests).toHaveLength(2);
  });

  it.each([
    ['internal gap', `Inicial ${' '.repeat(3_500)}final.`],
    ['leading spaces', `${' '.repeat(3_500)}Descrição técnica de operação.`],
    ['trailing spaces', `Descrição técnica de operação.${' '.repeat(3_500)}`],
    ['mixed boundary whitespace', `Inicial${' \u00a0'.repeat(1_800)}final.`],
  ])('preserves exact %s without sending an empty transport fragment', async (_case, narrative) => {
    const source = fatherTranslationCatalog('small');
    addNarrative(source, narrative);
    CatalogDocumentSchema.parse(source);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(responseFor);
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale);
    const unit = result.units.find(item => item.locator.kind === 'textObject' && item.locator.objectId === 'father-long-text')!;
    expect(unit.runs[0].translatedText).toBe(narrative);
    expect(provider.requests.flatMap(request => request.units.flatMap(item => item.runs)).every(run => run.protectedText.trim())).toBe(true);
    expectBounded(provider.requests);
    expect((await materializeTranslationCandidate(source, result)).document).toEqual({ ...before, locale: targetLocale });
    expect(source).toEqual(before);
  });

  it('leaves expansion headroom for a valid source run between 2800 and 4000 characters', async () => {
    const source = fatherTranslationCatalog('small');
    const narrative = 'palavra '.repeat(437);
    expect(narrative.length).toBeGreaterThan(2_800);
    expect(narrative.length).toBeLessThan(4_000);
    addNarrative(source, narrative);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(request => {
      const response = responseFor(request);
      return { ...response, units: response.units.map(unit => ({ ...unit, runs: unit.runs.map(run => ({ ...run,
        translatedText: run.translatedText.includes('palavra') ? run.translatedText + ' ampliado'.repeat(60) : run.translatedText,
      })) })) };
    });
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale);
    const parts = provider.requests.flatMap(request => request.units.flatMap(unit => unit.runs)).filter(run => run.protectedText.includes('palavra'));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every(run => run.protectedText.length <= 2_800)).toBe(true);
    expectBounded(provider.requests);
    expect(result.units.flatMap(unit => unit.runs).some(run => run.translatedText.length > 4_000)).toBe(true);
    expect((await materializeTranslationCandidate(source, result)).document.locale).toBe(targetLocale);
    expect(source).toEqual(before);
  });

  it.each(['small', 'medium', 'large'] as const)('covers every unique canonical unit in the %s realistic dataset without mutating the source', async size => {
    const source = fatherTranslationCatalog(size);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(responseFor);
    const progress: TranslationBatchProgress[] = [];
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale, undefined, value => progress.push(value));
    expectBounded(provider.requests);
    expect(result.units.map(unit => unit.unitId)).toEqual(result.coverage.eligible.map(leaf => leaf.leafId));
    expect(new Set(result.units.map(unit => unit.unitId)).size).toBe(result.units.length);
    expect(result.providerRequests).toBe(provider.requests.length);
    expect(progress.at(-1)).toMatchObject({ completedBatches: provider.requests.length, totalBatches: provider.requests.length });
    const candidate = await materializeTranslationCandidate(source, result);
    expect(candidate.document).toEqual({ ...before, locale: targetLocale });
    expect(source).toEqual(before);
    if (size === 'large') expect(provider.requests.length).toBeGreaterThan(20);
    if (size === 'small') expect(provider.requests.flatMap(request => request.units.map(unit => unit.unitId))).toEqual(result.units.map(unit => unit.unitId));
  });

  it('segments a long single run at safe boundaries and restores exact text, whitespace, IDs and marks', async () => {
    const source = fatherTranslationCatalog('small');
    const narrative = ` \t${technicalNarrative(35)}\t `;
    expect(narrative.length).toBeGreaterThan(4_000);
    addNarrative(source, narrative);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(responseFor);
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale);
    expectBounded(provider.requests);
    const leaf = result.coverage.eligible.find(item => item.locator.kind === 'textObject' && item.locator.objectId === 'father-long-text')!;
    const unit = result.units.find(item => item.unitId === leaf.leafId)!;
    expect(unit.runs).toEqual([{ runId: leaf.runs[0].runId, translatedText: narrative }]);
    expect(provider.requests.flatMap(request => request.units).find(item => item.unitId === leaf.leafId)!.runs.length).toBeGreaterThan(1);
    const candidate = await materializeTranslationCandidate(source, result);
    expect(candidate.document).toEqual({ ...before, locale: targetLocale });
  });

  it('fragments a semantic leaf larger than one entire request and reassembles all paragraphs in order', async () => {
    const source = fatherTranslationCatalog('small');
    const rich = addNarrative(source, technicalNarrative(160));
    rich.paragraphs = Array.from({ length: 160 }, (_, index) => plainRichText(`father-long-paragraph-${index}`, `${technicalNarrative(1)} Condição de ensaio ${index + 1}.`).paragraphs[0]);
    const before = structuredClone(source);
    const provider = new ControlledTranslationProvider(responseFor);
    const result = await createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale);
    expectBounded(provider.requests);
    expect(provider.requests.length).toBeGreaterThan(1);
    const fragments = provider.requests.flatMap(request => request.units).filter(unit => unit.unitId.startsWith('translation-fragment:'));
    expect(fragments.length).toBeGreaterThan(1);
    expect(new Set(fragments.map(unit => unit.unitId)).size).toBe(fragments.length);
    expect((await materializeTranslationCandidate(source, result)).document).toEqual({ ...before, locale: targetLocale });
  });

  it('reports partial completion, stops after one failed dispatch and resumes only validated batches on a manual retry', async () => {
    const source = fatherTranslationCatalog('medium');
    const before = structuredClone(source);
    const cache = new MemoryTranslationRequestCache();
    const provider = new ControlledTranslationProvider((request, invocation) => {
      if (invocation === 2) throw new TranslationFoundationError('PROVIDER_UNAVAILABLE', 'Controlled unavailable batch');
      return responseFor(request);
    });
    const foundation = createTranslationCenterFoundation(provider, { cache });
    const progress: TranslationBatchProgress[] = [];
    await expect(foundation.translateCatalog(source, targetLocale, undefined, value => progress.push(value))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(provider.requests).toHaveLength(2);
    expect(cache.size).toBe(1);
    expect(progress.at(-1)).toMatchObject({ completedBatches: 1 });
    const retried = await foundation.translateCatalog(source, targetLocale);
    expect(retried.cacheHits).toBe(1);
    expect(retried.providerRequests).toBe(progress[0].totalBatches - 1);
    expect(provider.requests.length).toBe(progress[0].totalBatches + 1);
    const final = await foundation.translateCatalog(source, targetLocale);
    expect(final.providerRequests).toBe(0);
    expect(source).toEqual(before);
  });

  it('rejects a changed source between fragments before any assembled candidate is returned', async () => {
    const source = fatherTranslationCatalog('small');
    addNarrative(source, technicalNarrative(160));
    const provider = new ControlledTranslationProvider((request, invocation) => {
      if (invocation === 2) source.title = 'Origem alterada durante tradução';
      return responseFor(request);
    });
    await expect(createTranslationCenterFoundation(provider).translateCatalog(source, targetLocale)).rejects.toMatchObject({ code: 'STALE_RESULT' });
    expect(provider.requests).toHaveLength(2);
  });
});

it('never splits a surrogate pair or a protected placeholder at a hard boundary', async () => {
  const source = fatherTranslationCatalog('small');
  addNarrative(source, `${'á'.repeat(2799)}🔬${'β'.repeat(2799)} TA-25N ${'γ'.repeat(3000)}`);
  const provider = new ControlledTranslationProvider(responseFor);
  const result = await createTranslationCenterFoundation(provider).translateCatalog(source);
  expectBounded(provider.requests);
  for (const run of provider.requests.flatMap(request => request.units.flatMap(unit => unit.runs))) {
    expect(run.protectedText).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    const withoutPlaceholders = run.protectedText.replace(/\[\[VNEXT_TECH(?:_[A-Z0-9]+)*_\d{3,}\]\]/g, '');
    expect(withoutPlaceholders).not.toContain('[[VNEXT_TECH_');
  }
  const expected = await extractSemanticTranslationCoverage(source);
  expect(result.units.at(-1)!.runs[0].translatedText).toBe(expected.eligible.at(-1)!.runs[0].text);
});
