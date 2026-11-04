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
    await waitFor(() => expect(screen.getByText('Nenhuma chave de IA (Gemini) cadastrada.')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Cole aqui sua chave do Gemini/), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar chave' }));
    await waitFor(() => expect(screen.getByText('Chave de IA (Gemini) cadastrada, termina em 9876. Ainda não testada. Clique em “Testar”.')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }));
    await waitFor(() => expect(screen.getByText('Chave de IA (Gemini) cadastrada, termina em 9876. Funcionando.')).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('vnext-catalog-composer', { body: { version: 1, task: 'test_user_key' } });
    expect(screen.getByText('Sua chave está funcionando.')).toHaveAttribute('role', 'status');
    // Removing asks first; "Cancelar" keeps the key.
    fireEvent.click(screen.getByRole('button', { name: 'Remover chave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(rpc).not.toHaveBeenCalledWith('vnext_ai_key_remove_v1');
    fireEvent.click(screen.getByRole('button', { name: 'Remover chave' }));
    expect(screen.getByText(/Os recursos de IA deixam de funcionar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('Nenhuma chave de IA (Gemini) cadastrada.')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('explains how to get a key, why Save is off, lets the person see the key, and closes with Esc', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener); opener.focus();
    const view = render(<MyAccountDialog client={{ rpc, functions: { invoke: vi.fn() } } as unknown as MyAiKeyClient} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Nenhuma chave de IA (Gemini) cadastrada.')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'aistudio.google.com/apikey' })).toHaveAttribute('target', '_blank');
    const input = screen.getByLabelText(/Cole aqui sua chave do Gemini/);
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'isso não é chave' } });
    expect(screen.getByText(/não parece uma chave do Gemini/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar chave' })).toBeDisabled();
    // Quotes and spaces that come along with the copy are removed.
    fireEvent.change(input, { target: { value: ` "${KEY}" ` } });
    expect(screen.getByText('Código colado termina em 9876.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar chave' })).toBeEnabled();
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar chave' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
