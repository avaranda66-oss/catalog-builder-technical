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
/** Removes what usually comes along when copying: spaces, line breaks and quotes. */
export function cleanPastedKey(value: string): string {
  return value.replace(/[\s"'`“”‘’]/g, '');
}

export function MyAccountDialog({ client, onClose }: { client: MyAiKeyClient; onClose: () => void }) {
  const [status, setStatus] = React.useState<MyAiKeyStatus | null | undefined>(undefined);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState<'' | 'save' | 'test' | 'remove'>('');
  const [notice, setNotice] = React.useState<{ text: string; tone: 'ok' | 'fail' } | null>(null);
  const [showKey, setShowKey] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cleaned = cleanPastedKey(draft);
  const formatOk = isGeminiKeyFormat(cleaned);

  React.useEffect(() => {
    let alive = true;
    loadMyAiKeyStatus(client).then(value => { if (alive) setStatus(value); },
      () => { if (alive) { setStatus(null); setNotice({ text: 'Não foi possível ler sua chave agora. Tente de novo em instantes.', tone: 'fail' }); } });
    return () => { alive = false; };
  }, [client]);

  // Focus the field on open and give focus back to whatever opened the dialog (the "Minha conta" button).
  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => { opener?.focus(); };
  }, []);

  const run = async (kind: 'save' | 'test' | 'remove', work: () => Promise<void>) => {
    setBusy(kind); setNotice(null);
    try { await work(); } finally { setBusy(''); }
  };
  const ok = (text: string) => setNotice({ text, tone: 'ok' });
  const fail = (text: string) => setNotice({ text, tone: 'fail' });
  const save = () => run('save', async () => {
    try {
      const saved = await saveMyAiKey(client, cleaned);
      setDraft(''); setShowKey(false);
      setStatus(saved);
      ok('Chave salva. Clique em “Testar” para conferir se ela funciona.');
    } catch { fail('Não foi possível salvar essa chave. Confira se copiou a chave inteira do Google AI Studio.'); }
  });
  const test = () => run('test', async () => {
    const outcome = await testMyAiKey(client);
    if (outcome === 'missing') { setStatus(null); fail('Cadastre sua chave de IA antes de testar.'); return; }
    if (outcome === 'unavailable') { fail('Não foi possível falar com o Google agora. Tente de novo em instantes.'); return; }
    setStatus(value => value ? { ...value, check_status: outcome } : value);
    if (outcome === 'ok') ok('Sua chave está funcionando.'); else fail('O Google recusou essa chave. Confira ou troque a chave.');
  });
  const remove = () => run('remove', async () => {
    setConfirmRemove(false);
    try { await removeMyAiKey(client); setStatus(null); ok('Chave removida. Os botões de IA vão pedir uma nova chave.'); }
    catch { fail('Não foi possível remover a chave agora. Tente de novo.'); }
  });
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (confirmRemove) setConfirmRemove(false); else onClose();
  };

  return (
    <div className="vnext-library-dialog-backdrop">
      <section className="vnext-library-dialog" role="dialog" aria-modal="true" aria-labelledby="my-account-title" data-my-account=""
        onKeyDown={onKeyDown}>
        <button type="button" className="vnext-library-dialog-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button>
        <h2 id="my-account-title">Minha conta</h2>
        <h3>Minha chave de IA</h3>
        <p>As funções de IA usam somente a sua chave de IA (Gemini). Ela fica guardada com criptografia no servidor e ninguém mais consegue vê-la, nem o administrador.</p>
        <p data-my-ai-key-help="">Ainda não tem a chave? Abra{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>,
          entre com sua conta Google, clique em “Criar chave de API”, copie o código e cole abaixo.</p>
        <p data-my-ai-key-status="" role="status">{status === undefined ? 'Verificando…' : userKeyStatusLine(status)}</p>
        <label>{status ? 'Trocar por uma nova chave' : 'Cole aqui sua chave do Gemini'}
          <input ref={inputRef} type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={draft} maxLength={300}
            onChange={event => setDraft(event.target.value)} placeholder="Cole aqui o código copiado do Google"
            aria-invalid={draft !== '' && !formatOk} aria-describedby="my-ai-key-format" />
        </label>
        <button type="button" aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>
          {showKey ? 'Esconder chave' : 'Mostrar chave'}</button>
        <p id="my-ai-key-format" data-my-ai-key-format="">
          {draft === '' ? '' : formatOk ? `Código colado termina em ${cleaned.slice(-4)}.`
            : 'Esse código não parece uma chave do Gemini. Copie de novo, inteiro, sem espaços nem aspas.'}</p>
        {busy === 'test' && <p role="status">Testando sua chave, aguarde alguns segundos…</p>}
        {notice && <p role={notice.tone === 'fail' ? 'alert' : 'status'}>{notice.text}</p>}
        {confirmRemove ? (
          <div className="vnext-library-dialog-actions" role="group" aria-label="Confirmar remoção">
            <p>Remover sua chave de IA? Os recursos de IA deixam de funcionar até você cadastrar outra chave.</p>
            <button type="button" className="is-danger" onClick={() => { void remove(); }} disabled={busy !== ''}>Remover</button>
            <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy !== ''}>Cancelar</button>
          </div>
        ) : (
          <div className="vnext-library-dialog-actions">
            {status && <button type="button" className="is-danger" onClick={() => setConfirmRemove(true)} disabled={busy !== ''}>Remover chave</button>}
            {status && <button type="button" onClick={() => { void test(); }} disabled={busy !== ''}>{busy === 'test' ? 'Testando…' : 'Testar'}</button>}
            <button type="button" className="is-primary" onClick={() => { void save(); }}
              disabled={busy !== '' || !formatOk}>{status ? 'Trocar chave' : 'Salvar chave'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
