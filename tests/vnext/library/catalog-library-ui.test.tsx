import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogLibrary } from '@/vnext/app/CatalogLibrary';
import type { CatalogLibraryResult, CatalogLibraryService } from '@/vnext/library';
import type { CatalogListItem } from '@/vnext/persistence';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function item(title: string, suffix: string, archived = false): CatalogListItem {
  return {
    catalogId: `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`,
    remoteRevision: 1,
    title,
    locale: 'pt-BR',
    createdAt: '2026-09-14T12:00:00.000Z',
    updatedAt: '2026-09-14T12:05:00.000Z',
    createdBy: 'user-a',
    updatedBy: 'user-a',
    archivedAt: archived ? '2026-09-14T12:10:00.000Z' : null,
    documentSchemaVersion: 1,
  };
}

function serviceWithList(
  list: CatalogLibraryService['list']
): CatalogLibraryService {
  return { list } as unknown as CatalogLibraryService;
}

describe('W3.E CatalogLibrary UI coordination', () => {
  it('ignores an older archived load that resolves after a newer active load', async () => {
    const initial = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const archived = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const active = deferred<CatalogLibraryResult<readonly CatalogListItem[]>>();
    const list = vi.fn()
      .mockImplementationOnce(() => initial.promise)
      .mockImplementationOnce(() => archived.promise)
      .mockImplementationOnce(() => active.promise);

    const { getByRole, queryByText, getByText } = render(
      <CatalogLibrary service={serviceWithList(list)} onOpen={vi.fn()} />
    );

    await act(async () => {
      initial.resolve({ ok: true, value: [item('Ativo inicial', '1')] });
      await initial.promise;
    });
    await waitFor(() => expect(getByText('Ativo inicial')).toBeInTheDocument());

    fireEvent.click(getByRole('tab', { name: 'Arquivados' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    fireEvent.click(getByRole('tab', { name: 'Ativos' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));

    await act(async () => {
      active.resolve({ ok: true, value: [item('Ativo mais novo', '2')] });
      await active.promise;
    });
    await waitFor(() => expect(getByText('Ativo mais novo')).toBeInTheDocument());

    await act(async () => {
      archived.resolve({ ok: true, value: [item('Arquivado atrasado', '3', true)] });
      await archived.promise;
    });

    expect(getByText('Ativo mais novo')).toBeInTheDocument();
    expect(queryByText('Arquivado atrasado')).toBeNull();
    expect(getByRole('button', { name: 'Abrir' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Renomear' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
  });

  it('traps dialog focus, supports Escape, and restores focus to the triggering action', async () => {
    const list = vi.fn().mockResolvedValue({ ok: true, value: [item('Catálogo foco', '4')] });
    const { getByRole, queryByRole } = render(
      <CatalogLibrary service={serviceWithList(list)} onOpen={vi.fn()} />
    );

    const renameTrigger = await waitFor(() => getByRole('button', { name: 'Renomear' }));
    renameTrigger.focus();
    fireEvent.click(renameTrigger);

    const renameDialog = getByRole('dialog', { name: 'Renomear catálogo' });
    const renameInput = getByRole('textbox', { name: 'Nome do catálogo' });
    await waitFor(() => expect(document.activeElement).toBe(renameInput));
    fireEvent.keyDown(renameInput, { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog', { name: 'Renomear catálogo' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(renameTrigger));
    expect(renameDialog).not.toBeInTheDocument();

    const archiveTrigger = getByRole('button', { name: 'Arquivar' });
    archiveTrigger.focus();
    fireEvent.click(archiveTrigger);

    const archiveDialog = getByRole('dialog', { name: 'Arquivar “Catálogo foco”?' });
    const cancel = getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    const confirm = getByRole('button', { name: 'Arquivar catálogo' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(getByRole('button', { name: 'Fechar' }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    await waitFor(() => expect(queryByRole('dialog', { name: 'Arquivar “Catálogo foco”?' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(archiveTrigger));
    expect(archiveDialog).not.toBeInTheDocument();
  });
});
