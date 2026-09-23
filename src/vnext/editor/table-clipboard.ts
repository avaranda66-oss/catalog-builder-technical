import { z } from 'zod';
import {
  RichTextSchema,
  type AssetRef,
  type Cell,
  type RichText,
  type TableModel,
} from '../domain/editorial-model';
import { cellIndex, getCellKey } from '../table/table-model';
import {
  normalizeTableSelection,
  selectedTableAnchorIds,
  type TableSelection,
} from './table-selection';
import { serializeTsv } from './table-tsv';

export const TABLE_CLIPBOARD_MIME = 'application/x-presys-catalog-builder-vnext-table+json';
export const TABLE_CLIPBOARD_VERSION = 1 as const;

const ClipboardCellSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('empty') }).strict(),
  z.object({ type: z.literal('richText'), value: RichTextSchema }).strict(),
  z.object({ type: z.literal('technicalCode'), value: z.string() }).strict(),
  z.object({
    type: z.literal('measurement'),
    valueText: z.string(),
    unit: z.string(),
    qualifier: z.enum(['approx', 'min', 'max']).optional(),
  }).strict(),
  z.object({
    type: z.literal('marker'),
    sourceLegendEntryId: z.string().min(1),
    markerCode: z.string().min(1),
    legendText: RichTextSchema,
  }).strict(),
  z.object({ type: z.literal('image'), alt: z.string() }).strict(),
]);

export type TableClipboardCell = z.infer<typeof ClipboardCellSchema>;

export const TableClipboardPayloadSchema = z.object({
  version: z.literal(TABLE_CLIPBOARD_VERSION),
  sourceTableId: z.string().min(1),
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  cells: z.array(ClipboardCellSchema).min(1),
}).strict().superRefine((payload, context) => {
  if (payload.cells.length !== payload.rows * payload.columns) {
    context.addIssue({
      code: 'custom',
      path: ['cells'],
      message: 'Clipboard cell count must match rows × columns',
    });
  }
});

export type TableClipboardPayload = z.infer<typeof TableClipboardPayloadSchema>;

export class TableClipboardError extends Error {
  constructor(
    readonly code:
      | 'COPY_SELECTION_INVALID'
      | 'COPY_MERGE_INTERSECTION'
      | 'MARKER_LEGEND_REFERENCE_DANGLING'
      | 'ASSET_REFERENCE_DANGLING'
      | 'CLIPBOARD_PAYLOAD_INVALID',
    message: string
  ) {
    super(message);
    this.name = 'TableClipboardError';
  }
}
export function flattenRichText(richText: RichText): string {
  return richText.paragraphs.map((paragraph) => paragraph.inlines.map((inline) =>
    inline.kind === 'text' ? inline.text : '\n'
  ).join('')).join('\n');
}

function measurementText(cell: Extract<TableClipboardCell, { type: 'measurement' }>): string {
  const qualifier = cell.qualifier ? { approx: '≈ ', min: '≥ ', max: '≤ ' }[cell.qualifier] : '';
  return `${qualifier}${cell.valueText} ${cell.unit}`;
}

function cellToClipboard(
  cell: Cell,
  table: TableModel,
  assets: readonly AssetRef[]
): { typed: TableClipboardCell; plain: string } {
  switch (cell.content.type) {
    case 'empty':
      return { typed: { type: 'empty' }, plain: '' };
    case 'richText':
      return {
        typed: { type: 'richText', value: cell.content.value },
        plain: flattenRichText(cell.content.value),
      };
    case 'technicalCode':
      return {
        typed: { type: 'technicalCode', value: cell.content.value },
        plain: cell.content.value,
      };
    case 'measurement': {
      const typed: TableClipboardCell = {
        type: 'measurement',
        valueText: cell.content.valueText,
        unit: cell.content.unit,
        ...(cell.content.qualifier ? { qualifier: cell.content.qualifier } : {}),
      };
      return { typed, plain: measurementText(typed as Extract<TableClipboardCell, { type: 'measurement' }>) };
    }
    case 'marker': {
      const legendEntryId = cell.content.legendEntryId;
      const legend = table.legend.find((entry) => entry.id === legendEntryId);
      if (!legend) {
        throw new TableClipboardError(
          'MARKER_LEGEND_REFERENCE_DANGLING',
          `Marker ${cell.id} references missing Legend ${legendEntryId}`
        );
      }
      return {
        typed: {
          type: 'marker',
          sourceLegendEntryId: legend.id,
          markerCode: legend.markerCode,
          legendText: legend.text,
        },
        plain: legend.markerCode,
      };
    }
    case 'image': {
      const assetId = cell.content.assetId;
      const asset = assets.find((entry) => entry.id === assetId);
      if (!asset) {
        throw new TableClipboardError(
          'ASSET_REFERENCE_DANGLING',
          `Image cell ${cell.id} references missing asset ${assetId}`
        );
      }
      return { typed: { type: 'image', alt: asset.alt }, plain: asset.alt };
    }
  }
}

function rectangleCells(
  table: TableModel,
  selection: TableSelection
): Cell[] {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) {
    throw new TableClipboardError('COPY_SELECTION_INVALID', 'Table selection is no longer valid');
  }
  const anchors = selectedTableAnchorIds(table, selection);
  const byId = new Map(table.cells.map((cell) => [cell.id, cell]));
  if (selection.kind === 'cell' && anchors.length === 1) {
    const owner = byId.get(anchors[0]);
    if (!owner) throw new TableClipboardError('COPY_SELECTION_INVALID', 'Selected cell no longer exists');
    if ((owner.span?.rows ?? 1) > 1 || (owner.span?.columns ?? 1) > 1) return [owner];
  }
  const slots = cellIndex(table);
  const cells: Cell[] = [];
  for (let rowIndex = normalized.rowStart; rowIndex <= normalized.rowEnd; rowIndex += 1) {
    for (let columnIndex = normalized.columnStart; columnIndex <= normalized.columnEnd; columnIndex += 1) {
      const cell = slots.get(getCellKey(table.rows[rowIndex].id, table.columns[columnIndex].id));
      if (!cell) throw new TableClipboardError('COPY_SELECTION_INVALID', 'Table grid is incomplete');
      if (cell.coveredBy || (cell.span?.rows ?? 1) > 1 || (cell.span?.columns ?? 1) > 1) {
        throw new TableClipboardError(
          'COPY_MERGE_INTERSECTION',
          'Multi-cell copy cannot intersect merged Table topology'
        );
      }
      cells.push(cell);
    }
  }
  return cells;
}

export interface PreparedTableClipboard {
  payload: TableClipboardPayload;
  typedText: string;
  tsv: string;
}

export function prepareTableClipboard(
  table: TableModel,
  selection: TableSelection,
  assets: readonly AssetRef[]
): PreparedTableClipboard {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) throw new TableClipboardError('COPY_SELECTION_INVALID', 'Table selection is no longer valid');
  const cells = rectangleCells(table, selection);
  const singleMerged = cells.length === 1
    && ((cells[0].span?.rows ?? 1) > 1 || (cells[0].span?.columns ?? 1) > 1);
  const rows = singleMerged ? 1 : normalized.rowEnd - normalized.rowStart + 1;
  const columns = singleMerged ? 1 : normalized.columnEnd - normalized.columnStart + 1;
  const projected = cells.map((cell) => cellToClipboard(cell, table, assets));
  const payload = TableClipboardPayloadSchema.parse({
    version: TABLE_CLIPBOARD_VERSION,
    sourceTableId: table.id,
    rows,
    columns,
    cells: projected.map((entry) => entry.typed),
  });
  const plainMatrix = Array.from({ length: rows }, (_, rowIndex) =>
    projected.slice(rowIndex * columns, (rowIndex + 1) * columns).map((entry) => entry.plain)
  );
  return {
    payload,
    typedText: JSON.stringify(payload),
    tsv: serializeTsv(plainMatrix),
  };
}

export function parseTypedTableClipboard(input: string): TableClipboardPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new TableClipboardError('CLIPBOARD_PAYLOAD_INVALID', 'Typed Table clipboard is not valid JSON');
  }
  const validated = TableClipboardPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw new TableClipboardError(
      'CLIPBOARD_PAYLOAD_INVALID',
      validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    );
  }
  return validated.data;
}
