import React from 'react';
import { MAX_NEW_TABLE_COLUMNS } from '../../app/editor-defaults';
import { blockOrigin, type SourceTableBlock } from './intake-model';
import {
  sourceChoiceProblem, sourceColumns, sourceHasHeader, sourceHeaderRow, sourceTableCells, suggestSourceColumns,
  SUGGESTED_A4_COLUMNS, type SourceTableChoice,
} from './source-table-insert';

interface Props {
  readonly block: SourceTableBlock;
  /** Short name of the table for the person ("Aba DB_SENSORS", "Tabela da página 5"). */
  readonly name: string;
  readonly busy?: boolean;
  readonly onInsert: (choice: SourceTableChoice) => void;
  readonly onCancel: () => void;
}

const PREVIEW_ROWS = 3;

/**
 * FR-64 "Escolher colunas": before "Inserir como tabela" the person ticks the columns. Up to 7 come ticked (they fit
 * well on a portrait A4 page); the first rows show exactly the text that will be inserted, commas and decimals as in
 * Excel.
 */
export function ColumnChooser({ block, name, busy, onInsert, onCancel }: Props) {
  const [header, setHeader] = React.useState(() => sourceHasHeader(block));
  const [chosen, setChosen] = React.useState<ReadonlySet<number>>(() => new Set(suggestSourceColumns(block)));
  const columns = React.useMemo(() => sourceColumns(block, header), [block, header]);
  const choice: SourceTableChoice = { block, header, columns: columns.map((column) => column.index).filter((index) => chosen.has(index)) };
  const problem = sourceChoiceProblem(choice);
  const cells = problem ? [] : sourceTableCells(choice);
  const titleRows = sourceHeaderRow(block);
  const toggle = (index: number) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const headingId = `${React.useId()}-heading`;
  return (
    <section className="ai-intake-columns" role="group" aria-labelledby={headingId}>
      <h5 id={headingId}>Escolher colunas — {name}</h5>
      <p>Marque as colunas que vão para a tabela. Já deixamos marcadas até {SUGGESTED_A4_COLUMNS}, que cabem bem numa página A4 em pé.</p>
      <fieldset>
        <legend>Colunas</legend>
        {columns.map((column) => (
          <label key={column.index} className="ai-intake-column" data-empty={column.empty ? 'true' : undefined}>
            <input type="checkbox" checked={chosen.has(column.index)} disabled={busy}
              onChange={() => toggle(column.index)} />
            <span>
              <strong>{column.label}</strong>
              <small>{column.empty ? 'Coluna vazia' : column.sample ? `Ex.: ${column.sample}` : `Coluna ${column.letter} da origem`}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="ai-intake-columns-count" aria-live="polite">
        {choice.columns.length} de {columns.length} colunas escolhidas.
        {choice.columns.length > SUGGESTED_A4_COLUMNS && choice.columns.length <= MAX_NEW_TABLE_COLUMNS
          ? ` Com mais de ${SUGGESTED_A4_COLUMNS} colunas o texto fica apertado numa página A4 em pé.` : ''}
      </p>
      <label className="ai-intake-header-toggle">
        <input type="checkbox" checked={header} disabled={busy} onChange={(event) => setHeader(event.target.checked)} />
        A primeira linha é o cabeçalho (ela se repete nas páginas seguintes)
      </label>
      {titleRows > 0 && <p className="ai-intake-note">{titleRows === 1
        ? 'A linha acima do cabeçalho (título da planilha) fica de fora.'
        : `As ${titleRows} linhas acima do cabeçalho (títulos da planilha) ficam de fora.`}</p>}
      {problem
        ? <p className="ai-intake-problem">{problem}</p>
        : <>
          <div className="ai-intake-preview" aria-label="Prévia das primeiras linhas" role="region">
            <table>
              <tbody>
                {cells.slice(0, PREVIEW_ROWS + (header ? 1 : 0)).map((row, rowIndex) => (
                  <tr key={rowIndex} data-header={header && rowIndex === 0 ? 'true' : undefined}>
                    {row.map((value, columnIndex) => header && rowIndex === 0
                      ? <th key={columnIndex} scope="col">{value}</th>
                      : <td key={columnIndex}>{value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ai-intake-note">
            A tabela terá {cells.length} {cells.length === 1 ? 'linha' : 'linhas'}. Se não couber numa página, ela continua nas páginas seguintes, com o cabeçalho repetido.
          </p>
        </>}
      <small className="ai-intake-origin">Origem: {blockOrigin(block)}</small>
      <div className="ai-intake-actions">
        <button type="button" className="vnext-btn-primary" disabled={busy || Boolean(problem)} onClick={() => onInsert(choice)}>
          {busy ? 'Inserindo…' : 'Inserir como tabela'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>Voltar</button>
      </div>
    </section>
  );
}
