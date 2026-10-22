import React from 'react';
import type { SourceReadOptions } from '../source-intake';
import type { SourceTableChoice } from './source-table-insert';
import { ColumnChooser } from './ColumnChooser';
import { intakeBatchSummary, type IntakeBatch } from './intake-batches';
import { intakeStateLabel, tableBlocks, type IntakeEntry } from './intake-model';
import { SourceReviewPanel, sourceTableName } from './SourceReviewPanel';
import './intake.css';

interface Props {
  readonly batch: IntakeBatch;
  /** The files of this batch still in the list. */
  readonly entries: readonly IntakeEntry[];
  /** A table from a file is being inserted right now (every button that changes the catalog waits). */
  readonly working: boolean;
  /** "Inserir como tabela"; true when the table went in. */
  readonly onInsert: (choice: SourceTableChoice) => boolean;
  readonly onReread: (entryId: string, options: SourceReadOptions) => void;
  /** Called before "Escolher colunas" or a new reading, so an old message about a table does not linger. */
  readonly onBeforeChange?: () => void;
  /** After "Inserir como tabela": the conversation puts the keyboard on the message that follows. */
  readonly onInserted?: () => void;
  /** More actions for these files (for example a card that builds a table from a PDF). */
  readonly actions?: React.ReactNode;
}

/**
 * FR-64 in the conversation: ONE short message of the assistant per batch of files ("Li 3 arquivos: …"). The lists
 * (pages read and not read, sheets, warnings) stay behind "Ver detalhes", where the tables can go to the catalog
 * through "Escolher colunas" → "Inserir como tabela". Nothing here sends a file anywhere.
 */
export function IntakeBatchMessage({ batch, entries, working, onInsert, onReread, onBeforeChange, onInserted, actions }: Props) {
  const summary = intakeBatchSummary(entries);
  const [open, setOpen] = React.useState(false);
  const [choosing, setChoosing] = React.useState<{ entryId: string; blockId: string } | null>(null);
  const detailsId = React.useId();
  const root = React.useRef<HTMLElement>(null);
  const chosenEntry = choosing ? entries.find((entry) => entry.id === choosing.entryId) : undefined;
  const chosenBlock = choosing && chosenEntry?.state !== 'reading'
    ? tableBlocks(chosenEntry?.intake).find((block) => block.id === choosing.blockId) : undefined;
  // A file taken out of the list (or read again) closes its column choice.
  React.useEffect(() => {
    if (choosing && !chosenBlock) setChoosing(null);
  }, [choosing, chosenBlock]);
  // "Voltar" puts the keyboard back on the button that opened the choice.
  const lastChoice = React.useRef<string | null>(null);
  const inserted = React.useRef(false);
  React.useEffect(() => {
    if (chosenBlock) { lastChoice.current = chosenBlock.id; return; }
    const blockId = lastChoice.current;
    if (!blockId) return;
    lastChoice.current = null;
    if (inserted.current) { inserted.current = false; return; }
    root.current?.querySelector<HTMLElement>(`[data-choose-columns="${CSS.escape(blockId)}"]:not(:disabled)`)?.focus();
  }, [chosenBlock]);
  if (!entries.length) return null;
  const expanded = open || Boolean(chosenBlock);
  return (
    <article ref={root} className="ai-chat-msg ai-chat-assistant ai-chat-intake" data-intake-batch={batch.id}
      data-intake-reading={summary.reading ? 'true' : undefined} aria-label="Arquivos lidos">
      <div className="ai-chat-bubble">
        <p>{summary.text}</p>
        {!summary.reading && summary.tables > 0 && !expanded && (
          <p className="ai-chat-note">Em “Ver detalhes” você escolhe as colunas e coloca a tabela no catálogo.</p>
        )}
        <button type="button" className="ai-chat-link" aria-expanded={expanded} aria-controls={detailsId}
          disabled={Boolean(chosenBlock)} onClick={() => setOpen((value) => !value)}>
          {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
        {actions}
        <div id={detailsId} className="ai-intake ai-chat-intake-details" hidden={!expanded}
          data-choosing={chosenBlock ? 'true' : undefined}>
          {expanded && <>
            <ul className="ai-chat-intake-states">
              {entries.map((entry) => (
                <li key={entry.id} data-intake-state={entry.state}>
                  <strong>{entry.fileName}</strong>: {intakeStateLabel(entry)}
                  {(entry.state === 'duplicate' || entry.state === 'skipped') && entry.message && <small> {entry.message}</small>}
                </li>
              ))}
            </ul>
            {chosenBlock
              ? <ColumnChooser key={chosenBlock.id} block={chosenBlock} name={sourceTableName(chosenBlock)} busy={working}
                onCancel={() => setChoosing(null)}
                onInsert={(choice) => {
                  if (!onInsert(choice)) return;
                  inserted.current = true;
                  setChoosing(null);
                  setOpen(false);
                  onInserted?.();
                }} />
              : <SourceReviewPanel entries={entries} disabled={working}
                onChooseColumns={(entryId, blockId) => { onBeforeChange?.(); setChoosing({ entryId, blockId }); }}
                onReread={(entryId, options) => { onBeforeChange?.(); onReread(entryId, options); }} />}
          </>}
        </div>
      </div>
    </article>
  );
}
