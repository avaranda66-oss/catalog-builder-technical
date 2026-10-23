import {
  mmToU,
  pageFooterReserveBottomMm,
  PAGE_FOOTER_GEOMETRY,
  visualPageObjects,
  type EditorialObject,
  type Frame,
  type GroupObject,
  type LeafEditorialObject,
  type Page,
  type PageFooter,
} from '../domain';
import { add } from '../domain/physical';

/**
 * Onda 4.5 — geometry shared by capture, insertion and preview of arsenal presets (ADR-arsenal §2). Pure.
 *
 * Every sum of lengths goes through canonical units (1 U = 0,0001 mm), the same arithmetic the editor uses, so a
 * block captured at one place and put back there lands on exactly the same frames.
 */

const A4 = Object.freeze({ widthMm: 210, heightMm: 297 });
const U_PER_MM = 10_000;
const fromU = (value: number): number => value / U_PER_MM;

/** `a + b` in millimetres, exact to the editor's canonical unit. */
export function addMm(a: number, b: number): number {
  return fromU(add(mmToU(a), mmToU(b)));
}

/** `a - b` in millimetres, exact to the editor's canonical unit. */
export function subtractMm(a: number, b: number): number {
  return fromU(add(mmToU(a), -mmToU(b)));
}

/** Rounded to 0,01 mm (positions the service chooses by itself). */
export function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

export function translateFrame(frame: Frame, dxMm: number, dyMm: number): Frame {
  return { ...frame, xMm: addMm(frame.xMm, dxMm), yMm: addMm(frame.yMm, dyMm) };
}

/** Smallest frame around every frame (exact). Undefined for an empty list. */
export function boundingFrame(frames: readonly Frame[]): Frame | undefined {
  if (frames.length === 0) return undefined;
  const boxes = frames.map((frame) => {
    const x = mmToU(frame.xMm), y = mmToU(frame.yMm);
    return { x, y, right: add(x, mmToU(frame.widthMm)), bottom: add(y, mmToU(frame.heightMm)) };
  });
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.right));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return { xMm: fromU(x), yMm: fromU(y), widthMm: fromU(add(right, -x)), heightMm: fromU(add(bottom, -y)) };
}

const EPSILON_MM = 0.0001;

/** `inner` lies inside `outer` (touching the edge counts as inside). */
export function frameInside(inner: Frame, outer: Frame): boolean {
  return inner.xMm >= outer.xMm - EPSILON_MM
    && inner.yMm >= outer.yMm - EPSILON_MM
    && inner.xMm + inner.widthMm <= outer.xMm + outer.widthMm + EPSILON_MM
    && inner.yMm + inner.heightMm <= outer.yMm + outer.heightMm + EPSILON_MM;
}

function framesOverlap(a: Frame, b: Frame): boolean {
  return a.xMm < b.xMm + b.widthMm - EPSILON_MM && b.xMm < a.xMm + a.widthMm - EPSILON_MM
    && a.yMm < b.yMm + b.heightMm - EPSILON_MM && b.yMm < a.yMm + a.heightMm - EPSILON_MM;
}

/**
 * Where content may go on a page: inside its safe area (10 mm when the page declares none, the footer's minimum),
 * and above the automatic control footer of Onda 4 (FR-55) when that page prints it.
 */
export function arsenalContentBoxMm(
  page: Pick<Page, 'safeArea'>,
  footer: PageFooter | undefined,
  pageNumber: number,
): Frame {
  const fallback = PAGE_FOOTER_GEOMETRY.minimumSafeMm;
  const safe = page.safeArea ?? { topMm: fallback, rightMm: fallback, bottomMm: fallback, leftMm: fallback };
  const footerReserve = pageFooterReserveBottomMm({ ...A4, safeArea: page.safeArea }, footer, pageNumber);
  const bottomMm = Math.max(safe.bottomMm, footerReserve);
  return {
    xMm: safe.leftMm,
    yMm: safe.topMm,
    widthMm: Math.max(0, A4.widthMm - safe.leftMm - safe.rightMm),
    heightMm: Math.max(0, A4.heightMm - safe.topMm - bottomMm),
  };
}

export type ArsenalFreePlacementMode = 'center' | 'top';

export interface ArsenalFreePlacementOptions {
  /** `center`: middle of the largest free area (blocks). `top`: top-left of the highest free area (tables). */
  readonly mode: ArsenalFreePlacementMode;
  /** Space kept around what is already on the page. */
  readonly gapMm?: number;
}

/**
 * Finds a spot of `size` inside `box` that touches none of `obstacles` (each kept `gapMm` away). Undefined when
 * there is none. Free areas are the maximal empty rectangles found by sweeping horizontal bands between the
 * obstacles' edges (a page holds a few dozen objects, so this is instant).
 */
export function findFreePlacement(
  box: Frame,
  obstacles: readonly Frame[],
  size: Pick<Frame, 'widthMm' | 'heightMm'>,
  options: ArsenalFreePlacementOptions,
): { xMm: number; yMm: number } | undefined {
  if (size.widthMm > box.widthMm + EPSILON_MM || size.heightMm > box.heightMm + EPSILON_MM) return undefined;
  const gap = options.gapMm ?? 2;
  const left = box.xMm, right = box.xMm + box.widthMm, top = box.yMm, bottom = box.yMm + box.heightMm;
  const blocked = obstacles
    .map((frame) => ({
      left: Math.max(left, frame.xMm - gap),
      right: Math.min(right, frame.xMm + frame.widthMm + gap),
      top: Math.max(top, frame.yMm - gap),
      bottom: Math.min(bottom, frame.yMm + frame.heightMm + gap),
    }))
    .filter((entry) => entry.right > entry.left + EPSILON_MM && entry.bottom > entry.top + EPSILON_MM);

  const edges = [...new Set([top, bottom, ...blocked.flatMap((entry) => [entry.top, entry.bottom])])].sort((a, b) => a - b);
  type Candidate = { xMm: number; yMm: number; widthMm: number; heightMm: number };
  let best: Candidate | undefined;
  const better = (candidate: Candidate, current: Candidate | undefined): boolean => {
    if (!current) return true;
    if (options.mode === 'top') {
      return candidate.yMm < current.yMm - EPSILON_MM
        || (Math.abs(candidate.yMm - current.yMm) <= EPSILON_MM && candidate.xMm < current.xMm - EPSILON_MM);
    }
    const area = candidate.widthMm * candidate.heightMm, currentArea = current.widthMm * current.heightMm;
    if (Math.abs(area - currentArea) > EPSILON_MM) return area > currentArea;
    return candidate.yMm < current.yMm - EPSILON_MM
      || (Math.abs(candidate.yMm - current.yMm) <= EPSILON_MM && candidate.xMm < current.xMm - EPSILON_MM);
  };

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const bandTop = edges[i], bandBottom = edges[j];
      if (bandBottom - bandTop < size.heightMm - EPSILON_MM) continue;
      const cuts = blocked
        .filter((entry) => entry.top < bandBottom - EPSILON_MM && entry.bottom > bandTop + EPSILON_MM)
        .sort((a, b) => a.left - b.left);
      let cursor = left;
      const segments: { from: number; to: number }[] = [];
      for (const cut of cuts) {
        if (cut.left > cursor) segments.push({ from: cursor, to: cut.left });
        cursor = Math.max(cursor, cut.right);
      }
      if (right > cursor) segments.push({ from: cursor, to: right });
      for (const segment of segments) {
        if (segment.to - segment.from < size.widthMm - EPSILON_MM) continue;
        const candidate = { xMm: segment.from, yMm: bandTop, widthMm: segment.to - segment.from, heightMm: bandBottom - bandTop };
        if (better(candidate, best)) best = candidate;
      }
    }
  }
  if (!best) return undefined;
  const raw = options.mode === 'top'
    ? { xMm: best.xMm, yMm: best.yMm }
    : { xMm: best.xMm + (best.widthMm - size.widthMm) / 2, yMm: best.yMm + (best.heightMm - size.heightMm) / 2 };
  return clampIntoBox(box, { xMm: roundMm(raw.xMm), yMm: roundMm(raw.yMm) }, size);
}

/** Moves a top-left corner so `size` stays inside `box` (when it fits). */
export function clampIntoBox(
  box: Frame,
  point: { xMm: number; yMm: number },
  size: Pick<Frame, 'widthMm' | 'heightMm'>,
): { xMm: number; yMm: number } {
  const clamp = (value: number, min: number, room: number) => (room < 0 ? value : Math.min(Math.max(value, min), min + room));
  return {
    xMm: clamp(point.xMm, box.xMm, subtractMm(box.widthMm, size.widthMm)),
    yMm: clamp(point.yMm, box.yMm, subtractMm(box.heightMm, size.heightMm)),
  };
}

/**
 * What already occupies a page for placement: visible top-level objects, except backgrounds — a shape, polygon or
 * image covering half of the content box or more is treated as the page's backdrop, not as something to avoid.
 */
export function placementObstacles(page: Page, box: Frame): Frame[] {
  const boxArea = box.widthMm * box.heightMm;
  return page.objects
    .filter((object) => !object.hidden)
    .filter((object) => {
      const backdrop = object.type === 'shape' || object.type === 'polygon' || object.type === 'image';
      return !(backdrop && object.frame.widthMm * object.frame.heightMm >= boxArea * 0.5);
    })
    .map((object) => object.frame)
    .filter((frame) => framesOverlap(frame, box));
}

/** Highest stacking value on a page (−1 when empty), so inserted objects go on top. */
export function topZIndex(page: Page): number {
  return page.objects.length === 0 ? -1 : Math.max(...page.objects.map((object) => object.zIndex));
}

// ---------------------------------------------------------------------------------------------------------------
// Objects as they are painted
// ---------------------------------------------------------------------------------------------------------------

/** A group's child placed on the page (its frame made absolute), inheriting the group's lock. */
export function ungroupedChild(group: GroupObject, child: LeafEditorialObject): LeafEditorialObject {
  const { hidden: _hidden, ...rest } = child;
  return {
    ...rest,
    frame: translateFrame(child.frame, group.frame.xMm, group.frame.yMm),
    zIndex: group.zIndex,
    ...(group.locked || child.locked ? { locked: true } : {}),
  } as LeafEditorialObject;
}

/** A group whose children changed: the envelope is fitted again so it keeps the editor's group invariant. */
export function refitGroup(group: GroupObject, children: readonly LeafEditorialObject[]): EditorialObject {
  if (children.length === 1) return ungroupedChild(group, children[0]);
  const envelope = boundingFrame(children.map((child) => child.frame))!;
  return {
    ...group,
    frame: { xMm: addMm(group.frame.xMm, envelope.xMm), yMm: addMm(group.frame.yMm, envelope.yMm), widthMm: envelope.widthMm, heightMm: envelope.heightMm },
    objects: children.map((child) => ({ ...child, frame: translateFrame(child.frame, -envelope.xMm, -envelope.yMm) })),
  };
}

export interface ArsenalVisibleObjects {
  readonly objects: EditorialObject[];
  /** Ids of hidden objects (and hidden group children) that were left out. */
  readonly hiddenIds: string[];
}

/**
 * The objects as "Camadas" paints them: hidden objects and hidden group children are left out; a group left with
 * one child becomes that child, and a group that lost children is fitted again.
 */
export function arsenalVisibleObjects(objects: readonly EditorialObject[]): ArsenalVisibleObjects {
  const hiddenIds: string[] = [];
  const visible: EditorialObject[] = [];
  for (const object of objects) {
    if (object.hidden) {
      hiddenIds.push(object.id);
      continue;
    }
    if (object.type !== 'group') {
      visible.push(object);
      continue;
    }
    const children = object.objects.filter((child) => {
      if (child.hidden) hiddenIds.push(child.id);
      return !child.hidden;
    });
    if (children.length === 0) {
      hiddenIds.push(object.id);
      continue;
    }
    visible.push(children.length === object.objects.length ? object : refitGroup(object, children));
  }
  return { objects: visible, hiddenIds };
}

/**
 * Objects in painting order (bottom first) with stacking values 0, 1, 2…: the order is all that matters, and the
 * inserted copy gets values above whatever the destination page already holds.
 */
export function normalizeStacking(objects: readonly EditorialObject[]): EditorialObject[] {
  const page: Page = { id: 'arsenal:stacking', widthMm: 210, heightMm: 297, objects: [...objects] };
  return visualPageObjects(page).map(({ object }, index) => ({ ...object, zIndex: index }));
}
