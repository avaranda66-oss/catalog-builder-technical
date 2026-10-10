import React from 'react';
import {
  PROVIDER_IDS, PROVIDER_CONFIG, encryptProviderCredential,
  saveEncryptedProviderCredential, loadEncryptedProviderCredential,
  deleteEncryptedProviderCredential, listEncryptedProviderCredentials,
  decryptProviderCredential, type ProviderId,
} from './provider-vault';

/**
 * BYOK device settings only. This component NEVER contacts a provider.
 * Keys are entered by the actual user and saved encrypted in IndexedDB.
 * Plaintext exists in memory only while editing or unlocking.
 */
export function ProviderCredentialsSettings({
  onUnlock,
  onLock,
}: {
  onUnlock?: (provider: ProviderId, key: string) => void;
  onLock?: (provider: ProviderId) => void;
}) {
  const [provider, setProvider] = React.useState<ProviderId>('gemini');
  const [key, setKey] = React.useState('');
  const [passphrase, setPassphrase] = React.useState('');
  const [unlockPassphrase, setUnlockPassphrase] = React.useState('');
  const [saved, setSaved] = React.useState<ProviderId[]>([]);
  const [unlocked, setUnlocked] = React.useState<ProviderId[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [error, setError] = React.useState('');
  const lockedRef = React.useRef(false);

  const reload = React.useCallback(async () => {
    const records = await listEncryptedProviderCredentials();
    if (!lockedRef.current) setSaved(records.map(entry => entry.provider));
  }, []);
  React.useEffect(() => {
    lockedRef.current = false;
    void reload().catch(() => { if (!lockedRef.current) setError('Armazenamento seguro indisponivel.'); });
    return () => { lockedRef.current = true; };
  }, [reload]);
  const changeProvider = (value: ProviderId) => {
    setProvider(value); setKey(''); setPassphrase(''); setUnlockPassphrase('');
    setStatus(''); setError('');
  };
  const save = async () => {
    setError(''); setStatus(''); setBusy(true);
    try {
      const encrypted = await encryptProviderCredential(provider, key, passphrase);
      await saveEncryptedProviderCredential(encrypted);
      setSaved(previous => [...new Set([...previous, provider])]);
      setUnlocked(previous => previous.filter(item => item !== provider));
      onLock?.(provider);
      setStatus('Credencial criptografada e salva neste navegador. Use Desbloquear para ativá-la nesta sessão.');
    } catch {
      setError('Não foi possível salvar. Informe uma chave e uma senha de proteção com pelo menos 12 caracteres. Verifique o armazenamento local.');
    } finally {
      setKey(''); setPassphrase(''); setBusy(false);
    }
  };
  const unlock = async () => {
    setBusy(true); setError(''); setStatus('');
    try {
      const entry = await loadEncryptedProviderCredential(provider);
      if (!entry) throw new Error('MISSING_RECORD');
      const plaintext = await decryptProviderCredential(entry, unlockPassphrase);
      onUnlock?.(provider, plaintext);
      setUnlocked(previous => [...new Set([...previous, provider])]);
      setStatus('Credencial desbloqueada nesta sessão. O agente real ainda depende da conexão segura com o provedor.');
    } catch {
      setError('Não foi possível desbloquear a credencial. Verifique a senha ou cadastre novamente a chave.');
    } finally {
      setUnlockPassphrase(''); setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      await deleteEncryptedProviderCredential(provider);
      setSaved(previous => previous.filter(item => item !== provider));
      setUnlocked(previous => previous.filter(item => item !== provider));
      onLock?.(provider);
      setStatus('Credencial removida deste navegador. Isso não revoga a chave no provedor.');
    } catch {
      setError('Não foi possível remover o registro. Tente novamente.');
    } finally { setBusy(false); }
  };
  return <section className="ai-card" aria-label="Configurações dos provedores de IA">
    <h3>Conectar um provedor de IA</h3>
    <p>Cadastre sua própria chave no dispositivo. Ela fica criptografada com uma senha sua e não é salva no catálogo ou enviada durante o cadastro.</p>
    <label htmlFor="vnext-provider">Provedor
      <select id="vnext-provider" value={provider} disabled={busy}
        onChange={event => changeProvider(event.target.value as ProviderId)}>
        {PROVIDER_IDS.map(id => <option key={id} value={id}>{PROVIDER_CONFIG[id].label}</option>)}
      </select>
    </label>
    <p role="status">Status: {unlocked.includes(provider) ? 'Desbloqueado nesta sessão' :
      saved.includes(provider) ? 'Salvo e bloqueado' : 'Sem chave cadastrada'}</p>
    <label htmlFor="vnext-provider-api-key">Chave API de {PROVIDER_CONFIG[provider].label}
      <input id="vnext-provider-api-key" aria-label="Chave API do provedor" type="password"
        autoComplete="off" spellCheck={false} disabled={busy} value={key}
        onChange={event => setKey(event.target.value)} />
    </label>
    <label htmlFor="vnext-provider-passphrase">Senha para criptografar a chave neste dispositivo
      <input id="vnext-provider-passphrase" aria-label="Senha de proteção do cofre" type="password"
        autoComplete="new-password" disabled={busy} value={passphrase}
        onChange={event => setPassphrase(event.target.value)} />
    </label>
    <button type="button" disabled={busy || !key || passphrase.length < 12}
      onClick={() => { void save(); }}>Salvar chave criptografada</button>
    {saved.includes(provider) && <div>
      <label htmlFor="vnext-provider-unlock">Senha para desbloquear
        <input id="vnext-provider-unlock" aria-label="Desbloquear cofre" type="password"
          autoComplete="off" disabled={busy} value={unlockPassphrase}
          onChange={event => setUnlockPassphrase(event.target.value)} />
      </label>
      <div className="ai-actions">
        <button type="button" disabled={busy || !unlockPassphrase} onClick={() => { void unlock(); }}>
          Desbloquear para esta sessão
        </button>
        <button type="button" disabled={busy} onClick={() => { void remove(); }}>Remover chave do dispositivo</button>
      </div>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    <p className="ai-boundary">O navegador não é um cofre de hardware: malware, extensões maliciosas ou código injetado podem acessar chaves enquanto estiverem desbloqueadas. Não compartilhe a senha de proteção. Perder essa senha exige recadastrar a chave.</p>
  </section>;
}
