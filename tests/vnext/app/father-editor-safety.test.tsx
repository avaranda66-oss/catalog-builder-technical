import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  createDocumentSession,
  projectEditableRichText,
  type ApplicationExecutionDependencies,
  type DocumentSession,
} from '@/vnext/application';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { createW4BTableDocument } from '../proof/fixtures/w4b-table-document';

/**
 * Father-ready editor safety (Onda 1, slice 1C):
 * FR-10 numeric fields accept "12,5" and never lock the editor,
 * FR-11 pages can be duplicated, moved and deleted,
 * FR-19 Word-like keyboard (Delete, arrows, Ctrl+D, Ctrl+S, Esc concludes text).
 */

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

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const MUTATION_0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MUTATION_1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function shape(id: string, frame: EditorialObject['frame']): EditorialObject {
  return { id, type: 'shape', frame, zIndex: 0, shape: 'rectangle', style: { fill: '#edf5ff' } };
}

function text(id: string, content: string, yMm: number): EditorialObject {
  return {
    id, type: 'text', frame: { xMm: 20, yMm, widthMm: 80, heightMm: 14 }, zIndex: 1, text: plainRichText(id, content),
    style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
  };
}

function fatherDocument(id?: string): CatalogDocument {
  const base = createW2CDemoDocument(ids('doc'));
  return {
    ...base,
    ...(id ? { id } : {}),
    pages: [
      {
        id: 'page-cover', widthMm: 210, heightMm: 297,
        objects: [
          shape('shape-target', { xMm: 88, yMm: 30, widthMm: 40, heightMm: 50 }),
          shape('shape-other', { xMm: 20, yMm: 150, widthMm: 30, heightMm: 30 }),
          text('text-target', 'Modelo', 220),
        ],
      },
      { id: 'page-specs', widthMm: 210, heightMm: 297, objects: [text('specs-title', 'Especificações', 20), shape('specs-box', { xMm: 20, yMm: 60, widthMm: 40, heightMm: 20 })] },
      { id: 'page-extra', widthMm: 210, heightMm: 297, objects: [] },
    ],
  };
}

function sessionFor(document = fatherDocument()) {
  return createDocumentSession(document, { createId: ids('generated') });
}

function setPageRect(container: HTMLElement) {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
}

function select(container: HTMLElement, objectId: string, pointerId = 70): HTMLElement {
  setPageRect(container);
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${objectId}"]`);
  if (!hit) throw new Error(`Missing hit target ${objectId}`);
  fireEvent.pointerDown(hit, { pointerId, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId, button: 0, clientX: 100, clientY: 100 });
  return hit;
}

function field(container: HTMLElement, name: 'x' | 'y' | 'width' | 'height'): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`[data-inspector-field="${name}"]`);
  if (!input) throw new Error(`Missing ${name} field`);
  return input;
}

function openDetails() {
  const toggle = screen.queryByRole('button', { name: 'Mais propriedades' });
  if (toggle) fireEvent.click(toggle);
}

function frameOf(session: DocumentSession, objectId: string) {
  for (const page of session.getSnapshot().document.pages) {
    const object = page.objects.find((entry) => entry.id === objectId);
    if (object) return object.frame;
  }
  return undefined;
}

const isSelected = (container: HTMLElement, objectId: string) =>
  container.querySelector(`[data-editor-object-id="${objectId}"]`)?.getAttribute('data-selected') === 'true';

function renderFather(session = sessionFor()) {
  const view = render(<VNextApp session={session} simpleByDefault />);
  return { session, container: view.container };
}

describe('FR-10 · position and size fields accept a comma and never lock the editor', () => {
  it('"88,5" moves the object, shows "88,5" and Desfazer still works', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    // Screen readers announce the panel in plain Portuguese, not "Inspector".
    expect(screen.getByRole('complementary', { name: 'Propriedades do objeto' })).toContainElement(field(container, 'x'));
    const x = field(container, 'x');
    expect(x.value).toBe('88');

    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '88,5' } });
    fireEvent.blur(x);
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88.5);
    expect(field(container, 'x').value).toBe('88,5');
    expect(container.querySelector('[data-inspector-error]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última alteração' }));
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
  });

  it('"88.0" is the same number: nothing is pending, nothing is blocked', () => {
    const session = sessionFor();
    const execute = vi.spyOn(session, 'execute');
    const { container } = renderFather(session);
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');

    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '88.0' } });
    select(container, 'shape-other', 71);
    expect(isSelected(container, 'shape-other')).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(container.textContent).not.toContain('Inspector');

    select(container, 'shape-target', 72);
    openDetails();
    const again = field(container, 'x');
    fireEvent.change(again, { target: { value: '88,0' } });
    fireEvent.blur(again);
    expect(field(container, 'x').value).toBe('88');
    expect(execute).not.toHaveBeenCalled();
  });

  it('"abc" goes back to the current value with the error next to the field, and other actions keep working', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    const width = field(container, 'width');

    fireEvent.change(width, { target: { value: 'abc' } });
    fireEvent.blur(width);
    expect(frameOf(session, 'shape-target')?.widthMm).toBe(40);
    const shown = field(container, 'width');
    expect(shown.value).toBe('40');
    expect(shown).toHaveAttribute('aria-invalid', 'true');
    expect(shown).toHaveAccessibleDescription('Use um número, como 12,5.');
    expect(screen.getByText('Largura: digite um número em milímetros, como 12,5. O valor anterior foi mantido.')).toBeInTheDocument();

    fireEvent.change(shown, { target: { value: '45,5' } });
    expect(container.querySelector('[data-inspector-error]')).toBeNull();
    fireEvent.blur(field(container, 'width'));
    expect(frameOf(session, 'shape-target')?.widthMm).toBe(45.5);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(frameOf(session, 'shape-target')).toBeUndefined();
  });

  it('drops the red hint once Desfazer puts another value in the field (browser check: it stayed after undo)', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '12,5' } });
    fireEvent.blur(x);
    expect(frameOf(session, 'shape-target')?.xMm).toBe(12.5);

    fireEvent.change(field(container, 'x'), { target: { value: 'abc' } });
    fireEvent.blur(field(container, 'x'));
    expect(field(container, 'x').value).toBe('12,5');
    expect(field(container, 'x')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última alteração' }));
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(field(container, 'x').value).toBe('88');
    expect(field(container, 'x')).not.toHaveAttribute('aria-invalid');
    expect(container.querySelector('[data-inspector-error]')).toBeNull();
  });

  it('rejects a zero size with a plain message and keeps the previous value', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'height'), { target: { value: '0' } });
    fireEvent.blur(field(container, 'height'));
    expect(frameOf(session, 'shape-target')?.heightMm).toBe(50);
    expect(field(container, 'height')).toHaveAccessibleDescription('Precisa ser maior que zero.');
  });

  it('clicking another object applies a valid typed value first instead of blocking', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.focus(field(container, 'x'));
    fireEvent.change(field(container, 'x'), { target: { value: '12,5' } });

    select(container, 'shape-other', 73);
    expect(frameOf(session, 'shape-target')?.xMm).toBe(12.5);
    expect(isSelected(container, 'shape-other')).toBe(true);
    openDetails();
    expect(field(container, 'x').value).toBe('20');
  });

  it('clicking another object with an invalid value puts it back and still changes the selection', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'y'), { target: { value: '12,5cm' } });

    select(container, 'shape-other', 74);
    expect(isSelected(container, 'shape-other')).toBe(true);
    expect(frameOf(session, 'shape-target')?.yMm).toBe(30);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('Esc puts back the current value without changing the object', () => {
    const session = sessionFor();
    const execute = vi.spyOn(session, 'execute');
    const { container } = renderFather(session);
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '150' } });
    fireEvent.keyDown(x, { key: 'Escape' });
    expect(field(container, 'x').value).toBe('88');
    expect(screen.getByText('X: valor anterior restaurado.')).toBeInTheDocument();
    fireEvent.blur(field(container, 'x'));
    expect(execute).not.toHaveBeenCalled();
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
  });

  it('changing page with a half-typed value never blocks and says the value was not used', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'x'), { target: { value: 'oops' } });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegação de páginas' })).getByRole('button', { name: 'Página 2' }));
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', 'page-specs');
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(screen.getByText(DISCARDED_X)).toBeInTheDocument();
  });

  it('a real click on another page keeps the "value not used" notice instead of clearing it', () => {
    const { container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'width'), { target: { value: 'abc' } });
    const page2 = within(screen.getByRole('navigation', { name: 'Navegação de páginas' })).getByRole('button', { name: 'Página 2' });
    fireEvent.pointerDown(page2, { pointerId: 90, button: 0 });
    fireEvent.click(page2);
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', 'page-specs');
    expect(screen.getByText('O valor digitado em Largura não era válido e não foi usado; o valor anterior foi mantido.')).toBeInTheDocument();
  });

  it('leaving one field applies every typed field together (none is dropped)', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'x'), { target: { value: '10,5' } });
    fireEvent.change(field(container, 'y'), { target: { value: '20' } });
    fireEvent.blur(field(container, 'y'));
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 10.5, yMm: 20 });
    expect(field(container, 'x').value).toBe('10,5');
    expect(session.undo().ok).toBe(true);
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 88, yMm: 30 });
  });
});

const DISCARDED_X = 'O valor digitado em X não era válido e não foi usado; o valor anterior foi mantido.';

describe('FR-10 · cell inner spacing accepts "1,5"', () => {
  it('applies padding "1,5" to the selected cell', async () => {
    const document = createW4BTableDocument();
    const table = document.pages[0].objects.find((object) => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Missing table fixture');
    const session = createDocumentSession(document, { createId: ids('generated') });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = nativeGetComputedStyle(element, pseudo);
      return new Proxy(style, {
        get(target, property) {
          if (property === 'transform' || property === 'scale' || property === 'translate' || property === 'rotate') return 'none';
          if (property === 'zoom') return '1';
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) as CSSStyleDeclaration;
    });
    const originalDecode = HTMLImageElement.prototype.decode;
    const originalRects = Range.prototype.getClientRects;
    HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
    Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
    try {
      const { container } = render(<VNextApp session={session} />);
      select(container, table.id, 75);
      const shell = container.querySelector<HTMLElement>('[data-vnext-shell]')!;
      await waitFor(() => {
        if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(screen.getByRole('button', { name: 'Editar tabela' }));
        expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
      }, { timeout: 5_000 });
      // FR-33 (2D): the inner spacing of the selected cells lives in "Texto, cores e bordas" › ajustes por lado.
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes por lado e altura da linha' }));
      const top = container.querySelector<HTMLInputElement>('[data-style-padding-side="top"]');
      if (!top) throw new Error('Missing cell padding field');
      const before = top.value;
      fireEvent.change(top, { target: { value: 'abc' } });
      fireEvent.blur(top);
      expect(container.querySelector<HTMLInputElement>('[data-style-padding-side="top"]')?.value).toBe(before);
      expect(screen.getByText('Espaço interno: digite um número em milímetros, como 1,5 (zero ou mais). O valor anterior foi mantido.')).toBeInTheDocument();

      const again = container.querySelector<HTMLInputElement>('[data-style-padding-side="top"]')!;
      fireEvent.change(again, { target: { value: '1,5' } });
      fireEvent.blur(again);
      const cell = session.getSnapshot().document.pages[0].objects
        .flatMap((object) => (object.type === 'table' ? object.table.cells : []))
        .find((entry) => entry.rowId === table.table.rows[0].id && entry.columnId === table.table.columns[0].id);
      expect(cell?.style?.paddingMm?.top).toBe(1.5);
      await waitFor(() => expect(container.querySelector<HTMLInputElement>('[data-style-padding-side="top"]')?.value).toBe('1,5'));
    } finally {
      computedStyle.mockRestore();
      HTMLImageElement.prototype.decode = originalDecode;
      Range.prototype.getClientRects = originalRects;
    }
  });
});

describe('FR-19 · Word-like keyboard', () => {
  it('arrows move 1 mm, Shift+arrows 5 mm, each one undoable', () => {
    const { session, container } = renderFather();
    const hit = select(container, 'shape-target');
    expect(fireEvent.keyDown(hit, { key: 'ArrowRight' })).toBe(false);
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 89, yMm: 30 });
    fireEvent.keyDown(hit, { key: 'ArrowDown', shiftKey: true });
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 89, yMm: 35 });
    fireEvent.keyDown(hit, { key: 'ArrowLeft' });
    fireEvent.keyDown(hit, { key: 'ArrowUp' });
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 88, yMm: 34 });
    expect(session.undo().ok).toBe(true);
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 88, yMm: 35 });
  });

  it('Delete and Backspace remove the selection, and Ctrl+Z brings it back even after focus is lost', () => {
    const { session, container } = renderFather();
    const hit = select(container, 'shape-target');
    expect(fireEvent.keyDown(hit, { key: 'Delete' })).toBe(false);
    expect(frameOf(session, 'shape-target')).toBeUndefined();
    expect(screen.getByText('Objeto excluído. Para recuperar, use Desfazer.')).toBeInTheDocument();

    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(false);
    expect(frameOf(session, 'shape-target')).toBeDefined();

    const other = select(container, 'shape-other', 76);
    fireEvent.keyDown(other, { key: 'Backspace' });
    expect(frameOf(session, 'shape-other')).toBeUndefined();
  });

  it('Ctrl+D duplicates the selected object instead of bookmarking the page', () => {
    const { session, container } = renderFather();
    const hit = select(container, 'shape-target');
    const before = session.getSnapshot().document.pages[0].objects.length;
    expect(fireEvent.keyDown(hit, { key: 'd', ctrlKey: true })).toBe(false);
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(before + 1);
  });

  it('never acts on the object while typing in a field', () => {
    const session = sessionFor();
    const execute = vi.spyOn(session, 'execute');
    const { container } = renderFather(session);
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');
    fireEvent.focus(x);
    expect(fireEvent.keyDown(x, { key: 'Delete' })).toBe(true);
    expect(fireEvent.keyDown(x, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(x, { key: 'Backspace' })).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
  });

  it('refuses to move a locked object with a plain message', () => {
    const document = fatherDocument();
    document.pages[0].objects[0] = { ...document.pages[0].objects[0], locked: true };
    const { session, container } = renderFather(sessionFor(document));
    const hit = select(container, 'shape-target');
    fireEvent.keyDown(hit, { key: 'ArrowRight' });
    fireEvent.keyDown(hit, { key: 'Delete' });
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(screen.getByText('Objeto bloqueado. Desbloqueie para excluir.')).toBeInTheDocument();
  });

  it('Esc in a text box keeps what was typed (Cancelar still discards)', () => {
    const session = sessionFor();
    const { container } = render(<VNextApp session={session} />);
    select(container, 'text-target');
    fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.change(textarea, { target: { value: 'Faixa: -40 a 155 °C' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === 'text-target');
    expect(object?.type === 'text' && projectEditableRichText(object.text)).toBe('Faixa: -40 a 155 °C');
  });

  it('Ctrl+S without a saved catalog never opens the browser dialog', () => {
    const { container } = renderFather();
    select(container, 'shape-target');
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false);
    expect(screen.getByText('Este rascunho fica só nesta aba e não é salvo.')).toBeInTheDocument();
  });

  it('Enter in X applies the value and keeps the field focused, so the next Backspace never deletes the object', async () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');
    x.focus();
    fireEvent.change(x, { target: { value: '50' } });
    fireEvent.keyDown(x, { key: 'Enter' });
    expect(frameOf(session, 'shape-target')?.xMm).toBe(50);
    await Promise.resolve();
    const focused = field(container, 'x');
    expect(document.activeElement).toBe(focused);
    expect([focused.selectionStart, focused.selectionEnd]).toEqual([0, focused.value.length]);

    expect(fireEvent.keyDown(focused, { key: 'Backspace' })).toBe(true);
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 50, yMm: 30 });
  });

  it('after Esc concludes a text box, a stray Backspace does not delete the text box', () => {
    const session = sessionFor();
    const { container } = render(<VNextApp session={session} />);
    select(container, 'text-target');
    fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.change(textarea, { target: { value: 'Faixa de medição' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(container.querySelector('[data-editor-object-id]:focus')).toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Backspace' });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === 'text-target');
    expect(object?.type === 'text' && projectEditableRichText(object.text)).toBe('Faixa de medição');
  });

  it('keys pressed on page-list or panel buttons never act on the selected object', () => {
    const session = sessionFor();
    const execute = vi.spyOn(session, 'execute');
    const { container } = renderFather(session);
    select(container, 'shape-target');
    const pageButton = within(screen.getByRole('navigation', { name: 'Navegação de páginas' })).getByRole('button', { name: 'Página 1' });
    pageButton.focus();
    fireEvent.keyDown(pageButton, { key: 'Backspace' });
    fireEvent.keyDown(pageButton, { key: 'Delete' });
    fireEvent.keyDown(pageButton, { key: 'd', ctrlKey: true });
    const addPage = screen.getByRole('button', { name: 'Adicionar nova página após a página atual' });
    fireEvent.keyDown(addPage, { key: 'ArrowRight' });
    fireEvent.keyDown(addPage, { key: 'Delete' });
    expect(execute).not.toHaveBeenCalled();
    expect(frameOf(session, 'shape-target')).toMatchObject({ xMm: 88, yMm: 30 });
    expect(isSelected(container, 'shape-target')).toBe(true);
  });

  it('Ctrl+D with several objects selected explains that only one can be duplicated', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    const other = container.querySelector<HTMLElement>('[data-editor-object-id="shape-other"]')!;
    fireEvent.pointerDown(other, { pointerId: 91, button: 0, ctrlKey: true, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(other, { pointerId: 91, button: 0, clientX: 100, clientY: 100 });
    expect(isSelected(container, 'shape-target') && isSelected(container, 'shape-other')).toBe(true);
    const before = session.getSnapshot().document.pages[0].objects.length;
    expect(fireEvent.keyDown(other, { key: 'd', ctrlKey: true })).toBe(false);
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(before);
    expect(screen.getByText('Selecione um só objeto para duplicar.')).toBeInTheDocument();
  });
});

function envelope(document: CatalogDocument, remoteRevision = 1, lastMutationId = MUTATION_0): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id, remoteRevision, lastMutationId, title: document.title, locale: document.locale,
    createdAt: '2026-10-15T12:00:00.000Z', updatedAt: '2026-10-15T12:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999', updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null, documentSchemaVersion: 1, documentSnapshot: document,
  };
}

function persistedEditor(saveCAS: CatalogRepository['saveCAS']) {
  const unavailable = <T,>(): Promise<PersistenceResult<T>> => Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
  const repository: CatalogRepository = {
    listCatalogs: () => unavailable(), getCatalog: () => unavailable(), createCatalog: () => unavailable(),
    saveCAS, archiveCAS: () => unavailable(),
  };
  const document = fatherDocument(CATALOG_ID);
  const dependencies: ApplicationExecutionDependencies = { createId: ids('generated') };
  const session = createDocumentSession(document, dependencies);
  const runtime = new VNextPersistenceRuntime({
    session, repository, applicationDependencies: dependencies,
    createMutationId: () => MUTATION_1,
    createOpenSessionId: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    authLineage: 'user-a:0', authorityScopeId: 'user-a', binding: envelope(document),
  });
  const view = render(<VNextApp runtime={runtime} simpleByDefault />);
  return { runtime, session, container: view.container };
}

describe('FR-10 + FR-19 · Save is never blocked by a position/size field', () => {
  it('Ctrl+S while typing "42,5" applies it and saves the catalog', async () => {
    let request: SaveCatalogCasRequest | undefined;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return Promise.resolve({ ok: true as const, value: envelope(next.documentSnapshot, 2, next.mutationId) });
    });
    const { runtime, container } = persistedEditor(saveCAS);
    select(container, 'shape-target');
    openDetails();
    const x = field(container, 'x');
    fireEvent.focus(x);
    fireEvent.change(x, { target: { value: '42,5' } });
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);

    expect(fireEvent.keyDown(x, { key: 's', ctrlKey: true })).toBe(false);
    await waitFor(() => expect(saveCAS).toHaveBeenCalledTimes(1));
    expect(request?.documentSnapshot.pages[0].objects.find((object) => object.id === 'shape-target')?.frame.xMm).toBe(42.5);
    await waitFor(() => expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo'));
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
  });

  it('an invalid value is put back and Salvar is not refused', async () => {
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) =>
      Promise.resolve({ ok: true as const, value: envelope(next.documentSnapshot, 2, next.mutationId) }));
    const { runtime, session, container } = persistedEditor(saveCAS);
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'x'), { target: { value: 'abc' } });
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    const save = container.querySelector<HTMLButtonElement>('[data-persistence-save-action]');
    if (!save) throw new Error('Missing Salvar button');
    fireEvent.click(save);
    await waitFor(() => expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false));
    expect(runtime.workspace.getSnapshot().save.phase).not.toBe('blocked');
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(container.textContent).not.toContain('Inspector');
  });

  it('Ctrl+S when saving is not possible explains why instead of doing nothing', async () => {
    const saveCAS = vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'CONFLICT' as const } }));
    const { runtime, container } = persistedEditor(saveCAS);
    const hit = select(container, 'shape-target');
    fireEvent.keyDown(hit, { key: 'ArrowRight' });
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false);
    await waitFor(() => expect(runtime.workspace.getSnapshot().save.phase).toBe('conflict'));

    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false);
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Este catálogo mudou em outro lugar. Salve seu trabalho como uma cópia ou abra a versão mais recente.').length).toBeGreaterThan(0);
  });
});

describe('FR-11 · page menu inside the real editor', () => {
  it('deletes a page after confirmation and Ctrl+Z restores it', () => {
    const { session } = renderFather();
    fireEvent.click(screen.getByRole('button', { name: 'Opções da Página 2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir página…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Excluir a Página 2?' });
    expect(within(dialog).getByText('Ela tem 2 objetos: 1 texto e 1 forma.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir Página 2' }));
    expect(session.getSnapshot().document.pages.map((page) => page.id)).toEqual(['page-cover', 'page-extra']);
    expect(screen.getByText('Página 2 excluída. Para recuperar, use Desfazer.')).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(session.getSnapshot().document.pages.map((page) => page.id)).toEqual(['page-cover', 'page-specs', 'page-extra']);
  });

  it('moves the current page and keeps it open', () => {
    const { session, container } = renderFather();
    fireEvent.click(screen.getByRole('button', { name: 'Opções da Página 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para baixo' }));
    expect(session.getSnapshot().document.pages.map((page) => page.id)).toEqual(['page-specs', 'page-cover', 'page-extra']);
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', 'page-cover');
    expect(screen.getByText('Página 1 movida para baixo. Agora ela é a Página 2.')).toBeInTheDocument();
  });

  it('a page action right after an invalid value keeps the "value not used" notice', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'x'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opções da Página 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar página' }));
    expect(session.getSnapshot().document.pages).toHaveLength(4);
    expect(frameOf(session, 'shape-target')?.xMm).toBe(88);
    expect(screen.getByText(`Página 1 duplicada. A cópia é a Página 2. Para voltar, use Desfazer. ${DISCARDED_X}`)).toBeInTheDocument();
  });

  it('duplicating a page first applies a half-typed position value', () => {
    const { session, container } = renderFather();
    select(container, 'shape-target');
    openDetails();
    fireEvent.change(field(container, 'x'), { target: { value: '10,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opções da Página 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar página' }));
    const pages = session.getSnapshot().document.pages;
    expect(pages).toHaveLength(4);
    expect(frameOf(session, 'shape-target')?.xMm).toBe(10.25);
    expect(pages[1].objects.map((object) => object.frame.xMm)).toContain(10.25);
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', pages[1].id);
  });
});
