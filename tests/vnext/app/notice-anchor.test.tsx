import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  NOTICE_CENTER_VARIABLE,
  NOTICE_MAX_WIDTH_VARIABLE,
  NOTICE_PLACEMENT_ATTRIBUTE,
  NOTICE_TOP_VARIABLE,
  noticeAnchorFor,
  placeNoticeAvoiding,
  useNoticeAnchor,
} from '@/vnext/app/editor/use-notice-anchor';

/**
 * Pendência da Onda 1 (FR-12 + FR-16b): the floating message must not cover "Página X de Y", the zoom
 * or the problems. It floats over the top edge of the page area, centred on the page column.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Rect = { left: number; top: number; width: number; height: number };
const box = ({ left, top, width, height }: Rect) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe('noticeAnchorFor (pure)', () => {
  // Message area right under the top bar (68 px), page column from x = 176 to x = 1066, page area starting at y = 170.
  const notices = box({ left: 0, top: 68, width: 1366, height: 0 });
  const column = box({ left: 176, top: 68, width: 890, height: 700 });
  const page = box({ left: 196, top: 170, width: 850, height: 598 });

  it('starts the message just under the line with "Página X de Y", the zoom and the problems', () => {
    expect(noticeAnchorFor(notices, page, column, 768)).toEqual({ top: 110, center: 621, maxWidth: 858 });
  });

  it('keeps the message on screen when the page area starts very low', () => {
    const low = box({ left: 196, top: 700, width: 850, height: 60 });
    expect(noticeAnchorFor(notices, low, column, 768)?.top).toBe(768 - 68 - 160);
  });

  it('never goes above the message area and keeps a readable width on a narrow column', () => {
    const above = box({ left: 196, top: 20, width: 850, height: 598 });
    const narrow = box({ left: 0, top: 68, width: 200, height: 700 });
    expect(noticeAnchorFor(notices, above, narrow, 768)).toEqual({ top: 4, center: 100, maxWidth: 240 });
  });

  it('leaves the stylesheet default when nothing can be measured', () => {
    expect(noticeAnchorFor(notices, page, box({ left: 0, top: 0, width: 0, height: 0 }), 768)).toBeUndefined();
  });
});

describe('placeNoticeAvoiding (P2 da J4: the message never covers what the person is about to edit)', () => {
  const notices = box({ left: 0, top: 68, width: 1366, height: 0 });
  const page = box({ left: 196, top: 170, width: 850, height: 598 });
  const anchor = { top: 110, center: 621, maxWidth: 858 };
  // The message as drawn: 720 px wide, centred on the page column, two lines and the "Fechar" button.
  const notice = { left: 261, right: 981, height: 76 };
  // "Ir até lá" selected the table at the top of the page: 6 rows, from y = 236 to y = 386.
  const table = { left: 262, right: 980, top: 236, bottom: 386 };

  it('stays over the top of the page when it covers nothing selected', () => {
    expect(placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { ...table, top: 400, bottom: 560 } }))
      .toEqual({ top: 110, placement: 'top' });
    // Beside the object, not over it.
    expect(placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { left: 990, right: 1040, top: 180, bottom: 300 } }))
      .toEqual({ top: 110, placement: 'top' });
    // Scrolled out of view.
    expect(placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { ...table, top: -300, bottom: 150 } }))
      .toEqual({ top: 110, placement: 'top' });
  });

  it('goes right under the selected table, inside the window', () => {
    const placed = placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: table });
    expect(placed).toEqual({ top: 386 + 8 - 68, placement: 'below-selection' });
    expect(68 + placed.top + notice.height).toBeLessThanOrEqual(768);
  });

  it('goes to the bottom of the page area when only that is free of the table', () => {
    // The table ends 4 px above the lowest place, so there is no room right under it but the bottom does not touch it.
    const placed = placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { ...table, top: 180, bottom: 680 } });
    expect(placed).toEqual({ top: 768 - 8 - 76 - 68, placement: 'bottom' });
  });

  it('a table as tall as the page area (J5, 41 rows): the message joins the layout instead of floating over it', () => {
    // Every floating place would cover part of the table, and a card over the table takes the click meant for it.
    expect(placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { ...table, top: 180, bottom: 700 } }))
      .toEqual({ top: 110, placement: 'inline' });
    expect(placeNoticeAvoiding(anchor, notices, page, 768, { notice, selection: { ...table, top: 100, bottom: 900 } }))
      .toEqual({ top: 110, placement: 'inline' });
  });
});

function Harness() {
  const anchor = React.useRef<HTMLDivElement>(null);
  useNoticeAnchor(anchor);
  return (
    <div className="vnext-shell">
      <div className="vnext-editor-notices" data-editor-notices="" />
      <main className="vnext-canvas-area">
        <div ref={anchor} className="vnext-canvas-meta">Página 1 de 1</div>
        <div className="vnext-document-preview" />
      </main>
    </div>
  );
}

describe('useNoticeAnchor', () => {
  it('publishes where the page area starts on the message area, and follows the window size', async () => {
    const rects = new Map<string, Rect>([
      ['vnext-editor-notices', { left: 0, top: 68, width: 1366, height: 0 }],
      ['vnext-canvas-area', { left: 176, top: 68, width: 890, height: 700 }],
      ['vnext-document-preview', { left: 196, top: 170, width: 850, height: 598 }],
    ]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects.get(this.className) ?? { left: 0, top: 0, width: 0, height: 0 };
      return { ...box(rect), x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect;
    });
    const { container } = render(<Harness />);
    const notices = container.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).toBe('110px');
    expect(notices.style.getPropertyValue(NOTICE_CENTER_VARIABLE)).toBe('621px');
    expect(notices.style.getPropertyValue(NOTICE_MAX_WIDTH_VARIABLE)).toBe('858px');

    // A toolbar opens above the page: the page area starts lower, the message follows.
    rects.set('vnext-document-preview', { left: 196, top: 230, width: 850, height: 538 });
    act(() => { window.dispatchEvent(new Event('resize')); });
    await waitFor(() => expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).toBe('170px'));
  });

  it('moves an open message off the table "Ir até lá" selected, and back when the selection goes', async () => {
    const rects = new Map<string, Rect>([
      ['vnext-editor-notices', { left: 0, top: 68, width: 1366, height: 0 }],
      ['vnext-canvas-area', { left: 176, top: 68, width: 890, height: 700 }],
      ['vnext-document-preview', { left: 196, top: 170, width: 850, height: 598 }],
      ['vnext-editor-notice', { left: 261, top: 178, width: 720, height: 76 }],
      ['table-hit', { left: 262, top: 236, width: 718, height: 150 }],
    ]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects.get(this.className) ?? { left: 0, top: 0, width: 0, height: 0 };
      return { ...box(rect), x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect;
    });
    function WithNotice() {
      const anchor = React.useRef<HTMLDivElement>(null);
      const [selected, setSelected] = React.useState(true);
      useNoticeAnchor(anchor);
      return (
        <div className="vnext-shell">
          <div className="vnext-editor-notices" data-editor-notices="">
            <div className="vnext-editor-notice" role="status" data-editor-notice="">
              <p>Esta tabela tem 6 linhas vazias, que sairão em branco no PDF.</p>
              <button type="button">Fechar</button>
            </div>
          </div>
          <main className="vnext-canvas-area">
            <div ref={anchor} className="vnext-canvas-meta">Página 2 de 2</div>
            <div className="vnext-document-preview">
              <div className="table-hit" data-editor-object-id="table" data-selected={selected ? 'true' : 'false'} />
            </div>
            <button type="button" onClick={() => setSelected(false)}>Desmarcar</button>
          </main>
        </div>
      );
    }
    const { container, getByRole } = render(<WithNotice />);
    const notices = container.querySelector<HTMLElement>('[data-editor-notices]')!;
    // Right under the table: the cells stay visible and clickable, the message stays on screen with "Fechar".
    expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).toBe(`${386 + 8 - 68}px`);
    expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'below-selection');
    expect(getByRole('status')).toHaveTextContent('Esta tabela tem 6 linhas vazias');
    expect(getByRole('button', { name: 'Fechar' })).toBeVisible();

    act(() => { getByRole('button', { name: 'Desmarcar' }).click(); });
    await waitFor(() => expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'top'));
    expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).toBe('110px');
  });

  it('J5: a table as tall as the page area puts the message in the layout, keeps it there while it is open, and frees it when it goes', async () => {
    const rects = new Map<string, Rect>([
      ['vnext-editor-notices', { left: 0, top: 68, width: 1366, height: 0 }],
      ['vnext-canvas-area', { left: 176, top: 68, width: 890, height: 700 }],
      ['vnext-document-preview', { left: 196, top: 170, width: 850, height: 598 }],
      ['vnext-editor-notice', { left: 261, top: 178, width: 720, height: 76 }],
      ['table-hit', { left: 262, top: 180, width: 718, height: 900 }],
    ]);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const rect = rects.get(this.className) ?? { left: 0, top: 0, width: 0, height: 0 };
      return { ...box(rect), x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect;
    });
    function LongTable() {
      const anchor = React.useRef<HTMLDivElement>(null);
      const [message, setMessage] = React.useState<string | null>('Tabela criada com 41 linhas e 4 colunas.');
      const [selected, setSelected] = React.useState(true);
      useNoticeAnchor(anchor);
      return (
        <div className="vnext-shell">
          <div className="vnext-editor-notices" data-editor-notices="">
            {message && (
              <div key={message} className="vnext-editor-notice" role="status" data-editor-notice="">
                <p>{message}</p>
                <button type="button" onClick={() => setMessage(null)}>Fechar aviso</button>
              </div>
            )}
          </div>
          <main className="vnext-canvas-area">
            <div ref={anchor} className="vnext-canvas-meta">Página 1 de 1</div>
            <div className="vnext-document-preview">
              <div className="table-hit" data-editor-object-id="table" data-selected={selected ? 'true' : 'false'} />
            </div>
            <button type="button" onClick={() => setSelected(false)}>Desmarcar</button>
            <button type="button" onClick={() => setMessage('Objeto excluído.')}>Outro aviso</button>
          </main>
        </div>
      );
    }
    const { container, getByRole } = render(<LongTable />);
    const notices = container.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'inline');
    expect(getByRole('status')).toHaveTextContent('Tabela criada com 41 linhas');

    // The page moved when the message joined the layout, and the person deselects: the message does not jump back over it.
    act(() => { getByRole('button', { name: 'Desmarcar' }).click(); });
    await new Promise((resolveFrame) => setTimeout(resolveFrame, 60));
    expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'inline');

    // Closed: nothing is in the layout any more.
    act(() => { getByRole('button', { name: 'Fechar aviso' }).click(); });
    await waitFor(() => expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'top'));

    // The next message is measured again: with nothing selected it floats at the top.
    act(() => { getByRole('button', { name: 'Outro aviso' }).click(); });
    await waitFor(() => expect(getByRole('status')).toHaveTextContent('Objeto excluído.'));
    expect(notices).toHaveAttribute(NOTICE_PLACEMENT_ATTRIBUTE, 'top');
  });

  it('removes its variables when the editor closes', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      ({ ...box({ left: 0, top: 0, width: 800, height: 600 }), x: 0, y: 0, toJSON: () => ({}) } as DOMRect));
    const shell = document.createElement('div');
    document.body.append(shell);
    const { unmount } = render(<Harness />, { container: shell });
    const notices = shell.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).not.toBe('');
    unmount();
    expect(notices.style.getPropertyValue(NOTICE_TOP_VARIABLE)).toBe('');
    shell.remove();
  });

  it('is used by the stylesheet only on a computer screen, with the old place as the fallback', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/styles.css'), 'utf8');
    const rule = css.match(/@media \(min-width: 901px\) \{[^@]*?\.vnext-shell \.vnext-editor-notice \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain(`top: calc(100% + var(${NOTICE_TOP_VARIABLE}, 4px))`);
    expect(rule).toContain(`left: var(${NOTICE_CENTER_VARIABLE}, 50%)`);
    expect(rule).toContain(`var(${NOTICE_MAX_WIDTH_VARIABLE}, calc(100% - 40px))`);
  });
});
