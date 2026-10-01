import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextError } from '@/vnext/domain';
import { reviewPublication, samePublicationSource, verifyPublicationForPrint, type PublicationSource } from '@/vnext/publication/review';

const pipeline = vi.hoisted(() => ({ fonts: vi.fn(), assets: vi.fn(), decode: vi.fn(), measure: vi.fn(), capture: vi.fn(), compare: vi.fn(), report: vi.fn() }));
vi.mock('@/vnext/rendering', async importOriginal => ({ ...await importOriginal<object>(), loadFonts: pipeline.fonts, resolveAssets: pipeline.assets, decodeImages: pipeline.decode,
  measureTables: pipeline.measure, captureSnapshot: pipeline.capture, compareSnapshots: pipeline.compare }));
vi.mock('@/vnext/publication/preflight', () => ({ layoutReport: pipeline.report }));

function source(): PublicationSource {
  let id = 0;
  return { document: createW2CDemoDocument(() => `publication-${++id}`), openSessionId: 'open-a', remoteRevision: 3, authLineage: 'user-a', authorityScopeId: 'scope-a', assetUrls: new Map() };
}
beforeEach(() => {
  vi.resetAllMocks();
  pipeline.fonts.mockResolvedValue([]); pipeline.assets.mockResolvedValue({ urls: new Map(), manifest: [] }); pipeline.decode.mockResolvedValue(undefined);
  pipeline.capture.mockResolvedValue({ facts: [], geometryDiagnostics: [] }); pipeline.compare.mockReturnValue([]); pipeline.report.mockReturnValue([]);
});
describe('W5.C saved-source and canonical publication composition', () => {
  it.each(['document', 'openSessionId', 'remoteRevision', 'authLineage', 'authorityScopeId', 'assetUrls'] as const)('invalidates changed %s', key => {
    const captured = source(), changed = { ...captured };
    if (key === 'document') changed.document = structuredClone(captured.document);
    else if (key === 'assetUrls') changed.assetUrls = new Map();
    else if (key === 'remoteRevision') changed.remoteRevision++;
    else changed[key] += '-changed';
    expect(samePublicationSource(captured, captured)).toBe(true);
    expect(samePublicationSource(captured, changed)).toBe(false);
    expect(samePublicationSource(captured, undefined)).toBe(false);
  });
  it('preserves source, validates resources and repeated snapshots before READY and print', async () => {
    const captured = source(), before = JSON.stringify(captured.document), root = document.createElement('div'), render = vi.fn();
    const review = await reviewPublication(captured, root, render, () => true);
    expect(review.status).toBe('READY'); expect(render).toHaveBeenCalledTimes(3);
    expect(pipeline.measure).toHaveBeenCalledOnce(); expect(pipeline.capture).toHaveBeenCalledTimes(2);
    await verifyPublicationForPrint(review, root, () => true);
    expect(pipeline.fonts).toHaveBeenCalledTimes(2); expect(pipeline.decode).toHaveBeenCalledTimes(2); expect(pipeline.capture).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(captured.document)).toBe(before);
  });
  it.each(['REQUIRED_FONT_MISSING', 'REQUIRED_ASSET_MISSING', 'ASSET_HASH_MISMATCH', 'IMAGE_DECODE_FAILED'])('blocks %s and strips raw resource details', async code => {
    const mock = code.includes('FONT') ? pipeline.fonts : code.includes('IMAGE') ? pipeline.decode : pipeline.assets;
    mock.mockRejectedValue(new VNextError(code, 'https://private.invalid/?signed=secret'));
    const review = await reviewPublication(source(), document.createElement('div'), vi.fn(), () => true);
    expect(review.status).toBe('BLOCKED'); expect(review.diagnostics.at(-1)?.code).toBe(code);
    expect(JSON.stringify(review.diagnostics)).not.toContain('secret');
    await expect(verifyPublicationForPrint(review, document.createElement('div'), () => true)).rejects.toMatchObject({ code: 'PDF_EXPORT_BLOCKED' });
  });
  it('rejects source drift during async font loading and never resolves assets', async () => {
    let current = true; pipeline.fonts.mockImplementation(async () => { current = false; return []; });
    const review = await reviewPublication(source(), document.createElement('div'), vi.fn(), () => current);
    expect(review.status).toBe('BLOCKED'); expect(review.diagnostics.at(-1)?.code).toBe('PUBLICATION_SOURCE_CHANGED'); expect(pipeline.assets).not.toHaveBeenCalled();
  });
  it.each(['TEXT_OBJECT_OVERFLOW', 'TABLE_CONTENT_OVERFLOW', 'LAYOUT_UNSTABLE'])('blocks %s instead of mutating geometry', async code => {
    pipeline.report.mockReturnValue([{ severity: 'ERROR', code, details: 'overflow' }]);
    const captured = source(), before = JSON.stringify(captured.document);
    const review = await reviewPublication(captured, document.createElement('div'), vi.fn(), () => true);
    expect(review.status).toBe('BLOCKED'); expect(JSON.stringify(captured.document)).toBe(before);
  });
  it('keeps warnings visible and refuses stale or changed layout at print', async () => {
    pipeline.report.mockReturnValue([{ severity: 'WARNING', code: 'SAFE_AREA_VIOLATION', details: 'margin' }]);
    const review = await reviewPublication(source(), document.createElement('div'), vi.fn(), () => true);
    expect(review.status).toBe('READY'); expect(review.diagnostics).toHaveLength(1);
    await expect(verifyPublicationForPrint(review, document.createElement('div'), () => false)).rejects.toMatchObject({ code: 'PUBLICATION_SOURCE_CHANGED' });
    pipeline.compare.mockReturnValue([{ severity: 'ERROR', code: 'LAYOUT_UNSTABLE', details: 'changed' }]);
    await expect(verifyPublicationForPrint(review, document.createElement('div'), () => true)).rejects.toMatchObject({ code: 'PDF_EXPORT_BLOCKED' });
  });
});
