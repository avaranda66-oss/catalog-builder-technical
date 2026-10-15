// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@/vnext/asset/integrity';
import { sourcePayload, validateTechnicalInput, type TechnicalInput } from '@/vnext/ai-catalog/contracts';
import { prepareGroundedPdfInput, type RealPdfExtractionProposal } from '@/vnext/ai-catalog/pdf-grounded-input';
import { extractPdfText } from '@/vnext/ai-catalog/pdf-intake';
import { verifyPdfFactEvidence } from '@/vnext/ai-catalog/pdf-evidence';
import { pdfEvidenceSource, verifyFactProposal } from '@/vnext/ai-catalog/fact-verifier';

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
  /** Model positions whose value is wrong (default: all). */
  bad?: number[];
  /** What the verifier reports for them: refused, or sent to a person (never verified). */
  status?: 'UNVERIFIED' | 'VISUAL_ONLY';
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
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['', '900'], bad: [0] },
  // FR-67 review: the quote leaves out the model, the row label or the unit.
  { name: 'values swapped between models whose quotes leave the model out on a shared page',
    lines: ['AX-041 PRESSURE RANGE 700 kPa', 'BX-062 PRESSURE RANGE 900 kPa'],
    quotes: ['PRESSURE RANGE 900 kPa', 'PRESSURE RANGE 700 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['900', '700'], status: 'VISUAL_ONLY' },
  { name: 'models only in a title line and swapped model-free rows',
    lines: ['AX-041 / BX-062 PRESSURE TRANSMITTERS', 'PRESSURE RANGE 700 kPa', 'PRESSURE RANGE 900 kPa'],
    quotes: ['PRESSURE RANGE 900 kPa', 'PRESSURE RANGE 700 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['900', '700'], status: 'VISUAL_ONLY' },
  { name: 'models printed as one header-list text run with swapped values',
    lines: ['Modelos AX-041 BX-062 PRESSURE RANGE 700 kPa 900 kPa'],
    quotes: ['Modelos AX-041 BX-062 PRESSURE RANGE 700 kPa 900 kPa', 'Modelos AX-041 BX-062 PRESSURE RANGE 700 kPa 900 kPa'],
    label: 'PRESSURE RANGE', unit: 'kPa', condition: '', values: ['900', '700'], status: 'VISUAL_ONLY' },
  { name: 'value of an undeclared row quoted for another row', models: ['TA-25N'],
    lines: ['TA-25N', 'Faixa -25 a 140 °C', 'Resolução 0,1 °C', 'Exatidão ±0,3 °C'], quotes: ['Resolução 0,1 °C'],
    label: 'Exatidão', unit: '°C', condition: '', values: ['0,1'], bad: [0], status: 'VISUAL_ONLY' },
  { name: 'value quoted without any row label for a row the page does not have', models: ['TA-25N'],
    lines: ['TA-25N', 'Faixa -25 a 140 °C', 'Resolução 0,1 °C', 'Exatidão ±0,3 °C'], quotes: ['0,1 °C'],
    label: 'Estabilidade', unit: '°C', condition: '', values: ['0,1'], bad: [0], status: 'VISUAL_ONLY' },
  { name: 'psi range claimed in kPa because kPa is printed elsewhere on the page', models: ['TA-25N'],
    lines: ['TA-25N', 'Faixa (psi) 0...100', 'Faixa (kPa) 0...700'], quotes: ['Faixa (psi) 0...100'],
    label: 'Faixa', unit: 'kPa', condition: '', values: ['0...100'], bad: [0] },
  { name: 'row label completed with the words of the next row, which prints its own values', models: ['TA-25N'],
    lines: ['TA-25N', 'Faixa 0...700 kPa', 'Faixa de medição 0...900 kPa'], quotes: ['Faixa 0...700 kPa'],
    label: 'Faixa de medição', unit: 'kPa', condition: '', values: ['0...700'], bad: [0], status: 'VISUAL_ONLY' },
  { name: 'square metres read as metres', models: ['TA-25N'],
    lines: ['TA-25N bloco seco de calibração industrial', 'Área 2 m^2'], quotes: ['Área 2 m^2'],
    label: 'Área', unit: 'm', condition: '', values: ['2'], bad: [0] },
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

type Fixture = Awaited<ReturnType<typeof nativeFixture>>;
/** The bridge stamps each kept candidate; it must only keep text-verified known values. */
function withoutStamps(input: TechnicalInput): TechnicalInput {
  const copy = structuredClone(input);
  for (const section of copy.sections) for (const row of section.rows) for (const fact of row.values) {
    if (fact.status === 'known') {
      expect(fact.candidate.verification).toBe('VERIFIED_TEXT');
      delete fact.candidate.verification;
    }
  }
  return copy;
}
/**
 * Per-value verification (FR-67): the bridge never certifies a bad value. It
 * reports it as UNVERIFIED and leaves it out, keeping the good values; when
 * nothing is left it refuses the whole proposal.
 */
async function expectBridgeNotCertified(fixture: Fixture, badModels: number[], status: Scenario['status'] = 'UNVERIFIED') {
  const report = verifyFactProposal(fixture.proposal, [pdfEvidenceSource('qa-native', fixture.pdf)]);
  for (const model of badModels) expect(report.values[model].status).toBe(status);
  const prepared = await prepareGroundedPdfInput(fixture.materials, fixture.proposal).then(result => result, (error: Error) => error);
  if (prepared instanceof Error) {
    expect(prepared.message).toBe('PDF_EVIDENCE_NONE_VERIFIED');
    return;
  }
  for (const model of badModels) expect(prepared.input.sections[0].rows[0].values[model].status).toBe('missing');
}
const entryPoints = [
  { name: 'actual-byte bridge', mode: 'bridge' as const,
    check: async (fixture: Fixture) => withoutStamps((await prepareGroundedPdfInput(fixture.materials, fixture.proposal)).input),
    rejects: (fixture: Fixture, badModels: number[], status?: Scenario['status']) => expectBridgeNotCertified(fixture, badModels, status) },
  { name: 'persisted grounded input validation', mode: 'persisted' as const,
    check: async (fixture: Fixture) => validateTechnicalInput(fixture.input),
    rejects: (fixture: Fixture) => expect(validateTechnicalInput(fixture.input)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/) },
];

describe.each(entryPoints)('PDF fact association at $name', ({ check, rejects, mode }) => {
  it.each(negatives)('rejects $name', async scenario => {
    const fixture = await nativeFixture(scenario);
    await rejects(fixture, scenario.bad ?? [0, 1], scenario.status);
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
    const conflict = { status: 'conflict' as const, candidates: [
      { value: '0,001', source: { sourceId: 'qa-native', page: 1, quote: 'AX-041 ERROR 0,001 kPa at 23 C' } },
      { value: '0,003', source: { sourceId: 'qa-native', page: 1, quote: 'AX-041 ERROR 0,003 kPa at 99 C' } },
    ] };
    fixture.proposal.sections[0].rows[0].values[0] = conflict;
    fixture.input.sections[0].rows[0].values[0] = conflict;
    if (mode === 'persisted') {
      await expect(check(fixture)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/);
      return;
    }
    // The "at 99 C" clause never justifies a value for the "at 23 C" row: that
    // candidate is UNVERIFIED and only the supported 0,001 is kept.
    const prepared = await prepareGroundedPdfInput(fixture.materials, fixture.proposal);
    expect(prepared.verification.values[0].candidates.map(item => [item.value, item.status, item.reason]))
      .toEqual([['0,001', 'VERIFIED_TEXT', undefined], ['0,003', 'UNVERIFIED', 'CONDITION_MISMATCH']]);
    const fact = prepared.input.sections[0].rows[0].values[0];
    expect(fact.status === 'known' && fact.candidate.value).toBe('0,001');
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
