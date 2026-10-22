import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '../../../src/vnext/application';
import { EditorWorkspace } from '../../../src/vnext/app/EditorWorkspace';
import { DROP_ZONE_TEXT } from '../../../src/vnext/ai-catalog/intake/SourceDropZone';
import { forgetSourceIntakeSessions } from '../../../src/vnext/ai-catalog/intake/intake-store';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { cleanup(); forgetSourceIntakeSessions(); localStorage.clear(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });
afterAll(() => vi.unstubAllGlobals());

function renderEditor(address: string, simpleByDefault = true) {
  window.history.replaceState(null, '', address);
  const session = createDocumentSession(createCatalogDocument(() => crypto.randomUUID(), 'TA-25N — Ficha técnica 2026'),
    { createId: () => crypto.randomUUID() });
  const ui = render(<EditorWorkspace session={session} simpleByDefault={simpleByDefault} />);
  return { session, ui };
}

describe('FR-64 the editor opened by "Criar com IA a partir de arquivos"', () => {
  it('?assistente=1 opens the assistant with the drop zone, and the address forgets it (F5 does not reopen it)', async () => {
    renderEditor('/v2?catalog=cat-1&assistente=1');
    const panel = screen.getByRole('complementary', { name: 'Assistente do catálogo atual' });
    expect(within(panel).getByRole('button', { name: DROP_ZONE_TEXT })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar assistente de edição' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(window.location.search).toBe('?catalog=cat-1'));
  });

  it('without the parameter the assistant starts closed, as before', () => {
    renderEditor('/v2?catalog=cat-1');
    expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Abrir assistente de edição' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a table from a dropped CSV goes into the open page of the real editor, in one Desfazer', async () => {
    const { session } = renderEditor('/v2?catalog=cat-1&assistente=1');
    const before = session.getSnapshot().document;
    const panel = screen.getByRole('complementary', { name: 'Assistente do catálogo atual' });
    fireEvent.change(within(panel).getByLabelText('Escolher arquivos'), {
      target: { files: [new File(['Modelo;Faixa;Exatidão\nPCON-Y17;0 a 20 bar;0,025 %FS\n'], 'lista.csv')] },
    });
    fireEvent.click(await within(panel).findByRole('button', { name: 'Escolher colunas — Tabela do arquivo' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Inserir como tabela' }));
    const page = session.getSnapshot().document.pages[0];
    expect(page.id).toBe(before.pages[0].id);
    expect(page.objects.filter((object) => object.type === 'table')).toHaveLength(1);
    expect(within(panel).getByText(/^Tabela (inserida. Medindo|com 2 linhas × 3 colunas inserida)/)).toBeInTheDocument();
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });
});

describe('FR-64 the dropped files stay when the assistant closes', () => {
  const dropCsv = (panel: HTMLElement) => fireEvent.change(within(panel).getByLabelText('Escolher arquivos'), {
    target: { files: [new File(['Modelo;Faixa;Exatidão\nPCON-Y17;0 a 20 bar;0,025 %FS\n'], 'lista.csv')] },
  });
  const assistant = () => screen.getByRole('complementary', { name: 'Assistente do catálogo atual' });
  const fileList = () => within(assistant()).getByRole('list', { name: 'Arquivos enviados' });

  it('after "Fechar" and opening again, and after "Ferramentas" and back, the files are still there', async () => {
    renderEditor('/v2?catalog=cat-1&assistente=1');
    dropCsv(assistant());
    await waitFor(() => expect(within(fileList()).getByText('Pronto')).toBeInTheDocument());

    fireEvent.click(within(assistant()).getByRole('button', { name: 'Fechar painel do assistente' }));
    expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente de edição' }));
    expect(within(fileList()).getByText('lista.csv')).toBeInTheDocument();
    expect(within(fileList()).getByText('Pronto')).toBeInTheDocument();

    fireEvent.click(within(assistant()).getByRole('tab', { name: 'Ferramentas' }));
    expect(within(assistant()).queryByRole('list', { name: 'Arquivos enviados' })).toBeNull();
    fireEvent.click(within(assistant()).getByRole('tab', { name: 'Criar com Gemini' }));
    expect(within(fileList()).getByText('lista.csv')).toBeInTheDocument();
    expect(within(assistant()).getByRole('region', { name: 'O que encontrei em lista.csv' })).toBeInTheDocument();
  });

  it('Esc in "Escolher colunas" goes back to the files and keeps the assistant open; Esc again closes it, files kept', async () => {
    renderEditor('/v2?catalog=cat-1&assistente=1');
    dropCsv(assistant());
    fireEvent.click(await within(assistant()).findByRole('button', { name: 'Escolher colunas — Tabela do arquivo' }));
    const chooser = within(assistant()).getByRole('group', { name: 'Escolher colunas — Tabela do arquivo' });
    fireEvent.keyDown(within(chooser).getAllByRole('checkbox')[0], { key: 'Escape' });
    expect(within(assistant()).queryByRole('group', { name: 'Escolher colunas — Tabela do arquivo' })).toBeNull();
    expect(within(assistant()).getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' })).toHaveFocus();

    fireEvent.keyDown(within(assistant()).getByRole('button', { name: 'Escolher colunas — Tabela do arquivo' }), { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Assistente do catálogo atual' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente de edição' }));
    expect(within(fileList()).getByText('lista.csv')).toBeInTheDocument();
  });
});
