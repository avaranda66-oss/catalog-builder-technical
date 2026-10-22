import React from 'react';
import type { IntakeEntry } from '../intake/intake-model';
import { intakeStateLabel } from '../intake/intake-model';
import { ChatIcon } from './ChatIcons';

export interface ChatSendState {
  /** Name of the send button ("Enviar ao Gemini", "Pedir reescrita ao Gemini"). */
  readonly label: string;
  readonly disabled: boolean;
  /** Why sending is off, said next to the button (and read with it). */
  readonly blockedReason?: { readonly id: string; readonly text: string };
  /** Tooltip of the send button. */
  readonly hint?: string;
}

interface Props {
  readonly inputId: string;
  readonly inputRef: React.RefObject<HTMLTextAreaElement>;
  /** Name of the text box. */
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly send: ChatSendState;
  /** A request is being answered: the send button becomes "Cancelar pedido". */
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onAttach: () => void;
  readonly attachDisabled?: boolean;
  /** The catalog's files, as chips above the text box. */
  readonly files: readonly IntakeEntry[];
  readonly onRemoveFile: (id: string) => void;
  /** What the request is about (the text selected on the page), above the box. */
  readonly context?: React.ReactNode;
  /** One short line under the box. */
  readonly footnote: string;
}

const MAX_LINES = 6;

const CHIP_STATE: Readonly<Record<IntakeEntry['state'], string>> = {
  reading: 'Lendo…', ready: 'Pronto', 'needs-help': 'Precisa da sua ajuda', error: 'Não foi lido', duplicate: 'Repetido', skipped: 'Não foi lido',
};
const chipIcon = (kind: IntakeEntry['kind']) => (kind === 'photo' ? 'photo' : kind === 'spreadsheet' ? 'sheet' : 'file');

/** The text box fixed at the bottom of the assistant, like in the chat apps: it grows up to 6 lines. */
export function ChatComposerBox({
  inputId, inputRef, label, placeholder, value, maxLength, onChange, onSend, send, busy, onCancel, onAttach,
  attachDisabled, files, onRemoveFile, context, footnote,
}: Props) {
  React.useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box || typeof getComputedStyle !== 'function') return;
    box.style.height = 'auto';
    if (!box.scrollHeight) return;
    const style = getComputedStyle(box);
    const line = parseFloat(style.lineHeight) || 24;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const max = line * MAX_LINES + padding;
    box.style.height = `${Math.min(box.scrollHeight, max)}px`;
    box.style.overflowY = box.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, inputRef]);
  return (
    <div className="ai-chat-composer">
      {context}
      <div className="ai-chat-box">
        {files.length > 0 && (
          <ul className="ai-chat-files" aria-label="Arquivos enviados" aria-live="polite">
            {files.map((entry) => (
              <li key={entry.id} data-intake-state={entry.state} title={`${entry.fileName} · ${intakeStateLabel(entry)}`}>
                <ChatIcon name={chipIcon(entry.kind)} size={16} />
                <span className="ai-chat-file-name">{entry.fileName}</span>
                {/* One line per file: "Pronto" is only read aloud; the other states are short words in color. */}
                <span className={entry.state === 'ready' ? 'ai-chat-sr' : 'ai-chat-file-state'} data-intake-state={entry.state}>
                  {CHIP_STATE[entry.state]}
                </span>
                <button type="button" className="ai-chat-file-remove" aria-label={`Tirar ${entry.fileName} da lista`}
                  title="Tirar da lista" onClick={() => onRemoveFile(entry.id)}>
                  <ChatIcon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ai-chat-box-row">
          <button type="button" className="ai-chat-tool" aria-label="Anexar arquivos" title="Anexar PDFs, planilhas ou fotos"
            disabled={attachDisabled} onClick={onAttach}>
            <ChatIcon name="clip" />
          </button>
          <textarea id={inputId} ref={inputRef} rows={1} value={value} maxLength={maxLength} aria-label={label}
            placeholder={placeholder} title="Enter envia · Shift+Enter muda de linha"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onSend();
              }
            }} />
          {busy
            ? <button type="button" className="ai-chat-stop" onClick={onCancel}>Cancelar pedido</button>
            : (
              <button type="button" className="ai-chat-send" aria-label={send.label} title={send.hint ?? send.label}
                disabled={send.disabled} aria-describedby={send.blockedReason?.id} onClick={onSend}>
                <ChatIcon name="send" />
              </button>
            )}
        </div>
      </div>
      {send.blockedReason && (
        <p id={send.blockedReason.id} className="ai-send-blocked" data-ai-send-blocked="">{send.blockedReason.text}</p>
      )}
      <p className="ai-boundary">{footnote}</p>
    </div>
  );
}
