import React from 'react';
import { parsePastedTable } from '../../editor/table-paste-import';
import { PASTE_TABLE_LIMITS, pastedTableNotes, pastedTableProblemMessage } from './table-paste-actions';
import './PasteTableArea.css';

const PREVIEW_ROWS = 5;
const PREVIEW_COLUMNS = 6;

export interface PasteTableAreaProps {
  /** Creates the table; returns true when it was created so the area can close. */
  onCreate(text: string, header: boolean): boolean;
  onCancel(): void;
}

/**
 * "Colar tabela do Excel": a box where the father pastes cells copied from a
 * spreadsheet, sees a small preview and creates the table in the open page.
 * The clipboard is read only from the paste itself (no browser permission prompt).
 */
export function PasteTableArea({ onCreate, onCancel }: PasteTableAreaProps) {
  const [text, setText] = React.useState('');
  const [headerChoice, setHeaderChoice] = React.useState<boolean | null>(null);
  const parse = React.useMemo(() => (text ? parsePastedTable(text, PASTE_TABLE_LIMITS) : null), [text]);
  const table = parse?.ok ? parse.table : undefined;
  const header = Boolean(table && table.rowCount > 1 && (headerChoice ?? table.header));
  const notes = table ? pastedTableNotes(table, false) : [];

  const create = () => {
    if (!table) return;
    if (onCreate(text, header)) {
      setText('');
      setHeaderChoice(null);
    }
  };

  return (
    <div
      id="vnext-paste-table-area"
      className="vnext-table-paste-fallback vnext-paste-table-area"
      role="region"
      aria-label="Colar tabela do Excel"
      data-paste-table-area=""
    >
      <p className="vnext-disclosure-help">
        No Excel, selecione as células e copie (Ctrl+C). Depois clique na caixa abaixo e cole (Ctrl+V).
        A tabela entra na página aberta, na largura da área útil.
      </p>
      <label>
        <span>Cole aqui (Ctrl+V)</span>
        <textarea
          autoFocus
          data-paste-table-textarea=""
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setHeaderChoice(null);
          }}
          placeholder={'Ex.: Modelo\tFaixa\tExatidão\nTA-25N\t-25 °C a 140 °C\t±0,1 °C'}
        />
      </label>
      {parse && !parse.ok && <p className="vnext-paste-table-problem" role="alert">{pastedTableProblemMessage(parse)}</p>}
      {table && (
        <>
          <p className="vnext-paste-table-summary" data-paste-table-summary="">
            {table.rowCount} {table.rowCount === 1 ? 'linha' : 'linhas'} × {table.columnCount} {table.columnCount === 1 ? 'coluna' : 'colunas'}
          </p>
          {table.rowCount > 1 && (
            <label className="vnext-paste-table-header">
              <input
                type="checkbox"
                data-paste-table-header=""
                checked={header}
                onChange={(event) => setHeaderChoice(event.target.checked)}
              />
              <span>A primeira linha é o cabeçalho (fica em destaque)</span>
            </label>
          )}
          <table className="vnext-paste-table-preview" aria-label="Prévia da tabela">
            <tbody>
              {table.cells.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.slice(0, PREVIEW_COLUMNS).map((value, columnIndex) => (
                    header && rowIndex === 0
                      ? <th key={columnIndex} scope="col">{value}</th>
                      : <td key={columnIndex}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(table.rowCount > PREVIEW_ROWS || table.columnCount > PREVIEW_COLUMNS) && (
            <p className="vnext-paste-table-summary">A prévia mostra só o começo; a tabela terá tudo o que foi colado.</p>
          )}
          {notes.length > 0 && (
            <ul className="vnext-paste-table-notes">
              {notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          )}
        </>
      )}
      <div className="vnext-tool-group vnext-paste-table-actions">
        <button type="button" data-editor-action="create-pasted-table" disabled={!table} onClick={create}>Criar tabela</button>
        <button type="button" data-editor-action="cancel-pasted-table" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export interface PasteGrowOfferProps {
  readonly label: string;
  onConfirm(): void;
  onCancel(): void;
}

/** Offer shown in the table grid when the pasted block is larger than the room left from the chosen cell. */
export function PasteGrowOffer({ label, onConfirm, onCancel }: PasteGrowOfferProps) {
  return (
    <div className="vnext-new-table-size vnext-paste-grow-offer" role="region" aria-label="Colar dados maiores que a tabela" data-paste-grow-offer="">
      <p>Os dados copiados não cabem na tabela a partir da célula escolhida. A tabela pode crescer para receber tudo.</p>
      <div className="vnext-tool-group">
        <button type="button" data-editor-action="grow-and-paste" onClick={onConfirm}>{label}</button>
        <button type="button" data-editor-action="cancel-grow-and-paste" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
