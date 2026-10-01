// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { authoredStructuralIdentityIds, CatalogCloneService, createDocumentSession } from '@/vnext/application';
import { DefaultAssetPersistenceBridge, type AssetRecord, type AssetRepository } from '@/vnext/asset';
import { CatalogLibraryService, createDefaultCatalogStarterRegistry } from '@/vnext/library';
import { DefaultStarterDependencyPreparer } from '@/vnext/library/starter-dependencies';
import { PRESYS_IMAGE_MANIFEST, PRESYS_STARTER, PRESYS_STARTER_ID, PRESYS_FACTS } from '@/vnext/library/presys-ta25n-starter';
import contract from '../../../docs/vnext/pilot-c1-source-contract.json';
import { StrictCasCatalogRepository, documentFixture, idSequence, uuid } from '../persistence/w3h-fixtures';

const bytes = new Uint8Array(readFileSync('public/assets/presys/ta-25n-starter-v1.png'));
function fixture(fetchBytes = vi.fn(async () => bytes)) {
  const stored = new Map<string, Uint8Array>();
  const records = new Map<string, AssetRecord>();
  const assetRepository: AssetRepository = {
    uploadBytes: vi.fn(async (path, value) => { stored.set(path, new Uint8Array(value)); return { ok: true, storagePath: path }; }),
    finalizeAsset: vi.fn(async (p: Parameters<AssetRepository['finalizeAsset']>[0]) => {
      const record: AssetRecord = { id: p.assetId, version: '1', sha256: p.sha256, mime: 'image/png', widthPx: p.widthPx, heightPx: p.heightPx,
        name: p.name, alt: p.alt, fileSize: p.fileSize, storageBucket: 'product-assets', storagePath: p.storagePath, createdAt: '2026-09-30T12:00:00Z' };
      records.set(p.assetId, record);
      const { storageBucket: _bucket, storagePath: _path, fileSize: _size, createdAt: _date, ...asset } = record;
      return { ok: true as const, asset };
    }),
    getAsset: vi.fn(async (id: string) => ({ ok: true as const, record: records.get(id) ?? null })),
    createSignedUrl: vi.fn(async path => ({ ok: true, signedUrl: `https://controlled-storage/${path}` })),
  };
  let auth = 'A:1';
  const getLineage = () => ({ authLineage: auth, authorityScopeId: `scope:${auth}` });
  const newBridge = () => new DefaultAssetPersistenceBridge(assetRepository, { getActiveLineage: getLineage, fetchBytes: async url => {
    const data = stored.get(new URL(url).pathname.slice(1));
    if (!data) throw new Error('Missing durable bytes');
    return data.slice().buffer;
  } });
  const bridge = newBridge();
  const preparer = new DefaultStarterDependencyPreparer(bridge, fetchBytes);
  const repository = new StrictCasCatalogRepository(documentFixture(uuid(50000)));
  const createId = vi.fn(idSequence(1000));
  const library = new CatalogLibraryService({ repository, applicationDependencies: { createId: idSequence(30000) }, createId,
    createMutationId: idSequence(40000), createOpenSessionId: idSequence(60000), authLineage: () => auth,
    authorityScopeId: () => `scope:${auth}`, starterRegistry: createDefaultCatalogStarterRegistry(), starterDependencies: preparer });
  return { library, repository, createId, assetRepository, records, bridge, newBridge, preparer, fetchBytes, getLineage, switchAuthority: () => { auth = 'B:2'; } };
}

describe('PILOT.C.1 official starter', () => {
  it('C1-02/03/05/06 creates two editable A4 pages with approved facts, incomplete conflicts and durable image', async () => {
    const f = fixture();
    const result = await f.library.createFromStarter(PRESYS_STARTER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    const doc = result.value.documentSnapshot;
    for (const key of Object.keys(contract.facts) as (keyof typeof PRESYS_FACTS)[]) {
      expect(PRESYS_FACTS[key]).toEqual({ label: contract.facts[key].label, value: contract.facts[key].value });
      expect(contract.facts[key].approved || PRESYS_FACTS[key].value === 'A COMPLETAR').toBe(true);
    }
    expect(doc.pages).toHaveLength(2);
    for (const page of doc.pages) expect(page).toMatchObject({ widthMm: 210, heightMm: 297, safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 } });
    expect(JSON.stringify(doc)).not.toMatch(/w2c-demo|https?:|blob:/);
    expect(doc.assets[0]).toMatchObject({ version: '1', sha256: PRESYS_IMAGE_MANIFEST.sha256, mime: 'image/png', widthPx: 720, heightPx: 482 });
    expect(doc.assets[0].id).not.toBe(PRESYS_IMAGE_MANIFEST.seedAssetId);
    expect(f.assetRepository.uploadBytes).toHaveBeenCalledTimes(1);
    const tableCells = doc.pages.flatMap(p => p.objects.flatMap(o => o.type === 'table' ? o.table.cells : []));
    const textContent = tableCells.flatMap(c => c.content.type === 'richText' ? c.content.value.paragraphs.flatMap(p => p.inlines.flatMap(i => i.kind === 'text' ? i.text : [])) : []).join(' | ');
    for (const key of ['temperatureRange', 'dimensions', 'mainSupply', 'currentPrecision', 'environment', 'heatingCooling'] as const) {
      expect(textContent).toContain(contract.facts[key].label);
    }
    expect(tableCells.filter(c => c.content.type === 'richText' && c.content.value.paragraphs.some(p => p.inlines.some(i => i.kind === 'text' && i.text === 'A COMPLETAR')))).toHaveLength(6);
    for (const key of ['accuracy', 'resolution', 'stability', 'axial', 'radial', 'power', 'well', 'weight', 'currentRange'] as const) expect(textContent).toContain(contract.facts[key].value);
    expect(result.value.origin).toEqual({ originKind: 'starter', originId: PRESYS_STARTER_ID, originRevision: 1 });
  });

  it('C1-07 fresh bridge resolves persisted image without packaged/external fallback or upload', async () => {
    const f = fixture();
    const created = await f.library.createFromStarter(PRESYS_STARTER_ID);
    if (!created.ok) throw new Error(created.error.code);
    const reopened = await f.repository.getCatalog(created.value.catalogId);
    if (!reopened.ok) throw new Error(reopened.error.code);
    const resolved = await f.newBridge().resolveDocumentAssets(reopened.value.documentSnapshot, f.getLineage());
    expect(resolved.states.get(created.value.documentSnapshot.assets[0].id)?.status).toBe('resolved');
    expect(f.assetRepository.uploadBytes).toHaveBeenCalledTimes(1);
    expect(f.fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('C1-08 normal text/table actions edit the starter and undo/redo remains canonical', async () => {
    const f = fixture();
    const prepared = await f.preparer.prepare(PRESYS_STARTER, f.getLineage(), () => true);
    const session = createDocumentSession(new CatalogCloneService(idSequence(9000)).clone(prepared), { createId: idSequence(20000) });
    const doc = session.getSnapshot().document;
    const text = doc.pages[0].objects.find(o => o.type === 'text');
    const table = doc.pages[1].objects.find(o => o.type === 'table');
    if (text?.type !== 'text' || table?.type !== 'table') throw new Error('Missing authoring primitives');
    expect(session.execute({ type: 'text.setContent', objectId: text.id, expectedText: text.text, plainText: 'PRESYS editável' }).ok).toBe(true);
    expect(session.execute({ type: 'table.cell.setContent', pageId: doc.pages[1].id, objectId: table.id, tableId: table.table.id,
      cellId: table.table.cells[1].id, expectedContent: table.table.cells[1].content, content: { type: 'richText', plainText: 'Revisar com engenharia' } }).ok).toBe(true);
    const edited = session.getSnapshot().document;
    expect(JSON.stringify(edited)).toContain('Revisar com engenharia');
    expect(session.undo().ok).toBe(true);
    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(edited);
  });

  it('C1-09/12 independent creations have disjoint structural IDs and preserve canonical AssetRef', async () => {
    const f = fixture();
    const a = await f.library.createFromStarter(PRESYS_STARTER_ID);
    const b = await f.library.createFromStarter(PRESYS_STARTER_ID);
    if (!a.ok || !b.ok) throw new Error('Create failed');
    const ids = authoredStructuralIdentityIds(a.value.documentSnapshot);
    expect(authoredStructuralIdentityIds(b.value.documentSnapshot).some(id => ids.includes(id))).toBe(false);
    expect(a.value.documentSnapshot.assets).toEqual(b.value.documentSnapshot.assets);
    expect(f.assetRepository.uploadBytes).toHaveBeenCalledTimes(1);
  });

  it('C1-13 pending verification bypasses dependency preparation and fresh identities', async () => {
    const f = fixture();
    f.repository.ambiguousCreateOnce = true;
    f.repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    expect(await f.library.createFromStarter(PRESYS_STARTER_ID)).toMatchObject({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    const ids = f.createId.mock.calls.length;
    const first = f.repository.createCatalog.mock.calls[0][0];
    const retried = await f.library.createFromStarter(PRESYS_STARTER_ID);
    expect(retried.ok && retried.value.catalogId).toBe(first.documentSnapshot.id);
    expect(f.createId).toHaveBeenCalledTimes(ids);
    expect(f.assetRepository.uploadBytes).toHaveBeenCalledTimes(1);
    expect(f.fetchBytes).toHaveBeenCalledTimes(1);
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });

  it('C1-04/14 authority change during dependency preparation makes ZERO create dispatch/ID allocation', async () => {
    let release!: (bytes: Uint8Array) => void;
    const fetchBytes = vi.fn(() => new Promise<Uint8Array>(resolve => { release = resolve; }));
    const f = fixture(fetchBytes);
    const attempt = f.library.createFromStarter(PRESYS_STARTER_ID);
    await vi.waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(1));
    f.switchAuthority(); release(bytes);
    expect(await attempt).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    expect(f.repository.createCatalog).not.toHaveBeenCalled();
    expect(f.createId).not.toHaveBeenCalled();
    expect(f.assetRepository.uploadBytes).not.toHaveBeenCalled();
  });

  it('C1-13 concurrent starter clicks share preparation and one prepared create', async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.library.createFromStarter(PRESYS_STARTER_ID), f.library.createFromStarter(PRESYS_STARTER_ID)]);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
    expect(f.assetRepository.uploadBytes).toHaveBeenCalledTimes(1);
  });

  it('C1-13 a different starter cannot borrow the in-flight official create result', async () => {
    let release!: (value: Uint8Array) => void;
    const f = fixture(vi.fn(() => new Promise<Uint8Array>(resolve => { release = resolve; })));
    const first = f.library.createFromStarter(PRESYS_STARTER_ID);
    await vi.waitFor(() => expect(f.fetchBytes).toHaveBeenCalledTimes(1));
    expect(await f.library.createFromStarter('essential-technical-sheet')).toMatchObject({ ok: false, error: { code: 'STALE_RESULT' } });
    release(bytes);
    expect((await first).ok).toBe(true);
    expect(f.repository.createCatalog).toHaveBeenCalledTimes(1);
  });
});
