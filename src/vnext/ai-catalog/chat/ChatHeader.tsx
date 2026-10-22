import { ChatIcon } from './ChatIcons';
import { ChatMenu, type ChatMenuSection } from './ChatMenu';

interface Props {
  /** One short line under the title ("IA pronta.", "Verificando a IA…", or why the AI cannot answer). */
  readonly readiness: string;
  /** data-ai-readiness: own-key, checking, ready, available, blocked or none. */
  readonly readinessKind: string;
  readonly onNewConversation: () => void;
  /** "Nova conversa" does nothing while the open conversation is empty. */
  readonly newConversationDisabled: boolean;
  readonly history: readonly ChatMenuSection[];
  readonly settings: readonly ChatMenuSection[];
  /** The wider panel; without `onWideChange` there is no "Ampliar". */
  readonly wide?: boolean;
  readonly onWideChange?: (wide: boolean) => void;
  /** Closes the assistant panel; without it there is no "Fechar". */
  readonly onClose?: () => void;
}

/** "Assistente", the state of the AI on one small line, and the few controls of the panel. */
export function ChatHeader({
  readiness, readinessKind, onNewConversation, newConversationDisabled, history, settings, wide, onWideChange, onClose,
}: Props) {
  return (
    <header className="ai-chat-header">
      <div className="ai-chat-header-row">
        <h2 className="ai-chat-title">Assistente</h2>
        <div className="ai-chat-header-tools">
          <button type="button" className="ai-chat-tool ai-chat-tool-text" onClick={onNewConversation}
            disabled={newConversationDisabled} title={newConversationDisabled ? 'Esta conversa ainda está vazia' : 'Começar uma conversa nova'}>
            <ChatIcon name="plus" /><span>Nova conversa</span>
          </button>
          <ChatMenu label="Conversas anteriores" icon="history" menuLabel="Conversas deste catálogo" sections={history}
            emptyText="Ainda não há outras conversas neste catálogo." />
          {onWideChange && (
            <button type="button" className="ai-chat-tool" aria-pressed={Boolean(wide)}
              aria-label="Ampliar o painel" title={wide ? 'Voltar o painel ao tamanho normal' : 'Ampliar o painel'}
              onClick={() => onWideChange(!wide)}>
              <ChatIcon name={wide ? 'narrow' : 'widen'} />
            </button>
          )}
          <ChatMenu label="Opções do assistente" icon="gear" menuLabel="Opções do assistente" sections={settings} />
          {onClose && (
            <button type="button" className="ai-chat-tool" aria-label="Fechar painel do assistente" title="Fechar" onClick={onClose}>
              <ChatIcon name="close" />
            </button>
          )}
        </div>
      </div>
      <p className="ai-readiness" data-ai-readiness={readinessKind}>
        <span className="ai-readiness-dot" aria-hidden="true" />{readiness}
      </p>
    </header>
  );
}
