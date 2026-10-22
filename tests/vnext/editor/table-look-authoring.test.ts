import { describe, expect, it } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import {
  applyNativeTableDesign,
  contrastRatio,
  materializeTablePreset,
  MIN_TABLE_TEXT_CONTRAST,
  TABLE_PRESETS,
  tablePresetAccents,
  tablePresetFirstColumnMm,
} from '@/vnext/application/table-preset-registry';
import { createNewTableModel, createSizedEmptyTable, createTableInsertSpec, createW2CDemoDocument, NEW_TABLE_PRESET_ID } from '@/vnext/app/editor-defaults';
import { completeNewTableLook, runTableSteps } from '@/vnext/app/editor/table-structure-actions';
import type { CatalogDocument, DocumentStyle, TableModel, TableObject } from '@/vnext/domain';
import { resolveCellStyle } from '@/vnext/domain/style-resolution';
import {
  planTableComposition,
  projectTableLook,
  tableLookSteps,
  type TableLookRequest,
} from '@/vnext/editor/table-look-authoring';

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function sessionWithTable(table: TableModel = createNewTableModel()): { session: DocumentSession; pageId: string; objectId: string } {
  const document = createW2CDemoDocument(ids('doc'));
  const session = createDocumentSession(document, { createId: ids('generated') });
  const page = document.pages[0];
  const result = session.execute({ type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, table, document.style) });
  if (!result.ok) throw new Error('Could not insert the table');
  return { session, pageId: page.id, objectId: result.metadata.createdIds[0] };
}

function tableOf(document: CatalogDocument, objectId: string): TableObject {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object || object.type !== 'table') throw new Error('Missing table');
  return object;
}

function apply(session: DocumentSession, pageId: string, objectId: string, request: TableLookRequest, transactionId = `look-${request.kind}`) {
  const document = session.getSnapshot().document;
  const look = projectTableLook(tableOf(document, objectId).table, document.style);
  return runTableSteps(session, { pageId, objectId }, tableLookSteps(request, look, document.style), transactionId);
}

const firstColumnBodyCells = (table: TableModel) => table.cells.filter((cell) =>
  cell.columnId === table.columns[0].id && table.rows.find((row) => row.id === cell.rowId)?.role === 'body');

describe('FR-33 task presets of the table panel', () => {
  it('names the four presets by task, in gallery order, on the engine preset IDs', () => {
    expect(TABLE_PRESETS.map((preset) => preset.label)).toEqual(['Especificações', 'Comparativo de modelos', 'Códigos de pedido', 'Acessórios']);
    expect(TABLE_PRESETS.map((preset) => preset.id)).toEqual(['technical-specification', 'comparison', 'technical-grid', 'minimal']);
  });

  it('the house base alone is not shown as "Especificações": the gallery only marks the whole look', () => {
    const { session, objectId } = sessionWithTable();
    const document = session.getSnapshot().document;
    const look = projectTableLook(tableOf(document, objectId).table, document.style);
    expect(look).toMatchObject({ basePresetId: 'technical-specification', header: true, banded: false, firstColumn: false, size: 'medium' });
    expect(look.presetId).toBeUndefined();
  });

  it('a new table gets the whole "Especificações" look (names in bold, 68 mm) in the undo step that created it', () => {
    const document = createW2CDemoDocument(ids('doc'));
    const session = createDocumentSession(document, { createId: ids('generated') });
    const page = document.pages[0];
    const before = session.getSnapshot().document;
    const created = session.execute(
      { type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createNewTableModel(), document.style) },
      { transactionId: 'new-table' }
    );
    if (!created.ok) throw new Error('Could not insert the table');
    const objectId = created.metadata.createdIds[0];
    const outcome = completeNewTableLook(session, { pageId: page.id, objectId }, NEW_TABLE_PRESET_ID, 'new-table');
    expect(outcome).toMatchObject({ ok: true, changed: true });
    const after = session.getSnapshot().document;
    const table = tableOf(after, objectId).table;
    expect(projectTableLook(table, after.style)).toMatchObject({
      presetId: 'technical-specification', header: true, banded: false, firstColumn: true,
    });
    expect(table.columns[0].width).toEqual({ mode: 'fixed', mm: 68 });
    const label = tablePresetAccents(after.style, 'technical-specification').label;
    expect(firstColumnBodyCells(table).every((cell) => cell.style?.fontWeight === 700 && cell.style.background === label.background)).toBe(true);
    // The header keeps its own look.
    expect(table.cells.find((cell) => cell.rowId === table.rows[0].id && cell.columnId === table.columns[0].id)?.style).toBeUndefined();
    // One Desfazer takes the new table away with its look.
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before);
  });

  it('a new table without the house base (the catalog lacks its fonts) is left as it is', () => {
    const document = createW2CDemoDocument(ids('doc'));
    const session = createDocumentSession(document, { createId: ids('generated') });
    const page = document.pages[0];
    // Without the document style the table keeps the plain engine look, as styleNewTable does when fonts are missing.
    const created = session.execute({ type: 'object.insert', pageId: page.id, object: createTableInsertSpec(page, createSizedEmptyTable({ rows: 3, columns: 2 })) });
    if (!created.ok) throw new Error('Could not insert the table');
    const objectId = created.metadata.createdIds[0];
    expect(projectTableLook(tableOf(created.document, objectId).table, document.style).basePresetId).toBeUndefined();
    const before = session.getSnapshot();
    expect(completeNewTableLook(session, { pageId: page.id, objectId }, NEW_TABLE_PRESET_ID, 'new-table')).toMatchObject({ ok: true, changed: false });
    expect(session.getSnapshot().localSequence).toBe(before.localSequence);
  });

  it('"Comparativo de modelos" marks the header, bands the rows, highlights and sizes the first column, in one undo step', () => {
    const { session, pageId, objectId } = sessionWithTable(createSizedEmptyTable({ rows: 6, columns: 3 }));
    const before = session.getSnapshot();
    const outcome = apply(session, pageId, objectId, { kind: 'preset', presetId: 'comparison' });
    expect(outcome).toMatchObject({ ok: true, changed: true });
    const after = session.getSnapshot().document;
    const table = tableOf(after, objectId).table;
    expect(table.style.base).toEqual(materializeTablePreset(table, after.style, 'comparison').style.base);
    expect(table.rows.map((row) => row.role)).toEqual(['header', 'body', 'body', 'body', 'body', 'body']);
    // Every second ordinary row is banded.
    expect(table.rows.map((row) => row.style?.background ?? null)).toEqual([
      null, null, tablePresetAccents(after.style, 'comparison').band, null, tablePresetAccents(after.style, 'comparison').band, null,
    ]);
    const label = tablePresetAccents(after.style, 'comparison').label;
    expect(firstColumnBodyCells(table).every((cell) => cell.style?.fontWeight === 700 && cell.style.background === label.background)).toBe(true);
    // The header cell of the first column keeps the header look.
    expect(table.cells.find((cell) => cell.rowId === table.rows[0].id && cell.columnId === table.columns[0].id)?.style).toBeUndefined();
    expect(table.columns[0].width).toEqual({ mode: 'fixed', mm: 51 });
    expect(projectTableLook(table, after.style)).toMatchObject({ presetId: 'comparison', header: true, banded: true, firstColumn: true });
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it('"Especificações" keeps a label/value table without header and gives the names 68 mm in bold', () => {
    const { session, pageId, objectId } = sessionWithTable(createSizedEmptyTable({ rows: 4, columns: 2 }));
    apply(session, pageId, objectId, { kind: 'preset', presetId: 'technical-specification' });
    const document = session.getSnapshot().document;
    const table = tableOf(document, objectId).table;
    expect(table.rows.every((row) => row.role === 'body')).toBe(true);
    expect(table.columns[0].width).toEqual({ mode: 'fixed', mm: 68 });
    expect(firstColumnBodyCells(table)).toHaveLength(4);
    expect(firstColumnBodyCells(table).every((cell) => cell.style?.fontWeight === 700)).toBe(true);
    expect(projectTableLook(table, document.style)).toMatchObject({ presetId: 'technical-specification', header: false, firstColumn: true });
  });

  it('the three switches and the text size change only their part and keep the rest', () => {
    const { session, pageId, objectId } = sessionWithTable();
    apply(session, pageId, objectId, { kind: 'preset', presetId: 'comparison' });
    apply(session, pageId, objectId, { kind: 'banded', on: false });
    let table = tableOf(session.getSnapshot().document, objectId).table;
    expect(table.rows.some((row) => row.style?.background)).toBe(false);
    expect(firstColumnBodyCells(table).every((cell) => cell.style?.fontWeight === 700)).toBe(true);

    apply(session, pageId, objectId, { kind: 'firstColumn', on: false });
    table = tableOf(session.getSnapshot().document, objectId).table;
    expect(firstColumnBodyCells(table).every((cell) => cell.style === undefined)).toBe(true);

    apply(session, pageId, objectId, { kind: 'banded', on: true });
    apply(session, pageId, objectId, { kind: 'size', size: 'large' });
    table = tableOf(session.getSnapshot().document, objectId).table;
    expect(table.style.base.fontSizePt).toBe(12);
    // Without its highlighted first column the table no longer shows as "Comparativo de modelos" in the gallery.
    const look = projectTableLook(table, session.getSnapshot().document.style);
    expect(look).toMatchObject({ basePresetId: 'comparison', banded: true, firstColumn: false, size: 'large' });
    expect(look.presetId).toBeUndefined();

    // A preset keeps a size chosen by hand.
    apply(session, pageId, objectId, { kind: 'preset', presetId: 'minimal' });
    table = tableOf(session.getSnapshot().document, objectId).table;
    expect(table.style.base.fontSizePt).toBe(12);
    expect(projectTableLook(table, session.getSnapshot().document.style)).toMatchObject({ presetId: 'minimal', banded: false, firstColumn: true });
  });

  it('"Cabeçalho" off and on moves the bands and the highlighted first column with the ordinary rows', () => {
    const { session, pageId, objectId } = sessionWithTable();
    apply(session, pageId, objectId, { kind: 'preset', presetId: 'comparison' });
    apply(session, pageId, objectId, { kind: 'header', on: false });
    let table = tableOf(session.getSnapshot().document, objectId).table;
    const accents = tablePresetAccents(session.getSnapshot().document.style, 'comparison');
    expect(table.rows.every((row) => row.role === 'body')).toBe(true);
    expect(table.rows.map((row) => row.style?.background ?? null)).toEqual([null, accents.band, null, accents.band, null, accents.band]);
    expect(firstColumnBodyCells(table)).toHaveLength(6);
    expect(firstColumnBodyCells(table).every((cell) => cell.style?.background === accents.label.background)).toBe(true);

    apply(session, pageId, objectId, { kind: 'header', on: true });
    table = tableOf(session.getSnapshot().document, objectId).table;
    expect(table.rows[0].role).toBe('header');
    const headerCell = table.cells.find((cell) => cell.rowId === table.rows[0].id && cell.columnId === table.columns[0].id);
    expect(headerCell?.style).toBeUndefined();
    expect(table.rows.map((row) => row.style?.background ?? null)).toEqual([null, null, accents.band, null, accents.band, null]);
  });

  it('a row coloured by hand is not "Linhas alternadas", and a style without bands keeps it', () => {
    const { session, pageId, objectId } = sessionWithTable(createNewTableModel({ rows: 8, columns: 3 }));
    let table = tableOf(session.getSnapshot().document, objectId).table;
    const highlighted = table.rows[3];
    expect(session.execute({
      type: 'table.rows.setStyle', pageId, objectId, tableId: table.id,
      targets: [{ id: highlighted.id }], patch: { background: '#FFFF00' },
    }).ok).toBe(true);
    table = tableOf(session.getSnapshot().document, objectId).table;
    const look = projectTableLook(table, session.getSnapshot().document.style);
    expect(look).toMatchObject({ banded: false, bandsFollowRows: false });
    expect(look.bandColor).toBeUndefined();
    apply(session, pageId, objectId, { kind: 'preset', presetId: 'minimal' });
    table = tableOf(session.getSnapshot().document, objectId).table;
    expect(table.rows.filter((row) => row.style?.background).map((row) => [row.id, row.style?.background])).toEqual([[highlighted.id, '#FFFF00']]);
  });

  it('a first column with one bold, tinted cell is not "Primeira coluna destacada"', () => {
    const { session, pageId, objectId } = sessionWithTable(createNewTableModel({ rows: 6, columns: 3 }));
    const table = tableOf(session.getSnapshot().document, objectId).table;
    const cell = firstColumnBodyCells(table)[2];
    expect(session.execute({
      type: 'table.cell.setProperties', pageId, objectId, tableId: table.id,
      targets: [{ cellId: cell.id, patch: { fontWeight: 700, background: '#FFE8A3' } }],
    }).ok).toBe(true);
    const look = projectTableLook(tableOf(session.getSnapshot().document, objectId).table, session.getSnapshot().document.style);
    expect(look.firstColumn).toBe(false);
    expect(look.labelStyle).toBeUndefined();
  });

  it('reads the bands and the first column of an assistant design', () => {
    const style = createW2CDemoDocument(ids('native')).style;
    const designed = applyNativeTableDesign(createNewTableModel({ rows: 6, columns: 3 }), 'comparison');
    expect(projectTableLook(designed, style)).toMatchObject({ header: true, banded: true, bandsFollowRows: true, firstColumn: true });
    // A tiny table banded by a style (one banded row) still keeps its bands when rows change.
    const tiny = applyNativeTableDesign(createNewTableModel({ rows: 3, columns: 2 }), 'datasheet');
    expect(projectTableLook(tiny, style)).toMatchObject({ banded: true, bandsFollowRows: true });
  });

  it('a switch that changes nothing reports no change and leaves history untouched', () => {
    const { session, pageId, objectId } = sessionWithTable();
    const before = session.getSnapshot();
    expect(apply(session, pageId, objectId, { kind: 'banded', on: false })).toMatchObject({ ok: true, changed: false });
    expect(session.getSnapshot().localSequence).toBe(before.localSequence);
  });

  it('nothing changes when the table is locked', () => {
    const { session, pageId, objectId } = sessionWithTable();
    expect(session.execute({ type: 'object.setLocked', objectId, expectedLocked: false, locked: true }).ok).toBe(true);
    const before = session.getSnapshot();
    const outcome = apply(session, pageId, objectId, { kind: 'preset', presetId: 'comparison' });
    expect(outcome).toMatchObject({ ok: false, code: 'OBJECT_LOCKED' });
    expect(session.getSnapshot().document).toEqual(before.document);
  });

  it('plans on a copy and leaves out the steps that change nothing', () => {
    const { session, pageId, objectId } = sessionWithTable();
    const document = session.getSnapshot().document;
    const look = projectTableLook(tableOf(document, objectId).table, document.style);
    const plan = planTableComposition(document, pageId, objectId, tableLookSteps({ kind: 'preset', presetId: 'technical-specification' }, look, document.style));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.actions.map((action) => action.type)).toEqual(['table.cell.setProperties', 'table.columns.setProperties']);
    expect(session.getSnapshot().document).toBe(document);
  });

  it('proposes a first-column width only when the other columns still fit', () => {
    const three = createSizedEmptyTable({ rows: 2, columns: 3 });
    expect(tablePresetFirstColumnMm('technical-specification', three, 186)).toBe(68);
    expect(tablePresetFirstColumnMm('technical-grid', createSizedEmptyTable({ rows: 2, columns: 6 }), 186)).toBe(37);
    expect(tablePresetFirstColumnMm('comparison', createSizedEmptyTable({ rows: 2, columns: 6 }), 186)).toBe(41);
    expect(tablePresetFirstColumnMm('comparison', createSizedEmptyTable({ rows: 2, columns: 4 }), 120)).toBe(45);
    // Ten columns of at least 25 mm do not fit in 186 mm: the width is left alone.
    expect(tablePresetFirstColumnMm('comparison', createSizedEmptyTable({ rows: 2, columns: 10 }), 186)).toBeUndefined();
    expect(tablePresetFirstColumnMm('comparison', createSizedEmptyTable({ rows: 2, columns: 1 }), 186)).toBeUndefined();
  });
});

describe('FR-33 accents stay legible in every palette (WCAG ≥ 4,5)', () => {
  const base = createW2CDemoDocument(ids('contrast')).style;
  const palettes: Record<string, DocumentStyle> = {
    padrão: base,
    'PRESYS TA-25N': { ...base, palette: ['#003366', '#0072CE', '#172033', '#FFFFFF', '#F2F6FA', '#D9E2EC'] },
    'só uma cor': { ...base, palette: ['#003366'] },
    invertida: { ...base, palette: ['#FFFFFF', '#FFFF00', '#FFFFFF', '#000000'] },
    'tons médios': { ...base, palette: ['#808080', '#7F7F7F', '#909090', '#777777'] },
  };
  for (const [name, style] of Object.entries(palettes)) {
    for (const preset of TABLE_PRESETS) {
      it(`${preset.label} × ${name}: faixas e primeira coluna legíveis`, () => {
        const accents = tablePresetAccents(style, preset.id);
        const table = materializeTablePreset(createNewTableModel({ rows: 4, columns: 2 }), style, preset.id);
        const banded: TableModel = {
          ...table,
          rows: table.rows.map((row, index) => index === 2 ? { ...row, style: { background: accents.band } } : row),
          cells: table.cells.map((cell) => cell.columnId === table.columns[0].id && cell.rowId !== table.rows[0].id
            ? { ...cell, style: { ...accents.label } }
            : cell),
        };
        for (const cell of banded.cells) {
          const resolved = resolveCellStyle(style, banded, cell);
          if (!resolved.color || !resolved.background) continue;
          expect(contrastRatio(resolved.color, resolved.background)).toBeGreaterThanOrEqual(MIN_TABLE_TEXT_CONTRAST);
        }
        expect(contrastRatio(accents.label.color, accents.label.background)).toBeGreaterThanOrEqual(MIN_TABLE_TEXT_CONTRAST);
      });
    }
  }

  it('uses the light PRESYS tone for "Especificações" names, like the TA-25N sheet', () => {
    expect(tablePresetAccents(palettes['PRESYS TA-25N'], 'technical-specification').label).toEqual({
      fontWeight: 700, color: '#003366', background: '#F2F6FA',
    });
  });
});
