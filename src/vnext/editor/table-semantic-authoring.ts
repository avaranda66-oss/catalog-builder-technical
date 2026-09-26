import type { Cell, TableModel } from '../domain';
import type { TableAnnotation } from '../domain/editorial-model';
import { orderedAnchors } from '../table';

export const DEFAULT_IMAGE_CELL_WIDTH_U = 200_000;
export const DEFAULT_IMAGE_CELL_HEIGHT_U = 120_000;

export interface TableSemanticIdentity {
  readonly pageId: string;
  readonly objectId: string;
  readonly tableId: string;
}

export type AnnotationTargetProjection =
  | { readonly kind: 'TABLE'; readonly expectedAnnotationIds: readonly string[] }
  | { readonly kind: 'CELL'; readonly cellId: string; readonly expectedAnnotationIds: readonly string[] };

export function annotationTargetForTable(table: TableModel): AnnotationTargetProjection {
  return { kind: 'TABLE', expectedAnnotationIds: [...(table.annotationIds ?? [])] };
}

export function annotationTargetForCell(table: TableModel, cellId: string): AnnotationTargetProjection | undefined {
  const cell = table.cells.find((entry) => entry.id === cellId);
  if (!cell || cell.coveredBy) return undefined;
  return { kind: 'CELL', cellId, expectedAnnotationIds: [...(cell.annotationIds ?? [])] };
}
export interface AnnotationUsage {
  readonly kind: 'TABLE' | 'CELL';
  readonly cellId?: string;
}

export function annotationUsages(table: TableModel, annotationId: string): AnnotationUsage[] {
  const usages: AnnotationUsage[] = [];
  if ((table.annotationIds ?? []).includes(annotationId)) usages.push({ kind: 'TABLE' });
  for (const cell of orderedAnchors(table)) {
    if ((cell.annotationIds ?? []).includes(annotationId)) usages.push({ kind: 'CELL', cellId: cell.id });
  }
  return usages;
}

export function annotationUsageCount(table: TableModel, annotationId: string): number {
  return annotationUsages(table, annotationId).length;
}

export function legendUsageCells(table: TableModel, legendEntryId: string): readonly Cell[] {
  return orderedAnchors(table).filter(
    (cell) => cell.content.type === 'marker' && cell.content.legendEntryId === legendEntryId
  );
}

export function nextLegendUsageCellId(
  table: TableModel,
  legendEntryId: string,
  currentCellId?: string
): string | undefined {
  const usages = legendUsageCells(table, legendEntryId);
  if (usages.length === 0) return undefined;
  const currentIndex = currentCellId ? usages.findIndex((cell) => cell.id === currentCellId) : -1;
  return usages[(currentIndex + 1) % usages.length].id;
}
export function moveId(
  order: readonly string[],
  id: string,
  direction: 'up' | 'down'
): readonly string[] {
  const index = order.indexOf(id);
  if (index < 0) return order;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function annotationLabel(annotation: TableAnnotation): string {
  switch (annotation.kind) {
    case 'caption': return 'Legenda';
    case 'note': return 'Nota';
    case 'footnote': return 'Nota de rodapé';
    default: return 'Nota';
  }
}

export function selectedSingleAnchorCell(
  table: TableModel,
  cellIds: readonly string[]
): Cell | undefined {
  if (cellIds.length !== 1) return undefined;
  const cell = table.cells.find((entry) => entry.id === cellIds[0]);
  return cell && !cell.coveredBy ? cell : undefined;
}
