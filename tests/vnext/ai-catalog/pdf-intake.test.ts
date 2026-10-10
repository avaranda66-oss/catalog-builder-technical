import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { extractPdfText, selectPdfContext } from '../../../src/vnext/ai-catalog/pdf-intake';

function pdfWithPages(count: number) {
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  for (let page = 1; page <= count; page++) {
    if (page > 1) document.addPage();
    document.text('Specifications and pressure limits - model A - page ' + page, 20, 30);
    document.text('Range 10.00 bar, resolution 0.001.', 20, 45);
  }
  return document.output('arraybuffer');
}
describe('PDF local intake and page-scoped context', () => {
  it('reads a long multipage native-text PDF without dropping page identity', async () => {
    const result = await extractPdfText('long-manual.pdf', pdfWithPages(41));
    expect(result.pageCount).toBe(41);
    expect(result.pages).toHaveLength(41);
    expect(result.pages[40].number).toBe(41);
    expect(result.pages[40].text).toContain('page 41');
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.truncated).toBe(false);
  }, 45000);
  it('preserves deliberate page cap without pretending all pages were read', async () => {
    const result = await extractPdfText('manual.pdf', pdfWithPages(5), { maxPages: 2 });
    expect(result.pages).toHaveLength(2);
    expect(result.pageCount).toBe(5);
    expect(result.truncated).toBe(true);
  });
  it('rejects invalid signatures even with pdf extension', async () => {
    await expect(extractPdfText('bad.pdf', new TextEncoder().encode('this is not PDF').buffer)).rejects.toThrow('PDF_SIGNATURE_INVALID');
  });
  it('selects bounded page chunks without losing their source page', async () => {
    const result = await extractPdfText('manual.pdf', pdfWithPages(4));
    const chunks = selectPdfContext(result, 'pressure limits', 110, 2);
    expect(chunks.length).toBeLessThanOrEqual(2);
    expect(chunks.reduce((sum, item) => sum + item.quote.length, 0)).toBeLessThanOrEqual(110);
    expect(chunks.every(item => item.page >= 1 && item.page <= 4)).toBe(true);
  });
});
