/**
 * FR-16b (pendência da Onda 1): where the floating editor message of FR-12 appears.
 *
 * The message used to float centred right under the top bar, over "Página N de M", the zoom and
 * the problems counter, for up to 4 s. On a computer screen the toolbars above the page are now
 * fixed (only the page scrolls), so this hook measures where the page area starts and publishes
 * three CSS variables on the message area (`[data-editor-notices]`):
 * - `--vnext-notice-top`: distance from the message area to the top of the message;
 * - `--vnext-notice-center`: horizontal centre of the page column;
 * - `--vnext-notice-max-width`: width of the page column, minus a margin.
 * styles.css uses them (only above 900 px) to float the message over the page, still under the
 * top bars and without moving anything. Below 900 px the message keeps its place under the top bar.
 *
 * P2 da J4 (20/10): over the top edge of the page the message covered the table that "Ir até lá"
 * had just selected, and the person had to close it before editing. The message now keeps away
 * from the selected object: right under it, or at the bottom of the visible page area
 * (`data-notice-placement` tells which). It stays on screen and keeps its "Fechar" button (FR-12).
 *
 * J5 (21/10): a table of 41 rows fills the whole visible page, so no floating place was free and the
 * message stayed over its top edge, taking the click the father made on the table. When every
 * floating place would cover part of the selected object, the message now joins the layout instead
 * (`inline`: right under the top bars, the page area gets shorter by its height). Nothing is ever
 * under the message, and it keeps that place until it is replaced or closed, so it never jumps.
 */
import { useLayoutEffect, type RefObject } from 'react';

export const NOTICE_TOP_VARIABLE = '--vnext-notice-top';
export const NOTICE_CENTER_VARIABLE = '--vnext-notice-center';
export const NOTICE_MAX_WIDTH_VARIABLE = '--vnext-notice-max-width';
export const NOTICE_PLACEMENT_ATTRIBUTE = 'data-notice-placement';
const NOTICE_GAP_PX = 8;
const NOTICE_SIDE_MARGIN_PX = 32;
const NOTICE_MIN_WIDTH_PX = 240;

export interface NoticeAnchor {
  readonly top: number;
  readonly center: number;
  readonly maxWidth: number;
}

type Box = Pick<DOMRect, 'left' | 'top' | 'bottom' | 'width'>;
type Area = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

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

/**
 * `top`: where the page starts; `below-selection`: right under the selected object; `bottom`: bottom of the page area;
 * `inline`: in the layout, above the page, when no floating place is free of the selected object.
 */
export type NoticePlacement = 'top' | 'below-selection' | 'bottom' | 'inline';

export interface NoticeAvoidance {
  /** The message on screen now (its height and horizontal extent do not depend on its top). */
  readonly notice: Pick<DOMRect, 'left' | 'right' | 'height'>;
  /** The selected object(s), which the person is about to edit. */
  readonly selection: Area;
}

/**
 * Pure: keeps the message of `anchor` off the selected object. The first place that covers none
 * of its visible part wins, in the order top, right under it, bottom of the visible page area;
 * when every floating place covers part of it (a table as tall as the page area), the message joins
 * the layout (`inline`) instead of floating over the object. The message never goes above the
 * message area nor below the window.
 */
export function placeNoticeAvoiding(
  anchor: NoticeAnchor,
  notices: Pick<DOMRect, 'bottom'>,
  page: Pick<DOMRect, 'top' | 'bottom'>,
  viewportHeight: number,
  { notice, selection }: NoticeAvoidance
): { top: number; placement: NoticePlacement } {
  const base = { top: anchor.top, placement: 'top' as NoticePlacement };
  const height = notice.height;
  const visibleTop = Math.max(page.top, notices.bottom);
  const visibleBottom = Math.min(page.bottom, viewportHeight);
  const coveredTop = Math.max(selection.top, visibleTop);
  const coveredBottom = Math.min(selection.bottom, visibleBottom);
  const sideBySide = Math.min(notice.right, selection.right) - Math.max(notice.left, selection.left) <= 0;
  if (!(height > 0) || sideBySide || coveredBottom <= coveredTop) return base;
  const covered = (top: number) => Math.max(0, Math.min(top + height, coveredBottom) - Math.max(top, coveredTop));
  const candidates: { top: number; placement: NoticePlacement }[] = [{ top: notices.bottom + anchor.top, placement: 'top' }];
  // Both stay inside the visible page area, so inside the window, and never above the message area.
  const lowest = visibleBottom - NOTICE_GAP_PX - height;
  const below = coveredBottom + NOTICE_GAP_PX;
  if (below <= lowest) candidates.push({ top: below, placement: 'below-selection' });
  if (lowest >= notices.bottom + 4) candidates.push({ top: lowest, placement: 'bottom' });
  const best = candidates.find((candidate) => covered(candidate.top) === 0);
  if (!best) return { top: anchor.top, placement: 'inline' };
  return best.placement === 'top' ? base : { top: Math.round(best.top - notices.bottom), placement: best.placement };
}

/** Union of the selected objects on the page, or undefined when nothing is selected. */
function selectionArea(page: HTMLElement): Area | undefined {
  let area: Area | undefined;
  for (const element of page.querySelectorAll<HTMLElement>('[data-editor-object-id][data-selected="true"]')) {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 || rect.height > 0)) continue;
    area = area
      ? { left: Math.min(area.left, rect.left), right: Math.max(area.right, rect.right), top: Math.min(area.top, rect.top), bottom: Math.max(area.bottom, rect.bottom) }
      : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }
  return area;
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
    // The message that joined the layout keeps that place for as long as it is on screen: being in the layout moves the
    // page, and measuring again from there would send it floating over the object and back.
    let inlineNotice: Element | null = null;
    const measure = () => {
      const noticesRect = notices.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      const placement = noticeAnchorFor(noticesRect, pageRect, column.getBoundingClientRect(), window.innerHeight);
      if (!placement) return;
      const notice = notices.querySelector<HTMLElement>('[data-editor-notice]');
      if (inlineNotice && inlineNotice !== notice) inlineNotice = null;
      const selection = notice && !inlineNotice ? selectionArea(page) : undefined;
      let placed: { top: number; placement: NoticePlacement } = inlineNotice
        ? { top: placement.top, placement: 'inline' }
        : { top: placement.top, placement: 'top' };
      if (notice && selection) {
        placed = placeNoticeAvoiding(placement, noticesRect, pageRect, window.innerHeight, { notice: notice.getBoundingClientRect(), selection });
        if (placed.placement === 'inline') inlineNotice = notice;
      }
      notices.style.setProperty(NOTICE_TOP_VARIABLE, `${placed.top}px`);
      notices.style.setProperty(NOTICE_CENTER_VARIABLE, `${placement.center}px`);
      notices.style.setProperty(NOTICE_MAX_WIDTH_VARIABLE, `${placement.maxWidth}px`);
      notices.setAttribute(NOTICE_PLACEMENT_ATTRIBUTE, placed.placement);
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
    // A message appears or changes; the selection, an object's frame or the zoom changes.
    let mutations: MutationObserver | undefined;
    if (typeof MutationObserver !== 'undefined') {
      mutations = new MutationObserver(schedule);
      mutations.observe(notices, { childList: true, subtree: true, characterData: true });
      mutations.observe(page, { subtree: true, attributes: true, attributeFilter: ['data-selected', 'style'] });
    }
    window.addEventListener('resize', schedule);
    column.addEventListener('scroll', schedule, { passive: true });
    page.addEventListener('scroll', schedule, { passive: true });
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', schedule);
      column.removeEventListener('scroll', schedule);
      page.removeEventListener('scroll', schedule);
      if (frame !== undefined) cancelFrame(frame);
      for (const name of [NOTICE_TOP_VARIABLE, NOTICE_CENTER_VARIABLE, NOTICE_MAX_WIDTH_VARIABLE]) notices.style.removeProperty(name);
      notices.removeAttribute(NOTICE_PLACEMENT_ATTRIBUTE);
    };
  }, [anchorRef]);
}
