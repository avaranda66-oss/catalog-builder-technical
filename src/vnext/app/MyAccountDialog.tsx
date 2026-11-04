import React from 'react';
import { X } from 'lucide-react';
import {
  loadMyAiKeyStatus, removeMyAiKey, saveMyAiKey, testMyAiKey, type MyAiKeyClient, type MyAiKeyStatus,
} from '../ai-catalog/my-ai-key';
import { isGeminiKeyFormat, userKeyStatusLine } from '../ai-catalog/user-ai-key';

/**
 * Minha conta → Minha chave de IA. The key typed here goes once to the server
 * (encrypted in Vault) and is never shown again: only "termina em …1234".
 */
export function MyAccountDialog({ client, onClose }: { client: MyAiKeyClient; onClose: () => void }) {
  const [status, setStatus] = React.useState<MyAiKeyStatus | null | undefined>(undefined);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    loadMyAiKeyStatus(client).then(value => { if (alive) setStatus(value); },
      () => { if (alive) { setStatus(null); setNotice('Não foi possível ler sua chave agora. Tente de novo em instantes.'); } });
    return () => { alive = false; };
  }, [client]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setNotice('');
    try { await work(); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    try {
      const saved = await saveMyAiKey(client, draft);
      setDraft('');
      setStatus(saved);
      setNotice('Chave salva. Clique em “Testar” para conferir se ela funciona.');
    } catch { setNotice('Não foi possível salvar essa chave. Confira se copiou a chave inteira do Google AI Studio.'); }
  });
  const test = () => run(async () => {
    const outcome = await testMyAiKey(client);
    if (outcome === 'missing') { setStatus(null); setNotice('Cadastre sua chave de IA antes de testar.'); return; }
    if (outcome === 'unavailable') { setNotice('Não foi possível falar com o Google agora. Tente de novo em instantes.'); return; }
    setStatus(value => value ? { ...value, check_status: outcome } : value);
    setNotice(outcome === 'ok' ? 'Sua chave está funcionando.' : 'O Google recusou essa chave. Confira ou troque a chave.');
  });
  const remove = () => run(async () => {
    try { await removeMyAiKey(client); setStatus(null); setNotice('Chave removida. Os botões de IA vão pedir uma nova chave.'); }
    catch { setNotice('Não foi possível remover a chave agora. Tente de novo.'); }
  });

  return (
    <div className="vnext-library-dialog-backdrop">
      <section className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="my-account-title" data-my-account="">
        <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button>
        <h2 id="my-account-title">Minha conta</h2>
        <h3>Minha chave de IA</h3>
        <p>As funções de IA usam somente a sua chave do Gemini. Ela fica guardada com criptografia no servidor e ninguém mais consegue vê-la, nem o administrador.</p>
        <p data-my-ai-key-status="" role="status">{status === undefined ? 'Verificando…' : userKeyStatusLine(status)}</p>
        <label>{status ? 'Trocar por uma nova chave' : 'Cole aqui sua chave do Gemini'}
          <input type="password" autoComplete="off" spellCheck={false} value={draft} maxLength={256}
            onChange={event => setDraft(event.target.value)} placeholder="Chave do Google AI Studio" />
        </label>
        {notice && <p role="alert">{notice}</p>}
        <div className="vnext-library-dialog-actions">
          {status && <button type="button" className="is-danger" onClick={() => { void remove(); }} disabled={busy}>Remover</button>}
          {status && <button type="button" onClick={() => { void test(); }} disabled={busy}>{busy ? 'Aguarde…' : 'Testar'}</button>}
          <button type="button" className="is-primary" onClick={() => { void save(); }}
            disabled={busy || !isGeminiKeyFormat(draft.trim())}>{status ? 'Trocar chave' : 'Salvar chave'}</button>
        </div>
      </section>
    </div>
  );
}
