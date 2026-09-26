import { plainRichText, type AssetRef, type CatalogDocument } from '@/vnext/domain';
import { createW4F2Document, W4F2_OBJECT_ID } from './w4f2-table-document';

export const W4F3_CATALOG_ID = 'f5555555-5555-4555-8555-555555555555';
export const W4F3_OTHER_CATALOG_ID = 'f6666666-6666-4666-8666-666666666666';
export const W4F3_PAGE_ID = 'w4f3-page';
export const W4F3_OBJECT_ID = W4F2_OBJECT_ID;

export const W4F3_EXISTING_ASSET: AssetRef = {
  id: 'asset-ta25n',
  version: 'repo-616332d',
  sha256: '9a3b009caa49f76df16f59b8733dda1c1c5d8459479006c1bcc4b37e7071c067',
  mime: 'image/jpeg',
  widthPx: 545,
  heightPx: 767,
  name: 'TA-25N repository photograph',
  alt: 'Fotografia de um calibrador PRESYS TA-25N',
};

export function createW4F3Document(
  id = W4F3_CATALOG_ID,
  title = 'Catálogo W4.F.3'
): CatalogDocument {
  const document = createW4F2Document();
  document.id = id;
  document.title = title;
  document.pages[0].id = id === W4F3_CATALOG_ID ? W4F3_PAGE_ID : 'w4f3-other-page';
  if (id !== W4F3_CATALOG_ID) {
    document.pages[0].objects = [];
    document.assets = [];
    return document;
  }

  document.assets = [structuredClone(W4F3_EXISTING_ASSET)];
  const object = document.pages[0].objects.find((entry) => entry.id === W4F3_OBJECT_ID);
  if (object?.type !== 'table') throw new Error('Missing W4.F.3 Table fixture');

  object.frame.heightMm = 72;
  object.table.style.base = { ...object.table.style.base, fontSizePt: 8 };
  object.table.legend = [
    { id: 'w4f3-legend-a', markerCode: 'A', text: plainRichText('w4f3-legend-a-text', 'Alarme') },
    { id: 'w4f3-legend-b', markerCode: 'B', text: plainRichText('w4f3-legend-b-text', 'Bloqueio') },
  ];
  object.table.cells[2].content = { type: 'marker', legendEntryId: 'w4f3-legend-a' };
  object.table.cells[3].content = { type: 'marker', legendEntryId: 'w4f3-legend-b' };
  return document;
}
