/**
 * Turns one spreadsheet-like grid (an XLSX sheet or a CSV file) into a reviewable table:
 * used range only, hidden and internal data left out by default (and listed), limits applied
 * after those exclusions, per-cell marks instead of whole-file failures, merges kept as spans.
 * Pure: no DOM and no ExcelJS import (the worksheet adapter receives ExcelJS objects).
 */
import type { Cell, CellValue, Worksheet } from 'exceljs';
import {
  excelSerialToDate, formatExcelBoolean, formatExcelDateValue, formatExcelNumber, isCurrencyFormat, isDateFormat, type DisplayLocale,
} from './excel-display-format';

export const TABLE_LIMITS = { rows: 150, columns: 10, cell: 1200, characters: 120_000 } as const;
/** Memory guard while reading a grid, before exclusions. */
export const GRID_PARSE_LIMITS = { rows: 100_000, columns: 1_000 } as const;

export type SourceCellFlagKind =
  | 'formula-error' | 'formula-no-result' | 'format-approximate' | 'truncated' | 'control-characters' | 'unsupported-value';
export interface SourceCellFlag {
  /** 0-based position in the returned table. */
  readonly row: number;
  readonly column: number;
  /** Original address, e.g. "Specs!B7" or "B7" for CSV. */
  readonly address: string;
  readonly kind: SourceCellFlagKind;
  readonly message: string;
}
/** A merged region in returned-table coordinates (0-based); covered cells hold ''. */
export interface SourceMerge { readonly row: number; readonly column: number; readonly rowSpan: number; readonly columnSpan: number }
export type SourceIgnoredReason = 'hidden' | 'internal' | 'empty' | 'not-chosen' | 'sheet-limit' | 'budget';
export interface SourceIgnored {
  readonly kind: 'sheet' | 'column' | 'rows' | 'pages';
  readonly sheet?: string;
  /** Column letter, row list or sheet name, as the person sees it in Excel. */
  readonly label: string;
  readonly reason: SourceIgnoredReason;
  readonly message: string;
}
export interface SourceRangeRequest {
  /** Sheet name, or the file name for CSV. Pass the chosen range in `ranges[sheet]`. */
  readonly sheet: string;
  /** Where the data is, e.g. "A1:L74" ('' when unknown). */
  readonly usedRange: string;
  /** A range that fits one table, to offer first ('' when unknown). */
  readonly suggestedRange: string;
  /** Rows and columns with data (after exclusions for a big table; the used range otherwise; 0 when unknown). */
  readonly rows: number;
  readonly columns: number;
  readonly message: string;
}

export interface GridCell {
  readonly text: string;
  readonly raw: string;
  readonly flag?: SourceCellFlagKind;
  /** A number in Excel (not a date). */
  readonly numeric?: boolean;
  /** A number Excel shows as money (R$, US$, €…). */
  readonly currency?: boolean;
}
export interface GridMergeBox { top: number; left: number; bottom: number; right: number }
export interface SourceGrid {
  /** Sheet name, or file name for CSV. */
  readonly name: string;
  readonly kind: 'sheet' | 'file';
  /** 1-based row -> column -> cell; only cells with content or a mark. */
  readonly cells: Map<number, Map<number, GridCell>>;
  readonly hiddenRows: ReadonlySet<number>;
  readonly hiddenColumns: ReadonlySet<number>;
  readonly merges: readonly GridMergeBox[];
  /** Sheet-level notes (e.g. formulas use the values saved by Excel). */
  readonly notes: readonly string[];
}

export interface GridTable {
  readonly rows: string[][];
  readonly raw: string[][];
  readonly addresses: string[][];
  readonly flags: SourceCellFlag[];
  readonly merges: SourceMerge[];
  readonly headerRow?: number;
  readonly range: string;
  readonly warnings: string[];
  readonly characters: number;
}
export interface GridTableResult {
  readonly table?: GridTable;
  readonly rangeRequest?: SourceRangeRequest;
  readonly ignored: SourceIgnored[];
  readonly empty: boolean;
}
export interface GridTableOptions {
  readonly includeHidden?: boolean;
  readonly includeInternal?: boolean;
  /** A1-style range chosen by the person, e.g. "A1:J150". */
  readonly range?: string;
}

export const columnLabel = (index: number) => {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
};
const columnNumber = (letters: string) => [...letters.toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);

export function parseA1Range(range: string): GridMergeBox | null {
  const match = /^\s*\$?([A-Za-z]{1,3})\$?(\d{1,7})\s*(?::\s*\$?([A-Za-z]{1,3})\$?(\d{1,7}))?\s*$/.exec(range);
  if (!match) return null;
  const [, c1, r1, c2 = c1, r2 = r1] = match;
  const a = { row: Number(r1), col: columnNumber(c1) }, b = { row: Number(r2), col: columnNumber(c2) };
  if (a.row < 1 || b.row < 1) return null;
  return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row), left: Math.min(a.col, b.col), right: Math.max(a.col, b.col) };
}
export const rangeLabel = (box: GridMergeBox) => `${columnLabel(box.left - 1)}${box.top}:${columnLabel(box.right - 1)}${box.bottom}`;
/** The top-left part of `box` that fits one table. */
export const fitBox = (box: GridMergeBox): GridMergeBox => ({ top: box.top, left: box.left,
  bottom: Math.min(box.bottom, box.top + TABLE_LIMITS.rows - 1), right: Math.min(box.right, box.left + TABLE_LIMITS.columns - 1) });
const areaOf = (name: string, kind: SourceGrid['kind']) => kind === 'sheet' ? `da aba “${name}”` : `do arquivo “${name}”`;

/**
 * A range the person chose that cannot be read, because it is not valid or has no data,
 * with where the data actually is (`used`) so the range picker can offer it.
 */
export function chosenRangeProblem(name: string, kind: SourceGrid['kind'], range: string, problem: 'invalid' | 'empty', used?: GridMergeBox): SourceRangeRequest {
  const area = areaOf(name, kind);
  const where = used ? ` Os dados ficam em ${rangeLabel(used)}.` : '';
  return { sheet: name, usedRange: used ? rangeLabel(used) : '', suggestedRange: used ? rangeLabel(fitBox(used)) : '',
    rows: used ? used.bottom - used.top + 1 : 0, columns: used ? used.right - used.left + 1 : 0,
    message: problem === 'invalid' ? `O intervalo “${range}” ${area} não é válido. Use o formato A1:J150.${where}`
      : `O intervalo ${range} ${area} está vazio.${where}` };
}

/** Where a worksheet has values (style-only cells do not count), from ExcelJS's own dimensions. */
export function worksheetUsedBox(sheet: Pick<Worksheet, 'dimensions'>): GridMergeBox | undefined {
  try {
    const model = (sheet.dimensions as unknown as { model?: Partial<GridMergeBox> } | undefined)?.model;
    if (!model?.top || !model.left || !model.bottom || !model.right) return undefined;
    return { top: model.top, left: model.left, bottom: model.bottom, right: model.right };
  } catch {
    return undefined;
  }
}

/** "5, 7 a 9" — row or page numbers the way a person reads them. */
export function formatNumberList(values: readonly number[], max = 12): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(end > index ? `${sorted[index]} a ${sorted[end]}` : String(sorted[index]));
    index = end + 1;
  }
  return parts.length > max ? `${parts.slice(0, max).join(', ')} e outras` : parts.join(', ');
}

const SHEET_AREA = (grid: SourceGrid) => areaOf(grid.name, grid.kind);
const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().trim();

/** Sheets that hold logs, helper lists, price configurators or drafts, never catalog content. */
export const INTERNAL_SHEET_PATTERN = /^(access[ _-]?logs?|helper|configurador|original_.*|pending[ _-]?items)$/i;
/** Column headers for prices, currencies, margins, contacts and browser data. */
export const INTERNAL_COLUMN_PATTERN =
  /(^|[^a-z0-9])(prices?|precos?|usd|eur|euros?|brl|r\$|us\$|valor(es)? unitarios?|mark-?up|e-?mails?|user[ _-]?agent)([^a-z0-9]|$)/;
/** Costs only as the whole header ("Custo", "Custo interno (R$)"), so "Custo-benefício" stays. */
const COST_HEADER_PATTERN =
  /^((custos?|costs?)( (internos?|internal|unitarios?|unit|totais|total|de compra|medios?))?|(unit|internal|total) costs?)( ?\([^)]*\))?$/;
/** Longest label treated as a column or group header (a title or a sentence is longer). */
const MAX_FALLBACK_HEADER = 30;
export const isInternalSheetName = (name: string) => INTERNAL_SHEET_PATTERN.test(name.trim());
export const isInternalColumnHeader = (header: string) => {
  const label = normalizeLabel(header).replace(/\s+/g, ' ');
  return INTERNAL_COLUMN_PATTERN.test(label) || COST_HEADER_PATTERN.test(label);
};
/** Money typed as text (CSV, or a text cell): "R$ 1.000,00", "US$ 250", "1.300 €". */
const MONEY_TEXT = /^\s*((r\$|us\$|u\$s|\$|€|£|¥|brl|usd|eur)\s?-?\d[\d.,]*|-?\d[\d.,]*\s?(€|r\$|brl|usd|eur))\s*$/i;
const NUMBER_TEXT = /^\s*[-+]?\d[\d.,]*\s*%?\s*$/;

const FLAG_SUMMARY: Record<SourceCellFlagKind, (count: number) => string> = {
  'formula-error': count => count === 1 ? '1 célula com erro de fórmula' : `${count} células com erro de fórmula`,
  'formula-no-result': count => count === 1 ? '1 fórmula sem resultado salvo' : `${count} fórmulas sem resultado salvo`,
  'format-approximate': count => count === 1 ? '1 valor com formato especial' : `${count} valores com formato especial`,
  truncated: count => count === 1 ? '1 célula com texto longo demais (cortado em 1.200 caracteres)' : `${count} células com texto longo demais (cortado em 1.200 caracteres)`,
  'control-characters': count => count === 1 ? '1 célula com caracteres invisíveis removidos' : `${count} células com caracteres invisíveis removidos`,
  'unsupported-value': count => count === 1 ? '1 célula com conteúdo não reconhecido' : `${count} células com conteúdo não reconhecido`,
};
const FLAG_ADVICE: Record<SourceCellFlagKind, string> = {
  'formula-error': 'corrija no Excel ou confirme o valor antes de usar.',
  'formula-no-result': 'abra no Excel, salve e envie de novo.',
  'format-approximate': 'confira se o valor aparece igual no Excel.',
  truncated: 'confira o texto completo no original.',
  'control-characters': 'confira o texto no original.',
  'unsupported-value': 'confira no original.',
};
function flagMessage(kind: SourceCellFlagKind, cell: string, area: string, raw: string) {
  const where = `${cell} ${area}`;
  if (kind === 'formula-error') return `Erro de fórmula (${raw || 'erro'}) na célula ${where}.`;
  if (kind === 'formula-no-result') return `A fórmula da célula ${where} não tem resultado salvo.`;
  if (kind === 'format-approximate') return `O valor da célula ${where} usa um formato especial; confira como ele aparece no Excel.`;
  if (kind === 'truncated') return `O texto da célula ${where} passa de 1.200 caracteres e foi cortado.`;
  if (kind === 'control-characters') return `Caracteres invisíveis foram removidos da célula ${where}.`;
  return `O conteúdo da célula ${where} não foi reconhecido.`;
}

const hasContent = (cell: GridCell | undefined) => !!cell && (cell.text.trim() !== '' || !!cell.flag);

/** Header row: among the first 10 kept rows, the first with at least half of the columns filled by single-column cells. */
function detectHeaderRow(grid: SourceGrid, rows: readonly number[], columns: readonly number[], mergedSlaves: ReadonlySet<string>, wideMasters: ReadonlySet<string>) {
  for (let index = 0; index < Math.min(10, rows.length); index++) {
    const row = rows[index];
    const filled = columns.filter(column => {
      const key = `${row}:${column}`;
      return !mergedSlaves.has(key) && !wideMasters.has(key) && hasContent(grid.cells.get(row)?.get(column));
    }).length;
    if (filled >= 2 && filled >= Math.ceil(columns.length / 2)) return index;
  }
  return undefined;
}

export function buildGridTable(grid: SourceGrid, options: GridTableOptions = {}): GridTableResult {
  const ignored: SourceIgnored[] = [];
  const area = SHEET_AREA(grid);
  const cellAt = (row: number, column: number) => grid.cells.get(row)?.get(column);
  // 1. Used range: cells with a value (style-only cells never reach the grid), plus merges anchored on them.
  let bounds: GridMergeBox | undefined;
  const grow = (top: number, left: number, bottom = top, right = left) => {
    bounds = bounds ? { top: Math.min(bounds.top, top), left: Math.min(bounds.left, left), bottom: Math.max(bounds.bottom, bottom), right: Math.max(bounds.right, right) }
      : { top, left, bottom, right };
  };
  for (const [row, columns] of grid.cells) for (const [column, cell] of columns) if (hasContent(cell)) grow(row, column);
  for (const merge of grid.merges) if (hasContent(cellAt(merge.top, merge.left))) grow(merge.top, merge.left, merge.bottom, merge.right);
  if (!bounds) return { ignored, empty: true };
  let box: GridMergeBox = bounds;
  if (options.range !== undefined) {
    const chosen = parseA1Range(options.range);
    const request = (problem: 'invalid' | 'empty'): GridTableResult => ({ ignored, empty: false,
      rangeRequest: chosenRangeProblem(grid.name, grid.kind, options.range!, problem, box) });
    if (!chosen) return request('invalid');
    const inside = { top: Math.max(box.top, chosen.top), left: Math.max(box.left, chosen.left),
      bottom: Math.min(box.bottom, chosen.bottom), right: Math.min(box.right, chosen.right) };
    if (inside.top > inside.bottom || inside.left > inside.right) return request('empty');
    box = inside;
  }
  // 2. Merge lookups.
  const mergeAt = new Map<string, GridMergeBox>();
  const mergedSlaves = new Set<string>(), wideMasters = new Set<string>();
  for (const merge of grid.merges) {
    if (merge.right > merge.left) wideMasters.add(`${merge.top}:${merge.left}`);
    // Only the part inside the chosen box matters (a merge can be huge).
    for (let row = Math.max(merge.top, box.top); row <= Math.min(merge.bottom, box.bottom); row++) for (let column = Math.max(merge.left, box.left); column <= Math.min(merge.right, box.right); column++) {
      mergeAt.set(`${row}:${column}`, merge);
      if (row !== merge.top || column !== merge.left) mergedSlaves.add(`${row}:${column}`);
    }
  }
  const occupied = (row: number, column: number) => {
    if (hasContent(cellAt(row, column))) return true;
    const merge = mergeAt.get(`${row}:${column}`);
    return !!merge && hasContent(cellAt(merge.top, merge.left));
  };
  // 3. Hidden rows and columns stay out unless asked; then drop what has nothing in it.
  let rows: number[] = [], columns: number[] = [];
  const hiddenRows: number[] = [], hiddenColumns: number[] = [];
  for (let row = box.top; row <= box.bottom; row++) (grid.hiddenRows.has(row) && !options.includeHidden ? hiddenRows : rows).push(row);
  for (let column = box.left; column <= box.right; column++) (grid.hiddenColumns.has(column) && !options.includeHidden ? hiddenColumns : columns).push(column);
  const allColumns = Array.from({ length: box.right - box.left + 1 }, (_, index) => box.left + index);
  const trim = () => {
    columns = columns.filter(column => rows.some(row => occupied(row, column)));
    const rowUsed = (row: number) => columns.some(column => occupied(row, column));
    // Rows whose data was only in left-out columns go too; rows already blank in Excel keep the spacing.
    rows = rows.filter(row => rowUsed(row) || !allColumns.some(column => occupied(row, column)));
    while (rows.length && !rowUsed(rows[0])) rows.shift();
    while (rows.length && !rowUsed(rows[rows.length - 1])) rows.pop();
  };
  trim();
  const headerIndex = detectHeaderRow(grid, rows, columns, mergedSlaves, wideMasters);
  /** The header text of a column; a header cell covered by a merge ("Preço" over C1:D1, or down F3:F4) takes the merge's text. */
  const headerOf = (column: number) => {
    if (headerIndex === undefined) return '';
    const row = rows[headerIndex];
    const own = cellAt(row, column)?.text.trim();
    if (own) return own;
    const merge = mergeAt.get(`${row}:${column}`);
    return merge ? cellAt(merge.top, merge.left)?.text.trim() ?? '' : '';
  };
  const describe = (column: number) => {
    const header = headerOf(column);
    return header ? `A coluna ${columnLabel(column - 1)} (“${header}”)` : `A coluna ${columnLabel(column - 1)}`;
  };
  const hiddenWithData = hiddenRows.filter(row => allColumns.some(column => occupied(row, column)));
  if (hiddenWithData.length) {
    const one = hiddenWithData.length === 1, list = formatNumberList(hiddenWithData);
    ignored.push({ kind: 'rows', sheet: grid.name, label: list, reason: 'hidden',
      message: `${one ? 'A linha' : 'As linhas'} ${list} ${area} não ${one ? 'foi importada' : 'foram importadas'}: ${one ? 'estava oculta' : 'estavam ocultas'} no Excel.` });
  }
  for (const column of hiddenColumns) {
    if (!rows.some(row => occupied(row, column))) continue;
    ignored.push({ kind: 'column', sheet: grid.name, label: columnLabel(column - 1), reason: 'hidden',
      message: `${describe(column)} ${area} não foi importada: estava oculta no Excel.` });
  }
  // 4. Internal columns (prices, currencies, e-mail…), judged by the column's header labels and by money formats.
  const headerRowNumber = headerIndex === undefined ? undefined : rows[headerIndex];
  if (!options.includeInternal) {
    type Internal = { label?: string; why: 'header' | 'group' | 'money' };
    const firstColumn = columns[0];
    // Group headers are merges over some columns (never the first one, Modelo or Código, which a title covers),
    // ending in the two filled rows right above the header row ("Preços" over Y17 | Y18).
    const groupRows = headerIndex === undefined ? [] : rows.slice(0, headerIndex).filter(row => columns.some(column => occupied(row, column))).slice(-2);
    const groupMerges = grid.merges.filter(merge => merge.right > merge.left && merge.left > firstColumn && groupRows.includes(merge.bottom));
    // The first 200 data rows are enough to tell a money column (and keep a huge sheet fast).
    const dataRows = (headerIndex === undefined ? rows : rows.slice(headerIndex + 1)).slice(0, 200);
    /** Most numbers of the column are shown as money (R$, US$, €…): a price column whatever its header says. */
    const showsMoney = (column: number) => {
      let money = 0, numbers = 0;
      for (const row of dataRows) {
        const cell = cellAt(row, column);
        if (!cell?.text.trim()) continue;
        const isMoney = !!cell.currency || MONEY_TEXT.test(cell.text);
        if (isMoney) money++;
        if (isMoney || cell.numeric || NUMBER_TEXT.test(cell.text)) numbers++;
      }
      return money > 0 && money * 2 > numbers;
    };
    const internalOf = (column: number): Internal | undefined => {
      if (headerIndex === undefined) {
        // No clear header row: the first filled cell of the column (in the first 10 rows) acts as its header
        // when it is short like a header ("Preço"), not a title or a sentence that mentions prices.
        const first = rows.slice(0, 10).find(row => !mergedSlaves.has(`${row}:${column}`) && !wideMasters.has(`${row}:${column}`) &&
          hasContent(cellAt(row, column)));
        const label = first === undefined ? '' : cellAt(first, column)?.text.trim() ?? '';
        if (label && label.length <= MAX_FALLBACK_HEADER && isInternalColumnHeader(label)) return { label, why: 'header' };
        return showsMoney(column) ? { why: 'money' } : undefined;
      }
      const header = headerOf(column);
      if (header && isInternalColumnHeader(header)) return { label: header, why: 'header' };
      for (const merge of groupMerges) {
        if (merge.left > column || merge.right < column) continue;
        const label = cellAt(merge.top, merge.left)?.text.trim() ?? '';
        if (label && label.length <= MAX_FALLBACK_HEADER && isInternalColumnHeader(label)) return { label, why: 'group' };
      }
      return showsMoney(column) ? { why: 'money' } : undefined;
    };
    columns = columns.filter(column => {
      const internal = internalOf(column);
      if (!internal) return true;
      const reason = internal.why === 'group' ? `está no grupo “${internal.label}”, que parece ser preço ou dado interno`
        : internal.why === 'money' ? 'os valores estão em dinheiro (como R$ ou US$) e parecem ser preço'
          : 'parece ser preço ou dado interno';
      const subject = headerOf(column) || internal.why !== 'header' ? describe(column) : `A coluna ${columnLabel(column - 1)} (“${internal.label}”)`;
      ignored.push({ kind: 'column', sheet: grid.name, label: columnLabel(column - 1), reason: 'internal',
        message: `${subject} ${area} não foi importada: ${reason}.` });
      return false;
    });
    trim();
  }
  if (!rows.length || !columns.length) return { ignored, empty: true };
  const headerPosition = headerRowNumber === undefined ? -1 : rows.indexOf(headerRowNumber);
  const header = headerPosition >= 0 ? headerPosition : undefined;
  const used = { top: rows[0], bottom: rows[rows.length - 1], left: columns[0], right: columns[columns.length - 1] };
  // 5. Limits, after exclusions: a big table asks for a range instead of failing the whole file.
  if (rows.length > TABLE_LIMITS.rows || columns.length > TABLE_LIMITS.columns) {
    const suggested = { top: used.top, left: used.left,
      bottom: rows[Math.min(rows.length, TABLE_LIMITS.rows) - 1], right: columns[Math.min(columns.length, TABLE_LIMITS.columns) - 1] };
    const subject = grid.kind === 'sheet' ? `A aba “${grid.name}”` : `O arquivo “${grid.name}”`;
    return { ignored, empty: false, rangeRequest: { sheet: grid.name, usedRange: rangeLabel(used), suggestedRange: rangeLabel(suggested),
      rows: rows.length, columns: columns.length,
      message: `${subject} tem ${rows.length} linhas e ${columns.length} colunas com dados (${rangeLabel(used)}). ` +
        `Cada tabela aceita até ${TABLE_LIMITS.rows} linhas e ${TABLE_LIMITS.columns} colunas: escolha um intervalo menor, por exemplo ${rangeLabel(suggested)}.` } };
  }
  // 6. Cells, marks and spans.
  const prefix = grid.kind === 'sheet' ? `${grid.name}!` : '';
  const flags: SourceCellFlag[] = [], merges: SourceMerge[] = [];
  const table = rows.map(() => columns.map(() => ''));
  const raw = rows.map(() => columns.map(() => ''));
  const addresses = rows.map(row => columns.map(column => `${prefix}${columnLabel(column - 1)}${row}`));
  const placed = new Set<GridMergeBox>();
  let characters = 0;
  const put = (ri: number, ci: number, row: number, column: number) => {
    const cell = cellAt(row, column);
    addresses[ri][ci] = `${prefix}${columnLabel(column - 1)}${row}`;
    if (!cell) return;
    let text = cell.text, flag = cell.flag;
    if (text.length > TABLE_LIMITS.cell) { text = `${text.slice(0, TABLE_LIMITS.cell - 1)}…`; flag ??= 'truncated'; }
    table[ri][ci] = text; raw[ri][ci] = cell.raw; characters += text.length;
    if (flag) flags.push({ row: ri, column: ci, address: addresses[ri][ci], kind: flag,
      message: flagMessage(flag, `${columnLabel(column - 1)}${row}`, area, cell.raw) });
  };
  rows.forEach((row, ri) => columns.forEach((column, ci) => {
    const merge = mergeAt.get(`${row}:${column}`);
    if (!merge) return put(ri, ci, row, column);
    if (placed.has(merge)) return;
    placed.add(merge);
    // The merge's value goes to its first visible cell; the other covered cells stay empty.
    const spanRows = rows.filter(value => value >= merge.top && value <= merge.bottom).length;
    const spanColumns = columns.filter(value => value >= merge.left && value <= merge.right).length;
    put(ri, ci, merge.top, merge.left);
    if (spanRows * spanColumns > 1) merges.push({ row: ri, column: ci, rowSpan: spanRows, columnSpan: spanColumns });
  }));
  const warnings = [...grid.notes];
  for (const kind of Object.keys(FLAG_SUMMARY) as SourceCellFlagKind[]) {
    const marked = flags.filter(flag => flag.kind === kind);
    if (!marked.length) continue;
    const cells = marked.slice(0, 6).map(flag => flag.address.slice(prefix.length)).join(', ') + (marked.length > 6 ? ' e outras' : '');
    warnings.push(`${FLAG_SUMMARY[kind](marked.length)} ${area} (${cells}): ${FLAG_ADVICE[kind]}`);
  }
  if (options.includeHidden && (grid.hiddenRows.size || grid.hiddenColumns.size)) {
    warnings.push(`A tabela ${area} inclui linhas ou colunas que estavam ocultas no Excel.`);
  }
  return { ignored, empty: false, table: { rows: table, raw, addresses, flags, merges, headerRow: header,
    range: rangeLabel(used), warnings, characters } };
}

/** C0 controls except tab, newline and carriage return, plus DEL. */
export function stripControlCharacters(value: string): { text: string; removed: boolean } {
  let removed = false, text = '';
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) { removed = true; continue; }
    text += value[index];
  }
  return removed ? { text, removed } : { text: value, removed };
}

type FormulaLike = { formula?: string; sharedFormula?: string; result?: unknown };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function richTextOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isObject(value) && Array.isArray(value.richText)) {
    return value.richText.map(part => isObject(part) && typeof part.text === 'string' ? part.text : '').join('');
  }
  return undefined;
}

/** Excel value -> display text + raw provenance + optional mark. Never throws for a single cell. */
export function gridCellFromExcel(cell: Pick<Cell, 'value' | 'numFmt'>, locale: DisplayLocale, date1904 = false): GridCell & { formula: boolean } {
  let value: unknown = cell.value as CellValue;
  let formula = false;
  if (isObject(value) && ('formula' in value || 'sharedFormula' in value)) {
    formula = true;
    const result = (value as FormulaLike).result;
    if (result === undefined || result === null) return { text: '', raw: '', flag: 'formula-no-result', formula };
    value = result;
  }
  const format = cell.numFmt;
  if (value === null || value === undefined) return { text: '', raw: '', formula };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { text: '', raw: '', flag: 'unsupported-value', formula };
    const shown = formatExcelDateValue(value, format, locale, date1904);
    return { text: shown.text, raw: value.toISOString(), flag: shown.exact ? undefined : 'format-approximate', formula };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { text: '', raw: String(value), flag: 'unsupported-value', formula };
    if (isDateFormat(format)) {
      const shown = formatExcelDateValue(excelSerialToDate(value, date1904), format, locale, date1904);
      return { text: shown.text, raw: String(value), flag: shown.exact ? undefined : 'format-approximate', formula };
    }
    const shown = formatExcelNumber(value, format, locale);
    return { text: shown.text, raw: String(value), flag: shown.exact ? undefined : 'format-approximate', formula,
      numeric: true, currency: isCurrencyFormat(format) || undefined };
  }
  if (typeof value === 'boolean') return { text: formatExcelBoolean(value, locale), raw: String(value), formula };
  if (isObject(value) && typeof value.error === 'string') return { text: value.error, raw: value.error, flag: 'formula-error', formula };
  const text = richTextOf(value) ?? (isObject(value) && 'text' in value ? richTextOf(value.text) : undefined);
  if (text === undefined) return { text: '', raw: '', flag: 'unsupported-value', formula };
  const cleaned = stripControlCharacters(text.replace(/\r\n?/g, '\n'));
  return { text: cleaned.text, raw: text, flag: cleaned.removed ? 'control-characters' : undefined, formula };
}

/**
 * Reads one ExcelJS worksheet into a grid (values only; style-only cells are skipped).
 * With `window` (a range the person chose), only that area is read and counted against
 * {@link GRID_PARSE_LIMITS}, so a sheet too big to read whole can still be read in parts.
 */
export function gridFromWorksheet(sheet: Worksheet, locale: DisplayLocale, date1904 = false, window?: GridMergeBox): SourceGrid {
  const cells = new Map<number, Map<number, GridCell>>();
  const merges = new Map<string, GridMergeBox>();
  const hiddenRows = new Set<number>(), hiddenColumns = new Set<number>();
  let usesFormulas = false, maxColumn = 0, rowsSeen = 0;
  const inWindow = (row: number, column: number) => !window ||
    (row >= window.top && row <= window.bottom && column >= window.left && column <= window.right);
  const store = (rowNumber: number, column: number, cell: Pick<Cell, 'value' | 'numFmt'>) => {
    const converted = gridCellFromExcel(cell, locale, date1904);
    usesFormulas ||= converted.formula;
    if (!converted.text.trim() && !converted.flag) return;
    let columns = cells.get(rowNumber);
    if (!columns) { columns = new Map(); cells.set(rowNumber, columns); }
    columns.set(column, { text: converted.text, raw: converted.raw, flag: converted.flag, numeric: converted.numeric, currency: converted.currency });
  };
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (window && (rowNumber < window.top || rowNumber > window.bottom)) return;
    if (++rowsSeen > GRID_PARSE_LIMITS.rows) throw new Error('SOURCE_TABLE_LIMIT');
    if (row.hidden) hiddenRows.add(rowNumber);
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (!inWindow(rowNumber, column)) return;
      if (column > GRID_PARSE_LIMITS.columns) throw new Error('SOURCE_TABLE_LIMIT');
      maxColumn = Math.max(maxColumn, column);
      const master = cell.isMerged ? cell.master : undefined;
      if (master && master !== cell) {
        // Covered cell of a merge: ExcelJS repeats the master value here; keep one value and a span.
        const { row: top, col: left, address } = master.fullAddress;
        const merge = merges.get(address) ?? { top, left, bottom: top, right: left };
        merge.bottom = Math.max(merge.bottom, rowNumber); merge.right = Math.max(merge.right, column);
        merges.set(address, merge);
        // A merge that starts before the chosen range still shows its value inside it.
        if (!inWindow(top, left) && !cells.get(top)?.has(left)) store(top, left, master);
        return;
      }
      store(rowNumber, column, cell);
    });
  });
  for (let column = 1; column <= maxColumn; column++) if (sheet.getColumn(column).hidden) hiddenColumns.add(column);
  return {
    name: sheet.name, kind: 'sheet', cells, hiddenRows, hiddenColumns, merges: [...merges.values()],
    notes: usesFormulas ? [`A aba “${sheet.name}” tem fórmulas: foram usados os últimos valores salvos pelo Excel.`] : [],
  };
}

/**
 * CSV rows -> grid (no hidden data, no merges). Row numbers match the rows Excel shows.
 * `cleanedCells` holds "row:column" (1-based) keys of cells whose invisible characters were removed.
 */
export function gridFromRows(name: string, rows: readonly (readonly string[])[], cleanedCells: ReadonlySet<string> = new Set()): SourceGrid {
  const cells = new Map<number, Map<number, GridCell>>();
  rows.forEach((row, ri) => {
    const columns = new Map<number, GridCell>();
    row.forEach((value, ci) => {
      const cleaned = cleanedCells.has(`${ri + 1}:${ci + 1}`);
      if (!value.trim() && !cleaned) return;
      columns.set(ci + 1, { text: value, raw: value, flag: cleaned ? 'control-characters' : undefined });
    });
    if (columns.size) cells.set(ri + 1, columns);
  });
  return { name, kind: 'file', cells, hiddenRows: new Set(), hiddenColumns: new Set(), merges: [], notes: [] };
}
