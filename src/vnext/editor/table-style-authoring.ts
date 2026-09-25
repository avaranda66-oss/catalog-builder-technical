import type {
  ApplicationAction,
  CellStylePatch,
  TablePresetId,
} from '../application/contracts';
import { tablePresetPresentationSnapshot } from '../application/table-preset-registry';
import type {
  Border,
  Cell,
  CellStyle,
  DocumentStyle,
  TableModel,
} from '../domain/editorial-model';
import { resolveCellStyle } from '../rendering/style';
import {
  explicitTableAxisIds,
  selectedTableAnchorIds,
  type TableSelection,
  type TableSelectionIdentity,
} from './table-selection';

export type TableStyleScope =
  | { kind: 'table' }
  | { kind: 'role'; role: 'header' | 'body' | 'section' }
  | { kind: 'rows'; rowIds: readonly string[] }
  | { kind: 'columns'; columnIds: readonly string[] }
  | { kind: 'cells'; cellIds: readonly string[] };

export type TableStyleField = keyof CellStyle;
export type ProjectedLocalValue<T> = T | 'mixed' | undefined;

export interface StyleFieldProjection<K extends TableStyleField = TableStyleField> {
  readonly field: K;
  readonly local: ProjectedLocalValue<CellStyle[K]>;
  readonly ownership: 'local' | 'inherited' | 'mixed';
}

export type ResolvedScalarField =
  | 'fontFamily'
  | 'fontSizePt'
  | 'lineHeight'
  | 'fontWeight'
  | 'color'
  | 'background'
  | 'textAlign'
  | 'verticalAlign';

export interface ResolvedStyleFieldProjection<K extends ResolvedScalarField = ResolvedScalarField>
  extends StyleFieldProjection<K> {
  readonly effective: ProjectedLocalValue<ReturnType<typeof resolveCellStyle>[K]>;
}

export interface DeclaredFontOption {
  readonly family: string;
  readonly weights: readonly (400 | 700)[];
}

export type PaddingQuickPreset = 'compact' | 'normal' | 'spacious';
export type BorderQuickPreset =
  | 'none'
  | 'all'
  | 'outer'
  | 'inner'
  | 'horizontal'
  | 'vertical'
  | 'header-separator';

function exactEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function common<T>(values: readonly T[]): T | 'mixed' | undefined {
  if (values.length === 0) return undefined;
  const first = values[0];
  return values.every((value) => exactEquals(value, first)) ? first : 'mixed';
}

function localStyles(table: TableModel, scope: TableStyleScope): readonly (CellStyle | undefined)[] {
  switch (scope.kind) {
    case 'table':
      return [table.style.base];
    case 'role':
      return [table.style.rowRoles[scope.role]];
    case 'rows':
      return scope.rowIds.map((id) => table.rows.find((row) => row.id === id)?.style);
    case 'columns':
      return scope.columnIds.map((id) => table.columns.find((column) => column.id === id)?.style);
    case 'cells':
      return scope.cellIds.map((id) => table.cells.find((cell) => cell.id === id)?.style);
  }
}

export function defaultStyleScopeFromSelection(table: TableModel, selection: TableSelection): TableStyleScope {
  if (selection.kind === 'rows') {
    return { kind: 'rows', rowIds: explicitTableAxisIds(table, selection, 'row') };
  }
  if (selection.kind === 'columns') {
    return { kind: 'columns', columnIds: explicitTableAxisIds(table, selection, 'column') };
  }
  if (selection.kind === 'table') return { kind: 'table' };
  return { kind: 'cells', cellIds: selectedTableAnchorIds(table, selection) };
}

export function projectLocalStyleField<K extends TableStyleField>(
  table: TableModel,
  scope: TableStyleScope,
  field: K
): StyleFieldProjection<K> {
  const values = localStyles(table, scope).map((style) => style?.[field]);
  const local = common(values) as ProjectedLocalValue<CellStyle[K]>;
  return {
    field,
    local,
    ownership: local === 'mixed' ? 'mixed' : local === undefined ? 'inherited' : 'local',
  };
}

function scopeCells(table: TableModel, scope: TableStyleScope): readonly Cell[] {
  const anchors = table.cells.filter((cell) => !cell.coveredBy);
  switch (scope.kind) {
    case 'table':
      return anchors;
    case 'role': {
      const rowIds = new Set(table.rows.filter((row) => row.role === scope.role).map((row) => row.id));
      return anchors.filter((cell) => rowIds.has(cell.rowId));
    }
    case 'rows': {
      const rowIds = new Set(scope.rowIds);
      return anchors.filter((cell) => rowIds.has(cell.rowId));
    }
    case 'columns': {
      const columnIds = new Set(scope.columnIds);
      return anchors.filter((cell) => columnIds.has(cell.columnId));
    }
    case 'cells': {
      const ids = new Set(scope.cellIds);
      return anchors.filter((cell) => ids.has(cell.id));
    }
  }
}

export function projectResolvedStyleField<K extends ResolvedScalarField>(
  documentStyle: DocumentStyle,
  table: TableModel,
  scope: TableStyleScope,
  field: K
): ResolvedStyleFieldProjection<K> {
  const localProjection = projectLocalStyleField(table, scope, field);
  const effectiveValues = scopeCells(table, scope).map((cell) => resolveCellStyle(documentStyle, table, cell)[field]);
  return {
    ...localProjection,
    effective: common(effectiveValues) as ProjectedLocalValue<ReturnType<typeof resolveCellStyle>[K]>,
  };
}

export function declaredFontOptions(style: DocumentStyle): readonly DeclaredFontOption[] {
  const byFamily = new Map<string, Set<400 | 700>>();
  for (const font of style.fonts) {
    if (font.style !== 'normal') continue;
    const weights = byFamily.get(font.family) ?? new Set<400 | 700>();
    weights.add(font.weight);
    byFamily.set(font.family, weights);
  }
  return [...byFamily.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([family, weights]) => ({
      family,
      weights: [...weights].sort((left, right) => left - right),
    }));
}

export function paletteOptions(style: DocumentStyle): readonly string[] {
  return [...new Set(style.palette.map((value) => value.toUpperCase()))];
}

export function paddingQuickPatch(preset: PaddingQuickPreset): CellStylePatch {
  const value = preset === 'compact' ? 0.6 : preset === 'normal' ? 1.2 : 2;
  return { paddingMm: { top: value, right: value, bottom: value, left: value } };
}

export function linkedPaddingPatch(value: number): CellStylePatch {
  return { paddingMm: { top: value, right: value, bottom: value, left: value } };
}

const solid = (thicknessPt: number, color: string): Border => ({ pattern: 'solid', thicknessPt, color });
const none = (): Border => ({ pattern: 'none' });

export function simpleBorderQuickPatch(
  preset: Exclude<BorderQuickPreset, 'outer' | 'inner'>,
  color: string,
  thicknessPt = 0.5
): CellStylePatch {
  const on = solid(thicknessPt, color);
  const off = none();
  if (preset === 'none') {
    return { borders: { top: off, right: off, bottom: off, left: off } };
  }
  if (preset === 'all') {
    return { borders: { top: on, right: on, bottom: on, left: on } };
  }
  if (preset === 'horizontal') {
    return { borders: { top: on, right: off, bottom: on, left: off } };
  }
  if (preset === 'vertical') {
    return { borders: { top: off, right: on, bottom: off, left: on } };
  }
  return { borders: { bottom: solid(Math.max(0.75, thicknessPt), color) } };
}

interface CellExtent {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
}

function extent(table: TableModel, cellId: string): CellExtent {
  const cell = table.cells.find((entry) => entry.id === cellId);
  if (!cell) throw new Error(`Cell ${cellId} not found`);
  const rowStart = table.rows.findIndex((row) => row.id === cell.rowId);
  const columnStart = table.columns.findIndex((column) => column.id === cell.columnId);
  if (rowStart < 0 || columnStart < 0) throw new Error(`Cell ${cellId} has invalid coordinates`);
  return {
    rowStart,
    rowEnd: rowStart + (cell.span?.rows ?? 1) - 1,
    columnStart,
    columnEnd: columnStart + (cell.span?.columns ?? 1) - 1,
  };
}

export function cellBorderPresetPatches(
  table: TableModel,
  cellIds: readonly string[],
  preset: BorderQuickPreset,
  color: string,
  thicknessPt = 0.5
): ReadonlyMap<string, CellStylePatch> {
  if (cellIds.length === 0) return new Map();
  const extents = new Map(cellIds.map((id) => [id, extent(table, id)] as const));
  const all = [...extents.values()];
  const bounds = {
    rowStart: Math.min(...all.map((value) => value.rowStart)),
    rowEnd: Math.max(...all.map((value) => value.rowEnd)),
    columnStart: Math.min(...all.map((value) => value.columnStart)),
    columnEnd: Math.max(...all.map((value) => value.columnEnd)),
  };
  const on = solid(thicknessPt, color);
  const off = none();
  const result = new Map<string, CellStylePatch>();

  for (const [id, value] of extents) {
    let borders: NonNullable<CellStylePatch['borders']>;
    if (preset === 'none') {
      borders = { top: off, right: off, bottom: off, left: off };
    } else if (preset === 'all') {
      borders = { top: on, right: on, bottom: on, left: on };
    } else if (preset === 'outer') {
      borders = {
        top: value.rowStart === bounds.rowStart ? on : off,
        right: value.columnEnd === bounds.columnEnd ? on : off,
        bottom: value.rowEnd === bounds.rowEnd ? on : off,
        left: value.columnStart === bounds.columnStart ? on : off,
      };
    } else if (preset === 'inner') {
      borders = {
        top: value.rowStart > bounds.rowStart ? on : off,
        right: value.columnEnd < bounds.columnEnd ? on : off,
        bottom: value.rowEnd < bounds.rowEnd ? on : off,
        left: value.columnStart > bounds.columnStart ? on : off,
      };
    } else if (preset === 'horizontal') {
      borders = { top: on, right: off, bottom: on, left: off };
    } else if (preset === 'vertical') {
      borders = { top: off, right: on, bottom: off, left: on };
    } else {
      const cell = table.cells.find((entry) => entry.id === id)!;
      const row = table.rows.find((entry) => entry.id === cell.rowId)!;
      borders = row.role === 'header'
        ? { bottom: solid(Math.max(0.75, thicknessPt), color) }
        : { bottom: off };
    }
    result.set(id, { borders });
  }
  return result;
}

export function prepareStyleAction(
  identity: TableSelectionIdentity,
  table: TableModel,
  scope: TableStyleScope,
  patch: CellStylePatch
): ApplicationAction {
  switch (scope.kind) {
    case 'table':
      return {
        type: 'table.style.setBase',
        ...identity,
        expectedBase: table.style.base,
        patch,
      };
    case 'role': {
      const expectedStyle = table.style.rowRoles[scope.role];
      return {
        type: 'table.style.setRowRole',
        ...identity,
        role: scope.role,
        ...(expectedStyle === undefined ? {} : { expectedStyle }),
        patch,
      };
    }
    case 'rows':
      return {
        type: 'table.rows.setStyle',
        ...identity,
        targets: scope.rowIds.map((id) => {
          const style = table.rows.find((row) => row.id === id)?.style;
          return { id, ...(style === undefined ? {} : { expectedStyle: style }) };
        }),
        patch,
      };
    case 'columns':
      return {
        type: 'table.columns.setStyle',
        ...identity,
        targets: scope.columnIds.map((id) => {
          const style = table.columns.find((column) => column.id === id)?.style;
          return { id, ...(style === undefined ? {} : { expectedStyle: style }) };
        }),
        patch,
      };
    case 'cells':
      return {
        type: 'table.cell.setProperties',
        ...identity,
        targets: scope.cellIds.map((cellId) => {
          const cell = table.cells.find((entry) => entry.id === cellId);
          if (!cell) throw new Error(`Cell ${cellId} not found`);
          return {
            cellId,
            ...(cell.style === undefined ? {} : { expectedStyle: cell.style }),
          };
        }),
        patch,
      };
  }
}

export function prepareCellBorderPresetAction(
  identity: TableSelectionIdentity,
  table: TableModel,
  cellIds: readonly string[],
  preset: BorderQuickPreset,
  color: string,
  thicknessPt = 0.5
): ApplicationAction {
  const patches = cellBorderPresetPatches(table, cellIds, preset, color, thicknessPt);
  return {
    type: 'table.cell.setProperties',
    ...identity,
    targets: cellIds.map((cellId) => {
      const cell = table.cells.find((entry) => entry.id === cellId);
      if (!cell) throw new Error(`Cell ${cellId} not found`);
      return {
        cellId,
        ...(cell.style === undefined ? {} : { expectedStyle: cell.style }),
        patch: patches.get(cellId)!,
      };
    }),
  };
}

export function prepareAnnotationGapAction(
  identity: TableSelectionIdentity,
  table: TableModel,
  annotationGapMm: number
): ApplicationAction {
  return {
    type: 'table.style.setBase',
    ...identity,
    expectedBase: table.style.base,
    expectedAnnotationGapMm: table.style.annotationGapMm,
    annotationGapMm,
  };
}

export function prepareTablePresetAction(
  identity: TableSelectionIdentity,
  table: TableModel,
  presetId: TablePresetId
): ApplicationAction {
  return {
    type: 'table.preset.apply',
    ...identity,
    presetId,
    expectedPresentation: tablePresetPresentationSnapshot(table),
  };
}

export function inheritedLabel(scope: TableStyleScope): string {
  switch (scope.kind) {
    case 'table': return 'Herdado do documento';
    case 'role': return 'Herdado da tabela';
    case 'columns': return 'Herdado do tipo de linha/tabela';
    case 'rows': return 'Herdado da coluna/tipo de linha';
    case 'cells': return 'Herdado da linha/coluna/tipo';
  }
}
