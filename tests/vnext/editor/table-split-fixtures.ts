import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { mmToU, plainRichText, uToQ, type CatalogDocument, type TableModel, type TableObject } from '@/vnext/domain';
import type { FitHeightMeasurement } from '@/vnext/editor/table-fit-height-authoring';
import type { LayoutSnapshot, PhysicalLayoutFact, TablePlan } from '@/vnext/rendering';

/** Shared by the FR-35 tests: long PRESYS-like tables (codes and ranges) and the measurement the editor would make. */

export const SPLIT_PAGE_ID = 'split-page';
export const SPLIT_NEXT_PAGE_ID = 'split-next-page';
export const SPLIT_OBJECT_ID = 'split-table';
export const SPLIT_TABLE_ID = 'split-table-model';

export interface LongTableOptions {
  readonly bodyRows: number;
  readonly title?: string;
  /** Rows with a fixed height, so the measurement below is the exact printed height. */
  readonly rowHeightMm?: number;
}

export function longTable({ bodyRows, title }: LongTableOptions): TableModel {
  const base = createMinimalW2CTable();
  const columns = ['Código', 'Faixa', 'Saída'];
  const rows = [
    { id: `${SPLIT_TABLE_ID}-row-h`, role: 'header' as const, heightPolicy: { mode: 'AUTO' as const } },
    ...Array.from({ length: bodyRows }, (_, index) => ({
      id: `${SPLIT_TABLE_ID}-row-${index + 1}`, role: 'body' as const, heightPolicy: { mode: 'AUTO' as const },
    })),
  ];
  return {
    ...base,
    id: SPLIT_TABLE_ID,
    ...(title ? { title: plainRichText(`${SPLIT_TABLE_ID}-title`, title) } : {}),
    columns: columns.map((_, index) => ({ id: `${SPLIT_TABLE_ID}-col-${index}`, width: { mode: 'flex' as const, weight: 1 }, minMm: 10 })),
    rows,
    cells: rows.flatMap((row, rowIndex) => columns.map((name, columnIndex) => {
      const id = `${SPLIT_TABLE_ID}-cell-${rowIndex}-${columnIndex}`;
      const text = rowIndex === 0 ? name : columnIndex === 0 ? `TA-${100 + rowIndex}` : columnIndex === 1 ? `${rowIndex * 10} a ${rowIndex * 10 + 50} °C` : '4 a 20 mA';
      return { id, rowId: row.id, columnId: `${SPLIT_TABLE_ID}-col-${columnIndex}`, content: { type: 'richText' as const, value: plainRichText(`${id}-text`, text) } };
    })),
  };
}

export function documentWithTable(table: TableModel, frame = { xMm: 20, yMm: 20, widthMm: 170, heightMm: 120 }, options: { locked?: boolean } = {}): CatalogDocument {
  let next = 0;
  const base = createW2CDemoDocument(() => `split-doc-${++next}`);
  const page = base.pages[0];
  const object: TableObject = {
    id: SPLIT_OBJECT_ID, type: 'table', frame, zIndex: 1, table,
    ...(options.locked ? { locked: true } : {}),
  };
  return {
    ...base,
    pages: [
      { ...page, id: SPLIT_PAGE_ID, objects: [object] },
      { ...page, id: SPLIT_NEXT_PAGE_ID, objects: [] },
    ],
  };
}

export interface MeasureOptions {
  readonly rowHeightMm?: number | ((rowId: string, index: number) => number);
  /** Height above the grid (title and captions). */
  readonly titleMm?: number;
  /** Height under the grid (notes and legend). */
  readonly footerMm?: number;
  readonly unstable?: boolean;
  readonly objectId?: string;
  readonly pageId?: string;
}

/** The facts EditorDiagnosticsProbe would capture for the table: one per row, the table and its title. */
export function measureTable(document: CatalogDocument, options: MeasureOptions = {}): FitHeightMeasurement {
  const pageId = options.pageId ?? SPLIT_PAGE_ID;
  const objectId = options.objectId ?? SPLIT_OBJECT_ID;
  const page = document.pages.find((entry) => entry.id === pageId)!;
  const object = page.objects.find((entry) => entry.id === objectId) as TableObject;
  const table = object.table;
  const height = (rowId: string, index: number) => typeof options.rowHeightMm === 'function'
    ? options.rowHeightMm(rowId, index) : options.rowHeightMm ?? 8;
  const rowsU = table.rows.map((row, index) => mmToU(height(row.id, index)));
  const boundaries = rowsU.reduce<number[]>((all, value) => [...all, all[all.length - 1] + value], [0]).map(uToQ);
  const rowQ = rowsU.map((_, index) => boundaries[index + 1] - boundaries[index]);
  const titleQ = uToQ(mmToU(options.titleMm ?? 0));
  const footerQ = uToQ(mmToU(options.footerMm ?? 0));
  const facts: PhysicalLayoutFact[] = [
    {
      kind: 'table', pageId, objectId, tableId: table.id, frameWidthU: mmToU(object.frame.widthMm), columnWidthsU: [],
      frameQ: uToQ(mmToU(object.frame.widthMm)), trackQ: [], gridOffsetYQ: titleQ,
      renderedIntrinsicHeightQ: titleQ + boundaries[boundaries.length - 1] + footerQ,
    },
    ...table.rows.map((row, index): PhysicalLayoutFact => ({
      kind: 'row', pageId, tableId: table.id, rowId: row.id, resolvedHeightU: rowsU[index], yQ: boundaries[index], heightQ: rowQ[index],
    })),
    ...(table.title ? [{
      kind: 'tableTitle' as const, pageId, tableId: table.id, intrinsicContentHeightQ: titleQ, xQ: 0, yQ: 0, widthQ: 100, heightQ: Math.max(0, titleQ - uToQ(mmToU(1))),
    }] : []),
  ];
  const snapshot: LayoutSnapshot = {
    facts,
    geometryDiagnostics: options.unstable ? [{ code: 'RENDER_GEOMETRY_MISMATCH', severity: 'ERROR', details: 'mismatch', pageId }] : [],
  };
  const plan = { annotationStyle: { fontSizePt: 8, lineHeight: 1.2 } } as unknown as TablePlan;
  return { source: document, plans: new Map([[table.id, plan]]), snapshot, diagnostics: [] };
}

export function tableOn(document: CatalogDocument, pageId: string): TableObject | undefined {
  return document.pages.find((page) => page.id === pageId)?.objects.find((object): object is TableObject => object.type === 'table');
}

export function richPlain(rich: { paragraphs: readonly { inlines: readonly { kind: string; text?: string }[] }[] } | undefined): string {
  return rich?.paragraphs.map((paragraph) => paragraph.inlines.map((inline) => inline.text ?? '\n').join('')).join('\n') ?? '';
}

export function cellText(table: TableModel, rowId: string, columnIndex = 0): string {
  const cell = table.cells.find((entry) => entry.rowId === rowId && entry.columnId === table.columns[columnIndex].id);
  return cell?.content.type === 'richText' ? richPlain(cell.content.value) : '';
}
