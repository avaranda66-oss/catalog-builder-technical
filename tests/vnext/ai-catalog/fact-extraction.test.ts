import { describe, expect, it } from 'vitest';
import { FactProposalSchema } from '../../../src/vnext/ai-catalog/contracts';
import {
  FACT_EXTRACTION_PROMPT_VERSION, MISSING_VALUE_REASON, buildFactExtractionPrompt, cleanUnit, divergenceProposal,
  factSheetResponseSchema, factSlug, findSourceDivergences, normalizeSymbolText, numericSignature, sourceFactValues,
  toFactProposal, withNormalizedSymbols,
  type ExtractionSource, type SourceFactValue,
} from '../../../src/vnext/ai-catalog/fact-extraction';
import {
  pdfEvidenceSource, verificationMessage, verifyFactProposal, type PdfEvidenceSource,
} from '../../../src/vnext/ai-catalog/fact-verifier';
import type { ExtractedPdf } from '../../../src/vnext/ai-catalog/pdf-intake';

const FOLDER: ExtractionSource = {
  sourceId: 'ta-folder', fileName: 'presys-ta-folder.pdf', sha256: 'a'.repeat(64), pageCount: 20, firstPage: 9, lastPage: 13,
};
const MANUAL: ExtractionSource = {
  sourceId: 'ta-manual-pt', fileName: 'manual-ta.pdf', sha256: 'b'.repeat(64), pageCount: 39, firstPage: 5, lastPage: 8,
};
const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
type Reading = { model: string; literal: string; unit?: string; condition?: string; page?: number; quote?: string; file?: string; box_2d?: number[] };
const value = (item: Reading) => ({
  model: item.model, literal: item.literal,
  ...(item.unit !== undefined ? { unit: item.unit } : {}), ...(item.condition !== undefined ? { condition: item.condition } : {}),
  sourceRef: { ...(item.file ? { file: item.file } : {}), page: item.page ?? 9, quote: item.quote ?? `Electric Power: ${item.literal} W`,
    ...(item.box_2d ? { box_2d: item.box_2d } : {}) },
});
const sheet = (rows: { key: string; label: string; values: Reading[] }[], models = TA) => ({
  title: 'TA-25N / TA-35N / TA-50N', models,
  sections: [{ title: 'Technical Specifications', rows: rows.map(row => ({ key: row.key, label: row.label, values: row.values.map(value) })) }],
});

describe('fact extraction prompt and response schema (FR-66a)', () => {
  it('asks for literal copies, the physical page and only the requested models', () => {
    const prompt = buildFactExtractionPrompt({ sources: [FOLDER], models: TA });
    expect(prompt).toContain('file "ta-folder": "presys-ta-folder.pdf", 20 pages. Read ONLY pages 9 to 13.');
    expect(prompt).toContain('written exactly like this: TA-25N, TA-35N, TA-50N');
    expect(prompt).toContain('NOT the page number printed on the page');
    expect(prompt).toContain('Copy every value exactly as printed');
    expect(prompt).toContain('operating-range');
    expect(buildFactExtractionPrompt({ sources: [{ ...FOLDER, lastPage: 9 }] })).toContain('Read ONLY page 9.');
    expect(buildFactExtractionPrompt({ sources: [FOLDER] })).toContain('at most 6');
    expect(FACT_EXTRACTION_PROMPT_VERSION).toMatch(/^fr66a-/);
  });

  it('asks for the first line of a two-line label in the quote and units without footnote marks', () => {
    const prompt = buildFactExtractionPrompt({ sources: [FOLDER], models: TA });
    expect(prompt).toContain('copy the first line of the label cell followed by the value cells');
    expect(prompt).toContain('Leave out a second line printed under the label');
    expect(prompt).toContain('without a footnote mark such as "*"');
  });

  it('names the file only when several files are sent', () => {
    type Node = { properties: Record<string, Node>; items: Node; required?: string[]; enum?: string[] };
    const sourceRef = (schema: unknown) =>
      (schema as Node).properties.sections.items.properties.rows.items.properties.values.items.properties.sourceRef;
    expect(sourceRef(factSheetResponseSchema(['ta-folder'])).properties.file).toBeUndefined();
    const multi = sourceRef(factSheetResponseSchema(['ta-folder', 'ta-manual-pt']));
    expect(multi.properties.file.enum).toEqual(['ta-folder', 'ta-manual-pt']);
    expect(multi.required).toEqual(['file', 'page', 'quote']);
  });

  it('keeps nested array limits off sections and values (Gemini rejects the fully limited schema)', () => {
    const schema = factSheetResponseSchema(['ta-folder']) as { properties: Record<string, Record<string, unknown>> };
    expect(schema.properties.sections.maxItems).toBeUndefined();
    expect(schema.properties.models.maxItems).toBe(6);
    expect(JSON.stringify(schema)).toContain('"maxItems":16');
  });
});

describe('toFactProposal: the model answer becomes an untrusted FactProposal', () => {
  it('builds one value position per model, stamped with the file id and sha256', () => {
    const { proposal, dropped, rowKeys } = toFactProposal(sheet([{ key: 'electric-power', label: 'Electric Power:', values: [
      { model: 'TA-25N', literal: '200', unit: 'W' }, { model: 'TA-35N', literal: '300', unit: 'W' }, { model: 'TA-50N', literal: '400', unit: 'W' },
    ] }]), [FOLDER], { models: TA });
    expect(FactProposalSchema.parse(proposal)).toEqual(proposal);
    expect(dropped).toEqual([]);
    const row = proposal.sections[0].rows[0];
    expect(row).toMatchObject({ id: 'electric-power', label: 'Electric Power:', unit: 'W', condition: '' });
    expect(row.values[1]).toEqual({ status: 'known', candidate: { value: '300', source: {
      sourceId: 'ta-folder', page: 9, quote: 'Electric Power: 300 W', sha256: 'a'.repeat(64) } } });
    expect(rowKeys).toEqual({ 'technical-specifications/electric-power': 'electric-power' });
  });

  it('drops a similar model name instead of filing it under the requested one', () => {
    const { proposal, dropped } = toFactProposal(sheet([{ key: 'weight', label: 'Weight', values: [
      { model: 'TA-25NL', literal: '12.0', unit: 'kg' }, { model: 'ta-35n', literal: '10.5', unit: 'kg' },
    ] }]), [FOLDER], { models: TA });
    expect(dropped).toEqual([{ section: 'Technical Specifications', label: 'Weight', model: 'TA-25NL', literal: '12.0', reason: 'MODEL_NOT_REQUESTED' }]);
    expect(proposal.sections[0].rows[0].values.map(fact => fact.status)).toEqual(['missing', 'known', 'missing']);
    expect(proposal.sections[0].rows[0].values[0]).toEqual({ status: 'missing', reason: MISSING_VALUE_REASON });
  });

  it('uses the answer models when none are requested', () => {
    const { proposal } = toFactProposal(sheet([{ key: 'weight', label: 'Weight', values: [
      { model: 'PCON-Y17', literal: '6.2', unit: 'kg' }] }], ['PCON-Y17']), [FOLDER]);
    expect(proposal.models).toEqual(['PCON-Y17']);
  });

  it('splits a row whose values carry different conditions or units (one unit per proposal row)', () => {
    const { proposal, rowKeys } = toFactProposal(sheet([{ key: 'cooling-time', label: 'Cooling Time', values: [
      { model: 'TA-25N', literal: '11', unit: 'min', condition: '25 °C to -25 °C' },
      { model: 'TA-35N', literal: '16', unit: 'min', condition: '25 °C to -35 °C' },
    ] }]), [FOLDER], { models: TA });
    const rows = proposal.sections[0].rows;
    expect(rows.map(row => [row.id, row.condition])).toEqual([['cooling-time', '25 °C to -25 °C'], ['cooling-time-2', '25 °C to -35 °C']]);
    expect(rows[0].values.map(fact => fact.status)).toEqual(['known', 'missing', 'missing']);
    expect(rowKeys['technical-specifications/cooling-time-2']).toBe('cooling-time');
  });

  it('turns two different readings of one position into a conflict and repeats into one value', () => {
    const { proposal } = toFactProposal(sheet([{ key: 'weight', label: 'Weight', values: [
      { model: 'TA-25N', literal: '10.5', unit: 'kg' }, { model: 'TA-25N', literal: '10.5', unit: 'kg', page: 10 },
      { model: 'TA-35N', literal: '10.5', unit: 'kg' }, { model: 'TA-35N', literal: '12.5', unit: 'kg' },
    ] }]), [FOLDER], { models: TA });
    const [first, second] = proposal.sections[0].rows[0].values;
    expect(first.status).toBe('known');
    expect(second.status === 'conflict' && second.candidates.map(item => item.value)).toEqual(['10.5', '12.5']);
  });

  it('lists every value it cannot represent, with the reason', () => {
    // With several files, a value must say which one it came from.
    const { dropped, proposal } = toFactProposal(sheet([{ key: 'power', label: 'Power', values: [
      { model: 'TA-25N', literal: '200' },
      { model: 'TA-35N', literal: '300', file: 'other-file' },
      { model: 'TA-50N', literal: '400', file: 'ta-manual-pt', page: 5 },
    ] }]), [FOLDER, MANUAL], { models: TA });
    expect(dropped.map(item => item.reason)).toEqual(['UNKNOWN_FILE', 'UNKNOWN_FILE']);
    const kept = proposal.sections[0].rows[0].values[2];
    expect(kept.status === 'known' && kept.candidate.source).toMatchObject({ sourceId: 'ta-manual-pt', sha256: 'b'.repeat(64) });
    const single = toFactProposal(sheet([{ key: 'power', label: 'Power', values: [
      { model: 'TA-25N', literal: '200', page: 21 }, { model: 'TA-35N', literal: '300', quote: '   ' },
      { model: 'TA-50N', literal: '  ' }, { model: 'TA-50N', literal: '400\u0007' }, { model: 'TA-50N', literal: '400' },
    ] }]), [FOLDER], { models: TA });
    expect(single.dropped.map(item => item.reason)).toEqual(['PAGE_NOT_IN_FILE', 'EMPTY_QUOTE', 'EMPTY_LITERAL', 'INVALID_TEXT']);
    expect(single.proposal.sections[0].rows[0].values[2].status).toBe('known');
  });

  it('keeps a valid box_2d and ignores an invalid one', () => {
    const { proposal } = toFactProposal(sheet([{ key: 'power', label: 'Power', values: [
      { model: 'TA-25N', literal: '200', box_2d: [10, 20, 30, 40] }, { model: 'TA-35N', literal: '300', box_2d: [30, 20, 10, 40] },
    ] }]), [FOLDER], { models: TA });
    const [first, second] = proposal.sections[0].rows[0].values;
    expect(first.status === 'known' && first.candidate.source.box_2d).toEqual([10, 20, 30, 40]);
    expect(second.status === 'known' && second.candidate.source.box_2d).toBeUndefined();
  });

  it('respects the proposal limits: 16 rows per section and 192 facts in all', () => {
    const many = (count: number) => Array.from({ length: count }, (_, index) => ({
      key: `row-${index}`, label: `Row ${index}`, values: [{ model: 'TA-25N', literal: String(index) }] }));
    const split = toFactProposal(sheet(many(20)), [FOLDER], { models: TA }).proposal;
    expect(split.sections.map(section => [section.title, section.rows.length]))
      .toEqual([['Technical Specifications', 16], ['Technical Specifications (continuação)', 4]]);
    const capped = toFactProposal({ title: 'x', models: TA, sections: Array.from({ length: 14 }, (_, index) => ({
      title: `S${index}`, rows: many(16).map(row => ({ ...row, values: row.values.map(value) })) })) }, [FOLDER], { models: TA });
    expect(capped.proposal.sections.reduce((sum, section) => sum + section.rows.length, 0)).toBe(192);
    expect(capped.dropped.filter(item => item.reason === 'LIMIT_REACHED')).toHaveLength(14 * 16 - 192);
  });

  it('refuses an answer that is not a fact sheet or has no usable value', () => {
    expect(() => toFactProposal('not json', [FOLDER])).toThrow();
    expect(() => toFactProposal(sheet([]), [FOLDER], { models: TA })).toThrow('FACT_EXTRACTION_EMPTY');
    expect(() => toFactProposal(sheet([]), [])).toThrow('FACT_EXTRACTION_NO_SOURCE');
  });

  it('makes ids with the proposal alphabet', () => {
    expect(factSlug('Exatidão do Display (°C)')).toBe('exatidao-do-display-c');
    expect(factSlug('---')).toBe('');
  });
});

describe('Symbol-font signs and footnote marks (PRESYS TA manual)', () => {
  it('turns Symbol-font private use characters into the signs they print, one for one', () => {
    const raw = 'Exatidão do Display  0,1 C  25,4 mm 10 M';
    const clean = normalizeSymbolText(raw);
    expect(clean).toBe('Exatidão do Display ± 0,1 °C Ø 25,4 mm 10 MΩ');
    expect(clean).toHaveLength(raw.length);
    expect(normalizeSymbolText('∅ 25,4 mm e ⌀ 6 mm')).toBe('Ø 25,4 mm e Ø 6 mm');
    expect(normalizeSymbolText('Congurator ± 0.1 °C')).toBe('Congurator ± 0.1 °C');
  });

  it('normalizes the page text and the text positions of a read PDF, and nothing else', () => {
    const read: ExtractedPdf = { fileName: 'manual.pdf', sha256: 'c'.repeat(64), pageCount: 1, truncated: false, pages: [{
      number: 1, text: ' 0,1 ºC', textLength: 9, needsVisualExtraction: false,
      runs: [{ text: '', x: 10, y: 20, width: 5 }, { text: '0,1 ºC', x: 16, y: 20, width: 30 }] }] };
    const clean = withNormalizedSymbols(read);
    expect(clean.pages[0].text).toBe('± 0,1 ºC');
    expect(clean.pages[0].runs?.map(run => run.text)).toEqual(['±', '0,1 ºC']);
    expect(clean.pages[0].runs?.[0]).toMatchObject({ x: 10, y: 20, width: 5 });
    expect({ ...clean, pages: [] }).toEqual({ ...read, pages: [] });
    expect(read.pages[0].text).toBe(' 0,1 ºC');
  });

  it('drops a footnote asterisk from a unit but keeps superscript units', () => {
    expect(cleanUnit('°C*')).toBe('°C');
    expect(cleanUnit('% FS **')).toBe('% FS');
    expect(cleanUnit('m²')).toBe('m²');
    expect(cleanUnit('')).toBe('');
  });

  it('verifies "± 0,1" on the manual page only when the page text is normalized the same way', () => {
    // A single-model sheet: with other models' columns on the page, only text positions could tie the column.
    const page = 'TA-25N\nFaixa de Operação -25 a 140 °C*\nExatidão do Display  0,1 ºC\n(*) Temperatura Ambiente: 20ºC.';
    const read: ExtractedPdf = { fileName: 'manual-ta.pdf', sha256: MANUAL.sha256, pageCount: 39, truncated: false,
      pages: Array.from({ length: 39 }, (_, index) => ({ number: index + 1, text: index === 4 ? page : '',
        textLength: index === 4 ? page.length : 0, needsVisualExtraction: index !== 4 })) };
    const normalized = toFactProposal({ title: 'TA', models: ['TA-25N'], sections: [{ title: 'Especificações Técnicas', rows: [
      { key: 'display-accuracy', label: 'Exatidão do Display', values: [
        { model: 'TA-25N', literal: ' 0,1', unit: 'ºC', sourceRef: { page: 5, quote: 'Exatidão do Display  0,1 ºC' } }] },
      { key: 'operating-range', label: 'Faixa de Operação', values: [{ model: 'TA-25N', literal: '-25 a 140', unit: '°C*',
        condition: '(*) Temperatura Ambiente: 20ºC.',
        sourceRef: { page: 5, quote: 'Faixa de Operação -25 a 140 °C*' } }] },
    ] }] }, [MANUAL], { models: ['TA-25N'] });
    const [accuracy, range] = normalized.proposal.sections[0].rows;
    expect(accuracy.values[0].status === 'known' && accuracy.values[0].candidate.value).toBe('± 0,1');
    expect(range.unit).toBe('°C');
    const verified = verifyFactProposal(normalized.proposal, [pdfEvidenceSource('ta-manual-pt', withNormalizedSymbols(read))]);
    expect(verified.values.map(item => item.status)).toEqual(['VERIFIED_TEXT', 'VERIFIED_TEXT']);
    // Without the same normalization the quote is not on the page: never verified by accident.
    const raw = verifyFactProposal(normalized.proposal, [pdfEvidenceSource('ta-manual-pt', read)]);
    expect(raw.values[0]).toMatchObject({ status: 'UNVERIFIED' });
    expect(raw.values[0].candidates[0].reason).toBe('QUOTE_NOT_ON_PAGE');
  });
});

describe('numericSignature', () => {
  it.each([
    ['-25 °C to +155 °C', ['-25', '155']],
    ['-25 a 140', ['-25', '140']],
    ['± 0,05 ºC em toda a faixa', ['±0.05']],
    ['0-15 psi', ['0', '15']],
    ['354,5x206x318mm', ['354.5', '206', '318']],
    ['Ø 25.4 mm (1”) x 124 mm', ['25.4', '1', '124']],
    ['11 min (25 °C to -25 °C)', ['11', '25', '-25']],
    ['Full range', []],
  ])('%s', (text, expected) => expect(numericSignature(text)).toEqual(expected));
});

const reading = (overrides: Partial<SourceFactValue>): SourceFactValue => ({
  sourceId: 'ta-folder', model: 'TA-25N', key: 'operating-range', label: 'Operating Range', value: '-25 °C to +155 °C',
  unit: '°C', condition: 'ambient temperature: 23 °C', page: 9, quote: 'Operating Range -25 °C to +155 °C', status: 'VERIFIED_TEXT', ...overrides,
});
describe('findSourceDivergences: files that disagree are never resolved in silence', () => {
  it('reports the TA-25N range (155 x 140 °C) and the ambient temperature (23 x 20 °C)', () => {
    const found = findSourceDivergences([
      reading({}),
      reading({ sourceId: 'ta-manual-pt', label: 'Faixa de Operação', value: '-25 a 140', condition: 'Temperatura Ambiente: 20ºC', page: 5 }),
    ]);
    expect(found.map(item => [item.model, item.key, item.field])).toEqual([
      ['TA-25N', 'operating-range', 'value'], ['TA-25N', 'operating-range', 'condition']]);
  });

  it('ignores the same figures written in another language, a single file and unsupported readings', () => {
    expect(findSourceDivergences([
      reading({ key: 'weight', value: '10.5', condition: '' }),
      reading({ key: 'weight', value: '10,5', condition: '', sourceId: 'ta-manual-pt' }),
      reading({ key: 'power', value: '200', condition: '' }), reading({ key: 'power', value: '300', condition: '' }),
      reading({ key: 'depth', value: '124', condition: '' }),
      reading({ key: 'depth', value: '160', condition: '', sourceId: 'ta-manual-pt', status: 'UNVERIFIED' }),
    ])).toEqual([]);
  });
});

/** A page whose native text is exactly `text` (no text positions). */
const pdf = (source: ExtractionSource, pages: Record<number, string>): PdfEvidenceSource => ({
  kind: 'pdf', sourceId: source.sourceId, name: source.fileName, sha256: source.sha256, pageCount: source.pageCount,
  pages: Object.entries(pages).map(([number, text]) => ({ number: Number(number), text, textLength: text.length, needsVisualExtraction: false })),
});

describe('extraction + verifier on a single-product page', () => {
  const folderText = 'Technical Specifications TA-25N\nOperating Range -25 °C to +155 °C\nElectric Power: 200 W\nWeight: 10.5 kg';
  const manualText = 'Especificações Técnicas TA-25N\nFaixa de Operação -25 a 140 °C\nPotência Elétrica 200 W';

  it('verifies what the page prints and stops a wrong figure', () => {
    const normalized = toFactProposal(sheet([
      { key: 'electric-power', label: 'Electric Power:', values: [{ model: 'TA-25N', literal: '200', unit: 'W', quote: 'Electric Power: 200 W' }] },
      { key: 'weight', label: 'Weight:', values: [{ model: 'TA-25N', literal: '12.5', unit: 'kg', quote: 'Weight: 10.5 kg' }] },
    ], ['TA-25N']), [FOLDER], { models: ['TA-25N'] });
    const report = verifyFactProposal(normalized.proposal, [pdf(FOLDER, { 9: folderText })]);
    expect(report.values.map(item => item.status)).toEqual(['VERIFIED_TEXT', 'UNVERIFIED']);
    const values = sourceFactValues(normalized, report);
    expect(values.map(item => [item.key, item.value, item.status])).toEqual([
      ['electric-power', '200', 'VERIFIED_TEXT'], ['weight', '12.5', 'UNVERIFIED']]);
  });

  it('shows a divergence between two files as a conflict the person must decide', () => {
    const divergences = findSourceDivergences([
      reading({ quote: 'Operating Range -25 °C to +155 °C', condition: '' }),
      reading({ sourceId: 'ta-manual-pt', label: 'Faixa de Operação', value: '-25 a 140', condition: '', page: 5,
        quote: 'Faixa de Operação -25 a 140 °C' }),
    ]);
    const proposal = divergenceProposal(divergences, [FOLDER, MANUAL], 'TA-25N');
    expect(proposal?.sections[0].rows[0].values[0].status).toBe('conflict');
    const report = verifyFactProposal(proposal, [pdf(FOLDER, { 9: folderText }), pdf(MANUAL, { 5: manualText })]);
    expect(report.values[0].status).toBe('CONFLICT');
    const message = verificationMessage(report.values[0], report.sourceNames);
    expect(message).toContain('As fontes divergem');
    expect(message).toContain('presys-ta-folder.pdf');
    expect(message).toContain('manual-ta.pdf');
    expect(divergenceProposal([], [FOLDER], 'x')).toBeUndefined();
  });
});
