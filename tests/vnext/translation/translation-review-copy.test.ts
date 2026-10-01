import { describe, expect, it } from 'vitest';
import { CatalogCloneService, canonicalIdentityIds } from '@/vnext/application';
import { canonicalDocumentEquivalence } from '@/vnext/persistence';
import { ControlledTranslationProvider, TranslationFoundationService, extractSemanticTranslationCoverage } from '@/vnext/translation';
import { materializeTranslationCandidate, translationReviewKey } from '@/vnext/translation/candidate';
import { TranslationReviewCoordinator, type TranslationSource } from '@/vnext/translation/review-coordinator';
import { createW5ATranslationDocument } from './w5a-fixture';
import { deferred, idSequence, StrictCasCatalogRepository, uuid } from '../persistence/w3h-fixtures';

function setup(provider = new ControlledTranslationProvider()) {
  const document = createW5ATranslationDocument();
  const repository = new StrictCasCatalogRepository(document);
  let source: TranslationSource | undefined = { document, remoteRevision: 1, authLineage: 'user-a', authorityScopeId: 'scope-a', openSessionId: 'open-a' };
  let authority = 'user-a';
  const foundation = new TranslationFoundationService(provider, { maxAttempts: 1 });
  const review = new TranslationReviewCoordinator({ foundation, repository, getSource: () => source,
    authLineage: () => authority, authorityScopeId: () => 'scope-a', createId: idSequence(90000), createMutationId: idSequence(99000) });
  return { document, repository, foundation, review, provider, setSource: (next?: TranslationSource) => { source = next; },
    getSource: () => source!, changeAuthority: () => { authority = 'user-b'; } };
}

describe('W5.B canonical candidate', () => {
  it('preserves topology, marks, geometry, excluded content and assets without source mutation', async () => {
    const f = setup(); const before = canonicalDocumentEquivalence(f.document);
    const result = await f.foundation.translateCatalog(f.document);
    const candidate = await materializeTranslationCandidate(f.document, result);
    expect(canonicalDocumentEquivalence(f.document)).toBe(before);
    expect(candidate.document.locale).toBe('es-ES');
    expect(candidate.document.assets).toEqual(f.document.assets);
    const masked = (document: typeof f.document) => JSON.stringify(document, (key, value) => ['text', 'title', 'locale'].includes(key) && typeof value === 'string' ? '<text>' : value);
    expect(masked(candidate.document)).toBe(masked(f.document));
    const clone = new CatalogCloneService(idSequence(77000)).clone(candidate.document);
    const oldIds = new Set(canonicalIdentityIds(f.document).filter(id => !f.document.assets.some(asset => asset.id === id)));
    expect(canonicalIdentityIds(clone).filter(id => oldIds.has(id))).toEqual([]);
    expect(clone.assets).toEqual(f.document.assets);
  });
  it.each(['missing', 'duplicate', 'hash', 'locator', 'run'])('rejects %s result corruption', async kind => {
    const f = setup(); const result = structuredClone(await f.foundation.translateCatalog(f.document));
    if (kind === 'missing') Object.assign(result, { units: result.units.slice(1) });
    if (kind === 'duplicate') Object.assign(result, { units: [...result.units, result.units[0]] });
    if (kind === 'hash') Object.assign(result.units[0], { sourceHash: 'wrong' });
    if (kind === 'locator') Object.assign(result.units[0], { locator: { kind: 'catalogTitle', catalogId: 'other' } });
    if (kind === 'run') Object.assign(result.units[0], { runs: [{ runId: 'wrong', translatedText: 'Texto' }] });
    await expect(materializeTranslationCandidate(f.document, result)).rejects.toThrow();
  });
  it('rejects source drift and preserves protected tokens in reviewer corrections', async () => {
    const f = setup(); const result = await f.foundation.translateCatalog(f.document);
    const coverage = await extractSemanticTranslationCoverage(f.document); const leaf = coverage.eligible[0]; const run = leaf.runs[0];
    await expect(materializeTranslationCandidate(f.document, result, new Map([[translationReviewKey(leaf.leafId, run.runId), 'Texto sem códigos']]))).rejects.toMatchObject({ code: 'TECHNICAL_TOKEN_MISMATCH' });
    f.document.title += ' mudou';
    await expect(materializeTranslationCandidate(f.document, result)).rejects.toMatchObject({ code: 'STALE_RESULT' });
  });
});

describe('W5.B review, verified persistence and freshness', () => {
  it('creates one copy for concurrent acceptance, retains provenance and reopens through W3', async () => {
    const f = setup(); await f.review.generate();
    expect(f.review.getSnapshot().phase).toBe('review');
    const run = f.review.getSnapshot().runs[0];
    expect(f.review.correct(run.unitId, run.runId, `Revisado ${run.translatedText}`)).toBe(true);
    await Promise.all([f.review.accept(), f.review.accept()]); await f.review.accept();
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
    const copy = f.review.getSnapshot().copy!;
    expect(copy.catalogId).not.toBe(f.document.id);
    expect(copy.origin).toEqual({ originKind: 'translation', originId: f.document.id, originRevision: 1 });
    expect(copy.documentSnapshot.title).toContain('Revisado');
    await f.repository.saveCAS({ catalogId: copy.catalogId, expectedRemoteRevision: 1, mutationId: uuid(999), documentSnapshot: { ...copy.documentSnapshot, title: 'Revisado PRESYS TA-25N' } });
    expect(f.repository.current(copy.catalogId).origin).toEqual(copy.origin);
    expect((await f.repository.getCatalog(copy.catalogId)).ok).toBe(true);
    expect(f.repository.current(f.document.id).documentSnapshot).toEqual(f.document);
  });
  it('cancel/reject dispatches no create; invalid corrections cannot be accepted', async () => {
    const f = setup(); await f.review.generate(); const run = f.review.getSnapshot().runs[0];
    expect(f.review.correct(run.unitId, run.runId, 'Sem valores técnicos')).toBe(false);
    await f.review.accept(); expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect(f.review.cancel()).toBe(true); expect(f.review.getSnapshot().phase).toBe('idle');
  });
  it('one valid correction cannot clear another invalid edit or silently accept its previous text', async () => {
    const f = setup(); await f.review.generate();
    const [first, second] = f.review.getSnapshot().runs;
    expect(f.review.correct(first.unitId, first.runId, 'Sem códigos')).toBe(false);
    expect(f.review.correct(second.unitId, second.runId, second.translatedText)).toBe(true);
    expect(f.review.getSnapshot().reviewInvalid).toBe(true);
    await f.review.accept(); expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect(f.review.correct(first.unitId, first.runId, first.translatedText)).toBe(true);
    await f.review.accept(); expect(f.review.getSnapshot().phase).toBe('created');
  });
  it.each(['local', 'remote', 'authority', 'draft', 'session'])('rejects %s source drift before create', async kind => {
    const f = setup(); await f.review.generate();
    if (kind === 'local') f.setSource({ ...f.getSource(), document: { ...f.document, title: 'Outro' } });
    if (kind === 'remote') f.repository.commitSave({ catalogId: f.document.id, expectedRemoteRevision: 1, mutationId: uuid(900), documentSnapshot: { ...f.document, title: 'Outro' } });
    if (kind === 'authority') f.changeAuthority();
    if (kind === 'draft') f.setSource(undefined);
    if (kind === 'session') f.setSource({ ...f.getSource(), openSessionId: 'open-b' });
    await f.review.accept(); expect(f.review.getSnapshot().phase).toBe('error'); expect(f.repository.createCatalog).not.toHaveBeenCalled();
  });
  it('cancelled generation cannot replace a new review', async () => {
    const gate = deferred<unknown>(); const f = setup(new ControlledTranslationProvider(() => gate.promise));
    const generating = f.review.generate(); f.review.cancel(); gate.resolve({}); await generating;
    expect(f.review.getSnapshot().phase).toBe('idle'); expect(f.repository.createCatalog).not.toHaveBeenCalled();
  });
  it('generation rejects drift while provider is pending', async () => {
    const provider = new ControlledTranslationProvider(); const gate = deferred<void>();
    const f = setup(new ControlledTranslationProvider(async request => { await gate.promise; return provider.translate(request); }));
    const generating = f.review.generate(); f.setSource(undefined); gate.resolve(); await generating;
    expect(f.review.getSnapshot()).toMatchObject({ phase: 'error', runs: [] });
  });
  it('ambiguous committed create reconciles the same copy without reallocating or redispatching', async () => {
    const f = setup(); await f.review.generate(); f.repository.ambiguousCreateOnce = true; await f.review.accept();
    expect(f.review.getSnapshot().phase).toBe('created'); expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });
  it('unresolved ambiguous create blocks cancel/new generation and retry verifies the original mutation', async () => {
    const f = setup(); await f.review.generate();
    f.repository.createOverride = async request => { f.repository.commitCreate(request); f.repository.getOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } }); return { ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } }; };
    await f.review.accept(); expect(f.review.getSnapshot().pending).toBe(true); expect(f.review.cancel()).toBe(false);
    const providerRequests = f.provider.requests.length; await f.review.generate(); expect(f.provider.requests).toHaveLength(providerRequests);
    await f.review.accept(); expect(f.review.getSnapshot().phase).toBe('created'); expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });
  it('saved source guidance and unsupported pair are visible, not persisted', async () => {
    const f = setup(); f.setSource(undefined); await f.review.generate(); expect(f.review.getSnapshot().message).toContain('Salve');
    f.setSource({ document: { ...f.document, locale: 'es-ES' }, remoteRevision: 1, openSessionId: 'a', authLineage: 'user-a', authorityScopeId: 'scope-a' });
    await f.review.generate(); expect(f.review.getSnapshot().message).toContain('português'); expect(f.repository.createCatalog).not.toHaveBeenCalled();
  });
});
