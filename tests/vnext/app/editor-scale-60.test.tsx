import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import type { CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { ZoomControl } from '@/vnext/app/editor/ZoomControl';
import { STAGE_UNZOOM_CSS_VARIABLE, STAGE_ZOOM_CSS_VARIABLE, resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';

/**
 * FR-16b — escala para 60+ no modo simples (o editor que o pai usa): só a interface cresce.
 * Texto de interface >= 15 px (secundário >= 13 px), ações principais >= 44 px de altura,
 * alças e seletores da página >= 24 px na tela em qualquer zoom; o desenho impresso não muda.
 */

const STYLES = readFileSync(resolve(process.cwd(), 'src/vnext/app/styles.css'), 'utf8');
const PRIMITIVES = readFileSync(resolve(process.cwd(), 'src/vnext/app/product-primitives.css'), 'utf8');
const SCALE_START = 'FR-16b:escala-60:inicio';
const SCALE_END = 'FR-16b:escala-60:fim';
const SIMPLE = '.vnext-shell[data-simple-by-default="true"]';

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
  document.head.querySelectorAll('style[data-test-css]').forEach((style) => style.remove());
});

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function shapeDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('scale-seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'shape-target', type: 'shape', frame: { xMm: 20, yMm: 30, widthMm: 40, heightMm: 50 }, zIndex: 0,
        shape: 'rectangle', style: { fill: '#edf5ff' },
      }],
    }],
  };
}

function renderEditor() {
  for (const css of [PRIMITIVES, STYLES]) {
    const style = document.createElement('style');
    style.setAttribute('data-test-css', '');
    style.textContent = css;
    document.head.append(style);
  }
  const session = createDocumentSession(shapeDocument(), {
    createId: ids('scale-generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
  return render(<EditorWorkspace session={session} simpleByDefault />);
}

/** The rules between the FR-16b markers, as `{ selector, body }` (no nested blocks inside a media query). */
function scaleRules(): Array<{ selector: string; body: string }> {
  const start = STYLES.indexOf(SCALE_START);
  const end = STYLES.indexOf(SCALE_END);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = STYLES.slice(STYLES.indexOf('*/', start) + 2, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Array<{ selector: string; body: string }> = [];
  for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/@media[^{]*\{/g, '').trim();
    if (selector.startsWith('@media')) continue;
    rules.push({ selector: selector.replace(/^.*\{/, '').trim(), body: match[2] });
  }
  return rules;
}

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  expect(Number.isFinite(parsed), `"${value}" is not a px value`).toBe(true);
  return parsed;
}

describe('FR-16b escala 60+ (só a interface)', () => {
  it('applies only to the simple mode and never to the printed drawing of the page', () => {
    const rules = scaleRules();
    expect(rules.length).toBeGreaterThan(40);
    for (const { selector, body } of rules) {
      for (const part of selector.split(',').map((item) => item.trim()).filter(Boolean)) {
        expect(part.startsWith(SIMPLE), part).toBe(true);
        expect(part).not.toMatch(/editorial|data-page-id|data-object-id/);
      }
      // Same navy/white look: the block changes sizes only, never colours.
      expect(body, selector).not.toMatch(/(?:^|;|\s)(?:color|background(?:-color)?)\s*:/);
    }
  });

  it('never writes interface text smaller than 13 px', () => {
    for (const { selector, body } of scaleRules()) {
      for (const match of body.matchAll(/font-size:\s*([\d.]+)px/g)) {
        expect(Number(match[1]), selector).toBeGreaterThanOrEqual(13);
      }
    }
    // The shared buttons, fields and messages used by the dialogs follow the same scale.
    const primitiveSizes = [...PRIMITIVES.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));
    expect(Math.min(...primitiveSizes)).toBeGreaterThanOrEqual(13);
  });

  it('draws the editor chrome with 15 px text and 44 px main actions', () => {
    const { container } = renderEditor();
    const main = (element: Element | null, label: string) => {
      expect(element, label).toBeTruthy();
      const style = getComputedStyle(element!);
      expect(px(style.fontSize), `${label} text`).toBeGreaterThanOrEqual(15);
      expect(px(style.minHeight), `${label} height`).toBeGreaterThanOrEqual(44);
    };
    main(container.querySelector('.vnext-actions button'), 'top bar action');
    main(container.querySelector('.vnext-page-list button'), 'page in the page list');
    main(container.querySelector('.vnext-add-page'), '"Adicionar página"');
    main(container.querySelector('.vnext-tool-group button'), 'toolbar button');
    main(screen.getByRole('combobox', { name: 'Zoom' }), 'zoom levels');
    main(within(screen.getByRole('tablist', { name: 'Painel da direita' })).getByRole('tab', { name: 'Propriedades' }), '"Propriedades" tab');
    expect(px(getComputedStyle(screen.getByRole('button', { name: 'Aumentar o zoom' })).minHeight)).toBeGreaterThanOrEqual(44);
    expect(px(getComputedStyle(container.querySelector('.vnext-canvas-meta strong')!).fontSize)).toBeGreaterThanOrEqual(15);

    // With an object selected, the buttons of "Propriedades" are main actions too.
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 7, button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(hit, { pointerId: 7, button: 0, clientX: 40, clientY: 40 });
    main(container.querySelector('.vnext-info button'), 'button in "Propriedades"');
    expect(px(getComputedStyle(container.querySelector('.vnext-info h2')!).fontSize)).toBeGreaterThanOrEqual(15);
  });

  it('keeps the toolbar above the page at one height whether something is selected or not (the sheet does not jump)', () => {
    const rule = (selector: string) => {
      const start = STYLES.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThan(-1);
      return STYLES.slice(start, STYLES.indexOf('}', start));
    };
    const primary = `${SIMPLE} .vnext-toolbar-primary`;
    // "Duplicar", "Excluir" and "Editar …" (children 6+) always go to their own second line…
    expect(rule(`${primary} > :nth-child(n+6)`)).toMatch(/order:\s*2/);
    expect(rule(`${primary}::after`)).toMatch(/order:\s*1;\s*flex:\s*1 0 100%;\s*height:\s*0/);
    // …which holds a plain hint, one button tall, while nothing is selected.
    const hint = rule(`${primary}:not(:has(> :nth-child(6)))::after`);
    expect(hint).toContain("content: 'Clique em um objeto da página para duplicar, excluir ou editar.'");
    expect(hint).toMatch(/height:\s*44px;\s*margin-bottom:\s*6px/);
    expect(px(hint.match(/font-size:\s*([\d.]+px)/)?.[1] ?? '')).toBeGreaterThanOrEqual(13);
    // "Mais opções" shares the first line instead of wrapping to a line of its own.
    expect(rule(`${primary}`)).toMatch(/flex:\s*1 1 0%;\s*min-width:\s*0/);

    const { container } = renderEditor();
    const buttons = [...container.querySelectorAll('.vnext-toolbar-primary > button')].map((button) => button.textContent);
    expect(buttons).toEqual(['Texto', 'Imagem', 'Tabela', 'Tamanho da nova tabela', 'Colar tabela do Excel']);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 8, button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(hit, { pointerId: 8, button: 0, clientX: 40, clientY: 40 });
    // The buttons that need a selection come after the first five, so the CSS above puts them on the second line.
    expect([...container.querySelectorAll('.vnext-toolbar-primary > button')].slice(5).map((button) => button.textContent))
      .toEqual(['Duplicar', 'Excluir']);
  });

  it('gives the resize handles and the table selectors 24 px on screen at every zoom', () => {
    const handle = STYLES.match(/\.vnext-resize-handle\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(handle).toMatch(/width:\s*calc\(24px \* var\(--vnext-stage-unzoom, 1\)\)/);
    expect(handle).toMatch(/height:\s*calc\(24px \* var\(--vnext-stage-unzoom, 1\)\)/);
    expect(STYLES).toMatch(/\.vnext-table-row-selector\s*\{\s*min-width:\s*calc\(24px \* var\(--vnext-stage-unzoom, 1\)\)/);
    expect(STYLES).toMatch(/\.vnext-table-column-selector\s*\{\s*min-height:\s*calc\(24px \* var\(--vnext-stage-unzoom, 1\)\)/);

    // The zoom control publishes `--vnext-stage-unzoom` (rounded up), so 24 px × unzoom × zoom never ends below 24 px.
    const canvas = document.createElement('main');
    canvas.className = 'vnext-canvas-area';
    document.body.append(canvas);
    try {
      render(<ZoomControl pageWidthMm={210} />, { container: canvas });
      const levels = screen.getByRole('combobox', { name: 'Zoom' });
      for (const value of ['75', '100', '125']) {
        fireEvent.change(levels, { target: { value } });
        const zoom = Number(canvas.style.getPropertyValue(STAGE_ZOOM_CSS_VARIABLE));
        const unzoom = Number(canvas.style.getPropertyValue(STAGE_UNZOOM_CSS_VARIABLE));
        expect(zoom).toBe(Number(value) / 100);
        expect(24 * unzoom * zoom).toBeGreaterThanOrEqual(24);
        expect(24 * unzoom * zoom).toBeLessThan(24.01);
      }
    } finally {
      cleanup();
      canvas.remove();
    }
  });
});
