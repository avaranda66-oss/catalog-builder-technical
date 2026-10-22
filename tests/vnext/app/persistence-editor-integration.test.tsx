import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHOTOS_LOADING_ANNOUNCEMENT } from '@/vnext/app/editor/ImageRepairIndicator';
import { VNextApp } from '@/vnext/app/VNextApp';
import type { AssetPersistenceBridge, AssetResolutionResult } from '@/vnext/asset';
import type { AssetRef, CatalogDocument } from '@/vnext/domain';
import type { SaveCatalogCasRequest, VNextPersistenceRuntime } from '@/vnext/persistence';
import type { AuthoringRecoveryOverlay } from '@/vnext/recovery';
import { createW4BTableDocument, W4B_OBJECT_ID, W4B_PAGE_ID, W4B_TABLE_ID } from '../proof/fixtures/w4b-table-document';
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

function shownTitle(active: ReturnType<typeof runtimeFixture>): string {
  return active.runtime.workspace.getSnapshot().session.getSnapshot().document.title;
}

/** Opens the editor with the W4.B table and a cell being edited (typed "RASCUNHO-DO-PAI", not confirmed yet). */
function seedCellDraft(runtime: VNextPersistenceRuntime): void {
  const overlay: AuthoringRecoveryOverlay = {
    kind: 'TABLE_CELL_DRAFT_V1', pageId: W4B_PAGE_ID, objectId: W4B_OBJECT_ID, tableId: W4B_TABLE_ID, cellId: 'w4b-code',
    expectedContent: { type: 'technicalCode', value: 'TC-001' }, activeType: 'technicalCode',
    draft: { richText: '', technicalCode: 'RASCUNHO-DO-PAI', measurement: { valueText: '', unit: '', qualifier: '' } },
    compositionWasActive: false,
  };
  const writable = runtime as unknown as { recoveredOverlay?: { openSessionId: string; overlay: AuthoringRecoveryOverlay } };
  writable.recoveredOverlay = { openSessionId: runtime.workspace.getSnapshot().binding.openSessionId, overlay };
}

function codeCell(active: ReturnType<typeof runtimeFixture>) {
  const object = active.session.getSnapshot().document.pages[0]?.objects.find((entry) => entry.id === W4B_OBJECT_ID);
  if (object?.type !== 'table') throw new Error('Missing W4.B table');
  return object.table.cells.find((cell) => cell.id === 'w4b-code')?.content;
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
    // One spoken message for all photos, not one per photo.
    expect(mark()?.closest('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-photo-loading-announcer]')).toHaveTextContent(PHOTOS_LOADING_ANNOUNCEMENT);

    act(() => { active.runtime.workspace.settleAssetLoad(photo.id, { status: 'unavailable', error: 'Foto não carregou', asset: photo }); });
    expect(mark()).toHaveTextContent('Foto não carregou');
    expect(container.querySelector('[data-photo-loading-announcer]')).toBeEmptyDOMElement();
    // The button says which photo it is for.
    fireEvent.click(within(mark() as HTMLElement).getByRole('button', { name: 'Tentar novamente — foto “Foto do produto”' }));
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

  it('FR-43: Ctrl+Z, Ctrl+Y and Esc pressed in the dialog never undo, redo or touch the work behind it', async () => {
    const document = documentFixture(uuid(830), 'TA-25N');
    const repository = new StrictCasCatalogRepository(document);
    const office = runtimeFixture(repository, document, 8500, { autosave: false });
    const clock = new ManualAutosaveClock();
    const father = runtimeFixture(repository, document, 8600, { autosaveClock: clock });
    const { container } = render(<VNextApp runtime={father.runtime} simpleByDefault />);

    rename(office, 'Versão do escritório');
    expect(await office.runtime.manualSave()).toMatchObject({ ok: true });
    rename(father, 'Trabalho do pai');
    rename(father, 'Rascunho desfeito');
    // Leave something to redo, so a leaked Ctrl+Y would be visible too.
    act(() => { expect(father.session.undo().ok).toBe(true); });
    expect(shownTitle(father)).toBe('Trabalho do pai');
    await act(async () => { clock.advanceBy(25); });

    const dialog = await screen.findByRole('alertdialog', { name: 'Este catálogo foi salvo em outro lugar enquanto você editava' });
    const copy = within(dialog).getByRole('button', { name: 'Salvar meu trabalho como cópia' });
    expect(copy).toHaveFocus();
    fireEvent.keyDown(copy, { key: 'z', ctrlKey: true });
    expect(shownTitle(father)).toBe('Trabalho do pai');
    fireEvent.keyDown(copy, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(copy, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(shownTitle(father)).toBe('Trabalho do pai');
    fireEvent.keyDown(copy, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(container.querySelector('[data-editor-notice]')).toBeNull();

    await act(async () => { fireEvent.click(copy); });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const binding = father.runtime.workspace.getSnapshot().binding;
    if (binding.kind !== 'PERSISTED') throw new Error('The copy was not saved');
    // The copy keeps exactly the work that was on screen.
    expect(repository.current(binding.catalogId).documentSnapshot.title).toContain('Trabalho do pai');
    expect(repository.current(document.id).documentSnapshot.title).toBe('Versão do escritório');
    await father.runtime.dispose();
    await office.runtime.dispose();
  });

  it('FR-43: with a cell being edited, Esc, Ctrl+Enter and clicks in the dialog keep the typed text as it is', async () => {
    const document = createW4BTableDocument();
    const repository = new StrictCasCatalogRepository(document);
    const father = runtimeFixture(repository, document, 8700, { autosave: false });
    seedCellDraft(father.runtime);
    const { container } = render(<VNextApp runtime={father.runtime} />);
    const typed = () => container.querySelector<HTMLInputElement>('[data-cell-technical-code]')?.value;
    await waitFor(() => expect(typed()).toBe('RASCUNHO-DO-PAI'));
    expect(father.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);

    // Someone else saved first (as the save coordinator reports it).
    act(() => { father.runtime.workspace.setPhase('conflict', 'The server advanced with a different mutation'); });
    const dialog = await screen.findByRole('alertdialog');
    const copy = within(dialog).getByRole('button', { name: 'Salvar meu trabalho como cópia' });
    fireEvent.keyDown(copy, { key: 'Escape' });
    fireEvent.keyDown(copy, { key: 'Enter', ctrlKey: true });
    fireEvent.pointerDown(within(dialog).getByRole('button', { name: 'Abrir versão mais recente' }));
    fireEvent.keyDown(copy, { key: 'z', ctrlKey: true });

    expect(container.querySelector('[data-cell-edit-session]')).not.toBeNull();
    expect(typed()).toBe('RASCUNHO-DO-PAI');
    expect(father.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    expect(codeCell(father)).toEqual({ type: 'technicalCode', value: 'TC-001' });
    await act(async () => { await father.runtime.dispose(); });
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
