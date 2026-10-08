import { describe, expect, it, vi } from 'vitest';
import { createSaveBeforeLibraryNavigation } from '@/vnext/app/catalog-navigation';
import type { CatalogPersistenceEnvelope, PersistenceResult } from '@/vnext/persistence';
import { deferred, documentFixture, runtimeFixture, StrictCasCatalogRepository } from '../persistence/w3h-fixtures';

function setup() {
  const document = documentFixture();
  const repository = new StrictCasCatalogRepository(document);
  const { runtime, session } = runtimeFixture(repository, document, 500, { autosave: true });
  const navigate = vi.fn();
  return { repository, runtime, session, navigate };
}

describe('Save before returning to the Library', () => {
  it('saves a dirty catalog after one click and leaves with the acknowledged document', async () => {
    const { repository, runtime, session, navigate } = setup();
    session.execute({ type: 'document.rename', title: 'Edição mais recente' });
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate)()).toBe(true);
    expect(repository.current(documentFixture().id).title).toBe('Edição mais recente');
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it('coalesces double clicks and includes newer work authored during the save', async () => {
    const { repository, runtime, session, navigate } = setup();
    const delayed = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    repository.saveOverride = (request) => delayed.promise.then(() => repository.commitSave(request));
    session.execute({ type: 'document.rename', title: 'Primeira edição' });
    const requestLibrary = createSaveBeforeLibraryNavigation(runtime, navigate);
    const first = requestLibrary();
    const second = requestLibrary();
    expect(first).toBe(second);
    expect(navigate).not.toHaveBeenCalled();
    session.execute({ type: 'document.rename', title: 'Última edição' });
    delayed.resolve({ ok: true, value: repository.current(documentFixture().id) });
    expect(await first).toBe(true);
    expect(repository.current(documentFixture().id).title).toBe('Última edição');
    expect(repository.saveCAS).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
    await requestLibrary();
    expect(navigate).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it.each(['OFFLINE', 'UNAUTHORIZED', 'CONFLICT'] as const)('stays in the editor with the dirty draft after %s', async (code) => {
    const { repository, runtime, session, navigate } = setup();
    repository.saveOverride = async () => ({ ok: false, error: { code } });
    session.execute({ type: 'document.rename', title: 'Trabalho preservado' });
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate)()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(session.getSnapshot().document.title).toBe('Trabalho preservado');
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
    await runtime.dispose();
  });

  it('does not navigate if authority changes while the acknowledged save is in flight', async () => {
    const { repository, runtime, session, navigate } = setup();
    const delayed = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    repository.saveOverride = (request) => delayed.promise.then(() => repository.commitSave(request));
    session.execute({ type: 'document.rename', title: 'Edição protegida' });
    let hasAuthority = true;
    const pending = createSaveBeforeLibraryNavigation(runtime, navigate, () => hasAuthority)();
    hasAuthority = false;
    delayed.resolve({ ok: true, value: repository.current(documentFixture().id) });
    expect(await pending).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    await runtime.dispose();
  });
});
