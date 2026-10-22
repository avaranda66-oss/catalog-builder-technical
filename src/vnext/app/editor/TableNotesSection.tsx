import React from 'react';
import { projectEditableRichText } from '../../application/text-editing';
import type { TableAnnotation, TableModel } from '../../domain/editorial-model';
import { QUICK_NOTE_PLACEHOLDER, quickNoteRemovable, tableQuickNotes } from '../../editor/table-quick-notes';
import './TablePanel.css';

export interface TableNotesSectionProps {
  readonly table: TableModel;
  /** Notes cannot change now (cell being edited, or the table is locked). */
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly disabledReasonId?: string;
  /** Adds a note under the table; true when it was added. */
  readonly onAddNote: () => boolean;
  readonly onUpdateNote: (annotation: TableAnnotation, plainText: string) => void;
  readonly onRemoveNote: (annotation: TableAnnotation) => void;
  /** Opens "Notas e legenda" (notes on cells, footnotes, markers and legend). */
  readonly onOpenAllNotes: () => void;
}

/**
 * The text of one note. A controlled field with its own draft: the value typed stays while the person writes and is
 * sent when the field is left; a change made elsewhere (Desfazer, "Notas e legenda") shows up when nothing is typed.
 */
function QuickNoteText({ noteId, text, disabled, describedBy, onCommit }: {
  noteId: string;
  text: string;
  disabled: boolean;
  describedBy?: string;
  onCommit: (plainText: string) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <textarea
      data-quick-note-text={noteId}
      value={draft ?? text}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => setDraft(event.target.value.replace(/\r\n?/g, '\n'))}
      onBlur={() => {
        if (draft !== null && draft !== text) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}

/**
 * FR-33 "Notas": the notes printed under the table, a new note in one click and the way to everything else
 * ("Notas e legenda"). A new note starts as "A COMPLETAR", with the text selected, ready to be typed over.
 */
export function TableNotesSection({
  table, disabled, disabledReason, disabledReasonId, onAddNote, onUpdateNote, onRemoveNote, onOpenAllNotes,
}: TableNotesSectionProps) {
  const notes = tableQuickNotes(table);
  const [notesBefore, setNotesBefore] = React.useState<readonly string[] | null>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!notesBefore) return;
    const created = notes.find((note) => !notesBefore.includes(note.id));
    if (!created) return;
    setNotesBefore(null);
    const field = sectionRef.current?.querySelector<HTMLTextAreaElement>(`[data-quick-note-text="${created.id}"]`);
    field?.focus();
    field?.select();
  }, [notes, notesBefore]);
  const describedBy = disabled && disabledReason ? disabledReasonId : undefined;
  return (
    <section ref={sectionRef} className="vnext-table-notes" data-table-notes="" aria-labelledby={`vnext-table-notes-${table.id}`}>
      <h3 id={`vnext-table-notes-${table.id}`}>Notas</h3>
      {notes.length === 0 && <p className="vnext-disclosure-help">As notas aparecem logo abaixo da tabela, no PDF.</p>}
      {notes.map((note, index) => {
        const text = projectEditableRichText(note.text);
        const removable = quickNoteRemovable(table, note.id);
        return (
          <div key={note.id} className="vnext-table-note" data-quick-note={note.id}>
            <label>
              <span>{`Nota ${index + 1}`}</span>
              {text === null ? (
                <p>Esta nota tem formatação especial. Altere-a em Notas e legenda.</p>
              ) : (
                <QuickNoteText
                  noteId={note.id}
                  text={text}
                  disabled={disabled}
                  describedBy={describedBy}
                  onCommit={(next) => onUpdateNote(note, next)}
                />
              )}
            </label>
            <button
              type="button"
              data-editor-action="remove-quick-note"
              disabled={disabled || !removable}
              title={removable ? undefined : 'Esta nota também está ligada a células. Exclua em Notas e legenda.'}
              aria-describedby={describedBy}
              onClick={() => onRemoveNote(note)}
            >
              {`Excluir nota ${index + 1}`}
            </button>
          </div>
        );
      })}
      <div className="vnext-cell-edit-actions">
        <button
          type="button"
          data-editor-action="add-quick-note"
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={() => {
            const before = notes.map((note) => note.id);
            if (onAddNote()) setNotesBefore(before);
          }}
        >
          Adicionar nota
        </button>
        <button
          type="button"
          data-editor-action="open-table-semantics"
          disabled={disabled}
          aria-describedby={describedBy}
          onClick={onOpenAllNotes}
        >
          Notas e legenda
        </button>
      </div>
      {describedBy && <p id={disabledReasonId} data-table-semantic-disabled-reason="">{disabledReason}</p>}
      <p className="sr-only">{`Uma nota nova começa como "${QUICK_NOTE_PLACEHOLDER}".`}</p>
    </section>
  );
}
