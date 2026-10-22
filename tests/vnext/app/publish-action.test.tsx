import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishAction } from '@/vnext/app/editor/PublishAction';
import type { ManualSaveResult } from '@/vnext/persistence/save-coordinator';

afterEach(cleanup);

function setup(save?: { phase: 'idle' | 'conflict' | 'saving'; result?: ManualSaveResult }, prepared = true) {
  const onOpen = vi.fn(), onMessage = vi.fn(), prepare = vi.fn(() => prepared);
  const run = vi.fn(async () => save?.result ?? { ok: true as const, acknowledged: true });
  render(<PublishAction prepare={prepare} onOpen={onOpen} onMessage={onMessage} save={save && { phase: save.phase, run }} />);
  return { onOpen, onMessage, prepare, run, button: screen.getByRole('button', { name: 'Publicar / PDF' }) };
}

describe('FR-50 Publicar / PDF', () => {
  it('saves and opens the review under React.StrictMode (mount, unmount, mount)', async () => {
    const onOpen = vi.fn(), onMessage = vi.fn();
    const run = vi.fn(async () => ({ ok: true as const, acknowledged: true }));
    render(<React.StrictMode><PublishAction prepare={() => true} onOpen={onOpen} onMessage={onMessage} save={{ phase: 'idle', run }} /></React.StrictMode>);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Publicar / PDF' })); });
    expect(run).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Publicar / PDF' }).getAttribute('aria-busy')).toBeNull();
  });


  it('opens directly when there is nothing to save (in-memory catalog)', async () => {
    const { onOpen, button } = setup();
    await act(async () => { fireEvent.click(button); });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('keeps the person in the open edit when it cannot be finished', async () => {
    const { onOpen, run, button } = setup({ phase: 'idle' }, false);
    await act(async () => { fireEvent.click(button); });
    expect(run).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('asks to resolve a save conflict first instead of opening a review that would wait forever', async () => {
    const { onOpen, onMessage, run, button } = setup({ phase: 'conflict' });
    await act(async () => { fireEvent.click(button); });
    expect(run).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith('Antes de publicar, escolha o que fazer com o conflito de salvamento, no aviso acima da página.');
  });

  it('opens the review when a newer save is already running (the review waits for it)', async () => {
    const { onOpen, run, button } = setup({ phase: 'saving', result: { ok: false, error: { code: 'SAVE_IN_FLIGHT_NEWER_WORK' } } });
    await act(async () => { fireEvent.click(button); });
    expect(run).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('explains instead of failing silently when the save itself throws', async () => {
    const onOpen = vi.fn(), onMessage = vi.fn();
    const run = vi.fn(() => Promise.reject(new Error('storage failed')));
    render(<PublishAction prepare={() => true} onOpen={onOpen} onMessage={onMessage} save={{ phase: 'idle', run }} />);
    const button = screen.getByRole('button', { name: 'Publicar / PDF' });
    await act(async () => { fireEvent.click(button); });
    expect(run).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith('Para publicar, o catálogo precisa estar salvo, e não foi possível salvar agora. '
      + 'Confira o aviso de salvamento e clique em Publicar / PDF novamente.');
    expect(button).toHaveTextContent('Publicar / PDF');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('ignores repeated clicks while saving', async () => {
    let finish!: (value: ManualSaveResult) => void;
    const onOpen = vi.fn();
    const run = vi.fn(() => new Promise<ManualSaveResult>((resolve) => { finish = resolve; }));
    render(<PublishAction prepare={() => true} onOpen={onOpen} onMessage={vi.fn()} save={{ phase: 'idle', run }} />);
    const button = screen.getByRole('button', { name: 'Publicar / PDF' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveTextContent('Salvando…');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(run).toHaveBeenCalledOnce();
    await act(async () => { finish({ ok: true, acknowledged: true }); });
    expect(onOpen).toHaveBeenCalledOnce();
    expect(button).toHaveTextContent('Publicar / PDF');
  });
});
