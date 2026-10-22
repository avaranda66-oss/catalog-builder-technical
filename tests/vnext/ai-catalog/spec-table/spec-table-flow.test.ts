// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import type { TableObject } from '@/vnext/domain';
import {
  applyCompiledDraft, factSetFromReviews, openPendingCount, pendingFacts, recordChoice,
} from '@/vnext/ai-catalog/draft-compiler';
import { reviewExtraction, type ExtractionReview } from '@/vnext/ai-catalog/extraction-review';
import { extractPdfText, type ExtractedPdf } from '@/vnext/ai-catalog/pdf-intake';
import { draftPreview } from '@/vnext/ai-catalog/spec-table/draft-preview';
import { guessSpecificationPages, pageRangeProblem } from '@/vnext/ai-catalog/spec-table/spec-table-gateway';
import { compileSpecTable } from '@/vnext/ai-catalog/spec-table/useSpecTableDraft';
import {
  FOLDER_FILE, FOLDER_SPEC_PAGE, MANUAL_FILE, MANUAL_SPEC_PAGE, TA, folderPdfBytes, folderSheet, manualPdfBytes, manualSheet,
} from '../../proof/father-journeys/fixtures/spec-table-facts.mjs';

beforeAll(() => vi.stubGlobal('crypto', webcrypto));
afterAll(() => vi.unstubAllGlobals());

const read = (name: string, bytes: Uint8Array) =>
  extractPdfText(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
function review(pdf: ExtractedPdf, sheet: unknown, sourceId: string, page: number): ExtractionReview {
  return reviewExtraction(sheet, { sourceId, fileName: pdf.fileName, sha256: pdf.sha256, pageCount: pdf.pageCount,
    firstPage: page, lastPage: page }, pdf);
}
async function both() {
  const folder = await read(FOLDER_FILE, folderPdfBytes());
  const manual = await read(MANUAL_FILE, manualPdfBytes());
  return {
    folder, manual,
    folderReview: review(folder, folderSheet(), 'arquivo-1', FOLDER_SPEC_PAGE),
    manualReview: review(manual, manualSheet(), 'arquivo-2', MANUAL_SPEC_PAGE),
  };
}

describe('J2-lite fixture: the real TA folder p. 9 and manual p. 5 facts, checked by the app', () => {
  it('suggests the specification page of each PDF from its own text', async () => {
    const { folder, manual } = await both();
    expect(folder.pageCount).toBe(10);
    expect(guessSpecificationPages(folder)).toEqual({ firstPage: 9, lastPage: 9, found: true });
    expect(guessSpecificationPages(manual)).toEqual({ firstPage: 5, lastPage: 5, found: true });
  });

  it('verifies the folder values against the PDF text; a value without its printed unit goes to a person', async () => {
    const { folderReview } = await both();
    const values = folderReview.tables.find(table => table.kind === 'models')!.report.values;
    const statusOf = (label: string) => values.filter(value => value.label === label).map(value => value.status);
    expect(statusOf('Operating Range')).toEqual(['VERIFIED_TEXT', 'VERIFIED_TEXT', 'VERIFIED_TEXT']);
    expect(statusOf('Resolution')).toEqual(['VISUAL_ONLY', 'VISUAL_ONLY', 'VISUAL_ONLY']);
    expect(statusOf('Electric Power')).toEqual(['VERIFIED_TEXT', 'VERIFIED_TEXT', 'VERIFIED_TEXT']);
    expect(statusOf('Weight')).toEqual(['VERIFIED_TEXT', 'VERIFIED_TEXT', 'VERIFIED_TEXT']);
  });

  it('two files: the divergent range and its condition wait for a choice; a choice fills only that cell', async () => {
    const { folderReview, manualReview } = await both();
    let set = factSetFromReviews([folderReview, manualReview]);
    expect(set.models).toEqual(TA);
    const pending = pendingFacts(set);
    expect(pending.filter(item => item.status === 'CONFLICT').map(item => item.id).sort()).toEqual([
      'specs/operating-range/0', 'specs/operating-range/1', 'specs/operating-range/2', 'specs/operating-range/condicao',
    ].map(id => id.replace('specs/', `${set.rows[0].sectionId}/`)).sort());
    expect(openPendingCount(pending)).toBe(7);

    const document = createCatalogDocument(() => crypto.randomUUID(), 'TA');
    const before = compileSpecTable(set, document, document.pages[0].id);
    if (!before.ok) throw new Error(before.message);
    const preview = draftPreview(before.draft);
    expect(preview).toMatchObject({ filled: 6, blank: 6 });
    expect(preview.parts[0].rows[0].cells.map(cell => cell.text)).toEqual(['Característica', ...TA]);
    expect(preview.parts[0].rows.find(row => row.cells[0].text === 'Weight')!.cells.map(cell => cell.text))
      .toEqual(['Weight', '10.5 kg', '10.5 kg', '12.5 kg']);

    const range = pending.find(item => item.id.endsWith('operating-range/0'))!;
    const folderReading = range.candidates.find(candidate => candidate.value === '-25 °C to +155 °C')!;
    expect(range.candidates.map(candidate => [candidate.value, candidate.choosable])).toEqual(expect.arrayContaining([
      ['-25 °C to +155 °C', true], ['-25 a 140', true]]));
    set = recordChoice(set, range.id, folderReading.index);
    const after = compileSpecTable(set, document, document.pages[0].id);
    if (!after.ok) throw new Error(after.message);
    const rangeRow = draftPreview(after.draft).parts[0].rows.find(row => row.cells[0].text === 'Operating Range')!;
    expect(rangeRow.cells.map(cell => [cell.text, cell.state])).toEqual([
      ['Operating Range', undefined], ['-25 °C to +155 °C', 'chosen'], ['', 'pending'], ['', 'pending']]);
    expect(draftPreview(after.draft)).toMatchObject({ filled: 7, blank: 5 });
  });

  it('applies on the empty open page in one transaction; one undo leaves the catalog as it was', async () => {
    const { folderReview, manualReview } = await both();
    const set = factSetFromReviews([folderReview, manualReview]);
    const session = createDocumentSession(createCatalogDocument(() => crypto.randomUUID(), 'TA'), { createId: () => crypto.randomUUID() });
    const original = session.getSnapshot().document;
    const compiled = compileSpecTable(set, original, original.pages[0].id);
    if (!compiled.ok) throw new Error(compiled.message);
    expect(compiled.draft.onPageId).toBe(original.pages[0].id);
    const outcome = applyCompiledDraft(session, compiled.draft);
    if (!outcome.ok) throw new Error(outcome.message);
    const tables = session.getSnapshot().document.pages.flatMap(page => page.objects.filter((object): object is TableObject => object.type === 'table'));
    expect(tables).toHaveLength(1);
    expect(outcome.applied.message).toBe('Tabela inserida na página 1. 7 valores ficaram para conferir: veja as Pendências. Use Desfazer se precisar.');
    session.undo();
    expect(session.getSnapshot().document).toEqual(original);
  });

  it('a range the person types is checked in plain Portuguese before anything is sent', () => {
    expect(pageRangeProblem(9, 10, 10)).toBeUndefined();
    expect(pageRangeProblem(0, 2, 10)).toBe('Escolha páginas entre 1 e 10.');
    expect(pageRangeProblem(9, 11, 10)).toBe('Escolha páginas entre 1 e 10.');
    expect(pageRangeProblem(5, 4, 10)).toBe('A primeira página precisa vir antes da última.');
    expect(pageRangeProblem(1, 13, 40)).toBe('Escolha no máximo 12 páginas de cada vez (só as de especificações).');
    expect(pageRangeProblem(Number.NaN, 2, 10)).toBe('Escolha páginas entre 1 e 10.');
  });

  it('without specification words, the guess is only a starting point', () => {
    const page = (number: number, text: string) => ({ number, text, textLength: text.length, needsVisualExtraction: false });
    expect(guessSpecificationPages({ pageCount: 3, pages: [page(1, 'Capa'), page(2, 'Sobre a empresa'), page(3, 'Contato')] }))
      .toEqual({ firstPage: 1, lastPage: 2, found: false });
    // Two neighbouring specification pages are read together.
    expect(guessSpecificationPages({ pageCount: 4, pages: [page(1, 'Capa'),
      page(2, 'Especificações Faixa 0 a 20 bar Exatidão 0,1 % Alimentação 24 V'), page(3, 'Peso 2 kg Dimensões 10 x 20 mm Potência 5 W'),
      page(4, 'Contato')] })).toEqual({ firstPage: 2, lastPage: 3, found: true });
  });
});
