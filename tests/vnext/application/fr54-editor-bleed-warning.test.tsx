import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';

/**
 * FR-54 in the editor DOM. editor-workspace.test.tsx proves the blocking ERROR at -4 mm; this file protects the
 * bleed path (shape at -1 mm): EditorWorkspace → projectLayoutDiagnostics → `<li class="is-warning">` with
 * "Revisão recomendada" and the father's bleed sentence. Same seed document as editor-workspace.test.tsx
 * (replicated here, that file is Equipe A territory).
 */

afterEach(cleanup);

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
});

function ids(prefix = 'ui') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function seedSafeAreaDocument(frame = { xMm: 5, yMm: 20, widthMm: 40, heightMm: 50 }): CatalogDocument {
  const base = createW2CDemoDocument(ids('seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: [{
        id: 'shape-target',
        type: 'shape',
        frame,
        zIndex: 0,
        shape: 'rectangle',
        style: { fill: '#edf5ff' },
      }],
    }],
  };
}

function setPageRect(container: HTMLElement, width = 420, height = 594): HTMLElement {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  });
  return page;
}

function openEditorWithSelectedShape() {
  const session = createDocumentSession(seedSafeAreaDocument(), {
    createId: ids('generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
  const { container } = render(<VNextApp session={session} />);
  setPageRect(container);
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]');
  if (!hit) throw new Error('Missing shape hit target');
  fireEvent.pointerDown(hit, { pointerId: 54, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 54, button: 0, clientX: 100, clientY: 100 });
  const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]');
  if (!x) throw new Error('Missing X inspector field');
  return { session, container, x };
}

const setX = (x: HTMLInputElement, value: string) => {
  fireEvent.change(x, { target: { value } });
  fireEvent.blur(x);
};

const OUTSIDE = (severity: 'WARNING' | 'ERROR') =>
  `li.is-${severity.toLowerCase()}[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"][data-diagnostic-severity="${severity}"]`;

describe('FR-54 bleed warning in the editor diagnostics panel', () => {
  it('a shape 1 mm outside the page shows a yellow "Revisão recomendada" bleed warning, without moving the shape', async () => {
    const { session, container, x } = openEditorWithSelectedShape();
    await waitFor(() => {
      expect(container.querySelector('[data-diagnostic-code="SAFE_AREA_VIOLATION"][data-diagnostic-severity="WARNING"]')).toBeTruthy();
    });

    setX(x, '-1');
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-1);

    await waitFor(() => expect(container.querySelector(OUTSIDE('WARNING'))).toBeTruthy());
    const warning = container.querySelector<HTMLLIElement>(OUTSIDE('WARNING'))!;
    expect(warning.textContent).toContain('Aviso');
    expect(warning.textContent).toContain('Revisão recomendada');
    expect(warning.textContent).toContain('sangria');
    expect(warning.textContent).toContain('sai 1 mm da página');
    expect(warning.textContent).not.toContain('Bloqueia publicação');
    expect(warning.textContent).not.toMatch(/OBJECT_OUTSIDE_PAGE|bleedMm|tabela/);
    expect(container.querySelector(OUTSIDE('ERROR'))).toBeNull();
    // Touching the left edge frees that side from the safe-area warning; the shape ends at 39 mm, inside the right margin.
    expect(container.querySelector('[data-diagnostic-code="SAFE_AREA_VIOLATION"]')).toBeNull();
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-1);
  });

  it('the same shape at -4 mm turns into the red blocking error, and an explicit correction clears it', async () => {
    const { session, container, x } = openEditorWithSelectedShape();
    setX(x, '-1');
    await waitFor(() => expect(container.querySelector(OUTSIDE('WARNING'))).toBeTruthy());

    setX(x, '-4');
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-4);
    await waitFor(() => expect(container.querySelector(OUTSIDE('ERROR'))).toBeTruthy());
    const error = container.querySelector<HTMLLIElement>(OUTSIDE('ERROR'))!;
    expect(error.textContent).toContain('Erro');
    expect(error.textContent).toContain('Bloqueia publicação');
    expect(error.textContent).toContain('fora da página');
    expect(error.textContent).not.toContain('tabela');
    expect(container.querySelector(OUTSIDE('WARNING'))).toBeNull();

    setX(x, '20');
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(20);
    await waitFor(() => expect(container.querySelector('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"]')).toBeNull());
  });
});
