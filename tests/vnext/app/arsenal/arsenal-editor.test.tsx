import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';
import { ACTORS, seededStore, testRuntime, viewerOf, type TestRuntime } from './arsenal-doubles';

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

function textDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('arsenal-seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        text: plainRichText('text-local', 'Termômetro de precisão para laboratório'),
        style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
      }],
    }],
  };
}

async function setup({ withArsenal = true, simpleByDefault = true } = {}) {
  const session = createDocumentSession(textDocument(), {
    createId: ids('arsenal-generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
  const { store } = await seededStore();
  const runtime: TestRuntime = testRuntime(store.as({ ...ACTORS.author }), viewerOf(ACTORS.author));
  const view = render(<EditorWorkspace session={session} simpleByDefault={simpleByDefault} arsenal={withArsenal ? runtime : undefined} />);
  return { session, runtime, ...view };
}

function selectText(container: HTMLElement) {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
  page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]')!;
  fireEvent.pointerDown(hit, { pointerId: 31, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId: 31, button: 0, clientX: 80, clientY: 80 });
}

const arsenalPanel = () => screen.queryByRole('complementary', { name: 'Arsenal' });
const properties = () => screen.queryByRole('complementary', { name: 'Propriedades do objeto' });
const card = (name: string) => screen.getByText(name, { selector: 'h4' }).closest('li')!;

describe('Onda 4.5 — Arsenal no editor', () => {
  it('abre pelo botão perto de "Usar modelo…" e pela barra, no lugar de "Propriedades"', async () => {
    const { container } = await setup();
    const near = container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal"]')!;
    const toolbar = container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal-toolbar"]')!;
    expect(near).toHaveTextContent('Arsenal…');
    expect(near.closest('.vnext-pages')).not.toBeNull();
    expect(toolbar.closest('.vnext-authoring-toolbar')).not.toBeNull();
    expect(near).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(near);
    expect(arsenalPanel()).toBeVisible();
    expect(properties()).toBeNull();
    expect(near).toHaveAttribute('aria-expanded', 'true');
    expect(toolbar).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.vnext-shell')).toHaveAttribute('data-arsenal-open', 'true');
    expect(container.querySelector('.vnext-side-column')).toContainElement(arsenalPanel());
    expect(screen.queryByRole('tablist', { name: 'Painel da direita' })).toBeNull();
    expect(await screen.findByText('Cabeçalho azul')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar arsenal' }));
    expect(arsenalPanel()).toBeNull();
    expect(properties()).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Painel da direita' })).toBeInTheDocument();

    fireEvent.click(toolbar);
    expect(arsenalPanel()).toBeVisible();
    // The assistant takes the column back.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente de edição' }));
    expect(arsenalPanel()).toBeNull();
  });

  it('sem o arsenal ligado nenhum botão aparece e "Usar modelo…" continua igual', async () => {
    const { container, session } = await setup({ withArsenal: false });
    expect(container.querySelector('[data-editor-action^="open-arsenal"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar no arsenal/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Usar modelo…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserir modelo após a página atual' }));
    expect(session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('"Usar modelo…" funciona com o arsenal ligado', async () => {
    const { session } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Usar modelo…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserir modelo após a página atual' }));
    expect(session.getSnapshot().document.pages).toHaveLength(2);
  });

  it('Usar entra com um Desfazer e avisa que não usou IA', async () => {
    const { container, session, runtime } = await setup();
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal"]')!);
    await screen.findByText('Cabeçalho azul');
    const before = session.getSnapshot().document.pages[0].objects.length;
    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: 'Usar “Cabeçalho azul”' }));
    await waitFor(() => expect(session.getSnapshot().document.pages[0].objects).toHaveLength(before + 2));
    expect(runtime.insertion.requests).toHaveLength(1);
    expect(await screen.findAllByText('“Cabeçalho azul” entrou na página 1 sem usar IA. Para voltar, use Desfazer.')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última alteração' }));
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(before);
  });

  it('Usar uma capa cria a página nova depois da atual e vai até ela', async () => {
    const { container, session } = await setup();
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal"]')!);
    await screen.findByText('Capa PRESYS (embutida)');
    fireEvent.click(within(card('Capa PRESYS (embutida)')).getByRole('button', { name: /^Usar/ }));
    await waitFor(() => expect(session.getSnapshot().document.pages).toHaveLength(2));
    const newPageId = session.getSnapshot().document.pages[1].id;
    await waitFor(() => expect(container.querySelector('.vnext-shell')).toHaveAttribute('data-active-page-id', newPageId));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer última alteração' }));
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  });

  it('um estilo vai no texto selecionado (o painel deixa a página livre para selecionar)', async () => {
    const { container, runtime } = await setup();
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal"]')!);
    await screen.findByText('Título grande');
    selectText(container);
    expect(arsenalPanel()).toBeVisible();
    fireEvent.click(within(card('Título grande')).getByRole('button', { name: /^Usar/ }));
    await waitFor(() => expect(runtime.insertion.requests).toHaveLength(1));
    expect(runtime.insertion.requests[0].target).toEqual({ kind: 'object', objectId: 'text-target' });
  });

  it('"Guardar no arsenal…" aparece em Propriedades com algo selecionado e abre o diálogo fora do editor', async () => {
    const { container, runtime } = await setup();
    expect(screen.queryByRole('button', { name: 'Guardar no arsenal…' })).toBeNull();
    selectText(container);
    const save = screen.getByRole('button', { name: 'Guardar no arsenal…' });
    fireEvent.click(save);
    const dialog = await screen.findByRole('dialog', { name: 'Guardar no arsenal' });
    expect(container.querySelector('[data-vnext-shell]')).not.toContainElement(dialog);
    expect(runtime.capture.calls[0].source).toMatchObject({ kind: 'objects', objectIds: ['text-target'] });
    expect(within(dialog).getByRole('group', { name: 'O que guardar' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome' }), { target: { value: 'Título do produto' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar no arsenal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Guardar no arsenal' })).toBeNull());
    expect(await screen.findByText(/“Título do produto” guardado no arsenal, em Páginas/)).toBeInTheDocument();

    // The new model is in the arsenal list for everyone.
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal"]')!);
    expect(await screen.findByText('Título do produto', { selector: 'h4' })).toBeInTheDocument();
  });

  it('menu ⋯ da página oferece "Guardar página no arsenal…"', async () => {
    const { container, runtime, session } = await setup();
    const pageId = session.getSnapshot().document.pages[0].id;
    fireEvent.click(container.querySelector<HTMLButtonElement>(`[data-page-menu-trigger="${pageId}"]`)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Guardar página no arsenal…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guardar no arsenal' });
    expect(runtime.capture.calls[0].source).toEqual({ kind: 'page', pageId });
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Página 1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('teclado: abrir põe o cursor na busca; Esc fecha e devolve o foco ao botão que abriu', async () => {
    const { container } = await setup();
    const toolbar = container.querySelector<HTMLButtonElement>('[data-editor-action="open-arsenal-toolbar"]')!;
    toolbar.focus();
    fireEvent.click(toolbar);
    const search = screen.getByRole('searchbox', { name: 'Buscar no arsenal' });
    expect(search).toHaveFocus();
    await screen.findByText('Cabeçalho azul');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(arsenalPanel()).toBeNull();
    expect(toolbar).toHaveFocus();
  });

  it('cabe em 1280 e 1366: a coluna do arsenal tem 440 px e a página fica com pelo menos 440 px', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/arsenal/Arsenal.css'), 'utf8');
    const simple = /\[data-simple-by-default="true"\]\[data-arsenal-open="true"\] \.vnext-workspace \{\s*grid-template-columns: (\d+)px minmax\((\d+)px, 1fr\) min\((\d+)px/.exec(css);
    expect(simple).not.toBeNull();
    const [left, pageMin, column] = simple!.slice(1).map(Number);
    for (const width of [1280, 1366]) {
      const right = Math.min(column, width - left - pageMin);
      expect(right).toBe(440);
      expect(width - left - right).toBeGreaterThanOrEqual(pageMin);
    }
    // Two cards side by side in 440 px (minus the 16 px gutters and the 10 px gap).
    const cardMin = Number(/repeat\(auto-fill, minmax\((\d+)px, 1fr\)\)/.exec(css)![1]);
    expect(2 * cardMin + 10).toBeLessThanOrEqual(440 - 32);
    // Narrow windows: over the page instead of a hidden column.
    expect(css).toMatch(/@media \(max-width: 1100px\) \{\s*\.vnext-shell\[data-arsenal-open="true"\] \.vnext-side-column \{\s*position: fixed/);
  });
});
