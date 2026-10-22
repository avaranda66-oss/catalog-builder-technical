/**
 * FR-16a/FR-16b — zoom of the editor page stage.
 *
 * Stable API (consumed by later slices, e.g. 2A's inline cell editor and 2C's scale work):
 * - `useStageZoom()` reads the current zoom from anywhere inside the editor and offers
 *   `setChoice`, `zoomIn` and `zoomOut`. It needs no provider.
 * - `useStageZoomHost(anchorRef, pageWidthMm, pageHeightMm?)` is mounted once by the zoom
 *   control. It measures the canvas for "Ajustar à largura" and "Página inteira", writes the
 *   CSS variables on `.vnext-canvas-area` and handles Ctrl + roda do mouse over the canvas.
 * - `rememberStageZoomAnchor(scope, point?)`, called right before a zoom change, keeps that
 *   point of the page (or the centre of the visible page area) still on screen.
 *
 * CSS contract (styles.css): `.vnext-page-stage { zoom: var(--vnext-stage-zoom) }`. Controls
 * drawn inside the zoomed page multiply screen sizes by `--vnext-stage-unzoom` (= 1 / zoom)
 * so they keep the same size on screen at any zoom.
 *
 * The zoom is a view preference only: it never enters the CatalogDocument, the measurement
 * root or the PDF, and gestures already convert pointer deltas with the rendered page rect.
 */
import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore, type RefObject } from 'react';
import {
  createStageZoomWheelStepper,
  effectiveStageZoom,
  fitPageStageZoom,
  fitWidthStageZoom,
  isStageZoomChoice,
  isStageZoomMeasured,
  readStoredStageZoomChoice,
  stageZoomAnchor,
  stageZoomAnchorShift,
  stepStageZoom,
  writeStoredStageZoomChoice,
  type StageZoomAnchor,
  type StageZoomChoice,
} from '../../editor/stage-zoom';

export const STAGE_ZOOM_CSS_VARIABLE = '--vnext-stage-zoom';
export const STAGE_UNZOOM_CSS_VARIABLE = '--vnext-stage-unzoom';
/** Element that owns the CSS variables and the Ctrl + wheel gesture. */
export const STAGE_ZOOM_SCOPE_SELECTOR = '.vnext-canvas-area';
/** Element whose content box is the width "Ajustar à largura" fills. */
export const STAGE_ZOOM_VIEWPORT_SELECTOR = '.vnext-document-preview';
/** The zoomed page stage. */
export const STAGE_ZOOM_STAGE_SELECTOR = '[data-vnext-page-stage]';
/** Keeps a hair of room so sub-pixel rounding never creates a horizontal scrollbar. */
const FIT_SAFETY_PX = 2;
/** A4 height / width, used when the caller does not give the page height. */
const A4_HEIGHT_PER_WIDTH = 297 / 210;

export interface StageZoomSnapshot {
  /** What the person chose (remembered on this computer). */
  readonly choice: StageZoomChoice;
  /** Zoom that fills the canvas width, or `undefined` until the canvas is measured. */
  readonly fitWidthZoom: number | undefined;
  /** FR-16b: zoom that shows the whole page in the visible canvas, or `undefined` until measured. */
  readonly fitPageZoom: number | undefined;
  /** Zoom factor applied to `.vnext-page-stage` (screen px per page CSS px). */
  readonly zoom: number;
  /** False only while "Ajustar à largura" or "Página inteira" waits for the first measurement. */
  readonly measured: boolean;
}

export interface StageZoom extends StageZoomSnapshot {
  /** `1 / zoom`: multiply a wanted on-screen size by this to size something inside the page. */
  readonly unzoom: number;
  setChoice(choice: StageZoomChoice): void;
  zoomIn(): void;
  zoomOut(): void;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function buildSnapshot(choice: StageZoomChoice, fitWidthZoom: number | undefined, fitPageZoom: number | undefined): StageZoomSnapshot {
  return {
    choice,
    fitWidthZoom,
    fitPageZoom,
    zoom: effectiveStageZoom(choice, fitWidthZoom, fitPageZoom),
    measured: isStageZoomMeasured(choice, fitWidthZoom, fitPageZoom),
  };
}

let snapshot: StageZoomSnapshot | undefined;
const listeners = new Set<() => void>();
/** FR-16b: the point to keep still through the next zoom change (see `rememberStageZoomAnchor`). */
let pendingAnchor: StageZoomAnchor | undefined;

function currentSnapshot(): StageZoomSnapshot {
  if (!snapshot) snapshot = buildSnapshot(readStoredStageZoomChoice(browserStorage()), undefined, undefined);
  return snapshot;
}

function publish(next: StageZoomSnapshot): void {
  const previous = currentSnapshot();
  if (previous.choice === next.choice && previous.fitWidthZoom === next.fitWidthZoom && previous.fitPageZoom === next.fitPageZoom) return;
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Changes the zoom and remembers it (storage failures are ignored). */
export function setStageZoomChoice(choice: StageZoomChoice): void {
  if (!isStageZoomChoice(choice)) {
    pendingAnchor = undefined;
    return;
  }
  writeStoredStageZoomChoice(browserStorage(), choice);
  const current = currentSnapshot();
  const next = buildSnapshot(choice, current.fitWidthZoom, current.fitPageZoom);
  // A remembered point only matters when the drawn size really changes.
  if (next.zoom === current.zoom) pendingAnchor = undefined;
  publish(next);
}

/** One step bigger (1) or smaller (-1) among the offered zoom levels. */
export function stepStageZoomChoice(direction: 1 | -1): void {
  const current = currentSnapshot();
  const next = stepStageZoom(current.choice, current.fitWidthZoom, direction, current.fitPageZoom);
  if (next !== current.choice) setStageZoomChoice(next);
  else pendingAnchor = undefined;
}

function setFitZooms(fitWidthZoom: number | undefined, fitPageZoom: number | undefined): void {
  const current = currentSnapshot();
  if (current.fitWidthZoom === fitWidthZoom && current.fitPageZoom === fitPageZoom) return;
  publish(buildSnapshot(current.choice, fitWidthZoom, fitPageZoom));
}

/**
 * FR-16b: call right before changing the zoom so the page does not jump: the point under the
 * mouse (Ctrl + roda) or, without a point, the centre of the visible page area ("−", "+", the
 * list) stays where it is on screen. The zoom host applies it once the new zoom is drawn.
 */
export function rememberStageZoomAnchor(scope: HTMLElement | null | undefined, point?: { clientX: number; clientY: number }): void {
  pendingAnchor = undefined;
  const stage = scope?.querySelector<HTMLElement>(STAGE_ZOOM_STAGE_SELECTOR);
  if (!scope || !stage) return;
  let target = point;
  if (!target) {
    const viewport = (scope.querySelector<HTMLElement>(STAGE_ZOOM_VIEWPORT_SELECTOR) ?? scope).getBoundingClientRect();
    const left = Math.max(viewport.left, 0);
    const right = Math.min(viewport.right, window.innerWidth || viewport.right);
    const top = Math.max(viewport.top, 0);
    const bottom = Math.min(viewport.bottom, window.innerHeight || viewport.bottom);
    if (!(right > left) || !(bottom > top)) return;
    target = { clientX: (left + right) / 2, clientY: (top + bottom) / 2 };
  }
  pendingAnchor = stageZoomAnchor(stage.getBoundingClientRect(), currentSnapshot().zoom, target.clientX, target.clientY);
}

function isScrollable(element: Element, axis: 'x' | 'y'): boolean {
  if (element === globalThis.document.scrollingElement) return true;
  const overflow = window.getComputedStyle(element)[axis === 'x' ? 'overflowX' : 'overflowY'];
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

/** Scrolls the page area (then its scrolling ancestors) so the anchored point is back in place. */
function keepAnchorInPlace(stage: HTMLElement, anchor: StageZoomAnchor, zoom: number): void {
  let { dx, dy } = stageZoomAnchorShift(anchor, stage.getBoundingClientRect(), zoom);
  for (let element = stage.parentElement; element && (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5); element = element.parentElement) {
    if (Math.abs(dx) >= 0.5 && isScrollable(element, 'x')) {
      const before = element.scrollLeft;
      element.scrollLeft = before + dx;
      dx -= element.scrollLeft - before;
    }
    if (Math.abs(dy) >= 0.5 && isScrollable(element, 'y')) {
      const before = element.scrollTop;
      element.scrollTop = before + dy;
      dy -= element.scrollTop - before;
    }
  }
}

/** Test seam: forget the in-memory zoom so the next read comes from storage again. */
export function resetStageZoomStore(): void {
  snapshot = undefined;
  pendingAnchor = undefined;
  for (const listener of [...listeners]) listener();
}

export function readStageZoomSnapshot(): StageZoomSnapshot {
  return currentSnapshot();
}

const stageZoomActions = {
  setChoice: setStageZoomChoice,
  zoomIn: () => stepStageZoomChoice(1),
  zoomOut: () => stepStageZoomChoice(-1),
};

export function useStageZoom(): StageZoom {
  const state = useSyncExternalStore(subscribe, currentSnapshot, currentSnapshot);
  return useMemo(() => ({ ...state, unzoom: 1 / state.zoom, ...stageZoomActions }), [state]);
}

function scopeFor(anchor: HTMLElement | null): HTMLElement | null {
  return anchor?.closest<HTMLElement>(STAGE_ZOOM_SCOPE_SELECTOR) ?? null;
}

/** Content-box width available to the page (excludes the preview's own padding). */
export function stageZoomAvailableWidth(scope: HTMLElement): number {
  const viewport = scope.querySelector<HTMLElement>(STAGE_ZOOM_VIEWPORT_SELECTOR) ?? scope;
  const style = window.getComputedStyle(viewport);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  return viewport.clientWidth - padding - FIT_SAFETY_PX;
}

/**
 * FR-16b: visible height available to the page. On a computer screen the page scrolls inside
 * `.vnext-document-preview` (the toolbars stay fixed above it), so its client height is what the
 * person sees; on a phone the whole screen scrolls, so the window height also limits it.
 */
export function stageZoomAvailableHeight(scope: HTMLElement): number {
  const viewport = scope.querySelector<HTMLElement>(STAGE_ZOOM_VIEWPORT_SELECTOR) ?? scope;
  const style = window.getComputedStyle(viewport);
  const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const visible = Math.min(viewport.clientHeight, window.innerHeight || viewport.clientHeight);
  return visible - padding - FIT_SAFETY_PX;
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

function formatCssNumber(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

/** Rounded up so counter-scaled controls never end a hair below their on-screen minimum (e.g. 12 px). */
function formatUnzoom(zoom: number): string {
  return String(Math.ceil((1 / zoom) * 10_000 - 1e-9) / 10_000);
}

/**
 * Mounted once, by the zoom control inside `.vnext-canvas-area`. Without that ancestor it
 * does nothing, so the control can be rendered in isolation (tests, previews).
 */
export function useStageZoomHost(anchorRef: RefObject<HTMLElement | null>, pageWidthMm: number, pageHeightMm?: number): StageZoom {
  const stageZoom = useStageZoom();
  const { measured, zoom, choice } = stageZoom;
  const heightMm = pageHeightMm !== undefined && pageHeightMm > 0 ? pageHeightMm : pageWidthMm * A4_HEIGHT_PER_WIDTH;

  // "Ajustar à largura" and "Página inteira": measure now (before paint), again after the canvas
  // changes size, and again when the person picks a choice (so "Página inteira" uses the toolbars
  // shown right now). A toolbar opening or closing does not re-measure: the page never changes
  // size by itself while the person works. Re-measuring is deferred to the next frame so a zoom
  // change never happens inside a ResizeObserver delivery ("ResizeObserver loop" errors).
  useLayoutEffect(() => {
    const scope = scopeFor(anchorRef.current);
    if (!scope) return undefined;
    const measure = () => {
      const width = stageZoomAvailableWidth(scope);
      setFitZooms(
        fitWidthStageZoom(width, pageWidthMm),
        fitPageStageZoom(width, stageZoomAvailableHeight(scope), pageWidthMm, heightMm),
      );
    };
    measure();
    let pending = false;
    let frame: number | undefined;
    const scheduleMeasure = () => {
      if (pending) return;
      pending = true;
      const handle = nextFrame(() => { pending = false; measure(); });
      frame = pending ? handle : undefined;
    };
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'undefined') window.addEventListener('resize', scheduleMeasure);
    else {
      observer = new ResizeObserver(scheduleMeasure);
      observer.observe(scope);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (pending && frame !== undefined) cancelFrame(frame);
    };
  }, [anchorRef, pageWidthMm, heightMm, choice]);

  // Publish the zoom to CSS. While unmeasured, the stylesheet default stays in charge. Then, before
  // paint, scroll so the remembered point (under the mouse, or the centre) stays still (FR-16b).
  useLayoutEffect(() => {
    const scope = scopeFor(anchorRef.current);
    if (!scope || !measured) return undefined;
    scope.style.setProperty(STAGE_ZOOM_CSS_VARIABLE, formatCssNumber(zoom));
    scope.style.setProperty(STAGE_UNZOOM_CSS_VARIABLE, formatUnzoom(zoom));
    const anchor = pendingAnchor;
    pendingAnchor = undefined;
    const stage = scope.querySelector<HTMLElement>(STAGE_ZOOM_STAGE_SELECTOR);
    if (anchor && stage && anchor.zoom !== zoom) keepAnchorInPlace(stage, anchor, zoom);
    return () => {
      scope.style.removeProperty(STAGE_ZOOM_CSS_VARIABLE);
      scope.style.removeProperty(STAGE_UNZOOM_CSS_VARIABLE);
    };
  }, [anchorRef, measured, zoom]);

  // Ctrl + roda do mouse over the canvas zooms the page instead of the whole browser.
  useEffect(() => {
    const scope = scopeFor(anchorRef.current);
    if (!scope) return undefined;
    const step = createStageZoomWheelStepper();
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = step({ deltaY: event.deltaY, deltaMode: event.deltaMode, timeStamp: event.timeStamp });
      if (direction === 0) return;
      rememberStageZoomAnchor(scope, { clientX: event.clientX, clientY: event.clientY });
      stepStageZoomChoice(direction);
    };
    scope.addEventListener('wheel', onWheel, { passive: false });
    return () => scope.removeEventListener('wheel', onWheel);
  }, [anchorRef]);

  return stageZoom;
}
