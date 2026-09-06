import { fireEvent } from '@testing-library/dom';
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

  const enterEditing = () => {
    const displayField = container.querySelector<HTMLElement>('[data-editor-mode="display"]');
    expect(displayField).not.toBeNull();

    act(() => {
      displayField!.focus();
    });

    const editor = container.querySelector<HTMLTextAreaElement>('[data-editor-mode="editing"]');
    expect(editor).not.toBeNull();
    return editor!;
  };

  const changeDraft = (editor: HTMLTextAreaElement, value: string) => {
    act(() => {
      fireEvent.change(editor, { target: { value } });
    });
  };

  const leaveEditing = (editor: HTMLTextAreaElement) => {
    act(() => {
      editor.blur();
    });
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

  it('preserves bold source exactly across a focus and blur with no edit', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog('**forte**');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    const editor = enterEditing();
    expect(editor.value).toBe('**forte**');
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
    expect(container.querySelector('strong')?.textContent).toBe('forte');
  });

  it('preserves italic source exactly across a focus and blur with no edit', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog('*texto*');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    const editor = enterEditing();
    expect(editor.value).toBe('*texto*');
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
    expect(container.querySelector('em')?.textContent).toBe('texto');
  });

  it('persists an edited raw source and displays its safe bold formatting', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog('**forte**');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    const editor = enterEditing();
    changeDraft(editor, '**fortíssimo**');
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledTimes(1);
    expect(updateBlock).toHaveBeenCalledWith('page-xss-security', 'box-xss-security', {
      textContent: '**fortíssimo**'
    });

    const updatedCatalog = makeCatalog('**fortíssimo**');
    act(() => {
      root!.render(
        <BoxBlock block={getBox(updatedCatalog)} pageId="page-xss-security" isSelected={false} />
      );
    });
    expect(container.querySelector('strong')?.textContent).toBe('fortíssimo');
  });

  it('persists intentional removal of lightweight markup as plain text', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog('**forte**');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    const editor = enterEditing();
    changeDraft(editor, 'forte');
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledTimes(1);
    expect(updateBlock).toHaveBeenCalledWith('page-xss-security', 'box-xss-security', {
      textContent: 'forte'
    });
  });

  it('keeps raw HTML literal before, during, and after an edit', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog(RAW_IMAGE);
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain(RAW_IMAGE);

    const editor = enterEditing();
    expect(editor.value).toBe(RAW_IMAGE);
    expect(container.querySelector('img')).toBeNull();

    changeDraft(editor, RAW_SPAN);
    expect(editor.value).toBe(RAW_SPAN);
    expect(container.querySelector('span[data-xss-audit="marker"]')).toBeNull();
    leaveEditing(editor);

    expect(updateBlock).toHaveBeenCalledWith('page-xss-security', 'box-xss-security', {
      textContent: RAW_SPAN
    });

    const updatedCatalog = makeCatalog(RAW_SPAN);
    act(() => {
      root!.render(
        <BoxBlock block={getBox(updatedCatalog)} pageId="page-xss-security" isSelected={false} />
      );
    });
    assertRawSpanIsLiteral();
  });

  it('never treats placeholder copy as persisted box content', () => {
    const updateBlock = vi.spyOn(useCatalogStore.getState(), 'updateBlock').mockImplementation(() => {});
    const catalog = makeCatalog('');
    render(<BoxBlock block={getBox(catalog)} pageId="page-xss-security" isSelected={false} />);

    expect(container.textContent).toContain('Digite notas técnicas');
    const editor = enterEditing();
    expect(editor.value).toBe('');
    expect(editor.placeholder).toContain('Digite notas técnicas');
    leaveEditing(editor);

    expect(updateBlock).not.toHaveBeenCalled();
  });

  it('keeps safe bold and italic rendering in the CleanA4Document print path', () => {
    const catalog = makeCatalog('Normal **forte** e *ênfase*');
    render(<CleanA4Document document={catalog} />);

    expect(container.querySelector('strong')?.textContent).toBe('forte');
    expect(container.querySelector('em')?.textContent).toBe('ênfase');
    expect(container.querySelector('[data-editor-mode="editing"]')).toBeNull();
  });

});
