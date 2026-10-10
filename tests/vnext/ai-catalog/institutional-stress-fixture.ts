import { sha256 } from '../../../src/vnext/asset/integrity';
import { factQuote, sourcePayload, type TechnicalInput } from '../../../src/vnext/ai-catalog/contracts';

/** No real manufacturer specifications, marks, secrets or personally identifying data. */
export async function createInstitutionalStressInput(options: {
  sections?: number;
  rowsPerSection?: number;
  models?: number;
} = {}): Promise<TechnicalInput> {
  const sectionCount = options.sections ?? 12;
  const rowCount = options.rowsPerSection ?? 16;
  const modelCount = options.models ?? 4;
  if (!Number.isInteger(sectionCount) || !Number.isInteger(rowCount) ||
      sectionCount < 1 || rowCount < 1 || modelCount < 2 || modelCount > 4) {
    throw new Error('INVALID_STRESS_DIMENSIONS');
  }
  const models = ['AX-041', 'BX-062', 'CX-083', 'DX-104'].slice(0, modelCount);
  const pages = Array.from({ length: Math.ceil(sectionCount / 2) }, (_, index) => ({
    number: index + 1, text: '',
  }));
  const sections: TechnicalInput['sections'] = [];
  for (let sec = 0; sec < sectionCount; sec++) {
    const rows: TechnicalInput['sections'][number]['rows'] = [];
    for (let rowNo = 0; rowNo < rowCount; rowNo++) {
      const values = models.map((_, modelIndex) => {
        const k = sec * rowCount + rowNo;
        if (k % 9 === 0) return String(17 + k + modelIndex).padStart(5, '0');
        if (k % 9 === 1) return '±0,0100';
        if (k % 9 === 2) return '1.234,56';
        if (k % 9 === 3) return '4…20';
        if (k % 9 === 4) return '0,001';
        if (k % 9 === 5) return '≤0,02';
        if (k % 9 === 6) return '20…110';
        if (k % 9 === 7) return '4 fios';
        return '32…122';
      });
      const row: TechnicalInput['sections'][number]['rows'][number] = {
        id: 'row-' + rowNo,
        label: 'Parâmetro ' + String(sec + 1).padStart(2, '0') + '.' + String(rowNo + 1).padStart(2, '0'),
        unit: rowNo % 4 === 0 ? '°C' : rowNo % 4 === 1 ? '%' : rowNo % 4 === 2 ? 'mA' : 'Ω',
        condition: 'Amostra original; ambiente 23 °C',
        values: [],
      };
      row.values = values.map((value, modelIndex) => {
        const quote = factQuote(models[modelIndex], row, value);
        pages[Math.floor(sec / 2)].text += quote + '\n';
        return { status: 'known' as const,
          candidate: { value, source: { sourceId: 'original-qa-source', page: Math.floor(sec / 2) + 1, quote } },
        };
      });
      rows.push(row);
    }
    sections.push({ id: 'group-' + String(sec + 1), title: 'Seção técnica ' + String(sec + 1).padStart(2, '0'), rows });
  }
  return {
    version: 1, kind: 'original-synthetic-specifications',
    title: 'ESTUDO INSTITUCIONAL ORIGINAL — COMPARAÇÃO TÉCNICA EXTENSA — QA',
    models,
    sources: [{
      id: 'original-qa-source', name: 'Fonte sintética original — bancada',
      revision: '1', kind: 'synthetic', pages, sha256: await sha256(sourcePayload(pages)),
    }],
    sections,
  };
}
