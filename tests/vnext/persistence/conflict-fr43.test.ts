import { describe, expect, it, vi } from 'vitest';
import { InMemoryRecoveryRepository } from '@/vnext/recovery';
import { syncCatalogAddress } from '@/vnext/app/bootstrap';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
  uuid,
} from './w3h-fixtures';

function rename(active: ReturnType<typeof runtimeFixture>, title: string): void {
  expect(active.session.execute({ type: 'document.rename', title }).ok).toBe(true);
}

/** Tab A saves first; tab B (the father) then has unsaved work that conflicts. */
async function conflictInTabB(withRecovery = true) {
  const document = documentFixture(uuid(700), 'Ficha TA-25N');
  const repository = new StrictCasCatalogRepository(document);
  const clockB = new ManualAutosaveClock();
  const recoveryRepository = withRecovery ? new InMemoryRecoveryRepository() : undefined;
  const tabA = runtimeFixture(repository, document, 7000, { autosaveClock: new ManualAutosaveClock() });
  const tabB = runtimeFixture(repository, document, 7100, {
    autosaveClock: clockB,
    ...(recoveryRepository ? { recoveryRepository } : {}),
  });
  rename(tabA, 'Salvo pelo escritório');
  expect(await tabA.runtime.manualSave()).toMatchObject({ ok: true });
  rename(tabB, 'Trabalho do pai');
  clockB.advanceBy(25);
  await vi.waitFor(() => expect(tabB.runtime.workspace.getSnapshot().save.phase).toBe('conflict'));
  return { document, repository, recoveryRepository, tabB };
}

/** A stand-in for window: replaceState really changes the address, like the browser does. */
function addressBar(initial: string) {
  let search = initial;
  const replaceState = vi.fn((_state: unknown, _title: string, url?: string | URL | null) => {
    search = new URL(String(url), 'https://app.test').search;
  });
  const target = {
    location: { get search() { return search; } },
    history: { replaceState },
  } as unknown as Pick<Window, 'location' | 'history'>;
  return { target, replaceState, search: () => search };
}

describe('FR-43 conflict: what happens after each choice', () => {
  it('"Salvar meu trabalho como cópia": the address follows the copy and the old backup is removed', async () => {
    const state = await conflictInTabB();
    const bar = addressBar(`?catalog=${encodeURIComponent(state.document.id)}`);
    const detach = syncCatalogAddress(state.tabB.runtime, bar.target);
    expect(bar.replaceState).not.toHaveBeenCalled();
    await state.tabB.runtime.recoveryManager!.flush();
    const before = await state.recoveryRepository!.listByScope('scope:user-a');
    expect(before.some((item) => item.status === 'VALID' && item.record.catalogId === state.document.id
      && item.record.documentSnapshot.title === 'Trabalho do pai')).toBe(true);

    const result = await state.tabB.runtime.conflictResolutionCoordinator.saveAsCopy();
    expect(result).toMatchObject({ ok: true, kind: 'copy' });
    if (!result.ok) return;

    expect(bar.replaceState).toHaveBeenLastCalledWith(null, '', `/v2?catalog=${encodeURIComponent(result.catalogId)}`);
    expect(bar.search()).toBe(`?catalog=${encodeURIComponent(result.catalogId)}`);
    expect(state.repository.current(result.catalogId).documentSnapshot.title).toBe('Cópia de Trabalho do pai');

    await settleAsyncWork();
    const records = await state.recoveryRepository!.listByScope('scope:user-a');
    const leftovers = records.filter((item) => item.status === 'VALID' && item.record.catalogId === state.document.id);
    expect(leftovers).toEqual([]);
    detach();
    await state.tabB.runtime.dispose();
  });

  it('"Abrir versão mais recente": keeps the address and a backup of the replaced work on this computer', async () => {
    const state = await conflictInTabB();
    expect(state.tabB.runtime.conflictResolutionCoordinator.keepsLocalBackup).toBe(true);
    const bar = addressBar(`?catalog=${encodeURIComponent(state.document.id)}`);
    const detach = syncCatalogAddress(state.tabB.runtime, bar.target);

    expect(await state.tabB.runtime.conflictResolutionCoordinator.openLatest())
      .toMatchObject({ ok: true, kind: 'latest', catalogId: state.document.id });

    expect(bar.replaceState).not.toHaveBeenCalled();
    const records = await state.recoveryRepository!.listByScope('scope:user-a');
    expect(records.some((item) => item.status === 'VALID' && item.record.documentSnapshot.title === 'Trabalho do pai')).toBe(true);
    expect(state.tabB.runtime.workspace.getSnapshot().session.getSnapshot().document.title).toBe('Salvo pelo escritório');
    detach();
    await state.tabB.runtime.dispose();
  });

  it('never replaces the work on screen when the backup on this computer does not hold it', async () => {
    const state = await conflictInTabB();
    vi.spyOn(state.tabB.runtime.recoveryManager!, 'getLastWrittenRecord').mockReturnValue(undefined);
    const before = state.tabB.runtime.workspace.getSnapshot().session;

    expect(await state.tabB.runtime.conflictResolutionCoordinator.openLatest()).toMatchObject({
      ok: false,
      error: { code: 'LOCAL_PROTECTION_UNAVAILABLE' },
    });
    expect(state.repository.getCatalog).not.toHaveBeenCalled();
    const after = state.tabB.runtime.workspace.getSnapshot();
    expect(after.session).toBe(before);
    expect(after.session.getSnapshot().document.title).toBe('Trabalho do pai');
    expect(after.save.phase).toBe('conflict');
    await state.tabB.runtime.dispose();
  });

  it('says no backup is kept when this computer cannot keep one', async () => {
    const state = await conflictInTabB(false);
    expect(state.tabB.runtime.conflictResolutionCoordinator.keepsLocalBackup).toBe(false);
    await state.tabB.runtime.dispose();
  });

  it('fixes an address that does not match the open catalog and stops after detaching', async () => {
    const document = documentFixture(uuid(710), 'Outro');
    const { runtime } = runtimeFixture(new StrictCasCatalogRepository(document), document, 7200, { autosave: false });
    const bar = addressBar('?catalog=antigo');
    const detach = syncCatalogAddress(runtime, bar.target);
    expect(bar.replaceState).toHaveBeenCalledTimes(1);
    expect(bar.search()).toBe(`?catalog=${encodeURIComponent(document.id)}`);
    detach();
    await runtime.dispose();
  });
});
