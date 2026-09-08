import { describe, it, expect } from 'vitest';
import {
  computeTablePaginationPlan,
  TablePaginationMeasurementInput
} from '../../src/domain/table-core/table.pagination';

describe('A4.FLOW.R1 — Phase C: Pure Table Pagination Planner (FLOW-T8 to FLOW-T12, FLOW-T14, FLOW-T22, FLOW-T23, FLOW-T29 to FLOW-T31)', () => {
  // Setup sample table with 20 rows (each 10mm), header 15mm.
  // Usable height on page 1: 100mm (header 15mm + 8 rows = 95mm fits, 9 rows = 105mm overflows).
  // Usable height on subsequent pages: 80mm (repeated header 15mm + 6 rows = 75mm fits).
  const sampleInput: TablePaginationMeasurementInput = {
    tableId: 'tbl-spec-1',
    headerHeightMm: 15,
    rowHeights: Array.from({ length: 20 }, (_, idx) => ({
      rowId: `r-${idx + 1}`,
      measuredHeightMm: 10,
      kind: 'data' as const
    })),
    availableHeightOnFirstPageMm: 100,
    availableHeightOnSubsequentPagesMm: 80
  };

  // FLOW-T8: long table produces N slices
  it('FLOW-T8: long table produces multiple slices across physical page limits', () => {
    const plan = computeTablePaginationPlan(sampleInput);
    expect(plan.totalPagesRequired).toBeGreaterThan(1);
    expect(plan.slices.length).toBe(plan.totalPagesRequired);
  });

  // FLOW-T9: every canonical row occurs exactly once
  it('FLOW-T9: every canonical row appears in exactly one slice without duplication or omissions', () => {
    const plan = computeTablePaginationPlan(sampleInput);
    const allIncludedRowIds = plan.slices.flatMap((s) => s.includedRowIds);

    // Exact count
    expect(allIncludedRowIds).toHaveLength(20);

    // Exact set equality
    const expectedIds = sampleInput.rowHeights.map((r) => r.rowId);
    expect(allIncludedRowIds).toEqual(expectedIds);

    // Zero duplicates
    const uniqueIds = new Set(allIncludedRowIds);
    expect(uniqueIds.size).toBe(20);
  });

  // FLOW-T10: row split never occurs
  it('FLOW-T10: row split never occurs (rows are strictly kept atomic)', () => {
    const plan = computeTablePaginationPlan(sampleInput);
    for (const slice of plan.slices) {
      // Each slice holds discrete full row IDs
      for (const rowId of slice.includedRowIds) {
        expect(typeof rowId).toBe('string');
        expect(rowId.startsWith('r-')).toBe(true);
      }
    }
  });

  // FLOW-T11: header repeats on subsequent slices
  it('FLOW-T11: header repeats on subsequent continuation slices when repeatHeaderOnBreak is true', () => {
    const plan = computeTablePaginationPlan(sampleInput, { repeatHeaderOnBreak: true });
    expect(plan.slices[0].isFirstPage).toBe(true);
    expect(plan.slices[0].includesRepeatedHeader).toBe(true);

    for (let i = 1; i < plan.slices.length; i++) {
      expect(plan.slices[i].isFirstPage).toBe(false);
      expect(plan.slices[i].includesRepeatedHeader).toBe(true);
      expect(plan.slices[i - 1].footnoteNotice).toBe('(Continua na próxima folha...)');
    }

    expect(plan.slices[plan.slices.length - 1].isLastPage).toBe(true);
    expect(plan.slices[plan.slices.length - 1].footnoteNotice).toBeUndefined();
  });

  // FLOW-T12: section header not orphaned at the end of a slice
  it('FLOW-T12: section header is never left orphaned at the bottom of a slice without child rows', () => {
    // 8 data rows (80mm) + section row (10mm) = 90mm fits, but section has next child (10mm) which makes 100mm + header 15mm = 115mm > 100mm.
    // The section row must move to the next slice together with its child!
    const inputWithSection: TablePaginationMeasurementInput = {
      tableId: 'tbl-sections',
      headerHeightMm: 15,
      rowHeights: [
        ...Array.from({ length: 7 }, (_, i) => ({ rowId: `d-${i + 1}`, measuredHeightMm: 10, kind: 'data' as const })),
        { rowId: 'sec-1', measuredHeightMm: 10, kind: 'section' as const },
        { rowId: 'sec-1-child-1', measuredHeightMm: 10, kind: 'data' as const },
        { rowId: 'sec-1-child-2', measuredHeightMm: 10, kind: 'data' as const }
      ],
      availableHeightOnFirstPageMm: 100,
      availableHeightOnSubsequentPagesMm: 80
    };

    const plan = computeTablePaginationPlan(inputWithSection);
    const slice0RowIds = plan.slices[0].includedRowIds;

    // Last row of slice 0 must NOT be sec-1
    expect(slice0RowIds[slice0RowIds.length - 1]).not.toBe('sec-1');
    // sec-1 must be at the start of slice 1
    expect(plan.slices[1].includedRowIds[0]).toBe('sec-1');
    expect(plan.slices[1].includedRowIds[1]).toBe('sec-1-child-1');
  });

  // FLOW-T14: explicit manual break is honored
  it('FLOW-T14: explicit manual break hint is honored before the specified rowId', () => {
    // Break explicitly before r-4
    const plan = computeTablePaginationPlan(sampleInput, {}, ['r-4']);
    expect(plan.slices[0].includedRowIds).toEqual(['r-1', 'r-2', 'r-3']);
    expect(plan.slices[1].includedRowIds[0]).toBe('r-4');
  });

  // FLOW-T22: same document + same measurements => same plan (determinism)
  it('FLOW-T22: deterministic planning produces identical plans on repeated executions', () => {
    const plan1 = computeTablePaginationPlan(sampleInput);
    const plan2 = computeTablePaginationPlan(sampleInput);
    expect(plan1).toEqual(plan2);
  });

  // FLOW-T23: repeated planning reaches stable idempotent result
  it('FLOW-T23: planner execution is idempotent and stable across multiple cycles', () => {
    let currentPlan = computeTablePaginationPlan(sampleInput);
    for (let i = 0; i < 5; i++) {
      const nextPlan = computeTablePaginationPlan(sampleInput, currentPlan.policy);
      expect(nextPlan).toEqual(currentPlan);
      currentPlan = nextPlan;
    }
  });

  // FLOW-T29: section row + first child cannot fit in remaining page -> both move to next slice
  it('FLOW-T29: moves both section row and first child to next slice when they cannot fit remaining page space', () => {
    const input: TablePaginationMeasurementInput = {
      tableId: 't29',
      headerHeightMm: 10,
      rowHeights: [
        { rowId: 'd1', measuredHeightMm: 30, kind: 'data' },
        { rowId: 'd2', measuredHeightMm: 30, kind: 'data' },
        // current slice height = 10 + 30 + 30 = 70mm. Available = 85mm (15mm left).
        // Section is 10mm, child is 10mm -> total 20mm > 15mm.
        { rowId: 's1', measuredHeightMm: 10, kind: 'section' },
        { rowId: 's1_c1', measuredHeightMm: 10, kind: 'data' }
      ],
      availableHeightOnFirstPageMm: 85,
      availableHeightOnSubsequentPagesMm: 85
    };

    const plan = computeTablePaginationPlan(input);
    expect(plan.slices[0].includedRowIds).toEqual(['d1', 'd2']);
    expect(plan.slices[1].includedRowIds).toEqual(['s1', 's1_c1']);
  });

  // FLOW-T30: section itself plus one child is taller than remaining space but fits blank next page -> move together
  it('FLOW-T30: section and its child fit together on blank next page', () => {
    const input: TablePaginationMeasurementInput = {
      tableId: 't30',
      headerHeightMm: 10,
      rowHeights: [
        { rowId: 'd1', measuredHeightMm: 50, kind: 'data' },
        { rowId: 's1', measuredHeightMm: 20, kind: 'section' },
        { rowId: 's1_c1', measuredHeightMm: 20, kind: 'data' }
      ],
      availableHeightOnFirstPageMm: 65,
      availableHeightOnSubsequentPagesMm: 100
    };

    const plan = computeTablePaginationPlan(input);
    expect(plan.slices[0].includedRowIds).toEqual(['d1']);
    expect(plan.slices[1].includedRowIds).toEqual(['s1', 's1_c1']);
  });

  // FLOW-T31: single data row is itself taller than full usable page -> UNRESOLVED_OVERSIZED_ROW / fail closed
  it('FLOW-T31: flags hasUnresolvedOversizedRow when a single row exceeds a full blank page', () => {
    const input: TablePaginationMeasurementInput = {
      tableId: 't31',
      headerHeightMm: 15,
      rowHeights: [
        { rowId: 'normal-1', measuredHeightMm: 10, kind: 'data' },
        { rowId: 'giant-row', measuredHeightMm: 250, kind: 'data' } // 250mm > 200mm available
      ],
      availableHeightOnFirstPageMm: 200,
      availableHeightOnSubsequentPagesMm: 200
    };

    const plan = computeTablePaginationPlan(input);
    expect(plan.hasUnresolvedOversizedRow).toBe(true);
    expect(plan.unresolvedOversizedRowIds).toContain('giant-row');
  });
});
