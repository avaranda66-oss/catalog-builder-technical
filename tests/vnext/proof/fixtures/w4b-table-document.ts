import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';

export const W4B_CATALOG_ID = '66666666-6666-4666-8666-666666666666';
export const W4B_OTHER_CATALOG_ID = '77777777-7777-4777-8777-777777777777';
export const W4B_PAGE_ID = 'w4b-page';
export const W4B_OBJECT_ID = 'w4b-table-object';
export const W4B_TABLE_ID = 'w4b-table';
export const W4B_IMAGE_ASSET_ID = 'asset-ta25n';

function tableFixture(): TableModel {
  const columns = [
    { id: 'w4b-col-a', width: { mode: 'fixed' as const, mm: 35 }, minMm: 12 },
    { id: 'w4b-col-b', width: { mode: 'flex' as const, weight: 1 }, minMm: 20 },
    { id: 'w4b-col-c', width: { mode: 'flex' as const, weight: 1 }, minMm: 20 },
  ];
  const rows = [
    { id: 'w4b-row-0', role: 'header' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'w4b-row-1', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'w4b-row-2', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const cells: TableModel['cells'] = [
    {
      id: 'w4b-rich', rowId: rows[0].id, columnId: columns[0].id,
      content: { type: 'richText', value: plainRichText('w4b-rich-content', 'Texto inicial') },
    },
    {
      id: 'w4b-code', rowId: rows[0].id, columnId: columns[1].id,
      content: { type: 'technicalCode', value: 'TC-001' },
    },
    {
      id: 'w4b-measure', rowId: rows[0].id, columnId: columns[2].id,
      content: { type: 'measurement', valueText: '0.010', unit: 'V', qualifier: 'min' },
    },
    {
      id: 'w4b-marker', rowId: rows[1].id, columnId: columns[0].id,
      content: { type: 'marker', legendEntryId: 'w4b-legend' },
    },
    {
      id: 'w4b-image', rowId: rows[1].id, columnId: columns[1].id,
      content: { type: 'image', assetId: W4B_IMAGE_ASSET_ID },
      contentPresentation: {
        wrapPolicy: 'nowrap',
        image: { fit: 'contain', targetWidthMm: 8, targetHeightMm: 8 },
      },
    },
    {
      id: 'w4b-plain', rowId: rows[1].id, columnId: columns[2].id,
      content: { type: 'technicalCode', value: 'PLAIN' },
    },
    {
      id: 'w4b-merged', rowId: rows[2].id, columnId: columns[0].id,
      content: { type: 'technicalCode', value: 'MERGED' },
      span: { rows: 1, columns: 2 },
    },
    {
      id: 'w4b-covered', rowId: rows[2].id, columnId: columns[1].id,
      content: { type: 'empty' },
      coveredBy: 'w4b-merged',
    },
    {
      id: 'w4b-inherited', rowId: rows[2].id, columnId: columns[2].id,
      content: { type: 'empty' },
    },
  ];
  return {
    id: W4B_TABLE_ID,
    columns,
    rows,
    cells,
    style: {
      base: {
        fontFamily: 'Noto Sans',
        fontSizePt: 9,
        lineHeight: 1.2,
        color: '#172033',
        textAlign: 'left',
        paddingMm: { top: 1, right: 1, bottom: 1, left: 1 },
        borders: {
          top: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          right: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          bottom: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          left: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
        },
      },
      rowRoles: { header: { background: '#dcecff', fontWeight: 700 } },
      annotation: { fontSizePt: 8, color: '#33445a' },
      annotationGapMm: 1,
    },
    annotations: [],
    legend: [{
      id: 'w4b-legend',
      markerCode: '*',
      text: plainRichText('w4b-legend-text', 'Legenda preservada'),
    }],
  };
}

export function createW4BTableDocument(id = W4B_CATALOG_ID, title = 'Catálogo W4.B'): CatalogDocument {
  return {
    schemaVersion: 1,
    id,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [
        { family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' },
        { family: 'Noto Sans', revision: '5.3.0', weight: 700, style: 'normal' },
      ],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
        textAlign: 'left',
      },
      palette: ['#172033', '#003366', '#dcecff', '#fff3cd'],
    },
    pages: [{
      id: id === W4B_CATALOG_ID ? W4B_PAGE_ID : 'w4b-other-page',
      widthMm: 210,
      heightMm: 297,
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: id === W4B_CATALOG_ID ? [{
        id: W4B_OBJECT_ID,
        type: 'table',
        frame: { xMm: 28, yMm: 42, widthMm: 140, heightMm: 72 },
        zIndex: 0,
        table: tableFixture(),
      }] : [],
    }],
    assets: [{
      id: W4B_IMAGE_ASSET_ID,
      version: 'repo-616332d',
      sha256: '9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067',
      mime: 'image/jpeg',
      widthPx: 545,
      heightPx: 767,
      name: 'TA-25N repository photograph',
      alt: 'Fotografia de um calibrador PRESYS TA-25N',
    }],
  };
}
