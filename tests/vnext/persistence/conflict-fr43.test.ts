import { describe, expect, it, vi } from 'vitest';
import { InMemoryRecoveryRepository } from '@/vnext/recovery';
import { syncCatalogAddress } from '@/vnext/app/bootstrap';
import { projectEditableRichText } from '@/vnext/application';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import type { AuthoringBarrierResult } from '@/vnext/persistence/workspace';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
  uuid,
} from './w3h-fixtures';

function rename(active: ReturnType<typeof runtimeFixture>, title: string): void {
  expect(active.session.execute({ type: 'document.rename', title }).ok).toBe(true);
}

/** Tab A saves first; tab B (the father) then has unsaved work that conflicts. */
async function conflictInTabB(withRecovery = true, withText = false) {
  const document = withText ? textDocument() : documentFixture(uuid(700), 'Ficha TA-25N');
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

function textDocument(): CatalogDocument {
  const base = documentFixture(uuid(700), 'Ficha TA-25N');
  return {
    ...base,
    pages: [{ ...base.pages[0], objects: [{
      id: 'text-target', type: 'text', zIndex: 0,
      frame: { xMm: 20, yMm: 20, widthMm: 100, heightMm: 20 },
      text: plainRichText('original-text', 'Texto anterior'),
      style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: '#172033' },
    }] }],
  };
}

/** Models the editor barrier, with a real text command and an overlay outside the canonical document. */
function pendingTextDraft(active: ReturnType<typeof runtimeFixture>, options: {
  readonly invalid?: boolean;
  readonly duringCommit?: () => void;
} = {}) {
  const object = active.session.getSnapshot().document.pages[0].objects[0];
  if (object.type !== 'text') throw new Error('Missing text fixture');
  let pending = true;
  const overlay = {
    kind: 'TEXT_DRAFT_V1' as const,
    pageId: active.session.getSnapshot().document.pages[0].id,
    objectId: object.id,
    expectedText: object.text,
    draft: 'Texto digitado durante o salvamento',
    compositionWasActive: false,
  };
  const prepareForSave = vi.fn((): AuthoringBarrierResult => {
    if (options.invalid) return { ok: false, reason: 'INVALID_DRAFT', message: 'Revise o texto antes de confirmar.' };
    expect(active.session.execute({
      type: 'text.setContent', objectId: object.id, expectedText: object.text, plainText: overlay.draft,
    }).ok).toBe(true);
    pending = false;
    options.duringCommit?.();
    return { ok: true };
  });
  active.runtime.workspace.registerAuthoringBarrier(active.runtime.workspace.getSnapshot().binding.openSessionId, {
    prepareForSave,
    hasPendingDraft: () => pending,
    captureRecoveryOverlay: () => pending ? overlay : undefined,
  });
  return { overlay, prepareForSave };
}

function firstText(document: CatalogDocument): string | null {
  const object = document.pages[0].objects[0];
  if (object.type !== 'text') throw new Error('Missing text fixture');
  return projectEditableRichText(object.text);
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
  it('copies the visible draft typed while autosave was in flight before releasing its recovery record', async () => {
    const document = textDocument();
    const repository = new StrictCasCatalogRepository(document);
    const recoveryRepository = new InMemoryRecoveryRepository();
    const clock = new ManualAutosaveClock();
    const tabB = runtimeFixture(repository, document, 7100, { recoveryRepository, autosaveClock: clock });
    repository.externalSave(document.id, 'Salvo pelo escritório');
    const saveGate = deferred<void>();
    repository.saveOverride = async (request) => {
      await saveGate.promise;
      return repository.commitSave(request);
    };
    rename(tabB, 'Trabalho do pai');
    clock.advanceBy(25);
    await vi.waitFor(() => expect(repository.saveCAS).toHaveBeenCalledTimes(1));
    const draft = pendingTextDraft(tabB);
    saveGate.resolve();
    await vi.waitFor(() => expect(tabB.runtime.workspace.getSnapshot().save.phase).toBe('conflict'));
    await tabB.runtime.recoveryManager!.flush();
    expect(tabB.runtime.recoveryManager!.getLastWrittenRecord()?.authoringRecoveryOverlay).toEqual(draft.overlay);

    const result = await tabB.runtime.conflictResolutionCoordinator.saveAsCopy();
    expect(result).toMatchObject({ ok: true, kind: 'copy' });
    if (!result.ok) return;
    expect(draft.prepareForSave).toHaveBeenCalledTimes(1);
    expect(firstText(repository.current(result.catalogId).documentSnapshot)).toBe(draft.overlay.draft);
    expect(firstText(tabB.runtime.workspace.getSnapshot().session.getSnapshot().document)).toBe(draft.overlay.draft);
    expect(firstText(repository.current(document.id).documentSnapshot)).toBe('Texto anterior');
    const records = await recoveryRepository.listByScope('scope:user-a');
    expect(records.filter((item) => item.status === 'VALID' && item.record.catalogId === document.id)).toEqual([]);
    await tabB.runtime.dispose();
  });

  it('keeps an invalid draft, its recovery overlay and the conflict on screen without creating or reopening a catalog', async () => {
    const state = await conflictInTabB(true, true);
    const draft = pendingTextDraft(state.tabB, { invalid: true });
    await state.tabB.runtime.recoveryManager!.flush();
    const before = state.tabB.runtime.workspace.getSnapshot().session;

    await expect(state.tabB.runtime.conflictResolutionCoordinator.saveAsCopy()).resolves.toMatchObject({
      ok: false, error: { code: 'UNSAVED_CHANGES', message: 'Revise o texto antes de confirmar.' },
    });
    expect(state.tabB.runtime.workspace.getSnapshot().session).toBe(before);
    expect(state.tabB.runtime.workspace.getSnapshot().save.phase).toBe('conflict');
    expect(state.tabB.runtime.workspace.captureRecoveryOverlay()).toEqual(draft.overlay);
    expect(state.tabB.runtime.recoveryManager!.getLastWrittenRecord()?.authoringRecoveryOverlay).toEqual(draft.overlay);
    expect(state.repository.createCatalog).not.toHaveBeenCalled();
    expect(state.repository.getCatalog).not.toHaveBeenCalled();
    await state.tabB.runtime.dispose();
  });

  it('rejects the copy if committing the visible draft changes the conflict authority', async () => {
    const state = await conflictInTabB(false, true);
    const draft = pendingTextDraft(state.tabB, {
      duringCommit: () => state.tabB.runtime.workspace.updateAuthLineage('user-a:renewed'),
    });
    await expect(state.tabB.runtime.conflictResolutionCoordinator.saveAsCopy()).resolves.toMatchObject({
      ok: false, error: { code: 'STALE_RESULT' },
    });
    expect(state.tabB.runtime.workspace.getSnapshot().session).toBe(state.tabB.session);
    expect(firstText(state.tabB.session.getSnapshot().document)).toBe(draft.overlay.draft);
    expect(state.repository.createCatalog).not.toHaveBeenCalled();
    expect(state.repository.getCatalog).not.toHaveBeenCalled();
    await state.tabB.runtime.dispose();
  });

  it('joins a copy re-entered synchronously by the authoring commit and refuses the other resolution', async () => {
    const state = await conflictInTabB(false, true);
    const resolution = state.tabB.runtime.conflictResolutionCoordinator;
    let reentered: ReturnType<typeof resolution.saveAsCopy> | undefined;
    let other: ReturnType<typeof resolution.openLatest> | undefined;
    const draft = pendingTextDraft(state.tabB, { duringCommit: () => {
      reentered = resolution.saveAsCopy();
      other = resolution.openLatest();
    } });
    const first = resolution.saveAsCopy();
    const result = await first;
    expect(result).toMatchObject({ ok: true, kind: 'copy' });
    expect(reentered).toBe(first);
    await expect(other).resolves.toMatchObject({ ok: false, error: { code: 'RESOLUTION_IN_PROGRESS' } });
    expect(draft.prepareForSave).toHaveBeenCalledTimes(1);
    expect(state.repository.createCatalog).toHaveBeenCalledTimes(1);
    await state.tabB.runtime.dispose();
  });

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
