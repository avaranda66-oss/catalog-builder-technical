import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createPresysArsenalBuiltinSource } from '@/vnext/arsenal/builtin-source';
import { createInMemoryArsenalStore } from '@/vnext/arsenal/memory-repository';
import { createArsenalEditorRuntime } from '@/vnext/app/editor/arsenal/create-arsenal-runtime';
import { VNextApp } from '@/vnext/app/VNextApp';
import { resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';
import { clearByokCredential } from '@/vnext/ai-catalog/byok-session';
import { ACTORS, testUuid, viewerOf } from './arsenal-doubles';
import { StrictCasCatalogRepository, documentFixture, runtimeFixture, uuid } from '../../persistence/w3h-fixtures';

/**
 * Onda 4.5 — the assistant of the editor reads the same arsenal as the "Arsenal" panel (real repository with the
 * PRESYS models, real insertion): a simple request is answered from it without the AI, "Usar" puts the model in
 * the open catalog, and "Abrir o arsenal" opens the panel with the request's words in the search.
 */
beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  window.localStorage.clear();
  resetStageZoomStore();
});
afterEach(() => {
  cleanup();
  clearByokCredential();
  vi.restoreAllMocks();
});

let seed = 0;
function setup() {
  seed += 1;
  const catalog = documentFixture(uuid(900 + seed), 'TA-25N');
  const catalogs = new StrictCasCatalogRepository(catalog);
  const persisted = runtimeFixture(catalogs, catalog, 9000 + seed * 100, { autosave: false });
  const session = persisted.runtime.workspace.getSnapshot().session;
  const store = createInMemoryArsenalStore({ builtins: createPresysArsenalBuiltinSource().list(), now: () => '2026-10-23T12:00:00.000Z' });
  const repository = store.as({ ...ACTORS.author });
  const runtime = createArsenalEditorRuntime({ repository, viewer: viewerOf(ACTORS.author), createId: testUuid, isAssetAvailable: async () => false });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const view = render(<VNextApp runtime={persisted.runtime} simpleByDefault arsenal={runtime} />);
  return { session, repository, runtime, fetchSpy, persisted, ...view };
}

function openAssistant() {
  fireEvent.click(screen.getByRole('tab', { name: 'Assistente' }));
  return screen.getByRole('complementary', { name: 'Assistente do catálogo atual' });
}

function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
}

const arsenalCard = () => screen.findByRole('group', { name: 'Arsenal, sem usar IA' });

describe('Onda 4.5 — assistente do editor com o arsenal real', () => {
  it('"põe o rodapé com site": achado no arsenal sem IA; Usar põe o modelo na página e conta o uso', async () => {
    const { session, repository, runtime, fetchSpy, persisted } = setup();
    openAssistant();
    await waitFor(() => expect(runtime.service!.getSnapshot().status).toBe('ready'));
    const before = session.getSnapshot().document.pages[0].objects.length;
    send('põe o rodapé com site');
    const card = await arsenalCard();
    expect(within(card).getByRole('heading', { name: 'Achei no arsenal, sem usar IA' })).toBeInTheDocument();
    expect(card).toHaveTextContent('Rodapé com site');
    fireEvent.click(within(card).getAllByRole('button', { name: 'Usar' })[0]);
    const log = screen.getByRole('log', { name: 'Conversa com o assistente' });
    await waitFor(() => expect(log).toHaveTextContent('Usei “Rodapé com site” do arsenal'));
    expect(session.getSnapshot().document.pages[0].objects.length).toBeGreaterThan(before);
    const listed = await repository.list();
    expect(listed.ok && listed.value.find((preset) => preset.name === 'Rodapé com site')?.useCount).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    await persisted.runtime.dispose();
  });

  it('"Ver outros" → "Abrir o arsenal" abre o painel com as palavras do pedido na busca', async () => {
    const { runtime, persisted } = setup();
    openAssistant();
    await waitFor(() => expect(runtime.service!.getSnapshot().status).toBe('ready'));
    send('põe a tabela de especificações');
    const card = await arsenalCard();
    const more = within(card).queryByRole('button', { name: 'Ver outros' });
    if (more) fireEvent.click(more);
    fireEvent.click(within(card).getByRole('button', { name: 'Abrir o arsenal' }));
    const panel = await screen.findByRole('complementary', { name: 'Arsenal' });
    expect(panel).toBeVisible();
    const search = within(panel).getByRole('searchbox');
    expect((search as HTMLInputElement).value).not.toBe('');
    expect((search as HTMLInputElement).value).toMatch(/tabela|especifica/);
    expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).toBeNull();
    await persisted.runtime.dispose();
  });
});
