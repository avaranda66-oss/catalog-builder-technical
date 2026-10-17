import { describe, expect, it } from 'vitest';
import { CatalogDocumentSchema } from '@/vnext';
import {
  ControlledTranslationProvider, TranslationFoundationService, resolveTranslationProfile,
  type TranslationFoundationResult, type TranslationProviderRequest, type TranslationProviderResponse,
} from '@/vnext/translation';
import { materializeTranslationCandidate, translationReviewKey } from '@/vnext/translation/candidate';
import { createW5ATranslationDocument } from './w5a-fixture';

const PRESSURE = 'Pressão máxima 1.500 mbar';
const ACCURACY = 'Exatidão: ±0,02 % FE';

/** Realistic authored evaluation content, never approved PRESYS product specifications. */
function guardianDocument() {
  const document = createW5ATranslationDocument();
  const text = document.pages[0].objects.find(object => object.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Fixture text missing');
  text.text = { paragraphs: [
    { id: 'guard-p1', inlines: [{ kind: 'text', id: 'guard-pressure', text: PRESSURE, marks: [] }] },
    { id: 'guard-p2', inlines: [{ kind: 'text', id: 'guard-accuracy', text: ACCURACY, marks: [] }] },
  ] };
  return CatalogDocumentSchema.parse(document);
}

/** Protected data comes back verbatim, like the real gateway. */
function responseFor(request: TranslationProviderRequest): TranslationProviderResponse {
  const profile = resolveTranslationProfile(request.sourceLocale, request.targetLocale, request.profileVersion);
  return { contractVersion: profile.contractVersion, profileVersion: profile.profileVersion, requestId: request.requestId,
    targetLocale: profile.targetLocale, provider: { providerId: profile.providerId, modelId: profile.modelId },
    units: request.units.map(unit => ({ unitId: unit.unitId, runs: unit.runs.map(run => ({ runId: run.runId, translatedText: `EN: ${run.protectedText}` })) })) };
}

function withRunText(result: TranslationFoundationResult, runId: string, replace: (text: string) => string): TranslationFoundationResult {
  return { ...result, units: result.units.map(unit => ({ ...unit,
    runs: unit.runs.map(run => (run.runId === runId ? { ...run, translatedText: replace(run.translatedText) } : run)) })) };
}

describe('FR-85 guardian · provider output must keep technical data verbatim', () => {
  it('rejects a provider result that already adapted a number, and accepts the same text only as a reviewer correction', async () => {
    const document = guardianDocument();
    const foundation = new TranslationFoundationService(new ControlledTranslationProvider(responseFor), { maxAttempts: 1 });
    const result = await foundation.translateCatalog(document, 'en-US');
    const pressureRun = result.units.flatMap(unit => unit.runs.map(run => ({ unit, run }))).find(item => item.run.runId === 'guard-pressure')!;
    expect(pressureRun.run.translatedText).toBe(`EN: ${PRESSURE}`);

    const verbatim = await materializeTranslationCandidate(document, result);
    expect(verbatim.runs.find(run => run.runId === 'guard-pressure')?.translatedText).toBe(`EN: ${PRESSURE}`);

    // "1.500 mbar" → "1,500 mbar" without anyone confirming the reading: not a legitimate provider output.
    const adapted = withRunText(result, 'guard-pressure', text => text.replace('1.500 mbar', '1,500 mbar'));
    await expect(materializeTranslationCandidate(document, adapted)).rejects.toMatchObject({ code: 'TECHNICAL_TOKEN_MISMATCH' });
    const abbreviated = withRunText(result, 'guard-accuracy', text => text.replace('±0,02 % FE', '±0.02 % FS'));
    await expect(materializeTranslationCandidate(document, abbreviated)).rejects.toMatchObject({ code: 'TECHNICAL_TOKEN_MISMATCH' });

    // The same forms are fine when they come from the reviewer (coordinator.correct validated them with the locale).
    const corrections = new Map([
      [translationReviewKey(pressureRun.unit.unitId, 'guard-pressure'), 'EN: Maximum pressure 1,500 mbar'],
      [translationReviewKey(pressureRun.unit.unitId, 'guard-accuracy'), 'EN: Accuracy: ±0.02 % FS'],
    ]);
    const reviewed = await materializeTranslationCandidate(document, result, corrections);
    expect(reviewed.runs.filter(run => run.runId.startsWith('guard-')).map(run => run.translatedText))
      .toEqual(['EN: Maximum pressure 1,500 mbar', 'EN: Accuracy: ±0.02 % FS']);
    expect(reviewed.document.locale).toBe('en-US');

    // A reviewer correction still cannot change a value.
    const wrong = new Map([[translationReviewKey(pressureRun.unit.unitId, 'guard-accuracy'), 'EN: Accuracy: ±0.2 % FS']]);
    await expect(materializeTranslationCandidate(document, result, wrong)).rejects.toMatchObject({ code: 'TECHNICAL_TOKEN_MISMATCH' });
  });
});
