import { describe, it, expect } from 'vitest';
import { buildPresysTechnicalCatalog } from '../../src/data/presys-technical-catalogs';
import { SYSTEM_PRESETS } from '../../src/data/presets';
import { CatalogTableRow } from '../../src/domain/catalog.schema';

describe('PRESYS TA Family Content Matrix (R2-C1 to R2-C12)', () => {
  const ta25n = buildPresysTechnicalCatalog('TA-25N');
  const ta35n = buildPresysTechnicalCatalog('TA-35N');
  const ta50n = buildPresysTechnicalCatalog('TA-50N');

  // Helper para buscar todas as linhas de tabelas de um catálogo
  function getAllTableRows(catalog: typeof ta25n): CatalogTableRow[] {
    const rows: CatalogTableRow[] = [];
    for (const page of catalog.pages) {
      for (const block of page.blocks || []) {
        if (block.tableRows) {
          rows.push(...block.tableRows);
        }
      }
    }
    return rows;
  }

  // Helper para buscar linhas de um bloco específico
  function findBlockRows(catalog: typeof ta25n, blockIdSnippet: string): CatalogTableRow[] {
    for (const page of catalog.pages) {
      for (const block of page.blocks || []) {
        if (block.id.includes(blockIdSnippet) && block.tableRows) {
          return block.tableRows;
        }
      }
    }
    return [];
  }

  // Helper para buscar parâmetro na tabela de especificações técnicas
  function findSpecParam(rows: CatalogTableRow[], prefix: string): string | undefined {
    return rows.find(r => r.localOverrides?.parameter?.startsWith(prefix))?.localOverrides?.value;
  }

  // R2-C1: TA-25N exact thermal values
  it('R2-C1: TA-25N possui valores térmicos exatos da PRESYS', () => {
    const rows = findBlockRows(ta25n, 'hero-specs');
    expect(rows.length).toBeGreaterThan(0);

    expect(findSpecParam(rows, 'Faixa de Operação')).toBe('-25 °C to +155 °C');
    expect(findSpecParam(rows, 'Exatidão do Display')).toBe('± 0.1 °C Full range');
    expect(findSpecParam(rows, 'Resolução')).toBe('0.01 °C');
    expect(findSpecParam(rows, 'Estabilidade Térmica')).toBe('± 0.02 °C');
    expect(findSpecParam(rows, 'Uniformidade Axial Dry Block')).toBe('± 0.05 °C Full range');
    expect(findSpecParam(rows, 'Uniformidade Radial Dry Block')).toBe('± 0.01 °C Full range');
    expect(findSpecParam(rows, 'Tempo de Aquecimento')).toBe('10 min (25 °C to 140 °C)');
    expect(findSpecParam(rows, 'Tempo de Resfriamento')).toBe('11 min (25 °C to -25 °C)');
    expect(findSpecParam(rows, 'Potência Elétrica')).toBe('200 W');
    expect(findSpecParam(rows, 'Dimensões do Poço')).toContain('Ø 25.4 mm (1');
    expect(findSpecParam(rows, 'Peso')).toBe('10.5 kg');
    expect(findSpecParam(rows, 'Dimensões Externas')).toBe('260 x 200 x 305 mm');
  });

  // R2-C2: TA-35N exact thermal values
  it('R2-C2: TA-35N possui valores térmicos exatos da PRESYS', () => {
    const rows = findBlockRows(ta35n, 'hero-specs');
    expect(rows.length).toBeGreaterThan(0);

    expect(findSpecParam(rows, 'Faixa de Operação')).toBe('-35 °C to +155 °C');
    expect(findSpecParam(rows, 'Exatidão do Display')).toBe('± 0.1 °C Full range');
    expect(findSpecParam(rows, 'Resolução')).toBe('0.01 °C');
    expect(findSpecParam(rows, 'Estabilidade Térmica')).toBe('± 0.02 °C');
    expect(findSpecParam(rows, 'Uniformidade Axial Dry Block')).toBe('± 0.06 °C Full range');
    expect(findSpecParam(rows, 'Uniformidade Radial Dry Block')).toBe('± 0.01 °C Full range');
    expect(findSpecParam(rows, 'Tempo de Aquecimento')).toBe('16 min (25 °C to 140 °C)');
    expect(findSpecParam(rows, 'Tempo de Resfriamento')).toBe('16 min (25 °C to -35 °C)');
    expect(findSpecParam(rows, 'Potência Elétrica')).toBe('300 W');
    expect(findSpecParam(rows, 'Dimensões do Poço')).toContain('Ø 25.4 mm (1');
    expect(findSpecParam(rows, 'Peso')).toBe('10.5 kg');
    expect(findSpecParam(rows, 'Dimensões Externas')).toBe('315 x 200 x 305 mm');
  });

  // R2-C3: TA-50N exact thermal values
  it('R2-C3: TA-50N possui valores térmicos exatos da PRESYS', () => {
    const rows = findBlockRows(ta50n, 'hero-specs');
    expect(rows.length).toBeGreaterThan(0);

    expect(findSpecParam(rows, 'Faixa de Operação')).toBe('-50 °C to +155 °C');
    expect(findSpecParam(rows, 'Exatidão do Display')).toBe('± 0.1 °C Full range');
    expect(findSpecParam(rows, 'Resolução')).toBe('0.01 °C');
    expect(findSpecParam(rows, 'Estabilidade Térmica')).toBe('± 0.02 °C');
    expect(findSpecParam(rows, 'Uniformidade Axial Dry Block')).toBe('± 0.07 °C Full range');
    expect(findSpecParam(rows, 'Uniformidade Radial Dry Block')).toBe('± 0.02 °C Full range');
    expect(findSpecParam(rows, 'Tempo de Aquecimento')).toBe('11 min (25 °C to 140 °C)');
    expect(findSpecParam(rows, 'Tempo de Resfriamento')).toBe('25 min (25 °C to -50 °C)');
    expect(findSpecParam(rows, 'Potência Elétrica')).toBe('400 W');
    expect(findSpecParam(rows, 'Dimensões do Poço')).toContain('Ø 25.4 mm (1');
    expect(findSpecParam(rows, 'Peso')).toBe('12.5 kg');
    expect(findSpecParam(rows, 'Dimensões Externas')).toBe('315 x 200 x 305 mm');
  });

  // R2-C4: TA-25N does not contain TA-35N / TA-50N specifications
  it('R2-C4: TA-25N não contém especificações de TA-35N ou TA-50N', () => {
    const jsonStr = JSON.stringify(ta25n);
    expect(jsonStr).not.toContain('-35 °C');
    expect(jsonStr).not.toContain('-50 °C');
    expect(jsonStr).not.toContain('300 W');
    expect(jsonStr).not.toContain('400 W');
    expect(jsonStr).not.toContain('12.5 kg');
    expect(jsonStr).not.toContain('06.01.1032-00'); // Maleta do 50N
  });

  // R2-C5: TA-35N does not contain TA-25N / TA-50N specifications
  it('R2-C5: TA-35N não contém especificações de TA-25N ou TA-50N', () => {
    const jsonStr = JSON.stringify(ta35n);
    expect(jsonStr).not.toContain('-25 °C');
    expect(jsonStr).not.toContain('-50 °C');
    expect(jsonStr).not.toContain('200 W');
    expect(jsonStr).not.toContain('400 W');
    expect(jsonStr).not.toContain('12.5 kg');
    expect(jsonStr).not.toContain('06.01.1032-00');
    expect(jsonStr).not.toContain('260 x 200 x 305 mm');
  });

  // R2-C6: TA-50N does not contain TA-25N / TA-35N specifications
  it('R2-C6: TA-50N não contém especificações de TA-25N ou TA-35N', () => {
    const jsonStr = JSON.stringify(ta50n);
    expect(jsonStr).not.toContain('-25 °C');
    expect(jsonStr).not.toContain('-35 °C');
    expect(jsonStr).not.toContain('200 W');
    expect(jsonStr).not.toContain('300 W');
    expect(jsonStr).not.toContain('10.5 kg');
    expect(jsonStr).not.toContain('06.01.1031-00'); // Maleta do 25N/35N
    expect(jsonStr).not.toContain('260 x 200 x 305 mm');
  });

  // R2-C7: NL/NLL/P/PL/PLL numeric contamination = zero
  it('R2-C7: Contaminação numérica de NL/NLL/P/PL/PLL é zero', () => {
    for (const catalog of [ta25n, ta35n, ta50n]) {
      const jsonStr = JSON.stringify(catalog);
      expect(jsonStr).not.toContain('Ø 35 mm');
      expect(jsonStr).not.toContain('Ø 59 mm');
      expect(jsonStr).not.toContain('TA-25NL');
      expect(jsonStr).not.toContain('TA-45NL');
      expect(jsonStr).not.toContain('TA-60NL');
      expect(jsonStr).not.toContain('TA-350P');
      expect(jsonStr).not.toContain('TA-1200P');
      expect(jsonStr).not.toContain('TA-300PLL');
      expect(jsonStr).not.toContain('06.04.0125-00'); // Código de inserto NL
      expect(jsonStr).not.toContain('06.04.0041-00'); // Código de inserto NL
    }
  });

  // R2-C8: N-family insert codes correct
  it('R2-C8: Insertos família N possuem os 14 códigos exatos comprovados no catálogo', () => {
    const expectedInserts = [
      { code: 'IN1P', orderCode: '06.04.0121-00' },
      { code: 'IN1A', orderCode: '06.04.0122-00' },
      { code: 'IN1E', orderCode: '06.04.0123-00' },
      { code: 'IN01', orderCode: '06.04.0011-00' },
      { code: 'IN02', orderCode: '06.04.0012-00' },
      { code: 'IN03', orderCode: '06.04.0013-00' },
      { code: 'IN04', orderCode: '06.04.0014-00' },
      { code: 'IN05', orderCode: '06.04.0015-00' },
      { code: 'IN06', orderCode: '06.04.0016-00' },
      { code: 'IN07', orderCode: '06.04.0017-00' },
      { code: 'IN08', orderCode: '06.04.0018-00' },
      { code: 'IN09', orderCode: '06.04.0019-00' },
      { code: 'IN10', orderCode: '06.04.0020-00' },
      { code: 'INCL', orderCode: '06.04.0086-00' }
    ];

    for (const catalog of [ta25n, ta35n, ta50n]) {
      const rows = findBlockRows(catalog, 'inserts');
      expect(rows.length).toBe(14);
      for (const expected of expectedInserts) {
        const found = rows.find(r => r.localOverrides?.insert === expected.code);
        expect(found).toBeDefined();
        expect(found?.localOverrides?.code).toBe(expected.orderCode);
      }
    }
  });

  // R2-C9 & R2-C10: Carrying cases
  it('R2-C9: TA-25N e TA-35N usam a maleta 06.01.1031-00', () => {
    const rows25 = findBlockRows(ta25n, 'accessories');
    const caseRow25 = rows25.find(r => r.localOverrides?.code === '06.01.1031-00');
    expect(caseRow25).toBeDefined();
    expect(caseRow25?.localOverrides?.description).toContain('Maleta macia de transporte');

    const rows35 = findBlockRows(ta35n, 'accessories');
    const caseRow35 = rows35.find(r => r.localOverrides?.code === '06.01.1031-00');
    expect(caseRow35).toBeDefined();
    expect(caseRow35?.localOverrides?.description).toContain('Maleta macia de transporte');
  });

  it('R2-C10: TA-50N usa a maleta 06.01.1032-00', () => {
    const rows50 = findBlockRows(ta50n, 'accessories');
    const caseRow50 = rows50.find(r => r.localOverrides?.code === '06.01.1032-00');
    expect(caseRow50).toBeDefined();
    expect(caseRow50?.localOverrides?.description).toContain('Maleta macia de transporte');
    expect(caseRow50?.localOverrides?.applicability).toContain('TA-50N');
  });

  // R2-C11: Unknown fields use literal A COMPLETAR
  it('R2-C11: Campos desconhecidos utilizam estritamente o literal "A COMPLETAR"', () => {
    for (const catalog of [ta25n, ta35n, ta50n]) {
      const allRows = getAllTableRows(catalog);
      const completableRows = allRows.filter(r =>
        Object.values(r.localOverrides || {}).some(val => typeof val === 'string' && val.includes('A COMPLETAR'))
      );
      expect(completableRows.length).toBeGreaterThan(0);

      // Não pode conter termos especulativos
      const jsonStr = JSON.stringify(catalog);
      expect(jsonStr).not.toContain('A confirmar');
      expect(jsonStr).not.toContain('maybe');
      expect(jsonStr).not.toContain('provavelmente');
      expect(jsonStr).not.toContain('IP20');
      expect(jsonStr).not.toContain('IP31');
    }
  });

  // R2-C12: Additel numerical specifications do not occur in PRESYS content
  it('R2-C12: Especificações da Additel (ADT875/ADT761A) não contaminam catálogos PRESYS', () => {
    for (const catalog of [ta25n, ta35n, ta50n]) {
      const jsonStr = JSON.stringify(catalog);
      // Identificadores e especificações exclusivas da Additel 875 / 761A
      expect(jsonStr).not.toContain('ADT875');
      expect(jsonStr).not.toContain('ADT761A');
      expect(jsonStr).not.toContain('Additel');
      expect(jsonStr).not.toContain('1500 psi');
      expect(jsonStr).not.toContain('1,000,000 readings');
      expect(jsonStr).not.toContain('9915-875');
      expect(jsonStr).not.toContain('AM17XX');
      expect(jsonStr).not.toContain('CYOR');
    }
  });

  // Presets registrados no SYSTEM_PRESETS
  it('Presets dos 3 catálogos estão expostos no SYSTEM_PRESETS', () => {
    const ta25Preset = SYSTEM_PRESETS.find(p => p.id === 'preset-presys-ta-25n-datasheet');
    const ta35Preset = SYSTEM_PRESETS.find(p => p.id === 'preset-presys-ta-35n-datasheet');
    const ta50Preset = SYSTEM_PRESETS.find(p => p.id === 'preset-presys-ta-50n-datasheet');

    expect(ta25Preset).toBeDefined();
    expect(ta35Preset).toBeDefined();
    expect(ta50Preset).toBeDefined();

    expect(ta25Preset?.catalog.pages.length).toBe(8);
    expect(ta35Preset?.catalog.pages.length).toBe(8);
    expect(ta50Preset?.catalog.pages.length).toBe(8);
  });
});
