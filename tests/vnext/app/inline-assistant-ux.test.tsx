import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDocumentSession } from '../../../src/vnext/application';
import { EditorWorkspace } from '../../../src/vnext/app/EditorWorkspace';
import { createSyntheticSpecifications } from '../../../src/vnext/ai-catalog/fixture';
import { compileCatalog } from '../../../src/vnext/ai-catalog/composition';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
afterAll(() => vi.unstubAllGlobals());

async function setup({ simpleByDefault = true } = {}) {
  const input = await createSyntheticSpecifications();
  const generated = await compileCatalog(input);
  const session = createDocumentSession(generated.document, { createId: () => crypto.randomUUID() });
  const ui = render(<EditorWorkspace session={session} simpleByDefault={simpleByDefault} />);
  return { session, ui };
}
function openAssistant() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente de edição' }));
  // One assistant, like a chat app: no "Criar com Gemini" / "Ferramentas" tabs; the quick actions are in its menu.
  expect(screen.queryByRole('tab', { name: 'Criar com Gemini' })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Ferramentas' })).toBeNull();
}
function send(command: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' }), {
    target: { value: command },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar ao Gemini' }));
}
function chooseOption(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Opções do assistente' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

describe('Father-ready access: assistant inside the actual /v2 editor', () => {
  it('places an immediately visible assistant entry next to Save and PDF, retaining A4 canvas', async () => {
    const { ui } = await setup();
    const topbar = ui.container.querySelector('.vnext-topbar');
    expect(topbar).toHaveTextContent('Assistente IA');
    // This fixture has an in-memory session; persisted toolbar controls
    // exist only in the authenticated /v2 composition root.
    openAssistant();
    const panel = screen.getByRole('complementary', { name: 'Assistente do catálogo atual' });
    expect(panel).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveFocus();
    expect(ui.container.querySelector('.vnext-document-preview')).not.toBeNull();
    expect(ui.container.querySelector('[data-editorial-root]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar assistente de edição' }))
      .toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel do assistente' }));
    expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir assistente de edição' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('applies a reversible table change on the exact live editor session and keeps content', async () => {
    const { session } = await setup();
    const original = structuredClone(session.getSnapshot().document);
    openAssistant();
    // A quick action from the menu, without the AI; "Desfaça" / "Refaça" typed in the box also run here.
    chooseOption('Deixar as tabelas mais compactas');
    await waitFor(() => expect(session.getSnapshot().document).not.toEqual(original));
    const revised = session.getSnapshot().document;
    expect(revised.pages).toHaveLength(original.pages.length);
    expect(revised.pages.map(page => page.objects.length))
      .toEqual(original.pages.map(page => page.objects.length));
    expect(screen.getByRole('log', { name: 'Conversa com o assistente' })).toHaveTextContent('Compactei as tabelas');
    send('Desfaça');
    await waitFor(() => expect(session.getSnapshot().document).toEqual(original));
    send('Refaça');
    await waitFor(() => expect(session.getSnapshot().document).toEqual(revised));
  });

  it('does not allow unsupported technical value edits', async () => {
    const { session } = await setup();
    const original = structuredClone(session.getSnapshot().document);
    openAssistant();
    send('Altere exatidão para 0,001 e esconda as notas');
    expect(session.getSnapshot().document).toEqual(original);
    // Not a quick action: it would go to the AI, which is not on this screen; the request stays in the box.
    expect(screen.getByRole('alert')).toHaveTextContent('A IA não está disponível nesta tela. Continue editando manualmente.');
    expect(screen.getByRole('textbox', { name: 'Seu pedido ao Gemini' })).toHaveValue('Altere exatidão para 0,001 e esconda as notas');
  });

  it('preserves dialogue after panel close/open without leaving the editor', async () => {
    const { ui, session } = await setup();
    openAssistant();
    send('Abra o editor');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).not.toBeInTheDocument());
    openAssistant();
    expect(screen.getByRole('log')).toHaveTextContent('Abra o editor');
    expect(screen.getByRole('log')).toHaveTextContent('Abri a edição manual');
    expect(session.getSnapshot().document.pages.length).toBeGreaterThan(0);
    expect(ui.container.querySelector('[data-editorial-root]')).not.toBeNull();
  });

  it('leaves the existing advanced editor unchanged without simple-by-default mode', async () => {
    await setup({ simpleByDefault: false });
    expect(screen.queryByRole('button', { name: 'Abrir assistente de edição' })).not.toBeInTheDocument();
  });
});
