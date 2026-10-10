import { describe, expect, it } from 'vitest';
import { createSixModelSyntheticSpecifications } from '../../../src/vnext/ai-catalog/six-model-fixture';
import { assertGeneratedIntegrity, compileCatalog, tableMatrix } from '../../../src/vnext/ai-catalog/composition';
import { approveGeneration, generationHash } from '../../../src/vnext/ai-catalog/composition';
import { validateTechnicalInput } from '../../../src/vnext/ai-catalog/contracts';

describe('6-variant industrial comparison: physically grouped columns', () => {
  it('accepts and retains all six model positions in the validated source', async () => {
    const fixture = await createSixModelSyntheticSpecifications();
    const input = await validateTechnicalInput(fixture);
    expect(input.models).toHaveLength(6);
    expect(input.sections.every(s => s.rows.every(row => row.values.length === 6))).toBe(true);
  });
  it('generates two full-width pages per section instead of squeezing 6 columns', async () => {
    const fixture = await createSixModelSyntheticSpecifications();
    const generated = await compileCatalog(fixture);
    expect(generated.document.pages).toHaveLength(4);
    const tables = generated.document.pages.map(p => p.objects.find(o => o.type === 'table'));
    expect(tables.every(t => t?.type === 'table')).toBe(true);
    const headers = tables.map(obj => tableMatrix(obj!.table)[0]);
    expect(headers[0].slice(1,4)).toEqual(fixture.models.slice(0,3));
    expect(headers[1].slice(1,4)).toEqual(fixture.models.slice(3,6));
    expect(headers[2].slice(1,4)).toEqual(fixture.models.slice(0,3));
    expect(headers[3].slice(1,4)).toEqual(fixture.models.slice(3,6));
    expect(tables.every(t => t?.type === 'table' && t.table.columns.length === 6)).toBe(true);
    expect(assertGeneratedIntegrity(generated)).toHaveLength(84);
  });
  it('rejects approval until all original source ambiguities are resolved', async () => {
    const fixture = await createSixModelSyntheticSpecifications();
    const generated = await compileCatalog(fixture);
    await expect(approveGeneration(generated)).rejects.toThrow('UNRESOLVED_TECHNICAL_REVIEW');
    expect((await generationHash(generated)).length).toBe(64);
  });
  it('cannot silently mutate or drop one of the six model cells', async () => {
    const fixture = await createSixModelSyntheticSpecifications();
    const generated = await compileCatalog(fixture);
    const source = generated.document.pages[1].objects.find(o => o.type === 'table');
    if (!source || source.type !== 'table') throw new Error('FIXTURE_MISSING');
    const cell = source.table.cells.find(c => c.rowId === source.table.rows[1].id && c.columnId === source.table.columns[2].id);
    if (!cell) throw new Error('FIXTURE_MISSING_CELL');
    cell.content = { type: 'empty' };
    expect(() => assertGeneratedIntegrity(generated)).toThrow('GENERATION_VALUE_MISMATCH');
  });
});
