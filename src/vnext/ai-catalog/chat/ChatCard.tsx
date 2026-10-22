import React from 'react';

interface Props {
  /** Name of the card for screen readers ("Proposta de páginas"). */
  readonly label: string;
  readonly title: string;
  readonly children: React.ReactNode;
  /** The buttons at the bottom (Aplicar / Ajustar / Descartar). */
  readonly actions: React.ReactNode;
  readonly cardRef?: React.Ref<HTMLDivElement>;
}

/**
 * Something the assistant prepared and that waits for the person, shown inside the conversation: nothing in it changes
 * the catalog until its main button is used.
 */
export function ChatCard({ label, title, children, actions, cardRef }: Props) {
  return (
    <div className="ai-chat-msg ai-chat-assistant">
      <div className="ai-chat-card" ref={cardRef} role="group" aria-label={label}>
        <h4>{title}</h4>
        {children}
        <div className="ai-chat-card-actions">{actions}</div>
      </div>
    </div>
  );
}
