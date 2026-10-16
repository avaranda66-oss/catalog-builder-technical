/**
 * FR-16a/FR-16b — zoom of the editor page stage.
 *
 * Stable API (consumed by later slices, e.g. 2A's inline cell editor and 2C's scale work):
 * - `useStageZoom()` reads the current zoom from anywhere inside the editor and offers
 *   `setChoice`, `zoomIn` and `zoomOut`. It needs no provider.
 * - `useStageZoomHost(anchorRef, pageWidthMm, pageHeightMm?)` is mounted once by the zoom
 *   control. It measures the canvas for "Ajustar à largura" and "Página inteira", writes the
 *   CSS variables on `.vnext-canvas-area` and handles Ctrl + roda do mouse over the canvas.
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
  stepStageZoom,
  writeStoredStageZoomChoice,
  type StageZoomChoice,
} from '../../editor/stage-zoom';

export const STAGE_ZOOM_CSS_VARIABLE = '--vnext-stage-zoom';
export const STAGE_UNZOOM_CSS_VARIABLE = '--vnext-stage-unzoom';
/** Element that owns the CSS variables and the Ctrl + wheel gesture. */
export const STAGE_ZOOM_SCOPE_SELECTOR = '.vnext-canvas-area';
/** Element whose content box is the width "Ajustar à largura" fills. */
export const STAGE_ZOOM_VIEWPORT_SELECTOR = '.vnext-document-preview';
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
  if (!isStageZoomChoice(choice)) return;
  writeStoredStageZoomChoice(browserStorage(), choice);
  const current = currentSnapshot();
  publish(buildSnapshot(choice, current.fitWidthZoom, current.fitPageZoom));
}

/** One step bigger (1) or smaller (-1) among the offered zoom levels. */
export function stepStageZoomChoice(direction: 1 | -1): void {
  const current = currentSnapshot();
  const next = stepStageZoom(current.choice, current.fitWidthZoom, direction, current.fitPageZoom);
  if (next !== current.choice) setStageZoomChoice(next);
}

function setFitZooms(fitWidthZoom: number | undefined, fitPageZoom: number | undefined): void {
  const current = currentSnapshot();
  if (current.fitWidthZoom === fitWidthZoom && current.fitPageZoom === fitPageZoom) return;
  publish(buildSnapshot(current.choice, fitWidthZoom, fitPageZoom));
}

/** Test seam: forget the in-memory zoom so the next read comes from storage again. */
export function resetStageZoomStore(): void {
  snapshot = undefined;
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

  // Publish the zoom to CSS. While unmeasured, the stylesheet default stays in charge.
  useLayoutEffect(() => {
    const scope = scopeFor(anchorRef.current);
    if (!scope || !measured) return undefined;
    scope.style.setProperty(STAGE_ZOOM_CSS_VARIABLE, formatCssNumber(zoom));
    scope.style.setProperty(STAGE_UNZOOM_CSS_VARIABLE, formatUnzoom(zoom));
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
      if (direction !== 0) stepStageZoomChoice(direction);
    };
    scope.addEventListener('wheel', onWheel, { passive: false });
    return () => scope.removeEventListener('wheel', onWheel);
  }, [anchorRef]);

  return stageZoom;
}
