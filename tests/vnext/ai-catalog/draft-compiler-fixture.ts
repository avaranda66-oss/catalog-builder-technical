import { jsPDF } from 'jspdf';
import type { FactProposal } from '@/vnext/ai-catalog/contracts';
import { factSetFromReport, withSourceDivergences, type DraftFactSet, type DraftPosition } from '@/vnext/ai-catalog/draft-compiler';
import { findSourceDivergences, sourceFactValues } from '@/vnext/ai-catalog/fact-extraction';
import { pdfEvidenceSource, verifyFactProposal, type FactVerificationReport } from '@/vnext/ai-catalog/fact-verifier';
import { extractPdfText, type ExtractedPdf } from '@/vnext/ai-catalog/pdf-intake';

/**
 * FR-69 / FR-68 fixtures. The figures, labels, units and conditions are the
 * real ones of the TA-25N/35N/50N files, as hand-checked in
 * docs/ai-catalog/spike-extracao/gabarito.json (folder p. 9, manual PT p. 5);
 * the pages are rebuilt with jsPDF in the same table layout (one column per
 * model), so the verifier reads native text and text positions as on the PDFs.
 */
export const TA = ['TA-25N', 'TA-35N', 'TA-50N'] as const;
type Item = readonly [text: string, x: number, y: number];

async function pdfOf(fileName: string, items: readonly Item[]): Promise<ExtractedPdf> {
  const doc = new jsPDF({ format: 'a4', unit: 'pt' });
  doc.setFontSize(9);
  for (const [text, x, y] of items) doc.text(text, x, y);
  return extractPdfText(fileName, doc.output('arraybuffer'));
}
const lineWith = (pdf: ExtractedPdf, fragment: string) => {
  const found = pdf.pages[0].text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).find(line => line.includes(fragment));
  if (!found) throw new Error(`Fixture line not found: ${fragment}`);
  return found;
};

interface RowSpec { id: string; label: string; unit: string; condition: string; values: readonly string[]; printed?: readonly string[] }
const row = (y: number, label: string, cells: readonly string[]): Item[] =>
  [[label, 40, y], ...cells.map((text, index): Item => [text, 220 + index * 110, y])];

async function tableReport(sourceId: string, fileName: string, heading: string, modelsLabel: string,
  rows: readonly RowSpec[], notes: readonly Item[], answer: Readonly<Record<string, readonly string[]>> = {}) {
  const items: Item[] = [[heading, 40, 70], ...row(100, modelsLabel, TA)];
  rows.forEach((spec, index) => items.push(...row(130 + index * 20, spec.label, spec.printed ?? spec.values)));
  const pdf = await pdfOf(fileName, [...items, ...notes]);
  const proposal: FactProposal = {
    version: 1, title: heading, models: [...TA],
    sections: [{ id: 'specs', title: heading, rows: rows.map(spec => ({
      id: spec.id, label: spec.label, unit: spec.unit, condition: spec.condition,
      values: (answer[spec.id] ?? spec.values).map(value => ({
        status: 'known' as const, candidate: { value, source: { sourceId, page: 1, quote: lineWith(pdf, spec.label) } },
      })),
    })) }],
  };
  const evidence = pdfEvidenceSource(sourceId, pdf, fileName);
  return { pdf, proposal, report: verifyFactProposal(proposal, [evidence]) as FactVerificationReport };
}

/** presys-ta-folder.pdf p. 9 (English). `answer` replaces what the "model" read for a row. */
export const folderReport = (answer: Readonly<Record<string, readonly string[]>> = {}) => tableReport(
  'ta-folder', 'presys-ta-folder.pdf', 'Technical Specifications', 'Models', [
    { id: 'operating-range', label: 'Operating Range', unit: '°C', condition: 'ambient temperature: 23 °C',
      values: ['-25 °C to +155 °C', '-35 °C to +155 °C', '-50 °C to +155 °C'] },
    { id: 'resolution', label: 'Resolution', unit: '°C', condition: '', values: ['0.01', '0.01', '0.01'] },
    { id: 'electric-power', label: 'Electric Power', unit: 'W', condition: '', values: ['200', '300', '400'],
      printed: ['200 W', '300 W', '400 W'] },
    { id: 'weight', label: 'Weight', unit: 'kg', condition: '', values: ['10.5', '10.5', '12.5'],
      printed: ['10.5 kg', '10.5 kg', '12.5 kg'] },
  ], [['ambient temperature: 23 °C', 40, 220]], answer);

/** Manual PT p. 5 (Portuguese). */
export const manualReport = () => tableReport(
  'ta-manual-pt', 'manual-ta-pt.pdf', 'Especificações Técnicas', 'Modelos', [
    { id: 'faixa-de-operacao', label: 'Faixa de Operação (°C)', unit: '°C', condition: 'Temperatura Ambiente: 20°C',
      values: ['-25 a 140', '-35 a 140', '-50 a 140'] },
    { id: 'potencia-eletrica', label: 'Potência Elétrica (W)', unit: 'W', condition: '', values: ['200', '300', '400'] },
  ], [['Temperatura Ambiente: 20°C', 40, 200]]);

/** Quantity keys of the manual rows (FR-66 `rowKeys`), to line them up with the folder rows. */
export const MANUAL_KEYS = { 'specs/faixa-de-operacao': 'operating-range', 'specs/potencia-eletrica': 'electric-power' };

/** The manual (Portuguese, the father's file) with the folder's readings of the same quantities. */
export async function twoFiles() {
  const manual = await manualReport(), folder = await folderReport();
  const values = [
    ...sourceFactValues({ proposal: manual.proposal, dropped: [], rowKeys: MANUAL_KEYS }, manual.report),
    ...sourceFactValues({ proposal: folder.proposal, dropped: [], rowKeys: {} }, folder.report),
  ];
  const divergences = findSourceDivergences(values);
  const set = withSourceDivergences(factSetFromReport(manual.report, { title: 'Especificações técnicas', rowKeys: MANUAL_KEYS }),
    divergences, folder.report.sourceNames);
  return { set, divergences };
}

/**
 * The folder table plus a "Cooling Time" row copied from "Weight" (all three models verified); `change` rewrites
 * each model's position, e.g. to MISSING (no candidate at all) for the models the row does not apply to.
 */
export async function withCoolingRow(change: (position: DraftPosition) => DraftPosition, overrides: Readonly<Record<string, readonly string[]>> = {}) {
  const set = factSetFromReport((await folderReport(overrides)).report);
  const weight = set.rows.find(row => row.rowId === 'weight')!;
  const row = { ...weight, ref: 'specs/cooling', rowId: 'cooling', key: 'cooling', label: 'Cooling Time' };
  const positions = set.positions.filter(position => position.rowRef === weight.ref)
    .map(position => change({ ...position, id: `specs/cooling/${position.modelIndex}`, rowRef: row.ref }));
  return { ...set, rows: [...set.rows, row], positions: [...set.positions, ...positions] } satisfies DraftFactSet;
}
export const noCandidate = (position: DraftPosition): DraftPosition => ({
  id: position.id, kind: 'value', rowRef: position.rowRef, modelIndex: position.modelIndex, status: 'MISSING', candidates: [],
  missingReason: 'Não informado nas fontes.',
});
