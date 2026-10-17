import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ZoomControl } from '@/vnext/app/editor/ZoomControl';
import {
  STAGE_UNZOOM_CSS_VARIABLE,
  STAGE_ZOOM_CSS_VARIABLE,
  readStageZoomSnapshot,
  resetStageZoomStore,
  setStageZoomChoice,
  useStageZoom,
} from '@/vnext/app/editor/use-stage-zoom';
import { STAGE_ZOOM_STORAGE_KEY } from '@/vnext/editor/stage-zoom';

let previewWidth = 0;
let previewHeight = 0;
const resizeCallbacks: Array<() => void> = [];

class FakeResizeObserver {
  private readonly callback: () => void;
  constructor(callback: () => void) { this.callback = callback; resizeCallbacks.push(callback); }
  observe() {}
  disconnect() {
    const index = resizeCallbacks.indexOf(this.callback);
    if (index >= 0) resizeCallbacks.splice(index, 1);
  }
}

beforeEach(() => {
  previewWidth = 0;
  previewHeight = 0;
  resizeCallbacks.length = 0;
  window.localStorage.clear();
  resetStageZoomStore();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth(this: Element) {
    return this.classList.contains('vnext-document-preview') ? previewWidth : 0;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function clientHeight(this: Element) {
    return this.classList.contains('vnext-document-preview') ? previewHeight : 0;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function StageZoomReadout() {
  const { zoom, unzoom, choice } = useStageZoom();
  return <output aria-label="Leitura do zoom">{`${choice}:${zoom}:${unzoom.toFixed(2)}`}</output>;
}

/** Same DOM shape as EditorWorkspace: control in the canvas header, page in the preview. */
function Canvas({ withReadout = false }: { withReadout?: boolean }) {
  return (
    <main className="vnext-canvas-area" aria-label="Área da página">
      <div className="vnext-canvas-meta">
        <div><strong>Página 1 de 1</strong></div>
        <ZoomControl pageWidthMm={210} pageHeightMm={297} />
      </div>
      <div className="vnext-document-preview" style={{ paddingLeft: '24px', paddingRight: '24px' }}>
        <div className="vnext-page-stage" data-vnext-page-stage="" />
      </div>
      {withReadout && <StageZoomReadout />}
    </main>
  );
}

const canvas = () => screen.getByRole('main', { name: 'Área da página' });
const zoomGroup = () => screen.getByRole('group', { name: 'Zoom da página' });
/** FR-16b: the levels are a list named "Zoom", between the "−" and "+" buttons. */
const levels = () => within(zoomGroup()).getByRole('combobox', { name: 'Zoom' }) as HTMLSelectElement;
const choose = (label: string) => {
  const option = within(levels()).getByRole('option', { name: label }) as HTMLOptionElement;
  fireEvent.change(levels(), { target: { value: option.value } });
};
const shownLevel = () => levels().selectedOptions[0]?.textContent;
const zoomIn = () => within(zoomGroup()).getByRole('button', { name: 'Aumentar o zoom' });
const zoomOut = () => within(zoomGroup()).getByRole('button', { name: 'Diminuir o zoom' });
const resize = () => act(() => { for (const callback of [...resizeCallbacks]) callback(); });

describe('FR-16a/FR-16b ZoomControl', () => {
  it('starts on "Ajustar à largura", fits the A4 page to the canvas and shows the resulting size', () => {
    previewWidth = 900; // 900 - 48 padding - 2 safety = 850 px for a 793.7 px page
    render(<Canvas />);
    expect(shownLevel()).toBe('Ajustar à largura');
    expect(within(levels()).getAllByRole('option').map((option) => option.textContent))
      .toEqual(['Página inteira', 'Ajustar à largura', '75%', '100%', '125%']);
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.07');
    expect(canvas().style.getPropertyValue(STAGE_UNZOOM_CSS_VARIABLE)).toBe('0.9346');
    expect(within(zoomGroup()).getByText('107%')).toBeInTheDocument();
  });

  it('applies 75%, 100% and 125% and remembers the last choice on this computer', () => {
    previewWidth = 900;
    render(<Canvas />);
    choose('125%');
    expect(shownLevel()).toBe('125%');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.25');
    expect(canvas().style.getPropertyValue(STAGE_UNZOOM_CSS_VARIABLE)).toBe('0.8');
    expect(within(zoomGroup()).queryByText('107%')).toBeNull();
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('125');

    choose('75%');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.75');
    choose('100%');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1');
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('100');

    cleanup();
    resetStageZoomStore();
    render(<Canvas />);
    expect(shownLevel()).toBe('100%');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1');
  });

  it('keeps working when the browser blocks saved preferences', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    previewWidth = 900;
    render(<Canvas />);
    expect(shownLevel()).toBe('Ajustar à largura');
    choose('125%');
    expect(shownLevel()).toBe('125%');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.25');
  });

  it('re-fits when the canvas changes size and leaves the stylesheet default while unmeasured', () => {
    previewWidth = 0;
    render(<Canvas />);
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('');
    expect(readStageZoomSnapshot()).toMatchObject({ choice: 'fit-width', measured: false, zoom: 0.62 });

    previewWidth = 650; // (650 - 50) / 793.7 = 0.755
    resize();
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.75');
    expect(within(zoomGroup()).getByText('75%', { selector: '[data-stage-zoom-value]' })).toBeInTheDocument();

    previewWidth = 1300;
    resize();
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.57');
  });

  it('Ctrl + roda do mouse over the canvas steps the zoom and blocks the browser zoom', () => {
    previewWidth = 900; // fit = 1.07
    render(<Canvas />);
    const page = canvas().querySelector<HTMLElement>('[data-vnext-page-stage]')!;

    const plainScroll = fireEvent.wheel(page, { deltaY: -100 });
    expect(plainScroll).toBe(true);
    expect(shownLevel()).toBe('Ajustar à largura');

    const wheelIn = fireEvent.wheel(page, { deltaY: -100, ctrlKey: true });
    expect(wheelIn).toBe(false); // default prevented: the whole browser must not zoom
    expect(shownLevel()).toBe('125%');
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('125');

    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(shownLevel()).toBe('Ajustar à largura');
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(shownLevel()).toBe('100%');
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(shownLevel()).toBe('75%');
    // "Página inteira" cannot be measured here (no height), so 75% is the smallest level.
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(shownLevel()).toBe('75%');
  });

  it('FR-16b: "−" and "+" step through the levels and turn off at the ends', () => {
    previewWidth = 900; // fit width = 1.07
    previewHeight = 600; // (600 - 2) / 1122.5 = 0.53 for "Página inteira"
    render(<Canvas />);
    expect(shownLevel()).toBe('Ajustar à largura');
    fireEvent.click(zoomIn());
    expect(shownLevel()).toBe('125%');
    expect(zoomIn()).toBeDisabled();
    fireEvent.click(zoomOut());
    fireEvent.click(zoomOut());
    expect(shownLevel()).toBe('100%');
    fireEvent.click(zoomOut());
    expect(shownLevel()).toBe('75%');
    fireEvent.click(zoomOut());
    expect(shownLevel()).toBe('Página inteira');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.53');
    expect(within(zoomGroup()).getByText('53%', { selector: '[data-stage-zoom-value]' })).toBeInTheDocument();
    expect(zoomOut()).toBeDisabled();
    expect(zoomIn()).toBeEnabled();
  });

  it('FR-16b: "Página inteira" fits the whole page in the visible height and follows the window size', () => {
    previewWidth = 900;
    previewHeight = 600;
    render(<Canvas />);
    choose('Página inteira');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.53');
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('fit-page');
    // A taller page area is still limited by the window (768 px in jsdom): (768 - 2) / 1122.5 = 0.68.
    previewHeight = 1400;
    resize();
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.68');
    // A narrow page area: the width limits the page, like "Ajustar à largura": (500 - 50) / 793.7 = 0.56.
    previewWidth = 500;
    resize();
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.56');
  });

  it('shares one zoom with any editor part through useStageZoom() without a provider', () => {
    previewWidth = 900;
    render(<Canvas withReadout />);
    const readout = screen.getByRole('status', { name: 'Leitura do zoom' });
    expect(readout).toHaveTextContent('fit-width:1.07:0.93');
    choose('125%');
    expect(readout).toHaveTextContent('125:1.25:0.80');
  });

  it('renders on its own (outside the editor canvas) without touching the page', () => {
    render(<ZoomControl pageWidthMm={210} />);
    expect(shownLevel()).toBe('Ajustar à largura');
    choose('75%');
    expect(shownLevel()).toBe('75%');
  });

  it('removes its CSS variables when the editor closes', () => {
    previewWidth = 900;
    const { unmount } = render(<Canvas />);
    const area = canvas();
    expect(area.style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.07');
    unmount();
    expect(area.style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('');
  });
});

describe('FR-16b the page does not jump when the zoom changes', () => {
  type Box = { left: number; top: number; width: number; height: number };
  const box = ({ left, top, width, height }: Box) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

  /** Page area at (0, 100), 900 × 600, scrolling; the A4 stage drawn at the published zoom, 24/4 px inside it. */
  function scrollingCanvas() {
    previewWidth = 900; // fit width = 1.07
    render(<Canvas />);
    const preview = canvas().querySelector<HTMLElement>('.vnext-document-preview')!;
    preview.style.overflowX = 'auto';
    preview.style.overflowY = 'auto';
    const scroll = { x: 0, y: 0 };
    Object.defineProperty(preview, 'scrollLeft', { configurable: true, get: () => scroll.x, set: (value: number) => { scroll.x = Math.min(2000, Math.max(0, value)); } });
    Object.defineProperty(preview, 'scrollTop', { configurable: true, get: () => scroll.y, set: (value: number) => { scroll.y = Math.min(4000, Math.max(0, value)); } });
    const zoom = () => Number(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)) || 0.62;
    const stageBox = () => box({ left: 24 - scroll.x, top: 104 - scroll.y, width: 793.7 * zoom(), height: 1122.5 * zoom() });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: Element) {
      if (this.classList.contains('vnext-document-preview')) return box({ left: 0, top: 100, width: 900, height: 600 });
      if (this.hasAttribute('data-vnext-page-stage')) return stageBox();
      return box({ left: 0, top: 0, width: 0, height: 0 });
    });
    /** Point of the page (page CSS px) under a screen point. */
    const pagePointAt = (clientX: number, clientY: number) => {
      const stage = stageBox();
      return { x: (clientX - stage.left) / zoom(), y: (clientY - stage.top) / zoom() };
    };
    return { scroll, zoom, pagePointAt, page: canvas().querySelector<HTMLElement>('[data-vnext-page-stage]')! };
  }

  it('Ctrl + roda keeps the point under the mouse in place', () => {
    const { scroll, zoom, pagePointAt, page } = scrollingCanvas();
    choose('100%');
    scroll.x = 0;
    scroll.y = 200;
    const before = pagePointAt(300, 400);
    fireEvent.wheel(page, { deltaY: -100, ctrlKey: true, clientX: 300, clientY: 400 });
    expect(zoom()).toBe(1.07);
    const after = pagePointAt(300, 400);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(scroll.y).toBeCloseTo(234.72, 2);
  });

  it('"−", "+" and the list keep the centre of the visible page area in place', () => {
    const { scroll, zoom, pagePointAt } = scrollingCanvas();
    choose('100%');
    scroll.y = 300;
    // Centre of the page area (0..900 × 100..700).
    const centre = pagePointAt(450, 400);
    fireEvent.click(zoomIn());
    expect(zoom()).toBe(1.07);
    expect(pagePointAt(450, 400).y).toBeCloseTo(centre.y, 6);
    expect(pagePointAt(450, 400).x).toBeCloseTo(centre.x, 6);
    choose('75%');
    expect(zoom()).toBe(0.75);
    expect(pagePointAt(450, 400).y).toBeCloseTo(centre.y, 6);
  });

  it('does not scroll when the zoom does not change, nor later on a change the person did not make', () => {
    const { scroll, page } = scrollingCanvas();
    choose('125%');
    scroll.y = 500;
    // Already the biggest level: nothing changes and nothing is remembered.
    fireEvent.wheel(page, { deltaY: -100, ctrlKey: true, clientX: 300, clientY: 400 });
    expect(shownLevel()).toBe('125%');
    expect(scroll.y).toBe(500);
    act(() => setStageZoomChoice('fit-width'));
    expect(scroll.y).toBe(500);
  });
});
