// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@/vnext/asset/integrity';
import { sourcePayload, validateTechnicalInput, type TechnicalInput } from '@/vnext/ai-catalog/contracts';
import { prepareGroundedPdfInput, type RealPdfExtractionProposal } from '@/vnext/ai-catalog/pdf-grounded-input';
import { extractPdfText } from '@/vnext/ai-catalog/pdf-intake';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

async function nativeFixture(options: { unit: string; sourceUnit?: string; competing?: boolean; chosenValue?: string }) {
  const sourceUnit = options.sourceUnit ?? options.unit;
  // No following qualifier: the partial unit is at the clause boundary.
  const label = 'MEASUREMENT', condition = '';
  const first = `AX-041 ${label} 700 ${sourceUnit}`;
  const quoteA = options.competing ? `${first}; AX-041 ${label} 900 ${sourceUnit}` : first;
  const quoteB = `BX-062 ${label} 1000 ${sourceUnit}`;
  const document = new jsPDF({ format: 'a4' });
  document.setFontSize(8);
  document.text(quoteA, 10, 35);
  document.text(quoteB, 10, 45);
  const bytes = document.output('arraybuffer');
  const pdf = await extractPdfText('original-hyphen-competing-clause.pdf', bytes);
  expect(pdf.pages[0].text).toContain(quoteA);
  expect(pdf.pages[0].text).toContain(quoteB);
  const proposal: RealPdfExtractionProposal = {
    version: 1, title: 'Original literal/ambiguity regression', models: ['AX-041', 'BX-062'],
    sections: [{ id: 'specs', title: 'Specifications', rows: [{
      id: 'measurement', label, unit: options.unit, condition,
      values: [
        { status: 'known', candidate: { value: options.chosenValue ?? '700', source: { sourceId: 'qa-native', page: 1, quote: quoteA } } },
        { status: 'known', candidate: { value: '1000', source: { sourceId: 'qa-native', page: 1, quote: quoteB } } },
      ],
    }] }],
  };
  const pages = [{ number: 1, text: pdf.pages[0].text }];
  const input: TechnicalInput = {
    version: 1, kind: 'grounded-pdf-specifications', title: proposal.title,
    models: proposal.models, sections: proposal.sections,
    sources: [{ id: 'qa-native', kind: 'pdf', name: pdf.fileName, revision: '1', pages,
      sha256: await sha256(sourcePayload(pages)), pdfSha256: pdf.sha256, pdfPageCount: pdf.pageCount }],
  };
  return { input, proposal, pdf, materials: [{ sourceId: 'qa-native', fileName: pdf.fileName, revision: '1', bytes }] };
}

const entryPoints = [
  { name: 'actual-byte bridge', check: async (fixture: Awaited<ReturnType<typeof nativeFixture>>) => (await prepareGroundedPdfInput(fixture.materials, fixture.proposal)).input },
  { name: 'persisted grounded validation', check: async (fixture: Awaited<ReturnType<typeof nativeFixture>>) => validateTechnicalInput(fixture.input) },
];

describe.each(entryPoints)('independent compound-unit and quote ambiguity at $name', ({ check }) => {
  it.each(['Pa-s', 'Pa - s'])('rejects dropping part of the literal %s source unit to Pa', async sourceUnit => {
    const fixture = await nativeFixture({ unit: 'Pa', sourceUnit });
    await expect(check(fixture)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/);
  });

  it.each(['700', '900'])('rejects selecting %s as known from competing clauses for the same exact model and field', async chosenValue => {
    const fixture = await nativeFixture({ unit: 'Pa', competing: true, chosenValue });
    await expect(check(fixture)).rejects.toThrow(/PDF_(?:EVIDENCE_VALUE|QUOTE_VALUE)_UNGROUNDED/);
  });

  it.each(['Pa-s', 'Pa - s'])('preserves the complete original %s source unit in one clause', async unit => {
    const fixture = await nativeFixture({ unit });
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0]).toEqual(fixture.input.sections[0].rows[0]);
    expect(checked.sections[0].rows[0].unit).toBe(unit);
  });

  it('keeps an original single-clause known fact valid without quote or value repair', async () => {
    const fixture = await nativeFixture({ unit: 'Pa' });
    const checked = await check(fixture);
    expect(checked.sections[0].rows[0]).toEqual(fixture.input.sections[0].rows[0]);
    expect(checked.models).toEqual(fixture.input.models);
    expect(checked.sources[0].kind).toBe('pdf');
    if (checked.sources[0].kind !== 'pdf') throw new Error('Expected original native PDF');
    expect(checked.sources[0].pdfSha256).toBe(fixture.pdf.sha256);
  });
});
