import { useId } from 'react';
import {
  openPendingCount, pendingFacts, recordChoice, type DraftCellTarget, type DraftFactSet, type PendingCandidate, type PendingFact,
} from './draft-compiler';
import { valueDisplayText } from './extraction-review';
import './pending-facts.css';

/**
 * FR-68 (slice 3C): "Pendências (N)". Every value the draft compiler will not
 * write by itself — not verified, only visible on the page image, missing, or
 * different between two files — with where it came from (file · page or
 * cell) and the quoted passage. For a conflict (TA-25N: 140 °C in the manual,
 * 155 °C in the folder) the person picks one verified reading, or leaves the
 * cell blank, with one click; the choice is recorded in the fact set (the
 * `Decisions` contract) BEFORE anything is applied, so nothing is picked in
 * silence. After the table is inserted, clicking an item selects its cell.
 *
 * Why this file exists (IDS: CREATE): the intake review lists what was read,
 * not the positions the compiler leaves empty, and no screen let a person
 * choose between two files.
 */
export interface PendingFactsPanelProps {
  readonly factSet: DraftFactSet;
  /** Receives the fact set with the choice recorded. */
  readonly onChange: (next: DraftFactSet) => void;
  /** After insertion: where each fact landed (`AppliedDraft.cells`). */
  readonly cells?: ReadonlyMap<string, DraftCellTarget>;
  readonly onSelectCell?: (target: DraftCellTarget) => void;
  /** After the table went in: the list stays to find the cells, but choices can no longer change it. */
  readonly readOnly?: boolean;
}

const STATUS_TEXT: Readonly<Record<PendingFact['status'], string>> = {
  CONFLICT: 'Fontes divergem',
  VISUAL_ONLY: 'Conferir na página',
  UNVERIFIED: 'Não conferido',
  MISSING: 'Não encontrado',
  VERIFIED_TEXT: 'Conferido',
  VERIFIED_CELL: 'Conferido',
};

export function pendingTitle(item: PendingFact): string {
  return item.kind === 'condition' ? `Condição de ${item.label}` : `${item.model} · ${item.label}`;
}
function shownValue(item: PendingFact, candidate: PendingCandidate): string {
  return item.kind === 'condition' ? candidate.value : valueDisplayText(candidate.value, candidate.unit);
}
function chosenText(item: PendingFact): string | undefined {
  if (item.choice === 'missing') return 'Deixado em branco: preencha depois na tabela.';
  const chosen = typeof item.choice === 'number' && item.resolved ? item.candidates[item.choice] : undefined;
  return chosen ? `Escolhido: ${shownValue(item, chosen)} (${chosen.where}).` : undefined;
}

function PendingItem({ item, target, onChoose, onSelectCell, readOnly }: {
  readonly item: PendingFact;
  readonly readOnly?: boolean;
  readonly target?: DraftCellTarget;
  readonly onChoose: (choice: number | 'missing') => void;
  readonly onSelectCell?: (target: DraftCellTarget) => void;
}) {
  const conflict = item.status === 'CONFLICT';
  const canChoose = conflict && !readOnly;
  const title = pendingTitle(item);
  const chosen = chosenText(item);
  return (
    <li className="ai-pending-item" data-status={item.status} data-resolved={item.resolved || item.choice === 'missing'}>
      <div className="ai-pending-head">
        {target && onSelectCell ? (
          <button type="button" className="ai-pending-locate" onClick={() => onSelectCell(target)}
            aria-label={`Mostrar na tabela: ${title}`}>
            <span>{title}</span>
            <span className="ai-pending-locate-hint">Mostrar na tabela</span>
          </button>
        ) : <strong className="ai-pending-title">{title}</strong>}
        <span className="ai-pending-badge">{item.resolved ? 'Escolhido' : STATUS_TEXT[item.status]}</span>
      </div>
      <p className="ai-pending-message">{item.message}</p>
      {item.candidates.length > 0 && (
        <ul className="ai-pending-sources">
          {item.candidates.map((candidate) => {
            const value = shownValue(item, candidate);
            const picked = item.choice === candidate.index;
            return (
              <li key={candidate.index} className="ai-pending-source" data-picked={picked}>
                <span className="ai-pending-value">{value}</span>
                <span className="ai-pending-where">{candidate.where}</span>
                <blockquote className="ai-pending-quote">“{candidate.source.quote}”</blockquote>
                {canChoose && candidate.choosable && (
                  <button type="button" className={picked ? 'vnext-btn-primary' : undefined} aria-pressed={picked}
                    onClick={() => onChoose(candidate.index)}>
                    {`Usar ${value}`}
                  </button>
                )}
                {canChoose && !candidate.choosable && (
                  <span className="ai-pending-note">Este valor não foi conferido no texto do arquivo e não pode ser usado direto.</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canChoose && (
        <div className="ai-pending-actions">
          <button type="button" aria-pressed={item.choice === 'missing'} onClick={() => onChoose('missing')}>Deixar em branco</button>
        </div>
      )}
      {chosen && <p className="ai-pending-chosen" role="status">{chosen}</p>}
      {!conflict && <p className="ai-pending-note">A célula fica em branco. Confira no arquivo e digite o valor na tabela.</p>}
    </li>
  );
}

export function PendingFactsPanel({ factSet, onChange, cells, onSelectCell, readOnly }: PendingFactsPanelProps) {
  const headingId = useId();
  const items = pendingFacts(factSet);
  const open = openPendingCount(items);
  return (
    <section className="ai-pending" aria-labelledby={headingId}>
      <h4 id={headingId}>{`Pendências (${open})`}</h4>
      {items.length === 0
        ? <p>Nenhuma pendência: todos os valores foram conferidos nos arquivos.</p>
        : <p className="ai-pending-intro">Estes valores não entram sozinhos na tabela. Veja de onde vieram e decida.</p>}
      {items.length > 0 && (
        <ol className="ai-pending-list">
          {items.map((item) => (
            <PendingItem key={item.id} item={item} target={cells?.get(item.id)} onSelectCell={onSelectCell} readOnly={readOnly}
              onChoose={(choice) => onChange(recordChoice(factSet, item.id, choice))} />
          ))}
        </ol>
      )}
    </section>
  );
}
