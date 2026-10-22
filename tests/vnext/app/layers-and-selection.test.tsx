import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession } from '@/vnext/application';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { createW2CDemoDocument, W2C_PRIMARY_ASSET_ID } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';

afterEach(cleanup);
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
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
const full = { xMm: 0, yMm: 0, widthMm: 210, heightMm: 297 };
const image = (id: string, zIndex: number, frame = full): EditorialObject => ({ id, type: 'image', frame, zIndex, assetId: W2C_PRIMARY_ASSET_ID, fit: 'cover' });
const text = (id: string, zIndex: number, words: string, frame: EditorialObject['frame']): EditorialObject =>
  ({ id, type: 'text', frame, zIndex, text: plainRichText(id + ':r', words), style: { fontSizePt: 10 } });

/** Like the PCON covers: plate → photo → full-page overlay → texts (same z). */
function coverDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('cover-seed'));
  return { ...base, pages: [{ ...base.pages[0], objects: [
    image('plate', 0),
    image('photo', 1, { xMm: 40, yMm: 90, widthMm: 130, heightMm: 120 }),
    image('overlay', 2),
    text('title', 3, 'PRESYS', { xMm: 14, yMm: 20, widthMm: 80, heightMm: 12 }),
    text('caption', 3, 'DOIS MEIOS', { xMm: 14, yMm: 40, widthMm: 80, heightMm: 12 }),
    text('pill', 3, '0 a 250 psi', { xMm: 120, yMm: 20, widthMm: 40, heightMm: 12 }),
  ] }] };
}
/** A plain page with room around the objects (for the selection box). */
function openDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('open-seed'));
  return { ...base, pages: [{ ...base.pages[0], objects: [
    text('a', 0, 'Primeiro', { xMm: 20, yMm: 20, widthMm: 40, heightMm: 12 }),
    text('b', 1, 'Segundo', { xMm: 20, yMm: 50, widthMm: 40, heightMm: 12 }),
    text('c', 2, 'Terceiro', { xMm: 120, yMm: 200, widthMm: 40, heightMm: 12 }),
  ] }] };
}

function setup(document = coverDocument()) {
  const session = createDocumentSession(document, { createId: ids('gen') });
  const view = render(<VNextApp session={session} simpleByDefault />);
  // 2 px per mm: clientX = mm * 2.
  const page = view.container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  return { session, ...view };
}
const hit = (container: HTMLElement, id: string) => container.querySelector<HTMLElement>(`[data-editor-object-id="${id}"]`)!;
const selectedIds = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-editor-object-id][data-selected="true"]')].map((element) => element.getAttribute('data-editor-object-id'));
function press(element: HTMLElement, xMm: number, yMm: number, init: Record<string, unknown> = {}, id = 1) {
  fireEvent.pointerDown(element, { pointerId: id, button: 0, clientX: xMm * 2, clientY: yMm * 2, ...init });
  fireEvent.pointerUp(element, { pointerId: id, button: 0, clientX: xMm * 2, clientY: yMm * 2, ...init });
}
const layersTree = () => screen.getByRole('tree', { name: 'Camadas da página' });
const objectsOf = (session: ReturnType<typeof setup>['session']) => session.getSnapshot().document.pages[0].objects;

describe('Onda 3.5 · selection never changes the stacking', () => {
  it('keeps the selected object at its own layer and draws outline and handles in a separate layer above the page', () => {
    const { container } = setup();
    press(hit(container, 'overlay'), 5, 5);
    expect(selectedIds(container)).toEqual(['overlay']);
    expect(hit(container, 'overlay').style.zIndex).toBe('2');
    expect(hit(container, 'overlay').querySelector('[data-resize-handle], .vnext-selection-outline')).toBeNull();
    const layer = container.querySelector('[data-selection-layer]')!;
    expect(layer.querySelector('[data-selection-box="overlay"] .vnext-selection-outline')).not.toBeNull();
    expect(layer.querySelectorAll('[data-resize-handle]')).toHaveLength(8);
    // The texts above the overlay are still reachable with a plain click.
    press(hit(container, 'title'), 20, 25, {}, 2);
    expect(selectedIds(container)).toEqual(['title']);
  });

  it('Esc and a click on the grey margin let go of the selection', () => {
    const { container } = setup();
    press(hit(container, 'overlay'), 5, 5);
    fireEvent.keyDown(hit(container, 'overlay'), { key: 'Escape' });
    expect(selectedIds(container)).toEqual([]);
    expect(screen.getByText('Seleção desfeita.')).toBeInTheDocument();
    press(hit(container, 'title'), 20, 25);
    const margin = container.querySelector<HTMLElement>('.vnext-document-preview')!;
    fireEvent.pointerDown(margin, { pointerId: 5, button: 0, clientX: 900, clientY: 900 });
    fireEvent.pointerUp(container.querySelector<HTMLElement>('[data-editor-overlay]')!, { pointerId: 5, button: 0, clientX: 900, clientY: 900 });
    expect(selectedIds(container)).toEqual([]);
  });
});

describe('Onda 3.5 · reaching the object below', () => {
  it('Alt+click walks down every object under the pointer and wraps around', () => {
    const { container } = setup();
    const top = hit(container, 'overlay');
    press(top, 100, 150, { altKey: true });
    expect(selectedIds(container)).toEqual(['overlay']);
    press(top, 100, 150, { altKey: true }, 2);
    expect(selectedIds(container)).toEqual(['photo']);
    expect(screen.getByText(/Objeto 2 de 3 sob o ponteiro/)).toBeInTheDocument();
    press(top, 100, 150, { altKey: true }, 3);
    expect(selectedIds(container)).toEqual(['plate']);
    press(top, 100, 150, { altKey: true }, 4);
    expect(selectedIds(container)).toEqual(['overlay']);
  });

  it('a locked background lets the click through to the photo; a drag on it draws a selection box', () => {
    const { container, session } = setup();
    // "Travar o fundo": the plate and the overlay.
    for (const id of ['overlay', 'plate']) {
      const row = layersTree().querySelector<HTMLElement>(`[data-layer-id="${id}"]`)!;
      fireEvent.click(within(row).getByRole('button', { name: /^Travar Imagem/ }));
    }
    expect(objectsOf(session).find((object) => object.id === 'overlay')?.locked).toBe(true);
    press(hit(container, 'overlay'), 100, 150);
    expect(selectedIds(container)).toEqual(['photo']);
    // Drag starting on the locked background: selection box around the two left texts.
    const overlayLayer = container.querySelector<HTMLElement>('[data-editor-overlay]')!;
    fireEvent.pointerDown(hit(container, 'overlay'), { pointerId: 9, button: 0, clientX: 10 * 2, clientY: 15 * 2 });
    fireEvent.pointerMove(overlayLayer, { pointerId: 9, clientX: 100 * 2, clientY: 60 * 2 });
    expect(container.querySelector('[data-selection-marquee]')).not.toBeNull();
    fireEvent.pointerUp(overlayLayer, { pointerId: 9, clientX: 100 * 2, clientY: 60 * 2 });
    expect(selectedIds(container).sort()).toEqual(['caption', 'title']);
  });
});

describe('Onda 3.5 · "Camadas" panel', () => {
  it('lists every object, front first, with readable names; click selects, Shift+click adds', () => {
    const { container } = setup();
    const rows = within(layersTree()).getAllByRole('treeitem');
    expect(rows.map((row) => row.getAttribute('data-layer-id'))).toEqual(['pill', 'caption', 'title', 'overlay', 'photo', 'plate']);
    expect(rows[0]).toHaveAccessibleName('Texto “0 a 250 psi”');
    fireEvent.click(rows[4]);
    expect(selectedIds(container)).toEqual(['photo']);
    expect(screen.getByText('Camada 2 de 6 (1 = mais ao fundo)')).toBeInTheDocument();
    fireEvent.click(rows[3], { shiftKey: true });
    expect(selectedIds(container).sort()).toEqual(['overlay', 'photo']);
    expect(within(layersTree()).getAllByRole('treeitem', { selected: true })).toHaveLength(2);
  });

  it('the eye hides the object (not on the page, warned before publishing) and Desfazer brings it back', () => {
    const { container, session } = setup();
    fireEvent.click(within(layersTree()).getAllByRole('button', { name: /^Esconder Imagem/ })[0]);
    expect(objectsOf(session).find((object) => object.id === 'overlay')?.hidden).toBe(true);
    expect(hit(container, 'overlay')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-editorial-root] [data-object-id="overlay"]')!.style.visibility).toBe('hidden');
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(objectsOf(session).find((object) => object.id === 'overlay')?.hidden).toBeUndefined();
    expect(hit(container, 'overlay')).not.toBeNull();
  });

  it('Alt+↓ on a row moves the object one layer back as one undoable change', () => {
    const { session } = setup(openDocument());
    const row = within(layersTree()).getAllByRole('treeitem')[0];
    expect(row).toHaveAttribute('data-layer-id', 'c');
    fireEvent.keyDown(row, { key: 'ArrowDown', altKey: true });
    const order = () => [...objectsOf(session)].sort((left, right) => left.zIndex - right.zIndex).map((object) => object.id);
    expect(order()).toEqual(['a', 'c', 'b']);
    session.undo();
    expect(order()).toEqual(['a', 'b', 'c']);
  });
});

describe('Onda 3.5 · several objects at once', () => {
  it('a drag on an empty area selects what is inside; dragging one selected object moves all in one undo step', () => {
    const { container, session } = setup(openDocument());
    const overlay = container.querySelector<HTMLElement>('[data-editor-overlay]')!;
    fireEvent.pointerDown(overlay, { pointerId: 3, button: 0, clientX: 10 * 2, clientY: 10 * 2 });
    fireEvent.pointerMove(overlay, { pointerId: 3, clientX: 80 * 2, clientY: 80 * 2 });
    fireEvent.pointerUp(overlay, { pointerId: 3, clientX: 80 * 2, clientY: 80 * 2 });
    expect(selectedIds(container).sort()).toEqual(['a', 'b']);
    const before = objectsOf(session).map((object) => object.frame.xMm);
    const target = hit(container, 'a');
    fireEvent.pointerDown(target, { pointerId: 4, button: 0, clientX: 30 * 2, clientY: 25 * 2 });
    fireEvent.pointerMove(target, { pointerId: 4, clientX: 40 * 2, clientY: 25 * 2 });
    fireEvent.pointerUp(target, { pointerId: 4, clientX: 40 * 2, clientY: 25 * 2 });
    const after = objectsOf(session).map((object) => object.frame.xMm);
    expect(after[0] - before[0]).toBeGreaterThan(5);
    expect(after[1] - before[1]).toBeCloseTo(after[0] - before[0], 6);
    expect(after[2]).toBe(before[2]);
    expect(selectedIds(container).sort()).toEqual(['a', 'b']);
    session.undo();
    expect(objectsOf(session).map((object) => object.frame.xMm)).toEqual(before);
  });

  it('groups objects that are not neighbours, then a double click edits a text of the group in place', () => {
    const { container, session } = setup(openDocument());
    press(hit(container, 'a'), 30, 25);
    press(hit(container, 'c'), 130, 205, { ctrlKey: true }, 2);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="toggle-advanced-tools"]')!);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="group"]')!);
    const group = objectsOf(session).find((object) => object.type === 'group')!;
    expect(group).toBeDefined();
    fireEvent.doubleClick(hit(container, group.id), { clientX: 130 * 2, clientY: 205 * 2 });
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    expect(textarea).toHaveValue('Terceiro');
    fireEvent.change(textarea, { target: { value: 'Quarto' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    const edited = objectsOf(session).find((object) => object.id === group.id);
    expect(edited?.type === 'group' && edited.objects.some((child) => child.type === 'text' && child.text.paragraphs[0].inlines[0]?.kind === 'text'
      && child.text.paragraphs[0].inlines[0].text === 'Quarto')).toBe(true);
  });

  it('"Enviar ao fundo" keeps a text in front of the full-page background and says so', () => {
    const { container, session } = setup();
    press(hit(container, 'title'), 20, 25);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="toggle-advanced-tools"]')!);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="send-back"]')!);
    const order = [...objectsOf(session)].sort((left, right) => left.zIndex - right.zIndex).map((object) => object.id);
    expect(order.indexOf('title')).toBe(order.indexOf('overlay') + 1);
    expect(screen.getByText(/continua na frente do fundo da página/)).toBeInTheDocument();
  });
});
