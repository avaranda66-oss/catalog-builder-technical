import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry, projectEditableRichText } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { textEditToolbarPosition } from '@/vnext/app/editor/TextEditToolbar';
import { resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';

/** FR-16b: the bar of a text being edited is drawn outside the zoomed page, at its real size. */

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  window.localStorage.clear();
  resetStageZoomStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Rect = { left: number; top: number; width: number; height: number };
const box = ({ left, top, width, height }: Rect) => ({ left, top, width, height, right: left + width, bottom: top + height });
const layerAt = (rect: Rect, scroll = { scrollLeft: 0, scrollTop: 0 }) => ({ ...box(rect), ...scroll, clientLeft: 0, clientTop: 0 });

describe('textEditToolbarPosition (pure)', () => {
  const page = box({ left: 100, top: 50, width: 600, height: 850 });
  const layer = layerAt({ left: 80, top: 40, width: 800, height: 700 });
  const toolbar = { width: 420, height: 58 };

  it('sits under the text box, from its left edge, in the coordinates of the page area', () => {
    const text = box({ left: 150, top: 200, width: 200, height: 40 });
    expect(textEditToolbarPosition({ text, page, layer, toolbar })).toEqual({ left: 70, top: 200, maxWidth: 600, placement: 'below' });
  });

  it('follows the scroll of the page area', () => {
    const text = box({ left: 150, top: 200, width: 200, height: 40 });
    const scrolled = layerAt({ left: 80, top: 40, width: 800, height: 700 }, { scrollLeft: 30, scrollTop: 400 });
    expect(textEditToolbarPosition({ text, page, layer: scrolled, toolbar })).toMatchObject({ left: 100, top: 600 });
  });

  it('is pushed left so it never passes the right edge of the page (text in the right column)', () => {
    const text = box({ left: 560, top: 200, width: 120, height: 40 });
    const position = textEditToolbarPosition({ text, page, layer, toolbar });
    expect(position.left + layer.left + toolbar.width).toBe(page.right);
  });

  it('goes above the text box when there is no room under it on the page', () => {
    const text = box({ left: 150, top: 820, width: 200, height: 60 });
    expect(textEditToolbarPosition({ text, page, layer, toolbar })).toMatchObject({ top: 820 - 58 - 40, placement: 'above' });
  });

  it('keeps a usable width on a page shown very small ("Página inteira")', () => {
    const small = box({ left: 100, top: 50, width: 210, height: 297 });
    const text = box({ left: 120, top: 80, width: 80, height: 20 });
    expect(textEditToolbarPosition({ text, page: small, layer, toolbar }).maxWidth).toBe(280);
  });
});

function textDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('toolbar-seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'text-target', type: 'text', frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 }, zIndex: 0,
        text: plainRichText('text-local', 'Modelo'),
        style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
      }],
    }],
  };
}

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function startTextEdit() {
  const session = createDocumentSession(textDocument(), {
    createId: ids('toolbar-generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
  const view = render(<EditorWorkspace session={session} simpleByDefault />);
  const page = view.container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = view.container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
  fireEvent.pointerDown(hit, { pointerId: 41, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId: 41, button: 0, clientX: 80, clientY: 80 });
  fireEvent.keyDown(hit, { key: 'Enter' });
  return { session, ...view };
}

const bar = () => screen.getByRole('group', { name: 'Ferramentas da edição de texto' });
const textOf = (session: ReturnType<typeof startTextEdit>['session']) => {
  const object = session.getSnapshot().document.pages[0].objects[0];
  if (object.type !== 'text') throw new Error('Missing text');
  return projectEditableRichText(object.text);
};

describe('FR-16b text bar outside the zoomed page', () => {
  it('is drawn in the page area, outside the zoomed page and outside the printed drawing', () => {
    const { container } = startTextEdit();
    const toolbar = bar();
    expect(container.querySelector('.vnext-document-preview')).toContainElement(toolbar);
    expect(container.querySelector('[data-vnext-page-stage]')).not.toContainElement(toolbar);
    expect(toolbar.closest('[data-editorial-root]')).toBeNull();
    // A hidden marker stays in the text box; the textarea stays on the page.
    expect(container.querySelector('[data-text-edit-session] [data-text-edit-toolbar-anchor]')).toBeTruthy();
    expect(container.querySelector('[data-vnext-page-stage] [data-text-edit-textarea]')).toBeTruthy();
    // Plain names for the symbols, and the two actions.
    expect(within(toolbar).getByRole('button', { name: 'Inserir ±' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Concluir' })).toHaveClass('is-primary');
  });

  it('places itself from the text box measured on screen and follows the window size', () => {
    const { container } = startTextEdit();
    const layer = container.querySelector<HTMLElement>('.vnext-document-preview')!;
    const stage = container.querySelector<HTMLElement>('[data-vnext-page-stage]')!;
    const session = container.querySelector<HTMLElement>('[data-text-edit-session]')!;
    const rect = (value: Rect) => () => ({ ...box(value), x: value.left, y: value.top, toJSON: () => ({}) });
    layer.getBoundingClientRect = rect({ left: 200, top: 120, width: 900, height: 700 });
    stage.getBoundingClientRect = rect({ left: 260, top: 124, width: 620, height: 877 });
    session.getBoundingClientRect = rect({ left: 320, top: 240, width: 210, height: 60 });
    Object.defineProperty(bar(), 'offsetWidth', { configurable: true, value: 400 });
    Object.defineProperty(bar(), 'offsetHeight', { configurable: true, value: 58 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(bar().style.left).toBe('120px');
    expect(bar().style.top).toBe('180px');
    expect(bar().style.visibility).toBe('');
    expect(bar()).toHaveAttribute('data-placement', 'below');
  });

  it('inserts a symbol without leaving the text, then "Concluir" saves and "Cancelar" discards', () => {
    const { container, session } = startTextEdit();
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.change(textarea, { target: { value: 'Faixa ' } });
    textarea.setSelectionRange(6, 6);
    // Pressing on the bar counts as a press inside the text being edited (the text is not concluded first).
    fireEvent.pointerDown(within(bar()).getByRole('button', { name: 'Inserir ±' }));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Inserir ±' }));
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!.value).toBe('Faixa ±');
    expect(textOf(session)).toBe('Modelo');
    fireEvent.click(within(bar()).getByRole('button', { name: 'Concluir' }));
    expect(textOf(session)).toBe('Faixa ±');
    expect(screen.queryByRole('group', { name: 'Ferramentas da edição de texto' })).toBeNull();

    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
    fireEvent.keyDown(hit, { key: 'Enter' });
    fireEvent.change(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!, { target: { value: 'Descartado' } });
    fireEvent.click(within(bar()).getByRole('button', { name: 'Cancelar' }));
    expect(textOf(session)).toBe('Faixa ±');
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
  });
});
