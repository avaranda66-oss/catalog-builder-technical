import {
  plainRichText,
  type Cell,
  type EditorialObject,
  type Frame,
  type IconObject,
  type ImageObject,
  type LeafEditorialObject,
  type ShapeObject,
  type TableModel,
  type TextObject,
} from '../domain';
import { PRESYS_COLOR_TOKENS, TO_FILL } from '../library/presys-archetypes';
import { refitGroup, roundMm } from './arsenal-geometry';

/**
 * Onda 4.5 — the "Foto a escolher (A COMPLETAR)" frame (ADR-arsenal §4), drawn like the empty image slots of the
 * PRESYS archetypes: a light box with a thin rule and a centred grey marker. The content review (FR-51) keeps
 * blocking the catalog until the person puts a real photo there.
 */

export const ARSENAL_PHOTO_PLACEHOLDER_TEXT = `Foto a escolher (${TO_FILL})`;

/** The box and the marker that stand where an image (or icon) was. Both keep the image's place in the stack. */
export function photoPlaceholderObjects(image: ImageObject | IconObject): [ShapeObject, TextObject] {
  const frame = image.frame;
  const markerPt = frame.widthMm >= 40 ? 9 : 7;
  const lineMm = markerPt * 1.2 * 0.3528;
  const fitted = Math.min(frame.heightMm - 2, Math.ceil(lineMm * 2 + 2));
  const heightMm = fitted >= 1 ? fitted : frame.heightMm;
  const widthMm = frame.widthMm > 4 ? roundMm(frame.widthMm - 4) : frame.widthMm;
  const marker: Frame = {
    xMm: roundMm(frame.xMm + (frame.widthMm - widthMm) / 2),
    yMm: roundMm(frame.yMm + (frame.heightMm - heightMm) / 2),
    widthMm,
    heightMm,
  };
  const lock = image.locked ? { locked: true } : {};
  return [
    {
      id: `${image.id}:moldura`, type: 'shape', shape: 'rectangle', zIndex: image.zIndex, frame: { ...frame }, ...lock,
      style: { fill: PRESYS_COLOR_TOKENS.slotFill, stroke: { pattern: 'solid', thicknessPt: 0.75, color: PRESYS_COLOR_TOKENS.rule } },
    },
    {
      id: `${image.id}:aviso`, type: 'text', zIndex: image.zIndex, frame: marker, ...lock,
      text: plainRichText(`${image.id}:aviso`, ARSENAL_PHOTO_PLACEHOLDER_TEXT),
      style: { fontSizePt: markerPt, lineHeight: 1.2, fontWeight: 400, color: PRESYS_COLOR_TOKENS.muted, textAlign: 'center' },
    },
  ];
}

const isPictured = (object: EditorialObject, assetIds: ReadonlySet<string>): object is ImageObject | IconObject =>
  (object.type === 'image' || object.type === 'icon') && assetIds.has(object.assetId);

/** A table whose cell images in `assetIds` became the "Foto a escolher" words. */
export function tableWithPhotoPlaceholders(table: TableModel, assetIds: ReadonlySet<string>): { table: TableModel; changed: boolean } {
  let changed = false;
  const cells = table.cells.map((cell): Cell => {
    if (cell.content.type !== 'image' || !assetIds.has(cell.content.assetId)) return cell;
    changed = true;
    const { contentPresentation, ...rest } = cell;
    const wrapPolicy = contentPresentation?.wrapPolicy;
    return {
      ...rest,
      content: { type: 'richText', value: plainRichText(`${cell.id}:foto-a-escolher`, ARSENAL_PHOTO_PLACEHOLDER_TEXT) },
      ...(wrapPolicy === undefined ? {} : { contentPresentation: { wrapPolicy } }),
    };
  });
  return { table: changed ? { ...table, cells } : table, changed };
}

export interface ArsenalPhotoPlaceholderResult {
  readonly objects: EditorialObject[];
  /** Ids of the images, icons and tables that now show the frame. */
  readonly replacedIds: string[];
}

/**
 * Every image or icon whose asset is in `assetIds` becomes the "Foto a escolher" frame (also inside groups), and
 * every such picture inside a table cell becomes the marker words. Painting order is kept: the box and the marker
 * take the image's place, and group children are numbered again in their order.
 */
export function withPhotoPlaceholders(objects: readonly EditorialObject[], assetIds: ReadonlySet<string>): ArsenalPhotoPlaceholderResult {
  if (assetIds.size === 0) return { objects: [...objects], replacedIds: [] };
  const replacedIds: string[] = [];
  const leaf = (object: LeafEditorialObject): LeafEditorialObject[] => {
    if (isPictured(object, assetIds)) {
      replacedIds.push(object.id);
      return photoPlaceholderObjects(object);
    }
    if (object.type === 'table') {
      const result = tableWithPhotoPlaceholders(object.table, assetIds);
      if (result.changed) {
        replacedIds.push(object.id);
        return [{ ...object, table: result.table }];
      }
    }
    return [object];
  };
  const result: EditorialObject[] = [];
  for (const object of objects) {
    if (object.type !== 'group') {
      result.push(...leaf(object));
      continue;
    }
    const before = replacedIds.length;
    const ordered = object.objects
      .map((child, arrayIndex) => ({ child, arrayIndex }))
      .sort((a, b) => a.child.zIndex - b.child.zIndex || a.arrayIndex - b.arrayIndex)
      .map(({ child }) => child);
    const children = ordered.flatMap(leaf).map((child, index) => ({ ...child, zIndex: index }));
    result.push(replacedIds.length === before ? object : refitGroup(object, children));
  }
  return { objects: result, replacedIds };
}
