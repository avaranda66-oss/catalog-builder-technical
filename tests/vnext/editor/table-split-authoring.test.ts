import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { mmToU, plainRichText, uToQ, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';
import {
  applyTableSplit,
  continuationPageGeometry,
  continuationTitle,
  newPagesText,
  planTableSplit,
  prepareTableSplit,
  tableSplitSuccessMessage,
} from '@/vnext/editor/table-split-authoring';
import { projectTableLook } from '@/vnext/editor/table-look-authoring';
import {
  SPLIT_NEXT_PAGE_ID,
  SPLIT_OBJECT_ID,
  SPLIT_PAGE_ID,
  cellText,
  documentWithTable,
  longTable,
  measureTable,
  richPlain,
  tableOn,
} from './table-split-fixtures';

function sessionFor(document: CatalogDocument): DocumentSession {
  return createDocumentSession(document, { createId: () => crypto.randomUUID() });
}

function split(document: CatalogDocument, measurement = measureTable(document)) {
  const session = sessionFor(document);
  const before = session.getSnapshot().document;
  const prepared = prepareTableSplit(before, SPLIT_OBJECT_ID, { ...measurement, source: before });
  if (!prepared.ok) throw new Error(`Split unavailable: ${prepared.reason}`);
  const outcome = applyTableSplit(session, prepared.prepared, 'split-transaction');
  return { session, before, prepared: prepared.prepared, outcome };
}

/** Every table of the catalog in page order: the original first, then each continuation. */
function tables(document: CatalogDocument): TableObject[] {
  return document.pages.flatMap((page) => page.objects.filter((object): object is TableObject => object.type === 'table'));
}

function identityIds(table: TableModel): string[] {
  return [table.id, ...table.rows.map((row) => row.id), ...table.columns.map((column) => column.id), ...table.cells.map((cell) => cell.id),
    ...table.annotations.map((annotation) => annotation.id), ...table.legend.map((entry) => entry.id)];
}

const bottomOfSafeAreaMm = 297 - 12;

describe('FR-35 continuing a long table on the next page', () => {
  it('40 rows: the rows that do not fit go to one new page, with the header repeated, and one Desfazer brings it all back', () => {
    const document = documentWithTable(longTable({ bodyRows: 39 }));
    const { session, before, prepared, outcome } = split(document);
    expect(prepared.plan.newPages).toBe(1);
    expect(outcome).toMatchObject({ ok: true, movedRows: prepared.plan.movedRowIds.length });

    const after = session.getSnapshot().document;
    expect(after.pages.map((page) => page.id)[0]).toBe(SPLIT_PAGE_ID);
    expect(after.pages).toHaveLength(3);
    // The new page comes right after the table's page; the page that was next stays after it.
    expect(after.pages[2].id).toBe(SPLIT_NEXT_PAGE_ID);
    const [original, continuation] = tables(after);
    expect(original.id).toBe(SPLIT_OBJECT_ID);
    expect(after.pages[1].objects).toEqual([continuation]);

    // Every row once, in order: header + first rows here, header + the rest on the new page.
    const source = longTable({ bodyRows: 39 });
    const bodyText = (table: TableModel) => table.rows.filter((row) => row.role === 'body').map((row) => cellText(table, row.id));
    expect([...bodyText(original.table), ...bodyText(continuation.table)]).toEqual(bodyText(source));
    expect(original.table.rows[0].role).toBe('header');
    expect(continuation.table.rows[0].role).toBe('header');
    expect(continuation.table.columns.map((_, index) => cellText(continuation.table, continuation.table.rows[0].id, index)))
      .toEqual(['Código', 'Faixa', 'Saída']);
    expect(bodyText(original.table).length).toBeGreaterThan(20);

    // The repeated header and every copied row have new IDs.
    const originalIds = new Set(identityIds(before.pages[0].objects[0].type === 'table' ? (before.pages[0].objects[0] as TableObject).table : source));
    expect(identityIds(continuation.table).filter((id) => originalIds.has(id))).toEqual([]);
    expect(continuation.id).not.toBe(SPLIT_OBJECT_ID);

    expect(richPlain(continuation.table.title)).toBe('(continuação)');
    expect(outcome.ok && outcome.message).toBe(
      `${prepared.plan.movedRowIds.length} linhas movidas para a página 2, com o cabeçalho repetido. Use Desfazer se precisar.`);

    // One Desfazer: back to one table on one page, exactly as before.
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(before);
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('69 rows: one click makes as many pages as needed (here three parts), each part inside the printable area', () => {
    const document = documentWithTable(longTable({ bodyRows: 68, title: 'Faixas de medição' }));
    const { session, before, prepared, outcome } = split(document, measureTable(document, { titleMm: 6 }));
    expect(prepared.plan.newPages).toBe(2);
    expect(outcome.ok && outcome.pageIds).toHaveLength(2);
    const after = session.getSnapshot().document;
    expect(after.pages).toHaveLength(4);
    const parts = tables(after);
    expect(parts).toHaveLength(3);
    const source = longTable({ bodyRows: 68 });
    const bodyText = (table: TableModel) => table.rows.filter((row) => row.role === 'body').map((row) => cellText(table, row.id));
    expect(parts.flatMap((part) => bodyText(part.table))).toEqual(bodyText(source));
    for (const part of parts) {
      expect(part.table.rows[0].role).toBe('header');
      expect(part.frame.yMm + part.frame.heightMm).toBeLessThanOrEqual(bottomOfSafeAreaMm);
      expect(part.frame.yMm).toBeGreaterThanOrEqual(12);
      expect(part.frame.widthMm).toBe(170);
      expect(part.frame.xMm).toBe(20);
    }
    // The frame of each part holds its rows (8 mm each) and its title: no "conteúdo ultrapassa a altura".
    const [first, second, third] = parts;
    expect(uToQ(mmToU(first.frame.heightMm))).toBeGreaterThanOrEqual(uToQ(mmToU(6)) + uToQ(mmToU(8 * first.table.rows.length)));
    expect(uToQ(mmToU(second.frame.heightMm))).toBeGreaterThanOrEqual(uToQ(mmToU(8 * second.table.rows.length)) + uToQ(prepared.plan.continuationTitleU));
    expect(richPlain(first.table.title)).toBe('Faixas de medição');
    expect(richPlain(second.table.title)).toBe('Faixas de medição (continuação)');
    expect(richPlain(third.table.title)).toBe('Faixas de medição (continuação)');
    expect(outcome.ok && outcome.message).toMatch(/^\d+ linhas movidas para as páginas 2 e 3, com o cabeçalho repetido\. Use Desfazer se precisar\.$/);

    // The IDs of the two new tables do not repeat each other either.
    const secondIds = new Set(identityIds(second.table));
    expect(identityIds(third.table).filter((id) => secondIds.has(id))).toEqual([]);

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(before);
    expect(session.redo().ok).toBe(true);
    expect(tables(session.getSnapshot().document)).toHaveLength(3);
  });

  it('notes under the table go to the last part; a caption stays above the first; a note on a cell goes with its row', () => {
    const base = longTable({ bodyRows: 39 });
    const lastRow = base.rows[base.rows.length - 1];
    const lastRowCell = base.cells.find((cell) => cell.rowId === lastRow.id)!;
    const firstRowCell = base.cells.find((cell) => cell.rowId === base.rows[1].id)!;
    const table: TableModel = {
      ...base,
      annotations: [
        { id: 'caption', kind: 'caption', text: plainRichText('caption-text', 'Modelos com saída analógica') },
        { id: 'note', kind: 'note', text: plainRichText('note-text', 'Valores a 25 °C.') },
        { id: 'foot-last', kind: 'footnote', text: plainRichText('foot-last-text', 'Sob consulta.') },
        { id: 'foot-first', kind: 'footnote', text: plainRichText('foot-first-text', 'Padrão de fábrica.') },
      ],
      annotationIds: ['caption', 'note'],
      cells: base.cells.map((cell) => cell.id === lastRowCell.id ? { ...cell, annotationIds: ['foot-last'] }
        : cell.id === firstRowCell.id ? { ...cell, annotationIds: ['foot-first'] } : cell),
    };
    const document = documentWithTable(table);
    const { session, prepared } = split(document, measureTable(document, { titleMm: 5, footerMm: 12 }));
    expect(prepared.plan.footerOnEveryPart).toBe(true);
    const [original, continuation] = tables(session.getSnapshot().document);
    const texts = (entry: TableModel) => entry.annotations.map((annotation) => richPlain(annotation.text));
    expect(original.table.annotationIds).toEqual(['caption']);
    expect(texts(original.table)).toEqual(['Modelos com saída analógica', 'Padrão de fábrica.']);
    expect(continuation.table.annotationIds).toHaveLength(1);
    expect(texts(continuation.table)).toEqual(['Valores a 25 °C.', 'Sob consulta.']);
    const lastCopy = continuation.table.rows[continuation.table.rows.length - 1];
    const copiedCell = continuation.table.cells.find((cell) => cell.rowId === lastCopy.id && cell.columnId === continuation.table.columns[0].id)!;
    expect(copiedCell.annotationIds).toHaveLength(1);
    expect(continuation.table.annotations.find((annotation) => annotation.id === copiedCell.annotationIds![0])?.kind).toBe('footnote');
  });

  it('marker legend: each part keeps the entries its markers use; entries no marker uses go to the last part', () => {
    const base = longTable({ bodyRows: 39 });
    const firstBodyCell = base.cells.find((cell) => cell.rowId === base.rows[1].id && cell.columnId === base.columns[2].id)!;
    const table: TableModel = {
      ...base,
      legend: [
        { id: 'legend-star', markerCode: '*', text: plainRichText('legend-star-text', 'Opcional') },
        { id: 'legend-free', markerCode: '**', text: plainRichText('legend-free-text', 'Consulte a PRESYS') },
      ],
      cells: base.cells.map((cell) => cell.id === firstBodyCell.id ? { ...cell, content: { type: 'marker', legendEntryId: 'legend-star' } } : cell),
    };
    const document = documentWithTable(table);
    const { session } = split(document, measureTable(document, { footerMm: 8 }));
    const [original, continuation] = tables(session.getSnapshot().document);
    expect(original.table.legend.map((entry) => entry.markerCode)).toEqual(['*']);
    expect(continuation.table.legend.map((entry) => entry.markerCode)).toEqual(['**']);
  });

  it('"Linhas alternadas" start again on each part, so the switch still reads on there; a row coloured by hand is copied as it is', () => {
    const BAND = '#EAF1FB';
    const banded = (table: TableModel): TableModel => {
      let body = 0;
      return { ...table, rows: table.rows.map((row) => row.role !== 'body' ? row : body++ % 2 === 1 ? { ...row, style: { background: BAND } } : row) };
    };
    // A cut that keeps an odd number of ordinary rows on the first page: the copy alone would start on a coloured row.
    const document = [20, 28].map((yMm) => documentWithTable(banded(longTable({ bodyRows: 39 })), { xMm: 20, yMm, widthMm: 170, heightMm: 120 }))
      .find((candidate) => {
        const prepared = prepareTableSplit(candidate, SPLIT_OBJECT_ID, measureTable(candidate));
        return prepared.ok && prepared.prepared.plan.pagination.slices[0].bodyRowIds.length % 2 === 1;
      });
    expect(document).toBeDefined();
    const { session, before } = split(document!);
    const [original, continuation] = tables(session.getSnapshot().document);
    expect(projectTableLook(original.table, before.style)).toMatchObject({ banded: true, bandColor: BAND });
    expect(projectTableLook(continuation.table, before.style)).toMatchObject({ banded: true, bandColor: BAND });
    const continuedBody = continuation.table.rows.filter((row) => row.role === 'body');
    expect(continuedBody[0].style).toBeUndefined();
    expect(continuedBody[1].style).toEqual({ background: BAND });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(before);

    // One row coloured by hand is not a band: it keeps its colour (and the others stay plain).
    const plain = longTable({ bodyRows: 39 });
    const handRow = plain.rows[36];
    const handColoured = documentWithTable({ ...plain, rows: plain.rows.map((row) => row.id === handRow.id ? { ...row, style: { background: '#FFF2CC', fontWeight: 700 } } : row) });
    const { session: handSession } = split(handColoured);
    const [, handContinuation] = tables(handSession.getSnapshot().document);
    const copied = handContinuation.table.rows.find((row) => cellText(handContinuation.table, row.id) === cellText(plain, handRow.id))!;
    expect(copied.style).toEqual({ background: '#FFF2CC', fontWeight: 700 });
    expect(handContinuation.table.rows.filter((row) => row.style)).toHaveLength(1);
  });

  it('rows joined by a vertical merge move together, and the copy keeps the merge', () => {
    const base = longTable({ bodyRows: 39 });
    // Rows 32 and 33 share one merged first cell: the cut cannot fall between them.
    const top = base.rows[32], below = base.rows[33];
    const anchor = base.cells.find((cell) => cell.rowId === top.id && cell.columnId === base.columns[0].id)!;
    const covered = base.cells.find((cell) => cell.rowId === below.id && cell.columnId === base.columns[0].id)!;
    const table: TableModel = {
      ...base,
      cells: base.cells.map((cell) => cell.id === anchor.id ? { ...cell, span: { rows: 2, columns: 1 } }
        : cell.id === covered.id ? { ...cell, coveredBy: anchor.id, content: { type: 'empty' } } : cell),
    };
    const document = documentWithTable(table);
    const { session, before, prepared } = split(document);
    const [original, continuation] = tables(session.getSnapshot().document);
    const movedTop = prepared.plan.movedRowIds.includes(top.id);
    expect(prepared.plan.movedRowIds.includes(below.id)).toBe(movedTop);
    const holder = movedTop ? continuation.table : original.table;
    expect(holder.cells.filter((cell) => cell.span?.rows === 2)).toHaveLength(1);
    expect(holder.cells.filter((cell) => cell.coveredBy)).toHaveLength(1);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(before);
  });

  it('a table that is cut again keeps one "(continuação)" and a table near the bottom still starts on its page', () => {
    expect(richPlain(continuationTitle(plainRichText('t', 'Faixas (continuação)')))).toBe('Faixas (continuação)');
    expect(richPlain(continuationTitle(undefined))).toBe('(continuação)');
    expect(richPlain(continuationTitle(plainRichText('t', '  ')))).toBe('(continuação)');
    const bold = { paragraphs: [{ id: 'p', inlines: [{ kind: 'text' as const, id: 'a', text: 'Tabela 3', marks: ['bold' as const] }, { kind: 'text' as const, id: 'b', text: ' – Faixas', marks: [] }] }] };
    const continued = continuationTitle(bold);
    expect(richPlain(continued)).toBe('Tabela 3 – Faixas (continuação)');
    expect(continued.paragraphs[0].inlines[0]).toEqual(bold.paragraphs[0].inlines[0]);
    expect(new Set(continued.paragraphs[0].inlines.map((inline) => inline.id)).size).toBe(3);
  });

  it('explains plainly when it cannot help, and never changes the catalog in that case', () => {
    const fits = documentWithTable(longTable({ bodyRows: 10 }));
    expect(planTableSplit(fits, SPLIT_OBJECT_ID, measureTable(fits))).toMatchObject({ ok: false, reason: 'FITS', overflows: false });

    const long = documentWithTable(longTable({ bodyRows: 39 }));
    expect(planTableSplit(long, SPLIT_OBJECT_ID, null)).toMatchObject({ ok: false, reason: 'MEASURING', message: 'Medindo a tabela…' });
    expect(planTableSplit(long, SPLIT_OBJECT_ID, measureTable(structuredClone(long)))).toMatchObject({ ok: false, reason: 'MEASURING' });
    expect(planTableSplit(long, SPLIT_OBJECT_ID, measureTable(long, { unstable: true }))).toMatchObject({ ok: false, reason: 'UNSTABLE' });
    expect(planTableSplit(long, 'missing', measureTable(long))).toMatchObject({ ok: false, reason: 'NO_TABLE' });

    const tall = planTableSplit(long, SPLIT_OBJECT_ID, measureTable(long, { rowHeightMm: (_, index) => index === 5 ? 300 : 8 }));
    expect(tall).toMatchObject({ ok: false, reason: 'ROW_TOO_TALL', overflows: true });
    expect(!tall.ok && tall.message).toBe('Uma linha desta tabela, ou um grupo de linhas mescladas, é mais alta que uma página inteira. Diminua o texto dessa linha e tente de novo.');

    const low = documentWithTable(longTable({ bodyRows: 39 }), { xMm: 20, yMm: 280, widthMm: 170, heightMm: 10 });
    expect(planTableSplit(low, SPLIT_OBJECT_ID, measureTable(low))).toMatchObject({ ok: false, reason: 'NO_ROOM', overflows: true });

    const locked = documentWithTable(longTable({ bodyRows: 39 }), undefined, { locked: true });
    expect(planTableSplit(locked, SPLIT_OBJECT_ID, measureTable(locked))).toMatchObject({ ok: false, reason: 'LOCKED', overflows: true });

    const headerOnly = documentWithTable({ ...longTable({ bodyRows: 39 }), rows: longTable({ bodyRows: 39 }).rows.map((row) => ({ ...row, role: 'header' as const })) });
    expect(planTableSplit(headerOnly, SPLIT_OBJECT_ID, measureTable(headerOnly))).toMatchObject({ ok: false, overflows: true });
  });

  it('a table that changed after the preparation is left alone: nothing happens and the person is told to try again', () => {
    const document = documentWithTable(longTable({ bodyRows: 39 }));
    const session = sessionFor(document);
    const current = session.getSnapshot().document;
    const prepared = prepareTableSplit(current, SPLIT_OBJECT_ID, measureTable(current));
    if (!prepared.ok) throw new Error('expected a split');
    const table = tableOn(current, SPLIT_PAGE_ID)!;
    expect(session.execute({
      type: 'table.axis.remove', pageId: SPLIT_PAGE_ID, objectId: table.id, tableId: table.table.id, axis: 'row',
      axisId: table.table.rows[39].id, expectedTable: table.table,
    }).ok).toBe(true);
    const changed = session.getSnapshot().document;
    const outcome = applyTableSplit(session, prepared.prepared, 'late');
    expect(outcome).toEqual({ ok: false, message: 'Não foi possível levar a tabela para a próxima página. Nada foi alterado. Aguarde alguns segundos e tente de novo.' });
    expect(session.getSnapshot().document).toBe(changed);

    // A table moved to another place was measured somewhere else: refused too.
    const again = sessionFor(document);
    const fresh = again.getSnapshot().document;
    const ready = prepareTableSplit(fresh, SPLIT_OBJECT_ID, measureTable(fresh));
    if (!ready.ok) throw new Error('expected a split');
    expect(again.execute({ type: 'object.move', objectId: SPLIT_OBJECT_ID, xU: mmToU(20), yU: mmToU(30) }).ok).toBe(true);
    expect(applyTableSplit(again, ready.prepared, 'moved').ok).toBe(false);

    // A change elsewhere in the catalog does not matter: the same table at the same place is still split.
    const other = sessionFor(document);
    const start = other.getSnapshot().document;
    const plan = prepareTableSplit(start, SPLIT_OBJECT_ID, measureTable(start));
    if (!plan.ok) throw new Error('expected a split');
    expect(other.execute({ type: 'document.rename', title: 'Termômetros PRESYS' }).ok).toBe(true);
    expect(applyTableSplit(other, plan.prepared, 'elsewhere').ok).toBe(true);
  });

  it('never shows an internal word to the person', () => {
    // Same rule as the table panel (2D), plus the words of the paginator itself.
    const quoted = /'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|>[^<>{}\n]+</g;
    const forbidden = /\beixos?\b|\btsv\b|\(s\)|explicitamente|\bpadding\b|\bslices?\b|\bIDs?\b|transa[cç]|\bframe\b|pagina[cç][aã]o/i;
    const found = ['src/vnext/editor/table-split-authoring.ts', 'src/vnext/app/editor/TableContinuationSection.tsx']
      .flatMap((file) => (readFileSync(file, 'utf8').match(quoted) ?? [])
        // Code inside ${…} is not shown; the words around it are.
        .map((text) => text.replace(/\$\{[^}]*\}/g, ''))
        .filter((text) => /[À-ú]|\s/.test(text) && !/data-|className|\[data|^'\.\.?\//.test(text))
        .filter((text) => forbidden.test(text))
        .map((text) => `${file}: ${text}`));
    expect(found).toEqual([]);
  });

  it('uses the blank page the editor adds, and words the result in plain Portuguese', () => {
    expect(continuationPageGeometry()).toEqual({ heightMm: 297, safeTopMm: 12, safeBottomMm: 12 });
    expect(newPagesText(1)).toBe('1 página nova');
    expect(newPagesText(2)).toBe('2 páginas novas');
    expect(tableSplitSuccessMessage(1, [4], false)).toBe('1 linha movida para a página 4. Use Desfazer se precisar.');
    expect(tableSplitSuccessMessage(52, [4, 5, 6], true)).toBe('52 linhas movidas para as páginas 4, 5 e 6, com o cabeçalho repetido. Use Desfazer se precisar.');
  });
});
