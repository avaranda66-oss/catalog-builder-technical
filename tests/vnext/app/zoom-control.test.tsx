import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ZoomControl } from '@/vnext/app/editor/ZoomControl';
import {
  STAGE_UNZOOM_CSS_VARIABLE,
  STAGE_ZOOM_CSS_VARIABLE,
  readStageZoomSnapshot,
  resetStageZoomStore,
  useStageZoom,
} from '@/vnext/app/editor/use-stage-zoom';
import { STAGE_ZOOM_STORAGE_KEY } from '@/vnext/editor/stage-zoom';

let previewWidth = 0;
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
  resizeCallbacks.length = 0;
  window.localStorage.clear();
  resetStageZoomStore();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function clientWidth(this: Element) {
    return this.classList.contains('vnext-document-preview') ? previewWidth : 0;
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
        <ZoomControl pageWidthMm={210} />
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
const option = (name: string) => within(zoomGroup()).getByRole('button', { name });

describe('FR-16a ZoomControl', () => {
  it('starts on "Ajustar à largura", fits the A4 page to the canvas and shows the resulting size', () => {
    previewWidth = 900; // 900 - 48 padding - 2 safety = 850 px for a 793.7 px page
    render(<Canvas />);
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['75%', '100%', '125%']) expect(option(name)).toHaveAttribute('aria-pressed', 'false');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.07');
    expect(canvas().style.getPropertyValue(STAGE_UNZOOM_CSS_VARIABLE)).toBe('0.9346');
    expect(within(zoomGroup()).getByText('107%')).toBeInTheDocument();
  });

  it('applies 75%, 100% and 125% and remembers the last choice on this computer', () => {
    previewWidth = 900;
    render(<Canvas />);
    fireEvent.click(option('125%'));
    expect(option('125%')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'false');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.25');
    expect(canvas().style.getPropertyValue(STAGE_UNZOOM_CSS_VARIABLE)).toBe('0.8');
    expect(within(zoomGroup()).queryByText('107%')).toBeNull();
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('125');

    fireEvent.click(option('75%'));
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.75');
    fireEvent.click(option('100%'));
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1');
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('100');

    cleanup();
    resetStageZoomStore();
    render(<Canvas />);
    expect(option('100%')).toHaveAttribute('aria-pressed', 'true');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1');
  });

  it('keeps working when the browser blocks saved preferences', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    previewWidth = 900;
    render(<Canvas />);
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(option('125%'));
    expect(option('125%')).toHaveAttribute('aria-pressed', 'true');
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.25');
  });

  it('re-fits when the canvas changes size and leaves the stylesheet default while unmeasured', () => {
    previewWidth = 0;
    render(<Canvas />);
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('');
    expect(readStageZoomSnapshot()).toMatchObject({ choice: 'fit-width', measured: false, zoom: 0.62 });

    previewWidth = 650; // (650 - 50) / 793.7 = 0.755
    act(() => { for (const callback of [...resizeCallbacks]) callback(); });
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('0.75');
    expect(within(zoomGroup()).getByText('75%', { selector: '[data-stage-zoom-value]' })).toBeInTheDocument();

    previewWidth = 1300;
    act(() => { for (const callback of [...resizeCallbacks]) callback(); });
    expect(canvas().style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.57');
  });

  it('Ctrl + roda do mouse over the canvas steps the zoom and blocks the browser zoom', () => {
    previewWidth = 900; // fit = 1.07
    render(<Canvas />);
    const page = canvas().querySelector<HTMLElement>('[data-vnext-page-stage]')!;

    const plainScroll = fireEvent.wheel(page, { deltaY: -100 });
    expect(plainScroll).toBe(true);
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'true');

    const zoomIn = fireEvent.wheel(page, { deltaY: -100, ctrlKey: true });
    expect(zoomIn).toBe(false); // default prevented: the whole browser must not zoom
    expect(option('125%')).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(STAGE_ZOOM_STORAGE_KEY)).toBe('125');

    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(option('100%')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(option('75%')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.wheel(page, { deltaY: 100, ctrlKey: true });
    expect(option('75%')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shares one zoom with any editor part through useStageZoom() without a provider', () => {
    previewWidth = 900;
    render(<Canvas withReadout />);
    const readout = screen.getByRole('status', { name: 'Leitura do zoom' });
    expect(readout).toHaveTextContent('fit-width:1.07:0.93');
    fireEvent.click(option('125%'));
    expect(readout).toHaveTextContent('125:1.25:0.80');
  });

  it('renders on its own (outside the editor canvas) without touching the page', () => {
    render(<ZoomControl pageWidthMm={210} />);
    expect(option('Ajustar à largura')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(option('75%'));
    expect(option('75%')).toHaveAttribute('aria-pressed', 'true');
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
