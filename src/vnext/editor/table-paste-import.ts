import type { Cell, DocumentStyle, RichText, Row, TableModel } from '../domain/editorial-model';
import { insertAxis } from '../table/table-model';
import { normalizeTableSelection, type TableSelection } from './table-selection';

/**
 * Pure helpers for "Colar do Excel" (FR-31): turn pasted spreadsheet text into a
 * TableModel with a detected header, estimate its A4 height and plan how many
 * rows/columns an existing table needs before a larger paste. No DOM, no session.
 */

export interface PastedTableLimits {
  readonly maxRows: number;
  readonly maxColumns: number;
}

export interface PastedTable {
  /** Rectangular matrix after trimming trailing empty rows/columns and padding short rows. */
  readonly cells: readonly (readonly string[])[];
  readonly rowCount: number;
  readonly columnCount: number;
  /** 1-based numbers of the pasted rows that had fewer cells and were completed with empty cells. */
  readonly paddedRows: readonly number[];
  /** Whether the first row looks like a header (titles above data). */
  readonly header: boolean;
}

export type PastedTableProblem = 'EMPTY' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS';

export type PastedTableParse =
  | { readonly ok: true; readonly table: PastedTable }
  | { readonly ok: false; readonly problem: PastedTableProblem; readonly rowCount: number; readonly columnCount: number };

/** Quote-aware TSV split that never rejects: returns `null` only when the quoting is malformed. */
function splitQuotedRecords(input: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  let fieldStarted = false;
  let endedWithRecordSeparator = false;

  const pushField = () => {
    row.push(field);
    field = '';
    quoted = false;
    quoteClosed = false;
    fieldStarted = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else if (character === '\r') {
        if (input[index + 1] === '\n') index += 1;
        field += '\n';
      } else {
        field += character;
      }
      continue;
    }
    if (quoteClosed && character !== '\t' && character !== '\r' && character !== '\n') return null;
    if (character === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      endedWithRecordSeparator = false;
      continue;
    }
    if (character === '\t') {
      pushField();
      endedWithRecordSeparator = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      pushRow();
      endedWithRecordSeparator = true;
      continue;
    }
    field += character;
    fieldStarted = true;
    endedWithRecordSeparator = false;
  }
  if (quoted) return null;
  if (!endedWithRecordSeparator || row.length > 0 || field.length > 0 || quoteClosed || fieldStarted) pushRow();
  return rows;
}

/** Literal split used when a stray quote is not valid spreadsheet quoting: keeps every character. */
function splitLiteralRecords(input: string): string[][] {
  const normalized = input.replace(/\r\n?/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return body.split('\n').map((line) => line.split('\t'));
}

/** Removes invisible control characters that a document cell cannot store (tab and line break stay). */
function cleanField(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || (code >= 32 && code !== 127);
  }).join('');
}

const isBlank = (value: string) => value.trim() === '';

/** Spreadsheet text with at least one tab, i.e. two or more columns. */
export function isTabularClipboardText(text: string): boolean {
  return text.includes('\t') && text.replace(/[\t\r\n]/g, '').trim().length > 0;
}

/** Starts with a number (with an optional sign or ±) or is a number followed by % or °. */
function looksLikeData(value: string): boolean {
  const trimmed = value.trim();
  return /^[\s±+\-−–~≈<>≤≥]*\d/.test(trimmed) || /\d\s*(%|°)/.test(trimmed);
}

const HEADER_WORDS = new Set([
  'modelo', 'modelos', 'codigo', 'codigos', 'descricao', 'item', 'itens', 'especificacao', 'especificacoes',
  'caracteristica', 'caracteristicas', 'parametro', 'parametros', 'valor', 'valores', 'unidade', 'unidades',
  'faixa', 'faixas', 'exatidao', 'precisao', 'resolucao', 'quantidade', 'qtd', 'qtde', 'referencia', 'ref',
  'tipo', 'nome', 'produto', 'produtos', 'acessorio', 'acessorios', 'opcao', 'opcoes', 'aplicacao', 'observacao',
  'observacoes', 'obs', 'versao', 'dimensao', 'dimensoes', 'material', 'funcao', 'condicao', 'norma', 'grandeza',
  'medicao', 'sinal', 'saida', 'entrada', 'alimentacao', 'temperatura', 'pressao', 'incerteza', 'estabilidade',
]);

function words(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function looksLikeHeaderLabel(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  const tokens = words(trimmed);
  return tokens.length > 0 && tokens.length <= 5 && tokens.some((token) => HEADER_WORDS.has(token));
}

/** A short product or part code with letters and digits: "TA-25N", "PCON-Y17", "Pt-100", "CB 02". */
function looksLikeModelCode(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 24 && /\p{L}/u.test(trimmed) && /\d/.test(trimmed) && !/\s{2,}/.test(trimmed);
}

/**
 * Header heuristic. The first row must be short text without numbers. With 3 or
 * more columns it is a header when the rows below carry data or a title word;
 * with 1–2 columns (label/value specification tables) every first-row cell must
 * be a typical column title, e.g. "Característica | Valor".
 *
 * Model codes in the first row (1F review): "TA-25N | Portátil | Pt-100" is a
 * data row of a list without a header, while "Modelo | TA-25N | TA-35N" (or an
 * empty corner above the row names, "· | TA-25N | TA-35N") is the header of a
 * comparison. A first row with codes is a header only in these two layouts.
 */
export function detectHeaderRow(cells: readonly (readonly string[])[]): boolean {
  if (cells.length < 2) return false;
  const first = cells[0];
  const [corner, ...rest] = first;
  const bodyHasData = cells.slice(1).some((row) => row.some(looksLikeData));
  if (first.length >= 3 && isBlank(corner) && rest.length >= 2 && rest.every(looksLikeModelCode)) return bodyHasData;
  if (first.some((value) => isBlank(value) || value.trim().length > 40 || looksLikeData(value))) return false;
  if (first.length <= 2) return first.every(looksLikeHeaderLabel);
  if (first.some((value) => /\d/.test(value))) {
    if (!/\d/.test(corner) && looksLikeHeaderLabel(corner)) {
      return rest.every((value) => looksLikeModelCode(value) || looksLikeHeaderLabel(value));
    }
    // Numbered column titles such as "Faixa 1 | Faixa 2 | Faixa 3" above data.
    return bodyHasData && first.every(looksLikeHeaderLabel);
  }
  return bodyHasData || first.some(looksLikeHeaderLabel);
}

/** Lenient parse of text copied from Excel, Google Sheets or a TSV file. */
export function parsePastedTable(text: string, limits: PastedTableLimits): PastedTableParse {
  const records = (splitQuotedRecords(text) ?? splitLiteralRecords(text)).map((row) => row.map(cleanField));
  while (records.length > 0 && records[records.length - 1].every(isBlank)) records.pop();
  const originalWidths = records.map((row) => row.length);
  let width = Math.max(0, ...originalWidths);
  while (width > 0 && records.every((row) => isBlank(row[width - 1] ?? ''))) width -= 1;
  if (records.length === 0 || width === 0) return { ok: false, problem: 'EMPTY', rowCount: 0, columnCount: 0 };
  if (width > limits.maxColumns) return { ok: false, problem: 'TOO_MANY_COLUMNS', rowCount: records.length, columnCount: width };
  if (records.length > limits.maxRows) return { ok: false, problem: 'TOO_MANY_ROWS', rowCount: records.length, columnCount: width };

  const paddedRows: number[] = [];
  const cells = records.map((row, index) => {
    if (originalWidths[index] < width && !row.every(isBlank)) paddedRows.push(index + 1);
    return Array.from({ length: width }, (_, column) => row[column] ?? '');
  });
  return {
    ok: true,
    table: { cells, rowCount: cells.length, columnCount: width, paddedRows, header: detectHeaderRow(cells) },
  };
}

function cellRichText(idPrefix: string, value: string): RichText {
  return {
    paragraphs: value.split('\n').map((line, index) => ({
      id: `${idPrefix}:p${index}`,
      inlines: line.length > 0 ? [{ kind: 'text' as const, id: `${idPrefix}:t${index}`, text: line, marks: [] }] : [],
    })),
  };
}

function longestLine(value: string): number {
  return Math.max(0, ...value.split('\n').map((line) => line.length));
}

/**
 * Structural TableModel for the pasted matrix (no presentation; the caller
 * applies the house preset). Text is kept literally, e.g. "±0,1 °C"; wider
 * text columns get a larger flex share (1 to 4).
 */
export function pastedTableModel(pasted: PastedTable, options: { header: boolean; idPrefix?: string }): TableModel {
  const prefix = options.idPrefix ?? 'paste';
  const columns: TableModel['columns'] = Array.from({ length: pasted.columnCount }, (_, column) => {
    const longest = Math.max(0, ...pasted.cells.map((row) => longestLine(row[column])));
    return {
      id: `${prefix}-column-${column}`,
      width: { mode: 'flex' as const, weight: Math.min(4, Math.max(1, Math.ceil(longest / 12))) },
      minMm: 1,
    };
  });
  const rows: Row[] = pasted.cells.map((_, row) => ({
    id: `${prefix}-row-${row}`,
    role: options.header && row === 0 && pasted.rowCount > 1 ? 'header' : 'body',
    heightPolicy: { mode: 'AUTO' },
  }));
  const cells: Cell[] = pasted.cells.flatMap((values, row) => values.map((value, column) => {
    const id = `${prefix}-cell-${row}-${column}`;
    return {
      id,
      rowId: rows[row].id,
      columnId: columns[column].id,
      content: isBlank(value) ? { type: 'empty' as const } : { type: 'richText' as const, value: cellRichText(id, value) },
    };
  }));
  return {
    id: `${prefix}-table`,
    columns,
    rows,
    cells,
    style: { base: {}, rowRoles: {}, annotation: {}, annotationGapMm: 1 },
    annotations: [],
    legend: [],
  };
}

function plainTextOf(cell: Cell): string {
  if (cell.content.type !== 'richText') return '';
  return cell.content.value.paragraphs
    .map((paragraph) => paragraph.inlines.map((inline) => inline.kind === 'text' ? inline.text : '\n').join(''))
    .join('\n');
}

const MM_PER_PT = 25.4 / 72;

/**
 * Conservative A4 height estimate (mm) for a freshly created table, so the new
 * frame starts without overflow before the measured "Ajustar altura" runs.
 * Characters are assumed 0.6 em wide, which slightly over-estimates Noto Sans.
 */
export function estimateTableHeightMm(
  table: TableModel,
  defaultText: Pick<DocumentStyle['defaultText'], 'fontSizePt' | 'lineHeight'> | undefined,
  frameWidthMm: number
): number {
  const base = table.style.base;
  const fontSizePt = base.fontSizePt ?? defaultText?.fontSizePt ?? 10;
  const lineHeight = base.lineHeight ?? defaultText?.lineHeight ?? 1.25;
  const padding = base.paddingMm ?? {};
  const verticalPaddingMm = (padding.top ?? 0) + (padding.bottom ?? 0);
  const horizontalPaddingMm = (padding.left ?? 0) + (padding.right ?? 0);
  const lineMm = fontSizePt * lineHeight * MM_PER_PT;
  const charMm = fontSizePt * 0.6 * MM_PER_PT;
  const fixedMm = table.columns.reduce((total, column) => total + (column.width.mode === 'fixed' ? column.width.mm : 0), 0);
  const flexWeight = table.columns.reduce((total, column) => total + (column.width.mode === 'flex' ? column.width.weight : 0), 0);
  const flexMm = Math.max(0, frameWidthMm - fixedMm);
  const columnWidthMm = new Map(table.columns.map((column) => [
    column.id,
    column.width.mode === 'fixed' ? column.width.mm : flexWeight > 0 ? flexMm * column.width.weight / flexWeight : 0,
  ]));
  const byRow = new Map<string, Cell[]>();
  for (const cell of table.cells) {
    if (cell.coveredBy) continue;
    byRow.set(cell.rowId, [...(byRow.get(cell.rowId) ?? []), cell]);
  }
  const contentMm = table.rows.reduce((total, row) => {
    const lines = Math.max(1, ...(byRow.get(row.id) ?? []).map((cell) => {
      const textWidthMm = Math.max(charMm, (columnWidthMm.get(cell.columnId) ?? frameWidthMm) - horizontalPaddingMm);
      return plainTextOf(cell).split('\n')
        .reduce((count, line) => count + Math.max(1, Math.ceil(line.length * charMm / textWidthMm)), 0);
    }));
    const minimumMm = row.heightPolicy.mode === 'AUTO' ? 0 : row.heightPolicy.mode === 'MIN_MM' ? row.heightPolicy.minMm : row.heightPolicy.heightMm;
    const autoMm = lines * lineMm + verticalPaddingMm;
    return total + (row.heightPolicy.mode === 'FIXED_MM' ? minimumMm : Math.max(minimumMm, autoMm));
  }, 0);
  // 6% slack plus 1 mm for borders keeps the first render free of overflow.
  return Math.ceil((contentMm * 1.06 + 1) * 2) / 2;
}

export interface PasteGrowthPlan {
  readonly rowsToAdd: number;
  readonly columnsToAdd: number;
  readonly lastRowId: string;
  readonly lastColumnId: string;
}

/** How many rows/columns must be appended so a `sourceRows × sourceColumns` paste fits from the selection start. */
export function planPasteGrowth(
  table: TableModel,
  selection: TableSelection,
  sourceRows: number,
  sourceColumns: number
): PasteGrowthPlan | undefined {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) return undefined;
  const rowsToAdd = Math.max(0, normalized.rowStart + sourceRows - table.rows.length);
  const columnsToAdd = Math.max(0, normalized.columnStart + sourceColumns - table.columns.length);
  if (rowsToAdd === 0 && columnsToAdd === 0) return undefined;
  return {
    rowsToAdd,
    columnsToAdd,
    lastRowId: table.rows[table.rows.length - 1].id,
    lastColumnId: table.columns[table.columns.length - 1].id,
  };
}

/**
 * Pure simulation of the growth (placeholder ids) so the paste can be checked
 * before any document change. Throws the table engine error when growth is impossible.
 */
export function growTableModel(table: TableModel, plan: Pick<PasteGrowthPlan, 'rowsToAdd' | 'columnsToAdd'>): TableModel {
  let grown = table;
  for (let index = 0; index < plan.rowsToAdd; index += 1) {
    const rowId = `__grow-row-${index}`;
    grown = insertAxis(grown, 'row', grown.rows.length, { id: rowId, role: 'body', heightPolicy: { mode: 'AUTO' } },
      grown.columns.map((column) => ({ id: `__grow-cell-${rowId}-${column.id}`, rowId, columnId: column.id, content: { type: 'empty' } })));
  }
  for (let index = 0; index < plan.columnsToAdd; index += 1) {
    const columnId = `__grow-column-${index}`;
    grown = insertAxis(grown, 'column', grown.columns.length, { id: columnId, width: { mode: 'flex', weight: 1 }, minMm: 1 },
      grown.rows.map((row) => ({ id: `__grow-cell-${row.id}-${columnId}`, rowId: row.id, columnId, content: { type: 'empty' } })));
  }
  return grown;
}

/** "3 linhas", "1 linha e 2 colunas" — used by the "Adicionar … e colar" button. */
export function describeGrowth(plan: Pick<PasteGrowthPlan, 'rowsToAdd' | 'columnsToAdd'>): string {
  const parts: string[] = [];
  if (plan.rowsToAdd > 0) parts.push(`${plan.rowsToAdd} ${plan.rowsToAdd === 1 ? 'linha' : 'linhas'}`);
  if (plan.columnsToAdd > 0) parts.push(`${plan.columnsToAdd} ${plan.columnsToAdd === 1 ? 'coluna' : 'colunas'}`);
  return parts.join(' e ');
}
