import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { referencedAssetIds, referencedAssets } from '@/vnext/asset/referenced-assets';
import { sha256 } from '@/vnext/asset/integrity';
import { DefaultAssetPersistenceBridge, type AssetRecord, type AssetRepository } from '@/vnext/asset';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import { resolveAssets } from '@/vnext/rendering/resources';
import { reviewPublication } from '@/vnext/publication/review';
import { emptyTable, documentStyle } from '../proof/test-data';

const pipeline = vi.hoisted(() => ({ fonts: vi.fn(), decode: vi.fn(), measure: vi.fn(), capture: vi.fn(), compare: vi.fn(), report: vi.fn() }));
vi.mock('@/vnext/rendering', async (importOriginal) => ({
  ...await importOriginal<object>(),
  loadFonts: pipeline.fonts,
  decodeImages: pipeline.decode,
  measureTables: pipeline.measure,
  captureSnapshot: pipeline.capture,
  compareSnapshots: pipeline.compare,
}));
vi.mock('@/vnext/publication/preflight', () => ({ layoutReport: pipeline.report }));

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

async function asset(id: string, bytes: Uint8Array, name: string): Promise<AssetRef> {
  return { id, version: '1', sha256: await sha256(bytes), mime: 'image/png', widthPx: 8, heightPx: 6, name, alt: name };
}

function documentWith(used: AssetRef, assets: AssetRef[]): CatalogDocument {
  return {
    schemaVersion: 1,
    id: 'doc-fr41',
    title: 'Catálogo com foto antiga',
    locale: 'pt-BR',
    style: documentStyle,
    pages: [{
      id: 'page-1', widthMm: 210, heightMm: 297,
      objects: [{ id: 'photo', type: 'image', assetId: used.id, fit: 'contain', zIndex: 0, frame: { xMm: 10, yMm: 10, widthMm: 80, heightMm: 60 } }],
    }],
    assets,
  };
}

const usedBytes = png(8, 6);
let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.resetAllMocks();
  pipeline.fonts.mockResolvedValue([]);
  pipeline.decode.mockResolvedValue(undefined);
  pipeline.capture.mockResolvedValue({ facts: [], geometryDiagnostics: [] });
  pipeline.compare.mockReturnValue([]);
  pipeline.report.mockReturnValue([]);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (
    String(input) === 'blob:used-photo'
      ? new Response(usedBytes.slice(), { status: 200 })
      : new Response('not found', { status: 404 })
  ));
  let next = 0;
  URL.createObjectURL = vi.fn(() => `blob:verified-${++next}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => fetchSpy.mockRestore());

describe('FR-41 publication requires only the photos in use', () => {
  it('lists image and icon objects, grouped objects and table image cells; ignores leftover photos', () => {
    const table = emptyTable(1, 2);
    table.cells[1] = { ...table.cells[1], content: { type: 'image', assetId: 'cell-photo' } };
    const document = {
      ...documentWith({ id: 'page-photo' } as AssetRef, []),
      pages: [{
        id: 'page-1', widthMm: 210, heightMm: 297,
        objects: [
          { id: 'photo', type: 'image', assetId: 'page-photo', fit: 'contain', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 } },
          { id: 'group', type: 'group', zIndex: 1, frame: { xMm: 20, yMm: 0, widthMm: 20, heightMm: 10 }, objects: [
            { id: 'icon', type: 'icon', assetId: 'group-icon', zIndex: 0, frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 } },
            { id: 'line', type: 'line', axis: 'horizontal', color: '#000000', zIndex: 1, frame: { xMm: 10, yMm: 0, widthMm: 10, heightMm: 10 } },
          ] },
          { id: 'table', type: 'table', zIndex: 2, frame: { xMm: 0, yMm: 30, widthMm: 100, heightMm: 20 }, table },
        ],
      }],
      assets: ['old-photo', 'page-photo', 'group-icon', 'cell-photo'].map((id) => ({ id } as AssetRef)),
    } as CatalogDocument;

    expect([...referencedAssetIds(document)].sort()).toEqual(['cell-photo', 'group-icon', 'page-photo']);
    expect(referencedAssets(document).map((entry) => entry.id)).toEqual(['page-photo', 'group-icon', 'cell-photo']);
  });

  it('resolves the used photo even when an old unused photo has no address', async () => {
    const used = await asset('photo-used', usedBytes, 'nova.png');
    const orphan = await asset('photo-old', png(8, 6).fill(7, 30), 'antiga.png');
    const document = documentWith(used, [orphan, used]);

    const resources = await resolveAssets(document, (entry) => (entry.id === used.id ? 'blob:used-photo' : undefined));

    expect([...resources.urls.keys()]).toEqual([used.id]);
    expect(resources.manifest.map((entry) => entry.id)).toEqual([used.id]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('still blocks when a photo that is on a page cannot be loaded', async () => {
    const used = await asset('photo-used', usedBytes, 'nova.png');
    await expect(resolveAssets(documentWith(used, [used]), () => undefined)).rejects.toThrow('REQUIRED_ASSET_MISSING');
  });

  it('reaches READY with a broken leftover photo in the catalog photo list', async () => {
    const used = await asset('photo-used', usedBytes, 'nova.png');
    const orphan = await asset('photo-old', png(8, 6).fill(9, 30), 'antiga.png');
    const document = documentWith(used, [orphan, used]);

    const review = await reviewPublication({
      document,
      openSessionId: 'open-a',
      remoteRevision: 2,
      authLineage: 'user-a:0',
      authorityScopeId: 'scope-a',
      assetUrls: new Map([[used.id, 'blob:used-photo'], [orphan.id, 'blob:broken-old-photo']]),
    }, window.document.createElement('div'), vi.fn(), () => true);

    expect(review.diagnostics).toEqual([]);
    expect(review.status).toBe('READY');
    expect([...review.urls.keys()]).toEqual([used.id]);
  });
});

describe('FR-41 reopen resolves the photos in use first', () => {
  it('asks for page photos before leftover photos and keeps both available for reuse', async () => {
    const used = await asset('a0000000-0000-4000-a000-000000000002', usedBytes, 'nova.png');
    const orphanBytes = png(8, 6).fill(5, 30);
    const orphan = await asset('a0000000-0000-4000-a000-000000000001', orphanBytes, 'antiga.png');
    const bytesById = new Map([[used.id, usedBytes], [orphan.id, orphanBytes]]);
    const record = (entry: AssetRef): AssetRecord => ({
      ...entry, version: '1', storageBucket: 'product-assets', storagePath: `vnext/${entry.id}/1.png`,
      fileSize: bytesById.get(entry.id)!.byteLength, createdAt: '2026-10-15T12:00:00.000Z',
    });
    const requested: string[] = [];
    const repository: AssetRepository = {
      getAsset: vi.fn(async (id: string) => {
        requested.push(id);
        return { ok: true as const, record: record(id === used.id ? used : orphan) };
      }),
      createSignedUrl: vi.fn(async (path: string) => ({ ok: true, signedUrl: `https://storage.test/${path}` })),
      uploadBytes: vi.fn(async () => ({ ok: true })),
      finalizeAsset: vi.fn(async () => ({ ok: false as const, error: { code: 'UNUSED', message: 'unused' } })),
    };
    const bridge = new DefaultAssetPersistenceBridge(repository, {
      imageReencoder: null,
      fetchBytes: async (url) => bytesById.get(url.split('/')[4])!.slice().buffer,
    });

    const resolved = await bridge.resolveDocumentAssets(documentWith(used, [orphan, used]));

    expect(requested).toEqual([used.id, orphan.id]);
    expect(resolved.states.get(used.id)?.status).toBe('resolved');
    expect(resolved.states.get(orphan.id)?.status).toBe('resolved');
  });
});
