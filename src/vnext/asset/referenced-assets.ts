import type { AssetRef, CatalogDocument } from '../domain/editorial-model';
import { walkPageObjects } from '../domain/object-tree';

/**
 * Photos actually used by the catalog: image and icon objects (also inside groups) and
 * table cells with an image. `CatalogDocument.assets` only grows (replaced or deleted
 * photos stay listed), so publication must not require the unused ones.
 */
export function referencedAssetIds(doc: CatalogDocument): Set<string> {
  const ids = new Set<string>();
  for (const page of doc.pages) {
    if (page.background?.image) ids.add(page.background.image.assetId);
    for (const { object } of walkPageObjects(page)) {
      if (object.type === 'image' || object.type === 'icon') ids.add(object.assetId);
      else if (object.type === 'table') {
        for (const cell of object.table.cells) {
          if (cell.content.type === 'image') ids.add(cell.content.assetId);
        }
      }
    }
  }
  return ids;
}

/** The referenced AssetRefs, in `doc.assets` order. */
export function referencedAssets(doc: CatalogDocument): AssetRef[] {
  const ids = referencedAssetIds(doc);
  return doc.assets.filter((asset) => ids.has(asset.id));
}
