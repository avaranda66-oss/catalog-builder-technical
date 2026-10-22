import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { extractPdfText, pageGraphics, selectPdfContext, textVisualReasons, unreadableGlyphRatio } from '../../../src/vnext/ai-catalog/pdf-intake';

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
  it('reads a chosen page range and reports it as partial', async () => {
    const result = await extractPdfText('manual.pdf', pdfWithPages(5), { firstPage: 3, maxPages: 2 });
    expect(result.pages.map(page => page.number)).toEqual([3, 4]);
    expect(result.truncated).toBe(true);
    await expect(extractPdfText('manual.pdf', pdfWithPages(2), { firstPage: 0 })).rejects.toThrow('PDF_PAGE_LIMIT_INVALID');
  });
  it('triages pages beyond the old 20-character rule', async () => {
    expect(textVisualReasons('PRESYS')).toEqual(['no-text']);
    expect(unreadableGlyphRatio('\uE001\uE002 ab')).toBeCloseTo(0.5);
    expect(textVisualReasons('Faixa 0 a 20 bar \uE001\uE002\uE003 exatidão')).toEqual(['unreadable-glyphs']);
    const result = await extractPdfText('manual.pdf', pdfWithPages(1), { visualTriage: true });
    expect(result.pages[0]).toMatchObject({ needsVisualExtraction: false, visualReasons: [] });
  });
  it('measures how much of the page an image covers through the drawing transforms', async () => {
    const save = 10, restore = 11, transform = 12, image = 85;
    const page = (ops: number[], args: unknown[]) => ({ view: [0, 0, 600, 800], getOperatorList: async () => ({ fnArray: ops, argsArray: args }) });
    const full = await pageGraphics(page([save, transform, image, restore], [null, [540, 0, 0, 720, 30, 40], ['img', 2, 2], null]));
    expect(full.imageCoverage).toBeCloseTo((540 * 720) / (600 * 800));
    const thumbnail = await pageGraphics(page([save, transform, transform, image, restore], [null, [2, 0, 0, 2, 0, 0], [50, 0, 0, 50, 10, 10], ['img', 2, 2], null]));
    expect(thumbnail.imageCoverage).toBeCloseTo((100 * 100) / (600 * 800));
  });
});
