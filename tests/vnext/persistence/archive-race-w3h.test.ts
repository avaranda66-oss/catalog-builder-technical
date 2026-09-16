import { describe, expect, it } from 'vitest';
import type { ApplicationExecutionDependencies } from '@/vnext/application';
import { CatalogLibraryService } from '@/vnext/library';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  documentFixture,
  idSequence,
  runtimeFixture,
  settleAsyncWork,
  uuid,
} from './w3h-fixtures';

describe('W3.H archive race fail-closed behavior', () => {
  it('keeps archive authoritative against stale manual Save, autosave, and Library Rename without resurrection', async () => {
    const document = documentFixture(uuid(300), 'Original');
    const repository = new StrictCasCatalogRepository(document);
    const originalEnvelope = repository.current(document.id);
    const manualClock = new ManualAutosaveClock();
    const autoClock = new ManualAutosaveClock();
    const staleManual = runtimeFixture(repository, document, 8000, { autosaveClock: manualClock });
    const staleAuto = runtimeFixture(repository, document, 9000, { autosaveClock: autoClock });

    const archived = await repository.archiveCAS({
      catalogId: document.id,
      expectedRemoteRevision: 1,
      mutationId: uuid(88000),
    });
    expect(archived).toMatchObject({ ok: true, value: { remoteRevision: 2 } });
    expect(repository.current(document.id).archivedAt).not.toBeNull();

    expect(staleManual.session.execute({ type: 'document.rename', title: 'Manual stale' }).ok).toBe(true);
    expect(await staleManual.runtime.manualSave()).toMatchObject({
      ok: false,
      error: { code: 'ARCHIVED' },
    });
    expect(staleManual.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'blocked' } });

    expect(staleAuto.session.execute({ type: 'document.rename', title: 'Autosave stale' }).ok).toBe(true);
    autoClock.advanceBy(25);
    await settleAsyncWork();
    expect(staleAuto.runtime.workspace.getSnapshot()).toMatchObject({ dirty: true, save: { phase: 'blocked' } });
    const saveCallsAfterArchiveFailures = repository.saveCAS.mock.calls.length;
    autoClock.advanceBy(5000);
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(saveCallsAfterArchiveFailures);

    repository.getOverride = async () => ({ ok: true, value: originalEnvelope });
    const ids = idSequence(100000);
    const applicationDependencies: ApplicationExecutionDependencies = { createId: ids };
    const library = new CatalogLibraryService({
      repository,
      applicationDependencies,
      createId: ids,
      createMutationId: ids,
      createOpenSessionId: ids,
      authLineage: () => 'user-a:0',
      authorityScopeId: () => 'scope:user-a',
    });
    expect(await library.rename(document.id, 'Rename stale')).toMatchObject({
      ok: false,
      error: { code: 'ARCHIVED' },
    });

    const authoritative = repository.current(document.id);
    expect(authoritative).toMatchObject({
      catalogId: document.id,
      remoteRevision: 2,
      title: 'Original',
    });
    expect(authoritative.archivedAt).not.toBeNull();
    expect(repository.createCatalog).toHaveBeenCalledTimes(0);
    expect(repository.catalogCount()).toBe(1);
  });
});
