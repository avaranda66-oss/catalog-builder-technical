import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  NOTICE_CENTER_VARIABLE,
  NOTICE_MAX_WIDTH_VARIABLE,
  NOTICE_TOP_VARIABLE,
  noticeAnchorFor,
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
