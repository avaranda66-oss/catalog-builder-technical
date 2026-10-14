import { extractPdfText, type ExtractedPdfPage } from './pdf-intake';

export const SOURCE_LIMITS = { files: 10, bytes: 20 * 1024 * 1024, pdfPages: 30,
  rows: 150, columns: 10, characters: 120000, blocks: 80, cell: 1200 } as const;
export interface SourceLocator { fileName: string; sha256: string; location: string }
interface BaseBlock { id: string; title: string; source: SourceLocator; warnings: string[] }
export type SourceBlock = BaseBlock & (
  | { kind: 'text'; text: string }
  | { kind: 'table'; rows: string[][]; addresses: string[][] }
  | { kind: 'image'; file: File }
);
export interface SourceIntake { blocks: SourceBlock[]; warnings: string[] }
/** Rejects C0 control characters except tab, newline and carriage return, plus DEL. */
const clean = (value: string) => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return false;
  }
  return true;
};
const digest = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
export const columnLabel = (index: number) => {
  let result = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
};
function validateRows(rows: string[][]) {
  const count = Math.max(0, ...rows.map(row => row.length));
  if (!rows.length || rows.length > SOURCE_LIMITS.rows || count < 1 || count > SOURCE_LIMITS.columns ||
      rows.some(row => row.some(value => value.length > SOURCE_LIMITS.cell || !clean(value)))) {
    throw new Error('SOURCE_TABLE_LIMIT');
  }
  return rows.map(row => Array.from({ length: count }, (_, index) => row[index] ?? ''));
}

/** RFC-4180 quoting, including escaped quotes and multiline cells; no numeric coercion. */
export function parseDelimitedSource(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.length || text.length > SOURCE_LIMITS.characters || !clean(text)) throw new Error('SOURCE_TEXT_LIMIT');
  const firstLine = text.split('\n')[0];
  const counts = [',', ';', '\t'].map(separator => {
    let quoted = false, count = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"') { if (quoted && firstLine[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && firstLine[i] === separator) count++;
    }
    return { separator, count };
  });
  const separator = counts.sort((a, b) => b.count - a.count)[0].separator;
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); rows.push(row); row = []; if (rows.length > SOURCE_LIMITS.rows) throw new Error('SOURCE_TABLE_LIMIT'); };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { cell += '"'; index++; } else { quoted = false; closed = true; } }
      else cell += char;
    } else if (char === separator) finishCell();
    else if (char === '\n') finishRow();
    else if (char === '"' && cell.length === 0 && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error('SOURCE_CSV_MALFORMED'); cell += char; }
    if (cell.length > SOURCE_LIMITS.cell || row.length > SOURCE_LIMITS.columns) throw new Error('SOURCE_TABLE_LIMIT');
  }
  if (quoted) throw new Error('SOURCE_CSV_MALFORMED');
  if (cell.length || row.length || !text.endsWith('\n')) finishRow();
  return validateRows(rows);
}

/** Bound declared expansion before ExcelJS allocates XML from an XLSX ZIP. */
export function verifyWorkbookArchive(bytes: ArrayBuffer) {
  const data = new DataView(bytes); let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65557); offset--) {
    if (data.getUint32(offset, true) === 0x06054b50 && offset + 22 + data.getUint16(offset + 20, true) === bytes.byteLength) { end = offset; break; }
  }
  if (end < 0 || data.getUint16(end + 4, true) || data.getUint16(end + 6, true)) throw new Error('SOURCE_XLSX_INVALID');
  const entries = data.getUint16(end + 10, true), start = data.getUint32(end + 16, true);
  if (!entries || entries > 1000 || start >= end) throw new Error('SOURCE_XLSX_LIMIT');
  let offset = start, expanded = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50) throw new Error('SOURCE_XLSX_INVALID');
    const size = data.getUint32(offset + 24, true);
    expanded += size;
    if (expanded > 40 * 1024 * 1024 || data.getUint16(offset + 8, true) & 1) throw new Error('SOURCE_XLSX_LIMIT');
    offset += 46 + data.getUint16(offset + 28, true) + data.getUint16(offset + 30, true) + data.getUint16(offset + 32, true);
  }
  if (offset !== end) throw new Error('SOURCE_XLSX_INVALID');
}

function tableBlock(rows: string[][], source: SourceLocator, id: string, title: string, addresses?: string[][]): SourceBlock {
  const checked = validateRows(rows);
  return { id, title, kind: 'table', source, warnings: [], rows: checked,
    addresses: addresses ?? checked.map((row, ri) => row.map((_, ci) => `${columnLabel(ci)}${ri + 1}`)) };
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
      const block = tableBlock(rows, source, `${prefix}-${blocks.length}`, `${source.fileName} · tabela da ${source.location}`,
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

export async function readSourceFile(file: File, index = 0): Promise<SourceIntake> {
  if (!file.name || !clean(file.name) || file.size < 1 || file.size > SOURCE_LIMITS.bytes) throw new Error('SOURCE_FILE_LIMIT');
  const bytes = await file.arrayBuffer(), sha256 = await digest(bytes);
  const prefix = `source-${index}-${sha256.slice(0, 10)}`;
  const source = { fileName: file.name, sha256, location: 'arquivo' };
  const extension = file.name.toLowerCase().split('.').at(-1);
  let blocks: SourceBlock[] = []; const warnings: string[] = [];
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '')) {
    blocks = [{ id: prefix, title: file.name, kind: 'image', file, source, warnings: ['A foto não comprova especificações técnicas.'] }];
  } else if (extension === 'csv' || extension === 'tsv') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); warnings.push(`${file.name}: arquivo lido como Windows-1252; confira acentos e símbolos.`); }
    blocks = [tableBlock(parseDelimitedSource(text), { ...source, location: 'planilha' }, prefix, file.name)];
  } else if (extension === 'xlsx') {
    verifyWorkbookArchive(bytes);
    const ExcelJS = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    if (book.worksheets.length > 10) throw new Error('SOURCE_XLSX_LIMIT');
    for (const [si, sheet] of book.worksheets.entries()) {
      if (sheet.rowCount === 0) continue;
      if (sheet.rowCount > SOURCE_LIMITS.rows || sheet.columnCount > SOURCE_LIMITS.columns) throw new Error('SOURCE_TABLE_LIMIT');
      const sheetWarnings = new Set<string>();
      if (sheet.state !== 'visible') sheetWarnings.add('Esta aba estava oculta no arquivo original.');
      const rows: string[][] = [], addresses: string[][] = [];
      for (let ri = 1; ri <= sheet.rowCount; ri++) {
        const row: string[] = [], refs: string[] = [];
        if (sheet.getRow(ri).hidden) sheetWarnings.add('Linhas ocultas foram incluídas para não perder dados.');
        for (let ci = 1; ci <= sheet.columnCount; ci++) {
          const cell = sheet.getCell(ri, ci);
          let value = cell.value;
          if (cell.isMerged) sheetWarnings.add('Células mescladas foram expandidas; confira cabeçalhos e relações entre linhas.');
          if (typeof value === 'object' && value && ('formula' in value || 'sharedFormula' in value)) {
            if (value.result === undefined || value.result === null) throw new Error('SOURCE_FORMULA_NO_RESULT');
            value = value.result;
            sheetWarnings.add('Fórmulas usam o resultado salvo pelo Excel. Recalcule e salve no Excel se os dados mudaram.');
          }
          let literal = '';
          if (value instanceof Date) { literal = value.toISOString(); sheetWarnings.add('Datas foram convertidas para ISO; confira o formato.'); }
          else if (typeof value === 'number') {
            if (!Number.isFinite(value)) throw new Error('SOURCE_XLSX_INVALID');
            const format = cell.numFmt;
            if (/^0(?:\.0+)?%?$/.test(format ?? '')) {
              const digits = format.split('.')[1]?.replace('%', '').length ?? 0;
              literal = (format.endsWith('%') ? value * 100 : value).toFixed(Math.min(20, digits)) + (format.endsWith('%') ? '%' : '');
            } else { literal = String(value); if (format && format !== 'General') sheetWarnings.add('Alguns números usam valor bruto; confira o formato personalizado no Excel.'); }
          } else if (typeof value === 'string' || typeof value === 'boolean') literal = String(value);
          else if (value && typeof value === 'object' && 'richText' in value) literal = value.richText.map(part => part.text).join('');
          else if (value && typeof value === 'object' && 'text' in value) literal = value.text;
          else if (value && typeof value === 'object' && 'error' in value) throw new Error('SOURCE_FORMULA_ERROR');
          row.push(literal); refs.push(`${sheet.name}!${cell.address}`);
        }
        rows.push(row); addresses.push(refs);
      }
      const block = tableBlock(rows, { ...source, location: `aba ${sheet.name}` }, `${prefix}-${si}`, `${file.name} · ${sheet.name}`, addresses);
      block.warnings.push(...sheetWarnings); blocks.push(block);
    }
  } else if (extension === 'pdf') {
    const pdf = await extractPdfText(file.name, bytes, { maxPages: SOURCE_LIMITS.pdfPages });
    if (pdf.truncated) warnings.push(`${file.name}: foram lidas até ${SOURCE_LIMITS.pdfPages} páginas e 60.000 caracteres por página; há conteúdo adicional no original.`);
    for (const page of pdf.pages) {
      if (page.needsVisualExtraction) warnings.push(`${file.name}, página ${page.number}: sem texto pesquisável suficiente. Precisa de leitura visual/OCR; não foi criada especificação.`);
      else blocks.push(...blocksFromPdfPage(page, { ...source, location: `página ${page.number}` }, `${prefix}-p${page.number}`));
    }
  } else throw new Error('SOURCE_FORMAT_UNSUPPORTED');
  if (blocks.length > SOURCE_LIMITS.blocks || blocks.reduce((total, block) => total + (block.kind === 'text' ? block.text.length : block.kind === 'table' ? block.rows.flat().join('').length : 0), 0) > SOURCE_LIMITS.characters) throw new Error('SOURCE_TEXT_LIMIT');
  return { blocks, warnings };
}

export function sourceErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'SOURCE_FORMULA_NO_RESULT') return 'Uma fórmula não tem resultado salvo. Abra a planilha no Excel, recalcule, salve e envie novamente.';
  if (code === 'SOURCE_FORMULA_ERROR') return 'A planilha contém erro de fórmula. Corrija no Excel antes de importar.';
  if (code === 'SOURCE_TABLE_LIMIT') return 'Divida a planilha em partes de até 150 linhas, 10 colunas e 1.200 caracteres por célula.';
  if (code === 'SOURCE_TEXT_LIMIT' || code === 'SOURCE_XLSX_LIMIT') return 'O conteúdo é grande demais para esta importação. Divida o arquivo e tente novamente.';
  if (code === 'SOURCE_FILE_LIMIT') return 'Escolha arquivos de até 20 MB, com nome válido.';
  if (code === 'SOURCE_FORMAT_UNSUPPORTED') return 'Escolha PDF, CSV, TSV, XLSX, PNG, JPEG ou WebP.';
  if (code === 'SOURCE_CSV_MALFORMED') return 'O CSV tem aspas ou linhas malformadas. Exporte novamente como CSV e tente outra vez.';
  return 'Não foi possível ler este arquivo com segurança. Confira se abre normalmente e envie novamente.';
}
