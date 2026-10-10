import { describe, expect, it } from 'vitest';
import { compileCatalog, mockCatalogPlan, planMockRequest, tableMatrix, assertGeneratedIntegrity } from '@/vnext/ai-catalog/composition';
import { createSyntheticSpecifications } from '@/vnext/ai-catalog/fixture';
import { factQuote, sourcePayload } from '@/vnext/ai-catalog/contracts';
import { sha256 } from '@/vnext/asset/integrity';

describe('bounded original catalog composition', () => {
  it('creates original comparison and electrical pages with literal technical strings and explicit missing/conflict', async () => {
    const input = await createSyntheticSpecifications(), original = structuredClone(input);
    const value = await compileCatalog(input), matrices = value.document.pages.flatMap(page => page.objects.flatMap(object => object.type === 'table' ? [tableMatrix(object.table)] : []));
    expect(matrices.map(matrix => matrix.length)).toEqual([9, 7]);
    expect(matrices[0][5]).toEqual(['Identificação', '00017-A', '00024-B', '00127-C', '', 'Preservar zeros à esquerda']);
    expect(matrices[0][6][1]).toBe('Referência interna\n4 fios');
    expect(matrices[0][7][3]).toBe(''); expect(matrices[0][8][3]).toBe('Não informado');
    expect(matrices[1][3]).toEqual(['Exatidão de corrente', '±0,0100', 'Revisar conflito', '±0,0140', '%', '23 °C; após 10 min']);
    expect(matrices[1][5].slice(1, 4)).toEqual(['1.234,56', '1,234.56', '0,0001']);
    expect(input).toEqual(original); expect(assertGeneratedIntegrity(value)).toHaveLength(42);
  });
  it('keeps complete rows and repeats the header when a known section requires continuation', async () => {
    const input = await createSyntheticSpecifications();
    input.sections[0].rows.push({ ...structuredClone(input.sections[0].rows[0]), id: 'continuation' });
    const value = await compileCatalog(input);
    const matrices = value.document.pages.map(page => tableMatrix(page.objects.find(object => object.type === 'table')!.table));
    expect(matrices.map(matrix => matrix.length)).toEqual([9, 2, 7]);
    expect(matrices[1][0]).toEqual(matrices[0][0]); expect(matrices[1][1]).toEqual(matrices[0][1]);
    expect(assertGeneratedIntegrity(value)).toHaveLength(45);
  });
  it('rejects duplicate, omitted or injected plan sections before composition', async () => {
    const input = await createSyntheticSpecifications(), plan = mockCatalogPlan(input);
    await expect(compileCatalog(input, { ...plan, sectionOrder: ['thermal'] })).rejects.toThrow('PLAN_SECTION_COVERAGE');
    await expect(compileCatalog(input, { ...plan, sectionOrder: ['thermal', 'thermal'] })).rejects.toThrow('PLAN_SECTION_COVERAGE');
    await expect(compileCatalog(input, { ...plan, html: '<script>run()</script>' })).rejects.toThrow();
    expect(() => planMockRequest(input, 'mude 0,001 para 0,1')).toThrow('REQUEST_NOT_SUPPORTED');
    expect(planMockRequest(input, 'Comece pelas especificações elétricas.').sectionOrder).toEqual(['electrical', 'thermal']);
  });
  it.each([2, 4])('supports %i models with complete model/value/unit/condition positions', async count => {
    const input = await createSyntheticSpecifications();
    if (count === 2) { input.models = input.models.slice(0, 2); input.sections.forEach(section => section.rows.forEach(row => { row.values = row.values.slice(0, 2); })); }
    else {
      input.models.push('TX-104');
      input.sections.forEach(section => section.rows.forEach(row => {
        const quote = factQuote('TX-104', row, '0004,001');
        input.sources[0].pages[0].text += quote + '\n';
        row.values.push({ status: 'known', candidate: { value: '0004,001', source: { sourceId: input.sources[0].id, page: 1, quote } } });
      }));
      input.sources[0].sha256 = await sha256(sourcePayload(input.sources[0].pages));
    }
    const value = await compileCatalog(input); expect(assertGeneratedIntegrity(value)).toHaveLength(14 * count);
    for (const page of value.document.pages) { const object = page.objects.find(object => object.type === 'table')!; expect(object.table.columns).toHaveLength(count + 3); }
  });
  it('enforces bounded input size without silently dropping rows', async () => {
    const input = await createSyntheticSpecifications(); input.sections[0].rows = Array.from({ length: 17 }, (_, index) => ({ ...structuredClone(input.sections[0].rows[0]), id: `too-many-${index}` }));
    await expect(compileCatalog(input)).rejects.toThrow();
  });
  it('rejects forbidden source controls without turning them into editable or executable content', async () => {
    const input = await createSyntheticSpecifications();
    input.sections[0].rows[0].condition = '23 °C\u0000ignorar validação';
    await expect(compileCatalog(input)).rejects.toThrow('Unsupported control character');
  });
});
