import { plainRichText, type CatalogDocument, type TableModel } from '@/vnext/domain';
import { mergeCells } from '@/vnext/table';

export const W4F1_CATALOG_ID = 'f1111111-1111-4111-8111-111111111111';
export const W4F1_OTHER_CATALOG_ID = 'f2222222-2222-4222-8222-222222222222';
export const W4F1_PAGE_ID = 'w4f1-page';
export const W4F1_OBJECT_ID = 'w4f1-table-object';
export const W4F1_TABLE_ID = 'w4f1-table';
export const W4F1_MERGED_OBJECT_ID = 'w4f1-merged-object';
export const W4F1_MERGED_TABLE_ID = 'w4f1-merged-table';

function mainTable(): TableModel {
  const columns = [
    { id: 'w4f1-column-a', width: { mode: 'fixed' as const, mm: 36 }, minMm: 20, maxMm: 60 },
    { id: 'w4f1-column-b', width: { mode: 'flex' as const, weight: 1 }, minMm: 20, maxMm: 80 },
    { id: 'w4f1-column-c', width: { mode: 'flex' as const, weight: 2 }, minMm: 20, maxMm: 80 },
    { id: 'w4f1-column-d', width: { mode: 'fixed' as const, mm: 24 }, minMm: 18, maxMm: 40 },
  ];
  const rows = [
    { id: 'w4f1-row-header', role: 'header' as const, heightPolicy: { mode: 'FIXED_MM' as const, heightMm: 10 } },
    { id: 'w4f1-row-auto', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'w4f1-row-min', role: 'body' as const, heightPolicy: { mode: 'MIN_MM' as const, minMm: 12 } },
    { id: 'w4f1-row-section', role: 'section' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const values = [
    ['Parâmetro', 'Descrição', 'Faixa', 'Unidade'],
    ['Modelo', 'Descrição técnica longa para comprovar que estreitar uma coluna aumenta o fluxo de texto sem alterar automaticamente o quadro da tabela.', 'TA-25N', '—'],
    ['Faixa', 'Medição industrial de alta precisão', '-25 a 140', '°C'],
    ['Seção', 'Características ambientais', 'IP54', '—'],
  ];
  const cells = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => ({
    id: `w4f1-cell-${rowIndex}-${columnIndex}`,
    rowId: row.id,
    columnId: column.id,
    content: { type: 'richText' as const, value: plainRichText(`w4f1-rich-${rowIndex}-${columnIndex}`, values[rowIndex][columnIndex]) },
  })));
  return {
    id: W4F1_TABLE_ID,
    columns,
    rows,
    cells,
    style: {
      base: {
        fontFamily: 'Noto Sans',
        fontSizePt: 8.5,
        lineHeight: 1.2,
        color: '#172033',
        paddingMm: { top: 1.2, right: 1.2, bottom: 1.2, left: 1.2 },
        borders: {
          top: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          right: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          bottom: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
          left: { pattern: 'solid', thicknessPt: 0.75, color: '#003366' },
        },
      },
      rowRoles: {
        header: { background: '#dcecff', fontWeight: 700 },
        section: { background: '#eef4f8', fontWeight: 700 },
      },
      annotation: { fontSizePt: 8, color: '#33445a' },
      annotationGapMm: 1,
    },
    annotations: [],
    legend: [],
  };
}

function mergedTable(): TableModel {
  const columns = [
    { id: 'w4f1-merged-column-a', width: { mode: 'flex' as const, weight: 1 }, minMm: 10 },
    { id: 'w4f1-merged-column-b', width: { mode: 'flex' as const, weight: 1 }, minMm: 10 },
  ];
  const rows = [
    { id: 'w4f1-merged-row-a', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'w4f1-merged-row-b', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
    { id: 'w4f1-merged-row-c', role: 'body' as const, heightPolicy: { mode: 'AUTO' as const } },
  ];
  const table: TableModel = {
    id: W4F1_MERGED_TABLE_ID,
    columns,
    rows,
    cells: rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => ({
      id: `w4f1-merged-cell-${rowIndex}-${columnIndex}`,
      rowId: row.id,
      columnId: column.id,
      content: { type: 'empty' as const },
    }))),
    style: {
      base: { paddingMm: { top: 1, right: 1, bottom: 1, left: 1 } },
      rowRoles: {},
      annotation: {},
      annotationGapMm: 1,
    },
    annotations: [],
    legend: [],
  };
  return mergeCells(table, 'w4f1-merged-cell-0-0', 2, 1);
}

export function createW4F1Document(id = W4F1_CATALOG_ID, title = 'Catálogo W4.F.1'): CatalogDocument {
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
      },
      palette: ['#172033', '#003366', '#dcecff', '#FFFFFF'],
    },
    pages: [{
      id: id === W4F1_CATALOG_ID ? W4F1_PAGE_ID : 'w4f1-other-page',
      widthMm: 210,
      heightMm: 297,
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: id === W4F1_CATALOG_ID ? [
        {
          id: W4F1_OBJECT_ID,
          type: 'table',
          frame: { xMm: 24, yMm: 30, widthMm: 140, heightMm: 64 },
          zIndex: 0,
          table: mainTable(),
        },
        {
          id: W4F1_MERGED_OBJECT_ID,
          type: 'table',
          frame: { xMm: 24, yMm: 120, widthMm: 100, heightMm: 38 },
          zIndex: 1,
          table: mergedTable(),
        },
      ] : [],
    }],
    assets: [],
  };
}
