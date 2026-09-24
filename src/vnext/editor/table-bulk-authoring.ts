import type {
  TableBulkCellContentInput,
  TableBulkContentTarget,
  TableLegendCreateInput,
} from '../application/contracts';
import type { Cell, RichText, TableModel } from '../domain/editorial-model';
import { cellIndex, getCellKey } from '../table/table-model';
import {
  normalizeTableSelection,
  selectedTableAnchorIds,
  tableRangeSelection,
  type TableSelection,
} from './table-selection';
import type { TableClipboardCell, TableClipboardPayload } from './table-clipboard';
import {
  planMarkerReconciliation,
  type MarkerDestinationRef,
  TableMarkerAuthoringError,
} from './table-marker-authoring';

export class TableBulkAuthoringError extends Error {
  constructor(
    readonly code:
      | 'TABLE_PASTE_GEOMETRY_INVALID'
      | 'TABLE_PASTE_MERGE_INTERSECTION'
      | 'TABLE_CELL_CONTENT_UNSUPPORTED'
      | 'LEGEND_MARKER_CODE_CONFLICT'
      | 'LEGEND_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'TableBulkAuthoringError';
  }
}
export interface PreparedTableBulkMutation {
  geometry: {
    rowIds: string[];
    columnIds: string[];
  };
  targets: TableBulkContentTarget[];
  legendCreates?: TableLegendCreateInput[];
  expectedLegend?: TableModel['legend'];
  selectionAfter: TableSelection;
}

interface SourceMatrix {
  rows: number;
  columns: number;
  contentAt(index: number): TableBulkCellContentInput;
  legendCreates?: TableLegendCreateInput[];
  expectedLegend?: TableModel['legend'];
}

function ownerForSelection(table: TableModel, selection: TableSelection): Cell | undefined {
  if (selection.kind !== 'cell') return undefined;
  const ids = selectedTableAnchorIds(table, selection);
  return ids.length === 1 ? table.cells.find((cell) => cell.id === ids[0]) : undefined;
}

function hasSpan(cell: Cell): boolean {
  return (cell.span?.rows ?? 1) > 1 || (cell.span?.columns ?? 1) > 1;
}

function expectedTopology(cell: Cell): TableBulkContentTarget['expectedTopology'] {
  if (hasSpan(cell)) {
    return {
      kind: 'mergedOwner',
      rows: cell.span?.rows ?? 1,
      columns: cell.span?.columns ?? 1,
    };
  }
  return { kind: 'ordinary' };
}

function destinationGeometry(
  table: TableModel,
  selection: TableSelection,
  sourceRows: number,
  sourceColumns: number
): { rowStart: number; columnStart: number; rows: number; columns: number } {
  const normalized = normalizeTableSelection(table, selection);
  if (!normalized) {
    throw new TableBulkAuthoringError('TABLE_PASTE_GEOMETRY_INVALID', 'Table selection is no longer valid');
  }
  const owner = ownerForSelection(table, selection);
  if (owner && hasSpan(owner)) {
    if (sourceRows !== 1 || sourceColumns !== 1) {
      throw new TableBulkAuthoringError(
        'TABLE_PASTE_MERGE_INTERSECTION',
        'A merged semantic cell accepts only a 1×1 content paste'
      );
    }
    return {
      rowStart: table.rows.findIndex((row) => row.id === owner.rowId),
      columnStart: table.columns.findIndex((column) => column.id === owner.columnId),
      rows: 1,
      columns: 1,
    };
  }

  const selectedRows = normalized.rowEnd - normalized.rowStart + 1;
  const selectedColumns = normalized.columnEnd - normalized.columnStart + 1;
  const isSingleCell = selection.kind === 'cell' && selectedRows === 1 && selectedColumns === 1;

  if (isSingleCell && (sourceRows > 1 || sourceColumns > 1)) {
    if (normalized.rowStart + sourceRows > table.rows.length
        || normalized.columnStart + sourceColumns > table.columns.length) {
      throw new TableBulkAuthoringError(
        'TABLE_PASTE_GEOMETRY_INVALID',
        'Pasted matrix does not fit inside the destination Table'
      );
    }
    return {
      rowStart: normalized.rowStart,
      columnStart: normalized.columnStart,
      rows: sourceRows,
      columns: sourceColumns,
    };
  }

  if (sourceRows === 1 && sourceColumns === 1) {
    return {
      rowStart: normalized.rowStart,
      columnStart: normalized.columnStart,
      rows: selectedRows,
      columns: selectedColumns,
    };
  }

  if (sourceRows !== selectedRows || sourceColumns !== selectedColumns) {
    throw new TableBulkAuthoringError(
      'TABLE_PASTE_GEOMETRY_INVALID',
      `Clipboard ${sourceRows}×${sourceColumns} does not match selection ${selectedRows}×${selectedColumns}`
    );
  }
  return {
    rowStart: normalized.rowStart,
    columnStart: normalized.columnStart,
    rows: selectedRows,
    columns: selectedColumns,
  };
}
function destinationCells(
  table: TableModel,
  geometry: { rowStart: number; columnStart: number; rows: number; columns: number }
): { cells: Cell[]; rowIds: string[]; columnIds: string[] } {
  const rowIds = table.rows.slice(geometry.rowStart, geometry.rowStart + geometry.rows).map((row) => row.id);
  const columnIds = table.columns.slice(
    geometry.columnStart,
    geometry.columnStart + geometry.columns
  ).map((column) => column.id);
  if (rowIds.length !== geometry.rows || columnIds.length !== geometry.columns) {
    throw new TableBulkAuthoringError('TABLE_PASTE_GEOMETRY_INVALID', 'Destination geometry is out of bounds');
  }
  const slots = cellIndex(table);
  const cells = rowIds.flatMap((rowId) => columnIds.map((columnId) => {
    const cell = slots.get(getCellKey(rowId, columnId));
    if (!cell) {
      throw new TableBulkAuthoringError('TABLE_PASTE_GEOMETRY_INVALID', 'Destination grid is incomplete');
    }
    return cell;
  }));
  const scalarGeometry = geometry.rows === 1 && geometry.columns === 1;
  if (cells.some((cell) => cell.coveredBy || (!scalarGeometry && hasSpan(cell)))) {
    throw new TableBulkAuthoringError(
      'TABLE_PASTE_MERGE_INTERSECTION',
      'Bulk operation cannot cross merged Table topology'
    );
  }
  if (cells.some((cell) => cell.content.type === 'image')) {
    throw new TableBulkAuthoringError(
      'TABLE_CELL_CONTENT_UNSUPPORTED',
      'Image cells are outside W4.D bulk authoring'
    );
  }
  return { cells, rowIds, columnIds };
}

function sourceIndexFor(
  source: Pick<SourceMatrix, 'rows' | 'columns'>,
  destinationIndex: number
): number {
  return source.rows === 1 && source.columns === 1 ? 0 : destinationIndex;
}
function prepareFromSource(
  table: TableModel,
  selection: TableSelection,
  source: SourceMatrix
): PreparedTableBulkMutation {
  const geometry = destinationGeometry(table, selection, source.rows, source.columns);
  const destination = destinationCells(table, geometry);
  const targets = destination.cells.map((cell, index) => ({
    cellId: cell.id,
    expectedTopology: expectedTopology(cell),
    expectedContent: cell.content,
    content: source.contentAt(sourceIndexFor(source, index)),
  }));
  const firstRow = table.rows[geometry.rowStart];
  const firstColumn = table.columns[geometry.columnStart];
  const lastRow = table.rows[geometry.rowStart + geometry.rows - 1];
  const lastColumn = table.columns[geometry.columnStart + geometry.columns - 1];
  return {
    geometry: { rowIds: destination.rowIds, columnIds: destination.columnIds },
    targets,
    ...(source.legendCreates?.length ? { legendCreates: [...source.legendCreates] } : {}),
    ...(source.expectedLegend ? { expectedLegend: source.expectedLegend } : {}),
    selectionAfter: tableRangeSelection(
      selection.identity,
      { rowId: firstRow.id, columnId: firstColumn.id },
      { rowId: lastRow.id, columnId: lastColumn.id }
    ),
  };
}

function clipboardContent(
  cell: TableClipboardCell,
  markerRef: MarkerDestinationRef | undefined
): TableBulkCellContentInput {
  switch (cell.type) {
    case 'empty':
      return { type: 'empty' };
    case 'richText':
      return { type: 'richTextCopy', value: cell.value };
    case 'technicalCode':
      return { type: 'technicalCode', value: cell.value };
    case 'measurement':
      return {
        type: 'measurement',
        valueText: cell.valueText,
        unit: cell.unit,
        ...(cell.qualifier ? { qualifier: cell.qualifier } : {}),
      };
    case 'marker':
      if (!markerRef) {
        throw new TableBulkAuthoringError('LEGEND_NOT_FOUND', 'Marker reconciliation did not produce a destination Legend');
      }
      return { type: 'marker', legend: markerRef };
    case 'image':
      throw new TableBulkAuthoringError(
        'TABLE_CELL_CONTENT_UNSUPPORTED',
        'Typed Image paste is outside W4.D'
      );
  }
}
export function prepareTypedTablePaste(
  table: TableModel,
  selection: TableSelection,
  payload: TableClipboardPayload
): PreparedTableBulkMutation {
  let markers;
  try {
    markers = planMarkerReconciliation(table, payload);
  } catch (error) {
    if (error instanceof TableMarkerAuthoringError) {
      throw new TableBulkAuthoringError(error.code, error.message);
    }
    throw error;
  }
  return prepareFromSource(table, selection, {
    rows: payload.rows,
    columns: payload.columns,
    contentAt: (index) => clipboardContent(payload.cells[index], markers.refsByCellIndex.get(index)),
    ...(markers.legendCreates.length ? {
      legendCreates: markers.legendCreates.map((entry) => ({
        clientKey: entry.clientKey,
        markerCode: entry.markerCode,
        text: entry.text,
      })),
    } : {}),
    ...(markers.requiresLegendCas ? { expectedLegend: table.legend } : {}),
  });
}

export function prepareExternalTsvPaste(
  table: TableModel,
  selection: TableSelection,
  matrix: readonly (readonly string[])[]
): PreparedTableBulkMutation {
  if (matrix.length === 0 || matrix[0].length === 0) {
    throw new TableBulkAuthoringError('TABLE_PASTE_GEOMETRY_INVALID', 'TSV matrix is empty');
  }
  const width = matrix[0].length;
  if (matrix.some((row) => row.length !== width)) {
    throw new TableBulkAuthoringError('TABLE_PASTE_GEOMETRY_INVALID', 'TSV matrix is not rectangular');
  }
  return prepareFromSource(table, selection, {
    rows: matrix.length,
    columns: width,
    contentAt: (index) => {
      const row = Math.floor(index / width);
      const column = index % width;
      const value = matrix[row][column];
      return value === '' ? { type: 'empty' } : { type: 'richTextPlain', plainText: value };
    },
  });
}
export function prepareBulkClear(
  table: TableModel,
  selection: TableSelection
): PreparedTableBulkMutation {
  return prepareFromSource(table, selection, {
    rows: 1,
    columns: 1,
    contentAt: () => ({ type: 'empty' }),
  });
}

export function prepareExistingMarkerAssignment(
  table: TableModel,
  selection: TableSelection,
  legendEntryId: string
): PreparedTableBulkMutation {
  if (!table.legend.some((entry) => entry.id === legendEntryId)) {
    throw new TableBulkAuthoringError('LEGEND_NOT_FOUND', legendEntryId);
  }
  return prepareFromSource(table, selection, {
    rows: 1,
    columns: 1,
    contentAt: () => ({
      type: 'marker',
      legend: { kind: 'existing', legendEntryId },
    }),
  });
}

function transferRichText(clientKey: string, plainText: string): RichText {
  return {
    paragraphs: plainText.split('\n').map((line, index) => ({
      id: `${clientKey}:p:${index}`,
      inlines: line.length === 0 ? [] : [{
        kind: 'text',
        id: `${clientKey}:t:${index}`,
        text: line,
        marks: [],
      }],
    })),
  };
}

export function prepareNewMarkerAssignment(
  table: TableModel,
  selection: TableSelection,
  markerCode: string,
  plainText: string
): PreparedTableBulkMutation {
  const sameCode = table.legend.filter((entry) => entry.markerCode === markerCode);
  if (sameCode.length > 0) {
    throw new TableBulkAuthoringError(
      'LEGEND_MARKER_CODE_CONFLICT',
      `Legend code ${markerCode} already exists; choose the existing Legend`
    );
  }
  const clientKey = 'new-marker';
  return prepareFromSource(table, selection, {
    rows: 1,
    columns: 1,
    contentAt: () => ({
      type: 'marker',
      legend: { kind: 'created', clientKey },
    }),
    legendCreates: [{
      clientKey,
      markerCode,
      text: transferRichText(clientKey, plainText),
    }],
    expectedLegend: table.legend,
  });
}
