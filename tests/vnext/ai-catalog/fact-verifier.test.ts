// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FactProposalSchema, SourceReferenceSchema, reviewIssues, sourcePayload, validateTechnicalInput,
  type FactProposal, type TechnicalInput,
} from '@/vnext/ai-catalog/contracts';
import { approveGeneration, compileCatalog, tableMatrix } from '@/vnext/ai-catalog/composition';
import {
  pdfEvidenceSource, sheetEvidenceSource, verificationMessage, verifyFactProposal,
} from '@/vnext/ai-catalog/fact-verifier';
import { prepareCatalogAgentRequest } from '@/vnext/ai-catalog/gemini-plan';
import { prepareGroundedPdfInput } from '@/vnext/ai-catalog/pdf-grounded-input';
import { extractPdfText } from '@/vnext/ai-catalog/pdf-intake';
import { checkValueTextEvidence } from '@/vnext/ai-catalog/pdf-literal-evidence';
import { sha256 } from '@/vnext/asset/integrity';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

type Item = readonly [text: string, x: number, y: number];
/** Original jsPDF fixture; a page without items is a "scanned" page (a filled shape, no text). */
async function pdfOf(fileName: string, pages: readonly (readonly Item[])[]) {
  const doc = new jsPDF({ format: 'a4', unit: 'pt' });
  doc.setFontSize(9);
  pages.forEach((items, index) => {
    if (index) doc.addPage();
    if (!items.length) doc.rect(40, 40, 400, 300, 'F');
    for (const [text, x, y] of items) doc.text(text, x, y);
  });
  const bytes = doc.output('arraybuffer');
  return { fileName, bytes, pdf: await extractPdfText(fileName, bytes) };
}
const lineWith = (text: string, fragment: string) => {
  const found = text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).find(line => line.includes(fragment));
  if (!found) throw new Error(`Fixture line not found: ${fragment}`);
  return found;
};
const known = (value: string, sourceId: string, quote: string, page = 1) =>
  ({ status: 'known' as const, candidate: { value, source: { sourceId, page, quote } } });

// Isotech-style 2D table: models in one header line, one column per model,
// a two-line row label with its values on the line in between, and a cell
// merged across all models.
const MODELS = ['Europa 4520', 'Venus 4951', 'Calisto 4953'];
const isotech = () => pdfOf('europa-venus-calisto.pdf', [[
  ['Specification', 40, 100], ['Europa 4520', 200, 100], ['Venus 4951', 300, 100], ['Calisto 4953', 400, 100],
  ['Range', 40, 130], ['-35 to 140 °C', 200, 130], ['-35 to 155 °C', 300, 130], ['33 to 650 °C', 400, 130],
  ['Uniformity - Between Wells Dry', 40, 150],
  ['±0.05 °C', 200, 160], ['±0.1 °C', 300, 160], ['±0.2 °C', 400, 160],
  ['Block Mode (Radial)', 40, 170],
  ['Immersion depth', 40, 190], ['160 mm in every block of the three models listed above', 200, 190],
]]);
function isotechProposal(text: string, values: Readonly<Record<'range' | 'uniformity' | 'depth', readonly string[]>>): FactProposal {
  const rows = [
    { id: 'range', label: 'Range', unit: '°C', line: '-35 to 140' },
    { id: 'uniformity', label: 'Uniformity - Between Wells Dry Block Mode (Radial)', unit: '°C', line: '±0.05' },
    { id: 'depth', label: 'Immersion depth', unit: 'mm', line: '160 mm' },
  ] as const;
  return FactProposalSchema.parse({
    version: 1, title: 'Blocos secos', models: MODELS,
    sections: [{ id: 'specs', title: 'Especificações', rows: rows.map(row => ({
      id: row.id, label: row.label, unit: row.unit, condition: '',
      values: values[row.id].map(value => known(value, 'isotech', lineWith(text, row.line))),
    })) }],
  });
}
const CORRECT = {
  range: ['-35 to 140', '-35 to 155', '33 to 650'],
  uniformity: ['±0.05', '±0.1', '±0.2'],
  depth: ['160', '160', '160'],
} as const;

describe('FR-67 fact verification by value', () => {
  it('verifies a real 2D table value by value, although model and label sit on other lines', async () => {
    const { pdf } = await isotech();
    const report = verifyFactProposal(isotechProposal(pdf.pages[0].text, CORRECT), [pdfEvidenceSource('isotech', pdf)]);
    // The merged "160 mm" cell starts in Europa's column; for the other two
    // models only a person looking at the page can confirm it.
    expect(report.values.map(value => [value.id, value.status, value.candidates[0].reason])).toEqual([
      ['specs/range/0', 'VERIFIED_TEXT', undefined], ['specs/range/1', 'VERIFIED_TEXT', undefined],
      ['specs/range/2', 'VERIFIED_TEXT', undefined],
      ['specs/uniformity/0', 'VERIFIED_TEXT', undefined], ['specs/uniformity/1', 'VERIFIED_TEXT', undefined],
      ['specs/uniformity/2', 'VERIFIED_TEXT', undefined],
      ['specs/depth/0', 'VERIFIED_TEXT', undefined], ['specs/depth/1', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'],
      ['specs/depth/2', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'],
    ]);
    expect(report.counts).toMatchObject({ VERIFIED_TEXT: 7, VISUAL_ONLY: 2, UNVERIFIED: 0, CONFLICT: 0 });
    expect(report.proposal.sections[0].rows[0].values[0]).toMatchObject({ candidate: { verification: 'VERIFIED_TEXT' } });
    expect(verificationMessage(report.values[0])).toBe('Conferido no texto da página 1.');
  });

  it('marks only the swapped values UNVERIFIED (column of another model) and keeps the rest', async () => {
    const { pdf, bytes, fileName } = await isotech();
    const swapped = { ...CORRECT, range: ['-35 to 155', '-35 to 140', '33 to 650'] };
    const proposal = isotechProposal(pdf.pages[0].text, swapped);
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('isotech', pdf)]);
    expect(report.values.slice(0, 3).map(value => [value.status, value.candidates[0].reason])).toEqual([
      ['UNVERIFIED', 'COLUMN_MISMATCH'], ['UNVERIFIED', 'COLUMN_MISMATCH'], ['VERIFIED_TEXT', undefined],
    ]);
    expect(report.counts).toMatchObject({ VERIFIED_TEXT: 5, VISUAL_ONLY: 2, UNVERIFIED: 2 });
    expect(verificationMessage(report.values[0])).toBe('Na página 1, este valor está na coluna de outro modelo, não do Europa 4520.');

    const prepared = await prepareGroundedPdfInput([{ sourceId: 'isotech', fileName, revision: '2026', bytes }], proposal);
    const facts = prepared.input.sections[0].rows.flatMap(row => row.values.map(fact => fact.status));
    expect(facts).toEqual(['missing', 'missing', 'known', 'known', 'known', 'known', 'known', 'missing', 'missing']);
    // The plain reason of the verifier, naming the file, travels with the empty value.
    expect(prepared.input.sections[0].rows[0].values[0]).toEqual({ status: 'missing',
      reason: 'Na página 1 de europa-venus-calisto.pdf (revisão 2026), este valor está na coluna de outro modelo, não do Europa 4520.' });
    // The sidecar keeps the text positions its column check needed and re-verifies the same way.
    expect(prepared.input.sources[0].pages[0].runs?.length).toBe(pdf.pages[0].runs?.length);
    await expect(validateTechnicalInput(prepared.input)).resolves.toEqual(prepared.input);
  });

  it('refuses a stored sidecar whose table values lost their text positions or were swapped later', async () => {
    const { pdf, bytes, fileName } = await isotech();
    const prepared = await prepareGroundedPdfInput([{ sourceId: 'isotech', fileName, revision: '2026', bytes }],
      isotechProposal(pdf.pages[0].text, CORRECT));
    const withoutRuns = structuredClone(prepared.input);
    const page = withoutRuns.sources[0].pages[0];
    delete page.runs;
    withoutRuns.sources[0].sha256 = await sha256(sourcePayload(withoutRuns.sources[0].pages));
    await expect(validateTechnicalInput(withoutRuns)).rejects.toThrow('PDF_QUOTE_VALUE_UNGROUNDED');
    const swapped = structuredClone(prepared.input);
    const [europa, venus] = swapped.sections[0].rows[0].values;
    if (europa.status !== 'known' || venus.status !== 'known') throw new Error('fixture');
    [europa.candidate.value, venus.candidate.value] = [venus.candidate.value, europa.candidate.value];
    await expect(validateTechnicalInput(swapped)).rejects.toThrow('PDF_QUOTE_VALUE_UNGROUNDED');
  });

  it('never trusts a status written in the proposal', async () => {
    const { pdf } = await isotech();
    const proposal = isotechProposal(pdf.pages[0].text, { ...CORRECT, uniformity: ['±0.5', '±0.1', '±0.2'] });
    const forged = proposal.sections[0].rows[1].values[0];
    if (forged.status !== 'known') throw new Error('fixture');
    forged.candidate.verification = 'VERIFIED_TEXT';
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('isotech', pdf)]);
    expect(report.values[3]).toMatchObject({ status: 'UNVERIFIED', candidates: [{ reason: 'VALUE_NOT_IN_QUOTE' }] });
    expect(report.proposal.sections[0].rows[1].values[0]).toMatchObject({ candidate: { verification: 'UNVERIFIED' } });
  });
});

// TA-25N: the father's own Portuguese and English manuals disagree (domain audit).
const taPt = () => pdfOf('ta-25n-manual-pt.pdf', [[
  ['TA-25N Especificações', 40, 80],
  ['Faixa -25 a 140 °C', 40, 100],
  ['Resolução 0,01 °C', 40, 115],
  ['Exatidão em mA ±0,02 % FS', 40, 130],
  ['(*) Temperatura Ambiente: 20ºC', 40, 160],
]]);
const taEn = () => pdfOf('ta-25n-manual-en.pdf', [[
  ['TA-25N Specifications', 40, 80],
  ['Range -25 to 155 °C', 40, 100],
  ['Resolution 0,01 °C', 40, 115],
  ['mA accuracy ±0.01 % FS', 40, 130],
  ['Ambient 23 °C', 40, 160],
]]);
async function taProposal() {
  const [pt, en] = await Promise.all([taPt(), taEn()]);
  const ptText = pt.pdf.pages[0].text, enText = en.pdf.pages[0].text;
  const both = (ptValue: string, ptLine: string, enValue: string, enLine: string) => ({ status: 'conflict' as const, candidates: [
    { value: ptValue, source: { sourceId: 'ta-pt', page: 1, quote: lineWith(ptText, ptLine), sha256: pt.pdf.sha256 } },
    { value: enValue, source: { sourceId: 'ta-en', page: 1, quote: lineWith(enText, enLine), sha256: en.pdf.sha256 } },
  ] });
  const proposal = FactProposalSchema.parse({
    version: 1, title: 'TA-25N', models: ['TA-25N'],
    sections: [{ id: 'especificacoes', title: 'Especificações', rows: [
      { id: 'faixa', label: 'Faixa', unit: '°C', condition: '', values: [both('-25 a 140', 'Faixa', '-25 to 155', 'Range')] },
      { id: 'resolucao', label: 'Resolução', unit: '°C', condition: '', values: [both('0,01', 'Resolução', '0,01', 'Resolution')] },
      { id: 'exatidao-ma', label: 'Exatidão em mA', unit: '% FS', condition: '', values: [both('±0,02', 'Exatidão', '±0.01', 'accuracy')] },
      // The English candidate here is invented (the page says 23 °C).
      { id: 'ambiente', label: 'Temperatura ambiente', unit: '°C', condition: '', values: [both('20', 'Ambiente', '25', 'Ambient')] },
    ] }],
  });
  return { pt, en, proposal };
}

describe('FR-67 sources that disagree (TA-25N PT vs EN), single product', () => {
  it('reports CONFLICT when both manuals support different values, and agreement or invention otherwise', async () => {
    const { pt, en, proposal } = await taProposal();
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('ta-pt', pt.pdf), pdfEvidenceSource('ta-en', en.pdf)]);
    expect(report.values.map(value => [value.rowId, value.status])).toEqual([
      ['faixa', 'CONFLICT'], ['resolucao', 'VERIFIED_TEXT'], ['exatidao-ma', 'CONFLICT'], ['ambiente', 'VERIFIED_TEXT'],
    ]);
    expect(report.values[3].candidates.map(item => [item.value, item.status, item.reason]))
      .toEqual([['20', 'VERIFIED_TEXT', undefined], ['25', 'UNVERIFIED', 'VALUE_NOT_IN_QUOTE']]);
    // English labels cannot be matched to the Portuguese rows by text: those
    // candidates go to a person, never to "verified".
    expect(report.values[0].candidates.map(item => [item.status, item.reason]))
      .toEqual([['VERIFIED_TEXT', undefined], ['VISUAL_ONLY', 'LABEL_UNCLEAR']]);
    expect(verificationMessage(report.values[0]))
      .toBe('As fontes divergem: -25 a 140 na página 1; -25 to 155 na página 1. Escolha o valor certo.');
    expect(verificationMessage(report.values[0], report.sourceNames)).toBe('As fontes divergem: -25 a 140 na página 1 de ' +
      'ta-25n-manual-pt.pdf; -25 to 155 na página 1 de ta-25n-manual-en.pdf. Escolha o valor certo.');
    expect(report.usedSourceIds).toEqual(['ta-en', 'ta-pt']);
  });

  it('carries the conflicts to the review step; nothing is chosen silently and one model is enough', async () => {
    const { pt, en, proposal } = await taProposal();
    const prepared = await prepareGroundedPdfInput([
      { sourceId: 'ta-pt', fileName: pt.fileName, revision: '2026-07', bytes: pt.bytes },
      { sourceId: 'ta-en', fileName: en.fileName, revision: '2024', bytes: en.bytes },
    ], proposal);
    const input = prepared.input;
    expect(input.models).toEqual(['TA-25N']);
    expect(input.sections[0].rows.map(row => row.values[0].status)).toEqual(['conflict', 'known', 'conflict', 'known']);
    const issues = reviewIssues(input, {});
    expect(issues.map(issue => [issue.id, issue.fact.status, issue.resolved])).toEqual([
      ['especificacoes/faixa/0', 'conflict', false], ['especificacoes/exatidao-ma/0', 'conflict', false],
    ]);
    const unresolved = await compileCatalog(input);
    await expect(approveGeneration(unresolved)).rejects.toThrow('UNRESOLVED_TECHNICAL_REVIEW');
    const decided = await compileCatalog(input, undefined, { 'especificacoes/faixa/0': 0, 'especificacoes/exatidao-ma/0': 0 });
    const table = decided.document.pages[0].objects.find(object => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('table');
    expect(tableMatrix(table.table).map(row => row.slice(0, 2))).toEqual([
      ['Característica', 'TA-25N'], ['Faixa', '-25 a 140'], ['Resolução', '0,01'], ['Exatidão em mA', '±0,02'], ['Temperatura ambiente', '20'],
    ]);
    expect(await approveGeneration(decided)).toMatch(/^[a-f0-9]{64}$/);
    // The planner also accepts a single product now.
    expect(prepareCatalogAgentRequest(input, 'Monte a ficha técnica').models).toEqual(['TA-25N']);
  });

  it('refuses a citation whose file hash is not the uploaded file', async () => {
    const { pt, en, proposal } = await taProposal();
    const conflict = proposal.sections[0].rows[0].values[0];
    if (conflict.status !== 'conflict') throw new Error('fixture');
    conflict.candidates[1].source.sha256 = 'f'.repeat(64);
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('ta-pt', pt.pdf), pdfEvidenceSource('ta-en', en.pdf)]);
    expect(report.values[0]).toMatchObject({ status: 'VERIFIED_TEXT',
      candidates: [{ status: 'VERIFIED_TEXT' }, { status: 'UNVERIFIED', reason: 'SOURCE_HASH_MISMATCH' }] });
  });
});

describe('FR-67 pages that can only be checked by eye', () => {
  it('marks a scanned page VISUAL_ONLY, never verified, and keeps it as one side of a conflict', async () => {
    const folder = await pdfOf('ta-folder.pdf', [[['TA-25N Faixa -25 a 140 °C', 40, 100]], []]);
    expect(folder.pdf.pages[1].needsVisualExtraction).toBe(true);
    const visual = { value: '-25 a 155', source: { sourceId: 'folder', page: 2, quote: 'Faixa -25 a 155 °C', box_2d: [100, 80, 140, 600] as [number, number, number, number] } };
    const text = { value: '-25 a 140', source: { sourceId: 'folder', page: 1, quote: 'TA-25N Faixa -25 a 140 °C' } };
    const proposal = FactProposalSchema.parse({ version: 1, title: 'TA-25N', models: ['TA-25N'], sections: [{ id: 'specs', title: 'Especificações', rows: [
      { id: 'so-imagem', label: 'Faixa nominal', unit: '°C', condition: '', values: [{ status: 'known', candidate: visual }] },
      { id: 'divergente', label: 'Faixa', unit: '°C', condition: '', values: [{ status: 'conflict', candidates: [text, visual] }] },
    ] }] });
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('folder', folder.pdf)]);
    expect(report.values.map(value => value.status)).toEqual(['VISUAL_ONLY', 'CONFLICT']);
    expect(verificationMessage(report.values[0])).toBe('A página 2 é uma imagem; confira olhando a página.');

    const prepared = await prepareGroundedPdfInput([{ sourceId: 'folder', fileName: folder.fileName, revision: '1', bytes: folder.bytes }], proposal);
    expect(prepared.input.sections[0].rows[0].values[0]).toEqual({ status: 'missing',
      reason: 'A página 2 de ta-folder.pdf (revisão 1) é uma imagem; confira olhando a página.' });
    const conflict = prepared.input.sections[0].rows[1].values[0];
    expect(conflict.status === 'conflict' && conflict.candidates.map(item => [item.value, item.verification]))
      .toEqual([['-25 a 140', 'VERIFIED_TEXT'], ['-25 a 155', 'VISUAL_ONLY']]);
    expect(prepared.input.sources[0].pages.map(page => page.number)).toEqual([1, 2]);
  });

  it('treats a value located only by region on a page with text as VISUAL_ONLY', async () => {
    const page = await pdfOf('folder-texto.pdf', [[['TA-25N Banho termico', 40, 100]]]);
    const proposal = FactProposalSchema.parse({ version: 1, title: 'TA-25N', models: ['TA-25N'], sections: [{ id: 'specs', title: 'Especificações', rows: [
      { id: 'faixa', label: 'Faixa', unit: '°C', condition: '', values: [{ status: 'known', candidate: { value: '-25 a 140',
        source: { sourceId: 'folder', page: 1, quote: 'Faixa -25 a 140 °C', box_2d: [400, 100, 450, 500] } } }] },
      { id: 'sem-caixa', label: 'Estabilidade', unit: '°C', condition: '', values: [known('±0,01', 'folder', 'Estabilidade ±0,01 °C')] },
    ] }] });
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('folder', page.pdf)]);
    expect(report.values.map(value => [value.status, value.candidates[0].reason])).toEqual([
      ['VISUAL_ONLY', 'VISUAL_REGION_ONLY'], ['UNVERIFIED', 'QUOTE_NOT_ON_PAGE'],
    ]);
  });
});

describe('FR-67 spreadsheet cells (VERIFIED_CELL)', () => {
  const sha = 'a'.repeat(64);
  const workbook = sheetEvidenceSource('pcon-master', sha, [{
    number: 2, name: 'DB_SENSORS',
    rows: [['Modelo', 'Faixa', 'Exatidão'], ['PCON-Y17', '0 a 20 bar', '0,025 % FS']],
    addresses: [['DB_SENSORS!A1', 'DB_SENSORS!B1', 'DB_SENSORS!C1'], ['DB_SENSORS!A2', 'DB_SENSORS!B2', 'DB_SENSORS!C2']],
  }]);
  const csv = sheetEvidenceSource('lista-csv', 'b'.repeat(64), [{ number: 1, rows: [['Modelo', 'Peso'], ['PCON-Y17', '9,5']] }]);
  const cellFact = (value: string, address: string, extra: Record<string, unknown> = {}) => ({ status: 'known' as const, candidate: {
    value, source: { sourceId: 'pcon-master', page: 2, quote: value, cell: { sheet: 'DB_SENSORS', address }, ...extra } } });
  const proposalOf = (rows: readonly { id: string; label: string; unit: string; fact: unknown }[]) => FactProposalSchema.parse({
    version: 1, title: 'PCON-Y17', models: ['PCON-Y17'],
    sections: [{ id: 'specs', title: 'Especificações', rows: rows.map(row => ({ id: row.id, label: row.label, unit: row.unit, condition: '', values: [row.fact] })) }],
  });

  it('verifies a value equal to the cited cell, with or without its unit, and explains mismatches plainly', () => {
    const report = verifyFactProposal(proposalOf([
      { id: 'faixa', label: 'Faixa', unit: 'bar', fact: cellFact('0 a 20', 'B2') },
      { id: 'exatidao', label: 'Exatidão', unit: '% FS', fact: cellFact('0,025', '$c$2', { sha256: sha }) },
      { id: 'arredondado', label: 'Exatidão arredondada', unit: '% FS', fact: cellFact('0,02', 'C2') },
      { id: 'fora', label: 'Outra', unit: '', fact: cellFact('1', 'D9') },
      { id: 'sem-celula', label: 'Sem célula', unit: '', fact: { status: 'known', candidate: { value: 'PCON-Y17', source: { sourceId: 'pcon-master', page: 2, quote: 'PCON-Y17' } } } },
      { id: 'hash', label: 'Hash', unit: '', fact: cellFact('PCON-Y17', 'A2', { sha256: 'c'.repeat(64) }) },
      { id: 'peso', label: 'Peso', unit: 'kg', fact: { status: 'known', candidate: { value: '9,5', source: { sourceId: 'lista-csv', page: 1, quote: '9,5', cell: { address: 'b2' } } } } },
    ]), [workbook, csv]);
    expect(report.values.map(value => [value.rowId, value.status, value.candidates[0].reason])).toEqual([
      ['faixa', 'VERIFIED_CELL', undefined], ['exatidao', 'VERIFIED_CELL', undefined],
      ['arredondado', 'UNVERIFIED', 'CELL_VALUE_MISMATCH'], ['fora', 'UNVERIFIED', 'CELL_NOT_FOUND'],
      ['sem-celula', 'UNVERIFIED', 'CELL_REFERENCE_REQUIRED'], ['hash', 'UNVERIFIED', 'SOURCE_HASH_MISMATCH'],
      ['peso', 'VERIFIED_CELL', undefined],
    ]);
    expect(verificationMessage(report.values[0])).toBe('Conferido na planilha: aba DB_SENSORS, célula B2.');
    expect(verificationMessage(report.values[2])).toBe('O valor não é igual ao da planilha (aba DB_SENSORS, célula C2).');
    expect(verificationMessage(report.values[6])).toBe('Conferido na planilha: célula B2.');
  });

  it('reports a conflict between a spreadsheet cell and a PDF page', async () => {
    const folder = await pdfOf('pcon-y17-folder.pdf', [[['PCON-Y17 Exatidão ±0,02 % FS', 40, 100]]]);
    const report = verifyFactProposal(proposalOf([{ id: 'exatidao', label: 'Exatidão', unit: '% FS', fact: { status: 'conflict', candidates: [
      cellFact('0,025', 'C2').candidate,
      { value: '±0,02', source: { sourceId: 'folder', page: 1, quote: 'PCON-Y17 Exatidão ±0,02 % FS' } },
    ] } }]), [workbook, pdfEvidenceSource('folder', folder.pdf)]);
    expect(report.values[0].status).toBe('CONFLICT');
    expect(report.values[0].candidates.map(item => item.status)).toEqual(['VERIFIED_CELL', 'VERIFIED_TEXT']);
  });
});

describe('FR-67 adapted contract', () => {
  it('accepts file hash, region and cell address in a source reference and rejects malformed ones', () => {
    const base = { sourceId: 'folder', page: 1, quote: 'Faixa' };
    expect(SourceReferenceSchema.parse({ ...base, sha256: 'a'.repeat(64), box_2d: [10, 20, 30, 40], cell: { sheet: 'DB_SENSORS', address: 'C7' } }))
      .toMatchObject({ box_2d: [10, 20, 30, 40], cell: { address: 'C7' } });
    for (const bad of [{ box_2d: [30, 20, 10, 40] }, { box_2d: [0, 0, 1001, 10] }, { cell: { address: 'C0' } }, { sha256: 'xyz' }, { extra: true }]) {
      expect(SourceReferenceSchema.safeParse({ ...base, ...bad }).success).toBe(false);
    }
  });

  it('allows a single-product fact proposal but still requires one value per model', () => {
    const one = { version: 1, title: 'TA-25N', models: ['TA-25N'], sections: [{ id: 's', title: 'Especificações', rows: [
      { id: 'r', label: 'Faixa', unit: '°C', condition: '', values: [{ status: 'missing', reason: 'Não informado' }] }] }] };
    expect(FactProposalSchema.safeParse(one).success).toBe(true);
    expect(FactProposalSchema.safeParse({ ...one, models: ['TA-25N', 'TA-35N'] }).success).toBe(false);
  });

  it('keeps unverified values, cells and forged visual-only values out of a grounded sidecar', async () => {
    const { pt, en, proposal } = await taProposal();
    const prepared = await prepareGroundedPdfInput([
      { sourceId: 'ta-pt', fileName: pt.fileName, revision: '1', bytes: pt.bytes },
      { sourceId: 'ta-en', fileName: en.fileName, revision: '1', bytes: en.bytes },
    ], proposal);
    const mutate = (change: (input: TechnicalInput) => void) => { const copy = structuredClone(prepared.input); change(copy); return copy; };
    const knownFact = (input: TechnicalInput) => {
      const fact = input.sections[0].rows[1].values[0];
      if (fact.status !== 'known') throw new Error('fixture');
      return fact.candidate;
    };
    await expect(validateTechnicalInput(mutate(input => { knownFact(input).verification = 'UNVERIFIED'; }))).rejects.toThrow('SOURCE_VERIFICATION_UNSUPPORTED');
    await expect(validateTechnicalInput(mutate(input => { knownFact(input).verification = 'VISUAL_ONLY'; }))).rejects.toThrow('SOURCE_VALUE_UNVERIFIED');
    await expect(validateTechnicalInput(mutate(input => { knownFact(input).source.cell = { address: 'A1' }; }))).rejects.toThrow('SOURCE_VERIFICATION_UNSUPPORTED');
    await expect(validateTechnicalInput(mutate(input => { knownFact(input).source.sha256 = 'f'.repeat(64); }))).rejects.toThrow('SOURCE_HASH_MISMATCH');
    await expect(validateTechnicalInput(mutate(input => { knownFact(input).value = '0,1'; }))).rejects.toThrow('PDF_QUOTE_VALUE_UNGROUNDED');
  });
});

describe('FR-67 literal checks on units, signs and conditions', () => {
  const check = (overrides: Partial<Parameters<typeof checkValueTextEvidence>[0]>) => {
    const quote = overrides.quote ?? 'Exatidão ±0,02 % FS';
    return checkValueTextEvidence({ pageText: quote, quote, value: '±0,02', unit: '% FS', condition: '', model: 'TA-25N',
      models: ['TA-25N'], label: 'Exatidão', labels: ['Exatidão'], ...overrides });
  };
  it.each([
    ['same unit with other spacing', { quote: 'Exatidão ±0,02 %FS' }, true],
    ['degree typed as ordinal indicator', { quote: 'Ambiente 20ºC', value: '20', unit: '°C', label: 'Ambiente', labels: ['Ambiente'] }, true],
    ['unit in the row label of a 2D table', { quote: 'Faixa (°C) -25 a 140', value: '-25 a 140', unit: '°C', label: 'Faixa', labels: ['Faixa'] }, true],
    ['range followed by its unit', { quote: 'Saída 4 a 20 mA', value: '4 a 20', unit: 'mA', label: 'Saída', labels: ['Saída'] }, true],
    ['condition only in a footnote of the page', { pageText: 'Exatidão ±0,02 % FS\n(*) a 23 °C', condition: 'a 23 °C' }, true],
  ] as const)('accepts %s', (_name, overrides, verified) => {
    expect(check(overrides).verified).toBe(verified);
  });
  it.each([
    ['% FS read as %', { unit: '%' }, 'UNIT_MISMATCH'],
    ['psi value claimed as kPa', { quote: 'Faixa 0...700 psi (0...4826 kPa)', value: '0...700', unit: 'kPa', label: 'Faixa', labels: ['Faixa'] }, 'UNIT_MISMATCH'],
    ['dropped plus-minus sign', { value: '0,02' }, 'VALUE_NOT_IN_QUOTE'],
    ['rounded decimals', { value: '±0,0' }, 'VALUE_NOT_IN_QUOTE'],
    ['condition that is nowhere', { condition: 'a 23 °C' }, 'CONDITION_NOT_ON_PAGE'],
    ['model only as a longer variant', { quote: 'TA-25NX Exatidão ±0,02 % FS' }, 'MODEL_VARIANT'],
    ['other model column in a multi-model page', { quote: 'Exatidão ±0,02 % FS', models: ['TA-25N', 'TA-35N'], pageText: 'TA-35N Exatidão ±0,02 % FS' }, 'MODEL_NOT_ON_PAGE'],
  ] as const)('rejects %s', (_name, overrides, problem) => {
    expect(check(overrides)).toEqual({ verified: false, problem });
  });
  it('accepts a header-list quote and lets the column check decide', () => {
    expect(check({ quote: 'TA-25N TA-35N Exatidão ±0,02 % FS ±0,05 % FS', models: ['TA-25N', 'TA-35N'] }).verified).toBe(true);
  });
});

// Quirks seen in the father's real PDFs (PRESYS TA manual EN p6, TA folder p9,
// Isotech datasheet p2): numbers split in touching pieces ("1"+"55"), units
// glued to numbers ("14kg"), the model name repeated in a page title, and the
// same figure in another row of the page.
async function presysTable() {
  const doc = new jsPDF({ format: 'a4', unit: 'pt' });
  doc.setFontSize(9);
  doc.text('TA-25N / TA-35N / TA-50N', 300, 40);
  const header: Item[] = [['TA-25N', 200, 100], ['TA-35N', 300, 100], ['TA-50N', 400, 100]];
  for (const [text, x, y] of header) doc.text(text, x, y);
  doc.text('Operating Range', 40, 120);
  for (const [prefix, x] of [['-25 to 1', 200], ['-35 to 1', 300], ['-50 to 1', 400]] as const) {
    doc.text(prefix, x, 120);
    const touching = x + doc.getTextWidth(prefix);
    // Another font run starts exactly where the first ends, as in the real manual.
    doc.setFont('times', 'normal');
    doc.text('55 °C', touching, 120);
    doc.setFont('helvetica', 'normal');
  }
  doc.text('Power', 40, 140); doc.text('200 W', 200, 140); doc.text('300 W', 300, 140); doc.text('400 W', 400, 140);
  doc.text('Weight', 40, 160); doc.text('10.5kg', 200, 160); doc.text('10.5kg', 300, 160); doc.text('12.5kg', 400, 160);
  // "300" in the TA-25N column and "200" in the TA-35N column of ANOTHER row.
  doc.text('Dimensions', 40, 180); doc.text('260 x 300 x 305 mm', 200, 180); doc.text('315 x 200 x 305 mm', 300, 180);
  doc.text('Insert', 40, 200); doc.text('IN06', 300, 200);
  const bytes = doc.output('arraybuffer');
  return { bytes, pdf: await extractPdfText('ta-manual-en.pdf', bytes) };
}
const presysProposal = (models: string[], rows: readonly { id: string; label: string; unit: string; values: readonly [string, string][] }[]) =>
  FactProposalSchema.parse({ version: 1, title: 'TA', models, sections: [{ id: 'specs', title: 'Especificações', rows: rows.map(row => ({
    id: row.id, label: row.label, unit: row.unit, condition: '',
    values: row.values.map(([value, quote]) => known(value, 'manual', quote)),
  })) }] });

describe('FR-67 on real-PDF text layer quirks', () => {
  it('reads numbers split into touching pieces and units glued to numbers, and re-verifies the sidecar', async () => {
    const { pdf, bytes } = await presysTable();
    expect(pdf.pages[0].text).not.toContain('-25 to 155');
    const proposal = presysProposal(['TA-25N', 'TA-35N', 'TA-50N'], [
      { id: 'range', label: 'Operating Range', unit: '°C', values: [
        ['-25 to 155', 'Operating Range -25 to 155 °C -35 to 155 °C -50 to 155 °C'],
        ['-35 to 155', 'Operating Range -25 to 155 °C -35 to 155 °C -50 to 155 °C'],
        ['-50 to 155', 'Operating Range -25 to 155 °C -35 to 155 °C -50 to 155 °C']] },
      { id: 'weight', label: 'Weight', unit: 'kg', values: [
        ['10.5', 'Weight 10.5kg 10.5kg 12.5kg'], ['10.5', 'Weight 10.5kg 10.5kg 12.5kg'], ['12.5', 'Weight 10.5kg 10.5kg 12.5kg']] },
    ]);
    const report = verifyFactProposal(proposal, [pdfEvidenceSource('manual', pdf)]);
    expect(report.values.map(value => value.status)).toEqual(Array(6).fill('VERIFIED_TEXT'));
    const prepared = await prepareGroundedPdfInput([{ sourceId: 'manual', fileName: 'ta-manual-en.pdf', revision: '1', bytes }], proposal);
    expect(prepared.input.sources[0].pages[0].text).toContain('-25 to 155 °C');
    await expect(validateTechnicalInput(prepared.input)).resolves.toBeDefined();
  });

  it('checks only the quoted row: the same figure in the right column of another row does not rescue a swap', async () => {
    const { pdf } = await presysTable();
    const report = verifyFactProposal(presysProposal(['TA-25N', 'TA-35N', 'TA-50N'], [
      { id: 'power', label: 'Power', unit: 'W', values: [['300', 'Power 200 W 300 W 400 W'], ['200', 'Power 200 W 300 W 400 W'], ['400', 'Power 200 W 300 W 400 W']] },
    ]), [pdfEvidenceSource('manual', pdf)]);
    expect(report.values.map(value => [value.status, value.candidates[0].reason])).toEqual([
      ['UNVERIFIED', 'COLUMN_MISMATCH'], ['UNVERIFIED', 'COLUMN_MISMATCH'], ['VERIFIED_TEXT', undefined],
    ]);
  });

  it('protects a single-product sheet cut from a multi-model table, and sends lone cells to a visual check', async () => {
    const { pdf } = await presysTable();
    const report = verifyFactProposal(presysProposal(['TA-25N'], [
      { id: 'power-ok', label: 'Power', unit: 'W', values: [['200', 'Power 200 W 300 W 400 W']] },
      { id: 'weight-wrong', label: 'Weight', unit: 'kg', values: [['12.5', 'Weight 10.5kg 10.5kg 12.5kg']] },
      { id: 'insert', label: 'Insert', unit: '', values: [['IN06', 'Insert IN06']] },
    ]), [pdfEvidenceSource('manual', pdf)]);
    expect(report.values.map(value => [value.rowId, value.status, value.candidates[0].reason])).toEqual([
      ['power-ok', 'VERIFIED_TEXT', undefined], ['weight-wrong', 'UNVERIFIED', 'COLUMN_MISMATCH'], ['insert', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'],
    ]);
    expect(verificationMessage(report.values[2]))
      .toBe('Na página 1, não dá para saber pelo texto se este valor vale para o TA-25N; confira olhando a página.');
  });
});

// Review of FR-67 (1H): a wrong value must never come out VERIFIED_TEXT because
// the quote left out the model, the row label or the unit.
type Row = { id: string; label: string; unit: string; values: readonly (readonly [value: string, quote: string, page?: number])[] };
const proposalOf = (models: string[], rows: readonly Row[], sourceId = 'folha') => FactProposalSchema.parse({
  version: 1, title: 'Revisão', models, sections: [{ id: 'specs', title: 'Especificações', rows: rows.map(row => ({
    id: row.id, label: row.label, unit: row.unit, condition: '',
    values: row.values.map(([value, quote, page]) => known(value, sourceId, quote, page)),
  })) }],
});
const statuses = (report: ReturnType<typeof verifyFactProposal>) =>
  report.values.map(value => [value.id, value.status, value.candidates[0]?.reason]);

describe('FR-67 review: the model must be tied to the value when another model is on the page', () => {
  const AXBX = ['AX-041', 'BX-062'];
  const range = (values: readonly (readonly [string, string])[]): Row[] =>
    [{ id: 'faixa', label: 'PRESSURE RANGE', unit: 'kPa', values }];

  it('does not verify values swapped between models when the quotes leave the model out', async () => {
    const { pdf } = await pdfOf('ax-bx.pdf', [[['AX-041 PRESSURE RANGE 700 kPa', 40, 100], ['BX-062 PRESSURE RANGE 900 kPa', 40, 115]]]);
    const swapped = verifyFactProposal(proposalOf(AXBX, range([['900', 'PRESSURE RANGE 900 kPa'], ['700', 'PRESSURE RANGE 700 kPa']])),
      [pdfEvidenceSource('folha', pdf)]);
    expect(statuses(swapped)).toEqual([
      ['specs/faixa/0', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'], ['specs/faixa/1', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'],
    ]);
    expect(verificationMessage(swapped.values[0]))
      .toBe('Na página 1, não dá para saber pelo texto se este valor vale para o AX-041; confira olhando a página.');
    // Naming the model in the quote ties it, and a swap is then refused outright.
    const named = verifyFactProposal(proposalOf(AXBX, range([['700', 'AX-041 PRESSURE RANGE 700 kPa'], ['700', 'AX-041 PRESSURE RANGE 700 kPa']])),
      [pdfEvidenceSource('folha', pdf)]);
    expect(statuses(named)).toEqual([['specs/faixa/0', 'VERIFIED_TEXT', undefined], ['specs/faixa/1', 'UNVERIFIED', 'MODEL_ATTRIBUTION']]);
  });

  it('does not verify swapped rows when the models are only in a title line or in one header-list run', async () => {
    const title = await pdfOf('titulo.pdf', [[
      ['AX-041 / BX-062 PRESSURE TRANSMITTERS', 40, 80], ['PRESSURE RANGE 700 kPa', 40, 100], ['PRESSURE RANGE 900 kPa', 40, 115],
    ]]);
    expect(statuses(verifyFactProposal(proposalOf(AXBX, range([['900', 'PRESSURE RANGE 900 kPa'], ['700', 'PRESSURE RANGE 700 kPa']])),
      [pdfEvidenceSource('folha', title.pdf)]))).toEqual([
      ['specs/faixa/0', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'], ['specs/faixa/1', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'],
    ]);
    const list = await pdfOf('lista.pdf', [[['Modelos AX-041 BX-062 PRESSURE RANGE 700 kPa 900 kPa', 40, 100]]]);
    const quote = 'Modelos AX-041 BX-062 PRESSURE RANGE 700 kPa 900 kPa';
    expect(statuses(verifyFactProposal(proposalOf(AXBX, range([['900', quote], ['700', quote]])), [pdfEvidenceSource('folha', list.pdf)])))
      .toEqual([['specs/faixa/0', 'VISUAL_ONLY', 'COLUMN_UNCLEAR'], ['specs/faixa/1', 'VISUAL_ONLY', 'COLUMN_UNCLEAR']]);
    // Nothing is left to use, so the bridge refuses the whole proposal instead of filling cells.
    await expect(prepareGroundedPdfInput([{ sourceId: 'folha', fileName: list.fileName, revision: '1', bytes: list.bytes }],
      proposalOf(AXBX, range([['900', quote], ['700', quote]])))).rejects.toThrow('PDF_EVIDENCE_NONE_VERIFIED');
  });

  it('treats the same name with another number as another model, even when only one model is declared', async () => {
    const family = await pdfOf('familia.pdf', [[['TA-25N TA-35N', 200, 80], ['Faixa 0...700 kPa 0...900 kPa', 40, 100]]]);
    expect(statuses(verifyFactProposal(proposalOf(['TA-25N'], [{ id: 'faixa', label: 'Faixa', unit: 'kPa',
      values: [['0...900', 'Faixa 0...700 kPa 0...900 kPa']] }]), [pdfEvidenceSource('folha', family.pdf)])))
      .toEqual([['specs/faixa/0', 'VISUAL_ONLY', 'COLUMN_UNCLEAR']]);
    // A single-product sheet that names no other model still verifies by text.
    const single = await pdfOf('ta-25n.pdf', [[['TA-25N', 40, 80], ['Faixa 0...700 kPa', 40, 100]]]);
    expect(statuses(verifyFactProposal(proposalOf(['TA-25N'], [{ id: 'faixa', label: 'Faixa', unit: 'kPa',
      values: [['0...700', 'Faixa 0...700 kPa']] }]), [pdfEvidenceSource('folha', single.pdf)])))
      .toEqual([['specs/faixa/0', 'VERIFIED_TEXT', undefined]]);
  });
});

describe('FR-67 review: the row label must be tied to the value', () => {
  const page = () => pdfOf('ta-25n.pdf', [[
    ['TA-25N Especificações', 40, 80], ['Faixa -25 a 140 °C', 40, 100], ['Resolução 0,1 °C', 40, 115], ['Exatidão ±0,3 °C', 40, 130],
  ]]);

  it('does not verify a value printed under another row, quoted with or without that row', async () => {
    const { pdf } = await page();
    const report = verifyFactProposal(proposalOf(['TA-25N'], [
      { id: 'exatidao', label: 'Exatidão', unit: '°C', values: [['0,1', 'Resolução 0,1 °C']] },
      { id: 'estabilidade', label: 'Estabilidade', unit: '°C', values: [['0,1', '0,1 °C']] },
    ]), [pdfEvidenceSource('folha', pdf)]);
    expect(statuses(report)).toEqual([
      ['specs/exatidao/0', 'VISUAL_ONLY', 'LABEL_UNCLEAR'], ['specs/estabilidade/0', 'VISUAL_ONLY', 'LABEL_UNCLEAR'],
    ]);
    expect(verificationMessage(report.values[0]))
      .toBe('Na página 1, não dá para saber pelo texto se este valor é de "Exatidão"; confira olhando a página.');
  });

  it('never borrows the label of a neighbour row that prints its own values', async () => {
    const { pdf } = await pdfOf('ta-25n.pdf', [[['TA-25N', 40, 80], ['Faixa 0...700 kPa', 40, 100], ['Faixa de medição 0...900 kPa', 40, 115]]]);
    expect(statuses(verifyFactProposal(proposalOf(['TA-25N'], [
      { id: 'vizinha', label: 'Faixa de medição', unit: 'kPa', values: [['0...700', 'Faixa 0...700 kPa']] },
      { id: 'propria', label: 'Faixa de medição', unit: 'kPa', values: [['0...900', 'Faixa de medição 0...900 kPa']] },
    ]), [pdfEvidenceSource('folha', pdf)]))).toEqual([
      ['specs/vizinha/0', 'VISUAL_ONLY', 'LABEL_UNCLEAR'], ['specs/propria/0', 'VERIFIED_TEXT', undefined],
    ]);
  });

  it('reads a label split around its values (Isotech) but not a value of the row below it', async () => {
    const { pdf } = await pdfOf('isotech.pdf', [[
      ['Europa 4520', 40, 80], ['Uniformity - Between Wells Dry', 40, 100], ['Block Mode (Radial) <0.008 °C', 40, 115],
      ['Uniformity - Lower 40mm', 40, 130], ['(Axial) Dry Block Mode <0.040 °C', 40, 145],
      ['Uniformity - Lower 40mm (Axial) As Liquid Bath <0.026 °C', 40, 160],
    ]]);
    const RADIAL = 'Uniformity - Between Wells Dry Block Mode (Radial)';
    expect(statuses(verifyFactProposal(proposalOf(['Europa 4520'], [
      { id: 'radial', label: RADIAL, unit: '°C', values: [['<0.008', 'Block Mode (Radial) <0.008 °C']] },
      { id: 'axial', label: 'Uniformity - Lower 40mm (Axial) Dry Block Mode', unit: '°C', values: [['<0.040', '(Axial) Dry Block Mode <0.040 °C']] },
      { id: 'banho', label: 'Uniformity - Lower 40mm (Axial) As Liquid Bath', unit: '°C',
        values: [['<0.026', 'Uniformity - Lower 40mm (Axial) As Liquid Bath <0.026 °C']] },
      { id: 'radial-errado', label: RADIAL, unit: '°C', values: [['<0.040', '<0.040 °C']] },
    ]), [pdfEvidenceSource('folha', pdf)]))).toEqual([
      ['specs/radial/0', 'VERIFIED_TEXT', undefined], ['specs/axial/0', 'VERIFIED_TEXT', undefined],
      ['specs/banho/0', 'VERIFIED_TEXT', undefined], ['specs/radial-errado/0', 'VISUAL_ONLY', 'LABEL_UNCLEAR'],
    ]);
  });

  it('ties a value printed among other rows only where its label is printed with it (TA folder p9)', () => {
    // Native text puts labels and values in separate blocks; the lines rebuilt
    // from text positions come after a blank line, as in verificationPageText.
    const native = 'Cooling Time:\nElectric Power:\nWeight:\n11 min 16 min\n200 W 300 W\n10.5 kg 12.5 kg';
    const check = (pageText: string) => checkValueTextEvidence({ pageText, quote: '200 W 300 W', value: '200', unit: 'W',
      condition: '', model: 'TA-25N', models: ['TA-25N'], label: 'Electric Power', labels: ['Cooling Time', 'Electric Power', 'Weight'] });
    expect(check(native)).toMatchObject({ verified: true, labelTied: false });
    expect(check(`${native}\n\nCooling Time: 11 min 16 min\nElectric Power: 200 W 300 W\nWeight: 10.5 kg 12.5 kg`))
      .toMatchObject({ verified: true, labelTied: true });
  });

  it('still verifies a value whose own row label is printed before it on its line', async () => {
    const { pdf } = await page();
    expect(statuses(verifyFactProposal(proposalOf(['TA-25N'], [
      { id: 'resolucao', label: 'Resolução', unit: '°C', values: [['0,1', '0,1 °C']] },
      { id: 'faixa', label: 'Faixa', unit: '°C', values: [['-25 a 140', 'Faixa -25 a 140 °C']] },
    ]), [pdfEvidenceSource('folha', pdf)]))).toEqual([
      ['specs/resolucao/0', 'VERIFIED_TEXT', undefined], ['specs/faixa/0', 'VERIFIED_TEXT', undefined],
    ]);
  });
});

describe('FR-67 review: the unit must be printed with the value', () => {
  it('refuses a value printed in another unit and sends a unit printed only elsewhere to a person', async () => {
    const { pdf } = await pdfOf('ta-25n.pdf', [[
      ['TA-25N', 40, 80], ['Faixa (psi) 0...100', 40, 100], ['Faixa (kPa) 0...700', 40, 115], ['Pressão máxima 1000', 40, 130],
    ]]);
    const report = verifyFactProposal(proposalOf(['TA-25N'], [
      { id: 'faixa-psi', label: 'Faixa', unit: 'kPa', values: [['0...100', 'Faixa (psi) 0...100']] },
      { id: 'faixa-kpa', label: 'Faixa', unit: 'kPa', values: [['0...700', 'Faixa (kPa) 0...700']] },
      { id: 'maxima', label: 'Pressão máxima', unit: 'kPa', values: [['1000', 'Pressão máxima 1000']] },
    ]), [pdfEvidenceSource('folha', pdf)]);
    expect(statuses(report)).toEqual([
      ['specs/faixa-psi/0', 'UNVERIFIED', 'UNIT_MISMATCH'], ['specs/faixa-kpa/0', 'VERIFIED_TEXT', undefined],
      ['specs/maxima/0', 'VISUAL_ONLY', 'UNIT_UNCLEAR'],
    ]);
    expect(verificationMessage(report.values[2]))
      .toBe('Na página 1, a unidade kPa não aparece junto deste valor; confira olhando a página.');
  });

  it('reads a footnote mark after a unit as a footnote, and a power or product of units as another unit', async () => {
    const { pdf } = await pdfOf('ta-25n.pdf', [[['TA-25N', 40, 80], ['Faixa -25 a 155 °C*', 40, 100], ['Área 2 m^2', 40, 115], ['Torque 5 N*m', 40, 130]]]);
    expect(statuses(verifyFactProposal(proposalOf(['TA-25N'], [
      { id: 'faixa', label: 'Faixa', unit: '°C', values: [['-25 a 155', 'Faixa -25 a 155 °C*']] },
      { id: 'area', label: 'Área', unit: 'm', values: [['2', 'Área 2 m^2']] },
      { id: 'torque', label: 'Torque', unit: 'N', values: [['5', 'Torque 5 N*m']] },
    ]), [pdfEvidenceSource('folha', pdf)]))).toEqual([
      ['specs/faixa/0', 'VERIFIED_TEXT', undefined], ['specs/area/0', 'UNVERIFIED', 'UNIT_NOT_ON_PAGE'],
      ['specs/torque/0', 'UNVERIFIED', 'UNIT_NOT_ON_PAGE'],
    ]);
  });
});

describe('FR-67 review: a page too long to store', () => {
  it('marks its values as not verified instead of failing the whole batch', async () => {
    const doc = new jsPDF({ format: 'a4', unit: 'pt' });
    doc.setFontSize(2);
    doc.text('TA-25N Faixa -25 a 140 °C', 20, 20);
    for (let line = 0; line < 95; line++) doc.text('x'.repeat(999), 20, 30 + line * 3);
    doc.addPage();
    doc.setFontSize(9);
    doc.text('TA-25N Resolução 0,01 °C', 40, 100);
    const bytes = doc.output('arraybuffer');
    const pdf = await extractPdfText('longa.pdf', bytes);
    expect(pdf.pages[0].text.length).toBeGreaterThan(50_000);
    const proposal = proposalOf(['TA-25N'], [
      { id: 'faixa', label: 'Faixa', unit: '°C', values: [['-25 a 140', 'TA-25N Faixa -25 a 140 °C', 1]] },
      { id: 'resolucao', label: 'Resolução', unit: '°C', values: [['0,01', 'TA-25N Resolução 0,01 °C', 2]] },
    ]);
    expect(statuses(verifyFactProposal(proposal, [pdfEvidenceSource('folha', pdf)]))).toEqual([
      ['specs/faixa/0', 'UNVERIFIED', 'PAGE_TEXT_INCOMPLETE'], ['specs/resolucao/0', 'VERIFIED_TEXT', undefined],
    ]);
    const prepared = await prepareGroundedPdfInput([{ sourceId: 'folha', fileName: 'longa.pdf', revision: '1', bytes }], proposal);
    expect(prepared.input.sections[0].rows[0].values[0]).toEqual({ status: 'missing',
      reason: 'A página 1 de longa.pdf (revisão 1) tem texto demais para conferir por inteiro.' });
    expect(prepared.input.sources[0].pages.map(item => item.number)).toEqual([2]);
  });
});
