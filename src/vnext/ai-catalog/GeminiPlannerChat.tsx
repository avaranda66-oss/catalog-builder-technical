import React from 'react';
import type { TechnicalInput } from './contracts';
import type { CatalogPlan } from './composition';
import { proposeCatalogPlan, type CatalogAgentGateway, type CatalogAgentReply } from './gemini-plan';

interface Props {
  input: TechnicalInput;
  gateway: CatalogAgentGateway;
  onApprove: (plan: CatalogPlan, message: string) => void;
}
interface Turn { id: number; role: 'user' | 'assistant'; message: string }

export function GeminiPlannerChat({ input, gateway, onApprove }: Props) {
  const [message, setMessage] = React.useState('Crie um catálogo profissional comparando estes modelos.');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [reply, setReply] = React.useState<CatalogAgentReply>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const count = React.useRef(0);
  const lastRequest = React.useRef('');
  const current = React.useRef(0);

  const send = async () => {
    if (busy || message.trim().length < 4) return;
    const serial = ++current.current;
    const submitted = message.trim();
    lastRequest.current = submitted;
    setTurns(prev => [...prev.slice(-7), { id: ++count.current, role: 'user', message: submitted }]);
    setReply(undefined); setBusy(true); setError('');
    try {
      const result = await proposeCatalogPlan(input, submitted, gateway);
      if (serial !== current.current) return;
      setReply(result);
      const answer = result.status === 'proposal'
        ? 'Preparei uma proposta de organização. Revise e confirme antes de criar páginas.'
        : result.question;
      setTurns(prev => [...prev.slice(-7), { id: ++count.current, role: 'assistant', message: answer }]);
    } catch {
      if (serial === current.current) setError('O Gemini não pôde preparar uma proposta segura. Nenhum catálogo foi modificado.');
    } finally {
      if (serial === current.current) setBusy(false);
    }
  };
  return <section className="ai-card" aria-label="Planejamento assistido por Gemini">
    <h3>Converse sobre a estrutura do catálogo</h3>
    <p>A IA propõe somente apresentação e ordem das seções. Valores técnicos não são enviados nesta etapa.</p>
    <div role="log" aria-label="Conversa sobre o catálogo" aria-live="polite">
      {turns.map(turn => <p key={turn.id}><strong>{turn.role === 'user' ? 'Você' : 'Assistente'}:</strong> {turn.message}</p>)}
    </div>
    <label>Seu pedido para o Gemini
      <textarea value={message} rows={3} maxLength={800} disabled={busy}
        onChange={event => { setMessage(event.target.value); setReply(undefined); }} />
    </label>
    <div className="ai-actions">
      <button type="button" disabled={busy || message.trim().length < 4} onClick={() => { void send(); }}>
        {busy ? 'Analisando pedido…' : 'Propor organização com Gemini'}
      </button>
      {reply?.status === 'proposal' &&
        <button type="button" className="vnext-btn-primary" disabled={busy}
          onClick={() => { onApprove(reply.plan, lastRequest.current); setReply(undefined); }}>
          Confirmar proposta e gerar catálogo
        </button>}
    </div>
    {reply?.status === 'proposal' && <p role="status">
      Estilo: {reply.plan.style === 'comparison' ? 'Comparação' : 'Especificação Técnica'}.
      Ordem: {reply.plan.sectionOrder.join(' → ')}. Nenhum dado foi alterado.
    </p>}
    {reply?.status === 'clarification' && <p role="status">Responda à pergunta antes de gerar.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
