import type { FrameU } from '../application';
import { add, roundRatio, safe } from '../domain/physical';

export type SnapAxis = 'x' | 'y';
export type SnapGuideKind = 'safe-area' | 'page-edge' | 'page-center' | 'object-edge' | 'object-center';
export type SnapResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type SnapRectU = FrameU;

export interface SnapSiblingFrameU {
  objectId: string;
  frameU: FrameU;
}

export interface SnapAxes {
  x: boolean;
  y: boolean;
}

export interface SnapGuide {
  axis: SnapAxis;
  positionU: number;
  kind: SnapGuideKind;
  sourceObjectId?: string;
}

export interface SnapInput {
  candidateFrameU: FrameU;
  pageBoundsU: SnapRectU;
  safeAreaU?: SnapRectU;
  siblingFramesU: readonly SnapSiblingFrameU[];
  thresholdU: number;
  axes: SnapAxes;
  resizeHandle?: SnapResizeHandle;
  enabled?: boolean;
}

export interface SnapResult {
  frameU: FrameU;
  guides: readonly SnapGuide[];
}

type EdgeName = 'start' | 'end' | 'center';

interface Target {
  axis: SnapAxis;
  positionU: number;
  kind: SnapGuideKind;
  edge: EdgeName;
  edgeOrder: number;
  sourceObjectId?: string;
}

interface Source {
  positionU: number;
  edge: EdgeName;
  edgeOrder: number;
}

interface Resolution {
  adjustmentU: number;
  target: Target;
  source: Source;
}

const kindPriority: Record<SnapGuideKind, number> = {
  'safe-area': 0,
  'page-edge': 1,
  'page-center': 2,
  'object-edge': 3,
  'object-center': 4,
};

function cloneFrame(frame: FrameU): FrameU {
  return { xU: frame.xU, yU: frame.yU, widthU: frame.widthU, heightU: frame.heightU };
}

function centerU(originU: number, extentU: number): number {
  return add(originU, roundRatio(extentU, 2));
}

function sources(frame: FrameU, axis: SnapAxis, resizeHandle?: SnapResizeHandle): Source[] {
  const originU = axis === 'x' ? frame.xU : frame.yU;
  const extentU = axis === 'x' ? frame.widthU : frame.heightU;
  if (resizeHandle) {
    const controlsStart = axis === 'x' ? resizeHandle.includes('w') : resizeHandle.includes('n');
    const controlsEnd = axis === 'x' ? resizeHandle.includes('e') : resizeHandle.includes('s');
    if (controlsStart) return [{ positionU: originU, edge: 'start', edgeOrder: 0 }];
    if (controlsEnd) return [{ positionU: add(originU, extentU), edge: 'end', edgeOrder: 1 }];
    return [];
  }
  return [
    { positionU: originU, edge: 'start', edgeOrder: 0 },
    { positionU: add(originU, extentU), edge: 'end', edgeOrder: 1 },
    { positionU: centerU(originU, extentU), edge: 'center', edgeOrder: 2 },
  ];
}

function edgeTargets(rect: SnapRectU, kind: 'page-edge' | 'safe-area'): Target[] {
  return [
    { axis: 'x', positionU: rect.xU, kind, edge: 'start', edgeOrder: 0 },
    { axis: 'x', positionU: add(rect.xU, rect.widthU), kind, edge: 'end', edgeOrder: 1 },
    { axis: 'y', positionU: rect.yU, kind, edge: 'start', edgeOrder: 0 },
    { axis: 'y', positionU: add(rect.yU, rect.heightU), kind, edge: 'end', edgeOrder: 1 },
  ];
}

function centerTargets(rect: SnapRectU, kind: 'page-center' | 'object-center', sourceObjectId?: string): Target[] {
  return [
    { axis: 'x', positionU: centerU(rect.xU, rect.widthU), kind, edge: 'center', edgeOrder: 2, sourceObjectId },
    { axis: 'y', positionU: centerU(rect.yU, rect.heightU), kind, edge: 'center', edgeOrder: 2, sourceObjectId },
  ];
}

function objectEdgeTargets(sibling: SnapSiblingFrameU): Target[] {
  const { objectId, frameU } = sibling;
  return [
    { axis: 'x', positionU: frameU.xU, kind: 'object-edge', edge: 'start', edgeOrder: 0, sourceObjectId: objectId },
    { axis: 'x', positionU: add(frameU.xU, frameU.widthU), kind: 'object-edge', edge: 'end', edgeOrder: 1, sourceObjectId: objectId },
    { axis: 'y', positionU: frameU.yU, kind: 'object-edge', edge: 'start', edgeOrder: 0, sourceObjectId: objectId },
    { axis: 'y', positionU: add(frameU.yU, frameU.heightU), kind: 'object-edge', edge: 'end', edgeOrder: 1, sourceObjectId: objectId },
  ];
}

function targetList(input: SnapInput): Target[] {
  const targets = [...edgeTargets(input.pageBoundsU, 'page-edge'), ...centerTargets(input.pageBoundsU, 'page-center')];
  if (input.safeAreaU) targets.push(...edgeTargets(input.safeAreaU, 'safe-area'));
  for (const sibling of input.siblingFramesU) {
    targets.push(...objectEdgeTargets(sibling), ...centerTargets(sibling.frameU, 'object-center', sibling.objectId));
  }
  return targets;
}

function relationAllowed(target: Target, source: Source): boolean {
  if (target.kind === 'page-center' || target.kind === 'object-center') return source.edge === 'center';
  if (target.kind === 'page-edge' || target.kind === 'safe-area') return target.edge === source.edge;
  return source.edge !== 'center';
}

function compareResolution(left: Resolution, right: Resolution): number {
  const distance = Math.abs(left.adjustmentU) - Math.abs(right.adjustmentU);
  if (distance !== 0) return distance;
  const kind = kindPriority[left.target.kind] - kindPriority[right.target.kind];
  if (kind !== 0) return kind;
  const leftId = left.target.sourceObjectId ?? '';
  const rightId = right.target.sourceObjectId ?? '';
  const id = leftId.localeCompare(rightId);
  if (id !== 0) return id;
  const targetEdge = left.target.edgeOrder - right.target.edgeOrder;
  if (targetEdge !== 0) return targetEdge;
  const sourceEdge = left.source.edgeOrder - right.source.edgeOrder;
  if (sourceEdge !== 0) return sourceEdge;
  return left.target.positionU - right.target.positionU;
}

function resizeWouldRemainValid(frame: FrameU, axis: SnapAxis, adjustmentU: number, handle: SnapResizeHandle): boolean {
  if (axis === 'x') {
    if (handle.includes('w')) return add(frame.widthU, -adjustmentU) >= 1;
    if (handle.includes('e')) return add(frame.widthU, adjustmentU) >= 1;
    return false;
  }
  if (handle.includes('n')) return add(frame.heightU, -adjustmentU) >= 1;
  if (handle.includes('s')) return add(frame.heightU, adjustmentU) >= 1;
  return false;
}

function bestResolution(input: SnapInput, axis: SnapAxis): Resolution | undefined {
  const axisSources = sources(input.candidateFrameU, axis, input.resizeHandle);
  if (axisSources.length === 0) return undefined;
  const candidates: Resolution[] = [];
  for (const target of targetList(input)) {
    if (target.axis !== axis) continue;
    for (const source of axisSources) {
      if (!relationAllowed(target, source)) continue;
      const adjustmentU = add(target.positionU, -source.positionU);
      if (Math.abs(adjustmentU) > input.thresholdU) continue;
      if (input.resizeHandle && !resizeWouldRemainValid(input.candidateFrameU, axis, adjustmentU, input.resizeHandle)) continue;
      candidates.push({ adjustmentU, target, source });
    }
  }
  candidates.sort(compareResolution);
  return candidates[0];
}

function applyResolution(frame: FrameU, axis: SnapAxis, resolution: Resolution, resizeHandle?: SnapResizeHandle): void {
  const adjustmentU = resolution.adjustmentU;
  if (!resizeHandle) {
    if (axis === 'x') frame.xU = add(frame.xU, adjustmentU);
    else frame.yU = add(frame.yU, adjustmentU);
    return;
  }
  if (axis === 'x') {
    if (resizeHandle.includes('w')) {
      frame.xU = add(frame.xU, adjustmentU);
      frame.widthU = add(frame.widthU, -adjustmentU);
    } else if (resizeHandle.includes('e')) {
      frame.widthU = add(frame.widthU, adjustmentU);
    }
    return;
  }
  if (resizeHandle.includes('n')) {
    frame.yU = add(frame.yU, adjustmentU);
    frame.heightU = add(frame.heightU, -adjustmentU);
  } else if (resizeHandle.includes('s')) {
    frame.heightU = add(frame.heightU, adjustmentU);
  }
}

export function resolveSnap(input: SnapInput): SnapResult {
  safe(input.thresholdU);
  if (input.thresholdU < 0) throw new RangeError('thresholdU must be nonnegative');
  const frameU = cloneFrame(input.candidateFrameU);
  if (input.enabled === false) return { frameU, guides: [] };

  const guides: SnapGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    if (!input.axes[axis]) continue;
    const resolution = bestResolution(input, axis);
    if (!resolution) continue;
    applyResolution(frameU, axis, resolution, input.resizeHandle);
    guides.push({
      axis,
      positionU: resolution.target.positionU,
      kind: resolution.target.kind,
      ...(resolution.target.sourceObjectId ? { sourceObjectId: resolution.target.sourceObjectId } : {}),
    });
  }
  return { frameU, guides };
}
