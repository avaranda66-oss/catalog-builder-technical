import { describe, expect, it } from 'vitest';
import {
  cellBorderPresetPatches,
  declaredFontOptions,
  defaultStyleScopeFromSelection,
  inheritedLabel,
  paddingQuickPatch,
  paletteOptions,
  prepareAnnotationGapAction,
  prepareCellBorderPresetAction,
  prepareStyleAction,
  prepareTablePresetAction,
  projectLocalStyleField,
  simpleBorderQuickPatch,
} from '@/vnext/editor/table-style-authoring';
import {
  tableCellSelection,
  tableColumnSelection,
  tableRowSelection,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';
import { createW4F1Document, W4F1_OBJECT_ID, W4F1_PAGE_ID } from '../proof/fixtures/w4f1-table-document';

function fixture() {
  const document = createW4F1Document();
  const object = document.pages[0].objects.find((entry) => entry.id === W4F1_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Expected W4.F.1 table');
  return { document, table: object.table, identity: tableSelectionIdentity(W4F1_PAGE_ID, object.id, object.table.id) };
}

describe('W4.F.2 style authoring projection', () => {
  it('maps Table/Row/Column/Cell selections to the canonical style scope', () => {
    const { table, identity } = fixture();
    expect(defaultStyleScopeFromSelection(table, wholeTableSelection(identity))).toEqual({ kind: 'table' });
    expect(defaultStyleScopeFromSelection(table, tableRowSelection(identity, table.rows[1].id))).toEqual({
      kind: 'rows', rowIds: [table.rows[1].id],
    });
    expect(defaultStyleScopeFromSelection(table, tableColumnSelection(identity, table.columns[1].id))).toEqual({
      kind: 'columns', columnIds: [table.columns[1].id],
    });
    expect(defaultStyleScopeFromSelection(table, tableCellSelection(identity, {
      rowId: table.rows[1].id,
      columnId: table.columns[1].id,
    }))).toEqual({ kind: 'cells', cellIds: [table.cells[5].id] });
  });

  it('projects local/inherited/mixed without flattening resolved values', () => {
    const { table } = fixture();
    table.rows[1].style = { color: '#003366' };
    table.rows[2].style = { color: '#FFFFFF' };
    const mixed = projectLocalStyleField(table, { kind: 'rows', rowIds: [table.rows[1].id, table.rows[2].id] }, 'color');
    expect(mixed).toEqual({ field: 'color', local: 'mixed', ownership: 'mixed' });
    const inherited = projectLocalStyleField(table, { kind: 'columns', columnIds: [table.columns[0].id] }, 'color');
    expect(inherited.ownership).toBe('inherited');
    const local = projectLocalStyleField(table, { kind: 'rows', rowIds: [table.rows[1].id] }, 'color');
    expect(local).toEqual({ field: 'color', local: '#003366', ownership: 'local' });
  });

  it('projects declared normal fonts and palette only', () => {
    const { document } = fixture();
    document.style.fonts.push({ family: 'Noto Sans JP', revision: '5.3.0', weight: 400, style: 'normal' });
    document.style.fonts.push({ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'italic' });
    expect(declaredFontOptions(document.style)).toEqual([
      { family: 'Noto Sans', weights: [400, 700] },
      { family: 'Noto Sans JP', weights: [400] },
    ]);
    expect(paletteOptions(document.style)).toEqual(['#172033', '#003366', '#DCECFF', '#FFFFFF']);
  });

  it('freezes deterministic quick padding and simple border recipes', () => {
    expect(paddingQuickPatch('compact')).toEqual({ paddingMm: { top: .6, right: .6, bottom: .6, left: .6 } });
    expect(paddingQuickPatch('normal')).toEqual({ paddingMm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 } });
    expect(paddingQuickPatch('spacious')).toEqual({ paddingMm: { top: 2, right: 2, bottom: 2, left: 2 } });
    expect(simpleBorderQuickPatch('none', '#003366')).toEqual({
      borders: {
        top: { pattern: 'none' }, right: { pattern: 'none' }, bottom: { pattern: 'none' }, left: { pattern: 'none' },
      },
    });
    expect(simpleBorderQuickPatch('header-separator', '#003366')).toEqual({
      borders: { bottom: { pattern: 'solid', thicknessPt: .75, color: '#003366' } },
    });
  });

  it('materializes outer and inner Cell border recipes against the selected canonical rectangle', () => {
    const { table } = fixture();
    const ids = [table.cells[4].id, table.cells[5].id, table.cells[8].id, table.cells[9].id];
    const outer = cellBorderPresetPatches(table, ids, 'outer', '#003366');
    expect(outer.get(ids[0])?.borders).toMatchObject({
      top: { pattern: 'solid' },
      left: { pattern: 'solid' },
      right: { pattern: 'none' },
      bottom: { pattern: 'none' },
    });
    expect(outer.get(ids[3])?.borders).toMatchObject({
      top: { pattern: 'none' },
      left: { pattern: 'none' },
      right: { pattern: 'solid' },
      bottom: { pattern: 'solid' },
    });
    const inner = cellBorderPresetPatches(table, ids, 'inner', '#003366');
    expect(inner.get(ids[0])?.borders).toMatchObject({
      top: { pattern: 'none' },
      left: { pattern: 'none' },
      right: { pattern: 'solid' },
      bottom: { pattern: 'solid' },
    });
  });

  it('prepares semantic actions for the selected layer and no persistent preset linkage', () => {
    const { table, identity } = fixture();
    expect(prepareStyleAction(identity, table, { kind: 'table' }, { color: '#003366' }).type).toBe('table.style.setBase');
    expect(prepareStyleAction(identity, table, { kind: 'role', role: 'header' }, { color: '#003366' }).type).toBe('table.style.setRowRole');
    expect(prepareStyleAction(identity, table, { kind: 'rows', rowIds: [table.rows[1].id] }, { color: '#003366' }).type).toBe('table.rows.setStyle');
    expect(prepareStyleAction(identity, table, { kind: 'columns', columnIds: [table.columns[0].id] }, { color: '#003366' }).type).toBe('table.columns.setStyle');
    expect(prepareStyleAction(identity, table, { kind: 'cells', cellIds: [table.cells[0].id] }, { color: '#003366' }).type).toBe('table.cell.setProperties');
    expect(prepareCellBorderPresetAction(identity, table, [table.cells[0].id], 'all', '#003366').type).toBe('table.cell.setProperties');
    expect(prepareAnnotationGapAction(identity, table, 2)).toMatchObject({ type: 'table.style.setBase', annotationGapMm: 2 });
    expect(prepareTablePresetAction(identity, table, 'minimal')).toMatchObject({ type: 'table.preset.apply', presetId: 'minimal' });
  });

  it('provides Father-facing inheritance labels without internal style paths', () => {
    expect(inheritedLabel({ kind: 'table' })).toBe('Herdado do documento');
    expect(inheritedLabel({ kind: 'role', role: 'header' })).toBe('Herdado da tabela');
    expect(inheritedLabel({ kind: 'columns', columnIds: ['c'] })).toContain('Herdado');
    expect(inheritedLabel({ kind: 'rows', rowIds: ['r'] })).toContain('Herdado');
    expect(inheritedLabel({ kind: 'cells', cellIds: ['x'] })).toContain('Herdado');
  });
});
