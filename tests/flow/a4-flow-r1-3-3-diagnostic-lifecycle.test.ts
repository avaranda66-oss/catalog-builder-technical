import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hydrateCatalogSource,
  type Catalog,
  type CatalogSourceDiagnostic
} from '@/domain/catalog.schema';
import { auditLayoutPreflight } from '@/domain/layout-preflight';
import { computePageFlowPlan } from '@/domain/page-flow-planner';
import { StorageService } from '@/services/storage.service';
import { SupabaseService } from '@/services/supabase.service';
import { useCatalogStore } from '@/stores/useCatalogStore';

const malformedDiagnostic = (pageId: string, pageNumber: number): CatalogSourceDiagnostic => ({
  code: 'MALFORMED_PAGE_BLOCKS',
  pageId,
  pageNumber,
  sourcePath: `pages[${pageNumber - 1}].blocks`,
  receivedType: 'object',
  message: `Página ${pageNumber} continha estrutura de blocos malformada (object); o runtime recebeu uma lista vazia segura.`
});

const sourceCatalog = (
  suffix: string,
  pages: Array<{ id: string; blocks: unknown; title?: string }>,
  sourceDiagnostics?: CatalogSourceDiagnostic[]
) => ({
  id: `catalog-${suffix}`,
  title: `Catalog ${suffix}`,
  themeId: 'default-technical',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  version: 7,
  pages: pages.map((page, index) => ({
    id: page.id,
    pageNumber: index + 1,
    pageType: 'technical',
    title: page.title ?? `Page ${index + 1}`,
    blocks: page.blocks
  })),
  sourceDiagnostics
});

const hydrateIntoStore = (
  suffix: string,
  pages: Array<{ id: string; blocks: unknown; title?: string }>,
  sourceDiagnostics?: CatalogSourceDiagnostic[]
) => {
  const catalog = hydrateCatalogSource(sourceCatalog(suffix, pages, sourceDiagnostics)).catalog;
  useCatalogStore.getState().setCurrentCatalog(catalog, false);
  return useCatalogStore.getState().currentCatalog!;
};

const preflight = (catalog: Catalog) => auditLayoutPreflight(
  catalog,
  computePageFlowPlan(catalog, [], { flowMode: 'smart' })
);

const addRepairBlock = (pageId: string) => {
  useCatalogStore.getState().addBlock(pageId, {
    type: 'text',
    title: 'Recovered source content',
    textContent: 'Valid replacement content'
  });
};

describe('A4.FLOW.R1.3.3 — source diagnostic lifecycle closure', () => {
  beforeEach(() => {
    vi.spyOn(StorageService, 'cacheCatalog');
    vi.spyOn(SupabaseService, 'saveCatalog').mockResolvedValue({
      success: true,
      data: { version: 8, updated_at: '2026-01-03T00:00:00.000Z' }
    });
    useCatalogStore.setState({
      currentCatalog: null,
      savedCatalogs: [],
      editorContext: { kind: 'catalog', catalogId: '' },
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      localRevision: 0,
      lastAcknowledgedLocalRevision: 0,
      isDirty: false,
      isSaving: false,
      syncStatus: 'synced',
      syncError: null,
      remoteVersionBarrier: null
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R133-T1 — unresolved malformed source stays array-safe and fail-closed', () => {
    const catalog = hydrateIntoStore('unresolved', [{ id: 'page-a', blocks: { corrupt: true } }]);
    const report = preflight(catalog);

    expect(catalog.pages[0].blocks).toEqual([]);
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-a' })
    ]);
    expect(report.canPublish).toBe(false);
  });

  it('R133-T2 — unrelated page edit does not clear another page corruption', () => {
    hydrateIntoStore('unrelated', [
      { id: 'page-a', blocks: { corrupt: true } },
      { id: 'page-b', blocks: [], title: 'Before' }
    ]);

    useCatalogStore.getState().setPageTitle('page-b', 'After');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[1].title).toBe('After');
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ pageId: 'page-a' })
    ]);
    expect(preflight(catalog).canPublish).toBe(false);
  });

  it('R133-T3 — real structural remediation clears the affected page diagnostic', () => {
    hydrateIntoStore('repair', [{ id: 'page-a', blocks: { corrupt: true } }]);

    addRepairBlock('page-a');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[0].blocks).toHaveLength(1);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ pageId: 'page-a' })
    ]));
  });

  it('R133-T4 — removing the affected page clears its ghost blocker', () => {
    hydrateIntoStore('delete', [
      { id: 'page-a', blocks: { corrupt: true } },
      { id: 'page-b', blocks: [] }
    ]);

    useCatalogStore.getState().removePage('page-a');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages.map((page) => page.id)).toEqual(['page-b']);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ pageId: 'page-a' })
    ]));
    expect(preflight(catalog).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });

  it('R133-T5 — page reorder preserves the diagnostic and reports its current location', () => {
    hydrateIntoStore('reorder', [
      { id: 'page-a', blocks: { corrupt: true } },
      { id: 'page-b', blocks: [] },
      { id: 'page-c', blocks: [] }
    ]);

    useCatalogStore.getState().reorderPages(0, 2);

    const catalog = useCatalogStore.getState().currentCatalog!;
    const malformedIssue = preflight(catalog).issues.find((issue) => issue.code === 'MALFORMED_PAGE_BLOCKS');
    expect(catalog.pages[2].id).toBe('page-a');
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ pageId: 'page-a' })
    ]);
    expect(malformedIssue?.pageNumber).toBe(3);
  });

  it('R133-T6 — remediation survives the real autosave cache serialization and hydration round-trip', async () => {
    hydrateIntoStore('roundtrip', [{ id: 'page-a', blocks: { corrupt: true } }]);

    addRepairBlock('page-a');

    await waitFor(() => expect(StorageService.cacheCatalog).toHaveBeenCalled());
    const reloaded = await StorageService.loadCatalog('catalog-roundtrip');
    expect(reloaded).not.toBeNull();
    if (!reloaded) throw new Error('Expected the remediated catalog to reload from StorageService.');
    expect(reloaded.pages[0].blocks).toHaveLength(1);
    expect(reloaded.sourceDiagnostics ?? []).toEqual([]);
    expect(preflight(reloaded).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });

  it('R133-T7 — hydration removes a persisted diagnostic for a nonexistent page', () => {
    const catalog = hydrateCatalogSource(sourceCatalog(
      'orphan',
      [{ id: 'page-live', blocks: [] }],
      [malformedDiagnostic('page-gone', 9)]
    )).catalog;

    expect(catalog.sourceDiagnostics ?? []).toEqual([]);
    expect(preflight(catalog).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });

  it('R133-T8 — persisted unresolved provenance remains fail-closed for its existing page', () => {
    const catalog = hydrateCatalogSource(sourceCatalog(
      'persisted-unresolved',
      [{ id: 'page-a', blocks: [] }],
      [malformedDiagnostic('page-a', 1)]
    )).catalog;

    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ pageId: 'page-a' })
    ]);
    expect(preflight(catalog).canPublish).toBe(false);

    const cloned = hydrateCatalogSource({
      ...structuredClone(catalog),
      id: 'catalog-persisted-unresolved-clone'
    }).catalog;
    expect(cloned.sourceDiagnostics).toEqual([
      expect.objectContaining({ pageId: 'page-a' })
    ]);
    expect(preflight(cloned).canPublish).toBe(false);
  });

  it('R133-T9 — remediating one malformed page never globally clears another', () => {
    hydrateIntoStore('scoped', [
      { id: 'page-a', blocks: { corrupt: 'a' } },
      { id: 'page-b', blocks: { corrupt: 'b' } }
    ]);

    addRepairBlock('page-a');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ pageId: 'page-a' })
    ]));
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ pageId: 'page-b' })
    ]);
    expect(preflight(catalog).canPublish).toBe(false);
  });

  it('R133-T10 — valid catalogs retain their ordinary mutation behavior', () => {
    hydrateIntoStore('valid', [{ id: 'page-valid', blocks: [] }]);

    addRepairBlock('page-valid');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[0].blocks).toEqual([
      expect.objectContaining({ type: 'text', textContent: 'Valid replacement content' })
    ]);
    expect(catalog.sourceDiagnostics ?? []).toEqual([]);
  });

  it('R133-T11 — moving a block NEXT remediates a diagnosed destination page', () => {
    hydrateIntoStore('cross-page-next', [
      {
        id: 'page-1',
        blocks: [{ id: 'block-x', type: 'text', textContent: 'Move me forward' }]
      },
      { id: 'page-2', blocks: { corrupt: true } }
    ]);

    expect(useCatalogStore.getState().moveBlockToNextPage('page-1', 'block-x')).toBe(true);

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[1].blocks).toEqual([
      expect.objectContaining({ id: 'block-x', textContent: 'Move me forward' })
    ]);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-2' })
    ]));
    expect(preflight(catalog).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-2' })
    ]));
  });

  it('R133-T12 — moving a block PREVIOUS remediates a diagnosed destination page', () => {
    hydrateIntoStore('cross-page-previous', [
      { id: 'page-1', blocks: { corrupt: true } },
      {
        id: 'page-2',
        blocks: [{ id: 'block-x', type: 'text', textContent: 'Move me backward' }]
      }
    ]);

    expect(useCatalogStore.getState().moveBlockToPreviousPage('page-2', 'block-x')).toBe(true);

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[0].blocks).toEqual([
      expect.objectContaining({ id: 'block-x', textContent: 'Move me backward' })
    ]);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-1' })
    ]));
    expect(preflight(catalog).issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-1' })
    ]));
  });

  it('R133-T13 — a structural mutation on another page preserves an unchanged diagnosis', () => {
    hydrateIntoStore('other-page-structure', [
      { id: 'page-diagnosed', blocks: { corrupt: true } },
      { id: 'page-mutated', blocks: [] }
    ]);

    addRepairBlock('page-mutated');

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[0].blocks).toEqual([]);
    expect(catalog.pages[1].blocks).toHaveLength(1);
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-diagnosed' })
    ]);
    expect(preflight(catalog).canPublish).toBe(false);
  });
});
