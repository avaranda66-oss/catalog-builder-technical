// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocumentSession } from '@/vnext/application';
import { canonicalDocumentEquivalence } from '@/vnext/persistence/equivalence';
import { sha256 } from '@/vnext/asset/integrity';
import {
  decisionKey, reviewIssues, sourcePayload, validateTechnicalInput, type Decisions,
} from '@/vnext/ai-catalog/contracts';
import {
  applyRefinement, approveGeneration, assertGeneratedIntegrity, compileCatalog,
  generationHash, type GeneratedCatalog,
} from '@/vnext/ai-catalog/composition';
import { createSyntheticSpecifications } from '@/vnext/ai-catalog/fixture';
import {
  LocalGenerationRepository, PROTOTYPE_STORAGE_KEY, type Exclusive, type PrototypeStorage,
} from '@/vnext/ai-catalog/repository';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

async function reviewedGeneration(): Promise<GeneratedCatalog> {
  const input = await createSyntheticSpecifications();
  const decisions: Decisions = {};
  for (const issue of reviewIssues(input, {})) decisions[issue.id] = issue.fact.status === 'missing' ? 'missing' : 0;
  return compileCatalog(input, undefined, decisions);
}

class MemoryStorage implements PrototypeStorage {
  readonly values = new Map<string, string>();
  writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes += 1; this.values.set(key, value); }
}

/** Shared by separate adapter instances, like their common browser Web Lock. */
function serializedExclusive(): Exclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const operation = tail.then(work);
    tail = operation.catch(() => undefined);
    return operation;
  };
}

async function savedFixture() {
  const storage = new MemoryStorage(), exclusive = serializedExclusive();
  const repository = new LocalGenerationRepository(storage, exclusive);
  const generation = await reviewedGeneration(), approval = await approveGeneration(generation);
  await repository.stage(generation, approval);
  const request = { mutationId: crypto.randomUUID(), documentSnapshot: generation.document };
  const created = await repository.createCatalog(request);
  expect(created.ok).toBe(true);
  return { storage, exclusive, repository, generation, approval, request, created };
}

describe('AI catalog source association and review authority', () => {
  it('distinguishes a sourced empty value, missing reason and unresolved conflict', async () => {
    const input = await createSyntheticSpecifications();
    const value = await compileCatalog(input);
    const traces = assertGeneratedIntegrity(value);
    const empty = traces.find(trace => trace.factId === decisionKey('thermal', 'fact-6', 2));
    expect(empty).toMatchObject({ value: '', status: 'known', model: 'TX-083', source: { sourceId: 'synthetic-brief', page: 1 } });
    const issues = reviewIssues(input, {});
    expect(issues).toHaveLength(2);
    expect(issues.map(issue => issue.fact.status).sort()).toEqual(['conflict', 'missing']);
    expect(issues.every(issue => !issue.resolved)).toBe(true);
    expect(issues.find(issue => issue.fact.status === 'missing')?.fact).toMatchObject({ reason: expect.stringContaining('não informa') });
    await expect(approveGeneration(value)).rejects.toThrow('UNRESOLVED_TECHNICAL_REVIEW');
  });

  it.each(['model', 'label', 'unit', 'condition', 'value'] as const)('rejects a changed %s associated with an unchanged source quote', async field => {
    const input = await createSyntheticSpecifications(), row = input.sections[0].rows[0];
    if (field === 'model') input.models[0] = 'OTHER-041';
    else if (field === 'value') {
      const fact = row.values[0];
      if (fact.status !== 'known') throw new Error('Fixture invariant');
      fact.candidate.value = '999';
    } else row[field] += ' altered';
    await expect(validateTechnicalInput(input)).rejects.toThrow('SOURCE_QUOTE_MISMATCH');
  });

  it('rejects quote page substitution even when that quote exists on another page', async () => {
    const input = await createSyntheticSpecifications(), fact = input.sections[0].rows[0].values[0];
    if (fact.status !== 'known') throw new Error('Fixture invariant');
    fact.candidate.source.page = 2;
    await expect(validateTechnicalInput(input)).rejects.toThrow('SOURCE_QUOTE_MISMATCH');
  });

  it('rejects source byte changes without the declared fixture payload hash', async () => {
    const input = await createSyntheticSpecifications();
    input.sources[0].pages[0].text += '\nChanged source bytes';
    await expect(validateTechnicalInput(input)).rejects.toThrow('SOURCE_HASH_MISMATCH');
  });

  it('preserves both conflict candidates and binds the explicitly selected source', async () => {
    const input = await createSyntheticSpecifications(), decisions: Decisions = {};
    for (const issue of reviewIssues(input, {})) decisions[issue.id] = issue.fact.status === 'missing' ? 'missing' : 1;
    const value = await compileCatalog(input, undefined, decisions);
    const trace = assertGeneratedIntegrity(value).find(trace => trace.factId === decisionKey('electrical', 'fact-2', 1));
    expect(trace).toMatchObject({ value: '±0,0130', status: 'resolved', source: { sourceId: 'synthetic-revision', page: 1 } });
    expect(value.input.sections[1].rows[2].values[1]).toMatchObject({ status: 'conflict', candidates: [{ value: '±0,0120' }, { value: '±0,0130' }] });
    expect(await approveGeneration(value)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('invalidates review after a complete source change even if selected literals remain unchanged', async () => {
    const value = await reviewedGeneration(), approval = await approveGeneration(value);
    const changed = structuredClone(value);
    changed.input.sources[0].pages[0].text += '\nAdditional original source context';
    changed.input.sources[0].sha256 = await sha256(sourcePayload(changed.input.sources[0].pages));
    expect(assertGeneratedIntegrity(changed)).toEqual(assertGeneratedIntegrity(value));
    expect(await approveGeneration(changed)).not.toBe(approval);
  });

  it('rejects an edited technical cell instead of issuing a fresh approval', async () => {
    const value = await reviewedGeneration(), changed = structuredClone(value);
    const table = changed.document.pages[0].objects.find(object => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Fixture invariant');
    const cell = table.table.cells.find(cell => cell.rowId === table.table.rows[1].id && cell.columnId === table.table.columns[1].id);
    if (!cell || cell.content.type !== 'richText') throw new Error('Fixture invariant');
    cell.content.value.paragraphs[0].inlines = [{ kind: 'text', id: crypto.randomUUID(), text: '−27…144', marks: [] }];
    await expect(approveGeneration(changed)).rejects.toThrow('GENERATION_VALUE_MISMATCH');
  });

  it('makes a multi-page typed refinement one exact Undo/Redo step and invalidates the old approval', async () => {
    const value = await reviewedGeneration(), approval = await approveGeneration(value);
    const before = canonicalDocumentEquivalence(value.document), traces = assertGeneratedIntegrity(value);
    const session = createDocumentSession(value.document, { createId: () => crypto.randomUUID() });
    applyRefinement(session, 'compact');
    const after = session.getSnapshot().document;
    expect(canonicalDocumentEquivalence(after)).not.toBe(before);
    expect(assertGeneratedIntegrity({ ...value, document: after })).toEqual(traces);
    expect(await generationHash({ ...value, document: after })).not.toBe(approval);
    expect(session.getSnapshot().localSequence).toBe(2);
    expect(session.undo().ok).toBe(true);
    expect(canonicalDocumentEquivalence(session.getSnapshot().document)).toBe(before);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(await approveGeneration({ ...value, document: session.getSnapshot().document })).toBe(approval);
    expect(session.redo().ok).toBe(true);
    expect(canonicalDocumentEquivalence(session.getSnapshot().document)).toBe(canonicalDocumentEquivalence(after));
  });
});

describe('AI catalog atomic local source/review persistence', () => {
  it('returns NOT_FOUND for a missing catalog through the reused repository contract', async () => {
    const repository = new LocalGenerationRepository(new MemoryStorage(), serializedExclusive());
    expect(await repository.getCatalog(crypto.randomUUID())).toEqual({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('stores and reopens the complete document, sources, decisions and approval in one namespaced record', async () => {
    const saved = await savedFixture();
    expect(saved.storage.writes).toBe(1);
    expect([...saved.storage.values.keys()]).toEqual([PROTOTYPE_STORAGE_KEY]);
    const reopened = await new LocalGenerationRepository(saved.storage, saved.exclusive).getGeneration(saved.generation.document.id);
    expect(reopened.generation).toEqual(saved.generation);
    expect(reopened.approval).toBe(saved.approval);
    expect(reopened.envelope.documentSnapshot).toEqual(saved.generation.document);
    expect(await approveGeneration(reopened.generation)).toBe(reopened.approval);
  });

  it('stages one captured document/source snapshot before asynchronous approval verification', async () => {
    const storage = new MemoryStorage(), repository = new LocalGenerationRepository(storage, serializedExclusive());
    const generation = await reviewedGeneration(), initial = structuredClone(generation);
    const approval = await approveGeneration(generation);
    const staging = repository.stage(generation, approval);
    generation.document.title += ' changed while staging';
    generation.input.sources[0].pages[0].text += ' changed while staging';
    await staging;
    const result = await repository.createCatalog({ mutationId: crypto.randomUUID(), documentSnapshot: initial.document });
    expect(result.ok).toBe(true);
    expect((await repository.getGeneration(initial.document.id)).generation).toEqual(initial);
  });

  it('replays the same committed create mutation without allocating another revision or record', async () => {
    const saved = await savedFixture(), replay = await saved.repository.createCatalog(saved.request);
    expect(replay.ok).toBe(true);
    expect(JSON.stringify(replay) === JSON.stringify(saved.created)).toBe(true);
    expect(saved.storage.writes).toBe(1);
    expect((await saved.repository.listCatalogs())).toMatchObject({ ok: true, value: [{ catalogId: saved.generation.document.id, remoteRevision: 1 }] });
  });

  it('rejects stale approval after a style change, then saves and exactly reopens the newly approved style', async () => {
    const saved = await savedFixture();
    const session = createDocumentSession(saved.generation.document, { createId: () => crypto.randomUUID() });
    applyRefinement(session, 'compact');
    const changed = { ...saved.generation, document: session.getSnapshot().document };
    await expect(saved.repository.stage(changed, saved.approval)).rejects.toThrow('APPROVAL_STALE');
    expect(saved.storage.writes).toBe(1);
    const approval = await approveGeneration(changed);
    await saved.repository.stage(changed, approval);
    const request = { mutationId: crypto.randomUUID(), catalogId: changed.document.id, expectedRemoteRevision: 1, documentSnapshot: changed.document };
    const result = await saved.repository.saveCAS(request);
    expect(result).toMatchObject({ ok: true, value: { remoteRevision: 2 } });
    const reopened = await saved.repository.getGeneration(changed.document.id);
    expect(reopened.generation).toEqual(changed);
    expect(reopened.approval).toBe(approval);
    expect(reopened.envelope.documentSnapshot).toEqual(changed.document);
    const replay = await saved.repository.saveCAS(request);
    expect(replay.ok).toBe(true);
    expect(JSON.stringify(replay) === JSON.stringify(result)).toBe(true);
    expect(saved.storage.writes).toBe(2);
  });

  it('serializes competing adapters so exactly one same-revision CAS succeeds', async () => {
    const saved = await savedFixture(), second = new LocalGenerationRepository(saved.storage, saved.exclusive);
    await second.stage(saved.generation, saved.approval);
    const request = { catalogId: saved.generation.document.id, expectedRemoteRevision: 1, documentSnapshot: saved.generation.document };
    const results = await Promise.all([
      saved.repository.saveCAS({ ...request, mutationId: crypto.randomUUID() }),
      second.saveCAS({ ...request, mutationId: crypto.randomUUID() }),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([{ ok: false, error: { code: 'CONFLICT' } }]);
    expect(saved.storage.writes).toBe(2);
    expect((await saved.repository.getGeneration(request.catalogId)).envelope.remoteRevision).toBe(2);
  });

  it('rejects reuse of a committed mutation with a different approved payload', async () => {
    const saved = await savedFixture();
    const session = createDocumentSession(saved.generation.document, { createId: () => crypto.randomUUID() });
    applyRefinement(session, 'compact');
    const changed = { ...saved.generation, document: session.getSnapshot().document };
    await saved.repository.stage(changed, await approveGeneration(changed));
    const result = await saved.repository.createCatalog({ ...saved.request, documentSnapshot: changed.document });
    expect(result).toEqual({ ok: false, error: { code: 'CONFLICT' } });
    expect(saved.storage.writes).toBe(1);
    expect((await saved.repository.getGeneration(changed.document.id)).generation).toEqual(saved.generation);
  });

  it('does not commit a mismatched sidecar if a mutable request changes while hashing awaits', async () => {
    const storage = new MemoryStorage(), repository = new LocalGenerationRepository(storage, serializedExclusive());
    const generation = await reviewedGeneration(), approval = await approveGeneration(generation);
    await repository.stage(generation, approval);
    const request = { mutationId: crypto.randomUUID(), documentSnapshot: structuredClone(generation.document) };
    const writing = repository.createCatalog(request);
    await Promise.resolve(); // Enter the exclusive work; its real SHA-256 verification yields.
    request.documentSnapshot.title += ' changed during hashing';
    const result = await writing;
    if (result.ok) {
      const reopened = await repository.getGeneration(generation.document.id);
      expect(reopened.generation.document).toEqual(reopened.envelope.documentSnapshot);
      expect(reopened.generation.document.title).toBe(generation.document.title);
    } else {
      expect(storage.writes).toBe(0);
    }
  });

  it.each(['document', 'source', 'approval'] as const)('fails closed when a saved %s is changed independently', async field => {
    const saved = await savedFixture(), raw = JSON.parse(saved.storage.getItem(PROTOTYPE_STORAGE_KEY)!);
    if (field === 'document') raw.records[0].generation.document.title += ' altered';
    if (field === 'source') raw.records[0].generation.input.sources[0].pages[0].text += ' altered';
    if (field === 'approval') raw.records[0].approval = '0'.repeat(64);
    saved.storage.setItem(PROTOTYPE_STORAGE_KEY, JSON.stringify(raw));
    const reopened = new LocalGenerationRepository(saved.storage, saved.exclusive);
    await expect(reopened.getGeneration(saved.generation.document.id)).rejects.toThrow();
    expect(await reopened.getCatalog(saved.generation.document.id)).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
    expect(await reopened.listCatalogs()).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
  });
});
