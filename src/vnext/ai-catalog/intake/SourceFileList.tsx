import type { PhotoLink } from '../photo-matching';
import { intakeStateLabel, type IntakeEntry } from './intake-model';
import { PhotoLinkLine } from './PhotoLinkLine';

interface Props {
  readonly entries: readonly IntakeEntry[];
  readonly onRemove: (id: string) => void;
  /** FR-71: the product each photo is linked to (by entry id), and the person's choice of another one. */
  readonly photoLinks?: ReadonlyMap<string, PhotoLink>;
  readonly onLinkPhoto?: (id: string, code: string | undefined) => void;
}

/**
 * FR-64: one line per file with its state. The state changes are announced politely (the list is a live region),
 * and a file that could not be read says why, right next to its name.
 */
export function SourceFileList({ entries, onRemove, photoLinks, onLinkPhoto }: Props) {
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
          {entry.kind === 'photo' && onLinkPhoto && (
            <PhotoLinkLine fileName={entry.fileName} link={photoLinks?.get(entry.id)} onChoose={(code) => onLinkPhoto(entry.id, code)} />
          )}
          <button type="button" className="ai-intake-file-remove" aria-label={`Tirar ${entry.fileName} da lista`}
            onClick={() => onRemove(entry.id)}>Tirar</button>
        </li>
      ))}
    </ul>
  );
}
