import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import type { CatalogDocument, TableModel, TableObject } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { createW4DTableDocument, W4D_OBJECT_B_ID } from '../proof/fixtures/w4d-table-document';

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

function sessionWith(document: CatalogDocument = createW2CDemoDocument(ids('doc'))) {
  return createDocumentSession(document, {
    createId: ids('generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(`[data-editor-action="${action}"]`);
  if (!element) throw new Error(`Missing editor action ${action}`);
  return element;
}

function tables(document: CatalogDocument): TableObject[] {
  return document.pages[0].objects.filter((object): object is TableObject => object.type === 'table');
}

function textAt(table: TableModel, row: number, column: number): string {
  const cell = table.cells.find((entry) => entry.rowId === table.rows[row].id && entry.columnId === table.columns[column].id);
  if (!cell || cell.content.type !== 'richText') return '';
  return cell.content.value.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '').join('')).join('\n');
}

function clipboard(text: string) {
  return { clipboardData: { types: ['text/plain'], getData: (type: string) => (type === 'text/plain' ? text : '') } };
}

/** 12 × 4 block exactly as Excel puts it on the clipboard (CRLF and a final line break). */
const excel12x4 = [
  'Modelo\tFaixa\tExatidão\tSaída',
  ...Array.from({ length: 11 }, (_, index) => `TA-${index + 1}N\t-25 °C a ${140 + index} °C\t±0,1 °C\t4 a 20 mA`),
].join('\r\n') + '\r\n';

function status(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[role="status"]');
  if (!element) throw new Error('Missing status message');
  return element;
}

function preview(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('.vnext-document-preview');
  if (!element) throw new Error('Missing page preview');
  return element;
}

describe('FR-31 tabela nova útil', () => {
  it('adds a 6 × 3 table with header, house preset and the usable page width', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    fireEvent.click(button(container, 'add-table'));
    const [created] = tables(session.getSnapshot().document);
    expect(created.table.rows).toHaveLength(6);
    expect(created.table.columns).toHaveLength(3);
    expect(created.table.rows[0].role).toBe('header');
    expect(created.table.style.rowRoles.header).toMatchObject({ fontWeight: 700, color: '#FFFFFF' });
    expect(created.frame).toMatchObject({ xMm: 12, widthMm: 186 });
    expect(created.frame.heightMm).toBeGreaterThan(40);
    expect(created.frame.heightMm).toBeLessThan(60);
    expect(status(container)).toHaveTextContent('Tabela de 6 linhas × 3 colunas adicionada, com a primeira linha como cabeçalho.');
    // A finished change, even with the "clique em Editar tabela" tip: green and it leaves by itself.
    expect(status(container)).toHaveAttribute('data-tone', 'success');
    // The size panel starts with the same useful default.
    fireEvent.click(button(container, 'new-table-size'));
    expect(screen.getByLabelText('Linhas da nova tabela')).toHaveValue(6);
    expect(screen.getByLabelText('Colunas da nova tabela')).toHaveValue(3);
  });

  it('places a second new table below the first instead of on top of it', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    fireEvent.click(button(container, 'add-table'));
    fireEvent.click(button(container, 'add-table'));
    const [first, second] = tables(session.getSnapshot().document);
    expect(second.frame.yMm).toBeGreaterThanOrEqual(first.frame.yMm + first.frame.heightMm);
  });
});

describe('FR-31 colar do Excel cria a tabela', () => {
  it('Ctrl+V of a 12 × 4 Excel block on an empty page creates the table in one undoable step', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const before = session.getSnapshot();
    fireEvent.paste(preview(container), clipboard(excel12x4));
    const after = session.getSnapshot();
    const [created] = tables(after.document);
    expect(created.table.rows).toHaveLength(12);
    expect(created.table.columns).toHaveLength(4);
    expect(created.table.rows[0].role).toBe('header');
    expect(textAt(created.table, 0, 2)).toBe('Exatidão');
    expect(textAt(created.table, 1, 2)).toBe('±0,1 °C');
    expect(textAt(created.table, 11, 1)).toBe('-25 °C a 150 °C');
    expect(created.frame.widthMm).toBe(186);
    expect(after.localSequence).toBe(before.localSequence + 1);
    expect(status(container)).toHaveTextContent('Tabela criada com 12 linhas e 4 colunas. A primeira linha virou o cabeçalho, em destaque. Para voltar, use Desfazer.');
    // Not a red error that stays: the father must not think the paste failed and undo his own work.
    expect(status(container)).toHaveAttribute('data-tone', 'success');
    expect(container.querySelector(`[data-editor-object-id="${created.id}"]`)).toHaveAttribute('data-selected', 'true');
    fireEvent.click(button(container, 'undo'));
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it('also works when nothing is focused (paste lands on the page body)', () => {
    const session = sessionWith();
    render(<VNextApp session={session} simpleByDefault />);
    fireEvent.paste(document.body, clipboard('Característica\tValor\nFaixa\t-25 a 140 °C'));
    const [created] = tables(session.getSnapshot().document);
    expect(created.table.rows.map((row) => row.role)).toEqual(['header', 'body']);
  });

  it('ignores ordinary text, pastes into form fields and Excel blocks while a table is selected', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const start = session.getSnapshot().localSequence;
    fireEvent.paste(preview(container), clipboard('Um parágrafo\nsem colunas'));
    expect(session.getSnapshot().localSequence).toBe(start);

    fireEvent.click(button(container, 'paste-table-from-excel'));
    fireEvent.paste(screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' }), clipboard('A\tB'));
    expect(session.getSnapshot().localSequence).toBe(start);
    fireEvent.click(within(screen.getByRole('region', { name: 'Colar tabela do Excel' })).getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(button(container, 'add-table'));
    const selected = session.getSnapshot().localSequence;
    fireEvent.paste(preview(container), clipboard('A\tB\n1\t2'));
    expect(session.getSnapshot().localSequence).toBe(selected);
    expect(status(container)).toHaveTextContent('Para colar dentro desta tabela, clique em Editar tabela');
  });

  it('"Colar tabela do Excel" opens the paste box, previews and creates the table without the header when unchecked', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const open = screen.getByRole('button', { name: 'Colar tabela do Excel' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Cole aqui (Ctrl+V)' }), { target: { value: excel12x4 } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'A primeira linha é o cabeçalho (fica em destaque)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar tabela' }));
    const [created] = tables(session.getSnapshot().document);
    expect(created.table.rows.every((row) => row.role === 'body')).toBe(true);
    expect(textAt(created.table, 0, 0)).toBe('Modelo');
    expect(screen.queryByRole('region', { name: 'Colar tabela do Excel' })).toBeNull();
    expect(button(container, 'paste-table-from-excel')).toHaveAttribute('aria-expanded', 'false');
  });

  it('refuses a paste wider than an A4 page with a clear message and no change', () => {
    const session = sessionWith();
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const before = session.getSnapshot();
    fireEvent.paste(preview(container), clipboard(Array.from({ length: 12 }, (_, index) => `C${index}`).join('\t')));
    expect(session.getSnapshot().document).toEqual(before.document);
    expect(status(container)).toHaveTextContent('A tabela copiada tem 12 colunas. Numa página A4 cabem no máximo 10.');
  });
});

function enableTransformFreePhysicalMeasurement() {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = nativeGetComputedStyle(element, pseudoElement);
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
  const originalGetClientRects = Range.prototype.getClientRects;
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  return () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalGetClientRects;
  };
}

async function enterMeasuredTableGrid(container: HTMLElement, tableId: string): Promise<void> {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${tableId}"]`);
  if (!hit) throw new Error('Missing Table hit target');
  fireEvent.pointerDown(hit, { pointerId: 801, button: 0, clientX: 120, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 801, button: 0, clientX: 120, clientY: 100 });
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]')!;
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(button(container, 'edit-table'));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
  }, { timeout: 5_000 });
}

function tableB(document: CatalogDocument): TableModel {
  const object = document.pages[0].objects.find((entry) => entry.id === W4D_OBJECT_B_ID);
  if (!object || object.type !== 'table') throw new Error('Missing W4.D table B');
  return object.table;
}

describe('FR-31 colar maior que a grade aumenta a tabela', () => {
  it('offers "Adicionar 2 linhas e 1 coluna e colar" and does it in one undoable transaction', async () => {
    const session = sessionWith(createW4DTableDocument());
    const restore = enableTransformFreePhysicalMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      await enterMeasuredTableGrid(container, W4D_OBJECT_B_ID);
      const cell = container.querySelector<HTMLElement>('[data-table-cell="3:3"]')!;
      fireEvent.pointerDown(cell, { pointerId: 802, button: 0 });
      fireEvent.pointerUp(cell, { pointerId: 802, button: 0 });
      fireEvent.click(cell);
      fireEvent.click(button(container, 'paste-table-cells'));
      const textarea = container.querySelector<HTMLTextAreaElement>('[data-table-paste-textarea]')!;
      expect(textarea.placeholder).toBe('Ex.: Produto\tFaixa\nTA-25N\t-25 °C a 140 °C');
      fireEvent.change(textarea, { target: { value: '±0,1 °C\tA\nB\tC\nD\tE' } });
      const before = session.getSnapshot();
      fireEvent.click(button(container, 'apply-native-table-paste'));
      expect(session.getSnapshot().document).toEqual(before.document);
      expect(status(container)).toHaveTextContent('Nada foi alterado.');
      const grow = screen.getByRole('button', { name: 'Adicionar 2 linhas e 1 coluna e colar' });

      fireEvent.click(grow);
      const grown = tableB(session.getSnapshot().document);
      expect(grown.rows).toHaveLength(6);
      expect(grown.columns).toHaveLength(5);
      expect(textAt(grown, 3, 3)).toBe('±0,1 °C');
      expect(textAt(grown, 5, 4)).toBe('E');
      expect(status(container)).toHaveTextContent('Tabela aumentada em 2 linhas e 1 coluna e 6 células coladas. Para voltar, use Desfazer.');
      expect(status(container)).toHaveAttribute('data-tone', 'success');
      // The new rows need room: the measured "Ajustar altura" is queued in the same undo step as the paste.
      expect(preview(container)).toHaveAttribute('data-table-auto-fit', 'pending');
      expect(screen.queryByRole('region', { name: 'Colar dados maiores que a tabela' })).toBeNull();
      expect(container.querySelector('[data-table-paste-textarea]')).toBeNull();

      fireEvent.click(button(container, 'undo'));
      expect(session.getSnapshot().document).toEqual(before.document);
    } finally {
      restore();
    }
  });
});
