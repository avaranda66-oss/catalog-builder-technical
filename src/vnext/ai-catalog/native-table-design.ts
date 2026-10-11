import { z } from 'zod';
import type { TableModel, CellStyle, Border } from '../domain/editorial-model';

/**
 * Provider selects one of THREE audited native presentation profiles.
 * No arbitrary CSS or unverified technical values enter the contract.
 * All styles use the existing TableRenderer / physical-fit preflight.
 */
export const NativeTableDesignSchema = z.enum(['comparison', 'datasheet', 'matrix']);
export type NativeTableDesign = z.infer<typeof NativeTableDesignSchema>;

const line = (color: string, thicknessPt: number): Border =>
  ({ pattern: 'solid', thicknessPt, color });
const edges = (color: string, thicknessPt: number) =>
  ({ top: line(color, thicknessPt), bottom: line(color, thicknessPt),
    left: line(color, thicknessPt), right: line(color, thicknessPt) });

const profiles: Record<NativeTableDesign, {
  base: CellStyle; header: CellStyle; label: CellStyle;
  alternate: CellStyle; columnMm: (count: number) => number; minMm: number;
}> = {
  comparison: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 9, lineHeight: 1.13,
      paddingMm: {top: 2.2, right: 1.6, bottom: 2.2, left: 1.6},
      verticalAlign: 'middle', color: '#26394f', borders: edges('#bbcbd9', 0.5) },
    header: { fontWeight: 700, color: '#ffffff', background: '#0c426c',
      verticalAlign: 'middle', paddingMm: {top: 3, bottom: 3} },
    label: { fontWeight: 700, color: '#124365', background: '#eef5fa' },
    alternate: { background: '#f7fafc' },
    columnMm: count => count >= 5 ? 41 : 51, minMm: 17,
  },
  datasheet: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 9.5, lineHeight: 1.17,
      paddingMm: {top: 2.8, right: 2.4, bottom: 2.8, left: 2.4},
      color: '#243546', verticalAlign: 'middle', borders: edges('#cbd8e1', 0.45) },
    header: { fontWeight: 700, color: '#0b3556', background: '#dceaf3',
      paddingMm: {top: 3.4, bottom: 3.4} },
    label: { fontWeight: 700, color: '#133d61', background: '#f1f6f9' },
    alternate: { background: '#f7f9fb' },
    columnMm: count => count <= 3 ? 60 : count >= 5 ? 43 : 51, minMm: 17,
  },
  matrix: {
    base: { fontFamily: 'Noto Sans', fontSizePt: 8, lineHeight: 1.12,
      paddingMm: {top: 1.25, right: 1.1, bottom: 1.25, left: 1.1},
      color: '#253544', verticalAlign: 'middle', borders: edges('#d7dee5', 0.35) },
    header: { fontWeight: 700, color: '#172e41', background: '#e0e7ed',
      paddingMm: {top: 1.8, bottom: 1.8} },
    label: { fontWeight: 700, color: '#213e52', background: '#f0f4f7' },
    alternate: { background: '#f3f6f8' },
    columnMm: count => count >= 5 ? 37 : 43, minMm: 14,
  },
};

/** Preserve the complete, editable grid: presentation changes only. */
export function applyNativeTableDesign(input: TableModel, design: NativeTableDesign): TableModel {
  const variant = NativeTableDesignSchema.parse(design);
  const p = profiles[variant];
  const firstMm = p.columnMm(input.columns.length);
  return {
    ...input,
    style: { ...input.style, base: p.base,
      rowRoles: { ...input.style.rowRoles, header: p.header } },
    columns: input.columns.map((column, index) => ({
      ...column,
      width: index === 0
        ? { mode: 'fixed' as const, mm: firstMm }
        : { mode: 'flex' as const, weight: 1 },
      minMm: index === 0 ? firstMm : p.minMm,
    })),
    rows: input.rows.map((row, index) => ({
      ...row, role: index === 0 ? 'header' as const : 'body' as const,
      ...(index > 0 && index % 2 === 0 ? { style: p.alternate } : {}),
    })),
    cells: input.cells.map(cell => {
      const columnIndex = input.columns.findIndex(column => column.id === cell.columnId);
      const rowIndex = input.rows.findIndex(row => row.id === cell.rowId);
      return {
        ...cell,
        ...(columnIndex === 0 && rowIndex > 0 ? { style: p.label } : {}),
      };
    }),
  };
}
