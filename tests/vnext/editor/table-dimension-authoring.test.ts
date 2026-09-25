import { describe, expect, it } from 'vitest';
import { mmToU, pxToQ, uToQ } from '@/vnext/domain';
import { pointerAxisDeltaU } from '@/vnext/app/editor-interaction';
import {
  prepareAxisReorder,
  prepareColumnBoundaryDrag,
  prepareColumnsSetProperties,
  prepareEqualizeColumns,
  prepareRowBoundaryDrag,
  prepareRowsSetProperties,
  projectColumnDimensions,
  projectRowDimensions,
  TableDimensionAuthoringError,
} from '@/vnext/editor/table-dimension-authoring';
import {
  tableColumnSelection,
  tableRowSelection,
  tableSelectionIdentity,
} from '@/vnext/editor/table-selection';
import { mergeCells } from '@/vnext/table';
import { emptyTable } from '../proof/test-data';

const identity = tableSelectionIdentity('page', 'object', 'table');

describe('W4.F.1 table dimension authoring helpers', () => {
  it('projects explicit row/column selections including mixed states', () => {
    const table = emptyTable();
    table.rows[0] = { ...table.rows[0], role: 'header', heightPolicy: { mode: 'MIN_MM', minMm: 4 } };
    table.rows[1] = { ...table.rows[1], role: 'section', heightPolicy: { mode: 'FIXED_MM', heightMm: 5 } };
    const rows = projectRowDimensions(table, tableRowSelection(identity, 'r0', 'r1'));
    expect(rows).toMatchObject({ rowIds: ['r0', 'r1'], role: 'mixed', heightMode: 'mixed' });

    table.columns[0] = { ...table.columns[0], width: { mode: 'fixed', mm: 20 }, minMm: 10, maxMm: 50 };
    table.columns[1] = { ...table.columns[1], width: { mode: 'fixed', mm: 25 }, minMm: 10, maxMm: 50 };
    const columns = projectColumnDimensions(table, tableColumnSelection(identity, 'c0', 'c1'));
    expect(columns.widthMode).toBe('fixed');
    expect(columns.fixedWidthU).toBe('mixed');
    expect(columns.minU).toBe(mmToU(10));
    expect(columns.maxU).toBe(mmToU(50));
  });

  it('prepares narrow-CAS multi-row and multi-column actions without Cell flattening', () => {
    const table = emptyTable();
    const rowAction = prepareRowsSetProperties(
      identity,
      table,
      tableRowSelection(identity, 'r0', 'r1'),
      { role: 'section', heightPolicy: { mode: 'FIXED_MM', heightU: 80_000 } }
    );
    expect(rowAction.targets.map((target) => target.rowId)).toEqual(['r0', 'r1']);
    expect(JSON.stringify(rowAction)).not.toContain('cell0-0');

    const columnAction = prepareColumnsSetProperties(
      identity,
      table,
      1_200_000,
      tableColumnSelection(identity, 'c0', 'c1'),
      { minU: 50_000 }
    );
    expect(columnAction.expectedColumnOrder).toEqual(['c0', 'c1', 'c2']);
    expect(columnAction.targets.map((target) => target.columnId)).toEqual(['c0', 'c1']);
    expect(JSON.stringify(columnAction)).not.toContain('cell0-0');
  });

  it('equalizes selected resolved widths with exact U-sum and stable remainder policy', () => {
    const table = emptyTable();
    table.columns = [
      { ...table.columns[0], width: { mode: 'fixed', mm: 20 }, minMm: 1 },
      { ...table.columns[1], width: { mode: 'fixed', mm: 20 }, minMm: 1 },
      { ...table.columns[2], width: { mode: 'flex', weight: 1 }, minMm: 1 },
    ];
    const action = prepareEqualizeColumns(
      identity,
      table,
      mmToU(100),
      100,
      tableColumnSelection(identity, 'c0', 'c2')
    );
    const widths = action.targets.map((target) => target.next.width).map((width) => {
      if (!width || width.mode !== 'fixed') throw new Error('fixed width expected');
      return width.widthU;
    });
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(mmToU(100));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(widths[0]).toBeGreaterThanOrEqual(widths[2]);
  });

  it('fails equalize instead of silently violating a selected min/max', () => {
    const table = emptyTable();
    table.columns[0] = { ...table.columns[0], minMm: 50 };
    expect(() => prepareEqualizeColumns(
      identity,
      table,
      mmToU(120),
      120,
      tableColumnSelection(identity, 'c0', 'c2')
    )).toThrowError(TableDimensionAuthoringError);
    try {
      prepareEqualizeColumns(identity, table, mmToU(120), 120, tableColumnSelection(identity, 'c0', 'c2'));
    } catch (error) {
      expect(error).toMatchObject({ code: 'COLUMN_EQUALIZE_INFEASIBLE' });
    }
  });

  it('prepares adjacent column drag as two fixed widths that preserve their combined resolved U width', () => {
    const table = emptyTable();
    const action = prepareColumnBoundaryDrag(identity, table, mmToU(120), 120, 0, mmToU(5));
    const widths = action.targets.map((target) => target.next.width).map((width) => {
      if (!width || width.mode !== 'fixed') throw new Error('fixed expected');
      return width.widthU;
    });
    expect(action.targets.map((target) => target.columnId)).toEqual(['c0', 'c1']);
    expect(widths[0] + widths[1]).toBe(mmToU(80));
    expect(widths[0]).toBe(mmToU(45));
    expect(widths[1]).toBe(mmToU(35));
  });

  it('applies a scale-calibrated viewport delta to adjacent column authoring without losing combined U width', () => {
    const table = emptyTable();
    const pageWidthU = mmToU(210);
    const renderedPageWidthQ = pxToQ((uToQ(pageWidthU) / 64) * 0.62);
    const calibratedDeltaU = pointerAxisDeltaU(24, pageWidthU, renderedPageWidthQ);
    const action = prepareColumnBoundaryDrag(identity, table, mmToU(120), 120, 0, calibratedDeltaU);
    const widths = action.targets.map((target) => target.next.width).map((width) => {
      if (!width || width.mode !== 'fixed') throw new Error('fixed expected');
      return width.widthU;
    });
    expect(widths[0]).toBe(mmToU(40) + calibratedDeltaU);
    expect(widths[1]).toBe(mmToU(40) - calibratedDeltaU);
    expect(widths[0] + widths[1]).toBe(mmToU(80));
  });

  it('clamps column drag to canonical min/max feasibility without invalid intermediate state', () => {
    const table = emptyTable();
    table.columns[0] = { ...table.columns[0], width: { mode: 'fixed', mm: 40 }, minMm: 30, maxMm: 45 };
    table.columns[1] = { ...table.columns[1], width: { mode: 'fixed', mm: 40 }, minMm: 35, maxMm: 50 };
    const action = prepareColumnBoundaryDrag(identity, table, mmToU(120), 120, 0, mmToU(50));
    const first = action.targets[0].next.width;
    const second = action.targets[1].next.width;
    expect(first?.mode === 'fixed' && first.widthU).toBe(mmToU(45));
    expect(second?.mode === 'fixed' && second.widthU).toBe(mmToU(35));
  });

  it('turns row boundary drag into explicit FIXED_MM while preserving row semantic identity', () => {
    const table = emptyTable();
    const action = prepareRowBoundaryDrag(identity, table, 'r1', 60_000, 15_000);
    expect(action.targets).toEqual([expect.objectContaining({
      rowId: 'r1',
      next: { heightPolicy: { mode: 'FIXED_MM', heightU: 75_000 } },
    })]);
  });

  it('applies a scale-calibrated viewport delta to row drag as explicit FIXED_MM U', () => {
    const table = emptyTable();
    const pageHeightU = mmToU(297);
    const renderedPageHeightQ = pxToQ((uToQ(pageHeightU) / 64) * 0.58);
    const calibratedDeltaU = pointerAxisDeltaU(17, pageHeightU, renderedPageHeightQ);
    const action = prepareRowBoundaryDrag(identity, table, 'r1', 60_000, calibratedDeltaU);
    expect(action.targets[0].next.heightPolicy).toEqual({
      mode: 'FIXED_MM',
      heightU: 60_000 + calibratedDeltaU,
    });
  });

  it('prepares stable one-step reorder and disables boundary/multi-axis intent', () => {
    const table = emptyTable();
    const down = prepareAxisReorder(identity, table, tableRowSelection(identity, 'r0'), 'row', 1);
    expect(down.expectedOrder).toEqual(['r0', 'r1', 'r2']);
    expect(down.nextOrder).toEqual(['r1', 'r0', 'r2']);
    expect(down.expectedTable).toBe(table);

    expect(() => prepareAxisReorder(identity, table, tableRowSelection(identity, 'r0'), 'row', -1))
      .toThrowError(TableDimensionAuthoringError);
    expect(() => prepareAxisReorder(identity, table, tableRowSelection(identity, 'r0', 'r1'), 'row', 1))
      .toThrowError(TableDimensionAuthoringError);
  });

  it('prepares reorder even when merge-sensitive domain validation must later fail closed', () => {
    const table = mergeCells(emptyTable(), 'cell0-0', 2, 1);
    const action = prepareAxisReorder(identity, table, tableRowSelection(identity, 'r0'), 'row', 1);
    expect(action.nextOrder).toEqual(['r1', 'r0', 'r2']);
    expect(action.expectedTable).toBe(table);
  });
});
