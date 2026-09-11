import type {
  ApplicationAction,
  ApplicationActionResult,
  ApplicationExecutionContext,
  FrameU,
} from '../application';
import type { CatalogDocument, EditorialObject, Frame, Page } from '../domain';
import { mmToU } from '../domain';
import { add, mul, pxToQ, roundRatio, safe } from '../domain/physical';
import { resolveSnap, type SnapGuide, type SnapRectU, type SnapSiblingFrameU } from '../editor/snapping';

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type GestureKind = { type: 'move' } | { type: 'resize'; handle: ResizeHandle };
export type GestureCancelReason =
  | 'escape'
  | 'pointercancel'
  | 'capture-loss'
  | 'focus-loss'
  | 'active-page-change'
  | 'history'
  | 'superseded';

export type GestureStaleReason =
  | 'active-page-changed'
  | 'target-deleted'
  | 'target-page-changed'
  | 'target-locked'
  | 'target-frame-changed'
  | 'document-changed';

export interface GesturePreview {
  objectId: string;
  pageId: string;
  transactionId: string;
  startFrameU: FrameU;
  frameU: FrameU;
  guides: readonly SnapGuide[];
  kind: GestureKind;
}

interface ActiveGesture {
  pointerId: number;
  objectId: string;
  pageId: string;
  transactionId: string;
  kind: GestureKind;
  startClientX: number;
  startClientY: number;
  pageWidthU: number;
  pageHeightU: number;
  renderedPageWidthQ: number;
  renderedPageHeightQ: number;
  startFrameU: FrameU;
  pageBoundsU: SnapRectU;
  safeAreaU?: SnapRectU;
  siblingFramesU: readonly SnapSiblingFrameU[];
  snapThresholdU: number;
  lastClientX: number;
  lastClientY: number;
  startDocument: CatalogDocument;
}

export interface BeginGestureInput {
  pointerId: number;
  objectId: string;
  pageId: string;
  kind: GestureKind;
  clientX: number;
  clientY: number;
  pageClientWidthPx: number;
  pageClientHeightPx: number;
  snapThresholdPx?: number;
}

export interface EditorInteractionDependencies {
  getDocument(): CatalogDocument;
  getActivePageId(): string;
  createTransactionId(): string;
  isSnappingEnabled?(): boolean;
  execute(action: ApplicationAction, context: ApplicationExecutionContext): ApplicationActionResult;
  onPreviewChange(preview: GesturePreview | null): void;
}

export type FinishGestureResult =
  | { status: 'idle' }
  | { status: 'cancelled'; reason: GestureStaleReason }
  | { status: 'noop' }
  | { status: 'failed'; action: ApplicationAction; result: ApplicationActionResult }
  | { status: 'committed'; action: ApplicationAction; result: ApplicationActionResult };

function findObject(document: CatalogDocument, objectId: string): { page: Page; object: EditorialObject } | undefined {
  for (const page of document.pages) {
    const object = page.objects.find((candidate) => candidate.id === objectId);
    if (object) return { page, object };
  }
  return undefined;
}

export function frameToU(frame: Frame): FrameU {
  return {
    xU: mmToU(frame.xMm),
    yU: mmToU(frame.yMm),
    widthU: mmToU(frame.widthMm),
    heightU: mmToU(frame.heightMm),
  };
}

export function sameFrameU(left: FrameU, right: FrameU): boolean {
  return left.xU === right.xU
    && left.yU === right.yU
    && left.widthU === right.widthU
    && left.heightU === right.heightU;
}

function pointerAxisDeltaU(clientDeltaPx: number, pageExtentU: number, renderedPageExtentQ: number): number {
  const pointerDeltaQ = pxToQ(clientDeltaPx);
  return roundRatio(mul(pointerDeltaQ, pageExtentU), renderedPageExtentQ);
}

function pageSnapGeometry(page: Page, objectId: string): {
  pageBoundsU: SnapRectU;
  safeAreaU?: SnapRectU;
  siblingFramesU: readonly SnapSiblingFrameU[];
} {
  const pageWidthU = mmToU(page.widthMm);
  const pageHeightU = mmToU(page.heightMm);
  const pageBoundsU = { xU: 0, yU: 0, widthU: pageWidthU, heightU: pageHeightU };
  const safeAreaU = page.safeArea ? {
    xU: mmToU(page.safeArea.leftMm),
    yU: mmToU(page.safeArea.topMm),
    widthU: add(add(pageWidthU, -mmToU(page.safeArea.leftMm)), -mmToU(page.safeArea.rightMm)),
    heightU: add(add(pageHeightU, -mmToU(page.safeArea.topMm)), -mmToU(page.safeArea.bottomMm)),
  } : undefined;
  const siblingFramesU = page.objects
    .filter((object) => object.id !== objectId)
    .map((object) => ({ objectId: object.id, frameU: frameToU(object.frame) }));
  return { pageBoundsU, safeAreaU, siblingFramesU };
}

function resizeAxis(
  originU: number,
  sizeU: number,
  deltaU: number,
  controlsStart: boolean,
  controlsEnd: boolean
): { originU: number; sizeU: number } {
  if (controlsStart) {
    const proposedSizeU = add(sizeU, -deltaU);
    const size = Math.max(1, proposedSizeU);
    return {
      originU: add(originU, add(sizeU, -size)),
      sizeU: size,
    };
  }
  if (controlsEnd) {
    return {
      originU,
      sizeU: Math.max(1, add(sizeU, deltaU)),
    };
  }
  return { originU, sizeU };
}

export function previewFrameFromDelta(start: FrameU, kind: GestureKind, deltaXU: number, deltaYU: number): FrameU {
  safe(deltaXU);
  safe(deltaYU);
  if (kind.type === 'move') {
    return {
      xU: add(start.xU, deltaXU),
      yU: add(start.yU, deltaYU),
      widthU: start.widthU,
      heightU: start.heightU,
    };
  }

  const handle = kind.handle;
  const horizontal = resizeAxis(
    start.xU,
    start.widthU,
    deltaXU,
    handle.includes('w'),
    handle.includes('e')
  );
  const vertical = resizeAxis(
    start.yU,
    start.heightU,
    deltaYU,
    handle.includes('n'),
    handle.includes('s')
  );
  return {
    xU: horizontal.originU,
    yU: vertical.originU,
    widthU: horizontal.sizeU,
    heightU: vertical.sizeU,
  };
}

function actionForGesture(gesture: ActiveGesture, frameU: FrameU): ApplicationAction {
  if (gesture.kind.type === 'move') {
    return {
      type: 'object.move',
      objectId: gesture.objectId,
      xU: frameU.xU,
      yU: frameU.yU,
    };
  }
  return {
    type: 'object.resize',
    objectId: gesture.objectId,
    xU: frameU.xU,
    yU: frameU.yU,
    widthU: frameU.widthU,
    heightU: frameU.heightU,
  };
}

export class EditorInteractionController {
  private active: ActiveGesture | null = null;

  constructor(private readonly dependencies: EditorInteractionDependencies) {}

  isActive(): boolean {
    return this.active !== null;
  }

  activeObjectId(): string | null {
    return this.active?.objectId ?? null;
  }

  begin(input: BeginGestureInput): boolean {
    this.cancel('superseded');

    const document = this.dependencies.getDocument();
    if (this.dependencies.getActivePageId() !== input.pageId) return false;
    const location = findObject(document, input.objectId);
    if (!location || location.page.id !== input.pageId || location.object.locked) return false;

    const renderedPageWidthQ = pxToQ(input.pageClientWidthPx);
    const renderedPageHeightQ = pxToQ(input.pageClientHeightPx);
    if (renderedPageWidthQ <= 0 || renderedPageHeightQ <= 0) return false;

    const pageWidthU = mmToU(location.page.widthMm);
    const pageHeightU = mmToU(location.page.heightMm);
    const snapThresholdPx = input.snapThresholdPx ?? 0;
    const snapThresholdU = Math.max(
      Math.abs(pointerAxisDeltaU(snapThresholdPx, pageWidthU, renderedPageWidthQ)),
      Math.abs(pointerAxisDeltaU(snapThresholdPx, pageHeightU, renderedPageHeightQ))
    );

    this.active = {
      pointerId: input.pointerId,
      objectId: input.objectId,
      pageId: input.pageId,
      transactionId: this.dependencies.createTransactionId(),
      kind: input.kind,
      startClientX: input.clientX,
      startClientY: input.clientY,
      pageWidthU,
      pageHeightU,
      renderedPageWidthQ,
      renderedPageHeightQ,
      startFrameU: frameToU(location.object.frame),
      ...pageSnapGeometry(location.page, input.objectId),
      snapThresholdU,
      lastClientX: input.clientX,
      lastClientY: input.clientY,
      startDocument: document,
    };
    return true;
  }

  private previewAt(clientX: number, clientY: number): GesturePreview | null {
    const gesture = this.active;
    if (!gesture) return null;
    const deltaXU = pointerAxisDeltaU(
      clientX - gesture.startClientX,
      gesture.pageWidthU,
      gesture.renderedPageWidthQ
    );
    const deltaYU = pointerAxisDeltaU(
      clientY - gesture.startClientY,
      gesture.pageHeightU,
      gesture.renderedPageHeightQ
    );
    const candidateFrameU = previewFrameFromDelta(gesture.startFrameU, gesture.kind, deltaXU, deltaYU);
    const snapped = resolveSnap({
      candidateFrameU,
      pageBoundsU: gesture.pageBoundsU,
      safeAreaU: gesture.safeAreaU,
      siblingFramesU: gesture.siblingFramesU,
      thresholdU: gesture.snapThresholdU,
      axes: { x: true, y: true },
      resizeHandle: gesture.kind.type === 'resize' ? gesture.kind.handle : undefined,
      enabled: this.dependencies.isSnappingEnabled?.() ?? true,
    });
    return {
      objectId: gesture.objectId,
      pageId: gesture.pageId,
      transactionId: gesture.transactionId,
      startFrameU: gesture.startFrameU,
      frameU: snapped.frameU,
      guides: snapped.guides,
      kind: gesture.kind,
    };
  }

  move(pointerId: number, clientX: number, clientY: number): GesturePreview | null {
    if (!this.active || this.active.pointerId !== pointerId) return null;
    this.active.lastClientX = clientX;
    this.active.lastClientY = clientY;
    const preview = this.previewAt(clientX, clientY);
    this.dependencies.onPreviewChange(preview);
    return preview;
  }

  refreshPreview(): GesturePreview | null {
    const gesture = this.active;
    if (!gesture) return null;
    const preview = this.previewAt(gesture.lastClientX, gesture.lastClientY);
    this.dependencies.onPreviewChange(preview);
    return preview;
  }

  cancel(_reason: GestureCancelReason): boolean {
    if (!this.active) return false;
    this.active = null;
    this.dependencies.onPreviewChange(null);
    return true;
  }

  finish(pointerId: number, clientX: number, clientY: number): FinishGestureResult {
    const gesture = this.active;
    if (!gesture || gesture.pointerId !== pointerId) return { status: 'idle' };

    const pointerMoved = clientX !== gesture.startClientX || clientY !== gesture.startClientY;
    const preview = this.previewAt(clientX, clientY);
    const currentDocument = this.dependencies.getDocument();
    let staleReason: GestureStaleReason | undefined;

    if (this.dependencies.getActivePageId() !== gesture.pageId) {
      staleReason = 'active-page-changed';
    } else {
      const location = findObject(currentDocument, gesture.objectId);
      if (!location) staleReason = 'target-deleted';
      else if (location.page.id !== gesture.pageId) staleReason = 'target-page-changed';
      else if (location.object.locked) staleReason = 'target-locked';
      else if (!sameFrameU(frameToU(location.object.frame), gesture.startFrameU)) staleReason = 'target-frame-changed';
      else if (currentDocument !== gesture.startDocument) staleReason = 'document-changed';
    }

    this.active = null;
    this.dependencies.onPreviewChange(null);

    if (staleReason) return { status: 'cancelled', reason: staleReason };
    if (!pointerMoved) return { status: 'noop' };
    if (!preview || sameFrameU(preview.frameU, gesture.startFrameU)) return { status: 'noop' };

    const action = actionForGesture(gesture, preview.frameU);
    const result = this.dependencies.execute(action, { transactionId: gesture.transactionId });
    if (!result.ok) return { status: 'failed', action, result };
    return { status: 'committed', action, result };
  }
}
