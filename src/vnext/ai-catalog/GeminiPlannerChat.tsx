import React from 'react';
import type { TechnicalInput } from './contracts';
import type { CatalogPlan } from './composition';
import type { ConversationTurn } from './conversation-evidence';
import { proposeCatalogPlan, type CatalogAgentGateway, type CatalogAgentReply, type CatalogConversationTurn } from './gemini-plan';
import { redactConversationMessage } from './conversation-evidence';

interface Props {
  input: TechnicalInput;
  gateway: CatalogAgentGateway;
  onApprove: (plan: CatalogPlan, message: string) => void;
  onTranscript?: (turns: readonly ConversationTurn[]) => void;
}
interface Turn extends ConversationTurn { id: number }

export function GeminiPlannerChat({ input, gateway, onApprove, onTranscript }: Props) {
  const [message, setMessage] = React.useState('Crie um catálogo profissional comparando estes modelos.');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const turnsRef = React.useRef<Turn[]>([]);
  const transcriptCallback = React.useRef(onTranscript);
  transcriptCallback.current = onTranscript;
  const [reply, setReply] = React.useState<CatalogAgentReply>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const count = React.useRef(0);
  const lastRequest = React.useRef('');
  const current = React.useRef(0);
  const responseContext = React.useRef<{ input: TechnicalInput; gateway: CatalogAgentGateway }>();
  const sourceRef = React.useRef(input);
  const recordTurn = (role: Turn['role'], message: string) => {
    const next = [...turnsRef.current, { id: ++count.current, role, message, recordedAt: new Date().toISOString() }];
    turnsRef.current = next;
    setTurns(next);
    onTranscript?.(next);
  };

  React.useEffect(() => {
    if (sourceRef.current !== input) {
      sourceRef.current = input;
      turnsRef.current = [];
      setTurns([]);
      transcriptCallback.current?.([]);
    }
    // A changed source or gateway revokes all outstanding responses and approvals.
    current.current++;
    responseContext.current = undefined;
    lastRequest.current = '';
    setReply(undefined);
    setBusy(false);
    setError('');
  }, [input, gateway]);

  const send = async () => {
    if (busy || message.trim().length < 4) return;
    const serial = ++current.current;
    const submitted = message.trim();
    lastRequest.current = submitted;
    // Send only bounded, sanitized conversational context from THIS input.
    // Never re-send the just-submitted message as part of history.
    const history: CatalogConversationTurn[] = turnsRef.current.slice(-8).map(turn => ({
      role: turn.role,
      message: redactConversationMessage(turn.message).slice(0, 800),
    }));
    recordTurn('user', submitted);
    setReply(undefined); setBusy(true); setError('');
    try {
      const result = await proposeCatalogPlan(input, submitted, gateway, history);
      if (serial !== current.current) return;
      responseContext.current = { input, gateway };
      setReply(result);
      const answer = result.status === 'proposal'
        ? 'Preparei uma proposta de organização. Revise e confirme antes de criar páginas.'
        : result.question;
      recordTurn('assistant', answer);
    } catch {
      if (serial === current.current) setError('O Gemini não pôde preparar uma proposta segura. Nenhum catálogo foi modificado.');
    } finally {
      if (serial === current.current) setBusy(false);
    }
  };
  const currentReply = responseContext.current?.input === input && responseContext.current?.gateway === gateway ? reply : undefined;
  return <section className="ai-card" aria-label="Planejamento assistido por Gemini">
    <h3>Converse sobre a estrutura do catálogo</h3>
    <p>A IA propõe somente apresentação e ordem das seções. Valores técnicos não são enviados nesta etapa.</p>
    <p role="status">Conversa desta sessão: {turns.length} mensagens registradas.</p>
    <div role="log" aria-label="Conversa sobre o catálogo" aria-live="polite">
      {turns.map(turn => <p key={turn.id}><strong>{turn.role === 'user' ? 'Você' : 'Assistente'}:</strong> {turn.message}</p>)}
    </div>
    <label>Seu pedido para o Gemini
      <textarea value={message} rows={3} maxLength={800} disabled={busy}
        onChange={event => {
          current.current++;
          responseContext.current = undefined;
          setBusy(false);
          setMessage(event.target.value);
          setReply(undefined);
        }} />
    </label>
    <div className="ai-actions">
      <button type="button" disabled={busy || message.trim().length < 4} onClick={() => { void send(); }}>
        {busy ? 'Analisando pedido…' : 'Propor organização com Gemini'}
      </button>
      {currentReply?.status === 'proposal' &&
        <button type="button" className="vnext-btn-primary" disabled={busy}
          onClick={() => {
            if (responseContext.current?.input !== input || responseContext.current?.gateway !== gateway) return;
            onApprove(currentReply.plan, lastRequest.current);
            setReply(undefined);
          }}>
          Confirmar proposta e gerar catálogo
        </button>}
    </div>
    {currentReply?.status === 'proposal' && <p role="status">
      Estilo: {currentReply.plan.style === 'comparison' ? 'Comparação' : 'Especificação Técnica'}.
      Ordem: {currentReply.plan.sectionOrder.join(' → ')}. Nenhum dado foi alterado.
    </p>}
    {currentReply?.status === 'clarification' && <p role="status">Responda à pergunta antes de gerar.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
