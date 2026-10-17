import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { assistantSelectionLabel } from '@/vnext/app/editor/AssistantDock';
import { resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';

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

function textDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('assistant-seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        // No digits: the Gemini rewrite only offers itself for plain editorial prose (no technical values).
        text: plainRichText('text-local', 'Termômetro de precisão para laboratório'),
        style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
      }],
    }],
  };
}

function setup({ simpleByDefault = true } = {}) {
  const session = createDocumentSession(textDocument(), {
    createId: ids('assistant-generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
  return { session, ...render(<EditorWorkspace session={session} simpleByDefault={simpleByDefault} />) };
}

function selectText(container: HTMLElement) {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
  fireEvent.pointerDown(hit, { pointerId: 31, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId: 31, button: 0, clientX: 80, clientY: 80 });
  return hit;
}

const tabs = () => within(screen.getByRole('tablist', { name: 'Painel da direita' }));
const propertiesTab = () => tabs().getByRole('tab', { name: 'Propriedades' });
const assistantTab = () => tabs().getByRole('tab', { name: 'Assistente' });
const properties = () => screen.queryByRole('complementary', { name: 'Propriedades do objeto' });
const assistant = () => screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' });

function injectEditorCss() {
  for (const file of ['src/vnext/app/product-primitives.css', 'src/vnext/app/styles.css']) {
    const style = document.createElement('style');
    style.setAttribute('data-test-css', '');
    style.textContent = readFileSync(resolve(process.cwd(), file), 'utf8');
    document.head.append(style);
  }
}

describe('FR-17 assistant as a tab next to "Propriedades"', () => {
  it('shows "Propriedades | Assistente" on top of the right column, with the properties first', () => {
    const { container } = setup();
    const column = container.querySelector<HTMLElement>('.vnext-side-column')!;
    expect(column).toContainElement(screen.getByRole('tablist', { name: 'Painel da direita' }));
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
    expect(assistantTab()).toHaveAttribute('aria-selected', 'false');
    expect(properties()).toBeVisible();
    expect(assistant()).toBeNull();
  });

  it('puts the assistant in the same column, in place of the properties, and goes back with "Propriedades"', () => {
    const { container } = setup();
    fireEvent.click(assistantTab());
    const panel = assistant()!;
    expect(panel).toBeVisible();
    expect(container.querySelector('.vnext-side-column')).toContainElement(panel);
    expect(properties()).toBeNull();
    expect(assistantTab()).toHaveAttribute('aria-selected', 'true');
    // The top bar button follows the tab.
    expect(screen.getByRole('button', { name: 'Fechar assistente de edição' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(propertiesTab());
    expect(properties()).toBeVisible();
    expect(assistant()).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir assistente de edição' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the "Assistente" tab from the top bar button and closes it with "Fechar" or Esc', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente de edição' }));
    expect(assistantTab()).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(within(assistant()!).getByRole('button', { name: 'Fechar painel do assistente' }));
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(assistantTab());
    fireEvent.keyDown(within(assistant()!).getByRole('tab', { name: 'Criar com Gemini' }), { key: 'Escape' });
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
    expect(assistant()).toBeNull();
  });

  it('keeps the selection on the page and says what the assistant sees selected', () => {
    const { container } = setup();
    fireEvent.click(assistantTab());
    expect(within(assistant()!).getByText('Nada selecionado na página')).toBeInTheDocument();
    fireEvent.click(propertiesTab());

    const hit = selectText(container);
    expect(hit).toHaveAttribute('data-selected', 'true');
    fireEvent.click(assistantTab());
    expect(within(assistant()!).getByText('Selecionado na página: texto')).toBeInTheDocument();
    // The Gemini assistant offers to work on the selected text.
    expect(within(assistant()!).getByRole('button', { name: 'Reescrever este texto com Gemini' })).toBeInTheDocument();
    expect(container.querySelector('[data-editor-object-id="text-target"]')).toHaveAttribute('data-selected', 'true');

    fireEvent.click(propertiesTab());
    expect(container.querySelector('[data-editor-object-id="text-target"]')).toHaveAttribute('data-selected', 'true');
    expect(container.querySelector('.vnext-info h2')).toHaveTextContent('Texto');
  });

  it('keeps what was typed in the assistant when going to "Propriedades" and back', () => {
    setup();
    fireEvent.click(assistantTab());
    fireEvent.click(within(assistant()!).getByRole('tab', { name: 'Ferramentas' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Peça uma alteração' }), { target: { value: 'Deixe as tabelas mais compactas' } });
    fireEvent.click(propertiesTab());
    fireEvent.click(assistantTab());
    expect(screen.getByRole('textbox', { name: 'Peça uma alteração' })).toHaveValue('Deixe as tabelas mais compactas');
    // Coming back puts the cursor in the request field.
    expect(screen.getByRole('textbox', { name: 'Peça uma alteração' })).toHaveFocus();
  });

  it('moves between the tabs with the arrow keys', () => {
    setup();
    fireEvent.keyDown(propertiesTab(), { key: 'ArrowRight' });
    expect(assistantTab()).toHaveAttribute('aria-selected', 'true');
    expect(assistantTab()).toHaveFocus();
    fireEvent.keyDown(assistantTab(), { key: 'ArrowRight' });
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(propertiesTab(), { key: 'End' });
    expect(assistantTab()).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(assistantTab(), { key: 'Home' });
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps one right column of the same width with the assistant open, and is a fixed panel only below 900 px', () => {
    injectEditorCss();
    const { container } = setup();
    const workspace = container.querySelector<HTMLElement>('.vnext-workspace')!;
    const columns = getComputedStyle(workspace).gridTemplateColumns;
    fireEvent.click(assistantTab());
    expect(getComputedStyle(workspace).gridTemplateColumns).toBe(columns);
    // On a computer screen the panel flows in the column (jsdom applies no media query: the < 900 px overlay is not active).
    expect(getComputedStyle(assistant()!).position).not.toBe('fixed');
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/styles.css'), 'utf8');
    expect(css).not.toMatch(/max-width:\s*1420px/);
    expect(css).not.toMatch(/data-assistant-open="true"\]\s*\.vnext-workspace/);
    const overlay = css.slice(css.indexOf('FR-17: only on a small screen'));
    expect(overlay).toMatch(/position:\s*fixed/);
    expect(css.slice(0, css.indexOf('FR-17: only on a small screen')).lastIndexOf('@media (max-width: 900px)'))
      .toBeGreaterThan(css.lastIndexOf('}', css.indexOf('FR-17: only on a small screen')) - 400);
  });

  it('names the panel under the tabs after the chosen tab, and every control points at a panel that exists', () => {
    setup();
    // Before the first opening the (empty, hidden) assistant panel already exists for the top bar button.
    const topBar = screen.getByRole('button', { name: 'Abrir assistente de edição' });
    const controlled = document.getElementById(topBar.getAttribute('aria-controls')!);
    expect(controlled).toHaveAttribute('hidden');
    expect(controlled).toBeEmptyDOMElement();
    for (const tab of [propertiesTab(), assistantTab()]) {
      expect(document.getElementById(tab.getAttribute('aria-controls')!)).toHaveAttribute('role', 'tabpanel');
    }
    const panel = screen.getByRole('tabpanel', { name: 'Propriedades' });
    expect(panel).toContainElement(properties());

    fireEvent.click(assistantTab());
    expect(screen.getByRole('tabpanel', { name: 'Assistente' })).toContainElement(assistant());
    // Each panel keeps its own landmark name.
    expect(assistant()).toHaveAccessibleName('Assistente do catálogo atual');
  });

  it('gives the keyboard focus back to what opened the assistant when it closes from inside', () => {
    setup();
    // Opened from the top bar button: "Fechar" goes back to it.
    const topBar = screen.getByRole('button', { name: 'Abrir assistente de edição' });
    topBar.focus();
    fireEvent.click(topBar);
    const close = within(assistant()!).getByRole('button', { name: 'Fechar painel do assistente' });
    close.focus();
    fireEvent.click(close);
    expect(screen.getByRole('button', { name: 'Abrir assistente de edição' })).toHaveFocus();

    // Opened from the "Assistente" tab: Esc goes back to the tab.
    assistantTab().focus();
    fireEvent.click(assistantTab());
    const field = screen.getByRole('textbox', { name: /Pe[çc]a|Descreva|pedido/i });
    field.focus();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
    expect(assistantTab()).toHaveFocus();
  });

  it('falls back to the "Assistente" tab when nothing had the focus before it opened', () => {
    setup();
    fireEvent.click(assistantTab());
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(within(assistant()!).getByRole('button', { name: 'Fechar painel do assistente' }));
    expect(assistantTab()).toHaveFocus();
  });

  it('shows "Propriedades" when a problem is chosen ("Corrigir este item"), keeping what was typed in the assistant', () => {
    const { session, rerender } = setup();
    fireEvent.click(assistantTab());
    fireEvent.click(within(assistant()!).getByRole('tab', { name: 'Ferramentas' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Peça uma alteração' }), { target: { value: 'Deixe as tabelas mais compactas' } });
    const pageId = session.getSnapshot().document.pages[0].id;
    rerender(<EditorWorkspace session={session} simpleByDefault locateRequest={{
      id: 1,
      diagnostic: { code: 'SAFE_AREA_VIOLATION', severity: 'WARNING', details: 'Fora da área segura', pageId, objectId: 'text-target' },
    }} />);
    expect(propertiesTab()).toHaveAttribute('aria-selected', 'true');
    expect(properties()).toBeVisible();
    expect(document.querySelector('[data-editor-object-id="text-target"]')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(assistantTab());
    expect(screen.getByRole('textbox', { name: 'Peça uma alteração' })).toHaveValue('Deixe as tabelas mais compactas');
  });

  it('has no tabs and no assistant in the full (advanced) mode', () => {
    setup({ simpleByDefault: false });
    expect(screen.queryByRole('tablist', { name: 'Painel da direita' })).toBeNull();
    expect(properties()).toBeVisible();
  });

  it('describes the selection in plain words', () => {
    expect(assistantSelectionLabel({ count: 0 })).toBe('Nada selecionado na página');
    expect(assistantSelectionLabel({ count: 1, type: 'table' })).toBe('Selecionado na página: tabela');
    expect(assistantSelectionLabel({ count: 1, type: 'image' })).toBe('Selecionado na página: imagem');
    expect(assistantSelectionLabel({ count: 1, type: 'icon' })).toBe('Selecionado na página: ícone');
    expect(assistantSelectionLabel({ count: 3 })).toBe('3 objetos selecionados na página');
  });
});
