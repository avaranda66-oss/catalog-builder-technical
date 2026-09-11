import { add, mmToU } from './physical';
import type { CatalogDocument, EditorialObject, GroupObject, Page, LeafEditorialObject } from './editorial-model';

export type CanonicalFrameU = { xU:number; yU:number; widthU:number; heightU:number };

export interface ObjectTreeEntry {
  object: EditorialObject;
  page: Page;
  parentGroup?: GroupObject;
  topLevelIndex: number;
  childIndex?: number;
  depth: 0 | 1;
  localFrameU: CanonicalFrameU;
  resolvedFrameU: CanonicalFrameU;
}

export interface VisualPageObject {
  object: EditorialObject;
  arrayIndex: number;
  visualIndex: number;
}

export function frameToCanonicalU(frame: { xMm:number;yMm:number;widthMm:number;heightMm:number }): CanonicalFrameU {
  return { xU:mmToU(frame.xMm), yU:mmToU(frame.yMm), widthU:mmToU(frame.widthMm), heightU:mmToU(frame.heightMm) };
}

export function visualPageObjects(page: Page): VisualPageObject[] {
  return page.objects
    .map((object,arrayIndex)=>({object,arrayIndex}))
    .sort((left,right)=>left.object.zIndex-right.object.zIndex||left.arrayIndex-right.arrayIndex)
    .map((entry,visualIndex)=>({...entry,visualIndex}));
}

export function walkPageObjects(page: Page): ObjectTreeEntry[] {
  const entries: ObjectTreeEntry[] = [];
  page.objects.forEach((object, topLevelIndex) => {
    const local = frameToCanonicalU(object.frame);
    entries.push({ object, page, topLevelIndex, depth: 0, localFrameU: local, resolvedFrameU: local });
    if (object.type === 'group') {
      object.objects.forEach((child: LeafEditorialObject, childIndex) => {
        const childFrame = frameToCanonicalU(child.frame);
        entries.push({
          object: child,
          page,
          parentGroup: object,
          topLevelIndex,
          childIndex,
          depth: 1,
          localFrameU: childFrame,
          resolvedFrameU: { xU: add(local.xU,childFrame.xU), yU: add(local.yU,childFrame.yU), widthU: childFrame.widthU, heightU: childFrame.heightU },
        });
      });
    }
  });
  return entries;
}

export function findObjectInTree(catalog: CatalogDocument, objectId: string): ObjectTreeEntry | undefined {
  for (const page of catalog.pages) {
    const found = walkPageObjects(page).find((entry) => entry.object.id === objectId);
    if (found) return found;
  }
  return undefined;
}
