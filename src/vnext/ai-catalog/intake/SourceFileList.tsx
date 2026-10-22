import { intakeStateLabel, type IntakeEntry } from './intake-model';

interface Props {
  readonly entries: readonly IntakeEntry[];
  readonly onRemove: (id: string) => void;
}

/**
 * FR-64: one line per file with its state. The state changes are announced politely (the list is a live region),
 * and a file that could not be read says why, right next to its name.
 */
export function SourceFileList({ entries, onRemove }: Props) {
  if (!entries.length) return null;
  return (
    <ul className="ai-intake-files" aria-label="Arquivos enviados" aria-live="polite">
      {entries.map((entry) => (
        <li key={entry.id} data-intake-state={entry.state}>
          <span className="ai-intake-file-name">{entry.fileName}</span>
          <span className="ai-intake-file-state" data-intake-state={entry.state}>{intakeStateLabel(entry)}</span>
          {(entry.state === 'duplicate' || entry.state === 'skipped') && entry.message && (
            <small className="ai-intake-file-note">{entry.message}</small>
          )}
          <button type="button" className="ai-intake-file-remove" aria-label={`Tirar ${entry.fileName} da lista`}
            onClick={() => onRemove(entry.id)}>Tirar</button>
        </li>
      ))}
    </ul>
  );
}
