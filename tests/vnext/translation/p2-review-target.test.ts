import { describe, expect, it, vi } from 'vitest';
import { ControlledTranslationProvider, TranslationFoundationService } from '@/vnext/translation';
import { translationReviewKey } from '@/vnext/translation/candidate';
import { TranslationReviewCoordinator, type TranslationSource } from '@/vnext/translation/review-coordinator';
import { deferred, idSequence, StrictCasCatalogRepository, uuid } from '../persistence/w3h-fixtures';
import { createW5ATranslationDocument } from './w5a-fixture';

function setup(provider = new ControlledTranslationProvider()) {
  const document = createW5ATranslationDocument(); const repository = new StrictCasCatalogRepository(document);
  let source: TranslationSource | undefined = { document, remoteRevision: 1, authLineage: 'user-a', authorityScopeId: 'scope-a', openSessionId: 'open-a' };
  const foundation = new TranslationFoundationService(provider, { maxAttempts: 1 });
  const review = new TranslationReviewCoordinator({ foundation, repository,
    getSource: () => source, authLineage: () => 'user-a', authorityScopeId: () => 'scope-a', createId: idSequence(90000), createMutationId: idSequence(99000) });
  return { document, repository, foundation, provider, review, setSource: (next?: TranslationSource) => { source = next; }, source: () => source! };
}

describe.each(['es-ES', 'en-US'] as const)('P2 review %s', targetLocale => {
  it('records generated/reviewed/corrected/invalid presentation without changing acceptance authority', async () => {
    const f = setup(); const before = structuredClone(f.document);
    expect(f.review.getSnapshot().reviewedRunKeys).toEqual([]);
    await f.review.generate(targetLocale);
    expect(f.review.getSnapshot().targetLocale).toBe(targetLocale);
    const [first, second] = f.review.getSnapshot().runs; const firstKey = translationReviewKey(first.unitId, first.runId);
    expect(f.review.markReviewed(first.unitId, first.runId)).toBe(true);
    expect(f.review.getSnapshot().reviewedRunKeys).toContain(firstKey);
    expect(f.review.correct(first.unitId, first.runId, 'Sem os valores originais')).toBe(false);
    expect(f.review.getSnapshot().invalidRunKeys).toContain(firstKey);
    expect(f.review.getSnapshot().reviewedRunKeys).not.toContain(firstKey);
    expect(f.review.markReviewed(first.unitId, first.runId)).toBe(false);
    expect(f.review.correct(second.unitId, second.runId, second.translatedText)).toBe(true);
    await f.review.accept(); expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect(f.review.correct(first.unitId, first.runId, `Revisado ${first.translatedText}`)).toBe(true);
    expect(f.review.getSnapshot().correctedRunKeys).toEqual([firstKey]); expect(f.review.getSnapshot().correctionCount).toBe(1);
    expect(f.review.correct(first.unitId, first.runId, first.translatedText)).toBe(true);
    expect(f.review.getSnapshot().correctedRunKeys).toEqual([]); expect(f.review.getSnapshot().invalidRunKeys).toEqual([]);
    await Promise.all([f.review.accept(), f.review.accept()]); await f.review.accept();
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
    const copy = f.review.getSnapshot().copy!;
    expect(copy.locale).toBe(targetLocale); expect(copy.documentSnapshot.locale).toBe(targetLocale);
    expect(copy.origin).toEqual({ originKind: 'translation', originId: f.document.id, originRevision: 1 });
    await f.repository.saveCAS({ catalogId: copy.catalogId, expectedRemoteRevision: 1, mutationId: uuid(999), documentSnapshot: { ...copy.documentSnapshot, title: 'Editado PRESYS TA-25N' } });
    const reopened = f.repository.current(copy.catalogId); expect(reopened.locale).toBe(targetLocale); expect(reopened.origin).toEqual(copy.origin);
    expect(f.document).toEqual(before); expect(f.repository.current(f.document.id).documentSnapshot).toEqual(before);
  });
  it('blocks a stale review even after its progress was marked', async () => {
    const f = setup(); await f.review.generate(targetLocale); const run = f.review.getSnapshot().runs[0];
    f.setSource({ ...f.source(), openSessionId: 'other' });
    expect(f.review.markReviewed(run.unitId, run.runId)).toBe(false);
    await f.review.accept(); expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect(f.review.getSnapshot().message).toContain('origem mudou');
  });
  it('pins target through ambiguous CREATE verification and never dispatches a second copy', async () => {
    const f = setup(); await f.review.generate(targetLocale);
    f.repository.createOverride = async request => { f.repository.commitCreate(request); f.repository.getOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } }); return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } }; };
    await f.review.accept(); expect(f.review.getSnapshot().pending).toBe(true);
    const dispatched = f.provider.requests.length;
    await f.review.generate(targetLocale === 'es-ES' ? 'en-US' : 'es-ES');
    expect(f.provider.requests).toHaveLength(dispatched); expect(f.review.getSnapshot().targetLocale).toBe(targetLocale);
    expect(f.review.cancel()).toBe(false); await f.review.accept();
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });
});

it('cancels an old target before a new target and late output cannot overwrite the new review', async () => {
  const gate = deferred<void>(); const ordinary = new ControlledTranslationProvider();
  const f = setup(new ControlledTranslationProvider(async request => { if (request.targetLocale === 'es-ES') await gate.promise; return ordinary.translate(request); }));
  const spanish = f.review.generate('es-ES'); await Promise.resolve();
  expect(f.review.cancel()).toBe(true); await f.review.generate('en-US');
  gate.resolve(); await spanish;
  expect(f.review.getSnapshot().phase).toBe('review'); expect(f.review.getSnapshot().targetLocale).toBe('en-US');
  expect(f.review.getSnapshot().runs.every(run => run.translatedText.startsWith('EN: '))).toBe(true);
  expect(f.repository.createCatalog).not.toHaveBeenCalled();
});

it('rejects a foundation result for another target before review or copy creation', async () => {
  const f = setup(); const english = await f.foundation.translateCatalog(f.document, 'en-US');
  vi.spyOn(f.foundation, 'translateCatalog').mockResolvedValueOnce(english);
  await f.review.generate('es-ES');
  expect(f.review.getSnapshot()).toMatchObject({ phase: 'error', targetLocale: 'es-ES', runs: [] });
  await f.review.accept(); expect(f.repository.createCatalog).not.toHaveBeenCalled();
});
