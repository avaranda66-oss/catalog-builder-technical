import { describe, expect, it } from 'vitest';
import {
  canonicalDegreeSign, printedColumnNames, reviewExtraction, reviewSourceValues, sharedTableMessage, unitColumnText,
  valueConditionText, valueDisplayText,
  type ExtractionReview, type ReviewedTable,
} from '../../../src/vnext/ai-catalog/extraction-review';
import { photoEvidence } from '../../../src/vnext/ai-catalog/draft-client';
import type { ExtractionSource } from '../../../src/vnext/ai-catalog/fact-extraction-prompt';
import type { ExtractedPdf, ExtractedPdfPage } from '../../../src/vnext/ai-catalog/pdf-intake';

// A page shaped like the TA manual p. 6: the product family in the header,
// then one inputs table that applies to every model, with printed columns.
// The "±" and "°" come through the Symbol font (private use characters), as
// in the real manual; the model writes "ºC" (ordinal indicator).
const PM = '', DEG = '';
type Run = { text: string; x: number; y: number; width: number };
const line = (y: number, cells: [string, number, number][]): Run[] => cells.map(([text, x, width]) => ({ text, x, y, width }));
const LINES: Run[][] = [
  line(800, [['TA-25N / TA-35N / TA-50N', 300, 160]]),
  line(760, [['1.1.1 - Especificações Técnicas da Entrada', 60, 260]]),
  line(700, [['Entradas', 100, 50], ['Resolução', 260, 55], ['Exatidão', 380, 50]]),
  line(680, [['Pt-100', 40, 30], [`-200 a 850 ${DEG}C`, 100, 75], [`0,01 ${DEG}C`, 265, 40], [`${PM} 0,1 ${DEG}C`, 385, 45]]),
  line(660, [['TC-K', 40, 25], [`-270 a -150 ${DEG}C`, 100, 80], [`0,1 ${DEG}C`, 265, 35], [`${PM} 0,5 ${DEG}C`, 385, 45]]),
  line(640, [['TC-K', 40, 25], [`-150 a 1370 ${DEG}C`, 100, 80], [`0,1 ${DEG}C`, 265, 35], [`${PM} 0,2 ${DEG}C`, 385, 45]]),
];
const pageText = (lines: Run[][]) => lines.map(items => items.map(item => item.text).join(' ')).join('\n');
const page = (number: number, lines: Run[][]): ExtractedPdfPage => {
  const text = pageText(lines);
  return { number, text, textLength: text.length, needsVisualExtraction: false, runs: lines.flat() };
};
const PDF: ExtractedPdf = {
  fileName: 'manual-ta.pdf', sha256: 'c'.repeat(64), pageCount: 8, truncated: false,
  pages: [
    page(5, [line(800, [['TA-25L / TA-35L', 300, 120]]), line(700, [['Faixa', 60, 40], ['10 a 50 °C', 200, 60]])]),
    page(6, LINES),
    page(7, [line(800, [['Recursos especiais de software', 60, 200]])]),
  ],
};
const SOURCE: ExtractionSource = { sourceId: 'manual', fileName: 'manual-ta.pdf', sha256: 'c'.repeat(64), pageCount: 8, firstPage: 5, lastPage: 7 };
const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
const quote = (cells: string[]) => cells.join(' ');
type Cell = { column: string; literal: string; unit?: string; condition?: string };
const row = (label: string, cells: Cell[], quoteText: string, pageNumber = 6) =>
  ({ label, sourceRef: { page: pageNumber, quote: quoteText }, values: cells });
const PT100_QUOTE = quote(['Pt-100', `-200 a 850 ${DEG}C`, `0,01 ${DEG}C`, `${PM} 0,1 ${DEG}C`]);
const TCK1_QUOTE = quote(['TC-K', `-270 a -150 ${DEG}C`, `0,1 ${DEG}C`, `${PM} 0,5 ${DEG}C`]);
const TCK2_QUOTE = quote(['TC-K', `-150 a 1370 ${DEG}C`, `0,1 ${DEG}C`, `${PM} 0,2 ${DEG}C`]);
const sharedAnswer = (rows: ReturnType<typeof row>[], extra: Record<string, unknown> = {}) => ({
  title: 'TA-25N / TA-35N / TA-50N', models: TA, sections: [],
  sharedTables: [{ title: '1.1.1 - Especificações Técnicas da Entrada', columns: ['Entradas', 'Resolução', 'Exatidão'], rows }],
  pages: [{ page: 5, content: 'other-models' }, { page: 6, content: 'shared-table' }],
  ...extra,
});
const shared = (review: ExtractionReview): ReviewedTable => {
  const table = review.tables.find(item => item.kind === 'shared');
  if (!table) throw new Error('no shared table');
  return table;
};
const valueOf = (table: ReviewedTable, label: string, column: string, nth = 0) =>
  table.report.values.filter(value => value.label === label && value.model === column)[nth];

describe('shared tables (spike condition 5: tables valid for every model)', () => {
  it('verifies each value by its printed column, with the right "±" and "°"', () => {
    const review = reviewExtraction(sharedAnswer([
      row('Pt-100', [{ column: 'Entradas', literal: '-200 a 850 ºC' }, { column: 'Resolução', literal: '0,01 ºC', unit: 'ºC' },
        { column: 'Exatidão', literal: '± 0,1 ºC' }], PT100_QUOTE),
    ]), SOURCE, PDF, { models: TA });
    const table = shared(review);
    expect(table.columns).toEqual(['Entradas', 'Resolução', 'Exatidão']);
    expect(table.appliesTo).toEqual(TA);
    for (const column of table.columns) expect(valueOf(table, 'Pt-100', column).status).toBe('VERIFIED_TEXT');
    const accuracy = valueOf(table, 'Pt-100', 'Exatidão');
    expect(accuracy.candidates[0].value).toBe('± 0,1 °C');
    expect([...accuracy.candidates[0].value].some(character => character >= '' && character <= '')).toBe(false);
    // The unit already printed in the literal is not repeated (condition 6): no row split, no "°C °C".
    expect(table.extraction.proposal.sections[0].rows).toHaveLength(1);
    expect(table.extraction.proposal.sections[0].rows[0].unit).toBe('');
    expect(table.messages.get(accuracy.id)).toBe('Conferido no texto da página 6 de manual-ta.pdf.');
  });

  it('never verifies a value under another column and says "coluna", not "modelo"', () => {
    const review = reviewExtraction(sharedAnswer([
      row('Pt-100', [{ column: 'Resolução', literal: '± 0,1 ºC' }], PT100_QUOTE),
    ]), SOURCE, PDF, { models: TA });
    const value = valueOf(shared(review), 'Pt-100', 'Resolução');
    expect(value.status).toBe('UNVERIFIED');
    expect(value.candidates[0].reason).toBe('COLUMN_MISMATCH');
    expect(shared(review).messages.get(value.id)).toBe('Na página 6 de manual-ta.pdf, este valor está em outra coluna, não em "Resolução".');
  });

  it('keeps rows with the same name apart by their own line', () => {
    const review = reviewExtraction(sharedAnswer([
      row('TC-K', [{ column: 'Entradas', literal: '-270 a -150 ºC' }, { column: 'Exatidão', literal: '± 0,5 ºC' }], TCK1_QUOTE),
      row('TC-K', [{ column: 'Entradas', literal: '-150 a 1370 ºC' }, { column: 'Exatidão', literal: '± 0,2 ºC' }], TCK2_QUOTE),
      // Wrong: the second line's accuracy cited with the first line.
      row('TC-K', [{ column: 'Exatidão', literal: '± 0,2 ºC' }], TCK1_QUOTE),
    ]), SOURCE, PDF, { models: TA });
    const table = shared(review);
    expect(valueOf(table, 'TC-K', 'Exatidão', 0)).toMatchObject({ status: 'VERIFIED_TEXT', candidates: [{ value: '± 0,5 °C' }] });
    expect(valueOf(table, 'TC-K', 'Exatidão', 1)).toMatchObject({ status: 'VERIFIED_TEXT', candidates: [{ value: '± 0,2 °C' }] });
    expect(valueOf(table, 'TC-K', 'Exatidão', 2).status).toBe('UNVERIFIED');
  });

  it('sends a quote that runs over two table lines to a person, never to "verified"', () => {
    const across = `${PM} 0,5 ${DEG}C TC-K -150 a 1370 ${DEG}C`;
    const review = reviewExtraction(sharedAnswer([
      row('TC-K', [{ column: 'Entradas', literal: '-150 a 1370 ºC' }], across),
    ]), SOURCE, PDF, { models: TA });
    const value = valueOf(shared(review), 'TC-K', 'Entradas');
    expect(value.status).toBe('VISUAL_ONLY');
    expect(value.candidates[0].reason).toBe('LABEL_UNCLEAR');
    expect(shared(review).report.proposal.sections[0].rows[0].values[0]).toMatchObject({
      status: 'known', candidate: { verification: 'VISUAL_ONLY' } });
    expect(shared(review).report.counts.VERIFIED_TEXT).toBe(0);
  });

  it('counts what it leaves out: undeclared columns and pages outside the range', () => {
    const review = reviewExtraction(sharedAnswer([
      row('Pt-100', [{ column: 'Remarks', literal: 'IEC 60751' }, { column: 'Resolução', literal: '0,01 ºC' }], PT100_QUOTE),
      row('Pt-100', [{ column: 'Resolução', literal: '0,01 ºC' }], PT100_QUOTE, 9),
    ]), SOURCE, PDF, { models: TA });
    expect(review.dropped.map(item => item.reason).sort()).toEqual(['COLUMN_NOT_DECLARED', 'PAGE_OUTSIDE_RANGE']);
    expect(review.summary).toContain('2 leituras ficaram de fora');
  });
});

describe('column headers printed in two lines', () => {
  const ACCESSORIES = [
    line(700, [['Descrição', 60, 50], ['Orifícios', 200, 50], ['Código de Encomenda', 380, 110]]),
    line(690, [['TA-25N / TA-35N / TA-50N', 380, 130]]),
    line(670, [['BP01', 60, 25], ['1 x 3/4"', 200, 40], ['06.04.0011-00', 390, 70]]),
  ];
  const pdf: ExtractedPdf = { ...PDF, pages: [page(5, []), page(6, []), page(7, ACCESSORIES)] };

  it('uses the first printed line of a glued header, never a name another column shares', () => {
    const lines = pageText(ACCESSORIES).split('\n');
    expect(printedColumnNames(['Orifícios', 'Código de Encomenda TA-25N / TA-35N / TA-50N'], lines))
      .toEqual(['Orifícios', 'Código de Encomenda']);
    expect(printedColumnNames(['Código de Encomenda A', 'Código de Encomenda B'], lines))
      .toEqual(['Código de Encomenda A', 'Código de Encomenda B']);
    expect(printedColumnNames(['Faixa'], lines)).toEqual(['Faixa']);
  });

  it('verifies an order code under its glued header', () => {
    const review = reviewExtraction({ title: 'TA', models: TA, sections: [], pages: [], sharedTables: [{ title: 'Blocos de Prova',
      columns: ['Orifícios', 'Código de Encomenda TA-25N / TA-35N / TA-50N'],
      rows: [row('BP01', [{ column: 'Orifícios', literal: '1 x 3/4"' },
        { column: 'Código de Encomenda TA-25N / TA-35N / TA-50N', literal: '06.04.0011-00' }], 'BP01 1 x 3/4" 06.04.0011-00', 7)] }] },
    SOURCE, pdf, { models: TA });
    const table = shared(review);
    expect(table.columns).toEqual(['Orifícios', 'Código de Encomenda']);
    expect(table.report.values.map(value => `${value.model}=${value.status}`))
      .toEqual(['Orifícios=VERIFIED_TEXT', 'Código de Encomenda=VERIFIED_TEXT']);
  });
});

describe('columns named like the units in their cells (PCON-Y17 ranges)', () => {
  const RANGES = [
    line(720, [['PCON-Y17', 60, 60]]),
    line(700, [['Ranges', 40, 40], ['bar', 120, 20], ['psi', 200, 20], ['Accuracy', 300, 50]]),
    line(680, [['(3)', 45, 15], ['1 bar', 110, 30], ['0-15 psi', 185, 45], ['± 0.012 % FS', 290, 70]]),
    line(660, [['(4)', 45, 15], ['2 bar', 110, 30], ['0-30 psi', 185, 45], ['± 0.012 % FS', 290, 70]]),
  ];
  const pdf: ExtractedPdf = { ...PDF, pages: [page(5, []), page(6, RANGES), page(7, [])] };
  const ranges = (rows: ReturnType<typeof row>[]) => ({ title: 'PCON-Y17', models: ['PCON-Y17'], sections: [], pages: [],
    sharedTables: [{ title: 'Pressure Controller Range (C1)', columns: ['bar', 'psi', 'Accuracy'], rows }] });

  it('ties each value to its header by the page layout when the header word is also its unit', () => {
    const review = reviewExtraction(ranges([
      row('(3)', [{ column: 'bar', literal: '1 bar' }, { column: 'psi', literal: '0-15 psi' }, { column: 'Accuracy', literal: '± 0.012 % FS' }],
        '(3) 1 bar 0-15 psi ± 0.012 % FS'),
    ]), SOURCE, pdf, { models: ['PCON-Y17'] });
    const table = shared(review);
    expect(table.report.values.map(value => `${value.model}=${value.status}`))
      .toEqual(['bar=VERIFIED_TEXT', 'psi=VERIFIED_TEXT', 'Accuracy=VERIFIED_TEXT']);
    expect(table.report.values[0].candidates[0].usedLayout).toBe(true);
  });

  it('keeps a condition printed for one cell next to its value, without printing the row twice', () => {
    const withNote = [...RANGES, line(640, [['* using 2 σ method', 40, 90]])];
    const notePdf: ExtractedPdf = { ...pdf, pages: [page(5, []), page(6, withNote), page(7, [])] };
    const review = reviewExtraction(ranges([
      row('(3)', [{ column: 'bar', literal: '1 bar' }, { column: 'psi', literal: '0-15 psi' },
        { column: 'Accuracy', literal: '± 0.012 % FS', condition: 'using 2 σ method' }],
      '(3) 1 bar 0-15 psi ± 0.012 % FS'),
      row('(4)', [{ column: 'bar', literal: '2 bar' }, { column: 'Accuracy', literal: '± 0.012 % FS', condition: 'at 99 °C' }],
        '(4) 2 bar 0-30 psi ± 0.012 % FS'),
    ]), SOURCE, notePdf, { models: ['PCON-Y17'] });
    const table = shared(review);
    expect(table.extraction.proposal.sections[0].rows.map(item => item.label)).toEqual(['(3)', '(4)']);
    const accuracy = table.report.values.find(value => value.label === '(3)' && value.model === 'Accuracy')!;
    expect(accuracy.status).toBe('VERIFIED_TEXT');
    expect(valueConditionText(table, accuracy)).toBe('using 2 σ method');
    const bar = table.report.values.find(value => value.label === '(3)' && value.model === 'bar')!;
    expect(valueConditionText(table, bar)).toBe('');
    // A condition the page does not print is left out and counted.
    expect(review.dropped).toEqual([expect.objectContaining({ reason: 'CONDITION_NOT_PRINTED', label: '(4)', model: 'Accuracy' })]);
  });

  it('never verifies a unit-named value placed under another header', () => {
    const review = reviewExtraction(ranges([
      row('(3)', [{ column: 'bar', literal: '0-15 psi' }, { column: 'psi', literal: '1 bar' }], '(3) 1 bar 0-15 psi ± 0.012 % FS'),
      row('(4)', [{ column: 'bar', literal: '1 bar' }], '(3) 1 bar 0-15 psi ± 0.012 % FS'),
    ]), SOURCE, pdf, { models: ['PCON-Y17'] });
    const table = shared(review);
    expect(table.report.values.filter(value => value.status !== 'MISSING').map(value => `${value.label} ${value.model}=${value.status}`))
      .toEqual(['(3) bar=UNVERIFIED', '(3) psi=UNVERIFIED', '(4) bar=UNVERIFIED']);
    expect(table.report.counts.VERIFIED_TEXT).toBe(0);
  });

  it('a quote over the header line and the row never counts as verified', () => {
    const review = reviewExtraction(ranges([
      row('(3)', [{ column: 'Accuracy', literal: '± 0.012 % FS' }, { column: 'bar', literal: '1 bar' }],
        'Ranges bar psi Accuracy (3) 1 bar 0-15 psi ± 0.012 % FS'),
    ]), SOURCE, pdf, { models: ['PCON-Y17'] });
    const values = shared(review).report.values.filter(item => item.status !== 'MISSING');
    expect(values.map(item => item.status)).not.toContain('VERIFIED_TEXT');
    expect(values.find(item => item.model === 'Accuracy')?.candidates[0].reason).toBe('LABEL_UNCLEAR');
    // "bar" of the header is not inside a value of the row: no second chance by layout.
    expect(values.find(item => item.model === 'bar')?.status).toBe('UNVERIFIED');
  });
});

describe('every page read is accounted for (no page vanishes in silence)', () => {
  it('lists every page of the range, with the reason when it gave nothing', () => {
    const review = reviewExtraction(sharedAnswer([
      row('Pt-100', [{ column: 'Resolução', literal: '0,01 ºC' }], PT100_QUOTE),
    ]), SOURCE, PDF, { models: TA, trimmedByServer: 1 });
    expect(review.pages.map(item => item.page)).toEqual([5, 6, 7]);
    expect(review.pages[0].message).toBe('Página 5: fala de outros modelos, que não foram pedidos; nada foi aproveitado.');
    expect(review.pages[1]).toMatchObject({ values: 1, verified: 1, tables: ['1.1.1 - Especificações Técnicas da Entrada'] });
    expect(review.pages[1].message).toBe('Página 6 ("1.1.1 - Especificações Técnicas da Entrada"): 1 valor conferido no texto.');
    expect(review.pages[2].message).toBe('Página 7: a IA não trouxe nenhum valor desta página. Confira olhando a página se falta alguma coisa.');
    expect(review.summary).toBe('Li as páginas 5 a 7 de manual-ta.pdf: 1 valor conferido no texto. ' +
      'As páginas 5, 7 não trouxeram valores; veja o motivo abaixo. 1 leitura ficou de fora (fora das páginas pedidas ou além do limite).');
  });

  it('survives an empty or malformed answer and still lists the pages', () => {
    for (const answer of [{}, null, 'texto', { sections: 'x', sharedTables: [{ rows: [{ label: 3 }] }] }]) {
      const review = reviewExtraction(answer, SOURCE, PDF, { models: TA });
      expect(review.tables).toEqual([]);
      expect(review.pages).toHaveLength(3);
      expect(review.counts).toEqual({ verified: 0, toCheck: 0, unverified: 0, missing: 0 });
      expect(review.summary).toBe('Li as páginas 5 a 7 de manual-ta.pdf, mas não encontrei nenhum valor. ' +
        'As páginas 5, 6, 7 não trouxeram valores; veja o motivo abaixo.');
    }
  });

  it('refuses a review against another file', () => {
    expect(() => reviewExtraction({}, { ...SOURCE, sha256: 'd'.repeat(64) }, PDF)).toThrow('EXTRACTION_SOURCE_MISMATCH');
  });
});

describe('model tables keep the spike path', () => {
  const MODELS_PDF: ExtractedPdf = { ...PDF, pages: [page(5, [
    line(720, [['TA-25N', 260, 40], ['TA-35N', 360, 40]]),
    line(700, [['Potência Elétrica', 60, 90], ['200 W', 262, 30], ['300 W', 362, 30]]),
  ]), page(6, LINES), page(7, [])] };
  const answer = {
    title: 'TA', models: ['TA-25N', 'TA-35N'], sharedTables: [], pages: [],
    sections: [{ title: 'Especificações', rows: [{ key: 'electric-power', label: 'Potência Elétrica', values: [
      { model: 'TA-25N', literal: '200', unit: 'W', sourceRef: { page: 5, quote: 'Potência Elétrica 200 W 300 W' } },
      { model: 'TA-35N', literal: '300', unit: 'W', sourceRef: { page: 5, quote: 'Potência Elétrica 200 W 300 W' } },
      { model: 'TA-35N', literal: '999', unit: 'W', sourceRef: { page: 11, quote: 'Potência Elétrica 999 W' } },
    ] }] }],
  };
  it('verifies model columns, drops pages outside the range and feeds the divergence finder', () => {
    const review = reviewExtraction(answer, { ...SOURCE, sourceId: 'folder' }, MODELS_PDF, { models: ['TA-25N', 'TA-35N'] });
    const table = review.tables[0];
    expect(table.kind).toBe('models');
    expect(table.report.values.map(value => value.status)).toEqual(['VERIFIED_TEXT', 'VERIFIED_TEXT']);
    expect(review.dropped).toEqual([expect.objectContaining({ reason: 'PAGE_OUTSIDE_RANGE', literal: '999' })]);
    expect(reviewSourceValues(review).map(value => `${value.model}=${value.value}`)).toEqual(['TA-25N=200', 'TA-35N=300']);
  });
});

describe('photos and scanned pages', () => {
  it('sends every value of a photo to a person (VISUAL_ONLY), never to "verified"', () => {
    const photo = photoEvidence('foto.jpg', 'e'.repeat(64));
    const review = reviewExtraction(sharedAnswer([
      { label: 'Pt-100', sourceRef: { page: 1, quote: 'Pt-100 0,01 °C', box_2d: [100, 100, 200, 300] },
        values: [{ column: 'Resolução', literal: '0,01 °C' }] },
    ]), { ...SOURCE, fileName: 'foto.jpg', sha256: 'e'.repeat(64), pageCount: 1, firstPage: 1, lastPage: 1 }, photo, { models: TA });
    expect(shared(review).report.values.map(value => value.status)).toEqual(['MISSING', 'VISUAL_ONLY', 'MISSING']);
    expect(shared(review).report.values[1].candidates[0].reason).toBe('PAGE_NEEDS_VISUAL_CHECK');
    expect(review.pages[0].message).toBe('Página 1 ("1.1.1 - Especificações Técnicas da Entrada"): 1 para conferir olhando a página.');
  });
});

describe('unit shown once and degree signs (spike condition 6)', () => {
  it('shows the unit once and never edits the literal', () => {
    expect(valueDisplayText('260 x 200 x 305 mm', 'mm')).toBe('260 x 200 x 305 mm');
    expect(valueDisplayText('11 min (25 °C to -25 °C)', 'min')).toBe('11 min (25 °C to -25 °C)');
    expect(valueDisplayText('200', 'W')).toBe('200 W');
    expect(valueDisplayText('305', 'm')).toBe('305 m');
    expect(valueDisplayText('0,01', '')).toBe('0,01');
    expect(unitColumnText('mm', ['260 x 200 x 305 mm', '315 x 200 x 305 mm'])).toBe('');
    expect(unitColumnText('mm', ['260 x 200 x 305 mm', '315'])).toBe('mm');
    expect(unitColumnText('W', [])).toBe('W');
  });

  it('turns an ordinal indicator or ring before C, F or K into the degree sign, one character for one', () => {
    expect(canonicalDegreeSign('20ºC e 68 ˚F, 300 ºK')).toBe('20°C e 68 °F, 300 °K');
    expect(canonicalDegreeSign('1º Cliente, nº Contrato, 2º lugar')).toBe('1º Cliente, nº Contrato, 2º lugar');
    expect(canonicalDegreeSign('ºCelsius')).toBe('ºCelsius');
    const text = 'a 20ºC b';
    expect(canonicalDegreeSign(text)).toHaveLength(text.length);
  });

  it('words a shared-table message by column for the reasons that name a model', () => {
    const base = { id: 's/r/0', sectionId: 's', sectionTitle: 'T', rowId: 'r', label: 'Pt-100', unit: '', condition: '',
      modelIndex: 0, model: 'Resolução' } as const;
    const candidate = (reason: string) => ({ value: '0,01', source: { sourceId: 'manual', page: 6, quote: 'Pt-100 0,01' },
      status: 'UNVERIFIED' as const, reason: reason as never });
    expect(sharedTableMessage({ ...base, status: 'UNVERIFIED', candidates: [candidate('MODEL_NOT_ON_PAGE')] }))
      .toBe('A coluna "Resolução" não aparece na página 6.');
    expect(sharedTableMessage({ ...base, status: 'VISUAL_ONLY', candidates: [{ ...candidate('COLUMN_UNCLEAR'), status: 'VISUAL_ONLY' }] }))
      .toBe('Na página 6, não dá para saber pelo texto se este valor é da coluna "Resolução"; confira olhando a página.');
    expect(sharedTableMessage({ ...base, status: 'UNVERIFIED', candidates: [candidate('QUOTE_NOT_ON_PAGE')] }))
      .toBe('O trecho citado não foi encontrado na página 6.');
  });
});
