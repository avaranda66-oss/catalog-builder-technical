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
  onlyProvider,
  initiallyUnlocked = [],
}: {
  onUnlock?: (provider: ProviderId, key: string) => void;
  onLock?: (provider: ProviderId) => void;
  /** Hide the provider choice when only one adapter works on this screen. */
  onlyProvider?: ProviderId;
  /** Providers already unlocked elsewhere in this tab (the panel can be reopened). */
  initiallyUnlocked?: readonly ProviderId[];
}) {
  const [provider, setProvider] = React.useState<ProviderId>(onlyProvider ?? 'gemini');
  const [key, setKey] = React.useState('');
  const [passphrase, setPassphrase] = React.useState('');
  const [unlockPassphrase, setUnlockPassphrase] = React.useState('');
  const [saved, setSaved] = React.useState<ProviderId[]>([]);
  const [unlocked, setUnlocked] = React.useState<ProviderId[]>(() => [...initiallyUnlocked]);
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
    void reload().catch(() => { if (!lockedRef.current) setError('O armazenamento seguro deste navegador não está disponível.'); });
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
      setStatus('Chave guardada neste navegador, protegida pela sua senha. Para usá-la, clique em “Desbloquear para esta sessão”.');
    } catch {
      setError('Não foi possível guardar. Informe a chave e uma senha com pelo menos 12 caracteres, e confira se este navegador permite guardar dados.');
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
      setUnlocked([provider]);
      setStatus('Chave liberada nesta aba. Ela deixa de valer quando você fecha a página.');
    } catch {
      setError('Não foi possível desbloquear a chave. Confira a senha ou cadastre a chave de novo.');
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
      setStatus('Chave removida deste navegador. Ela continua válida no site do provedor até você cancelá-la lá.');
    } catch {
      setError('Não foi possível remover a chave. Tente de novo.');
    } finally { setBusy(false); }
  };
  return <section className="ai-card" aria-label="Configurações dos provedores de IA">
    <h3>Usar minha própria chave</h3>
    <p>Opcional. Sem isso, a IA usa a chave do servidor. A sua chave fica guardada neste computador, protegida por uma senha sua, e nunca vai para o catálogo.</p>
    {!onlyProvider && <label htmlFor="vnext-provider">Provedor
      <select id="vnext-provider" value={provider} disabled={busy}
        onChange={event => changeProvider(event.target.value as ProviderId)}>
        {PROVIDER_IDS.map(id => <option key={id} value={id}>{PROVIDER_CONFIG[id].label}</option>)}
      </select>
    </label>}
    <p role="status">Status: {unlocked.includes(provider) ? 'Desbloqueado nesta sessão' :
      saved.includes(provider) ? 'Salvo e bloqueado' : 'Sem chave cadastrada'}</p>
    <label htmlFor="vnext-provider-api-key">Sua chave do {PROVIDER_CONFIG[provider].label}
      <input id="vnext-provider-api-key" aria-label="Chave API do provedor" type="password"
        autoComplete="off" spellCheck={false} disabled={busy} value={key}
        onChange={event => setKey(event.target.value)} />
    </label>
    <label htmlFor="vnext-provider-passphrase">Crie uma senha para proteger a chave (mínimo 12 caracteres)
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
        {unlocked.includes(provider) && <button type="button" disabled={busy} onClick={() => {
          setUnlocked(previous => previous.filter(item => item !== provider));
          onLock?.(provider);
          setStatus('Chave bloqueada nesta aba. Ela continua guardada e protegida neste computador.');
        }}>Bloquear chave nesta sessão</button>}
        <button type="button" disabled={busy} onClick={() => { void remove(); }}>Remover chave do dispositivo</button>
      </div>
    </div>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    <p className="ai-boundary">Enquanto a chave estiver desbloqueada, programas maliciosos ou extensões do navegador podem lê-la. Não compartilhe a senha. Se esquecer a senha, cadastre a chave de novo.</p>
  </section>;
}
