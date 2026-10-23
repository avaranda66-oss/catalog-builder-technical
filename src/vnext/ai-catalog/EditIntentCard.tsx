import React from 'react';
import { ChatCard } from './chat/ChatCard';
import type { EditPlan } from './edit-intents';

interface Props {
  readonly plan: EditPlan;
  readonly busy?: boolean;
  readonly onApply: () => void;
  /** Puts a starting text in the message box so the person can say what to change. */
  readonly onAdjust: () => void;
  readonly onDiscard: () => void;
  readonly cardRef?: React.Ref<HTMLDivElement>;
}

/** Highlights the numbers the person must confirm inside a text. */
function withMarks(text: string, numbers: readonly string[] | undefined): React.ReactNode {
  if (!numbers?.length) return text;
  const pattern = new RegExp('(' + [...new Set(numbers)].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  return text.split(pattern).map((part, index) => numbers.includes(part) ? <mark key={index}>{part}</mark> : part);
}

/**
 * FR-72: "Vou fazer isto". What the AI understood, item by item, before anything
 * changes. Aplicar runs the whole list as ONE Desfazer; what was refused is
 * listed with the reason. Numbers that did not come from the text itself are
 * highlighted for the person to confirm.
 */
export function EditIntentCard({ plan, busy, onApply, onAdjust, onDiscard, cardRef }: Props) {
  const count = plan.items.length;
  return (
    <ChatCard label="Mudanças pedidas na conversa" title="Vou fazer isto" cardRef={cardRef}
      actions={<>
        <button type="button" className="vnext-btn-primary" disabled={busy || count === 0} onClick={onApply}>
          {count > 1 ? `Aplicar as ${count} mudanças` : 'Aplicar'}
        </button>
        <button type="button" onClick={onAdjust}>Ajustar</button>
        <button type="button" onClick={onDiscard}>Descartar</button>
      </>}>
      <p>{plan.summary}</p>
      {count > 0 && <ol className="ai-chat-edit-list">{plan.items.map((item, index) => <li key={index}>
        <strong>{item.title}</strong>{' · '}{item.target}
        {item.before !== undefined && item.after !== undefined && <span className="ai-chat-edit-diff">
          <span><small>Antes:</small> {item.before}</span>
          <span><small>Depois:</small> {withMarks(item.after, item.confirm)}</span>
        </span>}
        {item.confirm?.length ? <small role="note">Confira {item.confirm.length > 1 ? 'os números' : 'o número'}{' '}
          {item.confirm.map((n, i) => <React.Fragment key={i}>{i > 0 ? ', ' : ''}<mark>{n}</mark></React.Fragment>)}:
          {' '}{item.confirm.length > 1 ? 'vieram' : 'veio'} da conversa ou de outro texto, não de um documento conferido.</small> : null}
        {item.dropped?.length ? <small role="note">Sai do texto: {item.dropped.join(', ')}.</small> : null}
      </li>)}</ol>}
      {plan.blocked.length > 0 && <>
        <p><strong>{count === 0 ? 'Não vou mudar nada:' : 'Isto eu não vou fazer:'}</strong></p>
        <ul className="ai-chat-edit-blocked">{plan.blocked.map((item, index) => <li key={index}>
          {item.target}: {item.reason}
        </li>)}</ul>
      </>}
      {count > 0 && <small>Tudo entra como um passo só: um Desfazer volta ao que era.</small>}
    </ChatCard>
  );
}
