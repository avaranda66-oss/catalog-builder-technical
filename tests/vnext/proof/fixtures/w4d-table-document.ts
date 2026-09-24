import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';

export const W4D_CATALOG_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const W4D_OTHER_CATALOG_ID = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
export const W4D_PAGE_ID = 'w4d-page';
export const W4D_OBJECT_A_ID = 'w4d-table-a-object';
export const W4D_OBJECT_B_ID = 'w4d-table-b-object';
export const W4D_TABLE_A_ID = 'w4d-table-a';
export const W4D_TABLE_B_ID = 'w4d-table-b';
export const W4D_IMAGE_ASSET_ID = 'asset-ta25n';

function makeBaseTable(prefix: string): TableModel {
  const columns = [0, 1, 2, 3].map((i) => ({
    id: `${prefix}-col-${i}`,
    width: { mode: 'fixed' as const, mm: 22 },
    minMm: 12,
  }));
  const rows = [0, 1, 2, 3].map((i) => ({
    id: `${prefix}-row-${i}`,
    role: i === 0 ? 'header' as const : 'body' as const,
    heightPolicy: { mode: 'AUTO' as const },
  }));
  const cells: TableModel['cells'] = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      cells.push({
        id: `${prefix}-cell-${r}-${c}`,
        rowId: rows[r].id,
        columnId: columns[c].id,
        content: { type: 'technicalCode', value: `${prefix.toUpperCase()}-${r}-${c}` },
      });
    }
  }
  return {
    id: prefix === 'a' ? W4D_TABLE_A_ID : W4D_TABLE_B_ID,
    columns,
    rows,
    cells,
    style: {
      base: {
        fontFamily: 'Noto Sans',
        fontSizePt: 8,
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
    legend: [],
  };
}

function sourceTable(): TableModel {
  const table = makeBaseTable('a');
  const at = (r: number, c: number) => table.cells[r * 4 + c];
  at(0, 0).content = { type: 'richText', value: plainRichText('w4d-source-rich', 'Alpha bulk') };
  at(0, 1).content = { type: 'technicalCode', value: 'TC-SRC' };
  at(1, 0).content = { type: 'measurement', valueText: '12.500', unit: 'V', qualifier: 'min' };
  at(1, 1).content = { type: 'marker', legendEntryId: 'w4d-src-star' };
  at(1, 2).content = { type: 'marker', legendEntryId: 'w4d-src-caret' };
  at(1, 3).content = { type: 'marker', legendEntryId: 'w4d-src-hash' };
  at(2, 0).content = { type: 'technicalCode', value: 'MERGED-SRC' };
  at(2, 0).span = { rows: 1, columns: 2 };
  at(2, 1).content = { type: 'empty' };
  at(2, 1).coveredBy = at(2, 0).id;
  at(2, 2).content = { type: 'marker', legendEntryId: 'w4d-src-caret' };
  at(2, 3).content = { type: 'marker', legendEntryId: 'w4d-src-caret' };
  at(3, 0).content = { type: 'marker', legendEntryId: 'w4d-src-bang' };
  at(3, 1).content = { type: 'technicalCode', value: 'KEEP-A-31' };
  at(3, 2).content = { type: 'technicalCode', value: 'KEEP-A-32' };
  at(3, 3).content = { type: 'image', assetId: W4D_IMAGE_ASSET_ID };
  at(3, 3).contentPresentation = {
    wrapPolicy: 'nowrap',
    image: { fit: 'contain', targetWidthMm: 8, targetHeightMm: 8 },
  };
  table.legend = [
    { id: 'w4d-src-star', markerCode: '*', text: plainRichText('w4d-star-text', 'Opcional') },
    { id: 'w4d-src-hash', markerCode: '#', text: plainRichText('w4d-hash-text', 'Requerido') },
    { id: 'w4d-src-caret', markerCode: '^', text: plainRichText('w4d-caret-text', 'Compartilhado') },
    { id: 'w4d-src-bang', markerCode: '!', text: plainRichText('w4d-bang-text', 'Fonte') },
  ];
  return table;
}

function destinationTable(): TableModel {
  const table = makeBaseTable('b');
  const at = (r: number, c: number) => table.cells[r * 4 + c];
  at(0, 0).style = { background: '#fff3cd', paddingMm: { top: 2, right: 3, bottom: 4, left: 5 }, textAlign: 'left', color: '#112233' };
  at(0, 0).contentPresentation = { wrapPolicy: 'wrap' };
  at(0, 1).style = { background: '#eef7ff', fontWeight: 700 };
  at(1, 0).style = { background: '#f7f7f7' };
  at(1, 1).style = { background: '#f0fff4' };
  at(2, 0).annotationIds = ['w4d-note'];
  table.annotations = [{ id: 'w4d-note', kind: 'note', text: plainRichText('w4d-note-text', 'Anotação preservada') }];
  table.legend = [
    { id: 'w4d-dest-hash', markerCode: '#', text: plainRichText('w4d-dest-hash-text', 'Requerido') },
    { id: 'w4d-dest-bang', markerCode: '!', text: plainRichText('w4d-dest-bang-text', 'Destino diferente') },
  ];
  return table;
}

export function createW4DTableDocument(id = W4D_CATALOG_ID, title = 'Catálogo W4.D'): CatalogDocument {
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
      id: id === W4D_CATALOG_ID ? W4D_PAGE_ID : 'w4d-other-page',
      widthMm: 210,
      heightMm: 297,
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: id === W4D_CATALOG_ID ? [
        { id: W4D_OBJECT_A_ID, type: 'table', frame: { xMm: 12, yMm: 32, widthMm: 88, heightMm: 78 }, zIndex: 0, table: sourceTable() },
        { id: W4D_OBJECT_B_ID, type: 'table', frame: { xMm: 108, yMm: 32, widthMm: 88, heightMm: 78 }, zIndex: 1, table: destinationTable() },
      ] : [],
    }],
    assets: [{
      id: W4D_IMAGE_ASSET_ID,
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
