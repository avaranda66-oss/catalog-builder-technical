/**
 * FR-16a — pure zoom math for the editor page stage (no DOM, no React).
 *
 * The zoom is a *view* setting only: it never reaches the CatalogDocument, the
 * measurement root or the PDF. Gestures already convert pointer deltas with the
 * rendered page rectangle, so any zoom value keeps the authored geometry exact.
 */

export type StageZoomChoice = 'fit-width' | '75' | '100' | '125';

export interface StageZoomOption {
  choice: StageZoomChoice;
  /** Visible, plain Portuguese label. */
  label: string;
}

export const STAGE_ZOOM_OPTIONS: readonly StageZoomOption[] = [
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
const PRESET_ZOOM: Readonly<Record<Exclude<StageZoomChoice, 'fit-width'>, number>> = { '75': 0.75, '100': 1, '125': 1.25 };
const SAME_ZOOM_EPSILON = 0.005;

export function isStageZoomChoice(value: unknown): value is StageZoomChoice {
  return typeof value === 'string' && STAGE_ZOOM_OPTIONS.some((option) => option.choice === value);
}

export function presetStageZoom(choice: StageZoomChoice): number | undefined {
  return choice === 'fit-width' ? undefined : PRESET_ZOOM[choice];
}

export function clampStageZoom(zoom: number): number {
  return Math.min(STAGE_ZOOM_MAX, Math.max(STAGE_ZOOM_MIN, zoom));
}

/**
 * Zoom that makes a page of `pageWidthMm` fill `availableWidthPx` CSS pixels.
 * Floors to two decimals so rounding never creates a horizontal scrollbar.
 * Returns `undefined` when the canvas cannot be measured (hidden, jsdom, invalid page).
 */
export function fitWidthStageZoom(availableWidthPx: number, pageWidthMm: number): number | undefined {
  if (!Number.isFinite(availableWidthPx) || !Number.isFinite(pageWidthMm)) return undefined;
  if (availableWidthPx <= 0 || pageWidthMm <= 0) return undefined;
  const raw = availableWidthPx / (pageWidthMm * CSS_PX_PER_MM);
  // The tiny epsilon keeps an exact fit (raw 0.99999999…) from flooring one step down.
  return clampStageZoom(Math.floor(raw * 100 + 1e-9) / 100);
}

/** The zoom actually applied to `.vnext-page-stage` for a choice. */
export function effectiveStageZoom(choice: StageZoomChoice, fitWidthZoom: number | undefined): number {
  return presetStageZoom(choice) ?? fitWidthZoom ?? STAGE_ZOOM_FALLBACK;
}

/**
 * Next choice for a zoom step (Ctrl + roda do mouse). The candidates are the fixed
 * percentages plus the measured "Ajustar à largura" value; the step always moves to
 * the nearest candidate that is visibly larger (direction 1) or smaller (direction -1).
 * When nothing is larger/smaller the current choice is kept.
 */
export function stepStageZoom(choice: StageZoomChoice, fitWidthZoom: number | undefined, direction: 1 | -1): StageZoomChoice {
  const current = effectiveStageZoom(choice, fitWidthZoom);
  const candidates = STAGE_ZOOM_OPTIONS
    .map((option) => ({ choice: option.choice, zoom: option.choice === 'fit-width' ? fitWidthZoom : presetStageZoom(option.choice) }))
    .filter((candidate): candidate is { choice: StageZoomChoice; zoom: number } => candidate.zoom !== undefined)
    .filter((candidate) => direction === 1 ? candidate.zoom > current + SAME_ZOOM_EPSILON : candidate.zoom < current - SAME_ZOOM_EPSILON)
    // Nearest first; on a tie a fixed percentage wins over "Ajustar à largura".
    .sort((a, b) => Math.abs(a.zoom - current) - Math.abs(b.zoom - current) || (a.choice === 'fit-width' ? 1 : 0) - (b.choice === 'fit-width' ? 1 : 0));
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
