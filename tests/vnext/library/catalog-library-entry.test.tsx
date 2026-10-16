import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogLibrary, LIBRARY_SEARCH_DEBOUNCE_MS } from '@/vnext/app/CatalogLibrary';
import type { CatalogLibraryResult, CatalogLibraryService } from '@/vnext/library';
import type { CatalogListItem, CatalogPersistenceEnvelope } from '@/vnext/persistence';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function item(title: string, suffix: string, archived = false, updatedAt = '2026-09-14T12:05:00.000Z'): CatalogListItem {
  return {
    catalogId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    remoteRevision: 1,
    title,
    locale: 'pt-BR',
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt,
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt: archived ? '2026-09-14T12:10:00.000Z' : null,
    documentSchemaVersion: 1,
  };
}

function envelope(source: CatalogListItem, overrides: Partial<CatalogPersistenceEnvelope> = {}): CatalogPersistenceEnvelope {
  return {
    ...source,
    lastMutationId: '00000000-0000-4000-8000-000000009999',
    documentSnapshot: {} as CatalogPersistenceEnvelope['documentSnapshot'],
    ...overrides,
  };
}

const starters = [{
  starterId: 'presys-ta25n-a4',
  revision: 1,
  label: 'PRESYS · TA-25N — produto e especificações',
  description: 'Duas páginas A4 editáveis.',
  category: 'PRESYS',
}];

function serviceMock(overrides: Partial<Record<keyof CatalogLibraryService, unknown>> = {}) {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listStarters: () => starters,
    getCreateState: () => 'idle',
    createBlank: vi.fn(),
    createFromStarter: vi.fn(),
    duplicate: vi.fn(),
    verifyPendingCreate: vi.fn(),
    ...overrides,
  } as unknown as CatalogLibraryService & Record<string, ReturnType<typeof vi.fn>>;
}

async function openCreateDialog(view: ReturnType<typeof render>) {
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Novo catálogo' })));
  return view.getByRole('dialog', { name: 'Novo catálogo' });
}

describe('FR-02 create dialog asks the name first and stays safe', () => {
  it('focuses "Nome do catálogo" (not "Em branco") and Enter there creates nothing', async () => {
    const service = serviceMock();
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    const dialog = await openCreateDialog(view);
    const name = within(dialog).getByRole('textbox', { name: 'Nome do catálogo' });
    await waitFor(() => expect(document.activeElement).toBe(name));
    // Says what happens without a name, so a starter click never renames the catalog by surprise.
    expect(name).toHaveAccessibleDescription(/Sem nome, o catálogo fica com o nome do modelo escolhido\. O nome muda depois clicando no título\./);

    fireEvent.change(name, { target: { value: 'TA-25N — Ficha técnica 2026' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(service.createBlank).not.toHaveBeenCalled();
    expect(service.createFromStarter).not.toHaveBeenCalled();
    expect(view.getByRole('dialog', { name: 'Novo catálogo' })).toBeInTheDocument();
    const blank = within(dialog).getByRole('button', { name: 'Em branco' });
    expect(blank).toHaveAccessibleDescription('Comece com uma página vazia.');
    // Enter shows the next step: the first way to start gets the focus.
    expect(document.activeElement).toBe(blank);
  });

  it('Enter in "Nome do catálogo" moves to the recommended way to start, without creating', async () => {
    const service = serviceMock({
      listStarters: () => [
        ...starters,
        { starterId: 'essential-technical-sheet', revision: 1, label: 'Ficha técnica essencial', description: 'Uma página A4.', category: 'PRESYS' },
      ],
    });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    const dialog = await openCreateDialog(view);
    const name = within(dialog).getByRole('textbox', { name: 'Nome do catálogo' });
    fireEvent.change(name, { target: { value: 'PCON-Y18' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Ficha técnica essencial' }));
    expect(service.createBlank).not.toHaveBeenCalled();
    expect(service.createFromStarter).not.toHaveBeenCalled();
  });

  it('creates a blank catalog with the typed name and shows "Criando…" inside the dialog', async () => {
    const created = item('PCON-Y18 — Ficha técnica', '31');
    const pending = deferred<CatalogLibraryResult<CatalogPersistenceEnvelope>>();
    const service = serviceMock({ createBlank: vi.fn(() => pending.promise) });
    const onOpen = vi.fn();
    const view = render(<CatalogLibrary service={service} onOpen={onOpen} />);
    const dialog = await openCreateDialog(view);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome do catálogo' }), {
      target: { value: '  PCON-Y18 — Ficha técnica ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Em branco' }));

    expect(service.createBlank).toHaveBeenCalledWith('PCON-Y18 — Ficha técnica');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Criando “PCON-Y18 — Ficha técnica”…');
    expect(within(dialog).getByRole('button', { name: 'Em branco' })).toBeDisabled();

    await act(async () => { pending.resolve({ ok: true, value: envelope(created) }); });
    expect(onOpen).toHaveBeenCalledWith(created.catalogId);
  });

  it('passes the typed name to a starter and keeps the starter title when the name is empty', async () => {
    const created = item('TA-25N', '32');
    const service = serviceMock({ createFromStarter: vi.fn().mockResolvedValue({ ok: true, value: envelope(created) }) });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);

    let dialog = await openCreateDialog(view);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome do catálogo' }), { target: { value: 'TA-25N — Ficha técnica 2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /PRESYS · TA-25N — produto e especificações/ }));
    await waitFor(() => expect(service.createFromStarter).toHaveBeenCalledWith('presys-ta25n-a4', 'TA-25N — Ficha técnica 2026'));

    dialog = await openCreateDialog(view);
    expect(within(dialog).getByRole('textbox', { name: 'Nome do catálogo' })).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: /PRESYS · TA-25N/ }));
    await waitFor(() => expect(service.createFromStarter).toHaveBeenLastCalledWith('presys-ta25n-a4'));
  });
});

describe('FR-08 search filters locally after a pause, and verification never creates', () => {
  it('fetches once and filters the loaded list 300 ms after typing stops', async () => {
    const service = serviceMock({
      list: vi.fn().mockResolvedValue({
        ok: true,
        value: [item('PCON-Y17 — Ficha', '41'), item('PCON-Y18 — Ficha', '42'), item('TA-25N', '43')],
      }),
    });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    await waitFor(() => view.getByText('TA-25N'));
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.list).toHaveBeenCalledWith({ view: 'active' });

    fireEvent.change(view.getByRole('searchbox', { name: 'Buscar catálogos' }), { target: { value: 'y1' } });
    fireEvent.change(view.getByRole('searchbox', { name: 'Buscar catálogos' }), { target: { value: 'y18' } });
    // Still the full list right after typing: the filter waits for the pause.
    expect(view.getByText('TA-25N')).toBeInTheDocument();
    await waitFor(() => expect(view.queryByText('TA-25N')).toBeNull(), { timeout: LIBRARY_SEARCH_DEBOUNCE_MS * 4 });
    expect(view.getByText('PCON-Y18 — Ficha')).toBeInTheDocument();
    expect(view.queryByText('PCON-Y17 — Ficha')).toBeNull();

    fireEvent.change(view.getByRole('combobox', { name: 'Ordenar catálogos' }), { target: { value: 'title-desc' } });
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('"Verificar criação" with nothing left pending only refreshes the list', async () => {
    const service = serviceMock({
      getCreateState: () => 'pending-verification',
      verifyPendingCreate: vi.fn().mockResolvedValue({ ok: true, value: null }),
    });
    const onOpen = vi.fn();
    const view = render(<CatalogLibrary service={service} onOpen={onOpen} />);
    fireEvent.click(await waitFor(() => view.getAllByRole('button', { name: 'Verificar criação' })[0]));
    await waitFor(() => expect(service.verifyPendingCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(service.list).toHaveBeenCalledTimes(2));
    expect(service.createBlank).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('FR-04 archive is one step away and an archived catalog can come back', () => {
  it('keeps Arquivar in the "Mais" menu, which closes with Escape and returns focus', async () => {
    const service = serviceMock({ list: vi.fn().mockResolvedValue({ ok: true, value: [item('TA-25N', '51')] }) });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    const more = await waitFor(() => view.getByRole('button', { name: 'Mais ações de TA-25N' }));
    expect(view.queryByRole('button', { name: 'Arquivar' })).toBeNull();
    expect(more).toHaveAttribute('aria-haspopup', 'menu');

    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const archive = view.getByRole('menuitem', { name: 'Arquivar' });
    await waitFor(() => expect(document.activeElement).toBe(archive));
    fireEvent.keyDown(archive, { key: 'Escape' });
    expect(view.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);

    fireEvent.click(more);
    fireEvent.click(view.getByRole('menuitem', { name: 'Arquivar' }));
    const dialog = view.getByRole('dialog', { name: 'Arquivar “TA-25N”?' });
    expect(dialog).toHaveTextContent('clique em “Duplicar”');
  });

  it('archived rows offer Duplicar; the active copy is shown in Ativos with a notice', async () => {
    const archived = item('TA-25N antigo', '61', true);
    const copy = item('Cópia de TA-25N antigo', '62');
    const list = vi.fn(async (query?: { view?: string }) => ({
      ok: true,
      value: query?.view === 'archived' ? [archived] : [copy],
    }));
    const service = serviceMock({
      list,
      duplicate: vi.fn().mockResolvedValue({
        ok: true,
        value: envelope(copy, { origin: { originKind: 'duplicate', originId: archived.catalogId, originRevision: 2 } }),
      }),
    });
    const view = render(<CatalogLibrary service={service} onOpen={vi.fn()} />);
    fireEvent.click(await waitFor(() => view.getByRole('tab', { name: 'Arquivados' })));
    const row = (await waitFor(() => view.getByText('TA-25N antigo'))).closest('[data-library-catalog-id]') as HTMLElement;
    expect(within(row).getByText('Arquivado')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Abrir' })).toBeNull();
    expect(view.getByText(/Para voltar a usar um deles, clique em “Duplicar”/)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(service.duplicate).toHaveBeenCalledWith(archived.catalogId));
    await waitFor(() => expect(view.getByRole('tab', { name: 'Ativos' })).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => view.getByText('Cópia de TA-25N antigo'));
    expect(view.getByRole('status')).toHaveTextContent('Cópia criada em Ativos: “Cópia de TA-25N antigo”.');
  });

  it('uses "Meus catálogos" as the Library name', async () => {
    const view = render(<CatalogLibrary service={serviceMock()} onOpen={vi.fn()} />);
    expect(await waitFor(() => view.getByRole('heading', { level: 1, name: 'Meus catálogos' }))).toBeInTheDocument();
    expect(view.queryByText('Biblioteca')).toBeNull();
  });
});
