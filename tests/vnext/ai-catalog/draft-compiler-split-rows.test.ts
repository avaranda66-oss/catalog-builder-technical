// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { jsPDF } from 'jspdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TableModel, TableObject, CatalogDocument } from '@/vnext/domain';
import {
  LABEL_HEADER, compileDraftDocument, draftIntegrityProblems, factSetFromReviews, joinConditionSplitRows, pendingFacts, recordChoice,
  withSourceDivergences, type DraftFactSet, type DraftPosition, type DraftRow,
} from '@/vnext/ai-catalog/draft-compiler';
import type { SourceFactValue } from '@/vnext/ai-catalog/fact-extraction';
import { reviewExtraction } from '@/vnext/ai-catalog/extraction-review';
import { extractPdfText, type ExtractedPdf } from '@/vnext/ai-catalog/pdf-intake';
import { cellText, richPlain } from '../editor/table-split-fixtures';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

/**
 * presys-ta-folder.pdf p. 9 as the server extraction read it (docs/ai-catalog/extracao-servidor, rodada 3):
 * "Cooling Time" is printed once, each model with its own value and condition. The page is rebuilt with jsPDF
 * with one column per model (as draft-compiler-fixture.ts does), so the verifier reads real text positions.
 */
const TA = ['TA-25N', 'TA-35N', 'TA-50N'];
const COOLING = [['11 min (25 °C to -25 °C)', '11', '25 °C to -25 °C'], ['16 min (25 °C to -35 °C)', '16', '25 °C to -35 °C'],
  ['25 min (25 °C to -50 °C)', '25', '25 °C to -50 °C']] as const;
async function folderPage(): Promise<ExtractedPdf> {
  const doc = new jsPDF({ format: 'a4', unit: 'pt' });
  doc.setFontSize(8);
  const row = (y: number, label: string, cells: readonly string[]) => {
    doc.text(label, 40, y);
    cells.forEach((cell, index) => doc.text(cell, 150 + index * 145, y));
  };
  doc.text('Technical Specifications', 40, 70);
  row(100, 'Models', TA);
  row(130, 'Weight', ['10.5 kg', '10.5 kg', '12.5 kg']);
  row(150, 'Cooling Time:', COOLING.map(([printed]) => printed));
  return extractPdfText('presys-ta-folder.pdf', doc.output('arraybuffer'));
}
const lineWith = (pdf: ExtractedPdf, fragment: string) =>
  pdf.pages[0].text.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).find(line => line.includes(fragment))!;
async function review() {
  const pdf = await folderPage();
  const value = (model: string, literal: string, unit: string, condition: string, label: string) =>
    ({ model, literal, unit, ...(condition ? { condition } : {}), sourceRef: { page: 1, quote: lineWith(pdf, label) } });
  const sheet = { title: 'TA-25N / TA-35N / TA-50N', models: TA, sharedTables: [], pages: [{ page: 1, content: 'specifications' }],
    sections: [{ title: 'Technical Specifications', rows: [
      { key: 'weight', label: 'Weight', values: [value('TA-25N', '10.5', 'kg', '', 'Weight'), value('TA-35N', '10.5', 'kg', '', 'Weight'),
        value('TA-50N', '12.5', 'kg', '', 'Weight')] },
      { key: 'cooling-time', label: 'Cooling Time:', values: COOLING.map(([, literal, condition], index) =>
        value(TA[index], literal, 'min', condition, 'Cooling Time')) },
    ] }] };
  return reviewExtraction(sheet, { sourceId: 'ta-folder', fileName: pdf.fileName, sha256: pdf.sha256,
    pageCount: pdf.pageCount, firstPage: 1, lastPage: 1 }, pdf);
}

const tables = (document: CatalogDocument) => document.pages.flatMap(page =>
  page.objects.filter((object): object is TableObject => object.type === 'table').map(object => object.table));
const matrix = (table: TableModel) => table.rows.map(row => table.columns.map((_, column) => cellText(table, row.id, column)));
/** Every reading of the set, by position id: nothing may be lost or changed by the join. */
const readings = (set: DraftFactSet) => Object.fromEntries(set.positions.filter(item => item.candidates.length)
  .map(item => [item.id, item.candidates.map(candidate => `${candidate.value} ${candidate.unit} ${candidate.status}`)]));

describe('T3: one characteristic printed once per model, each with its own condition', () => {
  it('compiles one row with the value of each model and the conditions as notes per model', async () => {
    // As read, the proposal has one row per condition (one condition per row).
    const reviewed = await review();
    expect(reviewed.tables[0].report.proposal.sections[0].rows.filter(row => row.label === 'Cooling Time:')).toHaveLength(3);
    const set = factSetFromReviews([reviewed]);
    const cooling = set.rows.filter(row => row.label === 'Cooling Time:');
    expect(cooling).toHaveLength(1);
    expect(cooling[0]).toMatchObject({ condition: '', modelConditions: ['25 °C to -25 °C', '25 °C to -35 °C', '25 °C to -50 °C'] });

    const { document, draft } = compileDraftDocument(set, { transactionId: 'tx-cooling' });
    const [table] = tables(document);
    expect(matrix(table)).toEqual([
      [LABEL_HEADER, ...TA],
      ['Weight', '10.5 kg', '10.5 kg', '12.5 kg'],
      ['Cooling Time:', '11 min', '16 min', '25 min'],
    ]);
    expect(table.annotations.map(note => richPlain(note.text))).toEqual([
      'Cooling Time (TA-25N): 25 °C to -25 °C', 'Cooling Time (TA-35N): 25 °C to -35 °C', 'Cooling Time (TA-50N): 25 °C to -50 °C',
    ]);
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
    expect(draft.cells.filter(cell => cell.rowIndex === 2).map(cell => cell.state)).toEqual(['verified', 'verified', 'verified']);
    expect(pendingFacts(set)).toEqual([]);
  });

  it('keeps every reading, id and status: the join only moves positions to one row', async () => {
    const reviewed = await review();
    const table = reviewed.tables[0];
    const raw = factSetFromReviews([reviewed]);
    const ids = table.report.values.filter(item => item.candidates.length).map(item => item.id).sort();
    expect(Object.keys(readings(raw)).sort()).toEqual(ids);
    for (const item of table.report.values.filter(entry => entry.candidates.length)) {
      expect(readings(raw)[item.id]).toEqual(item.candidates.map(candidate => `${candidate.value} ${item.unit} ${candidate.status}`));
    }
  });
});

describe('joinConditionSplitRows: only when nothing can be lost', () => {
  const MODELS = ['A', 'B'];
  const row = (id: string, condition: string, label = 'Cooling Time', unit = 'min'): DraftRow =>
    ({ ref: `s/${id}`, sectionId: 's', sectionTitle: 'Specs', rowId: id, key: id, label, unit, condition });
  const verified = (id: string, model: number, text: string): DraftPosition => ({ id: `s/${id}/${model}`, kind: 'value', rowRef: `s/${id}`,
    modelIndex: model, status: 'VERIFIED_TEXT', selected: 0,
    candidates: [{ value: text, unit: 'min', status: 'VERIFIED_TEXT', source: { sourceId: 'f', page: 1, quote: text } }] });
  const absent = (id: string, model: number): DraftPosition =>
    ({ id: `s/${id}/${model}`, kind: 'value', rowRef: `s/${id}`, modelIndex: model, status: 'MISSING', candidates: [] });
  const set = (rows: readonly DraftRow[], positions: readonly DraftPosition[]): DraftFactSet =>
    ({ version: 1, title: 'T', models: MODELS, rows, positions, sourceNames: { f: 'f.pdf' }, choices: {} });
  const split = () => set([row('c1', 'x'), row('c2', 'y')],
    [verified('c1', 0, '11'), absent('c1', 1), absent('c2', 0), verified('c2', 1, '16')]);

  it('joins disjoint rows and drops only the plain absences', () => {
    const joined = joinConditionSplitRows(split());
    expect(joined.rows).toEqual([{ ...row('c1', ''), modelConditions: ['x', 'y'] }]);
    expect(joined.positions.map(item => [item.id, item.rowRef, item.status])).toEqual([
      ['s/c1/0', 's/c1', 'VERIFIED_TEXT'], ['s/c2/1', 's/c1', 'VERIFIED_TEXT']]);
    expect(joinConditionSplitRows(joined)).toEqual(joined);
  });

  it('does not join when a model has readings in two rows, labels or units differ, or a condition is to choose', () => {
    const twice = set([row('c1', 'x'), row('c2', 'y')], [verified('c1', 0, '11'), verified('c1', 1, '12'), verified('c2', 1, '16'), absent('c2', 0)]);
    expect(joinConditionSplitRows(twice)).toBe(twice);
    const unit = set([row('c1', 'x'), row('c2', 'y', 'Cooling Time', 's')], split().positions);
    expect(joinConditionSplitRows(unit)).toBe(unit);
    const label = set([row('c1', 'x'), row('c2', 'y', 'Heating Time')], split().positions);
    expect(joinConditionSplitRows(label)).toBe(label);
    const sameCondition = set([row('c1', 'x'), row('c2', 'x')], split().positions);
    expect(joinConditionSplitRows(sameCondition)).toBe(sameCondition);
    const conditionToChoose = set(split().rows, [...split().positions, { id: 's/c2/condicao', kind: 'condition', rowRef: 's/c2',
      modelIndex: -1, status: 'CONFLICT', candidates: [] }]);
    expect(joinConditionSplitRows(conditionToChoose)).toBe(conditionToChoose);
    const emptyRow = set([row('c1', 'x'), row('c2', 'y')], [verified('c1', 0, '11'), verified('c1', 1, '16'), absent('c2', 0), absent('c2', 1)]);
    expect(joinConditionSplitRows(emptyRow)).toBe(emptyRow);
  });

  it('keeps a pending reading pending, with its id, and choices still apply after the join', () => {
    const conflict: DraftPosition = { id: 's/c2/1', kind: 'value', rowRef: 's/c2', modelIndex: 1, status: 'CONFLICT', candidates: [
      { value: '16', unit: 'min', status: 'VERIFIED_TEXT', source: { sourceId: 'f', page: 1, quote: '16 min' } },
      { value: '17', unit: 'min', status: 'VERIFIED_TEXT', source: { sourceId: 'f', page: 2, quote: '17 min' } }] };
    const joined = joinConditionSplitRows(set([row('c1', 'x'), row('c2', 'y')], [verified('c1', 0, '11'), absent('c1', 1), absent('c2', 0), conflict]));
    expect(pendingFacts(joined).map(item => [item.id, item.label, item.model, item.status])).toEqual([['s/c2/1', 'Cooling Time', 'B', 'CONFLICT']]);
    const chosen = recordChoice(joined, 's/c2/1', 1);
    const { document, draft } = compileDraftDocument(chosen, { transactionId: 'tx' });
    expect(matrix(tables(document)[0])[1]).toEqual(['Cooling Time', '11 min', '17 min']);
    expect(tables(document)[0].annotations.map(note => richPlain(note.text))).toEqual(['Cooling Time (A): x', 'Cooling Time (B): y']);
    expect(draftIntegrityProblems(chosen, draft)).toEqual([]);
  });

  it('a second file that disagrees on one model makes a conflict only in the row that holds that model, then joins', () => {
    const keyed = split();
    const rows = keyed.rows.map(item => ({ ...item, key: 'cooling' }));
    const reading = (sourceId: string, text: string): SourceFactValue => ({ sourceId, model: 'A', key: 'cooling', label: 'Cooling Time',
      value: text, unit: 'min', condition: 'x', page: 1, quote: `${text} min`, status: 'VERIFIED_TEXT' });
    const diverged = withSourceDivergences({ ...keyed, rows }, [{ model: 'A', key: 'cooling', field: 'value',
      readings: [reading('f', '11'), reading('g', '12')] }], { g: 'g.pdf' });
    expect(diverged.positions.filter(item => item.status === 'CONFLICT').map(item => item.id)).toEqual(['s/c1/0']);
    const joined = joinConditionSplitRows(diverged);
    expect(joined.rows).toHaveLength(1);
    expect(pendingFacts(joined).map(item => [item.id, item.status])).toEqual([['s/c1/0', 'CONFLICT']]);
  });

  it('names several models in one note when they share a condition', () => {
    const three = { ...set([row('c1', 'x'), row('c2', 'y')], []), models: ['A', 'B', 'C'] };
    const joined = joinConditionSplitRows({ ...three, positions: [verified('c1', 0, '11'), verified('c1', 1, '11'), absent('c1', 2),
      absent('c2', 0), absent('c2', 1), verified('c2', 2, '25')] });
    const { document } = compileDraftDocument(joined, { transactionId: 'tx' });
    expect(matrix(tables(document)[0])[1]).toEqual(['Cooling Time', '11 min', '11 min', '25 min']);
    expect(tables(document)[0].annotations.map(note => richPlain(note.text))).toEqual(['Cooling Time (A, B): x', 'Cooling Time (C): y']);
  });
});
