import React from 'react';
import type { DocumentSession } from '../application';
import { ProviderCredentialsSettings } from './ProviderCredentialsSettings';
import { nativeComposeGateway, nativeTextEditGateway, type NativeComposeFunctionsClient } from './native-compose-client';
import { applyNativeTextEdit, plainSelectedEditorialText, proposeNativeTextEdit,
  type NativeTextEditReply, type SelectedEditorialText } from './native-text-edit';
import {
  applyNativeCompose, requestNativeCompose,
  type NativeComposePlan, type NativeComposeRequest,
} from './native-compose';
import {
  WORKBENCH_MESSAGE_LIMIT, appendWorkbenchDialogue, readWorkbenchDialogue,
  type WorkbenchEntry,
} from './workbench-dialogue';
import { redactConversationMessage } from './conversation-evidence';
import { VerifiedPdfTableReview } from './VerifiedPdfTableReview';
import type { NativePdfCellFillTarget } from './native-pdf-cell-fill';

interface Props {
  session: DocumentSession;
  documentId: string;
  ownerScope?: string;
  client?: NativeComposeFunctionsClient;
  onBeforeMutation?: () => boolean;
  selected?: SelectedEditorialText;
  selectedTable?: NativePdfCellFillTarget;
}
interface Pending {
  plan: NativeComposePlan;
  revision: number;
  documentId: string;
  requestSequence: number;
}

export function CatalogNativeComposer({ session, documentId, ownerScope, client, onBeforeMutation, selected, selectedTable }: Props) {
  const [message, setMessage] = React.useState('');
  const [turns, setTurns] = React.useState<WorkbenchEntry[]>(() =>
    readWorkbenchDialogue(localStorage, documentId, ownerScope));
  const turnsRef = React.useRef(turns);
  const [unlocked, setUnlocked] = React.useState(false);
  const credential = React.useRef<string>();
  const requestSerial = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<Pending>();
  const [rewriteMode, setRewriteMode] = React.useState(false);
  const [pendingRewrite, setPendingRewrite] = React.useState<{ reply: NativeTextEditReply;
    target: SelectedEditorialText; revision: number; serial: number }>();
  const editableSelectedText = selected ? plainSelectedEditorialText(selected) : null;
  const [error, setError] = React.useState('');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const log = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  // Busy belongs to the current request. Revoking an older response must
  // also release the controls; its eventual completion cannot release a newer one.
  const invalidateRequest = React.useCallback(() => {
    requestSerial.current++;
    setBusy(false);
    setPending(undefined);
    setPendingRewrite(undefined);
  }, []);
  React.useEffect(() => { input.current?.focus(); }, []);
  React.useEffect(() => { invalidateRequest();
    setRewriteMode(false); }, [selected?.objectId, invalidateRequest]);
  React.useEffect(() => { log.current?.scrollTo?.({ top: log.current.scrollHeight }); }, [turns]);
  React.useEffect(() => () => {
    requestSerial.current++;
    credential.current = undefined;
  }, []);
  const saveTurn = (role: WorkbenchEntry['role'], content: string) => {
    try {
      const record: WorkbenchEntry = {
        id: crypto.randomUUID(), role, content: redactConversationMessage(content),
        timestamp: new Date().toISOString(),
        revision: session.getSnapshot().localSequence,
      };
      const next = appendWorkbenchDialogue(
        localStorage, documentId, turnsRef.current, record, ownerScope);
      turnsRef.current = next;
      setTurns(next);
      return true;
    } catch {
      setError('Não foi possível proteger o histórico local. Exporte a conversa e tente novamente.');
      return false;
    }
  };
  const send = async () => {
    const text = message.trim();
    if (!text || text.length > 1200 || busy || turnsRef.current.length > WORKBENCH_MESSAGE_LIMIT - 2) return;
    // Never ask a provider to mutate. Only request a typed proposal; approval
    // will execute canonical document commands after a CAS revision check.
    if (!client || !unlocked || !credential.current) {
      setSettingsOpen(true);
      setError('Primeiro conecte e desbloqueie sua chave Gemini neste dispositivo.');
      return;
    }
    const snapshot = session.getSnapshot();
    const history: NativeComposeRequest['history'] = turnsRef.current.slice(-8).map(turn => ({
      role: turn.role, message: redactConversationMessage(turn.content).slice(0, 800),
    }));
    const sequence = ++requestSerial.current;
    setBusy(true); setError(''); setPending(undefined); setPendingRewrite(undefined);
    setMessage('');
    if (!saveTurn('user', text)) { setBusy(false); return; }
    try {
      const isRewriting = rewriteMode && !!selected;
      const reply = isRewriting
        ? await proposeNativeTextEdit(selected, text,
          nativeTextEditGateway(client, credential.current), history)
        : await requestNativeCompose(snapshot.document, text,
          nativeComposeGateway(client, credential.current), history);
      if (sequence !== requestSerial.current) return;
      if (session.getSnapshot().localSequence !== snapshot.localSequence ||
          session.getSnapshot().document.id !== snapshot.document.id) {
        setError('O catálogo mudou durante a análise. Peça outra proposta para a versão atual.');
        return;
      }
      if (reply.status === 'clarification') {
        saveTurn('assistant', reply.question);
      } else if ('revisedText' in reply) {
        if (!isRewriting || !selected) throw new Error('TEXT_EDIT_CONTEXT_LOST');
        setPendingRewrite({ reply, target: selected, revision: snapshot.localSequence, serial: sequence });
        saveTurn('assistant', 'Preparei uma reescrita do texto selecionado. Confira o antes e depois antes de aplicar.');
      } else {
        setPending({ plan: reply, revision: snapshot.localSequence,
          documentId: snapshot.document.id, requestSequence: sequence });
        saveTurn('assistant', reply.summary +
          ' Revise a proposta de ' + reply.pages.length + ' página(s) antes de aplicar. Nenhum valor técnico será inventado.');
      }
    } catch {
      if (sequence === requestSerial.current) {
        setError('Não foi possível consultar o Gemini com segurança. Verifique a conexão, a autorização e o limite de uso. O catálogo não foi alterado.');
      }
    } finally {
      if (sequence === requestSerial.current) setBusy(false);
    }
  };
  const approve = () => {
    if (!pending || busy || requestSerial.current !== pending.requestSequence) return;
    if (session.getSnapshot().document.id !== pending.documentId ||
        session.getSnapshot().localSequence !== pending.revision) {
      setPending(undefined);
      setError('A proposta ficou desatualizada. Converse novamente com o Gemini.');
      return;
    }
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição aberta antes de aplicar páginas.');
      return;
    }
    try {
      const result = applyNativeCompose(session, pending.plan, pending.revision);
      saveTurn('assistant', 'Apliquei ' + result.pagesAdded + ' página(s) e ' +
        result.tablesAdded + ' tabela(s) editáveis no documento. Campos técnicos permanecem vazios; revise, depois salve.');
      setPending(undefined);
      setError('');
    } catch {
      setPending(undefined);
      setError('A aplicação foi bloqueada por conflito ou documento inválido. Confira o editor antes de tentar novamente.');
    }
  };
  const approveRewrite = () => {
    const proposal = pendingRewrite;
    if (!proposal || proposal.reply.status !== 'proposal' ||
        proposal.serial !== requestSerial.current || busy) return;
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição de texto em andamento antes de aprovar a reescrita.');
      return;
    }
    try {
      const result = applyNativeTextEdit(session, proposal.target,
        proposal.reply, proposal.revision);
      saveTurn('assistant', 'Reescrevi o texto editorial selecionado no documento. ' +
        'Você pode desfazer esta alteração e deve salvar depois de revisar.');
      setPendingRewrite(undefined);
      setError('');
      setRewriteMode(false);
      // Preserve no raw model-generated content in browser console.
      void result.newRevision;
    } catch {
      setPendingRewrite(undefined);
      setError('O texto mudou ou não era seguro alterar. Nenhuma reescrita foi aprovada.');
    }
  };
  return <section className="ai-workbench-chat" aria-label="Chat de criação com Gemini">
    <div className="ai-chat-heading">
      <div><h3>Criar catálogo com Gemini</h3>
        <p>Descreva o que deseja. O assistente propõe páginas A4 editáveis, que você confirma antes de inserir.</p></div>
      <span className="ai-chat-count" aria-label="Quantidade de mensagens">{turns.length}</span>
    </div>
    <div className="ai-chat-log" ref={log} role="log" aria-label="Histórico de criação do catálogo" aria-live="polite">
      {editableSelectedText && <div className="ai-selection-context">
        <small>Texto selecionado na página:</small>
        <p>{editableSelectedText}</p>
        <button type="button" aria-pressed={rewriteMode}
          onClick={() => { invalidateRequest();
            setRewriteMode(value => !value); setError(''); input.current?.focus(); }}>
          {rewriteMode ? 'Voltar a criar páginas' : 'Reescrever este texto com Gemini'}
        </button>
        {rewriteMode && <small>Ao enviar, este trecho será transmitido ao provedor para propor uma revisão. Você confirma antes de alterar o catálogo.</small>}
      </div>}
      {turns.length === 0 && <div className="ai-chat-welcome">
        <p>O que vamos criar?</p>
        <div className="ai-chat-suggestions">
          {['Crie uma capa e uma apresentação profissional para este catálogo.',
            'Comece uma comparação técnica com seções e tabelas para três modelos.',
            'Organize quatro novas páginas com capa, índice e tabelas de especificações.'].map(text =>
              <button key={text} type="button" onClick={() => { setMessage(text); input.current?.focus(); }}>{text}</button>)}
        </div>
        <small>A criação é incremental. Os números técnicos só serão preenchidos após conferência das fontes.</small>
      </div>}
      {turns.map(turn => <article key={turn.id} className={'ai-chat-turn ai-chat-' + turn.role}>
        <strong>{turn.role === 'user' ? 'Você' : 'Gemini / Assistente'}</strong>
        <p>{turn.content}</p>
        <small>Revisão {turn.revision}</small>
      </article>)}
      {busy && <p role="status">Gemini está preparando uma proposta de páginas…</p>}
      {pendingRewrite?.reply.status === 'proposal' && <div className="ai-compose-proposal"
        role="group" aria-label="Revisão de texto selecionado">
        <h4>Antes de alterar, confira</h4>
        <p><strong>Texto atual:</strong> {plainSelectedEditorialText(pendingRewrite.target)}</p>
        <p><strong>Nova proposta:</strong> {pendingRewrite.reply.revisedText}</p>
        <div className="ai-chat-actions">
          <button type="button" className="vnext-btn-primary"
            onClick={approveRewrite}>Confirmar reescrita selecionada</button>
          <button type="button" onClick={invalidateRequest}>Rejeitar reescrita</button>
        </div>
      </div>}
      {pending && <div className="ai-compose-proposal" role="group" aria-label="Proposta de páginas">
        <h4>Proposta para revisar</h4>
        <p>{pending.plan.summary}</p>
        <ul>{pending.plan.pages.map((page, i) => <li key={i}>
          <strong>Página {i + 1}: {page.heading}</strong>
          <span>{page.type === 'comparison'
            ? ' · ' + ({ comparison: 'Comparativo', datasheet: 'Ficha técnica', matrix: 'Matriz compacta' } as const)[page.table?.design ?? 'comparison'] + ': ' + page.table?.columns.length + ' colunas × ' + (page.table!.rowLabels.length + 1) + ' linhas, dados ainda vazios'
            : page.type === 'cover' ? ' · Capa' : ' · Conteúdo editorial'}</span>
        </li>)}</ul>
        <div className="ai-chat-actions">
          <button className="vnext-btn-primary" type="button" onClick={approve}>Confirmar e inserir no catálogo</button>
          <button type="button" onClick={invalidateRequest}>Rejeitar proposta</button>
        </div>
      </div>}
    </div>
    <div className="ai-chat-compose">
      <label htmlFor="gemini-catalog-command">{rewriteMode ? 'Como deseja reescrever o texto selecionado?' : 'Seu pedido ao Gemini'}</label>
      <textarea id="gemini-catalog-command" ref={input} value={message} maxLength={1200} rows={3}
        placeholder={rewriteMode ? 'Torne este título mais claro, conciso e profissional…'
          : 'Crie um catálogo técnico com capa, índice e tabelas comparativas…'}
        onChange={event => { setMessage(event.target.value); invalidateRequest(); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault(); void send();
        } }} />
      <div className="ai-chat-actions">
        <button className="vnext-btn-primary" type="button" onClick={() => { void send(); }}
          disabled={!message.trim() || busy || turns.length > WORKBENCH_MESSAGE_LIMIT - 2}>
          {busy ? 'Preparando…' : rewriteMode ? 'Pedir reescrita ao Gemini ↗' : 'Enviar ao Gemini ↗'}
        </button>
        <button type="button" onClick={() => setSettingsOpen(v => !v)}
          aria-expanded={settingsOpen} aria-controls="catalog-gemini-settings">
          {unlocked ? 'Chave desbloqueada' : 'Conectar Gemini'}
        </button>
      </div>
      {settingsOpen && <div id="catalog-gemini-settings" className="ai-compose-settings">
        <ProviderCredentialsSettings
          onUnlock={(provider, key) => {
            if (provider === 'gemini') { credential.current = key; setUnlocked(true); setSettingsOpen(false); setError(''); }
            else { credential.current = undefined; setUnlocked(false);
              setError('Somente Gemini tem adaptador de composição habilitável nesta etapa.'); }
            invalidateRequest();
          }}
          onLock={() => { credential.current = undefined; setUnlocked(false);
            invalidateRequest(); }}
        />
      </div>}
      {selectedTable && <VerifiedPdfTableReview key={selectedTable.objectId}
        session={session} target={selectedTable} onBeforeMutation={onBeforeMutation}/>}
      {error && <p role="alert">{error}</p>}
      <p className="ai-boundary">Gemini propõe estruturas para o motor do catálogo; você aprova antes de inserir.
        O serviço depende de ativação segura do gateway e limite de gastos. Não interpreta PDFs,
        não remove fundos e não cria especificações técnicas sem conferência.</p>
    </div>
  </section>;
}
