import type { SaveProjection } from '../../persistence';
import { fatherSaveLabel, fatherSavedTime } from '../save-presentation';
import './SaveSummary.css';

/**
 * Save state under the catalog title (simple mode). FR-44: "Salvo às 14:05" after this tab's save was
 * confirmed, and "Sessão expirada — entre novamente" apart from "Sem conexão". The label keeps its own
 * element (`data-save-state`) so the state can be read without the time.
 */
export function SaveSummary({ save }: { readonly save: SaveProjection }) {
  const time = fatherSavedTime(save);
  return (
    <span className="vnext-save-summary" role="status" data-save-phase={save.phase}>
      <span data-save-state="">{fatherSaveLabel(save.label)}</span>
      {time && <span data-save-time=""> {time}</span>}
    </span>
  );
}
