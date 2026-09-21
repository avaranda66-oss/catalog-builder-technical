import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';

export const W4A_CATALOG_ID = '44444444-4444-4444-8444-444444444444';
export const W4A_OTHER_CATALOG_ID = '55555555-5555-4555-8555-555555555555';
export const W4A_PAGE_ID = 'w4a-page';
export const W4A_OBJECT_ID = 'w4a-table-object';
export const W4A_TABLE_ID = 'w4a-table';
export const W4A_SINGLE_OBJECT_ID = 'w4a-single-table-object';

function tableFixture(): TableModel {
  const columns = [
    { id: 'w4a-column-a', width: { mode: 'fixed' as const, mm: 32 }, minMm: 10 },
    { id: 'w4a-column-b', width: { mode: 'flex' as const, weight: 1 }, minMm: 18 },
    { id: 'w4a-column-c', width: { mode: 'flex' as const, weight: 2 }, minMm: 18 },
  ];
  const rows = [
    { id: 'w4a-row-header', role: 'header' as const, heightPolicy: { mode: 'FIXED_MM' as const, heightMm: 12 } },
    { id: 'w4a-row-min', role: 'body' as const, heightPolicy: { mode: 'MIN_MM' as const, minMm: 14 } },
    { id: 'w4a-row-auto', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const coveredBy = 'w4a-cell-1-1';
  const cells = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => ({
    id: `w4a-cell-${rowIndex}-${columnIndex}`,
    rowId: row.id,
    columnId: column.id,
    content: rowIndex === 1 && columnIndex === 1
      ? { type: 'technicalCode' as const, value: 'SPAN 2 × 2' }
      : { type: 'technicalCode' as const, value: `R${rowIndex + 1} C${columnIndex + 1}` },
    ...(rowIndex === 1 && columnIndex === 1 ? { span: { rows: 2, columns: 2 } } : {}),
    ...(rowIndex >= 1 && columnIndex >= 1 && !(rowIndex === 1 && columnIndex === 1)
      ? { content: { type: 'empty' as const }, coveredBy }
      : {}),
  })));
  return {
    id: W4A_TABLE_ID,
    columns,
    rows,
    cells,
    style: {
      base: {
        fontFamily: 'Noto Sans',
        fontSizePt: 9,
        lineHeight: 1.2,
        color: '#172033',
        paddingMm: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
        borders: {
          top: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          right: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          bottom: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          left: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
        },
      },
      rowRoles: { header: { background: '#dcecff', fontWeight: 700 } },
      annotation: { fontSizePt: 8, color: '#33445a' },
      annotationGapMm: 2,
    },
    annotationIds: ['w4a-caption'],
    annotations: [{ id: 'w4a-caption', kind: 'caption', text: plainRichText('w4a-caption-text', 'Tabela de prova W4.A') }],
    legend: [],
  };
}

export function createW4ATableDocument(id = W4A_CATALOG_ID, title = 'Catálogo W4.A'): CatalogDocument {
  const singleTable: TableModel = {
    ...tableFixture(),
    id: 'w4a-single-table',
    columns: [{ id: 'w4a-single-column', width: { mode: 'flex', weight: 1 }, minMm: 1 }],
    rows: [{ id: 'w4a-single-row', role: 'body', heightPolicy: { mode: 'AUTO' } }],
    cells: [{ id: 'w4a-single-cell', rowId: 'w4a-single-row', columnId: 'w4a-single-column', content: { type: 'empty' } }],
    annotationIds: [],
    annotations: [],
  };
  return {
    schemaVersion: 1,
    id,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033', '#003366', '#dcecff'],
    },
    pages: [{
      id: id === W4A_CATALOG_ID ? W4A_PAGE_ID : 'w4a-other-page',
      widthMm: 210,
      heightMm: 297,
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: id === W4A_CATALOG_ID ? [
        {
          id: W4A_OBJECT_ID,
          type: 'table',
          frame: { xMm: 32, yMm: 48, widthMm: 120, heightMm: 58 },
          zIndex: 0,
          table: tableFixture(),
        },
        {
          id: W4A_SINGLE_OBJECT_ID,
          type: 'table',
          frame: { xMm: 32, yMm: 124, widthMm: 72, heightMm: 20 },
          zIndex: 1,
          table: singleTable,
        },
      ] : [],
    }],
    assets: [],
  };
}
