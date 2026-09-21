import { describe, expect, it } from 'vitest';
import type { CatalogDocument, TableModel } from '@/vnext/domain';
import {
  canonicalTablePoint,
  explicitTableAxisIds,
  navigateTableSelection,
  normalizeTableSelection,
  reconcileTableSelection,
  selectionAfterAxisInsert,
  selectionAfterAxisRemove,
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  tableSelectionIdentity,
  wholeTableSelection,
} from '@/vnext/editor/table-selection';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

const identity = tableSelectionIdentity('page', 'object', 'table');

function documentWith(table: TableModel): CatalogDocument {
  return {
    schemaVersion: 1,
    id: 'document',
    title: 'W4.A',
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {},
      palette: ['#FFFFFF'],
    },
    pages: [{
      id: 'page', widthMm: 210, heightMm: 297,
      objects: [{
        id: 'object', type: 'table', frame: { xMm: 0, yMm: 0, widthMm: 100, heightMm: 50 },
        zIndex: 0, table,
      }],
    }],
    assets: [],
  };
}

describe('W4.A pure Table selection', () => {
  it('keeps original anchor/focus while normalizing forward and reverse rectangular drags', () => {
    const table = emptyTable();
    const forward = tableRangeSelection(identity, { rowId: 'r0', columnId: 'c0' }, { rowId: 'r2', columnId: 'c1' });
    const reverse = tableRangeSelection(identity, { rowId: 'r2', columnId: 'c1' }, { rowId: 'r0', columnId: 'c0' });
    expect(normalizeTableSelection(table, forward)).toMatchObject({ rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 1 });
    expect(normalizeTableSelection(table, reverse)).toMatchObject({ rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 1 });
    expect(reverse.kind === 'range' && reverse.anchor).toEqual({ rowId: 'r2', columnId: 'c1' });
    expect(reverse.kind === 'range' && reverse.focus).toEqual({ rowId: 'r0', columnId: 'c0' });
    const contracted = tableRangeSelection(identity, reverse.anchor, { rowId: 'r2', columnId: 'c0' });
    expect(normalizeTableSelection(table, contracted)).toMatchObject({ rowStart: 2, rowEnd: 2, columnStart: 0, columnEnd: 1 });
  });

  it('resolves covered slots to direct ownership and expands intersecting spans to fixed-point closure', () => {
    let table = mergeCells(emptyTable(4, 4), 'cell0-0', 2, 2);
    table = mergeCells(table, 'cell1-2', 2, 2);
    table = mergeCells(table, 'cell2-0', 2, 2);
    table = mergeCells(table, 'cell3-2', 1, 2);
    expect(canonicalTablePoint(table, { rowId: 'r1', columnId: 'c1' })).toEqual({ rowId: 'r0', columnId: 'c0' });
    const selection = tableRangeSelection(
      identity,
      { rowId: 'r1', columnId: 'c1' },
      { rowId: 'r1', columnId: 'c2' }
    );
    expect(normalizeTableSelection(table, selection)).toMatchObject({
      rowStart: 0,
      rowEnd: 3,
      columnStart: 0,
      columnEnd: 3,
    });
    expect(selection).toMatchObject({ anchor: { rowId: 'r1', columnId: 'c1' }, focus: { rowId: 'r1', columnId: 'c2' } });
  });

  it('keeps explicit whole-axis intent separate from span-expanded display geometry', () => {
    const table = mergeCells(emptyTable(), 'cell0-0', 2, 2);
    const rows = tableRowSelection(identity, 'r1');
    const columns = tableColumnSelection(identity, 'c1');
    expect(explicitTableAxisIds(table, rows, 'row')).toEqual(['r1']);
    expect(explicitTableAxisIds(table, rows, 'column')).toEqual([]);
    expect(explicitTableAxisIds(table, columns, 'column')).toEqual(['c1']);
    expect(normalizeTableSelection(table, rows)?.displayRowIds).toEqual(['r0', 'r1']);
    expect(normalizeTableSelection(table, columns)?.displayColumnIds).toEqual(['c0', 'c1']);
    expect(explicitTableAxisIds(table, wholeTableSelection(identity), 'row')).toEqual([]);
  });

  it('uses anchors only as keyboard stops, extends with Shift, and exits predictably at Tab boundaries', () => {
    const table = mergeCells(emptyTable(), 'cell0-0', 1, 2);
    const covered = tableCellSelection(identity, { rowId: 'r0', columnId: 'c1' });
    const right = navigateTableSelection(table, covered, 'ArrowRight');
    expect(right.selection).toMatchObject({ focus: { rowId: 'r0', columnId: 'c2' } });
    const extended = navigateTableSelection(table, right.selection, 'ArrowDown', { extend: true });
    expect(extended.selection).toMatchObject({
      anchor: { rowId: 'r0', columnId: 'c2' },
      focus: { rowId: 'r1', columnId: 'c2' },
    });
    const first = tableCellSelection(identity, { rowId: 'r0', columnId: 'c0' });
    expect(navigateTableSelection(table, first, 'Tab', { backwards: true }).exited).toBe(true);
    const last = tableCellSelection(identity, { rowId: 'r2', columnId: 'c2' });
    expect(navigateTableSelection(table, last, 'Tab').exited).toBe(true);
  });

  it('selects inserted axes and deterministically selects the nearest survivor after removal', () => {
    const table = emptyTable();
    expect(selectionAfterAxisInsert(identity, 'row', 'new-row')).toEqual(tableRowSelection(identity, 'new-row'));
    expect(selectionAfterAxisInsert(identity, 'column', 'new-column')).toEqual(tableColumnSelection(identity, 'new-column'));
    const withoutMiddle = { ...table, rows: table.rows.filter((row) => row.id !== 'r1') };
    expect(selectionAfterAxisRemove(identity, 'row', 1, withoutMiddle)).toEqual(tableRowSelection(identity, 'r2'));
    const withoutLast = { ...table, columns: table.columns.filter((column) => column.id !== 'c2') };
    expect(selectionAfterAxisRemove(identity, 'column', 2, withoutLast)).toEqual(tableColumnSelection(identity, 'c1'));
  });

  it('reconciles surviving IDs without document selection history and clears invalid page/object/table/axis identity', () => {
    const table = emptyTable();
    const selection = tableRangeSelection(identity, { rowId: 'r0', columnId: 'c0' }, { rowId: 'r1', columnId: 'c1' });
    const document = documentWith(table);
    expect(reconcileTableSelection(document, selection)).toBe(selection);
    expect(reconcileTableSelection({ ...document, pages: [] }, selection)).toBeNull();
    expect(reconcileTableSelection(document, { ...selection, identity: { ...identity, tableId: 'other' } })).toBeNull();
    expect(reconcileTableSelection(document, tableRowSelection(identity, 'missing'))).toBeNull();
    expect(reconcileTableSelection(document, null)).toBeNull();
  });

  it('is pure and never mutates Table or document state while selecting', () => {
    const table = mergeCells(emptyTable(), 'cell0-0', 2, 2);
    const document = documentWith(table);
    const before = JSON.stringify(document);
    const selection = tableRangeSelection(identity, { rowId: 'r2', columnId: 'c2' }, { rowId: 'r0', columnId: 'c0' });
    normalizeTableSelection(table, selection);
    navigateTableSelection(table, selection, 'ArrowRight', { extend: true });
    reconcileTableSelection(document, selection);
    expect(JSON.stringify(document)).toBe(before);
  });
});
