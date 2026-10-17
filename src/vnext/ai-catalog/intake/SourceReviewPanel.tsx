import React from 'react';
import type { SourceReadOptions } from '../source-intake';
import {
  blockOrigin, imageBlocks, nextPdfPages, pageListText, pdfPagesNeedingServerReading, tableBlocks, textBlocks,
  type IntakeEntry, type SourceImageBlock, type SourceTableBlock,
} from './intake-model';
import { sourceHasHeader, sourceTableCells } from './source-table-insert';

interface Props {
  readonly entries: readonly IntakeEntry[];
  readonly onChooseColumns: (entryId: string, blockId: string) => void;
  readonly onReread: (entryId: string, options: SourceReadOptions) => void;
  readonly disabled?: boolean;
}

const MAX_WARNINGS = 5;
const MAX_TEXT_BLOCKS = 6;
const TEXT_EXCERPT = 400;

/** Short name of a table for the person: "Aba DB_SENSORS", "Tabela da página 5" or "Tabela do arquivo". */
export function sourceTableName(block: SourceTableBlock): string {
  if (block.source.sheet) return `Aba ${block.source.sheet}`;
  if (block.source.page !== undefined) return `Tabela da página ${block.source.page}`;
  return 'Tabela do arquivo';
}

function tableSize(block: SourceTableBlock): string {
  const columns = Math.max(0, ...block.rows.map((row) => row.length));
  // The same count "Escolher colunas" shows: from the header down, without empty rows.
  const rows = sourceTableCells({ block, columns: Array.from({ length: columns }, (_, index) => index), header: sourceHasHeader(block) }).length;
  return `${rows} ${rows === 1 ? 'linha' : 'linhas'} × ${columns} ${columns === 1 ? 'coluna' : 'colunas'}`;
}

function Warnings({ items }: { readonly items: readonly string[] }) {
  if (!items.length) return null;
  const shown = items.slice(0, MAX_WARNINGS);
  return (
    <ul className="ai-intake-warnings">
      {shown.map((text, index) => <li key={index}>{text}</li>)}
      {items.length > shown.length && <li>E mais {items.length - shown.length} avisos parecidos.</li>}
    </ul>
  );
}

function PhotoThumbnail({ block }: { readonly block: SourceImageBlock }) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    if (typeof URL.createObjectURL !== 'function') return undefined;
    const next = URL.createObjectURL(block.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [block.file]);
  return (
    <figure className="ai-intake-photo">
      {url ? <img src={url} alt={`Foto ${block.source.fileName}`} /> : <span className="ai-intake-photo-empty" aria-hidden="true" />}
      <figcaption>
        {block.widthPx && block.heightPx ? `${block.widthPx} × ${block.heightPx} pixels` : 'Foto'}
      </figcaption>
    </figure>
  );
}

function RangeRequest({ entry, request, onReread, disabled }: {
  readonly entry: IntakeEntry;
  readonly request: NonNullable<IntakeEntry['intake']>['rangeRequests'][number];
  readonly onReread: Props['onReread'];
  readonly disabled?: boolean;
}) {
  const [range, setRange] = React.useState('');
  const inputId = React.useId();
  const read = (value: string) => onReread(entry.id, { ranges: { ...entry.options.ranges, [request.sheet]: value.trim().toUpperCase() } });
  return (
    <div className="ai-intake-range">
      <p>{request.message}</p>
      <div className="ai-intake-actions">
        {request.suggestedRange && (
          <button type="button" disabled={disabled} onClick={() => read(request.suggestedRange)}>
            Ler o intervalo {request.suggestedRange}
          </button>
        )}
      </div>
      <label htmlFor={inputId}>Outro intervalo de “{request.sheet}” (por exemplo A4:H72)</label>
      <div className="ai-intake-range-row">
        <input id={inputId} value={range} disabled={disabled} onChange={(event) => setRange(event.target.value)} />
        <button type="button" disabled={disabled || !range.trim()} onClick={() => read(range)}>Ler este intervalo</button>
      </div>
    </div>
  );
}

function TableList({ entry, blocks, onChooseColumns, disabled }: {
  readonly entry: IntakeEntry;
  readonly blocks: readonly SourceTableBlock[];
  readonly onChooseColumns: Props['onChooseColumns'];
  readonly disabled?: boolean;
}) {
  if (!blocks.length) return null;
  return (
    <ul className="ai-intake-tables">
      {blocks.map((block) => {
        const name = sourceTableName(block);
        return (
          <li key={block.id}>
            <div>
              <strong>{name}</strong>
              <span> · {tableSize(block)}</span>
              {block.flags.length > 0 && (
                <small className="ai-intake-flags">
                  {block.flags.length === 1 ? '1 célula para conferir' : `${block.flags.length} células para conferir`}: {block.flags[0].message}
                </small>
              )}
              <Warnings items={block.warnings} />
            </div>
            <button type="button" disabled={disabled} aria-label={`Escolher colunas — ${name}`} data-choose-columns={block.id}
              onClick={() => onChooseColumns(entry.id, block.id)}>Escolher colunas</button>
          </li>
        );
      })}
    </ul>
  );
}

const READABLE_ANYWAY = new Set(['hidden', 'internal', 'sheet-limit', 'not-chosen']);
const isWorkbook = (fileName: string) => /\.(xlsx|xlsm|xls)$/i.test(fileName);

/** Sheets of the current reading that the person sees (tables or "choose a range" requests). */
function readSheets(entry: IntakeEntry): string[] {
  const intake = entry.intake!;
  const names = [...tableBlocks(intake).map((block) => block.source.sheet), ...intake.rangeRequests.map((request) => request.sheet)];
  return [...new Set(names.filter((name): name is string => Boolean(name)))];
}

function SpreadsheetFindings({ entry, onChooseColumns, onReread, disabled }: { readonly entry: IntakeEntry } & Omit<Props, 'entries'>) {
  const intake = entry.intake!;
  const includeHidden = Boolean(entry.options.includeHidden);
  const hiddenHelpId = React.useId();
  const workbook = isWorkbook(entry.fileName);
  return (
    <>
      <TableList entry={entry} blocks={tableBlocks(intake)} onChooseColumns={onChooseColumns} disabled={disabled} />
      {intake.rangeRequests.map((request) => (
        <RangeRequest key={request.sheet} entry={entry} request={request} onReread={onReread} disabled={disabled} />
      ))}
      <Warnings items={intake.warnings} />
      {intake.ignored.length > 0 && (
        <details className="ai-intake-ignored">
          <summary>Deixado de fora ({intake.ignored.length})</summary>
          <ul>{intake.ignored.map((item, index) => (
            <li key={index}>
              {item.message}
              {workbook && item.kind === 'sheet' && item.sheet && READABLE_ANYWAY.has(item.reason) && (
                <button type="button" className="ai-intake-link" disabled={disabled} aria-label={`Ler a aba ${item.sheet} mesmo assim`}
                  onClick={() => onReread(entry.id, { sheets: [...readSheets(entry), item.sheet!] })}>Ler mesmo assim</button>
              )}
            </li>
          ))}</ul>
        </details>
      )}
      {workbook && <>
        <label className="ai-intake-hidden-toggle">
          <input type="checkbox" checked={includeHidden} disabled={disabled} aria-describedby={hiddenHelpId}
            onChange={(event) => onReread(entry.id, { includeHidden: event.target.checked })} />
          Incluir dados ocultos
        </label>
        <small id={hiddenHelpId} className="ai-intake-note">
          Lê também as abas, linhas e colunas que estão ocultas no Excel. Preços e registros de acesso continuam de fora.
        </small>
      </>}
    </>
  );
}

/** "A página 3 parece escaneada…" / "As páginas 3 e 5 parecem escaneadas…". */
export function scannedPagesText(pages: readonly number[]): string {
  return pages.length === 1
    ? `A página ${pages[0]} parece escaneada ou desenhada: o texto e as tabelas dela ainda não são lidos aqui. Confira no PDF original.`
    : `As páginas ${pageListText(pages)} parecem escaneadas ou desenhadas: o texto e as tabelas delas ainda não são lidos aqui. Confira no PDF original.`;
}

function PdfFindings({ entry, onChooseColumns, onReread, disabled }: { readonly entry: IntakeEntry } & Omit<Props, 'entries'>) {
  const intake = entry.intake!;
  const pdf = intake.pdf;
  const next = nextPdfPages(entry);
  const scanned = pdfPagesNeedingServerReading(entry);
  const texts = textBlocks(intake);
  return (
    <>
      {pdf && pdf.pagesRead.length > 0 && (
        <p>Páginas lidas: {pageListText(pdf.pagesRead)} de {pdf.pageCount}.</p>
      )}
      {scanned.length > 0 && (
        // Hand-off point for FR-66 (2F/3B): these pages go to the server reading by Gemini when it is connected.
        <p className="ai-intake-problem">{scannedPagesText(scanned)}</p>
      )}
      {next && (
        <button type="button" disabled={disabled} onClick={() => onReread(entry.id, { pdfPages: next })}>
          {next.from === next.to ? `Ler a página ${next.from}` : `Ler as páginas ${next.from} a ${next.to}`}
        </button>
      )}
      <TableList entry={entry} blocks={tableBlocks(intake)} onChooseColumns={onChooseColumns} disabled={disabled} />
      {texts.slice(0, MAX_TEXT_BLOCKS).map((block) => (
        <details key={block.id} className="ai-intake-text">
          <summary>Texto da {block.source.location}</summary>
          <p>{block.text.length > TEXT_EXCERPT ? `${block.text.slice(0, TEXT_EXCERPT).trimEnd()}…` : block.text}</p>
          <small className="ai-intake-origin">Origem: {blockOrigin(block)}</small>
        </details>
      ))}
      {texts.length > MAX_TEXT_BLOCKS && <p className="ai-intake-note">E mais {texts.length - MAX_TEXT_BLOCKS} trechos de texto.</p>}
      <Warnings items={intake.warnings.filter((warning) => !scanned.some((page) => warning.startsWith(`Página ${page}:`)))} />
    </>
  );
}

function PhotoFindings({ entry }: { readonly entry: IntakeEntry }) {
  const photos = imageBlocks(entry.intake);
  return (
    <>
      <div className="ai-intake-photos">
        {photos.map((block) => <PhotoThumbnail key={block.id} block={block} />)}
      </div>
      <Warnings items={photos.flatMap((block) => block.warnings)} />
      <p className="ai-intake-note">Para colocar a foto numa página, use “Imagem” na barra de cima e escolha este arquivo.</p>
    </>
  );
}

/**
 * FR-64 "O que encontrei": what was read in each file, grouped by file, with where it came from. Tables can go to the
 * catalog through "Escolher colunas"; PDFs say which pages were read and which still need visual reading.
 */
export function SourceReviewPanel({ entries, onChooseColumns, onReread, disabled }: Props) {
  const found = entries.filter((entry) => entry.intake && (entry.state === 'ready' || entry.state === 'needs-help'));
  if (!found.length) return null;
  return (
    <section className="ai-intake-review" aria-label="O que encontrei">
      <h4>O que encontrei</h4>
      {found.map((entry) => (
        <section key={entry.id} className="ai-intake-group" aria-label={`O que encontrei em ${entry.fileName}`}>
          <h5>{entry.fileName}</h5>
          {entry.kind === 'pdf'
            ? <PdfFindings entry={entry} onChooseColumns={onChooseColumns} onReread={onReread} disabled={disabled} />
            : entry.kind === 'photo'
              ? <PhotoFindings entry={entry} />
              : <SpreadsheetFindings entry={entry} onChooseColumns={onChooseColumns} onReread={onReread} disabled={disabled} />}
        </section>
      ))}
    </section>
  );
}
