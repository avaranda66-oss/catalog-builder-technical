import { describe, expect, it } from 'vitest';
import { PDFService } from '../../src/services/pdf.service';

describe('RR009 — PDF export target contract', () => {
  it('T2: an empty selector is an explicit export failure, never success', async () => {
    const result = await PDFService.exportToPDF('.rr009-definitely-missing-target', {
      fileName: 'rr009-missing.pdf',
      layoutPreflight: { canPublish: true, blockCount: 0, warnCount: 0, issues: [] }
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Nenhuma página A4 encontrada/i);
  });

  it('T3: final export fails closed without a current measured layout gate', async () => {
    const result = await PDFService.exportToPDF('.a4-page-container', {
      fileName: 'rr009-no-layout-proof.pdf'
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('LAYOUT_PREFLIGHT_REQUIRED');
  });
});
