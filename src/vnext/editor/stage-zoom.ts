/**
 * FR-16a/FR-16b — pure zoom math for the editor page stage (no DOM, no React).
 *
 * The zoom is a *view* setting only: it never reaches the CatalogDocument, the measurement
 * root or the PDF. Gestures already convert pointer deltas with the rendered page rectangle,
 * so any zoom value keeps the authored geometry exact.
 */

export type StageZoomChoice = 'fit-page' | 'fit-width' | '75' | '100' | '125';
/** The two choices whose value depends on the measured canvas. */
export type StageZoomFitChoice = Extract<StageZoomChoice, 'fit-page' | 'fit-width'>;

export interface StageZoomOption {
  choice: StageZoomChoice;
  /** Visible, plain Portuguese label. */
  label: string;
}

export const STAGE_ZOOM_OPTIONS: readonly StageZoomOption[] = [
  { choice: 'fit-page', label: 'Página inteira' },
  { choice: 'fit-width', label: 'Ajustar à largura' },
  { choice: '75', label: '75%' },
  { choice: '100', label: '100%' },
  { choice: '125', label: '125%' },
];

export const STAGE_ZOOM_DEFAULT_CHOICE: StageZoomChoice = 'fit-width';
/** Zoom used while the canvas cannot be measured yet (and in jsdom). Matches the former fixed `.62`. */
export const STAGE_ZOOM_FALLBACK = 0.62;
export const STAGE_ZOOM_MIN = 0.25;
export const STAGE_ZOOM_MAX = 2;
export const STAGE_ZOOM_STORAGE_KEY = 'vnext.editor.stageZoom';

const CSS_PX_PER_MM = 96 / 25.4;
const PRESET_ZOOM: Readonly<Record<Exclude<StageZoomChoice, StageZoomFitChoice>, number>> = { '75': 0.75, '100': 1, '125': 1.25 };
const SAME_ZOOM_EPSILON = 0.005;

/** Measured values for the two "fit" choices; `undefined` while the canvas cannot be measured. */
export interface StageZoomFits {
  readonly fitWidthZoom: number | undefined;
  readonly fitPageZoom?: number | undefined;
}

export function isStageZoomChoice(value: unknown): value is StageZoomChoice {
  return typeof value === 'string' && STAGE_ZOOM_OPTIONS.some((option) => option.choice === value);
}

export function isStageZoomFitChoice(choice: StageZoomChoice): choice is StageZoomFitChoice {
  return choice === 'fit-page' || choice === 'fit-width';
}

export function presetStageZoom(choice: StageZoomChoice): number | undefined {
  return isStageZoomFitChoice(choice) ? undefined : PRESET_ZOOM[choice];
}

export function clampStageZoom(zoom: number): number {
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, zoom));
}

function fitStageZoom(availablePx: number, pageMm: number): number | undefined {
  if (!Number.isFinite(availablePx) || !Number.isFinite(pageMm)) return undefined;
  if (availablePx <= 0 || pageMm <= 0) return undefined;
  const raw = availablePx / (pageMm * CSS_PX_PER_MM);
  // The tiny epsilon keeps an exact fit (raw 0.99999999…) from flooring one step down.
  return clampStageZoom(Math.floor(raw * 100 + 1e-9) / 100);
}

/**
 * Zoom that makes a page of `pageWidthMm` fill `availableWidthPx` CSS pixels.
 * Floors to two decimals so rounding never creates a horizontal scrollbar.
 * Returns `undefined` when the canvas cannot be measured (hidden, jsdom, invalid page).
 */
export function fitWidthStageZoom(availableWidthPx: number, pageWidthMm: number): number | undefined {
  return fitStageZoom(availableWidthPx, pageWidthMm);
}

/**
 * FR-16b "Página inteira": the biggest zoom that shows the whole page (width and height) in
 * the visible canvas. `undefined` when either side cannot be measured.
 */
export function fitPageStageZoom(
  availableWidthPx: number, availableHeightPx: number, pageWidthMm: number, pageHeightMm: number,
): number | undefined {
  const byWidth = fitStageZoom(availableWidthPx, pageWidthMm);
  const byHeight = fitStageZoom(availableHeightPx, pageHeightMm);
  if (byWidth === undefined || byHeight === undefined) return undefined;
  return Math.min(byWidth, byHeight);
}

function fitZoomFor(choice: StageZoomFitChoice, fits: StageZoomFits): number | undefined {
  return choice === 'fit-page' ? fits.fitPageZoom : fits.fitWidthZoom;
}

/** The zoom actually applied to `.vnext-page-stage` for a choice. */
export function effectiveStageZoom(choice: StageZoomChoice, fitWidthZoom: number | undefined, fitPageZoom?: number): number {
  if (!isStageZoomFitChoice(choice)) return PRESET_ZOOM[choice];
  return fitZoomFor(choice, { fitWidthZoom, fitPageZoom }) ?? STAGE_ZOOM_FALLBACK;
}

/** True when the choice already has its value (a fixed percentage, or a measured fit). */
export function isStageZoomMeasured(choice: StageZoomChoice, fitWidthZoom: number | undefined, fitPageZoom?: number): boolean {
  return !isStageZoomFitChoice(choice) || fitZoomFor(choice, { fitWidthZoom, fitPageZoom }) !== undefined;
}

/**
 * Next choice for a zoom step (Ctrl + roda do mouse, or the − / + buttons). The candidates are
 * the fixed percentages plus the measured "Página inteira" and "Ajustar à largura" values; the
 * step always moves to the nearest candidate that is visibly larger (direction 1) or smaller
 * (direction -1). When nothing is larger/smaller the current choice is kept.
 */
export function stepStageZoom(
  choice: StageZoomChoice, fitWidthZoom: number | undefined, direction: 1 | -1, fitPageZoom?: number,
): StageZoomChoice {
  const current = effectiveStageZoom(choice, fitWidthZoom, fitPageZoom);
  const fits: StageZoomFits = { fitWidthZoom, fitPageZoom };
  const rank = (candidate: StageZoomChoice) => (candidate === 'fit-width' ? 1 : candidate === 'fit-page' ? 2 : 0);
  const candidates = STAGE_ZOOM_OPTIONS
    .map((option) => ({ choice: option.choice, zoom: isStageZoomFitChoice(option.choice) ? fitZoomFor(option.choice, fits) : presetStageZoom(option.choice) }))
    .filter((candidate): candidate is { choice: StageZoomChoice; zoom: number } => candidate.zoom !== undefined)
    .filter((candidate) => direction === 1 ? candidate.zoom > current + SAME_ZOOM_EPSILON : candidate.zoom < current - SAME_ZOOM_EPSILON)
    // Nearest first; on a tie a fixed percentage wins, then "Ajustar à largura", then "Página inteira".
    .sort((a, b) => Math.abs(a.zoom - current) - Math.abs(b.zoom - current) || rank(a.choice) - rank(b.choice));
  return candidates[0]?.choice ?? choice;
}

export function stageZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function stageZoomLabel(choice: StageZoomChoice): string {
  return STAGE_ZOOM_OPTIONS.find((option) => option.choice === choice)?.label ?? choice;
}

/** Reads the remembered choice. Storage can be missing or throw (private mode, blocked site data). */
export function readStoredStageZoomChoice(storage: Pick<Storage, 'getItem'> | undefined | null): StageZoomChoice {
  try {
    const stored = storage?.getItem(STAGE_ZOOM_STORAGE_KEY);
    return isStageZoomChoice(stored) ? stored : STAGE_ZOOM_DEFAULT_CHOICE;
  } catch {
    return STAGE_ZOOM_DEFAULT_CHOICE;
  }
}

/** Remembers the choice; failures are ignored because the zoom is only a convenience. */
export function writeStoredStageZoomChoice(storage: Pick<Storage, 'setItem'> | undefined | null, choice: StageZoomChoice): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STAGE_ZOOM_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/**
 * FR-16b: a point of the page kept still on screen while the zoom changes: under the mouse for
 * Ctrl + roda, or the centre of the visible page area for "−", "+" and the list of levels.
 * `pageX`/`pageY` are in page CSS pixels (before the zoom), measured from the page stage corner.
 */
export interface StageZoomAnchor {
  readonly clientX: number;
  readonly clientY: number;
  readonly pageX: number;
  readonly pageY: number;
  /** Zoom when the point was taken. */
  readonly zoom: number;
}

/** Takes the anchor at a screen point, from the page stage rectangle drawn at `zoom`. */
export function stageZoomAnchor(stage: { left: number; top: number }, zoom: number, clientX: number, clientY: number): StageZoomAnchor | undefined {
  if (![stage.left, stage.top, zoom, clientX, clientY].every(Number.isFinite) || zoom <= 0) return undefined;
  return { clientX, clientY, pageX: (clientX - stage.left) / zoom, pageY: (clientY - stage.top) / zoom, zoom };
}

/**
 * How far to scroll (CSS px, positive = scroll right/down) so the anchored point is back under
 * `clientX`/`clientY` once the page stage is drawn at `zoom` with its corner at `stage`.
 */
export function stageZoomAnchorShift(anchor: StageZoomAnchor, stage: { left: number; top: number }, zoom: number): { dx: number; dy: number } {
  return {
    dx: stage.left + anchor.pageX * zoom - anchor.clientX,
    dy: stage.top + anchor.pageY * zoom - anchor.clientY,
  };
}

/** Pixels per wheel "notch" used to turn trackpad pinches and mouse wheels into whole steps. */
export const STAGE_ZOOM_WHEEL_STEP_PX = 50;
const WHEEL_IDLE_RESET_MS = 400;

export interface StageZoomWheelInput {
  deltaY: number;
  /** WheelEvent.deltaMode: 0 = pixels, 1 = lines, 2 = pages. */
  deltaMode: number;
  timeStamp: number;
}

/**
 * Accumulates Ctrl + wheel deltas into zoom steps: one mouse notch (≈100 px) gives one
 * step, a trackpad pinch (many small deltas) gives one step per `STAGE_ZOOM_WHEEL_STEP_PX`.
 * Returns 1 to zoom in (wheel up), -1 to zoom out, 0 to wait.
 */
export function createStageZoomWheelStepper(): (input: StageZoomWheelInput) => 1 | -1 | 0 {
  let accumulated = 0;
  let lastTimeStamp = Number.NEGATIVE_INFINITY;
  return ({ deltaY, deltaMode, timeStamp }) => {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    if (timeStamp - lastTimeStamp > WHEEL_IDLE_RESET_MS) accumulated = 0;
    lastTimeStamp = timeStamp;
    const scale = deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1;
    accumulated += deltaY * scale;
    if (Math.abs(accumulated) < STAGE_ZOOM_WHEEL_STEP_PX) return 0;
    const direction = accumulated < 0 ? 1 : -1;
    accumulated = 0;
    return direction;
  };
}
