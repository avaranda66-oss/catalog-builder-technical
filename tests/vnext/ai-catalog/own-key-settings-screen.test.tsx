import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderCredentialsSettings } from '../../../src/vnext/ai-catalog/ProviderCredentialsSettings';

// The device vault (IndexedDB + WebCrypto) is covered by provider-vault.test.ts
// and the Chromium BYOK proof; here only the "Avançado (chave própria)" screen.
vi.mock('../../../src/vnext/ai-catalog/provider-vault', async original => ({
  ...(await original<typeof import('../../../src/vnext/ai-catalog/provider-vault')>()),
  listEncryptedProviderCredentials: vi.fn(async () => [{ provider: 'gemini' }]),
}));
afterEach(cleanup);

describe('own key screen (advanced, optional)', () => {
  it('explains that the server key is the default and hides the provider choice when only Gemini works', async () => {
    render(<ProviderCredentialsSettings onlyProvider="gemini" />);
    expect(screen.getByRole('heading', { name: 'Usar minha própria chave' })).toBeInTheDocument();
    expect(screen.getByText(/Sem isso, a IA usa a chave do servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Provedor' })).not.toBeInTheDocument();
    expect(screen.getByText('Sua chave do Google Gemini')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Status: Salvo e bloqueado')).toBeInTheDocument());
    expect(screen.queryByText(/cofre de hardware|credencial|API/i)).not.toBeInTheDocument();
  });

  it('shows a key unlocked earlier in this tab as unlocked when the panel is reopened', async () => {
    render(<ProviderCredentialsSettings onlyProvider="gemini" initiallyUnlocked={['gemini']} />);
    await waitFor(() => expect(screen.getByText('Status: Desbloqueado nesta sessão')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Bloquear chave nesta sessão' })).toBeInTheDocument();
  });

  it('still offers the provider choice where several providers are configured', () => {
    render(<ProviderCredentialsSettings />);
    expect(screen.getByRole('combobox', { name: 'Provedor' })).toBeInTheDocument();
  });
});
