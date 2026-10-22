import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import type { CatalogLibraryResult, CatalogLibraryService } from '@/vnext/library';
import type { CatalogPersistenceEnvelope } from '@/vnext/persistence';

afterEach(cleanup);

const created = {
  catalogId: '00000000-0000-4000-8000-000000000064', remoteRevision: 1, title: 'TA-25N — Ficha técnica 2026', locale: 'pt-BR',
  createdAt: '2026-10-17T12:00:00.000Z', updatedAt: '2026-10-17T12:00:00.000Z', createdBy: 'pai', updatedBy: 'pai', archivedAt: null,
  documentSchemaVersion: 1, lastMutationId: '00000000-0000-4000-8000-000000009999',
  documentSnapshot: {} as CatalogPersistenceEnvelope['documentSnapshot'],
} as CatalogPersistenceEnvelope;

function serviceMock(createBlank: ReturnType<typeof vi.fn>) {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    listStarters: () => [{ starterId: 'essential-technical-sheet', revision: 1, label: 'Ficha técnica essencial', description: 'Uma página A4.', category: 'PRESYS' }],
    getCreateState: () => 'idle',
    createBlank,
    createFromStarter: vi.fn(),
    duplicate: vi.fn(),
    verifyPendingCreate: vi.fn(),
  } as unknown as CatalogLibraryService;
}

async function openDialog(view: ReturnType<typeof render>) {
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Novo catálogo' })));
  return view.getByRole('dialog', { name: 'Novo catálogo' });
}

describe('FR-64 "Criar com IA a partir de arquivos" in "Novo catálogo"', () => {
  it('is the first way to start and says what happens next', async () => {
    const view = render(<CatalogLibrary service={serviceMock(vi.fn())} onOpen={vi.fn()} onOpenWithAssistant={vi.fn()} />);
    const dialog = await openDialog(view);
    const options = within(dialog).getAllByRole('button').filter((button) => button.closest('.vnext-library-create-options'));
    expect(options[0]).toHaveAccessibleName('Criar com IA a partir de arquivos');
    expect(options[0]).toHaveAccessibleDescription('Abre o catálogo com o assistente, para você soltar PDFs, planilhas e fotos do produto.');
  });

  it('creates a blank catalog with the typed name and opens it with the assistant (nothing else is created)', async () => {
    const createBlank = vi.fn().mockResolvedValue({ ok: true, value: created });
    const service = serviceMock(createBlank);
    const onOpen = vi.fn();
    const onOpenWithAssistant = vi.fn();
    const view = render(<CatalogLibrary service={service} onOpen={onOpen} onOpenWithAssistant={onOpenWithAssistant} />);
    const dialog = await openDialog(view);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome do catálogo' }), { target: { value: ' TA-25N — Ficha técnica 2026 ' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Criar com IA a partir de arquivos' })); });
    expect(createBlank).toHaveBeenCalledTimes(1);
    expect(createBlank).toHaveBeenCalledWith('TA-25N — Ficha técnica 2026');
    expect(service.createFromStarter).not.toHaveBeenCalled();
    expect(onOpenWithAssistant).toHaveBeenCalledWith(created.catalogId);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('after a failure, "Tentar novamente" tries the same creation and still opens the assistant', async () => {
    const pending: Array<(value: CatalogLibraryResult<CatalogPersistenceEnvelope>) => void> = [];
    const createBlank = vi.fn(() => new Promise<CatalogLibraryResult<CatalogPersistenceEnvelope>>((resolve) => { pending.push(resolve); }));
    const onOpenWithAssistant = vi.fn();
    const view = render(<CatalogLibrary service={serviceMock(createBlank)} onOpen={vi.fn()} onOpenWithAssistant={onOpenWithAssistant} />);
    const dialog = await openDialog(view);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar com IA a partir de arquivos' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent('Criando “Novo catálogo”…');
    await act(async () => { pending[0]({ ok: false, error: { code: 'OFFLINE' } } as CatalogLibraryResult<CatalogPersistenceEnvelope>); });
    const alert = await waitFor(() => view.getByRole('alert'));
    expect(alert).toHaveTextContent('Você está sem conexão.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    await act(async () => { pending[1]({ ok: true, value: created }); });
    expect(createBlank).toHaveBeenCalledTimes(2);
    expect(onOpenWithAssistant).toHaveBeenCalledWith(created.catalogId);
  });

  it('by default goes to /v2?catalog=<id>&assistente=1 (the files are dropped there, never carried over)', async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      const view = render(<CatalogLibrary service={serviceMock(vi.fn().mockResolvedValue({ ok: true, value: created }))} onOpen={vi.fn()} />);
      const dialog = await openDialog(view);
      await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Criar com IA a partir de arquivos' })); });
      expect(assign).toHaveBeenCalledWith(`/v2?catalog=${created.catalogId}&assistente=1`);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
