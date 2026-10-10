import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { extractPdfText } from '../../../src/vnext/ai-catalog/pdf-intake';
import { prepareGroundedPdfInput } from '../../../src/vnext/ai-catalog/pdf-grounded-input';
import { approveGeneration, assertGeneratedIntegrity, compileCatalog, tableMatrix } from '../../../src/vnext/ai-catalog/composition';

async function fixture() {
  const models = ['AX-041', 'BX-062'];
  const materials: Array<{ sourceId: string; fileName: string; revision: string; bytes: ArrayBuffer }> = [];
  const specs = [
    ['AX-041', '0...700', '0,001', '00017'],
    ['BX-062', '0...900', '0,002', '00024'],
  ];
  const quotes: string[] = [];
  for (const [model, pressure, resolution, code] of specs) {
    const doc = new jsPDF({ format: 'a4' });
    doc.text(model + ' PRESSURE RANGE ' + pressure + ' kPa at 23 C', 20, 35);
    doc.text(model + ' RESOLUTION ' + resolution + ' kPa at 23 C', 20, 45);
    doc.text(model + ' PRODUCT CODE ' + code + ' serial label', 20, 55);
    const bytes = doc.output('arraybuffer');
    materials.push({ sourceId: model.toLowerCase(), fileName: model + '.pdf', revision: '1', bytes });
    quotes.push((await extractPdfText(model + '.pdf', bytes)).pages[0].text);
  }
  const items = [
    { label: 'PRESSURE RANGE', unit: 'kPa', values: ['0...700', '0...900'] },
    { label: 'RESOLUTION', unit: 'kPa', values: ['0,001', '0,002'] },
    { label: 'PRODUCT CODE', unit: '', values: ['00017', '00024'] },
  ];
  const proposal = {
    version: 1, title: 'Grounded PDF source test',
    models,
    sections: [{
      id: 'instrument-specs', title: 'Specifications', rows: items.map((spec, index) => ({
        id: 'row-' + index, label: spec.label, unit: spec.unit, condition: '',
        values: spec.values.map((value, modelIndex) => ({
          status: 'known',
          candidate: { value, source: { sourceId: materials[modelIndex].sourceId,
            page: 1, quote: quotes[modelIndex].split('\n').find(line => line.includes(spec.label))?.trim() || quotes[modelIndex] },
          },
        })),
      })),
    }],
  };
  return { materials, proposal };
}

describe('Authentic PDF byte-grounded extraction boundary', () => {
  it('ingests native PDFs, compiles a canonical catalog with correct values and real-byte hashes', async () => {
    const { materials, proposal } = await fixture();
    const result = await prepareGroundedPdfInput(materials, proposal);
    expect(result.input.kind).toBe('grounded-pdf-specifications');
    expect(result.input.sources.every(source => source.kind === 'pdf')).toBe(true);
    expect(result.pdfBytes).toHaveLength(2);
    expect(result.pdfBytes.every(source => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
    const catalog = await compileCatalog(result.input);
    expect(catalog.document.pages).toHaveLength(1);
    const trace = assertGeneratedIntegrity(catalog);
    expect(trace).toHaveLength(6);
    expect(trace.map(item => item.value)).toEqual(['0...700','0...900','0,001','0,002','00017','00024']);
    const table = catalog.document.pages[0].objects.find(object => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('MISSING_TABLE');
    expect(tableMatrix(table.table)[1]).toEqual(['PRESSURE RANGE','0...700','0...900','kPa','']);
    expect(await approveGeneration(catalog)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a real-PDF claim if the PDF page does not show its alleged value', async () => {
    const { materials, proposal } = await fixture();
    proposal.sections[0].rows[0].values[0].candidate.value = '0...999';
    await expect(prepareGroundedPdfInput(materials, proposal)).rejects.toThrow('PDF_EVIDENCE_VALUE_UNGROUNDED');
  });

  it('rejects model switching, rounded decimals and misattributed source', async () => {
    const data = await fixture();
    data.proposal.sections[0].rows[1].values[0].candidate.value = '0,00';
    await expect(prepareGroundedPdfInput(data.materials, data.proposal)).rejects.toThrow();
    const swapped = await fixture();
    swapped.proposal.sections[0].rows[0].values[0].candidate.source.sourceId = 'bx-062';
    await expect(prepareGroundedPdfInput(swapped.materials, swapped.proposal)).rejects.toThrow();
  });

  it('requires at least one source-backed fact per source rather than declaring unexamined PDFs reviewed', async () => {
    const { materials, proposal } = await fixture();
    proposal.sections[0].rows.forEach(row => {
      row.values[1] = { status: 'missing', reason: 'Não informado', candidate: undefined } as never;
    });
    await expect(prepareGroundedPdfInput(materials, proposal)).rejects.toThrow();
  });

  it('rejects PDF text-index forgeries after a catalog was built', async () => {
    const { materials, proposal } = await fixture();
    const grounded = await prepareGroundedPdfInput(materials, proposal);
    const doc = structuredClone(grounded.input);
    doc.sources[0].pages[0].text = 'fabricated data';
    await expect(compileCatalog(doc)).rejects.toThrow('SOURCE_HASH_MISMATCH');
  });
});
