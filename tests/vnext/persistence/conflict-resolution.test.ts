import { describe, expect, it, vi } from 'vitest';
import { InMemoryRecoveryRepository } from '@/vnext/recovery';
import type { CatalogPersistenceEnvelope, PersistenceResult, SaveCatalogCasRequest } from '@/vnext/persistence';
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

async function makeConflict(options: {
  readonly recovery?: boolean;
  readonly withAsset?: boolean;
  readonly resolveAssetUrls?: (
    document: ReturnType<typeof documentFixture>
  ) => ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;
} = {}) {
  const document = documentFixture(uuid(100), 'Original', options.withAsset ?? false);
  const repository = new StrictCasCatalogRepository(document);
  const clockA = new ManualAutosaveClock();
  const clockB = new ManualAutosaveClock();
  const recoveryRepository = options.recovery ? new InMemoryRecoveryRepository() : undefined;
  const tabA = runtimeFixture(repository, document, 3000, { autosaveClock: clockA });
  const tabB = runtimeFixture(repository, document, 4000, {
    autosaveClock: clockB,
    ...(recoveryRepository ? { recoveryRepository } : {}),
    ...(options.resolveAssetUrls ? { resolveAssetUrls: options.resolveAssetUrls } : {}),
  });
  rename(tabA, 'A1 authoritative');
  expect(await tabA.runtime.manualSave()).toMatchObject({ ok: true });
  rename(tabB, 'B1 local');
  clockB.advanceBy(25);
  await settleAsyncWork(2);
  await tabB.runtime.saveCoordinator.waitForActiveSave();
  expect(tabB.runtime.workspace.getSnapshot().save.phase).toBe('conflict');
  return { document, repository, clockA, clockB, recoveryRepository, tabA, tabB };
}

describe('W3.H Father conflict resolution', () => {
  it('Open latest protects B1 locally, validates/reopens authoritative state, installs fresh session/history, and resumes only the new session', async () => {
    const assetResolver = vi.fn(async () => new Map([['shared-asset', 'blob:resolved-shared-asset']]));
    const state = await makeConflict({
      recovery: true,
      withAsset: true,
      resolveAssetUrls: assetResolver,
    });
    const oldSession = state.tabB.runtime.workspace.getSnapshot().session;
    const oldOpenSessionId = state.tabB.runtime.workspace.getSnapshot().binding.openSessionId;
    expect(oldSession.getSnapshot().document.title).toBe('B1 local');

    const result = await state.tabB.runtime.conflictResolutionCoordinator.openLatest();
    expect(result).toEqual({ ok: true, catalogId: state.document.id, kind: 'latest' });
    const reopened = state.tabB.runtime.workspace.getSnapshot();
    expect(reopened.session).not.toBe(oldSession);
    expect(reopened.binding.openSessionId).not.toBe(oldOpenSessionId);
    expect(reopened.session.getSnapshot()).toMatchObject({
      document: { title: 'A1 authoritative' },
      localSequence: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(reopened).toMatchObject({
      dirty: false,
      save: { phase: 'idle', label: 'Saved' },
      binding: { kind: 'PERSISTED', remoteRevision: 2 },
    });
    expect(reopened.assetUrls.get('shared-asset')).toBe('blob:resolved-shared-asset');
    expect(assetResolver).toHaveBeenCalledWith(expect.objectContaining({ title: 'A1 authoritative' }));

    const protectedRecords = await state.recoveryRepository!.listByScope('scope:user-a');
    const protectedB1 = protectedRecords.find((item) =>
      item.status === 'VALID'
      && item.record.openSessionId === oldOpenSessionId
      && item.record.documentSnapshot.title === 'B1 local'
    );
    expect(protectedB1?.status).toBe('VALID');

    expect(oldSession.execute({ type: 'document.rename', title: 'Obsolete old session' }).ok).toBe(true);
    state.clockB.advanceBy(100);
    await settleAsyncWork();
    expect(state.repository.current(state.document.id)).toMatchObject({ title: 'A1 authoritative', remoteRevision: 2 });

    const newSession = state.tabB.runtime.workspace.getSnapshot().session;
    expect(newSession.execute({ type: 'document.rename', title: 'B2 after latest' }).ok).toBe(true);
    state.clockB.advanceBy(25);
    await settleAsyncWork(2);
    await state.tabB.runtime.saveCoordinator.waitForActiveSave();
    expect(state.repository.current(state.document.id)).toMatchObject({ title: 'B2 after latest', remoteRevision: 3 });
    await state.tabB.runtime.dispose();
  });

  it('Open latest leaves B1 intact when authoritative fetch fails', async () => {
    const state = await makeConflict();
    const beforeSession = state.tabB.runtime.workspace.getSnapshot().session;
    state.repository.getOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });

    const result = await state.tabB.runtime.conflictResolutionCoordinator.openLatest();
    expect(result).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
    expect(state.tabB.runtime.workspace.getSnapshot().session).toBe(beforeSession);
    expect(beforeSession.getSnapshot().document.title).toBe('B1 local');
    expect(state.tabB.runtime.workspace.getSnapshot().save.phase).toBe('conflict');
  });

  it('Open latest leaves B1 intact when authoritative envelope validation fails', async () => {
    const state = await makeConflict();
    const beforeSession = state.tabB.runtime.workspace.getSnapshot().session;
    state.repository.getOverride = async () => ({
      ok: true,
      value: {
        ...state.repository.current(state.document.id),
        documentSnapshot: { broken: true },
      } as unknown as CatalogPersistenceEnvelope,
    });

    const result = await state.tabB.runtime.conflictResolutionCoordinator.openLatest();
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DOCUMENT' } });
    expect(state.tabB.runtime.workspace.getSnapshot().session).toBe(beforeSession);
    expect(beforeSession.getSnapshot().document.title).toBe('B1 local');
  });

  it('Save my work as copy clones B1 to fresh catalog/session lineage and leaves the original authoritative catalog unchanged', async () => {
    const state = await makeConflict({ withAsset: true });
    const conflicted = state.tabB.runtime.workspace.getSnapshot();
    const oldOpenSessionId = conflicted.binding.openSessionId;
    const sourceLastMutationId = conflicted.binding.kind === 'PERSISTED'
      ? conflicted.binding.lastMutationId
      : '';
    const originalBeforeCopy = state.repository.current(state.document.id);

    const result = await state.tabB.runtime.conflictResolutionCoordinator.saveAsCopy();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe('copy');
    expect(result.catalogId).not.toBe(state.document.id);

    const copy = state.repository.current(result.catalogId);
    expect(copy.documentSnapshot.id).toBe(result.catalogId);
    expect(copy.documentSnapshot.id).not.toBe(state.document.id);
    expect(copy.documentSnapshot.pages[0]?.id).not.toBe(state.document.pages[0]?.id);
    expect(copy.documentSnapshot.assets).toEqual(state.document.assets);
    expect(copy.documentSnapshot.title).toBe('Cópia de B1 local');
    expect(copy.remoteRevision).toBe(1);
    expect(copy.lastMutationId).not.toBe(sourceLastMutationId);
    expect(copy.origin).toMatchObject({
      originKind: 'duplicate',
      originId: state.document.id,
      originRevision: 1,
    });

    const active = state.tabB.runtime.workspace.getSnapshot();
    expect(active.binding).toMatchObject({
      kind: 'PERSISTED',
      catalogId: result.catalogId,
      remoteRevision: 1,
      lastMutationId: copy.lastMutationId,
    });
    expect(active.binding.openSessionId).not.toBe(oldOpenSessionId);
    expect(active.session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: false, localSequence: 0 });
    expect(active.dirty).toBe(false);
    expect(state.repository.current(state.document.id)).toEqual(originalBeforeCopy);
  });

  it('keeps B local authored state when an in-flight stale request later resolves to real CAS conflict', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clockA = new ManualAutosaveClock();
    const clockB = new ManualAutosaveClock();
    const tabA = runtimeFixture(repository, document, 5000, { autosaveClock: clockA });
    const tabB = runtimeFixture(repository, document, 6000, { autosaveClock: clockB });
    let resolveB!: (result: PersistenceResult<CatalogPersistenceEnvelope>) => void;
    const pendingB = new Promise<PersistenceResult<CatalogPersistenceEnvelope>>((resolve) => { resolveB = resolve; });
    let bRequest: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (request) => {
      bRequest = request;
      return pendingB;
    };
    rename(tabB, 'B1 in flight');
    clockB.advanceBy(25);
    await settleAsyncWork(2);
    rename(tabB, 'B2 newer local');
    rename(tabA, 'A wins');
    await tabA.runtime.manualSave();
    resolveB(repository.commitSave(bRequest!));
    await settleAsyncWork();

    expect(tabB.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'conflict' } });
    expect(tabB.session.getSnapshot().document.title).toBe('B2 newer local');
    expect(repository.current(document.id)).toMatchObject({ title: 'A wins', remoteRevision: 2 });
  });
});
