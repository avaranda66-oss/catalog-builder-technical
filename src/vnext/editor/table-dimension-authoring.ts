import type { ApplicationAction, TableColumnWidthU, TableRowHeightPolicyU } from '../application/contracts';
import { mmToU, type TableModel } from '../domain';
import { resolveColumns } from '../table/table-layout';
import { explicitTableAxisIds, type TableSelection } from './table-selection';

export type DimensionAuthoringErrorCode =
  | 'ROW_SELECTION_REQUIRED'
  | 'COLUMN_SELECTION_REQUIRED'
  | 'MULTI_COLUMN_SELECTION_REQUIRED'
  | 'SINGLE_AXIS_REQUIRED'
  | 'AXIS_BOUNDARY'
  | 'COLUMN_EQUALIZE_INFEASIBLE'
  | 'COLUMN_DRAG_INFEASIBLE'
  | 'ROW_DRAG_INFEASIBLE'
  | 'MEASUREMENT_UNAVAILABLE';

export class TableDimensionAuthoringError extends Error {
  constructor(readonly code: DimensionAuthoringErrorCode, message: string) {
    super(message);
    this.name = 'TableDimensionAuthoringError';
  }
}

export interface TableDimensionIdentity {
  pageId: string;
  objectId: string;
  tableId: string;
}

export type MixedValue<T> = T | 'mixed';

export interface RowDimensionProjection {
  rowIds: readonly string[];
  role: MixedValue<TableModel['rows'][number]['role']>;
  heightMode: MixedValue<TableModel['rows'][number]['heightPolicy']['mode']>;
  valueU?: MixedValue<number>;
}

export interface ColumnDimensionProjection {
  columnIds: readonly string[];
  widthMode: MixedValue<TableModel['columns'][number]['width']['mode']>;
  fixedWidthU?: MixedValue<number>;
  flexWeight?: MixedValue<number>;
  minU: MixedValue<number>;
  maxU: MixedValue<number | undefined>;
}

function common<T>(values: readonly T[]): MixedValue<T> {
  if (values.length === 0) throw new Error('Cannot project an empty selection');
  return values.every((value) => Object.is(value, values[0])) ? values[0] : 'mixed';
}

export function rowHeightPolicyToU(policy: TableModel['rows'][number]['heightPolicy']): TableRowHeightPolicyU {
  if (policy.mode === 'AUTO') return { mode: 'AUTO' };
  if (policy.mode === 'MIN_MM') return { mode: 'MIN_MM', minU: mmToU(policy.minMm) };
  return { mode: 'FIXED_MM', heightU: mmToU(policy.heightMm) };
}

export function columnWidthToU(width: TableModel['columns'][number]['width']): TableColumnWidthU {
  return width.mode === 'fixed'
    ? { mode: 'fixed', widthU: mmToU(width.mm) }
    : { mode: 'flex', weight: width.weight };
}

export function projectRowDimensions(table: TableModel, selection: TableSelection): RowDimensionProjection {
  const rowIds = explicitTableAxisIds(table, selection, 'row');
  if (rowIds.length === 0) {
    throw new TableDimensionAuthoringError('ROW_SELECTION_REQUIRED', 'Selecione uma linha pelo seletor da tabela.');
  }
  const rows = rowIds.map((rowId) => table.rows.find((row) => row.id === rowId)!);
  const policies = rows.map((row) => rowHeightPolicyToU(row.heightPolicy));
  const heightMode = common(policies.map((policy) => policy.mode));
  const values = policies.map((policy) =>
    policy.mode === 'MIN_MM' ? policy.minU : policy.mode === 'FIXED_MM' ? policy.heightU : undefined
  );
  const comparable = values.filter((value): value is number => value !== undefined);
  return {
    rowIds,
    role: common(rows.map((row) => row.role)),
    heightMode,
    ...(comparable.length === rows.length ? { valueU: common(comparable) } : {}),
  };
}

export function projectColumnDimensions(table: TableModel, selection: TableSelection): ColumnDimensionProjection {
  const columnIds = explicitTableAxisIds(table, selection, 'column');
  if (columnIds.length === 0) {
    throw new TableDimensionAuthoringError('COLUMN_SELECTION_REQUIRED', 'Selecione uma coluna pelo seletor da tabela.');
  }
  const columns = columnIds.map((columnId) => table.columns.find((column) => column.id === columnId)!);
  const modes = columns.map((column) => column.width.mode);
  const fixed = columns.flatMap((column) => column.width.mode === 'fixed' ? [mmToU(column.width.mm)] : []);
  const flex = columns.flatMap((column) => column.width.mode === 'flex' ? [column.width.weight] : []);
  return {
    columnIds,
    widthMode: common(modes),
    ...(fixed.length === columns.length ? { fixedWidthU: common(fixed) } : {}),
    ...(flex.length === columns.length ? { flexWeight: common(flex) } : {}),
    minU: common(columns.map((column) => mmToU(column.minMm))),
    maxU: common(columns.map((column) => column.maxMm === undefined ? undefined : mmToU(column.maxMm))),
  };
}

export function prepareRowsSetProperties(
  identity: TableDimensionIdentity,
  table: TableModel,
  selection: TableSelection,
  next: { role?: TableModel['rows'][number]['role']; heightPolicy?: TableRowHeightPolicyU }
): Extract<ApplicationAction, { type: 'table.rows.setProperties' }> {
  const rowIds = explicitTableAxisIds(table, selection, 'row');
  if (rowIds.length === 0) {
    throw new TableDimensionAuthoringError('ROW_SELECTION_REQUIRED', 'Selecione uma linha pelo seletor da tabela.');
  }
  return {
    type: 'table.rows.setProperties',
    ...identity,
    targets: rowIds.map((rowId) => {
      const row = table.rows.find((entry) => entry.id === rowId)!;
      return {
        rowId,
        expected: { role: row.role, heightPolicy: rowHeightPolicyToU(row.heightPolicy) },
        next,
      };
    }),
  };
}

export function prepareColumnsSetProperties(
  identity: TableDimensionIdentity,
  table: TableModel,
  frameWidthU: number,
  selection: TableSelection,
  next: { width?: TableColumnWidthU; minU?: number; maxU?: number | null }
): Extract<ApplicationAction, { type: 'table.columns.setProperties' }> {
  const columnIds = explicitTableAxisIds(table, selection, 'column');
  if (columnIds.length === 0) {
    throw new TableDimensionAuthoringError('COLUMN_SELECTION_REQUIRED', 'Selecione uma coluna pelo seletor da tabela.');
  }
  return prepareColumnsByIds(identity, table, frameWidthU, columnIds, next);
}

function prepareColumnsByIds(
  identity: TableDimensionIdentity,
  table: TableModel,
  frameWidthU: number,
  columnIds: readonly string[],
  next: { width?: TableColumnWidthU; minU?: number; maxU?: number | null }
): Extract<ApplicationAction, { type: 'table.columns.setProperties' }> {
  return {
    type: 'table.columns.setProperties',
    ...identity,
    expectedFrameWidthU: frameWidthU,
    expectedColumnOrder: table.columns.map((column) => column.id),
    targets: columnIds.map((columnId) => {
      const column = table.columns.find((entry) => entry.id === columnId)!;
      return {
        columnId,
        expected: {
          width: columnWidthToU(column.width),
          minU: mmToU(column.minMm),
          ...(column.maxMm === undefined ? {} : { maxU: mmToU(column.maxMm) }),
        },
        next,
      };
    }),
  };
}

export function prepareEqualizeColumns(
  identity: TableDimensionIdentity,
  table: TableModel,
  frameWidthU: number,
  frameWidthMm: number,
  selection: TableSelection
): Extract<ApplicationAction, { type: 'table.columns.setProperties' }> {
  const columnIds = explicitTableAxisIds(table, selection, 'column');
  if (columnIds.length < 2) {
    throw new TableDimensionAuthoringError('MULTI_COLUMN_SELECTION_REQUIRED', 'Selecione pelo menos duas colunas contíguas.');
  }
  const resolved = resolveColumns(table.columns, frameWidthMm);
  if (!resolved.ok) {
    throw new TableDimensionAuthoringError('COLUMN_EQUALIZE_INFEASIBLE', resolved.details);
  }
  const indexes = columnIds.map((id) => table.columns.findIndex((column) => column.id === id));
  const totalU = indexes.reduce((sum, index) => sum + resolved.widthsU[index], 0);
  const baseU = Math.floor(totalU / columnIds.length);
  let remainder = totalU - baseU * columnIds.length;
  const widths = columnIds.map(() => baseU + (remainder-- > 0 ? 1 : 0));
  const targets = columnIds.map((columnId, index) => {
    const column = table.columns.find((entry) => entry.id === columnId)!;
    const widthU = widths[index];
    const minU = mmToU(column.minMm);
    const maxU = column.maxMm === undefined ? undefined : mmToU(column.maxMm);
    if (widthU < minU || (maxU !== undefined && widthU > maxU)) {
      throw new TableDimensionAuthoringError(
        'COLUMN_EQUALIZE_INFEASIBLE',
        'Não é possível igualar estas colunas com os limites atuais.'
      );
    }
    return {
      columnId,
      expected: {
        width: columnWidthToU(column.width),
        minU,
        ...(maxU === undefined ? {} : { maxU }),
      },
      next: { width: { mode: 'fixed' as const, widthU } },
    };
  });
  const candidate = table.columns.map((column) => {
    const target = targets.find((entry) => entry.columnId === column.id);
    return target ? { ...column, width: { mode: 'fixed' as const, mm: target.next.width.widthU / 10_000 } } : column;
  });
  const validation = resolveColumns(candidate, frameWidthMm);
  if (!validation.ok) {
    throw new TableDimensionAuthoringError('COLUMN_EQUALIZE_INFEASIBLE', 'Não é possível igualar estas colunas com os limites atuais.');
  }
  return {
    type: 'table.columns.setProperties',
    ...identity,
    expectedFrameWidthU: frameWidthU,
    expectedColumnOrder: table.columns.map((column) => column.id),
    targets,
  };
}

export function prepareColumnBoundaryDrag(
  identity: TableDimensionIdentity,
  table: TableModel,
  frameWidthU: number,
  frameWidthMm: number,
  leftColumnIndex: number,
  deltaU: number
): Extract<ApplicationAction, { type: 'table.columns.setProperties' }> {
  if (!Number.isSafeInteger(deltaU) || leftColumnIndex < 0 || leftColumnIndex >= table.columns.length - 1) {
    throw new TableDimensionAuthoringError('COLUMN_DRAG_INFEASIBLE', 'Limite de coluna inválido.');
  }
  const resolved = resolveColumns(table.columns, frameWidthMm);
  if (!resolved.ok) throw new TableDimensionAuthoringError('MEASUREMENT_UNAVAILABLE', resolved.details);
  const left = table.columns[leftColumnIndex];
  const right = table.columns[leftColumnIndex + 1];
  const leftU = resolved.widthsU[leftColumnIndex];
  const rightU = resolved.widthsU[leftColumnIndex + 1];
  const leftMin = mmToU(left.minMm);
  const rightMin = mmToU(right.minMm);
  const leftMax = left.maxMm === undefined ? Number.MAX_SAFE_INTEGER : mmToU(left.maxMm);
  const rightMax = right.maxMm === undefined ? Number.MAX_SAFE_INTEGER : mmToU(right.maxMm);
  const minDelta = Math.max(leftMin - leftU, rightU - rightMax);
  const maxDelta = Math.min(leftMax - leftU, rightU - rightMin);
  if (minDelta > maxDelta) {
    throw new TableDimensionAuthoringError('COLUMN_DRAG_INFEASIBLE', 'Não há posição viável para este limite de coluna.');
  }
  const clampedDelta = Math.max(minDelta, Math.min(maxDelta, deltaU));
  const prepared = prepareColumnsByIds(identity, table, frameWidthU, [left.id, right.id], {
    width: { mode: 'fixed', widthU: 1 },
  });
  return {
    ...prepared,
    targets: prepared.targets.map((target, index) => ({
      ...target,
      next: {
        width: {
          mode: 'fixed',
          widthU: index === 0 ? leftU + clampedDelta : rightU - clampedDelta,
        },
      },
    })),
  };
}

export function prepareRowBoundaryDrag(
  identity: TableDimensionIdentity,
  table: TableModel,
  rowId: string,
  resolvedHeightU: number,
  deltaU: number
): Extract<ApplicationAction, { type: 'table.rows.setProperties' }> {
  if (!Number.isSafeInteger(resolvedHeightU) || resolvedHeightU < 1 || !Number.isSafeInteger(deltaU)) {
    throw new TableDimensionAuthoringError('ROW_DRAG_INFEASIBLE', 'Altura medida da linha indisponível.');
  }
  const row = table.rows.find((entry) => entry.id === rowId);
  if (!row) throw new TableDimensionAuthoringError('ROW_DRAG_INFEASIBLE', 'Linha não encontrada.');
  const heightU = Math.max(1, resolvedHeightU + deltaU);
  return {
    type: 'table.rows.setProperties',
    ...identity,
    targets: [{
      rowId,
      expected: { role: row.role, heightPolicy: rowHeightPolicyToU(row.heightPolicy) },
      next: { heightPolicy: { mode: 'FIXED_MM', heightU } },
    }],
  };
}

export function prepareAxisReorder(
  identity: TableDimensionIdentity,
  table: TableModel,
  selection: TableSelection,
  axis: 'row' | 'column',
  direction: -1 | 1
): Extract<ApplicationAction, { type: 'table.axis.reorder' }> {
  const ids = explicitTableAxisIds(table, selection, axis);
  if (ids.length !== 1) {
    throw new TableDimensionAuthoringError('SINGLE_AXIS_REQUIRED', `Selecione uma única ${axis === 'row' ? 'linha' : 'coluna'}.`);
  }
  const order = (axis === 'row' ? table.rows : table.columns).map((item) => item.id);
  const from = order.indexOf(ids[0]);
  const to = from + direction;
  if (to < 0 || to >= order.length) {
    throw new TableDimensionAuthoringError('AXIS_BOUNDARY', 'O eixo selecionado já está no limite.');
  }
  const nextOrder = [...order];
  [nextOrder[from], nextOrder[to]] = [nextOrder[to], nextOrder[from]];
  return {
    type: 'table.axis.reorder',
    ...identity,
    axis,
    expectedOrder: order,
    nextOrder,
    expectedTable: table,
  };
}
