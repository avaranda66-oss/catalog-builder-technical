import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import type { ArsenalPresetSummary, ArsenalRepository } from '@/vnext/arsenal';
import { ArsenalPanel, type ArsenalPanelProps } from '@/vnext/app/editor/arsenal/ArsenalPanel';
import { createSessionInsertionPort } from '@/vnext/app/editor/arsenal/arsenal-runtime';
import { ACTORS, seededStore, testRuntime, testUuid, viewerOf, wrapRepository, type TestRuntime } from './arsenal-doubles';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeSession() {
  return createDocumentSession(createCatalogDocument(testUuid, 'Catálogo de teste'), { createId: testUuid });
}

async function renderPanel(options: {
  readonly viewer?: { readonly userId: string; readonly role: 'admin' | 'editor' | 'viewer' };
  readonly repository?: (base: ArsenalRepository) => ArsenalRepository;
  readonly props?: Partial<ArsenalPanelProps>;
  readonly waitForList?: boolean;
  /** Inside React.StrictMode, as the app is mounted (dev mounts, unmounts and mounts again). */
  readonly strict?: boolean;
} = {}) {
  const { store, ids } = await seededStore();
  const actor = options.viewer ?? ACTORS.author;
  const base = store.as({ ...actor, name: 'Quem vê' });
  const repository = options.repository ? options.repository(base) : base;
  const runtime: TestRuntime = testRuntime(repository, viewerOf(actor));
  const session = makeSession();
  const document = session.getSnapshot().document;
  const onInserted = vi.fn();
  const onMessage = vi.fn();
  const onClose = vi.fn();
  const props: ArsenalPanelProps = {
    open: true,
    runtime,
    document,
    assetUrls: new Map(),
    currentPageId: document.pages[0].id,
    selectedObjects: [],
    createPort: () => createSessionInsertionPort(session, runtime),
    prepare: () => true,
    onInserted,
    onMessage,
    onClose,
    ...options.props,
  };
  const view = render(options.strict ? <React.StrictMode><ArsenalPanel {...props} /></React.StrictMode> : <ArsenalPanel {...props} />);
  if (options.waitForList !== false) await screen.findByText('Cabeçalho azul');
  return { ...view, runtime, session, ids, onInserted, onMessage, onClose, props, store };
}

const card = (name: string) => screen.getByText(name, { selector: 'h4' }).closest('li')!;

describe('Onda 4.5 — painel Arsenal', () => {
  it('mostra os modelos por categoria, com origem, autor, uso e miniatura', async () => {
    await renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Arsenal' });
    expect(within(panel).getByRole('heading', { name: 'Capas' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Cabeçalhos' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Tabelas' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Estilos' })).toBeInTheDocument();

    expect(within(card('Capa PRESYS (embutida)')).getByText('PRESYS')).toBeInTheDocument();
    expect(within(card('Capa PRESYS (embutida)')).getByText('Modelo PRESYS')).toBeInTheDocument();
    expect(within(card('Cabeçalho azul')).getByText('Você')).toBeInTheDocument();
    expect(within(card('Cabeçalho azul')).getByText('Guardado por você')).toBeInTheDocument();
    expect(within(card('Tabela de especificações')).getByText('Equipe')).toBeInTheDocument();
    expect(within(card('Tabela de especificações')).getByText(`Guardado por ${ACTORS.otherEditor.name}`)).toBeInTheDocument();
    expect(within(card('Título grande')).getByText('IA')).toBeInTheDocument();
    expect(within(card('Título grande')).getByText('Sugerido pela IA, guardado por você')).toBeInTheDocument();
    expect(within(card('Cabeçalho azul')).getByText('Ainda não usado')).toBeInTheDocument();

    // The pictures are drawn from the loaded content (live renderer, nothing stored).
    await waitFor(() => expect(card('Cabeçalho azul').querySelector('[data-arsenal-thumb="ready"]')).not.toBeNull());
    expect(card('Cabeçalho azul').querySelector('[data-page-thumbnail]')).not.toBeNull();
    await waitFor(() => expect(within(card('Título grande')).getByText(/Estilo para texto/)).toBeInTheDocument());
  });

  it('filtra por categoria e busca sem acento, sem chamar o servidor a cada tecla', async () => {
    const list = vi.fn();
    await renderPanel({ repository: (base) => wrapRepository(base, { list: (query) => { list(); return base.list(query); } }) });
    const calls = list.mock.calls.length;
    const categories = screen.getByRole('group', { name: 'Categorias' });
    fireEvent.click(within(categories).getByRole('button', { name: /Tabelas/ }));
    expect(within(categories).getByRole('button', { name: 'Tabelas 1 modelo' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(categories).getByRole('button', { name: 'Todos 4 modelos' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Tabela de especificações')).toBeInTheDocument();
    expect(screen.queryByText('Cabeçalho azul')).toBeNull();

    fireEvent.click(within(categories).getByRole('button', { name: /Todos/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no arsenal' }), { target: { value: 'cabecalho' } });
    expect(screen.getByText('Cabeçalho azul')).toBeInTheDocument();
    expect(screen.queryByText('Tabela de especificações')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no arsenal' }), { target: { value: 'faixa' } });
    expect(screen.getByText('Cabeçalho azul')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no arsenal' }), { target: { value: 'xyzzy' } });
    expect(screen.getByText(/Nada encontrado para “xyzzy”/)).toBeInTheDocument();
    expect(list.mock.calls.length).toBe(calls);

    // Esc in the search clears it first; Esc again closes the panel.
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Buscar no arsenal' }), { key: 'Escape' });
    expect(screen.getByRole('searchbox', { name: 'Buscar no arsenal' })).toHaveValue('');
  });

  it('Usar põe o bloco na página atual sem IA e conta o uso', async () => {
    const { runtime, onInserted, onMessage, props, session } = await renderPanel();
    await waitFor(() => expect(card('Cabeçalho azul').querySelector('[data-arsenal-thumb="ready"]')).not.toBeNull());
    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: 'Usar “Cabeçalho azul”' }));
    await waitFor(() => expect(onInserted).toHaveBeenCalledTimes(1));
    expect(runtime.insertion.requests[0].target).toEqual({ kind: 'page', pageId: props.currentPageId, placement: 'original' });
    const event = onInserted.mock.calls[0][0];
    expect(event.message).toBe('“Cabeçalho azul” entrou na página 1 sem usar IA. Para voltar, use Desfazer.');
    // Two objects, one Desfazer.
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(2);
    session.undo();
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(0);
    await waitFor(() => expect(within(card('Cabeçalho azul')).getByText('Usado 1×')).toBeInTheDocument());
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('no StrictMode a lista abre e "Usar" termina (não fica em "Abrindo o arsenal…" nem em "Usando…")', async () => {
    const { session, onInserted } = await renderPanel({ strict: true });
    const panel = screen.getByRole('complementary', { name: 'Arsenal' });
    expect(panel.querySelector('[data-arsenal-loading]')).toBeNull();
    const before = session.getSnapshot().document.pages[0].objects.length;
    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: 'Usar “Cabeçalho azul”' }));
    await waitFor(() => expect(onInserted).toHaveBeenCalledTimes(1));
    expect(session.getSnapshot().document.pages[0].objects.length).toBeGreaterThan(before);
    await waitFor(() => expect(within(card('Cabeçalho azul')).getByRole('button', { name: 'Usar “Cabeçalho azul”' })).toHaveTextContent('Usar'));
    await waitFor(() => expect(within(card('Cabeçalho azul')).getByText('Usado 1×')).toBeInTheDocument());
  });

  it('uma página do arsenal entra depois da página atual', async () => {
    const { runtime, onInserted, props } = await renderPanel();
    fireEvent.click(within(card('Capa PRESYS (embutida)')).getByRole('button', { name: /^Usar/ }));
    await waitFor(() => expect(onInserted).toHaveBeenCalledTimes(1));
    expect(runtime.insertion.requests[0].target).toEqual({ kind: 'new-page', afterPageId: props.currentPageId });
    expect(onInserted.mock.calls[0][0].message).toMatch(/entrou como página nova sem usar IA/);
  });

  it('um estilo pede a seleção certa antes e não muda nada sem ela', async () => {
    const { runtime, onMessage } = await renderPanel();
    fireEvent.click(within(card('Título grande')).getByRole('button', { name: /^Usar/ }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Para usar este estilo, selecione um texto na página e clique em Usar de novo.'));
    expect(runtime.insertion.requests).toHaveLength(0);
  });

  it('aplica o estilo ao texto selecionado', async () => {
    const { runtime, onInserted } = await renderPanel({ props: { selectedObjects: [{ id: 'texto-1', type: 'text' }] } });
    fireEvent.click(within(card('Título grande')).getByRole('button', { name: /^Usar/ }));
    await waitFor(() => expect(onInserted).toHaveBeenCalledTimes(1));
    expect(runtime.insertion.requests[0].target).toEqual({ kind: 'object', objectId: 'texto-1' });
    expect(onInserted.mock.calls[0][0].message).toMatch(/entrou no objeto selecionado sem usar IA/);
  });

  it('não oferece Usar para um modelo de versão mais nova', async () => {
    const newer: ArsenalPresetSummary = {
      id: '99999999-9999-4999-8999-999999999999', scope: 'team', origin: 'person', kind: 'block', name: 'Faixa do futuro',
      category: 'rodapes', tags: [], synonyms: [], payloadSchemaVersion: 2, revision: 1, createdBy: ACTORS.author.userId,
      createdByName: ACTORS.author.name, createdAt: null, updatedAt: null, useCount: 0, lastUsedAt: null,
    };
    await renderPanel({ repository: (base) => wrapRepository(base, { extraSummaries: [newer] }) });
    const entry = card('Faixa do futuro');
    expect(within(entry).getByRole('button', { name: 'Usar “Faixa do futuro”' })).toBeDisabled();
    expect(within(entry).getByText('Precisa de uma versão mais nova do app.')).toBeInTheDocument();
  });

  it('menu ⋯ só para o autor ou um administrador; embutidos sem menu', async () => {
    await renderPanel({ viewer: ACTORS.author });
    expect(within(card('Capa PRESYS (embutida)')).queryByRole('button', { name: /Mais ações/ })).toBeNull();
    expect(within(card('Tabela de especificações')).queryByRole('button', { name: /Mais ações/ })).toBeNull();
    expect(within(card('Cabeçalho azul')).getByRole('button', { name: 'Mais ações de “Cabeçalho azul”' })).toBeInTheDocument();
    cleanup();

    await renderPanel({ viewer: ACTORS.admin });
    expect(within(card('Tabela de especificações')).getByRole('button', { name: /Mais ações/ })).toBeInTheDocument();
    expect(within(card('Capa PRESYS (embutida)')).queryByRole('button', { name: /Mais ações/ })).toBeNull();
  });

  it('Renomear troca o nome para todos (revisão conferida)', async () => {
    const { onMessage, store } = await renderPanel();
    const trigger = within(card('Cabeçalho azul')).getByRole('button', { name: 'Mais ações de “Cabeçalho azul”' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear modelo' });
    const input = within(dialog).getByRole('textbox', { name: 'Nome do modelo' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Cabeçalho PRESYS azul' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Modelo renomeado para “Cabeçalho PRESYS azul”.'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await screen.findByText('Cabeçalho PRESYS azul');
    const listed = await store.as(ACTORS.otherEditor).list();
    expect(listed.ok && listed.value.some((preset) => preset.name === 'Cabeçalho PRESYS azul')).toBe(true);
  });

  it('Apagar pede confirmação; Cancelar não apaga', async () => {
    const { onMessage } = await renderPanel();
    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: /Mais ações/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar…' }));
    let dialog = await screen.findByRole('alertdialog', { name: 'Apagar “Cabeçalho azul”?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(dialog).toHaveTextContent('O modelo sai do arsenal para toda a equipe.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Cabeçalho azul')).toBeInTheDocument();

    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: /Mais ações/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar…' }));
    dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar modelo' }));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('“Cabeçalho azul” foi apagado do arsenal.'));
    await waitFor(() => expect(screen.queryByText('Cabeçalho azul')).toBeNull());
  });

  it('Esc no diálogo fecha só o diálogo; Esc no painel fecha o painel', async () => {
    const { onClose } = await renderPanel();
    fireEvent.click(within(card('Cabeçalho azul')).getByRole('button', { name: /Mais ações/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear modelo' });
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Fechar arsenal' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('avisa e oferece tentar de novo quando o arsenal não abre', async () => {
    let fail = true;
    await renderPanel({
      waitForList: false,
      repository: (base) => wrapRepository(base, {
        list: async (query) => {
          if (fail) return { ok: false, error: { code: 'OFFLINE' } };
          return base.list(query);
        },
      }),
    });
    expect(await screen.findByText('Sem conexão com o servidor. Confira a internet e tente de novo.')).toBeInTheDocument();
    fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })); });
    expect(await screen.findByText('Cabeçalho azul')).toBeInTheDocument();
  });

  it('a busca recebe o cursor ao abrir', async () => {
    await renderPanel();
    expect(screen.getByRole('searchbox', { name: 'Buscar no arsenal' })).toHaveFocus();
  });

  it('todo alvo clicável do arsenal tem pelo menos 24 px (a folha de estilo pede 32–40 px)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/arsenal/Arsenal.css'), 'utf8');
    const heights = [...css.matchAll(/min-height:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(heights.length).toBeGreaterThan(8);
    expect(Math.min(...heights.filter((value) => value < 90))).toBeGreaterThanOrEqual(32);
    for (const selector of ['.vnext-arsenal-use', '.vnext-arsenal-close', '.vnext-arsenal-categories button', '.vnext-arsenal-dialog-actions button']) {
      const rule = css.split('}').find((block) => block.trim().startsWith(`${selector} {`));
      expect(rule, selector).toMatch(/min-height:\s*(3[2-9]|4\d)px/);
    }
    expect(css).toMatch(/\.vnext-arsenal-choice input, \.vnext-arsenal-values input \{[^}]*width: 24px; height: 24px/);
  });
});
