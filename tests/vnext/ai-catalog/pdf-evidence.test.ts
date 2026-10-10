import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { extractPdfText } from '../../../src/vnext/ai-catalog/pdf-intake';
import { verifyPdfFactBatch, verifyPdfFactEvidence } from '../../../src/vnext/ai-catalog/pdf-evidence';

async function sample() {
  const doc = new jsPDF();
  doc.text('Model A, pressure 10.00 bar, precision 0.01%', 20, 35);
  const pdf = await extractPdfText('synthetic.pdf', doc.output('arraybuffer'));
  const first = pdf.pages[0].text;
  return { pdf, candidate: { factId: 'pressure-a', pdfSha256: pdf.sha256,
    page: 1, quote: first.slice(0, 80), value: '10.00', unit: 'bar' } };
}
describe('PDF fact evidence never invents technical values', () => {
  it('accepts only literal grounded source claims', async () => {
    const { pdf, candidate } = await sample();
    expect(() => verifyPdfFactBatch(pdf, [candidate])).not.toThrow();
  });
  it('rejects decimal rounding and invented measurements', async () => {
    const { pdf, candidate } = await sample();
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, value: '10.01' })).toThrow('PDF_FACT_VALUE_UNGROUNDED');
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, value: '10.0' })).toThrow('PDF_FACT_VALUE_UNGROUNDED');
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, value: '100' })).toThrow('PDF_FACT_VALUE_UNGROUNDED');
  });
  it('rejects forged source hash, page and unrelated quotation', async () => {
    const { pdf, candidate } = await sample();
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, pdfSha256: '0'.repeat(64) })).toThrow();
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, page: 2 })).toThrow();
    expect(() => verifyPdfFactEvidence(pdf, { ...candidate, quote: 'anything not in source' })).toThrow();
  });
  it('rejects duplicate source identities before compilation', async () => {
    const { pdf, candidate } = await sample();
    expect(() => verifyPdfFactBatch(pdf, [candidate, candidate])).toThrow('PDF_FACT_DUPLICATE_ID');
  });
});
