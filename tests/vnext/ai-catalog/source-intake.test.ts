import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { MAX_PDF_BYTES } from '../../../src/vnext/ai-catalog/pdf-intake';
import {
  detectDelimiter, parseDelimitedSource, readSourceFile, readSources, resolveWorkbookConstructor, SOURCE_LIMITS,
  sourceErrorMessage, verifyWorkbookArchive, type SourceBlock, type SourceIntake, type SourceReadOptions,
} from '../../../src/vnext/ai-catalog/source-intake';

type TableBlock = Extract<SourceBlock, { kind: 'table' }>;
const fileOf = (data: BlobPart, name: string) => new File([data], name);
const table = (intake: SourceIntake, index = 0) => {
  const block = intake.blocks.filter(item => item.kind === 'table')[index];
  if (!block || block.kind !== 'table') throw new Error('expected a table block');
  return block as TableBlock;
};
const read = (data: BlobPart, name: string, options?: SourceReadOptions) => readSourceFile(fileOf(data, name), 0, options);
const latin1 = (text: string) => Uint8Array.from(text, char => char.charCodeAt(0));
const utf16le = (text: string) => {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xff, 0xfe]);
  for (let index = 0; index < text.length; index++) {
    bytes[2 + index * 2] = text.charCodeAt(index) & 0xff;
    bytes[3 + index * 2] = text.charCodeAt(index) >> 8;
  }
  return bytes;
};
async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(code);
  return error as Error;
}
async function workbookBytes(build: (book: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  build(book);
  const buffer = await book.xlsx.writeBuffer();
  const view = new Uint8Array(buffer as ArrayBuffer);
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
const specsSheet = (book: ExcelJS.Workbook, name = 'Specs') => {
  const sheet = book.addWorksheet(name);
  sheet.addRow(['Modelo', 'Faixa', 'Exatidão']);
  sheet.addRow(['PCON-Y17', '0 a 20 bar', '0,025 %FS']);
  return sheet;
};
const csvRows = (rows: number, columns: number) =>
  Array.from({ length: rows }, (_, ri) => Array.from({ length: columns }, (_, ci) => ri === 0 ? `Coluna ${ci + 1}` : `${ri}.${ci}`).join(';')).join('\n');

describe('CSV, TSV and TXT intake', () => {
  it('chooses the separator by consistency, not by a comma in the header (decimal stays intact)', () => {
    expect(detectDelimiter('Modelo;Faixa (mín, máx)\nPCON-Y17;0,025\n')).toBe(';');
    expect(parseDelimitedSource('Modelo;Faixa (mín, máx)\nPCON-Y17;0,025\n')).toEqual([['Modelo', 'Faixa (mín, máx)'], ['PCON-Y17', '0,025']]);
    expect(parseDelimitedSource('Model,Range\nA,0.1\nB,0.2\n')).toEqual([['Model', 'Range'], ['A', '0.1'], ['B', '0.2']]);
  });

  it('keeps ";" when every row has Brazilian decimal ranges such as "0,5 a 1,5 bar"', () => {
    const text = `Modelo;Faixa\n${Array.from({ length: 20 }, (_, index) => `A${index};0,5 a 1,5 bar`).join('\n')}\n`;
    expect(detectDelimiter(text)).toBe(';');
    expect(parseDelimitedSource(text)[1]).toEqual(['A0', '0,5 a 1,5 bar']);
    // A comma file with a ";" inside some text cells stays a comma file.
    expect(detectDelimiter(`Code,Notes\n${Array.from({ length: 20 }, (_, index) => `C${index},red;blue`).join('\n')}\n`)).toBe(',');
  });

  it('keeps a Brazilian CSV with ";" and "0,01 %FS" exactly as typed', async () => {
    const intake = await read('Modelo;Exatidão\nPCON-Y17;0,01 %FS\nPCON-Y18;0,025 %FS\n', 'sensores.csv');
    expect(table(intake).rows).toEqual([['Modelo', 'Exatidão'], ['PCON-Y17', '0,01 %FS'], ['PCON-Y18', '0,025 %FS']]);
    expect(table(intake).addresses[1]).toEqual(['A2', 'B2']);
    expect(intake.warnings).toEqual([]);
  });

  it('parses a quoted multiline header and escaped quotes, separators and newlines inside cells', () => {
    expect(parseDelimitedSource('"Faixa\n(bar)";Exatidão\n0 a 20;0,025 %')).toEqual([['Faixa\n(bar)', 'Exatidão'], ['0 a 20', '0,025 %']]);
    expect(parseDelimitedSource('"a""b";"c;d"\n"linha\nnova";2\n')).toEqual([['a"b', 'c;d'], ['linha\nnova', '2']]);
  });

  it('accepts an unquoted inch mark such as 1/4" NPT', () => {
    expect(parseDelimitedSource('Modelo;Conexão\nPCON-Y17;1/4" NPT\n')).toEqual([['Modelo', 'Conexão'], ['PCON-Y17', '1/4" NPT']]);
  });

  it('forces tab for .tsv and .txt files', async () => {
    for (const name of ['lista.tsv', 'lista.txt']) {
      const intake = await read('Modelo\tFaixa (mín, máx, un)\nPCON-Y17\t0,025\n', name);
      expect(table(intake).rows).toEqual([['Modelo', 'Faixa (mín, máx, un)'], ['PCON-Y17', '0,025']]);
    }
  });

  it('names irregular rows in a warning instead of padding them silently', async () => {
    const intake = await read('Modelo;Faixa;Exatidão\nPCON-Y17;0 a 20 bar\nPCON-Y18;0 a 70 bar;0,05 %\nPCON-Y19;1;2\n', 'irregular.csv');
    expect(table(intake).rows[1]).toEqual(['PCON-Y17', '0 a 20 bar', '']);
    expect(intake.warnings.join(' ')).toContain('A linha 2 tem um número de colunas diferente');
  });

  it('removes trailing blank rows', () => {
    expect(parseDelimitedSource('a;b\n1;2\n\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('decodes Windows-1252 and UTF-16 files', async () => {
    const legacy = await read(latin1('Modelo;Exatidão\nTA-25N;±0,1 °C\n'), 'antigo.csv');
    expect(table(legacy).rows[1]).toEqual(['TA-25N', '±0,1 °C']);
    expect(legacy.warnings.join(' ')).toContain('formato antigo do Excel e os acentos foram convertidos');
    expect(legacy.warnings.join(' ')).not.toMatch(/UTF-8|Windows-1252/);
    const unicode = await read(utf16le('Modelo;Exatidão\nTA-25N;±0,1 °C\n'), 'unicode.csv');
    expect(table(unicode).rows[1]).toEqual(['TA-25N', '±0,1 °C']);
  });

  it('applies the 150-row / 10-column limit per table and asks for a range instead of failing', async () => {
    expect(table(await read(csvRows(150, 10), 'ok.csv')).rows).toHaveLength(150);
    const tooLong = await read(csvRows(151, 3), 'grande.csv');
    expect(tooLong.blocks).toEqual([]);
    expect(tooLong.rangeRequests[0]).toMatchObject({ sheet: 'grande.csv', rows: 151, columns: 3, suggestedRange: 'A1:C150' });
    expect(tooLong.rangeRequests[0].message).toContain('escolha um intervalo menor');
    const tooWide = await read(csvRows(3, 11), 'larga.csv');
    expect(tooWide.rangeRequests[0]).toMatchObject({ columns: 11, suggestedRange: 'A1:J3' });
    const chosen = await read(csvRows(151, 3), 'grande.csv', { ranges: { 'grande.csv': 'A1:C150' } });
    expect(table(chosen).rows).toHaveLength(150);
  });

  it('marks long cells and invisible characters per cell', async () => {
    const intake = await read(`Modelo;Descrição\nA;${'x'.repeat(1300)}\nB;sem\u0007sinal\n`, 'celulas.csv');
    const block = table(intake);
    expect(block.rows[1][1]).toHaveLength(SOURCE_LIMITS.cell);
    expect(block.rows[2][1]).toBe('semsinal');
    expect(block.flags.map(flag => [flag.address, flag.kind])).toEqual([['B2', 'truncated'], ['B3', 'control-characters']]);
  });

  it('reports an unclosed quote with its line number', async () => {
    const error = await expectCode(read('Modelo;Nota\nA;ok\nB;"sem fim\nC;x\n', 'aspas.csv'), 'SOURCE_CSV_MALFORMED');
    expect(sourceErrorMessage(error)).toContain('linha 3');
  });
});

describe('XLSX archive pre-check', () => {
  const valid = () => workbookBytes(book => specsSheet(book));
  const eocdOffset = (bytes: ArrayBuffer) => {
    const view = new DataView(bytes);
    for (let offset = bytes.byteLength - 22; offset >= 0; offset--) if (view.getUint32(offset, true) === 0x06054b50) return offset;
    throw new Error('no EOCD');
  };

  it('accepts a valid workbook and one whose end record has a comment', async () => {
    const bytes = await valid();
    expect(() => verifyWorkbookArchive(bytes)).not.toThrow();
    const commented = new Uint8Array(bytes.byteLength + 5);
    commented.set(new Uint8Array(bytes));
    new DataView(commented.buffer).setUint16(eocdOffset(bytes) + 20, 5, true);
    expect(() => verifyWorkbookArchive(commented.buffer)).not.toThrow();
  });

  it('rejects truncated files, trailing garbage, encrypted entries, too many entries and huge declared sizes', async () => {
    const bytes = await valid();
    expect(() => verifyWorkbookArchive(bytes.slice(0, bytes.byteLength - 40))).toThrow('SOURCE_XLSX_INVALID');
    const garbage = new Uint8Array(bytes.byteLength + 3); garbage.set(new Uint8Array(bytes));
    expect(() => verifyWorkbookArchive(garbage.buffer)).toThrow('SOURCE_XLSX_INVALID');
    const eocd = eocdOffset(bytes);
    const centralStart = new DataView(bytes).getUint32(eocd + 16, true);
    const encrypted = bytes.slice(0); new DataView(encrypted).setUint16(centralStart + 8, 1, true);
    expect(() => verifyWorkbookArchive(encrypted)).toThrow('SOURCE_PASSWORD_PROTECTED');
    const many = bytes.slice(0); new DataView(many).setUint16(eocd + 10, 1001, true);
    expect(() => verifyWorkbookArchive(many)).toThrow('SOURCE_XLSX_LIMIT');
    const huge = bytes.slice(0); new DataView(huge).setUint32(centralStart + 24, 41 * 1024 * 1024, true);
    expect(() => verifyWorkbookArchive(huge)).toThrow('SOURCE_XLSX_LIMIT');
  });

  it('tells the father to remove the password from an encrypted Office file', async () => {
    const cfb = new Uint8Array(4096); cfb.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const error = await expectCode(read(cfb, 'protegida.xlsx'), 'SOURCE_PASSWORD_PROTECTED');
    expect(sourceErrorMessage(error)).toContain('remova a senha');
    expect(sourceErrorMessage(await expectCode(read(cfb, 'antiga.xls'), 'SOURCE_LEGACY_SPREADSHEET'))).toContain('.xlsx');
  });

  it('tells an old .xls renamed to .xlsx apart from an encrypted workbook', async () => {
    const compound = (stream: string) => {
      const bytes = new Uint8Array(4096); bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      bytes.set(Uint8Array.from([...stream].flatMap(char => [char.charCodeAt(0), 0])), 1024);
      return bytes;
    };
    await expectCode(read(compound('Workbook'), 'renomeada.xlsx'), 'SOURCE_LEGACY_SPREADSHEET');
    await expectCode(read(compound('EncryptionInfo'), 'com-senha.xlsx'), 'SOURCE_PASSWORD_PROTECTED');
  });
});

describe('XLSX intake with real-world workbooks', () => {
  it('shows numbers as Excel shows them and keeps the raw value as provenance', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Specs');
      sheet.addRow(['Modelo', 'Resolução', 'Preço base', 'Linearidade', 'Soma', 'Exatidão']);
      const row = sheet.addRow(['PCON-Y17', 0.01, 1234.5, 0.0005, { formula: '0.1+0.2', result: 0.30000000000000004 }, 0.025]);
      row.getCell(2).numFmt = '0.000';
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(4).numFmt = '0.00%';
      row.getCell(6).numFmt = '0.000 "%FS"';
    });
    const intake = await read(bytes, 'specs.xlsx', { includeInternal: true });
    const block = table(intake);
    expect(block.rows[1]).toEqual(['PCON-Y17', '0,010', '1.234,50', '0,05%', '0,3', '0,025 %FS']);
    expect(block.raw[1][4]).toBe('0.30000000000000004');
    expect(block.addresses[1][4]).toBe('Specs!E2');
    expect(block.warnings.join(' ')).toContain('últimos valores salvos pelo Excel');
    const english = await read(bytes, 'specs.xlsx', { includeInternal: true, locale: 'en-US' });
    expect(table(english).rows[1][2]).toBe('1,234.50');
  });

  it('shows dates as dd/mm/aaaa, booleans as Sim/Não and hyperlinks as their text', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Datas');
      sheet.addRow(['Revisão', 'Ativo', 'Site']);
      sheet.addRow([new Date(Date.UTC(2026, 9, 14)), true, { text: 'Site', hyperlink: 'https://www.presys.com.br' }]);
    });
    const block = table(await read(bytes, 'datas.xlsx'));
    expect(block.rows[1]).toEqual(['14/10/2026', 'Sim', 'Site']);
    expect(block.rows.flat().every(value => typeof value === 'string')).toBe(true);
  });

  it('turns a hyperlink whose text is rich text into a plain string', async () => {
    const { gridCellFromExcel } = await import('../../../src/vnext/ai-catalog/source-grid');
    const { displayLocale } = await import('../../../src/vnext/ai-catalog/excel-display-format');
    const value = { text: { richText: [{ text: 'Si' }, { text: 'te', font: { bold: true } }] }, hyperlink: 'https://www.presys.com.br' };
    expect(gridCellFromExcel({ value, numFmt: '' } as never, displayLocale('pt-BR'))).toMatchObject({ text: 'Site', raw: 'Site' });
  });

  it('leaves hidden columns out by default, lists them, and includes them only on request', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Specs');
      sheet.addRow(['Modelo', 'Faixa', 'Custo interno']);
      sheet.addRow(['PCON-Y17', '0 a 20 bar', '1000']);
      sheet.getColumn(3).hidden = true;
    });
    const intake = await read(bytes, 'ocultas.xlsx');
    expect(table(intake).rows).toEqual([['Modelo', 'Faixa'], ['PCON-Y17', '0 a 20 bar']]);
    expect(intake.ignored).toContainEqual(expect.objectContaining({ kind: 'column', label: 'C', reason: 'hidden' }));
    expect(intake.ignored[0].message).toBe('A coluna C (“Custo interno”) da aba “Specs” não foi importada: estava oculta no Excel.');
    const withHidden = await read(bytes, 'ocultas.xlsx', { includeHidden: true, includeInternal: true });
    expect(table(withHidden).rows[0]).toEqual(['Modelo', 'Faixa', 'Custo interno']);
  });

  it('does not fail the workbook because of a hidden helper sheet with 200 rows', async () => {
    const bytes = await workbookBytes(book => {
      specsSheet(book);
      const lists = book.addWorksheet('Listas', { state: 'hidden' });
      for (let row = 1; row <= 200; row++) lists.addRow([`item ${row}`]);
    });
    const intake = await read(bytes, 'auxiliar.xlsx');
    expect(intake.blocks).toHaveLength(1);
    expect(intake.ignored).toContainEqual(expect.objectContaining({ kind: 'sheet', sheet: 'Listas', reason: 'hidden' }));
  });

  it('uses the range with values only, ignoring rows and columns that carry only formatting', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = specsSheet(book);
      for (let row = 3; row <= 400; row++) sheet.getCell(row, 1).border = { bottom: { style: 'thin' } };
      sheet.getCell('O1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    });
    const block = table(await read(bytes, 'formatada.xlsx'));
    expect(block.rows).toHaveLength(2);
    expect(block.rows[0]).toHaveLength(3);
    expect(block.range).toBe('A1:C2');
  });

  it('marks a formula error in one cell without rejecting the file or the other sheets', async () => {
    const bytes = await workbookBytes(book => {
      specsSheet(book, 'Specs');
      const other = book.addWorksheet('Calculo');
      other.addRow(['Modelo', 'Fator']);
      other.addRow(['PCON-Y17', { formula: 'NA()', result: { error: '#N/A' } }]);
    });
    const intake = await read(bytes, 'erro.xlsx');
    expect(intake.blocks).toHaveLength(2);
    const calc = table(intake, 1);
    expect(calc.rows[1]).toEqual(['PCON-Y17', '#N/A']);
    expect(calc.flags).toEqual([expect.objectContaining({ address: 'Calculo!B2', kind: 'formula-error', row: 1, column: 1 })]);
    expect(calc.warnings.join(' ')).toContain('1 célula com erro de fórmula da aba “Calculo” (B2)');
  });

  it('trims a merged title and keeps the merge as a span, not as repeated text', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Specs');
      sheet.getCell('B2').value = 'Calibradores de pressão';
      sheet.mergeCells('B2:D2');
      sheet.getCell('B4').value = 'Modelo'; sheet.getCell('C4').value = 'Faixa'; sheet.getCell('D4').value = 'Exatidão';
      sheet.getCell('B5').value = 'PCON-Y17'; sheet.getCell('C5').value = '0 a 20 bar'; sheet.getCell('D5').value = '0,025 %FS';
    });
    const block = table(await read(bytes, 'titulo.xlsx'));
    expect(block.rows).toEqual([
      ['Calibradores de pressão', '', ''], ['', '', ''], ['Modelo', 'Faixa', 'Exatidão'], ['PCON-Y17', '0 a 20 bar', '0,025 %FS'],
    ]);
    expect(block.merges).toEqual([{ row: 0, column: 0, rowSpan: 1, columnSpan: 3 }]);
    expect(block.addresses[0][0]).toBe('Specs!B2');
    expect(block.headerRow).toBe(2);
  });

  it('leaves logs, helpers, configurators and price columns out by default, then applies limits', async () => {
    const bytes = await workbookBytes(book => {
      for (const name of ['CONFIGURADOR', 'HELPER', 'ORIGINAL_Y17', 'PENDING_ITEMS', 'AccessLogs']) book.addWorksheet(name).addRow(['Price USD', 'User Agent', 'x']);
      const sensors = book.addWorksheet('DB_SENSORS');
      sensors.addRow(['Code', 'Range (1)', 'Range (2)', 'Range (3)', 'Gauge Type', 'Accuracy', 'Precision', 'Description', 'Price', 'Family(ies)', 'Price Y18-HP', 'Family(ies)']);
      for (let row = 0; row < 69; row++) sensors.addRow([`0D${row}`, '± 100 Pa', '0,40 inH2O', '±1 mbar', 'Differential', 1, 'Standard', 'texto', 1000, 'Y17', 1300, 'Y17']);
    });
    const intake = await read(bytes, 'PCON-MASTER.xlsx');
    expect(intake.blocks).toHaveLength(1);
    const block = table(intake);
    expect(block.rows).toHaveLength(70);
    expect(block.rows[0]).toEqual(['Code', 'Range (1)', 'Range (2)', 'Range (3)', 'Gauge Type', 'Accuracy', 'Precision', 'Description', 'Family(ies)', 'Family(ies)']);
    expect(intake.ignored.filter(item => item.kind === 'sheet').map(item => item.sheet)).toEqual(['CONFIGURADOR', 'HELPER', 'ORIGINAL_Y17', 'PENDING_ITEMS', 'AccessLogs']);
    expect(intake.ignored.filter(item => item.kind === 'column').map(item => item.label)).toEqual(['I', 'K']);
    // Opting into internal data shows the 12 columns, which then need a range.
    const everything = await read(bytes, 'PCON-MASTER.xlsx', { includeInternal: true, sheets: ['DB_SENSORS'] });
    expect(everything.rangeRequests[0]).toMatchObject({ sheet: 'DB_SENSORS', columns: 12 });
  });

  it('asks for a range on one big sheet and keeps reading the others', async () => {
    const bytes = await workbookBytes(book => {
      const big = book.addWorksheet('Historico');
      big.addRow(['Data', 'Leitura']);
      for (let row = 0; row < 300; row++) big.addRow([`d${row}`, row]);
      specsSheet(book);
    });
    const intake = await read(bytes, 'misto.xlsx');
    expect(intake.blocks.map(block => block.title)).toEqual(['misto.xlsx · Specs']);
    expect(intake.rangeRequests[0].message).toBe('A aba “Historico” tem 301 linhas e 2 colunas com dados (A1:B301). ' +
      'Cada tabela aceita até 150 linhas e 10 colunas: escolha um intervalo menor, por exemplo A1:B150.');
    const chosen = await read(bytes, 'misto.xlsx', { ranges: { Historico: 'A1:B150' } });
    expect(chosen.blocks).toHaveLength(2);
    const missing = await read(bytes, 'misto.xlsx', { sheets: ['Specs', 'Precos'] });
    expect(missing.warnings).toContain('A aba “Precos” não existe nesta planilha. Confira o nome da aba no Excel.');
  });

  it('reads a sheet too big to read whole once a range is chosen, keeping a merge that starts before it', async () => {
    const { buildGridTable, gridFromWorksheet } = await import('../../../src/vnext/ai-catalog/source-grid');
    const { displayLocale } = await import('../../../src/vnext/ai-catalog/excel-display-format');
    type Visit = (cell: { value: unknown; numFmt: string; isMerged: boolean }, column: number) => void;
    const huge = {
      name: 'Historico', getColumn: () => ({ hidden: false }),
      eachRow: (_options: unknown, visit: (row: { hidden: boolean; eachCell: (o: unknown, cell: Visit) => void }, rowNumber: number) => void) => {
        for (let row = 1; row <= 100_001; row++) visit({ hidden: false, eachCell: (_o, cell) => { cell({ value: `L${row}`, numFmt: '', isMerged: false }, 1); } }, row);
      },
    };
    expect(() => gridFromWorksheet(huge as never, displayLocale('pt-BR'))).toThrow('SOURCE_TABLE_LIMIT');
    const part = buildGridTable(gridFromWorksheet(huge as never, displayLocale('pt-BR'), false, { top: 1, bottom: 150, left: 1, right: 10 }));
    expect(part.table?.rows).toHaveLength(150);

    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Specs');
      sheet.getCell('A1').value = 'Título'; sheet.mergeCells('A1:C3');
      sheet.getCell('B4').value = 'Modelo'; sheet.getCell('C4').value = 'Faixa'; sheet.getCell('D4').value = 'Exatidão';
      sheet.getCell('B5').value = 'PCON-Y17'; sheet.getCell('C5').value = '0 a 20 bar'; sheet.getCell('D5').value = '0,025 %FS';
    });
    const block = table(await read(bytes, 'parte.xlsx', { ranges: { Specs: 'B2:D5' } }));
    expect(block.rows[0][0]).toBe('Título');
    expect(block.merges[0]).toEqual({ row: 0, column: 0, rowSpan: 2, columnSpan: 2 });
    expect(block.rows[3]).toEqual(['PCON-Y17', '0 a 20 bar', '0,025 %FS']);
  });

  it('leaves out price columns under a merged group header, but not a title over the whole table', async () => {
    const bytes = await workbookBytes(book => {
      const sheet = book.addWorksheet('Lista');
      sheet.getCell('A1').value = 'Tabela de preços 2026'; sheet.mergeCells('A1:D1');
      sheet.getCell('C2').value = 'Preços'; sheet.mergeCells('C2:D2');
      sheet.addRow(['Modelo', 'Faixa', 'Y17', 'Y18']);
      sheet.addRow(['PCON-Y17', '0 a 20 bar', 1000, 1300]);
    });
    const intake = await read(bytes, 'precos.xlsx');
    const block = table(intake);
    expect(block.rows.map(row => row.join('|'))).toEqual(['Tabela de preços 2026|', 'Modelo|Faixa', 'PCON-Y17|0 a 20 bar']);
    expect(intake.ignored.filter(item => item.kind === 'column').map(item => item.message)).toEqual([
      'A coluna C (“Y17”) da aba “Lista” não foi importada: está no grupo “Preços”, que parece ser preço ou dado interno.',
      'A coluna D (“Y18”) da aba “Lista” não foi importada: está no grupo “Preços”, que parece ser preço ou dado interno.',
    ]);
  });

  it('uses the first filled cell as the header of a column when the sheet has no clear header row', async () => {
    const intake = await read('Lista de itens;;\nA1;;\n;Preço;\n;10;\n;;nota\n', 'solta.csv');
    expect(table(intake).rows).toEqual([['Lista de itens', ''], ['A1', ''], ['', 'nota']]);
    expect(intake.ignored[0].message).toBe('A coluna B (“Preço”) do arquivo “solta.csv” não foi importada: parece ser preço ou dado interno.');
  });

  it('counts the 10-sheet limit after the default exclusions and lists the extra sheets', async () => {
    const tenPlusInternal = await workbookBytes(book => {
      for (let index = 1; index <= 10; index++) specsSheet(book, `Linha ${index}`);
      book.addWorksheet('AccessLogs').addRow(['Timestamp', 'Action']);
      book.addWorksheet('HELPER').addRow(['Lista', 'Valor']);
    });
    expect((await read(tenPlusInternal, 'doze-abas.xlsx')).blocks).toHaveLength(10);
    const eleven = await workbookBytes(book => { for (let index = 1; index <= 11; index++) specsSheet(book, `Linha ${index}`); });
    const intake = await read(eleven, 'onze-abas.xlsx');
    expect(intake.blocks).toHaveLength(10);
    expect(intake.ignored).toContainEqual(expect.objectContaining({ sheet: 'Linha 11', reason: 'sheet-limit' }));
  });

  it('accepts .xlsm and resolves ExcelJS under bundler and plain Node module shapes', async () => {
    const bytes = await workbookBytes(book => specsSheet(book));
    expect(table(await read(bytes, 'macros.xlsm')).rows[1][0]).toBe('PCON-Y17');
    class Workbook {}
    expect(resolveWorkbookConstructor({ Workbook })).toBe(Workbook);
    expect(resolveWorkbookConstructor({ default: { Workbook } })).toBe(Workbook);
    expect(() => resolveWorkbookConstructor({ default: {} })).toThrow('SOURCE_XLSX_RUNTIME');
  });
});

describe('PDF intake', () => {
  function scannedPage() {
    const document = new jsPDF({ unit: 'pt', format: 'a4' });
    // 2x2 PNG stretched over the page: a scan with a digital footer.
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='), char => char.charCodeAt(0));
    document.addImage(png, 'PNG', 20, 20, 555, 760);
    document.setFontSize(8);
    document.text('PRESYS Instrumentos e Sistemas - www.presys.com.br', 40, 820);
    return document.output('arraybuffer');
  }

  it('flags a scanned page that only has a digital footer as needing visual reading', async () => {
    const intake = await read(scannedPage(), 'folder-escaneado.pdf');
    expect(intake.pdf?.pagesNeedingVisualReading).toEqual([1]);
    expect(intake.warnings.join(' ')).toContain('Página 1: a maior parte da página é uma imagem');
    expect(intake.blocks[0].warnings.join(' ')).toContain('leitura visual');
  });

  it('returns a partial result with the unread pages instead of failing on a dense 30-page PDF', async () => {
    const document = new jsPDF({ unit: 'pt', format: 'a4' });
    document.setFontSize(6);
    for (let page = 1; page <= 30; page++) {
      if (page > 1) document.addPage();
      for (let line = 0; line < 70; line++) document.text(`Página ${page} linha ${line}: faixa 0 a 20 bar, exatidão 0,025 %FS, resolução 0,001 bar.`, 20, 20 + line * 11);
    }
    const intake = await read(document.output('arraybuffer'), 'manual-denso.pdf');
    expect(intake.blocks.length).toBeGreaterThan(0);
    expect(intake.pdf!.pagesNotRead.length).toBeGreaterThan(0);
    expect(intake.pdf!.pagesRead[0]).toBe(1);
    expect(intake.warnings.join(' ')).toMatch(/Não foram lidas: \d+ a 30\. A leitura parou na página \d+/);
  }, 60000);

  it('stops at the 80-block budget with the unread pages listed instead of failing', async () => {
    const document = new jsPDF({ unit: 'pt', format: 'a4' });
    for (let page = 1; page <= 30; page++) {
      if (page > 1) document.addPage();
      for (let group = 0; group < 3; group++) {
        const top = 60 + group * 220;
        document.text(`Seção ${group + 1} da página ${page}`, 40, top);
        for (let row = 0; row < 3; row++) {
          document.text(`TA-${group}${row}N`, 60, top + 60 + row * 20);
          document.text(`${row + 1}0 a 140 °C`, 260, top + 60 + row * 20);
        }
      }
    }
    const intake = await read(document.output('arraybuffer'), 'muitas-tabelas.pdf');
    expect(intake.blocks.length).toBeLessThanOrEqual(SOURCE_LIMITS.blocks);
    expect(intake.blocks.filter(block => block.kind === 'table').length).toBeGreaterThan(10);
    expect(intake.pdf!.pagesNotRead.at(-1)).toBe(30);
    expect(intake.ignored).toContainEqual(expect.objectContaining({ kind: 'pages', reason: 'budget' }));
  }, 60000);

  it('reads only the chosen pages and says which were not read', async () => {
    const document = new jsPDF();
    for (let page = 1; page <= 5; page++) { if (page > 1) document.addPage(); document.text(`Especificações da página ${page}: faixa 0 a 20 bar`, 20, 30); }
    const intake = await read(document.output('arraybuffer'), 'manual.pdf', { pdfPages: { from: 3, to: 4 } });
    expect(intake.pdf).toMatchObject({ pageCount: 5, pagesRead: [3, 4], pagesNotRead: [1, 2, 5] });
    expect(intake.blocks.every(block => block.source.page === 3 || block.source.page === 4)).toBe(true);
  });

  it('says to remove the password of a protected PDF', async () => {
    const document = new jsPDF({ encryption: { userPassword: 'abc', ownerPassword: 'def', userPermissions: ['print'] } });
    document.text('Especificações', 20, 20);
    const error = await expectCode(read(document.output('arraybuffer'), 'protegido.pdf'), 'SOURCE_PASSWORD_PROTECTED');
    expect(sourceErrorMessage(error)).toContain('remova a senha');
  });

  it('accepts PDFs up to the PDF module limit (50 MB) while other files stop at 20 MB', async () => {
    expect(SOURCE_LIMITS.pdfBytes).toBe(MAX_PDF_BYTES);
    const big = new Uint8Array(21 * 1024 * 1024); big.set(new TextEncoder().encode('%PDF-1.7\n'));
    await expectCode(read(big, 'folder-grande.pdf'), 'SOURCE_PDF_INVALID');
    await expectCode(read(big, 'planilha-grande.csv'), 'SOURCE_FILE_LIMIT');
  });

  it('suggests a table for left-aligned text columns', async () => {
    const document = new jsPDF({ unit: 'pt' });
    [['Modelo', 'Faixa', 'Exatidão'], ['TA-25N', '-25 a 140 °C', '0,1 °C'], ['TA-35N', '35 a 350 °C', '0,2 °C'], ['TA-50N', '50 a 650 °C', '0,3 °C']]
      .forEach((row, ri) => row.forEach((value, ci) => document.text(value, 60 + ci * 160, 80 + ri * 20)));
    const intake = await read(document.output('arraybuffer'), 'tabela.pdf');
    expect(table(intake).rows[1]).toEqual(['TA-25N', '-25 a 140 °C', '0,1 °C']);
  });
});

describe('Photos and mixed batches', () => {
  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height);
    return bytes;
  };
  const heic = () => { const bytes = new Uint8Array(64); bytes.set(new TextEncoder().encode('\0\0\0\x18ftypheic'), 0); return bytes; };

  it('rejects a HEIC photo renamed to .jpg by its bytes and warns about low resolution', async () => {
    const error = await expectCode(read(heic(), 'IMG_2034.jpg'), 'SOURCE_IMAGE_HEIC');
    expect(sourceErrorMessage(error)).toContain('HEIC');
    const photo = await read(png(800, 600), 'PCON-Y17_frente.png');
    expect(photo.blocks[0]).toMatchObject({ kind: 'image', mime: 'image/png', widthPx: 800, heightPx: 600 });
    expect(photo.blocks[0].warnings.join(' ')).toContain('800 × 600 pixels');
  });

  it('reads a mixed batch file by file: one corrupt file, duplicates and the 10-file cap do not stop the rest', async () => {
    const xlsx = await workbookBytes(book => specsSheet(book));
    const csv = 'Modelo;Faixa\nPCON-Y17;0 a 20 bar\n';
    const files = [
      fileOf(xlsx, 'specs.xlsx'), fileOf('não é zip', 'quebrada.xlsx'), fileOf(csv, 'lista.csv'), fileOf(csv, 'lista (1).csv'),
      fileOf(png(2000, 1500), 'foto.png'), fileOf('x', 'notas.docx'),
      ...Array.from({ length: 5 }, (_, index) => fileOf(`Modelo;Faixa\nM${index};${index}\n`, `extra-${index}.csv`)),
    ];
    const results = await readSources(files);
    expect(results.map(result => result.status)).toEqual([
      'ready', 'error', 'ready', 'duplicate', 'ready', 'error', 'ready', 'ready', 'ready', 'ready', 'skipped',
    ]);
    expect(results[1].message).toContain('danificada');
    expect(results[3].duplicateOf).toBe('lista.csv');
    expect(results[5].code).toBe('SOURCE_OFFICE_DOCUMENT');
    expect(results[10].message).toContain('no máximo 10 arquivos');
  });
});
