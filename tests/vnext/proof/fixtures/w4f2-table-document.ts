import type { CatalogDocument } from '@/vnext/domain';
import { createW4F1Document, W4F1_MERGED_OBJECT_ID, W4F1_OBJECT_ID } from './w4f1-table-document';

export const W4F2_CATALOG_ID = 'f3333333-3333-4333-8333-333333333333';
export const W4F2_OTHER_CATALOG_ID = 'f4444444-4444-4444-8444-444444444444';
export const W4F2_PAGE_ID = 'w4f2-page';
export const W4F2_OBJECT_ID = W4F1_OBJECT_ID;
export const W4F2_MERGED_OBJECT_ID = W4F1_MERGED_OBJECT_ID;

export function createW4F2Document(
  id = W4F2_CATALOG_ID,
  title = 'Catálogo W4.F.2'
): CatalogDocument {
  const document = createW4F1Document();
  document.id = id;
  document.title = title;
  document.pages[0].id = id === W4F2_CATALOG_ID ? W4F2_PAGE_ID : 'w4f2-other-page';
  document.style.fonts = [
    ...document.style.fonts,
    { family: 'Noto Sans JP', revision: '5.3.0', weight: 400, style: 'normal' },
  ];
  document.style.palette = ['#172033', '#003366', '#DCECFF', '#FFFFFF'];
  if (id !== W4F2_CATALOG_ID) {
    document.pages[0].objects = [];
    return document;
  }
  const table = document.pages[0].objects.find((object) => object.id === W4F2_OBJECT_ID);
  if (table?.type === 'table') {
    table.frame.heightMm = 72;
    table.table.rows[0].heightPolicy = { mode: 'FIXED_MM', heightMm: 18 };
  }
  return document;
}
