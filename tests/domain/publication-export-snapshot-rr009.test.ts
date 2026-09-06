import { describe, expect, it } from 'vitest';
import type { Catalog } from '../../src/domain/catalog.schema';
import {
  createPublicationExportSnapshot,
  parseRequiredPublicationVersion
} from '../../src/domain/publication-export-snapshot';

function createCatalog(version = 7): Catalog {
  return {
    id: 'cat-snapshot',
    title: 'Canonical v7',
    version,
    pages: [
      {
        id: 'page-1',
        pageNumber: 1,
        title: 'frozen page',
        blocks: []
      }
    ]
  } as unknown as Catalog;
}

describe('RR009 — publication export snapshot domain contract', () => {
  it('T5: accepts only a positive safe integer route version', () => {
    expect(parseRequiredPublicationVersion('7')).toEqual({ success: true, version: 7 });
    expect(parseRequiredPublicationVersion(null).success).toBe(false);
    expect(parseRequiredPublicationVersion('').success).toBe(false);
    expect(parseRequiredPublicationVersion('0').success).toBe(false);
    expect(parseRequiredPublicationVersion('-1').success).toBe(false);
    expect(parseRequiredPublicationVersion('7.5').success).toBe(false);
    expect(parseRequiredPublicationVersion('NaN').success).toBe(false);
  });

  it('T8/T9: snapshot has stable identity and is detached from later source mutations', () => {
    const source = createCatalog(7);
    const result = createPublicationExportSnapshot({
      sourceKind: 'catalog',
      sourceId: source.id,
      document: source,
      expectedVersion: 7
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.snapshot.identity).toBe('catalog:cat-snapshot:v7');
    expect(result.snapshot.document).not.toBe(source);
    expect(result.snapshot.document.pages).not.toBe(source.pages);

    source.title = 'REMOTE v8';
    source.version = 8;
    source.pages[0].title = 'mutated page';

    expect(result.snapshot.version).toBe(7);
    expect(result.snapshot.document.title).toBe('Canonical v7');
    expect(result.snapshot.document.version).toBe(7);
    expect(result.snapshot.document.pages[0].title).toBe('frozen page');
  });

  it('T4: refuses a loaded document that does not match the requested version', () => {
    const result = createPublicationExportSnapshot({
      sourceKind: 'catalog',
      sourceId: 'cat-snapshot',
      document: createCatalog(8),
      expectedVersion: 7
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/v7.*v8/)
      })
    );
  });
});
