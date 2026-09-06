import { describe, expect, it } from 'vitest';
import { PDFService } from '../../src/services/pdf.service';

describe('RR009 — PDF export target contract', () => {
  it('T2: an empty selector is an explicit export failure, never success', async () => {
    const result = await PDFService.exportToPDF('.rr009-definitely-missing-target', {
      fileName: 'rr009-missing.pdf'
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Nenhuma página A4 encontrada/i);
  });
});
