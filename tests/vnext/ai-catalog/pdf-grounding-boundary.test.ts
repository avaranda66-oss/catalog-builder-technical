// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@/vnext/asset/integrity';
import { sourcePayload, validateTechnicalInput, type TechnicalInput } from '@/vnext/ai-catalog/contracts';
import { prepareGroundedPdfInput, type RealPdfExtractionProposal } from '@/vnext/ai-catalog/pdf-grounded-input';
import { extractPdfText } from '@/vnext/ai-catalog/pdf-intake';
import { verifyPdfFactEvidence } from '@/vnext/ai-catalog/pdf-evidence';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

interface Scenario {
  name: string;
  lines: string[];
  quotes?: string[];
  models?: string[];
  label: string;
  unit: string;
  condition: string;
  values: string[];
}

const negatives: Scenario[] = [
  { name: 'condition changed from 23 C to 99 C in isolated model quotes',
    lines: ['AX-041 PRESSURE RANGE 700 kPa at 23 C', 'BX-062 PRESSURE RANGE 900 kPa at 23 C'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: 'at 99 C', values: ['700', '900'] },
  { name: 'values exchanged between two models inside one broad quote',
    lines: ['AX-041 PRESSURE RANGE 700 kPa; BX-062 PRESSURE RANGE 900 kPa'],
    quotes: ['AX-041 PRESSURE RANGE 700 kPa; BX-062 PRESSURE RANGE 900 kPa', 'AX-041 PRESSURE RANGE 700 kPa; BX-062 PRESSURE RANGE 900 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['900', '700'] },
  { name: 'resolution value attributed to a pressure-range field not adjacent to it',
    lines: ['AX-041 PRESSURE RANGE 700 kPa RESOLUTION 0,001 kPa', 'BX-062 PRESSURE RANGE 900 kPa RESOLUTION 0,002 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['0,001', '0,002'] },
  { name: 'minus sign removed from isolated signed source values',
    lines: ['AX-041 ERROR -0,001 kPa', 'BX-062 ERROR -0,002 kPa'],
    label: 'ERROR', unit: 'kPa', condition: '', values: ['0,001', '0,002'] },
  { name: 'whitespace-separated minus interpreted as a delimiter and removed from the value',
    lines: ['AX-041 ERROR - 0,001 kPa', 'BX-062 ERROR - 0,002 kPa'],
    label: 'ERROR', unit: 'kPa', condition: '', values: ['0,001', '0,002'] },
  { name: 'unit Pa inferred from the substring of kPa',
    lines: ['AX-041 PRESSURE RANGE 700 kPa', 'BX-062 PRESSURE RANGE 900 kPa'],
    label: 'PRESSURE RANGE', unit: 'Pa', condition: '', values: ['700', '900'] },
  { name: 'compound unit kPa/s truncated to its numerator kPa',
    lines: ['AX-041 RATE 700 kPa/s', 'BX-062 RATE 900 kPa/s'],
    label: 'RATE', unit: 'kPa', condition: '', values: ['700', '900'] },
  { name: 'model suffix removed from source identities',
    lines: ['AX-041N PRESSURE RANGE 700 kPa', 'BX-062N PRESSURE RANGE 900 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['700', '900'] },
  { name: 'target model appears only in a source-index clause disconnected from another model fact',
    lines: ['CX-999 PRESSURE RANGE 700 kPa; AX-041 SOURCE INDEX', 'DX-888 PRESSURE RANGE 900 kPa; BX-062 SOURCE INDEX'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['700', '900'] },
  { name: 'trailing model after the value does not establish the supported model-to-fact clause',
    lines: ['PRESSURE RANGE 700 kPa AX-041', 'PRESSURE RANGE 900 kPa BX-062'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['700', '900'] },
  { name: 'empty known value inferred from a quote that actually contains filled values',
    lines: ['AX-041 PRESSURE RANGE 700 kPa', 'BX-062 PRESSURE RANGE 900 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['', '900'] },
];

async function nativeFixture(scenario: Scenario) {
  const document = new jsPDF({ format: 'a4' });
  document.setFontSize(8);
  scenario.lines.forEach((line, index) => document.text(line, 10, 35 + index * 10));
  const bytes = document.output('arraybuffer');
  const pdf = await extractPdfText('original-adversarial-specs.pdf', bytes);
  const quotes = scenario.quotes ?? scenario.lines;
  quotes.forEach(quote => expect(pdf.pages[0].text).toContain(quote));
  const proposal: RealPdfExtractionProposal = {
    version: 1, title: 'Original native-PDF boundary regression',
    models: scenario.models ?? ['AX-041', 'BX-062'],
    sections: [{ id: 'specs', title: 'Specifications', rows: [{
      id: 'fact', label: scenario.label, unit: scenario.unit, condition: scenario.condition,
      values: scenario.values.map((value, index) => ({ status: 'known', candidate: {
        value, source: { sourceId: 'qa-native', page: 1, quote: quotes[index] },
      } })),
    }] }],
  };
  const pages = [{ number: 1, text: pdf.pages[0].text }];
  const input: TechnicalInput = {
    version: 1, kind: 'grounded-pdf-specifications', title: proposal.title,
    models: proposal.models, sections: proposal.sections,
    sources: [{ id: 'qa-native', kind: 'pdf', name: pdf.fileName, revision: '1',
      pages, sha256: await sha256(sourcePayload(pages)),
      pdfSha256: pdf.sha256, pdfPageCount: pdf.pageCount }],
  };
  return { pdf, input, proposal, materials: [{ sourceId: 'qa-native', fileName: pdf.fileName, revision: '1', bytes }] };
}

const entryPoints = [
  { name: 'actual-byte bridge', check: async (fixture: Awaited<ReturnType<typeof nativeFixture>>) => (await prepareGroundedPdfInput(fixture.materials, fixture.proposal)).input },
  { name: 'persisted grounded input validation', check: async (fixture: Awaited<ReturnType<typeof nativeFixture>>) => validateTechnicalInput(fixture.input) },
];

describe.each(entryPoints)('PDF fact association at $name', ({ check }) => {
  it.each(negatives)('rejects $name', async scenario => {
    const fixture = await nativeFixture(scenario);
    await expect(check(fixture)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/);
  });

  it.each(['-', '+', '±', '- '])('preserves legitimate %s signed values, complete model suffix, kPa and literal degree condition', async sign => {
    const values = [`${sign}0,001`, `${sign}0,002`];
    const fixture = await nativeFixture({ name: 'legitimate signed original facts',
      models: ['AX-041N', 'BX-062N'],
      lines: [`AX-041N ERROR ${values[0]} kPa at 23 °C`, `BX-062N ERROR ${values[1]} kPa at 23 °C`],
      label: 'ERROR', unit: 'kPa', condition: 'at 23 °C', values });
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0]).toEqual(fixture.input.sections[0].rows[0]);
    expect(checked.models).toEqual(['AX-041N', 'BX-062N']);
    expect(checked.sources[0].kind).toBe('pdf');
    if (checked.sources[0].kind !== 'pdf') throw new Error('Expected native byte evidence');
    expect(checked.sources[0].pdfSha256).toBe(fixture.pdf.sha256);
  });

  it('allows an explicitly empty condition without inventing a condition', async () => {
    const fixture = await nativeFixture({ name: 'empty condition',
      lines: ['AX-041 PRODUCT CODE 00017', 'BX-062 PRODUCT CODE 00024'],
      label: 'PRODUCT CODE', unit: '', condition: '', values: ['00017', '00024'] });
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0]).toEqual(fixture.input.sections[0].rows[0]);
  });

  it('preserves the complete original compound engineering unit kPa/s', async () => {
    const fixture = await nativeFixture({ name: 'complete compound engineering unit',
      lines: ['AX-041 RATE 700 kPa/s', 'BX-062 RATE 900 kPa/s'],
      label: 'RATE', unit: 'kPa/s', condition: '', values: ['700', '900'] });
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0]).toEqual(fixture.input.sections[0].rows[0]);
  });

  it('does not justify a conflict candidate using another line outside its own quote', async () => {
    const fixture = await nativeFixture({ name: 'conflict condition mismatch',
      lines: ['AX-041 ERROR 0,001 kPa at 23 C', 'AX-041 ERROR 0,003 kPa at 99 C', 'BX-062 ERROR 0,002 kPa at 23 C'],
      quotes: ['AX-041 ERROR 0,001 kPa at 23 C', 'BX-062 ERROR 0,002 kPa at 23 C'],
      label: 'ERROR', unit: 'kPa', condition: 'at 23 C', values: ['0,001', '0,002'] });
    fixture.proposal.sections[0].rows[0].values[0] = { status: 'conflict', candidates: [
      { value: '0,001', source: { sourceId: 'qa-native', page: 1, quote: 'AX-041 ERROR 0,001 kPa at 23 C' } },
      { value: '0,003', source: { sourceId: 'qa-native', page: 1, quote: 'AX-041 ERROR 0,003 kPa at 99 C' } },
    ] };
    await expect(check(fixture)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/);
  });

  it('preserves explicit missing information while verifying the other native fact', async () => {
    const fixture = await nativeFixture({ name: 'explicit missing',
      lines: ['AX-041 PRODUCT CODE 00017', 'BX-062 PRODUCT CODE 00024'],
      label: 'PRODUCT CODE', unit: '', condition: '', values: ['00017', '00024'] });
    fixture.proposal.sections[0].rows[0].values[0] = { status: 'missing', reason: 'No source-backed value selected' };
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0].values[0]).toEqual({ status: 'missing', reason: 'No source-backed value selected' });
    expect(checked.sections[0].rows[0].values[1]).toEqual(fixture.proposal.sections[0].rows[0].values[1]);
  });
});

describe('PDF evidence location literal guard', () => {
  it.each([
    { name: 'removed sign', sourceValue: '-0,001', value: '0,001', unit: 'kPa', sourceUnit: 'kPa' },
    { name: 'removed whitespace-separated sign', sourceValue: '- 0,001', value: '0,001', unit: 'kPa', sourceUnit: 'kPa' },
    { name: 'unit prefix', sourceValue: '0,001', value: '0,001', unit: 'Pa', sourceUnit: 'kPa' },
    { name: 'unit numerator', sourceValue: '0,001', value: '0,001', unit: 'kPa', sourceUnit: 'kPa/s' },
    { name: 'empty invented value', sourceValue: '0,001', value: '', unit: 'kPa', sourceUnit: 'kPa' },
  ])('rejects $name before treating the excerpt as evidence', async ({ sourceValue, value, unit, sourceUnit }) => {
    const quote = `AX-041 ERROR ${sourceValue} ${sourceUnit}`;
    const fixture = await nativeFixture({ name: 'literal location guard',
      lines: [quote, `BX-062 ERROR 0,002 ${sourceUnit}`], label: 'ERROR', unit: sourceUnit, condition: '', values: [sourceValue, '0,002'] });
    expect(() => verifyPdfFactEvidence(fixture.pdf, { factId: 'specs:error:0', value, unit, page: 1, quote, pdfSha256: fixture.pdf.sha256 })).toThrow();
  });

  it('accepts literal signed location evidence with the complete engineering unit', async () => {
    const quote = 'AX-041 ERROR -0,001 kPa at 23 C';
    const fixture = await nativeFixture({ name: 'literal evidence',
      lines: [quote, 'BX-062 ERROR +0,002 kPa at 23 C'], label: 'ERROR', unit: 'kPa', condition: 'at 23 C', values: ['-0,001', '+0,002'] });
    expect(() => verifyPdfFactEvidence(fixture.pdf, { factId: 'specs:error:0', value: '-0,001', unit: 'kPa', page: 1, quote, pdfSha256: fixture.pdf.sha256 })).not.toThrow();
  });
});

describe('PDF native-byte evidence identity', () => {
  it('hashes and parses one captured input when the caller mutates its ArrayBuffer during the real digest await', async () => {
    const document = new jsPDF({ format: 'a4' });
    document.text('AX-041 ERROR 700 kPa at 23 C', 20, 35);
    const bytes = document.output('arraybuffer'), original = bytes.slice(0);
    const expectedHash = await sha256(original);
    const mutable = Buffer.from(bytes), offset = mutable.indexOf('AX-041 ERROR 700 kPa');
    expect(offset).toBeGreaterThanOrEqual(0);
    const pending = extractPdfText('original-caller-owned-source.pdf', bytes);
    // No digest mock: mutate only after the real function has started hashing.
    mutable.write('999', offset + 'AX-041 ERROR '.length, 'ascii');
    const parsed = await pending;
    expect(await sha256(bytes)).not.toBe(expectedHash);
    expect(parsed.sha256).toBe(expectedHash);
    expect(parsed.pages[0].text).toContain('AX-041 ERROR 700 kPa at 23 C');
    expect(parsed.pages[0].text).not.toContain('999');
  });
});
