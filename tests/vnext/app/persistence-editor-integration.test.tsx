import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { AssetPersistenceBridge, AssetResolutionResult } from '@/vnext/asset';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import type { SaveCatalogCasRequest } from '@/vnext/persistence';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
  uuid,
} from '../persistence/w3h-fixtures';

afterEach(cleanup);

const photo: AssetRef = {
  id: 'a0000000-0000-4000-a000-000000000001', version: '1', sha256: 'a'.repeat(64),
  mime: 'image/png', widthPx: 10, heightPx: 10, name: 'foto.png', alt: 'Foto do produto',
};

function catalogWithPhoto(id = uuid(800)): CatalogDocument {
  const base = documentFixture(id, 'TA-25N');
  return {
    ...base,
    pages: [{ ...base.pages[0]!, objects: [{ id: 'photo-object', type: 'image', assetId: photo.id, fit: 'contain', zIndex: 0,
      frame: { xMm: 20, yMm: 20, widthMm: 80, heightMm: 60 } }] }],
    assets: [photo],
  };
}

function rename(active: ReturnType<typeof runtimeFixture>, title: string): void {
  act(() => { expect(active.session.execute({ type: 'document.rename', title }).ok).toBe(true); });
}

describe('Father editor (simple mode) · photos, conflicts and saving', () => {
  it('FR-41: a photo still downloading says so, and a failed one is downloaded again by "Tentar novamente"', async () => {
    const document = catalogWithPhoto();
    const active = runtimeFixture(new StrictCasCatalogRepository(document), document, 8100, { autosave: false });
    const pending = deferred<AssetResolutionResult>();
    const bridge = { resolve: vi.fn<AssetPersistenceBridge['resolve']>(() => pending.promise) } as unknown as AssetPersistenceBridge;
    const { container } = render(<VNextApp runtime={active.runtime} assetBridge={bridge} simpleByDefault />);
    const mark = () => container.querySelector('[data-editor-image-repair="photo-object"]');

    act(() => { active.runtime.workspace.markAssetsLoading([photo.id]); });
    expect(mark()).toHaveTextContent('Carregando foto…');

    act(() => { active.runtime.workspace.settleAssetLoad(photo.id, { status: 'unavailable', error: 'Foto não carregou', asset: photo }); });
    expect(mark()).toHaveTextContent('Foto não carregou');
    fireEvent.click(within(mark() as HTMLElement).getByRole('button', { name: 'Tentar novamente' }));
    expect(bridge.resolve).toHaveBeenCalledWith(photo, expect.objectContaining({ forceRefresh: true }));
    expect(mark()).toHaveTextContent('Carregando foto…');

    await act(async () => {
      pending.resolve({ ok: true, state: { status: 'resolved', url: 'blob:foto', expiresAt: Date.now() + 60_000, asset: photo } });
      await pending.promise;
    });
    expect(mark()).toBeNull();
    expect(active.runtime.workspace.getSnapshot().assetUrls.get(photo.id)).toBe('blob:foto');
    await active.runtime.dispose();
  });

  it('FR-43: a conflict blocks the editor with the dialog; the copy opens and the editor comes back', async () => {
    const document = documentFixture(uuid(810), 'TA-25N');
    const repository = new StrictCasCatalogRepository(document);
    const office = runtimeFixture(repository, document, 8200, { autosave: false });
    const clock = new ManualAutosaveClock();
    const father = runtimeFixture(repository, document, 8300, { autosaveClock: clock });
    const { container } = render(<VNextApp runtime={father.runtime} simpleByDefault />);

    rename(office, 'Versão do escritório');
    expect(await office.runtime.manualSave()).toMatchObject({ ok: true });
    rename(father, 'Trabalho do pai');
    await act(async () => { clock.advanceBy(25); });

    const dialog = await screen.findByRole('alertdialog', { name: 'Este catálogo foi salvo em outro lugar enquanto você editava' });
    expect(container.querySelector('[data-vnext-shell]')).toHaveProperty('inert', true);
    expect(within(dialog).getByRole('button', { name: 'Salvar meu trabalho como cópia' })).toHaveFocus();
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Conflito');

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar meu trabalho como cópia' })); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const binding = father.runtime.workspace.getSnapshot().binding;
    expect(binding.kind === 'PERSISTED' && binding.catalogId).not.toBe(document.id);
    expect(repository.current(document.id).documentSnapshot.title).toBe('Versão do escritório');
    // The editor of the copy is a fresh one and is not blocked.
    expect((container.querySelector('[data-vnext-shell]') as HTMLElement).inert).not.toBe(true);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo');
    await father.runtime.dispose();
    await office.runtime.dispose();
  });

  it('FR-44: without connection the simple mode explains the automatic retry, then shows "Salvo às HH:MM"', async () => {
    const document = documentFixture(uuid(820), 'TA-25N');
    const repository = new StrictCasCatalogRepository(document);
    repository.saveCAS.mockImplementation(async () => ({ ok: false, error: { code: 'OFFLINE' } }));
    const clock = new ManualAutosaveClock();
    const father = runtimeFixture(repository, document, 8400, { autosaveClock: clock });
    const { container } = render(<VNextApp runtime={father.runtime} simpleByDefault />);

    rename(father, 'Sem internet');
    await act(async () => { clock.advanceBy(25); });
    const band = await waitFor(() => {
      const element = container.querySelector('[data-save-problem]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(band).toHaveTextContent('Vamos tentar salvar de novo sozinhos em instantes. Você também pode clicar em Salvar.');
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Sem conexão / indisponível');

    repository.saveCAS.mockImplementation(async (request: SaveCatalogCasRequest) => repository.commitSave(request));
    await act(async () => { clock.advanceBy(5_000); });
    await waitFor(() => expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo'));
    expect(container.querySelector('.vnext-save-summary')?.textContent).toMatch(/^Salvo às \d{2}:\d{2}$/);
    expect(container.querySelector('[data-save-problem]')).toBeNull();
    await father.runtime.dispose();
  });
});
