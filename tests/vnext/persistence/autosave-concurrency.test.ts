import { describe, expect, it, vi } from 'vitest';
import { InMemoryRecoveryRepository } from '@/vnext/recovery';
import type {
  CatalogPersistenceEnvelope,
  PersistenceResult,
  SaveCatalogCasRequest,
} from '@/vnext/persistence';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from './w3h-fixtures';

function rename(runtime: ReturnType<typeof runtimeFixture>, title: string): void {
  expect(runtime.session.execute({ type: 'document.rename', title }).ok).toBe(true);
}

function saveRequests(repository: StrictCasCatalogRepository): SaveCatalogCasRequest[] {
  return repository.saveCAS.mock.calls.map(([request]) => request);
}

describe('W3.H deterministic autosave coordinator', () => {
  it('AUTOSAVE-01 coalesces rapid L1/L2/L3 edits into one save of latest L3', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 100, { autosaveClock: clock });

    rename(active, 'L1');
    rename(active, 'L2');
    rename(active, 'L3');

    expect(clock.pendingCount()).toBe(1);
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
    clock.advanceBy(25);
    await settleAsyncWork();

    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(saveRequests(repository)[0]?.documentSnapshot.title).toBe('L3');
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 2, title: 'L3' });
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      save: { phase: 'idle', label: 'Saved' },
      binding: { remoteRevision: 2 },
    });
  });

  it('AUTOSAVE-02 manual Save cancels pending debounce and flushes through the same SaveCoordinator once', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 200, { autosaveClock: clock });
    const canonicalSave = active.runtime.saveCoordinator.save.bind(active.runtime.saveCoordinator);
    const saveSpy = vi.spyOn(active.runtime.saveCoordinator, 'save');

    rename(active, 'Manual now');
    expect(clock.pendingCount()).toBe(1);
    const result = await active.runtime.manualSave();

    expect(result).toMatchObject({ ok: true, acknowledged: true });
    expect(clock.pendingCount()).toBe(0);
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(active.runtime.saveCoordinator.save.bind(active.runtime.saveCoordinator)).not.toBe(canonicalSave);
    clock.advanceBy(500);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
  });

  it('AUTOSAVE-03 joins manual flush with the same captured autosave state without duplicate remote dispatch', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      request = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 300, { autosaveClock: clock });

    rename(active, 'One captured state');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);

    const manual = active.runtime.manualSave();
    await settleAsyncWork(2);
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(request).toBeDefined();
    pending.resolve(repository.commitSave(request!));
    expect(await manual).toMatchObject({ ok: true, acknowledged: true });
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);
  });

  it('AUTOSAVE-04/05 preserves L2 across S1 ACK and follows with exactly one S2 from acknowledged revision', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let s1: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      s1 = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 400, { autosaveClock: clock });

    rename(active, 'L1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(s1?.expectedRemoteRevision).toBe(1);

    rename(active, 'L2');
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'saving', label: 'Saving…' },
    });

    pending.resolve(repository.commitSave(s1!));
    await settleAsyncWork();
    const afterS1 = active.runtime.workspace.getSnapshot();
    expect(afterS1.session.getSnapshot().document.title).toBe('L2');
    expect(afterS1).toMatchObject({
      dirty: true,
      save: { phase: 'idle', label: 'Unsaved changes' },
      binding: { remoteRevision: 2, lastMutationId: s1?.mutationId },
    });
    expect(clock.pendingCount()).toBe(1);

    clock.advanceBy(25);
    await settleAsyncWork();
    const requests = saveRequests(repository);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ expectedRemoteRevision: 2 });
    expect(requests[1]?.mutationId).not.toBe(requests[0]?.mutationId);
    expect(requests[1]?.documentSnapshot.title).toBe('L2');
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 3, title: 'L2' });
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(false);
  });

  it('AUTOSAVE-06 coalesces L2/L3/L4 authored during S1 into one latest follow-up save', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let s1: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      s1 = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 500, { autosaveClock: clock });

    rename(active, 'L1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    rename(active, 'L2');
    rename(active, 'L3');
    rename(active, 'L4');

    pending.resolve(repository.commitSave(s1!));
    await settleAsyncWork();
    expect(clock.pendingCount()).toBe(1);
    clock.advanceBy(25);
    await settleAsyncWork();

    const requests = saveRequests(repository);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.documentSnapshot.title).toBe('L4');
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 3, title: 'L4' });
  });

  it('AUTOSAVE-07 cancels a pending autosave when Undo returns to exact acknowledged equivalence', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 600, { autosaveClock: clock });

    rename(active, 'Transient');
    expect(clock.pendingCount()).toBe(1);
    expect(active.session.undo().ok).toBe(true);
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      save: { label: 'Saved' },
    });
    expect(clock.pendingCount()).toBe(0);
    clock.advanceBy(250);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
    expect(repository.current(document.id).remoteRevision).toBe(1);
  });

  it('AUTOSAVE-08 defers before prepareForSave while a draft is pending, without retry storm, then resumes', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 700, { autosaveClock: clock });
    let blocked = true;
    const prepareForSave = vi.fn(() => blocked
      ? { ok: false as const, reason: 'COMPOSITION_ACTIVE' as const, message: 'Finish composition' }
      : { ok: true as const });
    const binding = active.runtime.workspace.getSnapshot().binding;
    active.runtime.registerAuthoringBarrier(binding.openSessionId, {
      hasPendingDraft: () => blocked,
      prepareForSave,
    });

    rename(active, 'Barrier edit');
    clock.advanceBy(25);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
    expect(prepareForSave).not.toHaveBeenCalled();
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'idle', label: 'Unsaved changes' },
    });
    expect(clock.pendingCount()).toBe(0);
    clock.advanceBy(1000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
    expect(prepareForSave).not.toHaveBeenCalled();

    blocked = false;
    active.runtime.workspace.notifyDraftStateChanged();
    expect(clock.pendingCount()).toBe(1);
    clock.advanceBy(25);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(prepareForSave).toHaveBeenCalledTimes(1);
    expect(active.runtime.workspace.getSnapshot().save.label).toBe('Saved');
  });

  it('AUTOSAVE-09 keeps OFFLINE work dirty and locally recoverable without tight-looping', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const recoveryRepository = new InMemoryRecoveryRepository();
    const clock = new ManualAutosaveClock();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    const active = runtimeFixture(repository, document, 800, {
      autosaveClock: clock,
      recoveryRepository,
    });

    rename(active, 'Offline local');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    await active.runtime.saveCoordinator.waitForActiveSave();

    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'unavailable', label: 'Offline / unavailable' },
    });
    expect(clock.pendingCount()).toBe(0);
    const recovery = await recoveryRepository.listByScope('scope:user-a');
    const valid = recovery.find((item) => item.status === 'VALID');
    expect(valid?.status).toBe('VALID');
    if (valid?.status === 'VALID') {
      expect(valid.record.documentSnapshot.title).toBe('Offline local');
      expect(valid.record.pendingRemoteMutation).toBeUndefined();
    }
    clock.advanceBy(5000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    await active.runtime.dispose();
  });

  it('AUTOSAVE-10 explicit online/manual retry saves the latest state after a prior remote failure', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    const active = runtimeFixture(repository, document, 900, { autosaveClock: clock });

    rename(active, 'Failed L1');
    clock.advanceBy(25);
    await settleAsyncWork();
    expect(active.runtime.workspace.getSnapshot().save.phase).toBe('unavailable');
    rename(active, 'Latest L2');
    expect(repository.saveCAS).toHaveBeenCalledTimes(1);

    expect(await active.runtime.retryRemoteSave()).toMatchObject({ ok: true, acknowledged: true });
    expect(repository.saveCAS).toHaveBeenCalledTimes(2);
    expect(saveRequests(repository)[1]?.documentSnapshot.title).toBe('Latest L2');
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 2, title: 'Latest L2' });
  });

  it('AUTOSAVE-11 reconciles an ambiguous S1 with the same mutation before allocating S2 for newer work', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    repository.saveOverride = async () => ({
      ok: false,
      error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' },
    });
    repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    const active = runtimeFixture(repository, document, 1000, { autosaveClock: clock });

    rename(active, 'Ambiguous L1');
    clock.advanceBy(25);
    await settleAsyncWork();
    expect(active.runtime.workspace.getSnapshot().save.phase).toBe('ambiguous');
    const firstRequest = saveRequests(repository)[0]!;
    expect(active.runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(true);

    rename(active, 'Newer L2');
    expect(await active.runtime.retryRemoteSave()).toMatchObject({ ok: true, acknowledged: true });
    const requests = saveRequests(repository);
    expect(requests).toHaveLength(3);
    expect(requests[1]).toEqual(firstRequest);
    expect(requests[1]?.mutationId).toBe(firstRequest.mutationId);
    expect(requests[2]?.mutationId).not.toBe(firstRequest.mutationId);
    expect(requests[2]).toMatchObject({ expectedRemoteRevision: 2 });
    expect(requests[2]?.documentSnapshot.title).toBe('Newer L2');
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 3, title: 'Newer L2' });
    expect(active.runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);
  });

  it('AUTOSAVE-12 derives conflict from strict stale-revision CAS and suspends automatic retries', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clockA = new ManualAutosaveClock();
    const clockB = new ManualAutosaveClock();
    const tabA = runtimeFixture(repository, document, 1100, { autosaveClock: clockA });
    const tabB = runtimeFixture(repository, document, 1200, { autosaveClock: clockB });

    rename(tabA, 'A1');
    expect(await tabA.runtime.manualSave()).toMatchObject({ ok: true });
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 2, title: 'A1' });

    rename(tabB, 'B1');
    clockB.advanceBy(25);
    await settleAsyncWork();

    expect(tabB.session.getSnapshot().document.title).toBe('B1');
    expect(tabB.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'conflict', label: 'Conflict' },
      binding: { remoteRevision: 1 },
    });
    expect(clockB.pendingCount()).toBe(0);
    const callsAfterConflict = repository.saveCAS.mock.calls.length;
    clockB.advanceBy(5000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(callsAfterConflict);
    expect(tabA.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      binding: { remoteRevision: 2 },
    });
  });
});

describe('W3.H L1/S1/L2 and strict two-session races', () => {
  it('keeps newer local work when S1 itself loses CAS and suspends the conflicted session', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      request = captured;
      return pending.promise;
    };
    const tabB = runtimeFixture(repository, document, 1300, { autosaveClock: clock });
    rename(tabB, 'L1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    rename(tabB, 'L2');
    repository.externalSave(document.id, 'Other tab');
    pending.resolve(repository.commitSave(request!));
    await settleAsyncWork();

    expect(tabB.session.getSnapshot().document.title).toBe('L2');
    expect(tabB.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'conflict' },
      binding: { remoteRevision: 1 },
    });
    expect(clock.pendingCount()).toBe(0);
  });

  it('keeps L2 while ambiguous S1 is reconciled before any new mutation', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      request = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 1400, { autosaveClock: clock });
    rename(active, 'L1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    rename(active, 'L2');
    pending.resolve({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    await settleAsyncWork();

    expect(request).toBeDefined();
    expect(active.session.getSnapshot().document.title).toBe('L2');
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'ambiguous' } });
    expect(active.runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(true);
    expect(saveRequests(repository)).toHaveLength(1);
  });

  it('makes an S1 completion inert after a fresh openSession replaces the active session', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      request = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 1500, { autosaveClock: clock });
    rename(active, 'Old S1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    const oldSession = active.runtime.workspace.getSnapshot().session;
    const oldOpenSession = active.runtime.workspace.getSnapshot().binding.openSessionId;
    repository.externalSave(document.id, 'Latest remote');
    expect(await active.runtime.reopenCoordinator.open(document.id, { allowDiscardUnsaved: true })).toMatchObject({ ok: true });
    const replacement = active.runtime.workspace.getSnapshot();
    expect(replacement.session).not.toBe(oldSession);
    expect(replacement.binding.openSessionId).not.toBe(oldOpenSession);

    pending.resolve({ ok: true, value: {
      ...repository.current(document.id),
      remoteRevision: 2,
      lastMutationId: request!.mutationId,
      title: request!.documentSnapshot.title,
      documentSnapshot: request!.documentSnapshot,
    } });
    await settleAsyncWork();
    expect(active.runtime.workspace.getSnapshot().session).toBe(replacement.session);
    expect(active.runtime.workspace.getSnapshot().session.getSnapshot().document.title).toBe('Latest remote');
  });

  it('makes an S1 completion inert after auth authority changes', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (captured) => {
      request = captured;
      return pending.promise;
    };
    const active = runtimeFixture(repository, document, 1600, { autosaveClock: clock });
    rename(active, 'Auth S1');
    clock.advanceBy(25);
    await settleAsyncWork(2);
    active.runtime.updateAuthContext('user-b:1', 'scope:user-b');
    pending.resolve({
      ok: true,
      value: {
        ...repository.current(document.id),
        remoteRevision: 2,
        lastMutationId: request!.mutationId,
        title: request!.documentSnapshot.title,
        documentSnapshot: request!.documentSnapshot,
      },
    });
    await settleAsyncWork();
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      binding: { remoteRevision: 1, authLineage: 'user-b:1' },
      activeAuthorityScopeId: 'scope:user-b',
    });
  });

  it('keeps authored Undo history after S1 ACK instead of resetting the session', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 1700, { autosaveClock: clock });
    const session = active.session;
    rename(active, 'L1');
    expect(await active.runtime.manualSave()).toMatchObject({ ok: true });
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.title).toBe('Original');
    expect(session.getSnapshot().canRedo).toBe(true);
    expect(active.runtime.workspace.getSnapshot().session).toBe(session);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(true);
  });

  it('conflicts when A advances while B has only a pending debounce from revision N', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clockA = new ManualAutosaveClock();
    const clockB = new ManualAutosaveClock();
    const tabA = runtimeFixture(repository, document, 1800, { autosaveClock: clockA });
    const tabB = runtimeFixture(repository, document, 1900, { autosaveClock: clockB });
    rename(tabB, 'B pending');
    expect(clockB.pendingCount()).toBe(1);
    rename(tabA, 'A advances');
    await tabA.runtime.manualSave();

    clockB.advanceBy(25);
    await settleAsyncWork();
    expect(tabB.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'conflict' } });
    expect(tabB.session.getSnapshot().document.title).toBe('B pending');
    expect(repository.current(document.id)).toMatchObject({ title: 'A advances', remoteRevision: 2 });
  });

  it('conflicts when B request was dispatched at N but A commits before repository resolves B CAS', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clockA = new ManualAutosaveClock();
    const clockB = new ManualAutosaveClock();
    const tabA = runtimeFixture(repository, document, 2000, { autosaveClock: clockA });
    const tabB = runtimeFixture(repository, document, 2100, { autosaveClock: clockB });
    const bPending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let bRequest: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (request) => {
      bRequest = request;
      return bPending.promise;
    };

    rename(tabB, 'B dispatched');
    clockB.advanceBy(25);
    await settleAsyncWork(2);
    expect(bRequest?.expectedRemoteRevision).toBe(1);

    rename(tabA, 'A wins');
    await tabA.runtime.manualSave();
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 2, title: 'A wins' });
    bPending.resolve(repository.commitSave(bRequest!));
    await settleAsyncWork();

    expect(tabB.session.getSnapshot().document.title).toBe('B dispatched');
    expect(tabB.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'conflict' } });
    expect(repository.current(document.id)).toMatchObject({ remoteRevision: 2, title: 'A wins' });
  });

  it('cancels old-session debounce when canonical reopen replaces the session', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 2200, { autosaveClock: clock });
    rename(active, 'Old local');
    expect(clock.pendingCount()).toBe(1);
    repository.externalSave(document.id, 'Remote replacement');
    expect(await active.runtime.reopenCoordinator.open(document.id, { allowDiscardUnsaved: true })).toMatchObject({ ok: true });
    expect(clock.pendingCount()).toBe(0);
    clock.advanceBy(1000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
    expect(active.runtime.workspace.getSnapshot().session.getSnapshot().document.title).toBe('Remote replacement');
  });

  it('dispose cancels a pending autosave timer and no later remote save occurs', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 2300, { autosaveClock: clock });
    rename(active, 'Dispose me');
    expect(clock.pendingCount()).toBe(1);
    await active.runtime.dispose();
    expect(clock.pendingCount()).toBe(0);
    clock.advanceBy(1000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(0);
  });
});
