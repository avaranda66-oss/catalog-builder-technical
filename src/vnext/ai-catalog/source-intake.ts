/**
 * Reads the father's real source files (PDF, XLSX/XLSM, CSV/TSV/TXT, photos) into reviewable blocks.
 * One bad sheet, cell or page never rejects the whole file: it becomes a mark, an "ignored" entry,
 * a "choose a range" request or a page that still needs visual reading. Pure module: no UI.
 */
import type { Workbook } from 'exceljs';
import { sniffImageDimensions, sniffImageMime, type SupportedImageMime } from '../asset/sniff';
import { displayLocale } from './excel-display-format';
import { extractPdfText, MAX_PDF_BYTES, type ExtractedPdfPage } from './pdf-intake';
import {
  buildGridTable, columnLabel, formatNumberList, gridFromRows, gridFromWorksheet, isInternalSheetName, parseA1Range, stripControlCharacters,
  TABLE_LIMITS, type SourceCellFlag, type SourceIgnored, type SourceMerge, type SourceRangeRequest,
} from './source-grid';

export { columnLabel };
export type { SourceCellFlag, SourceIgnored, SourceMerge, SourceRangeRequest };

export const SOURCE_LIMITS = {
  files: 10, bytes: 20 * 1024 * 1024, pdfBytes: MAX_PDF_BYTES, pdfPages: 30, sheets: 10,
  rows: TABLE_LIMITS.rows, columns: TABLE_LIMITS.columns, characters: TABLE_LIMITS.characters, blocks: 80, cell: TABLE_LIMITS.cell,
} as const;
/** Memory guard for delimited text before any exclusion (about 20 MB of text). */
const MAX_DELIMITED_CHARACTERS = 20 * 1024 * 1024;
/** Photos smaller than this on the long side may print blurred at half an A4 page. */
export const MIN_PRINT_PHOTO_PX = 1500;

export interface SourceLocator {
  fileName: string;
  sha256: string;
  location: string;
  page?: number;
  sheet?: string;
}
interface BaseBlock { id: string; title: string; source: SourceLocator; warnings: string[] }
export type SourceBlock = BaseBlock & (
  | { kind: 'text'; text: string }
  | {
    kind: 'table';
    /** Display text, as Excel shows it (or as typed in CSV). */
    rows: string[][];
    /** Original cell address per cell, e.g. "Specs!B7". */
    addresses: string[][];
    /** Raw stored value per cell (provenance), e.g. "0.30000000000000004". */
    raw: string[][];
    flags: SourceCellFlag[];
    merges: SourceMerge[];
    headerRow?: number;
    range?: string;
  }
  | { kind: 'image'; file: File; mime: SupportedImageMime; widthPx?: number; heightPx?: number }
);
export interface SourcePdfSummary {
  pageCount: number;
  pagesRead: number[];
  pagesNotRead: number[];
  /** Pages whose content is (partly) an image or drawing: they need visual reading. */
  pagesNeedingVisualReading: number[];
}
export interface SourceIntake {
  blocks: SourceBlock[];
  warnings: string[];
  /** What was left out on purpose (hidden or internal data, extra sheets), with a message for each. */
  ignored: SourceIgnored[];
  /** Tables too big for one import: ask the person for a range and read again with `ranges`. */
  rangeRequests: SourceRangeRequest[];
  pdf?: SourcePdfSummary;
}
export type SourceDelimiter = ',' | ';' | '\t' | '|';
export interface SourceReadOptions {
  /** Catalog language for numbers, dates and Sim/Não (default pt-BR). */
  locale?: string;
  /** Include hidden sheets, rows and columns. */
  includeHidden?: boolean;
  /** Include sheets and columns left out by default (logs, helpers, prices, e-mail…). */
  includeInternal?: boolean;
  /** Read only these sheets; a sheet named here is read even when hidden or internal. */
  sheets?: readonly string[];
  /** Range per sheet name (or CSV file name), e.g. { DB_SENSORS: 'A4:H72' }. */
  ranges?: Readonly<Record<string, string>>;
  /** PDF pages to read (1-based, at most 30 at a time). */
  pdfPages?: { from: number; to?: number };
  delimiter?: SourceDelimiter;
}

export type SourceErrorCode =
  | 'SOURCE_FILE_LIMIT' | 'SOURCE_FORMAT_UNSUPPORTED' | 'SOURCE_OFFICE_DOCUMENT' | 'SOURCE_LEGACY_SPREADSHEET'
  | 'SOURCE_PASSWORD_PROTECTED' | 'SOURCE_XLSX_INVALID' | 'SOURCE_XLSX_LIMIT' | 'SOURCE_TABLE_LIMIT' | 'SOURCE_TEXT_LIMIT'
  | 'SOURCE_CSV_MALFORMED' | 'SOURCE_PDF_INVALID' | 'SOURCE_PDF_PAGES_INVALID' | 'SOURCE_IMAGE_HEIC' | 'SOURCE_IMAGE_INVALID'
  | 'SOURCE_FORMULA_ERROR' | 'SOURCE_FORMULA_NO_RESULT';
/** `message` is the code, so `error.message` checks keep working; `detail` feeds the Portuguese message. */
export class SourceIntakeError extends Error {
  constructor(readonly code: SourceErrorCode, readonly detail: { line?: number; sheet?: string } = {}) {
    super(code);
    this.name = 'SourceIntakeError';
  }
}
function fail(code: SourceErrorCode, detail?: { line?: number; sheet?: string }): never {
  throw new SourceIntakeError(code, detail);
}

const digest = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');

async function bytesOf(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('SOURCE_READ_FAILED'));
    reader.readAsArrayBuffer(file);
  });
}

// ---------------------------------------------------------------------------
// Delimited text (CSV, TSV, TXT)
// ---------------------------------------------------------------------------

interface DelimitedRecords { records: { cells: string[]; line: number }[]; openQuoteLine?: number; looseQuoteRows: number[] }

/** RFC-4180 records with lenient quotes: an inch mark inside a cell (1/4" NPT) stays literal. */
function splitRecords(text: string, delimiter: string, maxRecords = Infinity): DelimitedRecords {
  const records: { cells: string[]; line: number }[] = [];
  const looseQuoteRows: number[] = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, recordLine = 1, quoteLine = 1, loose = false;
  const endCell = () => { cells.push(cell); cell = ''; closed = false; };
  const endRecord = () => {
    endCell(); records.push({ cells, line: recordLine });
    if (loose) looseQuoteRows.push(records.length);
    cells = []; loose = false; recordLine = line;
  };
  for (let index = 0; index < text.length && records.length < maxRecords; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } }
      else { if (char === '\n') line++; cell += char; }
    } else if (char === delimiter) endCell();
    else if (char === '\n') { line++; endRecord(); }
    else if (char === '"' && cell.length === 0 && !closed) { quoted = true; quoteLine = line; }
    else { if (closed) loose = true; cell += char; }
  }
  if (quoted) return { records, openQuoteLine: quoteLine, looseQuoteRows };
  if (records.length < maxRecords && (cell.length || cells.length || closed)) endRecord();
  return { records, looseQuoteRows };
}

const isBlankRecord = (cells: readonly string[]) => cells.every(value => value.trim() === '');
/** Most frequent column count of the non-blank records (larger count wins ties) and how many records have it. */
function modalWidth(records: readonly (readonly string[])[]): { width: number; hits: number; total: number } {
  const frequency = new Map<number, number>();
  let total = 0;
  for (const cells of records) {
    if (isBlankRecord(cells)) continue;
    total++;
    frequency.set(cells.length, (frequency.get(cells.length) ?? 0) + 1);
  }
  const [width, hits] = [...frequency].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [0, 0];
  return { width, hits, total };
}

/**
 * Picks the separator that splits the first ~20 records most consistently. A split that breaks the
 * header (first filled record) loses: "Modelo;Faixa" over rows of "0,5 a 1,5 bar" stays ';'.
 * Ranking: consistent (>= 80%), header fits the usual width, consistency, width; Brazilian ';' wins ties.
 */
export function detectDelimiter(text: string): SourceDelimiter {
  const candidates: SourceDelimiter[] = [';', '\t', ',', '|'];
  let best: { delimiter: SourceDelimiter; key: number[] } | undefined;
  for (const delimiter of candidates) {
    const records = splitRecords(text, delimiter, 20).records.map(record => record.cells).filter(cells => !isBlankRecord(cells));
    const { width: modal, hits, total } = modalWidth(records);
    if (modal < 2) continue;
    const consistency = hits / total;
    const key = [consistency >= 0.8 ? 1 : 0, records[0]?.length === modal ? 1 : 0, consistency, modal];
    if (!best || compareKeys(key, best.key) > 0) best = { delimiter, key };
  }
  return best?.delimiter ?? ';';
}
/** Lexicographic comparison of equal-length number tuples. */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  const index = a.findIndex((value, position) => value !== b[position]);
  return index < 0 ? 0 : a[index] - b[index];
}

export interface DelimitedParse {
  delimiter: SourceDelimiter;
  rows: string[][];
  /** Row numbers (as Excel shows them) whose column count differs from the rest. */
  irregularRows: number[];
  /** "row:column" keys (1-based) of cells whose invisible characters were removed. */
  cleanedCells: Set<string>;
  warnings: string[];
}

export function parseDelimitedText(raw: string, options: { delimiter?: SourceDelimiter } = {}): DelimitedParse {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) fail('SOURCE_TEXT_LIMIT');
  if (text.length > MAX_DELIMITED_CHARACTERS) fail('SOURCE_TABLE_LIMIT');
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const parsed = splitRecords(text, delimiter);
  if (parsed.openQuoteLine !== undefined) fail('SOURCE_CSV_MALFORMED', { line: parsed.openQuoteLine });
  let rows = parsed.records.map(record => record.cells);
  while (rows.length && isBlankRecord(rows[rows.length - 1])) rows.pop();
  if (!rows.length) fail('SOURCE_TEXT_LIMIT');
  const { width } = modalWidth(rows);
  const pad = (row: string[]) => row.length < width ? [...row, ...Array<string>(width - row.length).fill('')] : row;
  const irregularRows: number[] = [];
  rows = rows.map((row, index) => {
    if (isBlankRecord(row)) return pad([]);
    // Empty trailing cells ("a;b;") are not an irregular row; data beyond the usual width is kept.
    const overflow = row.slice(width).some(value => value.trim() !== '');
    if (row.length < width || overflow) irregularRows.push(index + 1);
    return overflow ? row : pad(row.slice(0, width));
  });
  const cleanedCells = new Set<string>();
  rows = rows.map((row, ri) => row.map((value, ci) => {
    const cleaned = stripControlCharacters(value);
    if (cleaned.removed) cleanedCells.add(`${ri + 1}:${ci + 1}`);
    return cleaned.text;
  }));
  const warnings: string[] = [];
  if (irregularRows.length) {
    const one = irregularRows.length === 1;
    warnings.push(`${one ? 'A linha' : 'As linhas'} ${formatNumberList(irregularRows)} ${one ? 'tem' : 'têm'} um número de colunas diferente das outras (${width}). ` +
      'Confira essas linhas no arquivo original: pode haver separador sobrando ou faltando.');
  }
  if (parsed.looseQuoteRows.length) {
    warnings.push(`Aspas fora do lugar na${parsed.looseQuoteRows.length === 1 ? ' linha' : 's linhas'} ${formatNumberList(parsed.looseQuoteRows)}: o texto foi mantido como estava; confira.`);
  }
  return { delimiter, rows, irregularRows, cleanedCells, warnings };
}

/** RFC-4180 quoting, including escaped quotes and multiline cells; no numeric coercion. Rows are padded to one width. */
export function parseDelimitedSource(raw: string, options: { delimiter?: SourceDelimiter } = {}): string[][] {
  const { rows } = parseDelimitedText(raw, options);
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return rows.map(row => row.length < width ? [...row, ...Array<string>(width - row.length).fill('')] : row);
}

function decodeText(bytes: ArrayBuffer, warnings: string[]): string {
  const view = new Uint8Array(bytes);
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return new TextDecoder('utf-8').decode(view.subarray(3));
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view.subarray(2));
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view.subarray(2));
  // UTF-16 without BOM: many zero bytes on one side.
  const sample = view.subarray(0, 4096);
  let evenZeros = 0, oddZeros = 0;
  sample.forEach((value, index) => { if (value === 0) { if (index % 2) oddZeros++; else evenZeros++; } });
  if (oddZeros > sample.length / 4) return new TextDecoder('utf-16le').decode(view);
  if (evenZeros > sample.length / 4) return new TextDecoder('utf-16be').decode(view);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(view); }
  catch {
    // Windows-1252, the encoding older Excel versions use for CSV.
    warnings.push('O arquivo foi salvo num formato antigo do Excel e os acentos foram convertidos: confira acentos e símbolos como ± e °.');
    return new TextDecoder('windows-1252').decode(view);
  }
}

// ---------------------------------------------------------------------------
// XLSX / XLSM
// ---------------------------------------------------------------------------

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const startsWith = (bytes: ArrayBuffer, signature: readonly number[]) => {
  const view = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, signature.length));
  return view.length === signature.length && signature.every((value, index) => view[index] === value);
};
const isCompoundFile = (bytes: ArrayBuffer) => startsWith(bytes, CFB_SIGNATURE);
/** Stream names inside an OLE compound file are stored as UTF-16LE. */
const utf16Name = (name: string) => Uint8Array.from([...name].flatMap(char => [char.charCodeAt(0), 0]));
function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  for (let index = haystack.indexOf(needle[0]); index >= 0 && index <= haystack.length - needle.length; index = haystack.indexOf(needle[0], index + 1)) {
    let match = true;
    for (let offset = 1; offset < needle.length && match; offset++) match = haystack[index + offset] === needle[offset];
    if (match) return true;
  }
  return false;
}
/**
 * An OLE compound file named .xlsx is either an encrypted workbook (EncryptionInfo stream) or an old
 * binary .xls renamed (Workbook stream). Anything else is treated as protected, the common case.
 */
function compoundWorkbookError(bytes: ArrayBuffer): SourceErrorCode {
  const view = new Uint8Array(bytes);
  if (containsBytes(view, utf16Name('EncryptionInfo'))) return 'SOURCE_PASSWORD_PROTECTED';
  return containsBytes(view, utf16Name('Workbook')) ? 'SOURCE_LEGACY_SPREADSHEET' : 'SOURCE_PASSWORD_PROTECTED';
}

/** Bound declared expansion before ExcelJS allocates XML from an XLSX ZIP. */
export function verifyWorkbookArchive(bytes: ArrayBuffer) {
  // Password-protected Office files and old .xls files are not ZIPs but OLE compound files.
  if (isCompoundFile(bytes)) fail(compoundWorkbookError(bytes));
  const data = new DataView(bytes); let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset--) {
    if (data.getUint32(offset, true) === 0x06054b50 && offset + 22 + data.getUint16(offset + 20, true) === bytes.byteLength) { end = offset; break; }
  }
  if (end < 0 || data.getUint16(end + 4, true) || data.getUint16(end + 6, true)) fail('SOURCE_XLSX_INVALID');
  const entries = data.getUint16(end + 10, true), start = data.getUint32(end + 16, true);
  if (!entries || start >= end) fail('SOURCE_XLSX_INVALID');
  if (entries > 1000) fail('SOURCE_XLSX_LIMIT');
  let offset = start, expanded = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) fail('SOURCE_XLSX_INVALID');
    if (data.getUint16(offset + 8, true) & 1) fail('SOURCE_PASSWORD_PROTECTED');
    expanded += data.getUint32(offset + 24, true);
    if (expanded > 40 * 1024 * 1024) fail('SOURCE_XLSX_LIMIT');
    offset += 46 + data.getUint16(offset + 28, true) + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
  }
  if (offset !== end) fail('SOURCE_XLSX_INVALID');
}

type WorkbookConstructor = new () => Workbook;
/** ExcelJS is CommonJS: bundlers expose `Workbook` on the namespace, plain Node ESM only on `default`. */
export function resolveWorkbookConstructor(module: unknown): WorkbookConstructor {
  const candidate = module as { Workbook?: unknown; default?: { Workbook?: unknown } } | null;
  const Workbook = candidate?.Workbook ?? candidate?.default?.Workbook;
  if (typeof Workbook !== 'function') throw new Error('SOURCE_XLSX_RUNTIME');
  return Workbook as WorkbookConstructor;
}

interface ReadContext {
  fileName: string;
  sha256: string;
  prefix: string;
  options: SourceReadOptions;
}

async function readWorkbook(bytes: ArrayBuffer, context: ReadContext): Promise<SourceIntake> {
  verifyWorkbookArchive(bytes);
  const Workbook = resolveWorkbookConstructor(await import('exceljs'));
  const book = new Workbook();
  try { await book.xlsx.load(bytes); }
  catch { fail('SOURCE_XLSX_INVALID'); }
  const { options } = context;
  const locale = displayLocale(options.locale);
  const date1904 = !!(book as { properties?: { date1904?: boolean } }).properties?.date1904;
  const intake: SourceIntake = { blocks: [], warnings: [], ignored: [], rangeRequests: [] };
  let included = 0, characters = 0;
  for (const sheet of book.worksheets) {
    const name = sheet.name;
    const chosen = options.sheets?.includes(name) ?? false;
    const skip = (reason: SourceIgnored['reason'], message: string) => intake.ignored.push({ kind: 'sheet', sheet: name, label: name, reason, message });
    if (options.sheets && !chosen) { skip('not-chosen', `A aba “${name}” não foi escolhida.`); continue; }
    if (sheet.state !== 'visible' && !options.includeHidden && !chosen) { skip('hidden', `A aba “${name}” não foi importada: estava oculta no Excel.`); continue; }
    if (isInternalSheetName(name) && !options.includeInternal && !chosen) {
      skip('internal', `A aba “${name}” não foi importada: parece de uso interno (registros, listas auxiliares, preços ou pendências).`);
      continue;
    }
    if (included >= SOURCE_LIMITS.sheets) {
      skip('sheet-limit', `A aba “${name}” não foi lida: cada importação lê até ${SOURCE_LIMITS.sheets} abas. Escolha as abas que quer importar.`);
      continue;
    }
    let result;
    const range = options.ranges?.[name];
    try {
      // A chosen range is also applied while reading, so a huge sheet can still be read in parts.
      result = buildGridTable(gridFromWorksheet(sheet, locale, date1904, range === undefined ? undefined : parseA1Range(range) ?? undefined), {
        includeHidden: options.includeHidden || (chosen && sheet.state !== 'visible'), includeInternal: options.includeInternal, range,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'SOURCE_TABLE_LIMIT') {
        intake.rangeRequests.push({ sheet: name, usedRange: '', suggestedRange: 'A1:J150', rows: 0, columns: 0,
          message: `A aba “${name}” é grande demais para ler inteira. Escolha um intervalo de até ${SOURCE_LIMITS.rows} linhas e ${SOURCE_LIMITS.columns} colunas.` });
        included++;
        continue;
      }
      throw error;
    }
    intake.ignored.push(...result.ignored);
    if (result.empty) { skip('empty', `A aba “${name}” está vazia.`); continue; }
    included++;
    if (result.rangeRequest) { intake.rangeRequests.push(result.rangeRequest); continue; }
    const table = result.table!;
    if (characters + table.characters > SOURCE_LIMITS.characters || intake.blocks.length >= SOURCE_LIMITS.blocks) {
      skip('budget', `A aba “${name}” não foi lida: o arquivo já passou do tamanho de uma importação. Escolha menos abas ou um intervalo menor.`);
      continue;
    }
    characters += table.characters;
    intake.blocks.push({
      id: `${context.prefix}-${intake.blocks.length}`, title: `${context.fileName} · ${name}`, kind: 'table',
      source: { fileName: context.fileName, sha256: context.sha256, location: `aba ${name}`, sheet: name },
      warnings: table.warnings, rows: table.rows, addresses: table.addresses, raw: table.raw, flags: table.flags,
      merges: table.merges, headerRow: table.headerRow, range: table.range,
    });
  }
  for (const missing of options.sheets?.filter(name => !book.worksheets.some(sheet => sheet.name === name)) ?? []) {
    intake.warnings.push(`A aba “${missing}” não existe nesta planilha. Confira o nome da aba no Excel.`);
  }
  if (!intake.blocks.length && !intake.rangeRequests.length) {
    intake.warnings.push('Nenhuma tabela foi importada desta planilha. Veja abaixo as abas ignoradas e por quê.');
  }
  return intake;
}

function readDelimited(bytes: ArrayBuffer, context: ReadContext, delimiter?: SourceDelimiter): SourceIntake {
  const warnings: string[] = [];
  const text = decodeText(bytes, warnings);
  const parsed = parseDelimitedText(text, { delimiter: context.options.delimiter ?? delimiter });
  const result = buildGridTable(gridFromRows(context.fileName, parsed.rows, parsed.cleanedCells), {
    includeInternal: context.options.includeInternal, range: context.options.ranges?.[context.fileName],
  });
  const intake: SourceIntake = { blocks: [], warnings: [...warnings, ...parsed.warnings], ignored: result.ignored, rangeRequests: [] };
  if (result.rangeRequest) intake.rangeRequests.push(result.rangeRequest);
  else if (result.empty || !result.table) intake.warnings.push('O arquivo não tem dados para importar.');
  else {
    intake.blocks.push({
      id: context.prefix, title: context.fileName, kind: 'table',
      source: { fileName: context.fileName, sha256: context.sha256, location: 'arquivo' },
      warnings: result.table.warnings, rows: result.table.rows, addresses: result.table.addresses, raw: result.table.raw,
      flags: result.table.flags, merges: result.table.merges, headerRow: result.table.headerRow, range: result.table.range,
    });
  }
  return intake;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function pdfTableBlock(rows: string[][], source: SourceLocator, id: string, title: string, addresses: string[][]): SourceBlock {
  const width = Math.max(1, ...rows.map(row => row.length));
  const cells = rows.map(row => Array.from({ length: width }, (_, index) => {
    const value = stripControlCharacters(row[index] ?? '').text;
    return value.length > SOURCE_LIMITS.cell ? `${value.slice(0, SOURCE_LIMITS.cell - 1)}…` : value;
  }));
  return { id, title, kind: 'table', source, warnings: [], rows: cells, raw: cells.map(row => [...row]), flags: [], merges: [],
    addresses: cells.map((row, ri) => row.map((_, ci) => addresses[ri]?.[ci] ?? `linha visual ${ri + 1}, coluna ${ci + 1}`)) };
}

/** Suggest only consecutive, aligned multi-column text runs; always require visual review. */
export function blocksFromPdfPage(page: ExtractedPdfPage, source: SourceLocator, prefix: string): SourceBlock[] {
  if (page.needsVisualExtraction) return [];
  const lines: Array<Array<{ text: string; x: number; y: number; width: number }>> = [];
  for (const run of [...(page.runs ?? [])].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines.find(items => Math.abs(items[0].y - run.y) < 2);
    if (!line) { line = []; lines.push(line); }
    line.push(run);
  }
  const phrases = lines.map(line => {
    const result: typeof line = [];
    for (const run of line.sort((a, b) => a.x - b.x)) {
      const prior = result.at(-1);
      if (prior && run.x - (prior.x + prior.width) < 12 && run.x >= prior.x + prior.width - 1) {
        prior.text += (prior.text.endsWith(' ') || run.text.startsWith(' ') ? '' : ' ') + run.text;
        prior.width = run.x + run.width - prior.x;
      } else result.push({ ...run });
    }
    return result;
  });
  const blocks: SourceBlock[] = []; let prose: string[] = [];
  const flush = () => { if (!prose.length) return; blocks.push({ id: `${prefix}-${blocks.length}`, title: `${source.fileName} · ${source.location}`,
    kind: 'text', source, warnings: ['Texto extraído do PDF: confira a ordem de leitura, símbolos e notas.'], text: prose.join('\n') }); prose = []; };
  for (let i = 0; i < phrases.length;) {
    const first = phrases[i]; let end = i + 1;
    if (first.length >= 2 && first.length <= SOURCE_LIMITS.columns) {
      while (end < phrases.length && phrases[end].length === first.length &&
        phrases[end].every((value, ci) => Math.abs(value.x - first[ci].x) < 5) &&
        Math.abs(phrases[end - 1][0].y - phrases[end][0].y) <= 45) end++;
    }
    if (end - i >= 3) {
      flush();
      const rows = phrases.slice(i, end).map(line => line.map(value => value.text));
      const block = pdfTableBlock(rows, source, `${prefix}-${blocks.length}`, `${source.fileName} · tabela da ${source.location}`,
        rows.map((row, ri) => row.map((_, ci) => `linha visual ${i + ri + 1}, coluna ${ci + 1}`)));
      block.warnings.push('Tabela sugerida pela posição do texto. Confira cabeçalhos, colunas, unidades e notas no PDF original.');
      blocks.push(block); i = end;
    } else { prose.push(first.map(value => value.text).join(' ')); i++; }
  }
  flush();
  if (!blocks.length) blocks.push({ id: `${prefix}-0`, title: `${source.fileName} · ${source.location}`, kind: 'text', source,
    warnings: ['A disposição da página não pôde ser reconstruída. Confira a ordem do texto no original.'], text: page.text });
  return blocks;
}

const blockCharacters = (block: SourceBlock) => block.kind === 'text' ? block.text.length : block.kind === 'table' ? block.rows.flat().join('').length : 0;

function visualPageWarning(page: ExtractedPdfPage): string | undefined {
  const reasons = page.visualReasons ?? [];
  if (page.needsVisualExtraction) {
    return `Página ${page.number}: não tem texto que possa ser lido (parece escaneada ou desenhada). Precisa de leitura visual; nada foi tirado dela.`;
  }
  if (reasons.includes('large-image')) {
    return `Página ${page.number}: a maior parte da página é uma imagem (foto ou página escaneada) e só ${page.textLength} caracteres de texto foram lidos. ` +
      'Se a imagem tiver textos ou tabelas, eles precisam de leitura visual.';
  }
  if (reasons.includes('vector-graphics')) {
    return `Página ${page.number}: tem desenhos ou texto convertido em curvas, que não podem ser lidos como texto. Confira no original.`;
  }
  if (reasons.includes('unreadable-glyphs')) return `Página ${page.number}: parte do texto usa símbolos que não puderam ser lidos. Confira no original.`;
  return undefined;
}

const isPasswordError = (error: unknown) => error instanceof Error && (error.name === 'PasswordException' || /password/i.test(error.message));

async function readPdf(bytes: ArrayBuffer, context: ReadContext): Promise<SourceIntake> {
  const from = context.options.pdfPages?.from ?? 1;
  const to = context.options.pdfPages?.to ?? from + SOURCE_LIMITS.pdfPages - 1;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) fail('SOURCE_PDF_PAGES_INVALID');
  let pdf;
  try {
    pdf = await extractPdfText(context.fileName, bytes, { firstPage: from, maxPages: Math.min(SOURCE_LIMITS.pdfPages, to - from + 1), visualTriage: true });
  } catch (error) {
    if (isPasswordError(error)) fail('SOURCE_PASSWORD_PROTECTED');
    fail('SOURCE_PDF_INVALID');
  }
  const intake: SourceIntake = { blocks: [], warnings: [], ignored: [], rangeRequests: [] };
  const pagesRead: number[] = [], visual: number[] = [];
  let characters = 0, stoppedAt: number | undefined;
  for (const page of pdf!.pages) {
    const source: SourceLocator = { fileName: context.fileName, sha256: context.sha256, location: `página ${page.number}`, page: page.number };
    const pageBlocks = blocksFromPdfPage(page, source, `${context.prefix}-p${page.number}`);
    const pageCharacters = pageBlocks.reduce((total, block) => total + blockCharacters(block), 0);
    if (pagesRead.length && (intake.blocks.length + pageBlocks.length > SOURCE_LIMITS.blocks || characters + pageCharacters > SOURCE_LIMITS.characters)) {
      stoppedAt = page.number;
      break;
    }
    pagesRead.push(page.number);
    const warning = visualPageWarning(page);
    if (warning) { intake.warnings.push(warning); visual.push(page.number); }
    if (warning && pageBlocks.length) pageBlocks.forEach(block => block.warnings.push(warning));
    if (page.textLength > page.text.length) intake.warnings.push(`Página ${page.number}: o texto é muito longo e foi lido só em parte.`);
    // The first page always enters, cut to the budget if needed.
    for (const block of pageBlocks) {
      if (intake.blocks.length >= SOURCE_LIMITS.blocks) break;
      intake.blocks.push(block);
    }
    characters += pageCharacters;
  }
  const pageCount = pdf!.pageCount;
  const read = new Set(pagesRead);
  const pagesNotRead = Array.from({ length: pageCount }, (_, index) => index + 1).filter(number => !read.has(number));
  if (!pagesRead.length && from > pageCount) {
    intake.warnings.push(`Este PDF tem só ${pageCount} ${pageCount === 1 ? 'página' : 'páginas'}; escolha páginas de 1 a ${pageCount}.`);
  } else if (pagesNotRead.length) {
    const reason = stoppedAt !== undefined ? ` A leitura parou na página ${stoppedAt} porque o conteúdo passou do tamanho de uma importação.` : '';
    intake.warnings.push(`Foram lidas as páginas ${formatNumberList(pagesRead)} de ${pageCount}. Não foram lidas: ${formatNumberList(pagesNotRead)}.${reason} ` +
      'Para ler as outras, escolha o intervalo de páginas.');
    intake.ignored.push({ kind: 'pages', label: formatNumberList(pagesNotRead), reason: stoppedAt !== undefined ? 'budget' : 'not-chosen',
      message: `Páginas ${formatNumberList(pagesNotRead)} não lidas.` });
  }
  intake.pdf = { pageCount, pagesRead, pagesNotRead, pagesNeedingVisualReading: visual };
  return intake;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function isHeic(bytes: ArrayBuffer) {
  if (bytes.byteLength < 12) return false;
  const head = new TextDecoder('ascii').decode(new Uint8Array(bytes, 4, 8));
  return head.startsWith('ftyp') && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(head.slice(4));
}

function readPhoto(file: File, bytes: ArrayBuffer, context: ReadContext): SourceIntake {
  const mime = sniffImageMime(bytes);
  if (!mime) fail(isHeic(bytes) ? 'SOURCE_IMAGE_HEIC' : 'SOURCE_IMAGE_INVALID');
  const size = sniffImageDimensions(bytes);
  const warnings = ['A foto mostra o produto, mas não comprova especificações técnicas.'];
  if (size && Math.max(size.widthPx, size.heightPx) < MIN_PRINT_PHOTO_PX) {
    warnings.push(`A foto tem ${size.widthPx} × ${size.heightPx} pixels e pode sair borrada na impressão. Se tiver, use uma foto maior (pelo menos ${MIN_PRINT_PHOTO_PX} pixels no lado maior).`);
  }
  return { blocks: [{ id: context.prefix, title: context.fileName, kind: 'image', file, mime: mime!, widthPx: size?.widthPx, heightPx: size?.heightPx,
    source: { fileName: context.fileName, sha256: context.sha256, location: 'foto' }, warnings }], warnings: [], ignored: [], rangeRequests: [] };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const PHOTO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'heic', 'heif']);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'pages', 'numbers', 'key']);
const extensionOf = (name: string) => name.toLowerCase().split('.').at(-1) ?? '';
const validName = (name: string) => !!name && name.length <= 255 && !stripControlCharacters(name).removed;
const byteLimit = (name: string) => extensionOf(name) === 'pdf' ? SOURCE_LIMITS.pdfBytes : SOURCE_LIMITS.bytes;

async function readSourceBytes(file: File, bytes: ArrayBuffer, sha256: string, index: number, options: SourceReadOptions): Promise<SourceIntake> {
  const context: ReadContext = { fileName: file.name, sha256, prefix: `source-${index}-${sha256.slice(0, 10)}`, options };
  const extension = extensionOf(file.name);
  if (PHOTO_EXTENSIONS.has(extension)) return readPhoto(file, bytes, context);
  if (extension === 'csv') return readDelimited(bytes, context);
  if (extension === 'tsv' || extension === 'txt') return readDelimited(bytes, context, '\t');
  if (extension === 'xlsx' || extension === 'xlsm') return readWorkbook(bytes, context);
  if (extension === 'xls') {
    // An .xlsx renamed to .xls still opens; a real .xls is the old binary format.
    if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return readWorkbook(bytes, context);
    fail('SOURCE_LEGACY_SPREADSHEET');
  }
  if (extension === 'pdf') return readPdf(bytes, context);
  if (OFFICE_EXTENSIONS.has(extension)) fail('SOURCE_OFFICE_DOCUMENT');
  return fail('SOURCE_FORMAT_UNSUPPORTED');
}

export async function readSourceFile(file: File, index = 0, options: SourceReadOptions = {}): Promise<SourceIntake> {
  if (!validName(file.name) || file.size < 1 || file.size > byteLimit(file.name)) fail('SOURCE_FILE_LIMIT');
  const bytes = await bytesOf(file);
  return readSourceBytes(file, bytes, await digest(bytes), index, options);
}

export type SourceFileStatus = 'ready' | 'needs-help' | 'duplicate' | 'error' | 'skipped';
export interface SourceFileResult {
  fileName: string;
  status: SourceFileStatus;
  sha256?: string;
  intake?: SourceIntake;
  /** For duplicates: the earlier file with the same content. */
  duplicateOf?: string;
  code?: SourceErrorCode | 'SOURCE_UNKNOWN';
  message?: string;
}

export function needsHelp(intake: SourceIntake): boolean {
  return !intake.blocks.length || intake.rangeRequests.length > 0 || (intake.pdf?.pagesNeedingVisualReading.length ?? 0) > 0 ||
    intake.blocks.some(block => block.kind === 'table' && block.flags.length > 0);
}

/**
 * Reads a batch one file at a time: a bad file becomes an error entry and never stops the others;
 * identical files (same SHA-256) are read once; at most {@link SOURCE_LIMITS.files} files.
 */
export async function readSources(files: readonly File[], options: SourceReadOptions = {}): Promise<SourceFileResult[]> {
  const results: SourceFileResult[] = [];
  const seen = new Map<string, string>();
  for (const [index, file] of files.entries()) {
    if (index >= SOURCE_LIMITS.files) {
      results.push({ fileName: file.name, status: 'skipped',
        message: `Envie no máximo ${SOURCE_LIMITS.files} arquivos por vez. Este arquivo não foi lido; envie-o em seguida.` });
      continue;
    }
    try {
      if (!validName(file.name) || file.size < 1 || file.size > byteLimit(file.name)) fail('SOURCE_FILE_LIMIT');
      const bytes = await bytesOf(file);
      const sha256 = await digest(bytes);
      const earlier = seen.get(sha256);
      if (earlier !== undefined) {
        results.push({ fileName: file.name, status: 'duplicate', sha256, duplicateOf: earlier,
          message: `Este arquivo é igual a “${earlier}” e não foi lido de novo.` });
        continue;
      }
      seen.set(sha256, file.name);
      const intake = await readSourceBytes(file, bytes, sha256, index, options);
      results.push({ fileName: file.name, status: needsHelp(intake) ? 'needs-help' : 'ready', sha256, intake });
    } catch (error) {
      results.push({ fileName: file.name, status: 'error',
        code: error instanceof SourceIntakeError ? error.code : 'SOURCE_UNKNOWN', message: sourceErrorMessage(error) });
    }
  }
  return results;
}

export function sourceErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const detail = error instanceof SourceIntakeError ? error.detail : {};
  const sheet = detail.sheet ? ` (aba “${detail.sheet}”)` : '';
  switch (code) {
    case 'SOURCE_PASSWORD_PROTECTED':
      return 'Este arquivo está protegido por senha ou por um rótulo de confidencialidade. Abra no programa de origem, remova a senha, salve uma cópia e envie de novo.';
    case 'SOURCE_LEGACY_SPREADSHEET':
      return 'Esta planilha está no formato antigo do Excel (.xls). Abra no Excel, use “Salvar como” e escolha “Pasta de Trabalho do Excel (.xlsx)”.';
    case 'SOURCE_OFFICE_DOCUMENT':
      return 'Documentos do Word, PowerPoint ou LibreOffice ainda não são lidos. Salve como PDF (ou a planilha como .xlsx) e envie de novo.';
    case 'SOURCE_IMAGE_HEIC':
      return 'Esta foto está no formato HEIC do iPhone, que ainda não é aceito. Envie a foto em JPG (no iPhone: Ajustes › Câmera › Formatos › Mais Compatível).';
    case 'SOURCE_IMAGE_INVALID':
      return 'Esta foto não abriu: o arquivo não é PNG, JPG ou WebP de verdade, mesmo com essa extensão. Exporte a foto de novo em JPG.';
    case 'SOURCE_XLSX_INVALID':
      return 'A planilha parece danificada. Abra no Excel, salve de novo como .xlsx e envie outra vez.';
    case 'SOURCE_XLSX_LIMIT':
      return 'A planilha é grande demais para ler aqui. Copie só as abas necessárias para um arquivo novo e envie esse arquivo.';
    case 'SOURCE_TABLE_LIMIT':
      return `A tabela é grande demais para ler inteira${sheet}. Escolha um intervalo de até ${SOURCE_LIMITS.rows} linhas e ${SOURCE_LIMITS.columns} colunas.`;
    case 'SOURCE_TEXT_LIMIT':
      return 'O arquivo está vazio ou não tem texto que possa ser lido.';
    case 'SOURCE_CSV_MALFORMED':
      return detail.line
        ? `O arquivo tem aspas abertas na linha ${detail.line} que nunca fecham. Abra no Excel, salve de novo como CSV e tente outra vez.`
        : 'O arquivo tem aspas que nunca fecham. Abra no Excel, salve de novo como CSV e tente outra vez.';
    case 'SOURCE_PDF_INVALID':
      return 'O PDF não abriu. Confira se ele abre normalmente no leitor de PDF e envie de novo.';
    case 'SOURCE_PDF_PAGES_INVALID':
      return 'O intervalo de páginas não é válido. Escolha, por exemplo, da página 1 até a 30.';
    case 'SOURCE_FILE_LIMIT':
      return 'O arquivo está vazio, tem um nome inválido ou é grande demais. Planilhas e fotos: até 20 MB; PDF: até 50 MB.';
    case 'SOURCE_FORMAT_UNSUPPORTED':
      return 'Este tipo de arquivo não é lido. Envie PDF, planilha do Excel (.xlsx), CSV ou fotos em JPG, PNG ou WebP.';
    case 'SOURCE_FORMULA_NO_RESULT':
      return 'Uma fórmula não tem resultado salvo. Abra a planilha no Excel, salve e envie novamente.';
    case 'SOURCE_FORMULA_ERROR':
      return 'A planilha contém erro de fórmula. Corrija no Excel antes de importar.';
    default:
      return 'Não foi possível ler este arquivo. Confira se ele abre normalmente e envie de novo.';
  }
}
