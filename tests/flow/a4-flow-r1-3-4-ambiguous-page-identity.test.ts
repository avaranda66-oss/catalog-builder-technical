import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  didCatalogPageBlocksChangeUnambiguously,
  hydrateCatalogSource,
  reconcileCatalogSourceDiagnostics,
  type Catalog
} from '@/domain/catalog.schema';
import { auditLayoutPreflight } from '@/domain/layout-preflight';
import { computePageFlowPlan } from '@/domain/page-flow-planner';
import { StorageService } from '@/services/storage.service';
import { SupabaseService } from '@/services/supabase.service';
import { useCatalogStore } from '@/stores/useCatalogStore';

const sourceCatalog = (suffix: string, pages: Array<{ id: string; blocks: unknown }>) => ({
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
    title: `Page ${index + 1}`,
    blocks: page.blocks
  }))
});

const hydrate = (
  suffix: string,
  pages: Array<{ id: string; blocks: unknown }>
) => hydrateCatalogSource(sourceCatalog(suffix, pages)).catalog;

const hydrateIntoStore = (
  suffix: string,
  pages: Array<{ id: string; blocks: unknown }>
) => {
  const catalog = hydrate(suffix, pages);
  useCatalogStore.getState().setCurrentCatalog(catalog, false);
  return useCatalogStore.getState().currentCatalog!;
};

const preflight = (catalog: Catalog) => auditLayoutPreflight(
  catalog,
  computePageFlowPlan(catalog, [], { flowMode: 'smart' })
);

describe('A4.FLOW.R1.3.4 — ambiguous page identity guard', () => {
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

  it('R134-T1 — duplicate page identity is publication-blocking', () => {
    const catalog = hydrate('duplicate-valid', [
      { id: 'page-dup', blocks: [] },
      { id: 'page-dup', blocks: [] }
    ]);

    const report = preflight(catalog);

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DUPLICATE_PAGE_ID',
        severity: 'block',
        message: 'O identificador de página "page-dup" aparece mais de uma vez; a identidade estrutural do documento é ambígua.'
      })
    ]));
    expect(report.canPublish).toBe(false);
  });

  it('R134-T2 — mutating the first duplicate cannot remediate the malformed second duplicate', () => {
    hydrateIntoStore('duplicate-malformed', [
      {
        id: 'page-dup',
        blocks: [{ id: 'block-x', type: 'text', textContent: 'Before' }]
      },
      { id: 'page-dup', blocks: { corrupt: true } }
    ]);

    const initialCatalog = useCatalogStore.getState().currentCatalog!;
    expect(initialCatalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-dup' })
    ]);
    expect(preflight(initialCatalog).canPublish).toBe(false);

    useCatalogStore.getState().updateBlock('page-dup', 'block-x', { textContent: 'After' });

    const catalog = useCatalogStore.getState().currentCatalog!;
    const report = preflight(catalog);
    expect(catalog.pages[0].blocks[0]).toEqual(expect.objectContaining({ textContent: 'After' }));
    expect(catalog.pages[1].blocks).toEqual([]);
    expect(catalog.sourceDiagnostics).toEqual([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-dup' })
    ]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' }),
      expect.objectContaining({ code: 'DUPLICATE_PAGE_ID', severity: 'block' })
    ]));
    expect(report.canPublish).toBe(false);
  });

  it('R134-T3 — ambiguous pageId cannot be accepted as structurally remediated', () => {
    const before = hydrate('direct-reconciliation-before', [
      { id: 'page-dup', blocks: [] },
      { id: 'page-dup', blocks: { corrupt: true } }
    ]);
    const after = structuredClone(before);
    after.pages[0].blocks = [{ id: 'block-x', type: 'text', textContent: 'Changed' }];

    expect(didCatalogPageBlocksChangeUnambiguously(before, after, 'page-dup')).toBe(false);

    const reconciled = reconcileCatalogSourceDiagnostics(after, ['page-dup']);

    expect(reconciled.sourceDiagnostics).toEqual([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-dup' })
    ]);
  });

  it('R134-T4 — unique page identity preserves factual R1.3.3 remediation', () => {
    hydrateIntoStore('unique-remediation', [
      { id: 'page-a', blocks: { corrupt: true } }
    ]);

    useCatalogStore.getState().addBlock('page-a', {
      type: 'text',
      title: 'Recovered source content',
      textContent: 'Valid replacement content'
    });

    const catalog = useCatalogStore.getState().currentCatalog!;
    expect(catalog.pages[0].blocks).toHaveLength(1);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageId: 'page-a' })
    ]));
  });
});
