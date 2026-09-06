import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxBlock } from '../../src/components/editor/blocks/BoxBlock';
import { A4Canvas } from '../../src/components/editor/A4Canvas';
import { CleanA4Document } from '../../src/components/export/CleanA4Document';
import { Catalog, ContentBlock } from '../../src/domain/catalog.schema';
import { StorageService } from '../../src/services/storage.service';
import { useCatalogStore } from '../../src/stores/useCatalogStore';

const RAW_SPAN = '<span data-xss-audit="marker" onclick="void 0">AUDIT</span>';
const RAW_IMAGE = '<img src=x onerror="void 0">';

const makeCatalog = (textContent: string, id = 'catalog-xss-security'): Catalog => ({
  id,
  title: 'Catálogo de regressão XSS',
  description: 'Fixture local e inerte para segurança de renderização',
  status: 'draft',
  version: 1,
  themeId: 'default',
  locale: 'pt-BR',
  pages: [
    {
      id: 'page-xss-security',
      pageNumber: 1,
      title: 'Página de segurança',
      blocks: [
        {
          id: 'box-xss-security',
          type: 'box',
          textContent
        }
      ]
    }
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const getBox = (catalog: Catalog): ContentBlock => catalog.pages[0].blocks[0];

describe('COMPANY.READINESS.SECURITY.XSS.FIX1 — BoxBlock stored XSS regression', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const render = (node: React.ReactNode) => {
    root = createRoot(container);
    act(() => {
      root!.render(node);
    });
  };

  const assertRawSpanIsLiteral = () => {
    expect(container.querySelector('span[data-xss-audit="marker"]')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.textContent).toContain(RAW_SPAN);
  };

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();

    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as any).ResizeObserver = MockResizeObserver;

    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    (globalThis as any).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders raw span markup as literal text without creating an event-capable element', () => {
    const catalog = makeCatalog(RAW_SPAN);
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    assertRawSpanIsLiteral();
  });

  it('renders event-bearing image markup as literal text without creating an img node', () => {
    const catalog = makeCatalog(RAW_IMAGE);
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(RAW_IMAGE);
  });

  it('preserves the supported bold and italic lightweight formatting as safe React nodes', () => {
    const catalog = makeCatalog('Normal **forte** e *ênfase*');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('ênfase');
    expect(container.textContent).toBe('Normal forte e ênfase');
  });

  it('neutralizes raw markup in the editor A4 preview path', () => {
    const catalog = makeCatalog(RAW_SPAN);
    useCatalogStore.setState({
      currentCatalog: catalog,
      activePageIndex: 0,
      selectedBlockId: null,
      selectedChildId: null
    });

    render(<A4Canvas />);

    assertRawSpanIsLiteral();
  });

  it('keeps legacy stored markup inert after local persistence and reload', async () => {
    const catalog = makeCatalog(RAW_SPAN, 'catalog-xss-reload');
    await StorageService.saveCatalog(catalog);

    const loaded = await StorageService.loadCatalog(catalog.id);
    expect(loaded).not.toBeNull();
    expect(getBox(loaded!).textContent).toBe(RAW_SPAN);

    render(<BoxBlock block={getBox(loaded!)} pageId="page-xss-security" isSelected={false} />);
    assertRawSpanIsLiteral();
  });

  it('keeps imported backup markup inert when rendered through the shared BoxBlock boundary', async () => {
    const catalog = makeCatalog(RAW_SPAN, 'catalog-xss-backup');
    const result = await StorageService.importBackup(
      JSON.stringify({ version: '1.0', catalogs: [catalog], products: [] })
    );

    expect(result.success).toBe(true);
    const loaded = await StorageService.loadCatalog(catalog.id);
    expect(loaded).not.toBeNull();

    render(<BoxBlock block={getBox(loaded!)} pageId="page-xss-security" isSelected={false} />);
    assertRawSpanIsLiteral();
  });

  it('neutralizes raw markup in the CleanA4Document print path', () => {
    const catalog = makeCatalog(RAW_SPAN);
    render(<CleanA4Document document={catalog} />);

    assertRawSpanIsLiteral();
  });
});
