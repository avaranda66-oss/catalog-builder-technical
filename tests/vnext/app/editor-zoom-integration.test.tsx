import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { VNextApp } from '@/vnext/app/VNextApp';
import { STAGE_ZOOM_CSS_VARIABLE, resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';

const CSS_PX_PER_MM = 96 / 25.4;

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  window.localStorage.clear();
  resetStageZoomStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function shapeSession() {
  const base = createW2CDemoDocument(ids('zoom-seed'));
  const document: CatalogDocument = {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'shape-target',
        type: 'shape',
        frame: { xMm: 20, yMm: 30, widthMm: 40, heightMm: 50 },
        zIndex: 0,
        shape: 'rectangle',
        style: { fill: '#edf5ff' },
      }],
    }],
  };
  return createDocumentSession(document, {
    createId: ids('zoom-generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
}

/** jsdom has no layout: simulate the page as the browser draws it at `scale`. */
function setRenderedPageScale(container: HTMLElement, scale: number) {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  const width = 210 * CSS_PX_PER_MM * scale;
  const height = 297 * CSS_PX_PER_MM * scale;
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) });
}

describe('FR-16a zoom inside the editor', () => {
  it('shows the zoom buttons in the page header and zooms only the page stage', () => {
    const { container } = render(<VNextApp session={shapeSession()} />);
    const header = container.querySelector<HTMLElement>('.vnext-canvas-meta')!;
    const zoom = within(header).getByRole('group', { name: 'Zoom da página' });
    expect(within(header).getByText('Página 1 de 1')).toBeInTheDocument();
    expect(within(zoom).getByRole('button', { name: 'Ajustar à largura' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(zoom).getByRole('button', { name: '125%' }));
    const canvasArea = container.querySelector<HTMLElement>('main.vnext-canvas-area')!;
    expect(canvasArea.style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE)).toBe('1.25');
    expect(canvasArea.querySelector('[data-vnext-page-stage]')).toBeTruthy();
    // The measured page (diagnostics probe) is never inside the zoomed area.
    const probe = container.querySelector('[data-editor-diagnostics-probe]');
    expect(probe).toBeTruthy();
    expect(probe!.closest('.vnext-canvas-area')).toBeNull();
  });

  it.each([
    ['75%', 0.75],
    ['100%', 1],
    ['125%', 1.25],
  ])('moves an object by the same millimetres at %s (gestures use the drawn page size)', (label, scale) => {
    const session = shapeSession();
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    fireEvent.click(within(container.querySelector<HTMLElement>('.vnext-canvas-meta')!).getByRole('button', { name: label }));
    setRenderedPageScale(container, scale);
    const pxPerMm = CSS_PX_PER_MM * scale;
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 7, clientX: 100 + 10 * pxPerMm, clientY: 100 + 10 * pxPerMm });
    fireEvent.pointerUp(hit, { pointerId: 7, button: 0, clientX: 100 + 10 * pxPerMm, clientY: 100 + 10 * pxPerMm });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].type).toBe('object.move');
    const frame = session.getSnapshot().document.pages[0].objects[0].frame;
    expect(frame.xMm).toBeCloseTo(30, 2);
    expect(frame.yMm).toBeCloseTo(40, 2);
    expect(frame.widthMm).toBe(40);
    expect(frame.heightMm).toBe(50);
  });
});
