import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import type { Catalog } from '../../src/domain/catalog.schema';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

const legacyHydratedCatalog = {
  id: 'legacy-hydrated-catalog',
  title: 'Legacy hydrated catalog',
  themeId: 'default',
  pages: [{
    id: 'legacy-page-without-blocks',
    pageNumber: 1,
    pageType: 'technical',
    title: 'Legacy page'
  }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1
} as unknown as Catalog;

describe('A4 Studio white-screen hotfix', () => {
  beforeEach(() => {
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    useCatalogStore.setState({
      currentCatalog: legacyHydratedCatalog,
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps A4 Studio mounted when hydration supplies a legacy page without blocks', () => {
    expect(() => render(<A4Canvas />)).not.toThrow();
    expect(document.querySelector('#canvas-scroll-container')).not.toBeNull();
  });

  it('keeps A4 Studio mounted when page has empty blocks array', () => {
    useCatalogStore.setState({
      currentCatalog: {
        ...legacyHydratedCatalog,
        pages: [{
          id: 'page-with-empty-blocks',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Empty blocks page',
          blocks: []
        }]
      }
    });
    expect(() => render(<A4Canvas />)).not.toThrow();
    expect(document.querySelector('#canvas-scroll-container')).not.toBeNull();
  });

  it('preserves behavior when page has real blocks', () => {
    useCatalogStore.setState({
      currentCatalog: {
        ...legacyHydratedCatalog,
        pages: [{
          id: 'page-with-real-blocks',
          pageNumber: 1,
          pageType: 'technical',
          title: 'Page with real blocks',
          blocks: [{
            id: 'b1',
            type: 'text',
            title: 'Sample Block',
            textContent: 'Hello World'
          }]
        }]
      }
    });
    expect(() => render(<A4Canvas />)).not.toThrow();
    expect(document.querySelector('#canvas-scroll-container')).not.toBeNull();
  });

  it('normalizes legacy pages without blocks in catalogRowToCatalog repository mapper', async () => {
    const { catalogRowToCatalog } = await import('../../src/services/supabase.service');
    const row = {
      id: 'legacy-row-1',
      name: 'Legacy Database Catalog',
      brand: {
        pages: [
          { id: 'p1', pageNumber: 1, title: 'No blocks page' }
        ]
      }
    };
    const catalog = catalogRowToCatalog(row);
    expect(catalog.pages[0].blocks).toEqual([]);
  });
});

