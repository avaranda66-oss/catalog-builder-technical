import { describe, expect, it } from 'vitest';
import { createInstitutionalStressInput } from './institutional-stress-fixture';
import { approveGeneration, assertGeneratedIntegrity, compileCatalog, mockCatalogPlan, planMockRequest, tableMatrix } from '../../../src/vnext/ai-catalog/composition';
import { validateTechnicalInput } from '../../../src/vnext/ai-catalog/contracts';

describe('Institutional long form: 4-model / 24 A4 pages / hundreds of exact engineering cells', () => {
  it('compiles 192 rows and 768 original-valued positions into 24 A4 pages with no omission or duplication', async () => {
    const input = await createInstitutionalStressInput();
    const started = performance.now();
    const result = await compileCatalog(input);
    const elapsedMs = Math.round(performance.now() - started);
    expect(result.document.pages).toHaveLength(24);
    const ledger = assertGeneratedIntegrity(result);
    expect(ledger).toHaveLength(768);
    expect(new Set(ledger.map(cell => cell.factId)).size).toBe(768);
    expect(ledger.filter(cell => cell.value === '±0,0100').length).toBeGreaterThan(25);
    expect(ledger.filter(cell => cell.value === '1.234,56').length).toBeGreaterThan(25);
    let cells = 0;
    for (const page of result.document.pages) {
      const table = page.objects.find(object => object.type === 'table');
      if (!table || table.type !== 'table') throw new Error('MISSING_TABLE');
      const matrix = tableMatrix(table.table);
      // Regression: notes at 30 mm and later numeric columns at 17.25 mm
      // both blocked physical A4 publication on Chromium/Linux.
      // Reserve 31 + 20 + 35 mm for labels, units and conditions, leaving
      // (176 - 86) / 4 = 22.5 mm per model, without reducing technical fonts.
      expect(table.table.columns[0].width).toEqual({ mode: 'fixed', mm: 31 });
      expect(table.table.columns[5].width).toEqual({ mode: 'fixed', mm: 20 });
      expect(table.table.columns[6].width).toEqual({ mode: 'fixed', mm: 35 });
      expect(table.table.columns.slice(1, 5).every(column => column.width.mode === 'flex' && column.minMm === 16)).toBe(true);
      expect(matrix.length).toBe(9);
      expect(matrix.every(row => row.length === 7)).toBe(true);
      cells += matrix.flat().length;
    }
    expect(cells).toBe(24 * 9 * 7);
    expect(await approveGeneration(result)).toMatch(/^[a-f0-9]{64}$/);
    console.log(JSON.stringify({ pages: result.document.pages.length, engineeringCells: ledger.length,
      totalTableCells: cells, compileMs: elapsedMs, status: 'INTEGRITY_PASS_LAYOUT_NOT_YET_CHECKED' }));
  }, 120000);

  it('builds institutional cover, 12-section contents, 24 paginated tables and source provenance page', async () => {
    const input = await createInstitutionalStressInput();
    const plan = planMockRequest(input, 'Crie um cat\u00e1logo institucional extenso com tabelas t\u00e9cnicas.');
    expect(plan.template).toBe('institutional-technical-a4-v1');
    const doc = await compileCatalog(input, { ...mockCatalogPlan(input), ...plan });
    expect(doc.document.pages).toHaveLength(27);
    expect(doc.document.pages[0].objects.some(object => object.type === 'table')).toBe(false);
    expect(doc.document.pages[1].objects.some(object => object.type === 'table')).toBe(false);
    expect(doc.document.pages[26].objects.some(object => object.type === 'table')).toBe(false);
    const trace = assertGeneratedIntegrity(doc);
    expect(trace).toHaveLength(768);
    expect(await approveGeneration(doc)).toMatch(/^[a-f0-9]{64}$/);
  }, 120000);

  it('rejects document loads with 193 technical rows rather than silently truncating', async () => {
    const input = await createInstitutionalStressInput({ sections: 13, rowsPerSection: 15 });
    await expect(validateTechnicalInput(input)).rejects.toThrow();
  }, 30000);

  it('rejects a forged physical source quote even for otherwise valid 24-page input', async () => {
    const input = await createInstitutionalStressInput();
    input.sections[9].rows[5].values[2] = {
      status: 'known', candidate: {
        value: '00099', source: { sourceId: 'original-qa-source', page: 5, quote: 'not a real page excerpt' },
      },
    };
    await expect(compileCatalog(input)).rejects.toThrow('SOURCE_QUOTE_MISMATCH');
  }, 30000);
});
