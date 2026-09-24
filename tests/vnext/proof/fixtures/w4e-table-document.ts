import { plainRichText, type CatalogDocument, type RichText, type TableModel, type TableObject } from '@/vnext/domain';
import { createW4DTableDocument, W4D_OBJECT_A_ID, W4D_OBJECT_B_ID } from './w4d-table-document';

export const W4E_CATALOG_ID = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
export const W4E_DIAGNOSTIC_CATALOG_ID = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee';
export const W4E_PAGE_BOUND_CATALOG_ID = 'eeeeeeee-3333-4333-8333-eeeeeeeeeeee';
export const W4E_PAGE_ID = 'w4e-page';
export const W4E_DIAGNOSTIC_PAGE_ID = 'w4e-diagnostic-page';
export const W4E_PAGE_BOUND_PAGE_ID = 'w4e-page-bound-page';
export const W4E_FIT_OBJECT_ID = 'w4e-fit-table-object';
export const W4E_FIT_TABLE_ID = 'w4e-fit-table';
export const W4E_INTERNAL_OBJECT_ID = 'w4e-internal-table-object';
export const W4E_INTERNAL_TABLE_ID = 'w4e-internal-table';
export const W4E_PAGE_BOUND_OBJECT_ID = 'w4e-page-bound-table-object';
export const W4E_PAGE_BOUND_TABLE_ID = 'w4e-page-bound-table';

function sourceTable(objectId = W4D_OBJECT_B_ID): TableObject {
  const source = createW4DTableDocument().pages[0].objects
    .find((object) => object.id === objectId);
  if (!source || source.type !== 'table') throw new Error('Missing W4.D source Table');
  return structuredClone(source);
}

function withTableId(table: TableModel, id: string): TableModel {
  return { ...table, id };
}

function multiParagraph(prefix: string, lines: readonly string[]): RichText {
  return {
    paragraphs: lines.map((line, index) => ({
      id: `${prefix}:p:${index}`,
      inlines: [{ kind: 'text' as const, id: `${prefix}:t:${index}`, text: line, marks: [] }],
    })),
  };
}

function fitTable(): TableObject {
  const source = sourceTable();
  return {
    ...source,
    id: W4E_FIT_OBJECT_ID,
    frame: { xMm: 18, yMm: 28, widthMm: 88, heightMm: 8 },
    zIndex: 0,
    table: withTableId(source.table, W4E_FIT_TABLE_ID),
  };
}

function internalOverflowTable(): TableObject {
  const source = sourceTable();
  const table = withTableId(source.table, W4E_INTERNAL_TABLE_ID);
  table.rows[0] = {
    ...table.rows[0],
    heightPolicy: { mode: 'FIXED_MM', heightMm: 3 },
  };
  const verticalCell = table.cells.find((cell) => cell.rowId === table.rows[0].id && cell.columnId === table.columns[0].id);
  if (!verticalCell) throw new Error('Missing vertical overflow cell');
  verticalCell.content = {
    type: 'richText',
    value: multiParagraph('w4e-fixed-overflow', ['Linha 1', 'Linha 2', 'Linha 3', 'Linha 4']),
  };
  const horizontalCell = table.cells.find((cell) => cell.rowId === table.rows[1].id && cell.columnId === table.columns[0].id);
  if (!horizontalCell) throw new Error('Missing horizontal overflow cell');
  horizontalCell.content = {
    type: 'technicalCode',
    value: 'CODIGO-TECNICO-EXTREMAMENTE-LONGO-SEM-QUEBRA-1234567890',
  };
  horizontalCell.contentPresentation = { wrapPolicy: 'nowrap' };
  return {
    ...source,
    id: W4E_INTERNAL_OBJECT_ID,
    frame: { xMm: 12, yMm: 20, widthMm: 88, heightMm: 95 },
    zIndex: 0,
    table,
  };
}

function pageBoundTable(): TableObject {
  const source = sourceTable(W4D_OBJECT_A_ID);
  const table = withTableId(source.table, W4E_PAGE_BOUND_TABLE_ID);
  table.cells[0] = {
    ...table.cells[0],
    content: { type: 'richText', value: plainRichText('w4e-page-bound', 'Conteúdo que exige ajuste de altura') },
  };
  const imageCell = table.cells.find((cell) => cell.content.type === 'image');
  if (imageCell) {
    imageCell.content = { type: 'technicalCode', value: 'W4E-PAGE-BOUND' };
    delete imageCell.contentPresentation;
  }
  return {
    ...source,
    id: W4E_PAGE_BOUND_OBJECT_ID,
    frame: { xMm: 112, yMm: 284, widthMm: 88, heightMm: 4 },
    zIndex: 1,
    table,
  };
}

function baseDocument(id: string, title: string): CatalogDocument {
  const base = createW4DTableDocument(id, title);
  const pageId = id === W4E_CATALOG_ID
    ? W4E_PAGE_ID
    : id === W4E_DIAGNOSTIC_CATALOG_ID
      ? W4E_DIAGNOSTIC_PAGE_ID
      : W4E_PAGE_BOUND_PAGE_ID;
  const objects = id === W4E_CATALOG_ID
    ? [fitTable()]
    : id === W4E_DIAGNOSTIC_CATALOG_ID
      ? [internalOverflowTable()]
      : [pageBoundTable()];
  return {
    ...base,
    id,
    title,
    pages: [{
      ...base.pages[0],
      id: pageId,
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects,
    }],
  };
}

export function createW4EPrimaryDocument(): CatalogDocument {
  return baseDocument(W4E_CATALOG_ID, 'Catálogo W4.E Fit Height');
}

export function createW4EDiagnosticDocument(): CatalogDocument {
  return baseDocument(W4E_DIAGNOSTIC_CATALOG_ID, 'Catálogo W4.E Diagnósticos');
}

export function createW4EPageBoundDocument(): CatalogDocument {
  return baseDocument(W4E_PAGE_BOUND_CATALOG_ID, 'Catálogo W4.E Limite de Página');
}
