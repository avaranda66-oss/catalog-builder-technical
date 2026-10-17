/**
 * FR-16b (pendência da Onda 1): where the floating editor message of FR-12 appears.
 *
 * The message used to float centred right under the top bar, over "Página N de M", the zoom and
 * the problems counter, for up to 4 s. On a computer screen the toolbars above the page are now
 * fixed (only the page scrolls), so this hook measures where the page area starts and publishes
 * three CSS variables on the message area (`[data-editor-notices]`):
 * - `--vnext-notice-top`: distance from the message area to the top of the page area;
 * - `--vnext-notice-center`: horizontal centre of the page column;
 * - `--vnext-notice-max-width`: width of the page column, minus a margin.
 * styles.css uses them (only above 900 px) to float the message over the top edge of the page,
 * still under the top bars and without moving anything. Below 900 px the message keeps its place
 * under the top bar.
 */
import { useLayoutEffect, type RefObject } from 'react';

export const NOTICE_TOP_VARIABLE = '--vnext-notice-top';
export const NOTICE_CENTER_VARIABLE = '--vnext-notice-center';
export const NOTICE_MAX_WIDTH_VARIABLE = '--vnext-notice-max-width';
const NOTICE_GAP_PX = 8;
const NOTICE_SIDE_MARGIN_PX = 32;
const NOTICE_MIN_WIDTH_PX = 240;

export interface NoticeAnchor {
  readonly top: number;
  readonly center: number;
  readonly maxWidth: number;
}

type Box = Pick<DOMRect, 'left' | 'top' | 'bottom' | 'width'>;

/**
 * Pure placement: `notices` is the message area under the top bars, `page` the page area
 * (`.vnext-document-preview`) and `column` the canvas column. `undefined` when nothing can be
 * measured (hidden editor, jsdom), so the stylesheet default stays in charge.
 */
export function noticeAnchorFor(notices: Box, page: Box, column: Box, viewportHeight: number): NoticeAnchor | undefined {
  if (!(column.width > 0)) return undefined;
  const lowest = Math.max(4, viewportHeight - notices.bottom - 160);
  return {
    top: Math.round(Math.min(lowest, Math.max(4, page.top - notices.bottom + NOTICE_GAP_PX))),
    center: Math.round(column.left + column.width / 2 - notices.left),
    maxWidth: Math.round(Math.max(NOTICE_MIN_WIDTH_PX, column.width - NOTICE_SIDE_MARGIN_PX)),
  };
}

function nextFrame(callback: () => void): number {
  return typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16);
}

function cancelFrame(handle: number): void {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

/** Mounted once, by the canvas header. Without the editor around it, it does nothing. */
export function useNoticeAnchor(anchorRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const shell = anchor?.closest<HTMLElement>('.vnext-shell');
    const column = anchor?.closest<HTMLElement>('.vnext-canvas-area');
    const notices = shell?.querySelector<HTMLElement>('[data-editor-notices]');
    const page = column?.querySelector<HTMLElement>('.vnext-document-preview');
    if (!column || !notices || !page) return undefined;
    const measure = () => {
      const placement = noticeAnchorFor(notices.getBoundingClientRect(), page.getBoundingClientRect(),
        column.getBoundingClientRect(), window.innerHeight);
      if (!placement) return;
      notices.style.setProperty(NOTICE_TOP_VARIABLE, `${placement.top}px`);
      notices.style.setProperty(NOTICE_CENTER_VARIABLE, `${placement.center}px`);
      notices.style.setProperty(NOTICE_MAX_WIDTH_VARIABLE, `${placement.maxWidth}px`);
    };
    measure();
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) return;
      frame = nextFrame(() => { frame = undefined; measure(); });
    };
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      // The page area shrinks or grows when a toolbar above it opens or closes.
      for (const element of [column, page, notices]) observer.observe(element);
    }
    window.addEventListener('resize', schedule);
    column.addEventListener('scroll', schedule, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      column.removeEventListener('scroll', schedule);
      if (frame !== undefined) cancelFrame(frame);
      for (const name of [NOTICE_TOP_VARIABLE, NOTICE_CENTER_VARIABLE, NOTICE_MAX_WIDTH_VARIABLE]) notices.style.removeProperty(name);
    };
  }, [anchorRef]);
}
