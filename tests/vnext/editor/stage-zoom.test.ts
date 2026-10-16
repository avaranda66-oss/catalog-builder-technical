import { describe, expect, it } from 'vitest';
import {
  STAGE_ZOOM_DEFAULT_CHOICE,
  STAGE_ZOOM_FALLBACK,
  STAGE_ZOOM_MAX,
  STAGE_ZOOM_MIN,
  STAGE_ZOOM_OPTIONS,
  STAGE_ZOOM_STORAGE_KEY,
  createStageZoomWheelStepper,
  effectiveStageZoom,
  fitWidthStageZoom,
  isStageZoomChoice,
  readStoredStageZoomChoice,
  stageZoomLabel,
  stageZoomPercent,
  stepStageZoom,
  writeStoredStageZoomChoice,
} from '@/vnext/editor/stage-zoom';

const A4_WIDTH_PX = 210 * 96 / 25.4; // 793.7 CSS px

describe('FR-16a stage zoom math', () => {
  it('offers "Ajustar à largura" by default plus 75%, 100% and 125% in plain Portuguese', () => {
    expect(STAGE_ZOOM_DEFAULT_CHOICE).toBe('fit-width');
    expect(STAGE_ZOOM_OPTIONS.map((option) => option.label)).toEqual(['Ajustar à largura', '75%', '100%', '125%']);
    expect(stageZoomLabel('fit-width')).toBe('Ajustar à largura');
    expect(isStageZoomChoice('125')).toBe(true);
    expect(isStageZoomChoice('150')).toBe(false);
    expect(isStageZoomChoice(undefined)).toBe(false);
  });

  it('fits an A4 page to the available width, flooring so it never overflows', () => {
    expect(fitWidthStageZoom(A4_WIDTH_PX, 210)).toBe(1);
    expect(fitWidthStageZoom(A4_WIDTH_PX - 1, 210)).toBe(0.99);
    // 1366 px laptop: about 826 px are left for the page between the side panels.
    expect(fitWidthStageZoom(826, 210)).toBe(1.04);
    expect(fitWidthStageZoom(826, 210)! * A4_WIDTH_PX).toBeLessThanOrEqual(826);
  });

  it('clamps extreme widths and refuses unmeasurable canvases', () => {
    expect(fitWidthStageZoom(10, 210)).toBe(STAGE_ZOOM_MIN);
    expect(fitWidthStageZoom(10_000, 210)).toBe(STAGE_ZOOM_MAX);
    expect(fitWidthStageZoom(0, 210)).toBeUndefined();
    expect(fitWidthStageZoom(-20, 210)).toBeUndefined();
    expect(fitWidthStageZoom(Number.NaN, 210)).toBeUndefined();
    expect(fitWidthStageZoom(800, 0)).toBeUndefined();
  });

  it('applies presets exactly and falls back to the former .62 until the canvas is measured', () => {
    expect(effectiveStageZoom('75', 1.4)).toBe(0.75);
    expect(effectiveStageZoom('100', undefined)).toBe(1);
    expect(effectiveStageZoom('125', 0.5)).toBe(1.25);
    expect(effectiveStageZoom('fit-width', 1.07)).toBe(1.07);
    expect(effectiveStageZoom('fit-width', undefined)).toBe(STAGE_ZOOM_FALLBACK);
    expect(stageZoomPercent(1.07)).toBe('107%');
  });

  it('steps to the nearest visibly different level, including the measured fit', () => {
    expect(stepStageZoom('fit-width', 1.07, 1)).toBe('125');
    expect(stepStageZoom('fit-width', 1.07, -1)).toBe('100');
    expect(stepStageZoom('100', 1.07, 1)).toBe('fit-width');
    expect(stepStageZoom('75', 0.6, -1)).toBe('fit-width');
    expect(stepStageZoom('fit-width', 0.6, 1)).toBe('75');
    // Nothing above 125% / below 75% (when the fit is bigger): keep the current choice.
    expect(stepStageZoom('125', 1.07, 1)).toBe('125');
    expect(stepStageZoom('75', 1.07, -1)).toBe('75');
    // A fit equal to a preset is the same level: the step skips over both.
    expect(stepStageZoom('fit-width', 1, 1)).toBe('125');
    expect(stepStageZoom('75', 1, 1)).toBe('100');
    // Unmeasured fit is not a candidate.
    expect(stepStageZoom('75', undefined, 1)).toBe('100');
  });

  it('reads and writes the remembered choice and survives broken storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readStoredStageZoomChoice(storage)).toBe('fit-width');
    expect(writeStoredStageZoomChoice(storage, '125')).toBe(true);
    expect(values.get(STAGE_ZOOM_STORAGE_KEY)).toBe('125');
    expect(readStoredStageZoomChoice(storage)).toBe('125');
    values.set(STAGE_ZOOM_STORAGE_KEY, 'gigante');
    expect(readStoredStageZoomChoice(storage)).toBe('fit-width');

    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(readStoredStageZoomChoice(broken)).toBe('fit-width');
    expect(writeStoredStageZoomChoice(broken, '75')).toBe(false);
    expect(readStoredStageZoomChoice(undefined)).toBe('fit-width');
    expect(writeStoredStageZoomChoice(null, '75')).toBe(false);
  });

  it('turns one mouse-wheel notch into one step and a trackpad pinch into few steps', () => {
    const step = createStageZoomWheelStepper();
    expect(step({ deltaY: -100, deltaMode: 0, timeStamp: 0 })).toBe(1);
    expect(step({ deltaY: 100, deltaMode: 0, timeStamp: 10 })).toBe(-1);
    expect(step({ deltaY: 0, deltaMode: 0, timeStamp: 20 })).toBe(0);
    expect(step({ deltaY: 3, deltaMode: 1, timeStamp: 30 })).toBe(-1);

    const pinch = createStageZoomWheelStepper();
    const results = Array.from({ length: 10 }, (_, index) => pinch({ deltaY: -12, deltaMode: 0, timeStamp: index * 16 }));
    expect(results.filter((value) => value === 1)).toHaveLength(2);
    expect(results.some((value) => value === -1)).toBe(false);

    const idle = createStageZoomWheelStepper();
    expect(idle({ deltaY: -30, deltaMode: 0, timeStamp: 0 })).toBe(0);
    // After a pause the partial movement is forgotten.
    expect(idle({ deltaY: -30, deltaMode: 0, timeStamp: 1_000 })).toBe(0);
    expect(idle({ deltaY: -30, deltaMode: 0, timeStamp: 1_010 })).toBe(1);
  });
});
