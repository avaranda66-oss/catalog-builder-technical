// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { CatalogDocumentSchema, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';
import {
  DRAFT_PAGE_REF_PREFIX, LABEL_HEADER, NOT_APPLICABLE_TEXT, applyCompiledDraft, choosableCandidates, compileDraft, compileDraftDocument,
  conditionPositionId, draftIntegrityProblems, factSetFromReport, openPendingCount, pendingFacts, recordChoice,
  type CompiledDraft, type DraftFactSet, type DraftPosition,
} from '@/vnext/ai-catalog/draft-compiler';
import type { FactVerificationReport } from '@/vnext/ai-catalog/fact-verifier';
import { CONTINUATION_LABEL } from '@/vnext/editor/table-split-authoring';
import { draftPreview } from '@/vnext/ai-catalog/spec-table/draft-preview';
import { TA, folderReport, noCandidate, twoFiles, withCoolingRow } from './draft-compiler-fixture';
import { cellText, richPlain } from '../editor/table-split-fixtures';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

const tables = (document: CatalogDocument) => document.pages.flatMap(page =>
  page.objects.filter((object): object is TableObject => object.type === 'table').map(object => ({ page, object })));
const matrix = (table: TableModel) => table.rows.map(row => table.columns.map((_, column) => cellText(table, row.id, column)));
describe('compileDraft: T1 "Comparativo de modelos" from the verified TA folder', () => {
  it('writes only verified values, units inline, conditions as notes, in one transaction', async () => {
    const { report } = await folderReport();
    const set = factSetFromReport(report, { title: 'Especificações técnicas' });
    const { document, draft, applied } = compileDraftDocument(set, { transactionId: 'tx-ta' });

    expect(CatalogDocumentSchema.safeParse(document).success).toBe(true);
    expect(draft).toMatchObject({ layout: 'T1', presetId: 'comparison', parts: 1, transactionId: 'tx-ta' });
    const [{ object }] = tables(document);
    expect(richPlain(object.table.title)).toBe('Especificações técnicas');
    expect(object.table.rows.map(row => row.role)).toEqual(['header', 'body', 'body', 'body', 'body']);
    expect(matrix(object.table)).toEqual([
      [LABEL_HEADER, ...TA],
      ['Operating Range', '-25 °C to +155 °C', '-35 °C to +155 °C', '-50 °C to +155 °C'],
      // VISUAL_ONLY on the page (the unit is not printed next to the value): left for the person.
      ['Resolution', '', '', ''],
      ['Electric Power', '200 W', '300 W', '400 W'],
      ['Weight', '10.5 kg', '10.5 kg', '12.5 kg'],
    ]);
    expect(object.table.annotations.map(note => [note.kind, richPlain(note.text)])).toEqual([
      ['note', 'Operating Range: ambient temperature: 23 °C']]);
    // The look of the panel preset (slice 2): highlighted, fixed-width first column.
    const label = object.table.cells.find(item => item.rowId === object.table.rows[1].id && item.columnId === object.table.columns[0].id)!;
    expect(label.style?.fontWeight).toBe(700);
    expect(object.table.columns[0].width.mode).toBe('fixed');
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
    // Every value position has a cell that points to its fact id, and the cell can be selected after insertion.
    expect(applied.cells.size).toBe(12);
    const range = applied.cells.get('specs/operating-range/0')!;
    const cell = object.table.cells.find(item => item.id === range.cellId)!;
    expect(cell.content.type === 'richText' && richPlain(cell.content.value)).toBe('-25 °C to +155 °C');
    expect(applied.cells.get('specs/resolution/1')).toMatchObject({ state: 'pending', objectId: object.id });
    expect(pendingFacts(set).map(item => [item.id, item.status])).toEqual([
      ['specs/resolution/0', 'VISUAL_ONLY'], ['specs/resolution/1', 'VISUAL_ONLY'], ['specs/resolution/2', 'VISUAL_ONLY']]);
    expect(applied.message).toBe('Tabela inserida na página 1. 3 valores ficaram para conferir: veja as Pendências. Use Desfazer se precisar.');
  });

  it('never prints a number that is not in a verified fact: a misread value stays empty and pending', async () => {
    const { report } = await folderReport({ weight: ['10.5', '10.5', '13.5'] });
    const set = factSetFromReport(report);
    const { document, draft } = compileDraftDocument(set);
    const [{ object }] = tables(document);
    expect(matrix(object.table)[4]).toEqual(['Weight', '10.5 kg', '10.5 kg', '']);
    const pending = pendingFacts(set).find(item => item.id === 'specs/weight/2')!;
    expect(pending).toMatchObject({ status: 'UNVERIFIED', resolved: false, model: 'TA-50N', label: 'Weight' });
    expect(pending.candidates[0]).toMatchObject({ value: '13.5', where: 'presys-ta-folder.pdf · página 1', choosable: false });
    const verifiedNumbers = new Set(report.values.flatMap(value => value.status === 'VERIFIED_TEXT'
      ? value.candidates.flatMap(item => item.value.match(/\d+(?:[.,]\d+)?/gu) ?? []) : []));
    const printed = object.table.rows.slice(1).flatMap(row => object.table.columns.slice(1)
      .flatMap((_, column) => cellText(object.table, row.id, column + 1).match(/\d+(?:[.,]\d+)?/gu) ?? []));
    expect(printed.every(number => verifiedNumbers.has(number))).toBe(true);
    expect(printed).not.toContain('13.5');
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
  });

  it('is deterministic and can mark the empty cells with the house placeholder', async () => {
    const { report } = await folderReport();
    const set = factSetFromReport(report);
    let serial = 0;
    const document = createCatalogDocument(() => `fixed-${++serial}`);
    const first = compileDraft(set, document), second = compileDraft(structuredClone(set), document);
    expect(second).toEqual(first);
    expect(first.transactionId).toMatch(/^rascunho-[0-9a-f]{8}$/u);
    const marked = compileDraftDocument(set, { pendingCellText: 'A COMPLETAR' });
    expect(matrix(tables(marked.document)[0].object.table)[2]).toEqual(['Resolution', 'A COMPLETAR', 'A COMPLETAR', 'A COMPLETAR']);
    expect(draftIntegrityProblems(set, marked.draft, 'A COMPLETAR')).toEqual([]);
  });

  it('a label printed with its colon ("Operating Range:", as in the real folder) is not doubled in the note', async () => {
    const { report } = await folderReport();
    const set = factSetFromReport(report);
    const colon = { ...set, rows: set.rows.map(row => ({ ...row, label: `${row.label}:` })) };
    const [{ object }] = tables(compileDraftDocument(colon).document);
    expect(object.table.annotations.map(note => richPlain(note.text))).toEqual(['Operating Range: ambient temperature: 23 °C']);
    expect(matrix(object.table)[1][0]).toBe('Operating Range:');
  });
});

describe('J2-lite model-specific rows: "—" where the extraction has no candidate at all', () => {
  const only25 = (position: DraftPosition) => position.modelIndex === 0 ? position : noCandidate(position);
  const coolingRow = (document: CatalogDocument) => matrix(tables(document)[0].object.table)[5];
  const coolingCells = (draft: CompiledDraft) => draft.cells.filter(cell => cell.factId.startsWith('specs/cooling/'));
  const reading = (value: string, status: 'UNVERIFIED' | 'VERIFIED_TEXT') => ({ value, unit: 'kg', status,
    source: { sourceId: 'ta-folder', page: 1, quote: `Cooling ${value}` } });

  it('shows "—" for the models with no candidate when another model has a verified value, and lists no pending item for them', async () => {
    const set = await withCoolingRow(only25);
    const { document, draft } = compileDraftDocument(set);
    expect(coolingRow(document)).toEqual(['Cooling Time', '10.5 kg', NOT_APPLICABLE_TEXT, NOT_APPLICABLE_TEXT]);
    expect(NOT_APPLICABLE_TEXT).toBe('—');
    expect(pendingFacts(set).map(item => item.id)).toEqual(['specs/resolution/0', 'specs/resolution/1', 'specs/resolution/2']);
    expect(openPendingCount(draft.pending)).toBe(3);
    expect(coolingCells(draft).map(cell => [cell.state, cell.text]))
      .toEqual([['verified', '10.5 kg'], ['notApplicable', '—'], ['notApplicable', '—']]);
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
    expect(draftPreview(draft)).toMatchObject({ filled: 10, blank: 3 });
    // The empty-cell convention for real pending cells is unchanged; only the "—" is literal text.
    const marked = compileDraftDocument(set, { pendingCellText: 'A COMPLETAR' });
    expect(coolingRow(marked.document)).toEqual(['Cooling Time', '10.5 kg', '—', '—']);
    expect(matrix(tables(marked.document)[0].object.table)[2]).toEqual(['Resolution', 'A COMPLETAR', 'A COMPLETAR', 'A COMPLETAR']);
    expect(draftIntegrityProblems(set, marked.draft, 'A COMPLETAR')).toEqual([]);
    // A set that no longer matches the compiled "—" (the position now has a candidate) is caught by the integrity check.
    const altered = { ...set, positions: set.positions.map(position =>
      position.id === 'specs/cooling/1' ? { ...position, status: 'UNVERIFIED' as const, candidates: [reading('99', 'UNVERIFIED')] } : position) };
    expect(draftIntegrityProblems(altered, draft)).toHaveLength(1);
  });

  it('keeps a cell with any unverified, visual-only or conflicting candidate empty and pending, even beside a verified model', async () => {
    const set = await withCoolingRow(position => {
      if (position.modelIndex === 0) return position;
      if (position.modelIndex === 1) return { ...position, status: 'UNVERIFIED', candidates: [reading('99', 'UNVERIFIED')], selected: undefined };
      return { ...position, status: 'CONFLICT', candidates: [reading('8', 'VERIFIED_TEXT'), reading('9', 'VERIFIED_TEXT')], selected: undefined };
    });
    const { document, draft } = compileDraftDocument(set);
    expect(coolingRow(document)).toEqual(['Cooling Time', '10.5 kg', '', '']);
    expect(pendingFacts(set).filter(item => item.id.startsWith('specs/cooling/')).map(item => [item.id, item.status, item.resolved]))
      .toEqual([['specs/cooling/1', 'UNVERIFIED', false], ['specs/cooling/2', 'CONFLICT', false]]);
    expect(coolingCells(draft).map(cell => cell.state)).toEqual(['verified', 'pending', 'pending']);
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
    // A model with NO candidate in that same row is still "—"; the model with a candidate is not.
    const mixed = await withCoolingRow(position => position.modelIndex === 2 ? noCandidate(position)
      : position.modelIndex === 1 ? { ...position, status: 'UNVERIFIED', candidates: [reading('99', 'UNVERIFIED')], selected: undefined } : position);
    expect(coolingRow(compileDraftDocument(mixed).document)).toEqual(['Cooling Time', '10.5 kg', '', '—']);
    expect(pendingFacts(mixed).filter(item => item.id.startsWith('specs/cooling/')).map(item => item.id)).toEqual(['specs/cooling/1']);
  });

  it('a row where no model has a verified value stays empty and pending, as before', async () => {
    const none = await withCoolingRow(noCandidate);
    const { document, draft } = compileDraftDocument(none);
    expect(coolingRow(document)).toEqual(['Cooling Time', '', '', '']);
    expect(pendingFacts(none).filter(item => item.id.startsWith('specs/cooling/')).map(item => [item.id, item.status]))
      .toEqual([['specs/cooling/0', 'MISSING'], ['specs/cooling/1', 'MISSING'], ['specs/cooling/2', 'MISSING']]);
    expect(coolingCells(draft).map(cell => cell.state)).toEqual(['pending', 'pending', 'pending']);
    expect(draftIntegrityProblems(none, draft)).toEqual([]);
    // Nothing verified in the row, only an unverified reading for one model: the other models stay pending too.
    const unverified = await withCoolingRow(position => position.modelIndex === 0
      ? { ...position, status: 'UNVERIFIED', candidates: [{ ...position.candidates[0], status: 'UNVERIFIED' }], selected: undefined } : noCandidate(position));
    expect(coolingRow(compileDraftDocument(unverified).document)).toEqual(['Cooling Time', '', '', '']);
    expect(pendingFacts(unverified).filter(item => item.id.startsWith('specs/cooling/'))).toHaveLength(3);
  });
});

describe('T3 "Especificações": one product, label and value', () => {
  it('uses two columns without a header row', async () => {
    const { report } = await folderReport();
    const single: FactVerificationReport = {
      ...report,
      proposal: { ...report.proposal, models: ['TA-25N'], sections: report.proposal.sections.map(section => ({
        ...section, rows: section.rows.map(row => ({ ...row, values: [row.values[0]] })) })) },
      values: report.values.filter(value => value.modelIndex === 0),
    };
    const set = factSetFromReport(single, { title: 'TA-25N' });
    const { document, draft } = compileDraftDocument(set);
    expect(draft).toMatchObject({ layout: 'T3', presetId: 'technical-specification' });
    const [{ object }] = tables(document);
    expect(object.table.rows.every(row => row.role === 'body')).toBe(true);
    expect(matrix(object.table)).toEqual([
      ['Operating Range', '-25 °C to +155 °C'], ['Resolution', ''], ['Electric Power', '200 W'], ['Weight', '10.5 kg']]);
    expect(() => compileDraft(factSetFromReport(report), document, { layout: 'T3' })).toThrow('DRAFT_LAYOUT_ONE_PRODUCT');
  });
});

describe('FR-68 conflicts between files: TA-25N 140 x 155 °C', () => {
  it('turns the divergence into a choice; nothing is picked in silence', async () => {
    const { set, divergences } = await twoFiles();
    expect(divergences.map(item => [item.model, item.key, item.field])).toEqual(expect.arrayContaining([
      ['TA-25N', 'operating-range', 'value'], ['TA-25N', 'operating-range', 'condition']]));
    const range = set.positions.find(item => item.id === 'specs/faixa-de-operacao/0')!;
    expect(range.status).toBe('CONFLICT');
    expect(range.candidates.map(item => [item.value, item.source.sourceId, item.status])).toEqual([
      ['-25 a 140', 'ta-manual-pt', 'VERIFIED_TEXT'], ['-25 °C to +155 °C', 'ta-folder', 'VERIFIED_TEXT']]);
    // Same figures in both files: the power is not a conflict.
    expect(set.positions.find(item => item.id === 'specs/potencia-eletrica/0')!.status).toBe('VERIFIED_TEXT');

    const before = compileDraftDocument(set);
    const table = tables(before.document)[0].object.table;
    expect(matrix(table)[1]).toEqual(['Faixa de Operação (°C)', '', '', '']);
    // The condition differs too (23 °C x 20 °C): no note until the person chooses.
    expect(table.annotations).toEqual([]);
    const pending = pendingFacts(set);
    expect(openPendingCount(pending)).toBe(4);
    const item = pending.find(entry => entry.id === 'specs/faixa-de-operacao/0')!;
    expect(item.message).toBe('As fontes divergem: -25 a 140 °C na página 1 de manual-ta-pt.pdf; '
      + '-25 °C to +155 °C na página 1 de presys-ta-folder.pdf. Escolha o valor certo.');
    expect(item.candidates.map(entry => [entry.where, entry.choosable])).toEqual([
      ['manual-ta-pt.pdf · página 1', true], ['presys-ta-folder.pdf · página 1', true]]);
  });

  it('records the choice in the fact set before applying, and only between verified readings', async () => {
    const { set } = await twoFiles();
    let chosen: DraftFactSet = recordChoice(set, 'specs/faixa-de-operacao/0', 0);
    chosen = recordChoice(chosen, conditionPositionId('specs/faixa-de-operacao'), 0);
    chosen = recordChoice(chosen, 'specs/faixa-de-operacao/1', 'missing');
    expect(chosen.choices).toEqual({ 'specs/faixa-de-operacao/0': 0, 'specs/faixa-de-operacao/condicao': 0, 'specs/faixa-de-operacao/1': 'missing' });
    expect(set.choices).toEqual({});
    const { document, draft } = compileDraftDocument(chosen);
    const table = tables(document)[0].object.table;
    expect(matrix(table)[1]).toEqual(['Faixa de Operação (°C)', '-25 a 140 °C', '', '']);
    expect(table.annotations.map(note => richPlain(note.text))).toEqual(['Faixa de Operação (°C): Temperatura Ambiente: 20°C']);
    expect(draftIntegrityProblems(chosen, draft)).toEqual([]);
    expect(openPendingCount(pendingFacts(chosen))).toBe(2);

    expect(() => recordChoice(set, 'specs/potencia-eletrica/0', 0)).toThrow('DRAFT_CHOICE_INVALID');
    expect(() => recordChoice(set, 'specs/faixa-de-operacao/0', 5)).toThrow('DRAFT_CHOICE_INVALID');
    const visual: DraftPosition = { ...set.positions[0], status: 'CONFLICT', candidates: [
      { ...set.positions[0].candidates[0], status: 'VISUAL_ONLY' }, { ...set.positions[0].candidates[0], value: '-25 a 155', status: 'UNVERIFIED' }] };
    expect(choosableCandidates(visual)).toEqual([]);
    // A forged choice in the file is ignored: the cell stays empty.
    const forged = { ...set, positions: [visual, ...set.positions.slice(1)], choices: { [visual.id]: 0 } };
    expect(matrix(tables(compileDraftDocument(forged).document)[0].object.table)[1][1]).toBe('');
  });
});

describe('tall tables continue on the next pages (FR-35), all under one transactionId', () => {
  const tallSet = (rows: number, sections = 1): DraftFactSet => {
    const models = ['PCON-Y17', 'PCON-Y18'];
    const allRows = Array.from({ length: sections }, (_, section) => Array.from({ length: rows }, (_, index) => ({
      ref: `s${section}/r${index}`, sectionId: `s${section}`, sectionTitle: `Seção ${section + 1}`, rowId: `r${index}`, key: `r${index}`,
      label: `Faixa de pressão ${section + 1}.${index + 1}`, unit: 'bar', condition: index === 0 ? 'a 23 °C' : '',
    }))).flat();
    return {
      version: 1, title: 'Especificações PCON', models, rows: allRows, sourceNames: { folder: 'pcon-y17-folder.pdf' }, choices: {},
      positions: allRows.flatMap(row => models.map((_, model): DraftPosition => ({
        id: `${row.ref}/${model}`, kind: 'value', rowRef: row.ref, modelIndex: model, status: 'VERIFIED_TEXT', selected: 0,
        candidates: [{ value: `${model + 1}${row.rowId.slice(1)}`, unit: 'bar', status: 'VERIFIED_TEXT',
          source: { sourceId: 'folder', page: 11, quote: `${row.label} ${model + 1}${row.rowId.slice(1)} bar` } }],
      }))),
    };
  };

  it('repeats the header, titles the parts "(continuação)" and keeps the notes on the last part', () => {
    const set = tallSet(16, 6);
    const { document, draft, applied } = compileDraftDocument(set, { transactionId: 'tx-tall' });
    expect(draft.parts).toBeGreaterThan(1);
    expect(document.pages).toHaveLength(draft.parts);
    const parts = tables(document);
    expect(parts).toHaveLength(draft.parts);
    parts.forEach(({ page, object }, index) => {
      expect(object.table.rows[0].role).toBe('header');
      expect(matrix(object.table)[0]).toEqual([LABEL_HEADER, 'PCON-Y17', 'PCON-Y18']);
      expect(richPlain(object.table.title)).toBe(index === 0 ? 'Especificações PCON' : `Especificações PCON ${CONTINUATION_LABEL}`);
      expect(object.table.annotations.length > 0).toBe(index === parts.length - 1);
      expect(object.frame.yMm + object.frame.heightMm).toBeLessThanOrEqual(page.heightMm - (page.safeArea?.bottomMm ?? 20) + 1e-6);
    });
    // Every body row lands exactly once, in order, with its section rows.
    const bodies = parts.flatMap(({ object }) => object.table.rows.slice(1).map(row => cellText(object.table, row.id, 0)));
    expect(bodies.filter(text => text.startsWith('Faixa'))).toHaveLength(96);
    expect(bodies.filter(text => text.startsWith('Seção'))).toHaveLength(6);
    expect(applied.cells.size).toBe(192);
    expect(draftIntegrityProblems(set, draft)).toEqual([]);
    expect(draft.steps.filter(step => step.kind === 'page').map(step => step.pageRef))
      .toEqual(Array.from({ length: draft.parts - 1 }, (_, index) => `${DRAFT_PAGE_REF_PREFIX}${index + 2}`));
  });

  it('one Desfazer removes the table and every continuation page', () => {
    let serial = 0;
    const createId = () => `id-${++serial}`;
    const start = createCatalogDocument(createId, 'Catálogo');
    const session = createDocumentSession(start, { createId });
    const draft = compileDraft(tallSet(16, 4), start, { transactionId: 'tx-undo' });
    const outcome = applyCompiledDraft(session, draft);
    expect(outcome.ok).toBe(true);
    expect(session.getSnapshot().document.pages.length).toBe(1 + draft.parts);
    session.undo();
    expect(session.getSnapshot().document).toEqual(start);
  });

  it('refuses a draft prepared for another catalog, without changing anything', () => {
    let serial = 0;
    const createId = () => `id-${++serial}`;
    const start = createCatalogDocument(createId, 'Catálogo');
    const draft = compileDraft(tallSet(3), start);
    const other = createDocumentSession(createCatalogDocument(() => `x-${++serial}`), { createId });
    const before = other.getSnapshot().document;
    expect(applyCompiledDraft(other, draft)).toEqual({ ok: false,
      message: 'O catálogo mudou desde que a tabela foi preparada. Nada foi alterado. Prepare a tabela de novo.' });
    expect(other.getSnapshot().document).toBe(before);
  });
});
