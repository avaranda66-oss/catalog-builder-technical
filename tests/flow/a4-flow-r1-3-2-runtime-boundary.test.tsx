import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A4Canvas } from '@/components/editor/A4Canvas';
import { PageThumbnailList } from '@/components/editor/PageThumbnailList';
import type { Catalog } from '@/domain/catalog.schema';
import { auditLayoutPreflight } from '@/domain/layout-preflight';
import { computePageFlowPlan } from '@/domain/page-flow-planner';
import { catalogRowToCatalog } from '@/services/supabase.service';
import { useCatalogStore } from '@/stores/useCatalogStore';

const malformedValues = [
  ['string', 'corrupt'],
  ['number', 42],
  ['object', { corrupt: true }],
  ['boolean', false]
] as const;

const persistedRow = (blocks: unknown, suffix = 'one') => ({
  id: `catalog-${suffix}`,
  name: `Catalog ${suffix}`,
  version: 7,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  brand: {
    themeId: 'default-technical',
    pages: [{
      id: `page-${suffix}`,
      pageNumber: 1,
      pageType: 'technical',
      title: `Page ${suffix}`,
      blocks
    }]
  }
});

const hydrateIntoRealStore = (blocks: unknown, suffix = 'one') => {
  const catalog = catalogRowToCatalog(persistedRow(blocks, suffix));
  useCatalogStore.getState().setCurrentCatalog(catalog, false);
  return useCatalogStore.getState().currentCatalog!;
};

describe('A4.FLOW.R1.3.2 — runtime-safe catalog boundary', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
    class PassiveIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', PassiveIntersectionObserver);
    useCatalogStore.setState({
      currentCatalog: null,
      savedCatalogs: [],
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null,
      isDirty: false
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it.each(malformedValues)('R132-T1 — hydrates malformed %s blocks into an array plus a typed diagnostic', (_kind, value) => {
    const catalog = hydrateIntoRealStore(value, String(_kind));

    expect(Array.isArray(catalog.pages[0].blocks)).toBe(true);
    expect(catalog.pages[0].blocks).toEqual([]);
    expect(catalog.sourceDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MALFORMED_PAGE_BLOCKS',
        pageId: `page-${_kind}`,
        sourcePath: 'pages[0].blocks',
        receivedType: _kind
      })
    ]));
  });

  it.each([
    ['null', null],
    ['undefined', undefined]
  ])('R132-T2 — keeps legacy %s blocks compatible and non-diagnostic', (_kind, value) => {
    const catalog = hydrateIntoRealStore(value, String(_kind));

    expect(catalog.pages[0].blocks).toEqual([]);
    expect(catalog.sourceDiagnostics ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });

  it('R132-T3 — preserves preflight fidelity after runtime sanitization', () => {
    const catalog = hydrateIntoRealStore({ corrupt: true }, 'preflight');
    const flowPlan = computePageFlowPlan(catalog, [], { flowMode: 'smart' });
    const report = auditLayoutPreflight(catalog, flowPlan);

    expect(Array.isArray(catalog.pages[0].blocks)).toBe(true);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS', pageNumber: 1 })
    ]));
    expect(report.canPublish).toBe(false);
  });

  it('R132-T4 — renders the production PageThumbnailList through persisted hydration and store state', () => {
    hydrateIntoRealStore({ corrupt: true }, 'thumbnail');

    expect(() => render(<PageThumbnailList />)).not.toThrow();
    expect(screen.getByText('Folha 1: Page thumbnail')).toBeInTheDocument();
    expect(screen.getAllByText('Folhas A4 (1)').length).toBeGreaterThan(0);
    expect(useCatalogStore.getState().currentCatalog?.sourceDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });

  it('R132-T5 — keeps production A4Canvas selection and presence lookup paths array-safe', async () => {
    vi.useFakeTimers();
    let observerCallback: IntersectionObserverCallback | null = null;
    class ActiveIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', ActiveIntersectionObserver);

    const catalog = catalogRowToCatalog(persistedRow('corrupt', 'canvas'));
    catalog.pages.push({
      id: 'page-valid',
      pageNumber: 2,
      pageType: 'technical',
      title: 'Valid Page',
      blocks: [{ id: 'valid-block', type: 'text', textContent: 'still alive' }]
    });
    useCatalogStore.getState().setCurrentCatalog(catalog, false);
    useCatalogStore.setState({ activePageIndex: 1, selectedBlockId: 'valid-block' });

    expect(() => render(<A4Canvas />)).not.toThrow();
    expect(document.querySelector('#canvas-scroll-container')).not.toBeNull();

    const firstPage = document.querySelector<HTMLElement>('[data-page-index="0"]');
    expect(firstPage).not.toBeNull();
    expect(observerCallback).not.toBeNull();

    await act(async () => {
      observerCallback!([{
        target: firstPage!,
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: firstPage!.getBoundingClientRect(),
        intersectionRect: firstPage!.getBoundingClientRect(),
        rootBounds: null,
        time: 0
      } as IntersectionObserverEntry], {} as IntersectionObserver);
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(useCatalogStore.getState().activePageIndex).toBe(0);
    expect(useCatalogStore.getState().selectedBlockId).toBeNull();
    expect(Array.isArray(useCatalogStore.getState().currentCatalog?.pages[0].blocks)).toBe(true);
  });

  it('R132-T6 — preserves valid array-backed catalog semantics', () => {
    const sourceBlock = { id: 'valid-text', type: 'text' as const, textContent: 'unchanged' };
    const catalog = hydrateIntoRealStore([sourceBlock], 'valid');

    expect(catalog.pages[0].blocks).toEqual([sourceBlock]);
    expect(catalog.sourceDiagnostics ?? []).toEqual([]);
  });

  it('R132-T7 — keeps diagnostics outside persisted, user-editable content blocks', () => {
    const catalog = hydrateIntoRealStore(false, 'non-content');
    const serialized = JSON.parse(JSON.stringify(catalog)) as Catalog;

    expect(serialized.pages[0].blocks).toEqual([]);
    expect(serialized.pages.flatMap((page) => page.blocks)).toEqual([]);
    expect(serialized.sourceDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MALFORMED_PAGE_BLOCKS' })
    ]));
  });
});
