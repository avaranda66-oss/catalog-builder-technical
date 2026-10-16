import { describe, expect, it, vi } from 'vitest';
import type { PersistenceErrorCode, SaveCatalogCasRequest } from '@/vnext/persistence';
import { AUTOSAVE_MAX_RETRIES, AUTOSAVE_RETRY_DELAYS_MS } from '@/vnext/persistence/autosave-coordinator';
import { fatherSaveExplanation, fatherSaveLabel } from '@/vnext/app/save-presentation';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from './w3h-fixtures';

function setup(seed: number) {
  const document = documentFixture();
  const repository = new StrictCasCatalogRepository(document);
  const clock = new ManualAutosaveClock();
  const active = runtimeFixture(repository, document, seed, { autosaveClock: clock });
  const failWith = (code: PersistenceErrorCode) => {
    repository.saveCAS.mockImplementation(async () => ({ ok: false, error: { code } }));
  };
  const serverBack = () => {
    repository.saveCAS.mockImplementation(async (request: SaveCatalogCasRequest) => repository.commitSave(request));
  };
  const rename = (title: string) => {
    expect(active.session.execute({ type: 'document.rename', title }).ok).toBe(true);
  };
  const save = () => active.runtime.workspace.getSnapshot().save;
  return { document, repository, clock, active, failWith, serverBack, rename, save };
}

type Setup = ReturnType<typeof setup>;

/** Nothing happens one millisecond early; exactly one new save runs at the planned moment. */
async function expectRetryAfter(state: Setup, delayMs: number): Promise<void> {
  const before = state.repository.saveCAS.mock.calls.length;
  state.clock.advanceBy(delayMs - 1);
  await settleAsyncWork();
  expect(state.repository.saveCAS).toHaveBeenCalledTimes(before);
  state.clock.advanceBy(1);
  await vi.waitFor(() => expect(state.repository.saveCAS).toHaveBeenCalledTimes(before + 1));
  await state.active.runtime.saveCoordinator.waitForActiveSave();
  await settleAsyncWork();
}

describe('FR-44 automatic save retries', () => {
  it('tries again after 5 s, 15 s and then every 60 s, 5 times at most, and then says what to do', async () => {
    const state = setup(5100);
    state.failWith('OFFLINE');
    state.rename('Sem conexão');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save()).toMatchObject({
      phase: 'unavailable',
      retry: { attempt: 0, maxAttempts: 5, exhausted: false },
    }));
    expect(state.save().retry?.nextAttemptAt).toEqual(expect.any(Number));
    expect(fatherSaveExplanation(state.save())).toBe(
      'Não foi possível falar com o servidor agora: suas alterações continuam nesta tela, mas ainda não foram salvas. '
      + 'Vamos tentar salvar de novo sozinhos em instantes. Você também pode clicar em Salvar.'
    );

    expect(AUTOSAVE_RETRY_DELAYS_MS).toEqual([5_000, 15_000, 60_000]);
    expect(AUTOSAVE_MAX_RETRIES).toBe(5);
    const waits = [5_000, 15_000, 60_000, 60_000, 60_000];
    for (const [index, delay] of waits.entries()) {
      await expectRetryAfter(state, delay);
      expect(state.save()).toMatchObject({ phase: 'unavailable', retry: { attempt: index + 1 } });
    }

    expect(state.repository.saveCAS).toHaveBeenCalledTimes(6);
    expect(state.save()).toMatchObject({ dirty: true, retry: { attempt: 5, exhausted: true } });
    expect(state.save().retry?.nextAttemptAt).toBeUndefined();
    expect(state.clock.pendingCount()).toBe(0);
    state.clock.advanceBy(10 * 60_000);
    await settleAsyncWork();
    expect(state.repository.saveCAS).toHaveBeenCalledTimes(6);
    expect(fatherSaveExplanation(state.save())).toContain('Tentamos salvar várias vezes sem conseguir. Confira a conexão e clique em Salvar.');
    await state.active.runtime.dispose();
  });

  it('starts counting again after a confirmed save', async () => {
    const state = setup(5200);
    state.failWith('REMOTE_FAILURE');
    state.rename('Servidor instável');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save().phase).toBe('unavailable'));
    await expectRetryAfter(state, 5_000);
    expect(state.save().retry?.attempt).toBe(1);

    state.serverBack();
    await expectRetryAfter(state, 15_000);
    expect(state.save()).toMatchObject({ phase: 'idle', label: 'Saved', dirty: false });
    expect(state.save().retry).toBeUndefined();
    expect(state.repository.current(state.document.id)).toMatchObject({ title: 'Servidor instável' });

    state.failWith('OFFLINE');
    state.rename('Caiu de novo');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save()).toMatchObject({ phase: 'unavailable', retry: { attempt: 0 } }));
    // Back to the first wait (5 s), not the 60 s of the earlier failures.
    await expectRetryAfter(state, 5_000);
    expect(state.save().retry?.attempt).toBe(1);
    await state.active.runtime.dispose();
  });

  it('checks an unconfirmed save again by itself with the same change, without sending a new one', async () => {
    const state = setup(5300);
    state.repository.saveOverride = async () => ({ ok: false, error: { code: 'AMBIGUOUS_COMMIT_OUTCOME' } });
    state.repository.getOverride = async () => ({ ok: false, error: { code: 'REMOTE_FAILURE' } });
    state.rename('Não confirmado');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save()).toMatchObject({ phase: 'ambiguous', retry: { attempt: 0 } }));
    expect(fatherSaveExplanation(state.save())).toBe(
      'O salvamento ainda não foi confirmado. Mantenha esta aba aberta. Vamos tentar salvar de novo sozinhos em instantes. Você também pode clicar em Salvar.'
    );
    const first = state.repository.saveCAS.mock.calls[0]![0];

    state.clock.advanceBy(5_000);
    await vi.waitFor(() => expect(state.save()).toMatchObject({ phase: 'idle', label: 'Saved', dirty: false }));
    expect(state.repository.saveCAS.mock.calls[1]![0].mutationId).toBe(first.mutationId);
    expect(state.repository.current(state.document.id)).toMatchObject({ title: 'Não confirmado' });
    await state.active.runtime.dispose();
  });

  it('does not retry an expired session by itself and names it apart from a connection problem', async () => {
    const state = setup(5400);
    state.failWith('UNAUTHORIZED');
    state.rename('Sessão expirada');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save().phase).toBe('unauthorized'));
    await settleAsyncWork();

    expect(state.save()).toMatchObject({ label: 'Session expired', dirty: true });
    expect(state.save().retry).toBeUndefined();
    expect(fatherSaveLabel(state.save().label)).toBe('Sessão expirada — entre novamente');
    expect(fatherSaveLabel('Offline / unavailable')).toBe('Sem conexão / indisponível');
    expect(state.clock.pendingCount()).toBe(0);
    state.clock.advanceBy(60_000);
    await settleAsyncWork();
    expect(state.repository.saveCAS).toHaveBeenCalledTimes(1);
    await state.active.runtime.dispose();
  });

  it('a click on Salvar after the retries ran out starts a new set of automatic retries', async () => {
    const state = setup(5500);
    state.failWith('OFFLINE');
    state.rename('Sem conexão por muito tempo');
    state.clock.advanceBy(25);
    await vi.waitFor(() => expect(state.save().phase).toBe('unavailable'));
    for (const delay of [5_000, 15_000, 60_000, 60_000, 60_000]) await expectRetryAfter(state, delay);
    expect(state.save().retry).toMatchObject({ exhausted: true });

    expect(await state.active.runtime.manualSave()).toMatchObject({ ok: false, error: { code: 'OFFLINE' } });
    await settleAsyncWork();
    expect(state.save()).toMatchObject({ phase: 'unavailable', retry: { attempt: 0, exhausted: false } });
    await expectRetryAfter(state, 5_000);
    expect(state.save().retry?.attempt).toBe(1);
    await state.active.runtime.dispose();
  });
});
