import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyAccountDialog } from '../../../src/vnext/app/MyAccountDialog';
import { setMyAiKeyState, type MyAiKeyClient } from '../../../src/vnext/ai-catalog/my-ai-key';

const KEY = 'TEST_FAKE_DIALOG_KEY_000000009876';
afterEach(() => setMyAiKeyState('unknown'));

describe('Minha conta → Minha chave de IA', () => {
  it('saves, tests and removes the key, and only ever shows the last 4 characters', async () => {
    let row: unknown[] = [];
    const rpc = vi.fn(async (name: string) => {
      if (name === 'vnext_ai_key_save_v1') row = [{ provider: 'gemini', key_last4: '9876', check_status: 'untested' }];
      if (name === 'vnext_ai_key_remove_v1') { row = []; return { data: true, error: null }; }
      return { data: row, error: null };
    });
    const invoke = vi.fn(async () => ({ data: { code: 'OK', test: { status: 'ok' } }, error: null }));
    render(<MyAccountDialog client={{ rpc, functions: { invoke } } as unknown as MyAiKeyClient} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByText('Nenhuma chave cadastrada.')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Cole aqui sua chave do Gemini/), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar chave' }));
    await waitFor(() => expect(screen.getByText('Gemini · termina em …9876 · ainda não testada')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    await waitFor(() => expect(screen.getByText('Gemini · termina em …9876 · funcionando')).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('vnext-catalog-composer', { body: { version: 1, task: 'test_user_key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('Nenhuma chave cadastrada.')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(KEY);
  });
});
