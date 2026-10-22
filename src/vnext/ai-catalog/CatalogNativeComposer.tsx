import React from 'react';
import type { DocumentSession } from '../application';
import { ProviderCredentialsSettings } from './ProviderCredentialsSettings';
import {
  ComposerRequestError, nativeComposeGateway, nativeTextEditGateway, readComposerReadiness,
  type ComposerReadiness, type NativeComposeFunctionsClient,
} from './native-compose-client';
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
import { composerErrorMessage, composerReadinessText } from './composer-messages';
import { clearByokCredential, setByokCredential, useByokCredential } from './byok-session';
import { VerifiedPdfTableReview } from './VerifiedPdfTableReview';
import type { NativePdfCellFillTarget } from './native-pdf-cell-fill';
import type { FitHeightMeasurement } from '../editor/table-fit-height-authoring';
import { SourceIntakeSection } from './intake/SourceIntakeSection';
import { dropIntoIntake, sourceIntakeSessionFor } from './intake/intake-store';
import { dragHasFiles } from './intake/SourceDropZone';

interface Props {
  session: DocumentSession;
  documentId: string;
  ownerScope?: string;
  client?: NativeComposeFunctionsClient;
  onBeforeMutation?: () => boolean;
  selected?: SelectedEditorialText;
  selectedTable?: NativePdfCellFillTarget;
  /** The editor's current measurement, so a long table from a file continues on the next pages (FR-35). */
  measurement?: FitHeightMeasurement | null;
  /** Page open in the editor (a table from a file goes there, or on a new page right after it). */
  activePageId?: string;
  /** Shows a table inserted from a file in the editor. */
  onShowTable?: (pageId: string, objectId: string) => void;
  /**
   * FR-03: the technical review with a hand-written JSON manifest is not on the father's screen. It stays for
   * development and the browser proofs only (the dev server), never in the published app.
   */
  technicalPdfReview?: boolean;
}
interface Pending {
  plan: NativeComposePlan;
  revision: number;
  documentId: string;
  requestSequence: number;
}

/** One free readiness check per client per minute; reopening the panel reuses it. */
const readinessCache = new WeakMap<NativeComposeFunctionsClient, { at: number; value: Promise<ComposerReadiness> }>();
function cachedReadiness(client: NativeComposeFunctionsClient): Promise<ComposerReadiness> {
  const hit = readinessCache.get(client);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const value = readComposerReadiness(client).catch((): ComposerReadiness => ({ kind: 'available' }));
  readinessCache.set(client, { at: Date.now(), value });
  return value;
}
/** PROVIDER_NOT_CONFIGURED where no personal key can be used: no mention of an "Avançado" that is not there. */
const SERVER_AI_NOT_CONFIGURED = 'A IA do servidor ainda não foi configurada. Fale com o administrador. Enquanto isso, continue editando à mão.';
const NOT_CHANGED = ' O catálogo não foi alterado.';
/** C-05: shown next to the switched-off "Enviar" once the daily limit is known. */
export const DAILY_LIMIT_SEND_EXPLANATION = 'O envio está desligado até amanhã, porque o limite diário de uso da IA foi atingido. '
  + 'O que você escreveu continua guardado nesta caixa.';

/** C-05: the server already said today's AI budget is used up (when the panel opened, or on the last request). */
function dailyLimitKnown(readiness: ComposerReadiness | undefined): boolean {
  if (readiness?.kind === 'blocked') return readiness.code === 'AGENT_DAILY_BUDGET_EXCEEDED';
  return readiness?.kind === 'ready' && readiness.remainingMicrousd !== null && readiness.callReserveMicrousd !== null
    && readiness.remainingMicrousd < readiness.callReserveMicrousd;
}
const clock = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export function CatalogNativeComposer({ session, documentId, ownerScope, client, onBeforeMutation, selected, selectedTable,
  measurement, activePageId, onShowTable, technicalPdfReview = import.meta.env.DEV }: Props) {
  const [message, setMessage] = React.useState('');
  const [turns, setTurns] = React.useState<WorkbenchEntry[]>(() =>
    readWorkbenchDialogue(localStorage, documentId, ownerScope));
  const turnsRef = React.useRef(turns);
  // The server key is the default. A personal key unlocked in "Avançado" lives
  // outside this panel (byok-session), so closing the panel does not lock it.
  const ownKey = useByokCredential(ownerScope);
  const requestSerial = React.useRef(0);
  const inFlightText = React.useRef('');
  const [busy, setBusy] = React.useState<false | 'compose' | 'rewrite'>(false);
  const [pending, setPending] = React.useState<Pending>();
  const [rewriteMode, setRewriteMode] = React.useState(false);
  const [pendingRewrite, setPendingRewrite] = React.useState<{ reply: NativeTextEditReply;
    target: SelectedEditorialText; revision: number; serial: number }>();
  const editableSelectedText = selected ? plainSelectedEditorialText(selected) : null;
  const [error, setError] = React.useState('');
  const [unsent, setUnsent] = React.useState<string>();
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [readiness, setReadiness] = React.useState<ComposerReadiness>();
  const [limitAnswered, setLimitAnswered] = React.useState(false);
  // A personal key does not use the server's daily budget.
  const dailyLimitReached = !ownKey && (limitAnswered || dailyLimitKnown(readiness));
  // Wait for readiness before offering a new key. Keep an unlocked key and the legacy available state usable.
  const ownKeyOffered = Boolean(client) && (Boolean(ownKey) || readiness?.kind === 'available' ||
    (readiness?.kind === 'ready' && readiness.byok));
  const ownKeyOfferedRef = React.useRef(ownKeyOffered);
  ownKeyOfferedRef.current = ownKeyOffered;
  const readinessText = !client ? 'A IA não está disponível nesta tela.'
    : !ownKey && !ownKeyOffered && readiness?.kind === 'ready' && !readiness.serverKey ? SERVER_AI_NOT_CONFIGURED
      : composerReadinessText(readiness, !!ownKey);
  const log = React.useRef<HTMLDivElement>(null);
  const proposalRef = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  // FR-64: the files of this catalog outlive the panel (closing it, "Ferramentas" or Esc keep them).
  const intake = React.useMemo(() => sourceIntakeSessionFor(documentId), [documentId]);
  /** Files let go anywhere on the assistant join the list; the browser never opens them in place of the editor. */
  const guardFileDrop = (event: React.DragEvent) => {
    if (event.defaultPrevented || !dragHasFiles(event)) return;
    event.preventDefault();
    const idle = intake.insertion.get().phase === 'idle';
    if (event.type === 'drop') dropIntoIntake(intake, Array.from(event.dataTransfer?.files ?? []));
    else if (event.dataTransfer) event.dataTransfer.dropEffect = idle ? 'copy' : 'none';
  };
  React.useEffect(() => { input.current?.focus(); }, []);
  // Selecting something else on the page only leaves rewrite mode. A paid
  // proposal or a request in flight is kept (it carries its own target).
  React.useEffect(() => { setRewriteMode(false); }, [selected?.objectId]);
  // Follow the conversation, but leave the first suggestions in view while there is none yet.
  React.useEffect(() => {
    if (turns.length === 0 && !unsent) return;
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [turns, unsent]);
  // D-07: a new proposal opens from its beginning (title and "Página 1"), not scrolled down to its buttons.
  // Declared after the effect above, so in the same update it runs last and wins.
  const proposalKey = pending ? `pages:${pending.requestSequence}` : pendingRewrite ? `rewrite:${pendingRewrite.serial}` : '';
  React.useEffect(() => {
    const scroller = log.current, proposal = proposalRef.current;
    if (!proposalKey || !scroller || !proposal) return;
    const offset = proposal.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo?.({ top: Math.max(0, scroller.scrollTop + offset - 8) });
  }, [proposalKey]);
  // Late answers after the panel closes are ignored and never stored.
  React.useEffect(() => () => { requestSerial.current++; }, []);
  React.useEffect(() => {
    if (!client) return;
    let alive = true;
    void cachedReadiness(client).then(value => { if (alive) setReadiness(value); });
    return () => { alive = false; };
  }, [client]);
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
      setError('Não foi possível guardar a conversa neste navegador. Exporte a conversa e tente novamente.');
      return false;
    }
  };
  /** A failed or cancelled message is never stored as sent: it returns to the text box. */
  const restoreUnsent = (text: string) => {
    setUnsent(text);
    setMessage(current => current || text);
  };
  const send = async () => {
    const text = message.trim();
    if (!text || text.length > 1200 || busy || dailyLimitReached || turnsRef.current.length > WORKBENCH_MESSAGE_LIMIT - 2) return;
    if (!client) {
      setError('A IA não está disponível nesta tela. Continue editando manualmente.');
      return;
    }
    // Never ask a provider to mutate. Only request a typed proposal; approval
    // will execute canonical document commands after a CAS revision check.
    const isRewriting = rewriteMode && !!selected;
    const target = selected;
    const snapshot = session.getSnapshot();
    const history: NativeComposeRequest['history'] = turnsRef.current.slice(-8).map(turn => ({
      role: turn.role, message: redactConversationMessage(turn.content).slice(0, 800),
    }));
    const sequence = ++requestSerial.current;
    inFlightText.current = text;
    // A proposal already received stays until the new answer arrives (or is rejected, or the catalog changes):
    // a failed or cancelled request never throws away what was already paid for.
    setBusy(isRewriting ? 'rewrite' : 'compose'); setError(''); setUnsent(undefined);
    setMessage('');
    try {
      const reply = isRewriting && target
        ? await proposeNativeTextEdit(target, text, nativeTextEditGateway(client, ownKey), history)
        : await requestNativeCompose(snapshot.document, text, nativeComposeGateway(client, ownKey), history);
      if (sequence !== requestSerial.current) return;
      if (session.getSnapshot().localSequence !== snapshot.localSequence ||
          session.getSnapshot().document.id !== snapshot.document.id) {
        restoreUnsent(text);
        setError('O catálogo mudou enquanto a IA respondia. Envie o pedido de novo para a versão atual.');
        return;
      }
      if (!saveTurn('user', text)) return;
      if (reply.status === 'clarification') {
        saveTurn('assistant', reply.question);
      } else if ('revisedText' in reply) {
        if (!isRewriting || !target) throw new Error('TEXT_EDIT_CONTEXT_LOST');
        // One proposal on screen at a time: a rewrite replaces a page proposal, and the reverse.
        setPending(undefined);
        setPendingRewrite({ reply, target, revision: snapshot.localSequence, serial: sequence });
        saveTurn('assistant', 'Preparei uma reescrita do texto selecionado. Confira o antes e depois antes de aplicar.');
      } else {
        setPendingRewrite(undefined);
        setPending({ plan: reply, revision: snapshot.localSequence,
          documentId: snapshot.document.id, requestSequence: sequence });
        saveTurn('assistant', reply.summary +
          ' Revise a proposta de ' + reply.pages.length + ' página(s) antes de aplicar. Nenhum valor técnico será inventado.');
      }
    } catch (failure) {
      if (sequence === requestSerial.current) {
        restoreUnsent(text);
        if (failure instanceof ComposerRequestError && failure.code === 'AGENT_DAILY_BUDGET_EXCEEDED' && !ownKey) setLimitAnswered(true);
        setError(failure instanceof ComposerRequestError && failure.code === 'PROVIDER_NOT_CONFIGURED' && !ownKey &&
          !ownKeyOfferedRef.current ? SERVER_AI_NOT_CONFIGURED + NOT_CHANGED : composerErrorMessage(failure, { usingOwnKey: !!ownKey }));
      }
    } finally {
      if (sequence === requestSerial.current) setBusy(false);
    }
  };
  const cancel = () => {
    if (!busy) return;
    requestSerial.current++;
    setBusy(false);
    restoreUnsent(inFlightText.current);
    setError('');
  };
  const approve = () => {
    if (!pending || busy) return;
    if (session.getSnapshot().document.id !== pending.documentId ||
        session.getSnapshot().localSequence !== pending.revision) {
      setPending(undefined);
      setError('A proposta ficou desatualizada porque o catálogo mudou. Peça de novo à IA.');
      return;
    }
    if (onBeforeMutation && !onBeforeMutation()) {
      setError('Conclua ou cancele a edição aberta antes de aplicar páginas.');
      return;
    }
    try {
      const result = applyNativeCompose(session, pending.plan, pending.revision);
      saveTurn('assistant', 'Apliquei ' + result.pagesAdded + ' página(s) e ' +
        result.tablesAdded + ' tabela(s) editáveis no catálogo. Os campos técnicos ficam vazios; revise e depois salve.');
      setPending(undefined);
      setError('');
    } catch {
      setPending(undefined);
      setError('A aplicação foi bloqueada por conflito ou documento inválido. Confira o editor antes de tentar novamente.');
    }
  };
  const approveRewrite = () => {
    const proposal = pendingRewrite;
    if (!proposal || proposal.reply.status !== 'proposal' || busy) return;
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
  return <section className="ai-workbench-chat" aria-label="Assistente de criação do catálogo" data-has-error={Boolean(error)}
    onDragEnter={guardFileDrop} onDragOver={guardFileDrop} onDrop={guardFileDrop}>
    <div className="ai-chat-heading">
      <div><h3>Criar catálogo com Gemini</h3>
        <p>Solte arquivos ou descreva o que deseja. A IA propõe páginas A4 editáveis, que você confirma antes de inserir.</p>
        <p className="ai-readiness" data-ai-readiness={ownKey ? 'own-key' : readiness?.kind ?? (client ? 'checking' : 'none')}>
          {readinessText}</p></div>
      <span className="ai-chat-count" aria-label="Quantidade de mensagens">{turns.length}</span>
    </div>
    <SourceIntakeSection session={session} measurement={measurement} activePageId={activePageId}
      onBeforeMutation={onBeforeMutation} onShowTable={onShowTable} intake={intake} />
    <div className="ai-chat-log" ref={log} role="log" aria-label="Histórico de criação do catálogo" aria-live="polite">
      {editableSelectedText && <div className="ai-selection-context">
        <small>Texto selecionado na página:</small>
        <p>{editableSelectedText}</p>
        <button type="button" aria-pressed={rewriteMode} disabled={!!busy}
          onClick={() => { setRewriteMode(value => !value); setError(''); input.current?.focus(); }}>
          {rewriteMode ? 'Voltar a criar páginas' : 'Reescrever este texto com Gemini'}
        </button>
        {rewriteMode && <small>Ao enviar, este trecho vai para a IA propor uma revisão. Você confirma antes de alterar o catálogo.</small>}
      </div>}
      {turns.length === 0 && !unsent && <div className="ai-chat-welcome">
        <p>O que vamos criar?</p>
        <div className="ai-chat-suggestions">
          {['Crie uma capa e uma apresentação profissional para este catálogo.',
            'Comece uma comparação técnica com seções e tabelas para três modelos.',
            'Organize quatro novas páginas com capa, índice e tabelas de especificações.'].map(text =>
              <button key={text} type="button" onClick={() => { setMessage(text); input.current?.focus(); }}>{text}</button>)}
        </div>
        <small>A IA cria até 4 páginas por pedido. As tabelas chegam vazias: os números técnicos você preenche a partir das fontes.</small>
      </div>}
      {turns.map(turn => <article key={turn.id} className={'ai-chat-turn ai-chat-' + turn.role}>
        <strong>{turn.role === 'user' ? 'Você' : 'Assistente'}</strong>
        <p>{turn.content}</p>
        <small>{clock(turn.timestamp)}</small>
      </article>)}
      {unsent && <article className="ai-chat-turn ai-chat-user ai-chat-unsent" aria-label="Mensagem não enviada">
        <strong>Você · não enviado</strong>
        <p>{unsent}</p>
        <small>A mensagem voltou para a caixa de texto. Ajuste se quiser e envie de novo.</small>
      </article>}
      {busy && <p role="status">{busy === 'rewrite'
        ? 'Gemini está preparando uma reescrita do texto…'
        : 'Gemini está preparando uma proposta de páginas…'}</p>}
      {pendingRewrite?.reply.status === 'proposal' && <div className="ai-compose-proposal" ref={proposalRef}
        role="group" aria-label="Revisão de texto selecionado">
        <h4>Antes de alterar, confira</h4>
        <p><strong>Texto atual:</strong> {plainSelectedEditorialText(pendingRewrite.target)}</p>
        <p><strong>Nova proposta:</strong> {pendingRewrite.reply.revisedText}</p>
        <div className="ai-chat-actions">
          <button type="button" className="vnext-btn-primary" disabled={!!busy}
            onClick={approveRewrite}>Confirmar reescrita selecionada</button>
          <button type="button" onClick={() => setPendingRewrite(undefined)}>Rejeitar reescrita</button>
        </div>
      </div>}
      {pending && <div className="ai-compose-proposal" ref={proposalRef} role="group" aria-label="Proposta de páginas">
        <h4>Proposta para revisar</h4>
        <p>{pending.plan.summary}</p>
        <ul>{pending.plan.pages.map((page, i) => <li key={i}>
          <strong>Página {i + 1}: {page.heading}</strong>
          <span>{page.type === 'comparison'
            ? ' · ' + ({ comparison: 'Comparativo', datasheet: 'Ficha técnica', matrix: 'Matriz compacta' } as const)[page.table?.design ?? 'comparison'] + ': ' + page.table?.columns.length + ' colunas × ' + (page.table!.rowLabels.length + 1) + ' linhas, dados ainda vazios'
            : page.type === 'cover' ? ' · Capa' : ' · Conteúdo editorial'}</span>
        </li>)}</ul>
        <div className="ai-chat-actions">
          <button className="vnext-btn-primary" type="button" onClick={approve} disabled={!!busy}>Confirmar e inserir no catálogo</button>
          <button type="button" onClick={() => setPending(undefined)}>Rejeitar proposta</button>
        </div>
      </div>}
    </div>
    <div className="ai-chat-compose">
      <label htmlFor="gemini-catalog-command">{rewriteMode ? 'Como deseja reescrever o texto selecionado?' : 'Seu pedido ao Gemini'}</label>
      <textarea id="gemini-catalog-command" ref={input} value={message} maxLength={1200} rows={3}
        placeholder={rewriteMode ? 'Torne este título mais claro, conciso e profissional…'
          : 'Crie um catálogo técnico com capa, índice e tabelas comparativas…'}
        onChange={event => setMessage(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault(); void send();
        } }} />
      <div className="ai-chat-actions">
        <button className="vnext-btn-primary" type="button" onClick={() => { void send(); }}
          aria-describedby={dailyLimitReached ? 'gemini-send-blocked' : undefined}
          disabled={!message.trim() || !!busy || dailyLimitReached || turns.length > WORKBENCH_MESSAGE_LIMIT - 2}>
          {busy ? 'Preparando…' : rewriteMode ? 'Pedir reescrita ao Gemini' : 'Enviar ao Gemini'}
        </button>
        {busy && <button type="button" onClick={cancel}>Cancelar pedido</button>}
        {ownKeyOffered && <button type="button" onClick={() => setAdvancedOpen(value => !value)}
          aria-expanded={advancedOpen} aria-controls="catalog-gemini-settings">Avançado (chave própria)</button>}
        {ownKey && <button type="button" onClick={() => { clearByokCredential(); setError(''); }}>
          Voltar a usar a IA do servidor</button>}
      </div>
      {dailyLimitReached && <p id="gemini-send-blocked" className="ai-send-blocked" data-ai-send-blocked="">
        {DAILY_LIMIT_SEND_EXPLANATION}</p>}
      {advancedOpen && ownKeyOffered && <div id="catalog-gemini-settings" className="ai-compose-settings">
        <ProviderCredentialsSettings onlyProvider="gemini" initiallyUnlocked={ownKey ? ['gemini'] : []}
          onUnlock={(provider, key) => {
            if (provider !== 'gemini') {
              setError('Somente uma chave do Gemini funciona nesta tela.');
              return;
            }
            try {
              setByokCredential(key, ownerScope);
              setAdvancedOpen(false);
              setError('');
            } catch {
              setError('Essa chave não parece válida. Confira e tente de novo.');
            }
          }}
          onLock={() => clearByokCredential()}
        />
      </div>}
      {technicalPdfReview && selectedTable && <VerifiedPdfTableReview key={selectedTable.objectId}
        session={session} target={selectedTable} onBeforeMutation={onBeforeMutation}/>}
      {error && <p role="alert">{error}</p>}
      <p className="ai-boundary">A IA propõe a estrutura das páginas e você confere antes de inserir; ela não inventa valores técnicos.
        Os arquivos soltos acima são lidos aqui no computador e não vão para a IA.</p>
    </div>
  </section>;
}
