import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { IssuesPanel } from '@/vnext/app/editor/IssuesPanel';
import { issueFixFor } from '@/vnext/app/editor/issue-fixes';
import { TableContinuationSection } from '@/vnext/app/editor/TableContinuationSection';
import { VNextApp } from '@/vnext/app/VNextApp';
import { mmToU, uToQ, type CatalogDocument, type Diagnostic, type TableObject } from '@/vnext/domain';
import type { LayoutSnapshot, PhysicalLayoutFact } from '@/vnext/rendering';
import type { FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';
import {
  SPLIT_OBJECT_ID,
  SPLIT_PAGE_ID,
  documentWithTable,
  longTable,
  measureTable,
} from '../editor/table-split-fixtures';

/**
 * FR-35 in the editor the father uses (simple mode): "Continuar na próxima página" in the table panel and as the
 * one-click fix of the problem list. In the real editor below, only the browser measurement is replaced (jsdom has
 * no layout): every table row measures 8 mm, as the fixture rows do.
 */

const ROW_MM = 8;
const TITLE_MM = 6;

/** What the browser would measure for every table of the catalog: 8 mm rows, 6 mm for a title. */
function measuredSnapshot(document: CatalogDocument): LayoutSnapshot {
  const facts: PhysicalLayoutFact[] = [];
  for (const page of document.pages) for (const object of page.objects) {
    if (object.type !== 'table') continue;
    const table = object.table;
    const titleQ = table.title ? uToQ(mmToU(TITLE_MM)) : 0;
    const boundaries = table.rows.map((_, index) => uToQ(mmToU(ROW_MM * index)));
    boundaries.push(uToQ(mmToU(ROW_MM * table.rows.length)));
    facts.push({
      kind: 'table', pageId: page.id, objectId: object.id, tableId: table.id, frameWidthU: mmToU(object.frame.widthMm), columnWidthsU: [],
      frameQ: uToQ(mmToU(object.frame.widthMm)), trackQ: [], gridOffsetYQ: titleQ, renderedIntrinsicHeightQ: titleQ + boundaries[boundaries.length - 1],
    });
    table.rows.forEach((row, index) => facts.push({
      kind: 'row', pageId: page.id, tableId: table.id, rowId: row.id, resolvedHeightU: mmToU(ROW_MM), yQ: boundaries[index],
      heightQ: boundaries[index + 1] - boundaries[index],
    }));
    if (table.title) facts.push({ kind: 'tableTitle', pageId: page.id, tableId: table.id, intrinsicContentHeightQ: titleQ - uToQ(mmToU(1)), xQ: 0, yQ: 0, widthQ: 100, heightQ: titleQ - uToQ(mmToU(1)) });
  }
  return { facts, geometryDiagnostics: [] };
}

vi.mock('@/vnext/rendering/measurement', async (original) => {
  const actual = await original<typeof import('@/vnext/rendering/measurement')>();
  return { ...actual, captureSnapshot: vi.fn(async (document: CatalogDocument) => measuredSnapshot(document)) };
});

afterEach(cleanup);

const overflow = (code = 'TABLE_CONTENT_OVERFLOW'): Diagnostic => ({ code, severity: 'ERROR', details: '', pageId: SPLIT_PAGE_ID, objectId: SPLIT_OBJECT_ID });

function sessionFor(document: CatalogDocument): DocumentSession {
  return createDocumentSession(document, { createId: () => crypto.randomUUID() });
}

function tables(document: CatalogDocument): TableObject[] {
  return document.pages.flatMap((page) => page.objects.filter((object): object is TableObject => object.type === 'table'));
}

describe('FR-35 one-click fix in the problem list', () => {
  it('a table too tall for its page is offered "Continuar na próxima página" instead of a height that leaves the page', () => {
    const document = documentWithTable(longTable({ bodyRows: 39 }));
    const session = sessionFor(document);
    const current = session.getSnapshot().document;
    const measurement = measureTable(current);
    const fix = issueFixFor({ document: current, session, diagnostic: overflow(), measurement });
    expect(fix?.label).toBe('Continuar na próxima página');
    // A frame dragged past the bottom of the page gets the same fix.
    expect(issueFixFor({ document: current, session, diagnostic: overflow('OBJECT_OUTSIDE_PAGE'), measurement })?.label).toBe('Continuar na próxima página');
    // Without a measurement of this exact catalog nothing is offered.
    expect(issueFixFor({ document: current, session, diagnostic: overflow(), measurement: null })).toBeUndefined();

    const outcome = fix!.run({ document: current, session, diagnostic: overflow(), measurement });
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/^\d+ linhas movidas para a página 2, com o cabeçalho repetido\. Use Desfazer se precisar\.$/);
    expect(session.getSnapshot().document.pages).toHaveLength(3);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(current);
  });

  it('a table that fits on its page keeps the height fix, and other objects are not offered the continuation', () => {
    const document = documentWithTable(longTable({ bodyRows: 10 }), { xMm: 20, yMm: 20, widthMm: 170, heightMm: 40 });
    const session = sessionFor(document);
    const current = session.getSnapshot().document;
    const measurement = measureTable(current);
    expect(issueFixFor({ document: current, session, diagnostic: overflow(), measurement })?.label).toBe('Ajustar altura da tabela');
    expect(issueFixFor({ document: current, session, diagnostic: overflow('OBJECT_OUTSIDE_PAGE'), measurement })).toBeUndefined();
    expect(issueFixFor({ document: current, session, diagnostic: { ...overflow('OBJECT_OUTSIDE_PAGE'), objectId: 'missing' }, measurement })).toBeUndefined();
  });

  it('the list button runs it once and the message says where the rows went', () => {
    const document = documentWithTable(longTable({ bodyRows: 68 }));
    const session = sessionFor(document);
    const current = session.getSnapshot().document;
    const onMessage = vi.fn();
    render(<IssuesPanel document={current} diagnostics={[overflow()]} simple onLocate={vi.fn()} session={session}
      measurement={measureTable(current)} prepare={() => true} onMessage={onMessage} />);
    fireEvent.click(screen.getByRole('button', { name: /Problemas do catálogo/ }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Continuar na próxima página' })); });
    expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/linhas movidas para as páginas 2 e 3, com o cabeçalho repetido/));
    expect(tables(session.getSnapshot().document)).toHaveLength(3);
  });
});

describe('FR-35 "Tabela maior que a página" in the table panel', () => {
  function section(document: CatalogDocument, measurement: FitHeightMeasurement | null = measureTable(document), prepare = () => true) {
    const session = sessionFor(document);
    const current = session.getSnapshot().document;
    const onMessage = vi.fn();
    const table = tables(current)[0];
    const view = render(<TableContinuationSection session={session} document={current} measurement={measurement === null ? null : { ...measurement, source: current }}
      prepare={prepare} onMessage={onMessage} tableObject={table} />);
    return { view, session, current, onMessage };
  }

  it('explains it in plain words and one click takes the rows that do not fit to a new page', async () => {
    const { session, current, onMessage } = section(documentWithTable(longTable({ bodyRows: 39 })));
    const region = screen.getByRole('region', { name: 'Tabela maior que a página' });
    expect(region).toHaveTextContent('Esta tabela não cabe inteira nesta página. As linhas que sobram vão para 1 página nova, logo depois desta, com o cabeçalho repetido.');
    const button = within(region).getByRole('button', { name: 'Continuar na próxima página' });
    expect(button).toBeEnabled();
    // Before the click: the line under the button says how to go back.
    expect(button).toHaveAccessibleDescription('Se precisar, use Desfazer para voltar como estava.');
    expect(within(region).getByRole('status')).toBeEmptyDOMElement();
    fireEvent.click(button);
    expect(region).toHaveAttribute('aria-busy', 'true');
    // Said out loud too: the work is announced by the status line that was already there.
    expect(within(region).getByRole('status')).toHaveTextContent('Levando as linhas para a próxima página…');
    await waitFor(() => expect(session.getSnapshot().document.pages).toHaveLength(3));
    expect(onMessage).toHaveBeenCalledWith({ tone: 'success', text: expect.stringMatching(/linhas movidas para a página 2/) });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(current);
  });

  it('says how many new pages a very long table needs', () => {
    section(documentWithTable(longTable({ bodyRows: 68 })));
    expect(screen.getByRole('region', { name: 'Tabela maior que a página' })).toHaveTextContent('vão para 2 páginas novas');
  });

  it('writes out why it cannot help yet, and stays away when the table fits', () => {
    const tall = documentWithTable(longTable({ bodyRows: 39 }));
    section(tall, measureTable(tall, { rowHeightMm: (_, index) => index === 3 ? 290 : 8 }));
    const button = screen.getByRole('button', { name: 'Continuar na próxima página' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Uma linha desta tabela, ou um grupo de linhas mescladas, é mais alta que uma página inteira/);
    cleanup();

    const locked = documentWithTable(longTable({ bodyRows: 39 }), undefined, { locked: true });
    section(locked);
    expect(screen.getByRole('button', { name: 'Continuar na próxima página' })).toHaveAccessibleDescription('A tabela está bloqueada. Desbloqueie a tabela para continuar na próxima página.');
    cleanup();

    const { view } = section(documentWithTable(longTable({ bodyRows: 10 })));
    expect(view.container).toBeEmptyDOMElement();
    cleanup();
    const measuring = section(documentWithTable(longTable({ bodyRows: 39 })), null);
    expect(measuring.view.container).toBeEmptyDOMElement();
  });

  it('stays in place, with the button off, while the page is measured again after an edit, and goes away once the table fits', () => {
    const session = sessionFor(documentWithTable(longTable({ bodyRows: 39 })));
    const current = session.getSnapshot().document;
    const props = { session, prepare: () => true, onMessage: vi.fn() };
    const view = render(<TableContinuationSection {...props} document={current} measurement={measureTable(current)} tableObject={tables(current)[0]} />);
    const region = screen.getByRole('region', { name: 'Tabela maior que a página' });
    const button = within(region).getByRole('button', { name: 'Continuar na próxima página' });
    expect(button).toBeEnabled();

    // Any edit (here the catalog name) makes the editor measure the page again.
    expect(session.execute({ type: 'document.rename', title: 'Termômetros PRESYS' }).ok).toBe(true);
    const renamed = session.getSnapshot().document;
    view.rerender(<TableContinuationSection {...props} document={renamed} measurement={null} tableObject={tables(renamed)[0]} />);
    // Same section, same place: nothing below it moves under the mouse.
    expect(screen.getByRole('region', { name: 'Tabela maior que a página' })).toBe(region);
    expect(region).toHaveTextContent('As linhas que sobram vão para 1 página nova');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Medindo a tabela…');

    // Measured again and still too tall: the button is back.
    view.rerender(<TableContinuationSection {...props} document={renamed} measurement={measureTable(renamed)} tableObject={tables(renamed)[0]} />);
    expect(button).toBeEnabled();

    // Another table selected while the page is measured: the section is not carried over to it.
    const otherTable = tables(renamed)[0];
    const other: TableObject = { ...otherTable, id: 'other-table', table: { ...otherTable.table, id: 'other-table-model' } };
    const withOther: CatalogDocument = { ...renamed, pages: [renamed.pages[0], { ...renamed.pages[1], objects: [other] }] };
    view.rerender(<TableContinuationSection {...props} document={withOther} measurement={null} tableObject={other} />);
    expect(screen.queryByRole('region', { name: 'Tabela maior que a página' })).toBeNull();

    // Back on the table: the rows now measure short enough, so it fits and the section goes away.
    view.rerender(<TableContinuationSection {...props} document={renamed} measurement={measureTable(renamed)} tableObject={tables(renamed)[0]} />);
    expect(screen.getByRole('region', { name: 'Tabela maior que a página' })).toBeInTheDocument();
    view.rerender(<TableContinuationSection {...props} document={renamed} measurement={measureTable(renamed, { rowHeightMm: 2 })} tableObject={tables(renamed)[0]} />);
    expect(screen.queryByRole('region', { name: 'Tabela maior que a página' })).toBeNull();
    // Measuring again after that does not bring it back.
    view.rerender(<TableContinuationSection {...props} document={renamed} measurement={null} tableObject={tables(renamed)[0]} />);
    expect(view.container).toBeEmptyDOMElement();
  });

  it('does nothing when an open edit cannot be finished first', async () => {
    const { session, current, onMessage } = section(documentWithTable(longTable({ bodyRows: 39 })), undefined, () => false);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar na próxima página' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session.getSnapshot().document).toBe(current);
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('FR-35 in the real editor (simple mode)', () => {
  let restoreMeasurement = () => {};
  afterEach(() => restoreMeasurement());
  beforeEach(() => {
    // The same browser stand-ins as the table panel tests: no transform, images already decoded.
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
    restoreMeasurement = () => {
      computedStyle.mockRestore();
      HTMLImageElement.prototype.decode = originalDecode;
      Range.prototype.getClientRects = originalRects;
    };
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

  function selectTable(container: HTMLElement) {
    const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
    if (page) page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
    const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${SPLIT_OBJECT_ID}"]`);
    if (!hit) throw new Error('Missing table hit target');
    fireEvent.pointerDown(hit, { pointerId: 35, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(hit, { pointerId: 35, button: 0, clientX: 100, clientY: 100 });
  }

  const panel = () => screen.getByRole('complementary', { name: 'Propriedades do objeto' });

  it('panel button: a 40-row table continues on page 2 with its header, the problem goes away, and one Ctrl+Z undoes it all', async () => {
    const session = sessionFor(documentWithTable(longTable({ bodyRows: 39, title: 'Faixas de medição' })));
    const before = session.getSnapshot().document;
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    // The frame is shorter than the rows: the editor counts the problem once the page is measured.
    await screen.findByRole('button', { name: /^Problemas do catálogo: 1 a corrigir/ }, { timeout: 5_000 });
    selectTable(container);
    const region = await within(panel()).findByRole('region', { name: 'Tabela maior que a página' }, { timeout: 5_000 });
    // "Problemas da tabela" does not offer a height that would leave the page (the frame would only grow past it),
    // although the height was measured and found taller than the page (the advisory in "Detalhes da tabela").
    fireEvent.click(panel().querySelector<HTMLButtonElement>('[data-editor-action="toggle-table-inspector-advanced"]')!);
    expect(panel().querySelector('[data-fit-height-page-advisory]')).not.toBeNull();
    // The list opens by itself for a table with problems (FR-13).
    expect(panel().querySelector('[data-editor-action="toggle-diagnostics"]')).toHaveAttribute('aria-expanded', 'true');
    const problems = panel().querySelector<HTMLElement>('[data-editor-diagnostics]')!;
    expect(problems.querySelector('[data-diagnostic-codes*="TABLE_CONTENT_OVERFLOW"]')).not.toBeNull();
    expect(within(problems).queryByRole('button', { name: 'Ajustar altura' })).toBeNull();
    const button = within(region).getByRole('button', { name: 'Continuar na próxima página' });
    fireEvent.click(button);
    await waitFor(() => expect(session.getSnapshot().document.pages).toHaveLength(3));
    // The keyboard stays on the table that was cut (the section goes away once the table fits).
    expect(document.activeElement).toBe(container.querySelector(`[data-editor-object-id="${SPLIT_OBJECT_ID}"]`));

    const after = session.getSnapshot().document;
    const [original, continuation] = tables(after);
    expect(after.pages[1].objects).toEqual([continuation]);
    expect(original.table.rows[0].role).toBe('header');
    expect(continuation.table.rows[0].role).toBe('header');
    const notices = container.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(within(notices).getByRole('status')).toHaveTextContent(/linhas movidas para a página 2, com o cabeçalho repetido\. Use Desfazer se precisar\./);
    // Measured again: both parts fit their pages, so nothing is left to fix.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Problemas do catálogo/ })).toBeNull(), { timeout: 5_000 });

    fireEvent.keyDown(container.querySelector('[data-vnext-shell]')!, { key: 'z', ctrlKey: true });
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('problem list: a 69-row table becomes three parts with one click, and Desfazer brings back the single table', async () => {
    const session = sessionFor(documentWithTable(longTable({ bodyRows: 68 })));
    const before = session.getSnapshot().document;
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const counter = await screen.findByRole('button', { name: /^Problemas do catálogo: 1 a corrigir/ }, { timeout: 5_000 });
    fireEvent.click(counter);
    const list = screen.getByRole('dialog', { name: 'Problemas do catálogo' });
    act(() => { fireEvent.click(within(list).getByRole('button', { name: 'Continuar na próxima página' })); });
    expect(tables(session.getSnapshot().document)).toHaveLength(3);
    expect(session.getSnapshot().document.pages).toHaveLength(4);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="undo"]')!);
    expect(session.getSnapshot().document).toEqual(before);
  });
});
