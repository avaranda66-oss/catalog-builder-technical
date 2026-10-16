import { describe, expect, it, vi } from 'vitest';
import {
  createSaveBeforeLibraryNavigation,
  LIBRARY_NAVIGATION_MESSAGES,
  libraryNavigationNotice,
} from '@/vnext/app/catalog-navigation';
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

describe('FR-06 "Catálogos" never fails silently', () => {
  it('explains a failed save in plain words and keeps the person in the editor', async () => {
    const { repository, runtime, session, navigate } = setup();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'OFFLINE' } });
    session.execute({ type: 'document.rename', title: 'Sem conexão agora' });
    const notify = vi.fn();
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate, () => true, { notify })()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    const message = notify.mock.calls.at(-1)?.[0] as string;
    expect(message).toMatch(/^Seu trabalho ainda não foi salvo, por isso você continua neste catálogo\./);
    expect(message).toContain('Confira a conexão');
    expect(message).not.toMatch(/offline|unavailable|save/i);
    await runtime.dispose();
  });

  it('writes the reason to the editor notice by default and clears it on the next attempt', async () => {
    const { repository, runtime, session, navigate } = setup();
    repository.saveOverride = async () => ({ ok: false, error: { code: 'CONFLICT' } });
    session.execute({ type: 'document.rename', title: 'Mudou em outro lugar' });
    const requestLibrary = createSaveBeforeLibraryNavigation(runtime, navigate);
    expect(await requestLibrary()).toBe(false);
    const notice = libraryNavigationNotice(runtime);
    expect(notice.get()).toContain('Este catálogo mudou em outro lugar');

    repository.saveOverride = undefined;
    expect(await requestLibrary()).toBe(true);
    expect(notice.get()).toBeUndefined();
    expect(navigate).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it('leaves a clean catalog whose save state is not idle after settling it (it used to do nothing)', async () => {
    const { runtime, navigate } = setup();
    runtime.workspace.setPhase('unavailable', 'Rede caiu antes');
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate)()).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  it('asks to wait for "Salvo" when a save is still settling after the allowed rounds', async () => {
    const { runtime, session, navigate } = setup();
    session.execute({ type: 'document.rename', title: 'Digitando sem parar' });
    const manualSave = vi.spyOn(runtime, 'manualSave').mockResolvedValue({
      ok: false,
      error: { code: 'SAVE_IN_FLIGHT_NEWER_WORK', message: 'busy' },
    });
    const notify = vi.fn();
    const requestLibrary = createSaveBeforeLibraryNavigation(runtime, navigate, () => true, { notify, maxSaveRounds: 2 });
    expect(await requestLibrary()).toBe(false);
    expect(manualSave).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(LIBRARY_NAVIGATION_MESSAGES.stillSaving);
    expect(navigate).not.toHaveBeenCalled();
    manualSave.mockRestore();
    await runtime.dispose();
  });

  it('explains a lost session instead of ignoring the click', async () => {
    const { runtime, navigate } = setup();
    const notify = vi.fn();
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate, () => false, { notify })()).toBe(false);
    expect(notify).toHaveBeenCalledWith(LIBRARY_NAVIGATION_MESSAGES.accessChanged);
    expect(navigate).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('reports an unexpected error and keeps the draft', async () => {
    const { runtime, session, navigate } = setup();
    session.execute({ type: 'document.rename', title: 'Rascunho guardado' });
    const manualSave = vi.spyOn(runtime, 'manualSave').mockRejectedValue(new Error('boom'));
    const notify = vi.fn();
    expect(await createSaveBeforeLibraryNavigation(runtime, navigate, () => true, { notify })()).toBe(false);
    expect(notify).toHaveBeenLastCalledWith(LIBRARY_NAVIGATION_MESSAGES.unexpected);
    expect(runtime.workspace.getSnapshot().save.phase).toBe('unavailable');
    expect(session.getSnapshot().document.title).toBe('Rascunho guardado');
    manualSave.mockRestore();
    await runtime.dispose();
  });
});
