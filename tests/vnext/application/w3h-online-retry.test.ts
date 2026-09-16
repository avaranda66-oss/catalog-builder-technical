import { describe, expect, it } from 'vitest';
import { attachPersistenceOnlineRetry } from '@/vnext/app/bootstrap';
import type { CatalogPersistenceEnvelope, PersistenceResult, SaveCatalogCasRequest } from '@/vnext/persistence';
import {
  StrictCasCatalogRepository,
  deferred,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from '../persistence/w3h-fixtures';

describe('W3.H browser online retry lifecycle', () => {
  it('coalesces repeated online events and disposal makes obsolete-runtime events inert', async () => {
    const document = documentFixture();
    const repository = new StrictCasCatalogRepository(document);
    const active = runtimeFixture(repository, document, 12000, { autosave: false });

    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    active.session.execute({ type: 'document.rename', title: 'Offline L1' });
    expect(await active.runtime.saveCoordinator.save()).toMatchObject({
      ok: false,
      error: { code: 'OFFLINE' },
    });
    expect(active.runtime.workspace.getSnapshot().save.phase).toBe('unavailable');

    const detach = attachPersistenceOnlineRetry(active.runtime, window);
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let retryRequest: SaveCatalogCasRequest | undefined;
    repository.saveOverride = async (request) => {
      retryRequest = request;
      return pending.promise;
    };

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    await settleAsyncWork(2);
    expect(repository.saveCAS).toHaveBeenCalledTimes(2);
    expect(retryRequest).toBeDefined();
    pending.resolve(repository.commitSave(retryRequest!));
    await active.runtime.saveCoordinator.waitForActiveSave();
    await settleAsyncWork();
    expect(active.runtime.workspace.getSnapshot().save.label).toBe('Saved');

    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    active.session.execute({ type: 'document.rename', title: 'Offline L2' });
    expect(await active.runtime.saveCoordinator.save()).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
    expect(repository.saveCAS).toHaveBeenCalledTimes(3);
    detach();
    window.dispatchEvent(new Event('online'));
    await settleAsyncWork();
    expect(repository.saveCAS).toHaveBeenCalledTimes(3);
    await active.runtime.dispose();
  });
});
