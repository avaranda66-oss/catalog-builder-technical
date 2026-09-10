import { describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type ApplicationActionResult } from '@/vnext/application';
import { mmToU, type CatalogDocument, type Frame } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import {
  EditorInteractionController,
  frameToU,
  previewFrameFromDelta,
  type GestureKind,
} from '@/vnext/app/editor-interaction';

function ids(prefix = 'id') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function fixtureDocument(frame: Frame = { xMm: 20, yMm: 30, widthMm: 40, heightMm: 50 }): CatalogDocument {
  const base = createW2CDemoDocument(ids('base'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'target',
        type: 'shape',
        frame,
        zIndex: 0,
        shape: 'rectangle',
        style: { fill: '#edf5ff' },
      }],
    }],
  };
}

function withObject(document: CatalogDocument, transform: (object: CatalogDocument['pages'][number]['objects'][number]) => CatalogDocument['pages'][number]['objects'][number]): CatalogDocument {
  const page = document.pages[0];
  return { ...document, pages: [{ ...page, objects: [transform(page.objects[0])] }] };
}

function controllerHarness(document = fixtureDocument()) {
  let current = document;
  let activePageId = current.pages[0].id;
  const previews: unknown[] = [];
  const execute = vi.fn((action): ApplicationActionResult => ({
    ok: true,
    document: current,
    metadata: { actionType: action.type, affectedIds: ['target'], createdIds: [], changed: true },
  }));
  const controller = new EditorInteractionController({
    getDocument: () => current,
    getActivePageId: () => activePageId,
    execute,
    onPreviewChange: (preview) => previews.push(preview),
  });
  const begin = (kind: GestureKind = { type: 'move' }) => controller.begin({
    pointerId: 7,
    objectId: 'target',
    pageId: current.pages[0].id,
    kind,
    clientX: 100,
    clientY: 200,
    pageClientWidthPx: 420,
    pageClientHeightPx: 594,
  });
  return {
    controller,
    execute,
    previews,
    begin,
    get current() { return current; },
    set current(value: CatalogDocument) { current = value; },
    get activePageId() { return activePageId; },
    set activePageId(value: string) { activePageId = value; },
  };
}

describe('W2.C editor interaction controller', () => {
  it('performs 125 preview updates with zero canonical writes and commits one move on pointerup', () => {
    const h = controllerHarness();
    expect(h.begin()).toBe(true);
    for (let index = 1; index <= 125; index += 1) h.controller.move(7, 100 + index, 200 + index / 2);
    expect(h.execute).toHaveBeenCalledTimes(0);
    expect(h.previews).toHaveLength(125);
    const result = h.controller.finish(7, 225, 262.5);
    expect(result.status).toBe('committed');
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(h.execute.mock.calls[0][0].type).toBe('object.move');
  });

  it('commits exactly one complete-frame resize action on pointerup', () => {
    const h = controllerHarness();
    expect(h.begin({ type: 'resize', handle: 'se' })).toBe(true);
    h.controller.move(7, 130, 240);
    expect(h.execute).not.toHaveBeenCalled();
    const result = h.controller.finish(7, 130, 240);
    expect(result.status).toBe('committed');
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(h.execute.mock.calls[0][0]).toMatchObject({ type: 'object.resize', objectId: 'target' });
  });

  it('keeps one gesture to one Undo step in the real DocumentSession', () => {
    const initial = fixtureDocument();
    const session = createDocumentSession(initial, { createId: ids('session') });
    let preview = null;
    const controller = new EditorInteractionController({
      getDocument: () => session.getSnapshot().document,
      getActivePageId: () => session.getSnapshot().document.pages[0].id,
      execute: (action) => session.execute(action),
      onPreviewChange: (value) => { preview = value; },
    });
    const pageId = initial.pages[0].id;
    expect(controller.begin({ pointerId: 1, objectId: 'target', pageId, kind: { type: 'move' }, clientX: 0, clientY: 0, pageClientWidthPx: 420, pageClientHeightPx: 594 })).toBe(true);
    for (let i = 0; i < 20; i += 1) controller.move(1, i, i);
    controller.finish(1, 20, 20);
    expect(preview).toBeNull();
    expect(session.getSnapshot().canUndo).toBe(true);
    const moved = session.getSnapshot().document.pages[0].objects[0].frame;
    expect(moved).not.toEqual(initial.pages[0].objects[0].frame);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document.pages[0].objects[0].frame).toEqual(initial.pages[0].objects[0].frame);
    expect(session.undo().ok).toBe(false);
  });

  it.each(['escape', 'pointercancel', 'capture-loss', 'focus-loss'] as const)('cancels %s without a final action', (reason) => {
    const h = controllerHarness();
    h.begin();
    h.controller.move(7, 140, 240);
    expect(h.controller.cancel(reason)).toBe(true);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.previews.at(-1)).toBeNull();
    expect(h.controller.finish(7, 140, 240).status).toBe('idle');
  });

  it('rejects a stale canonical move or resize before final commit', () => {
    for (const frame of [
      { xMm: 21, yMm: 30, widthMm: 40, heightMm: 50 },
      { xMm: 20, yMm: 30, widthMm: 41, heightMm: 50 },
    ]) {
      const h = controllerHarness();
      h.begin();
      h.current = withObject(h.current, (object) => ({ ...object, frame }));
      const result = h.controller.finish(7, 130, 230);
      expect(result).toMatchObject({ status: 'cancelled', reason: 'target-frame-changed' });
      expect(h.execute).not.toHaveBeenCalled();
    }
  });

  it('rejects deleted and newly locked targets', () => {
    const deleted = controllerHarness();
    deleted.begin();
    deleted.current = { ...deleted.current, pages: [{ ...deleted.current.pages[0], objects: [] }] };
    expect(deleted.controller.finish(7, 130, 230)).toMatchObject({ status: 'cancelled', reason: 'target-deleted' });
    expect(deleted.execute).not.toHaveBeenCalled();

    const locked = controllerHarness();
    locked.begin();
    locked.current = withObject(locked.current, (object) => ({ ...object, locked: true }));
    expect(locked.controller.finish(7, 130, 230)).toMatchObject({ status: 'cancelled', reason: 'target-locked' });
    expect(locked.execute).not.toHaveBeenCalled();
  });

  it('rejects active page changes and target reparenting', () => {
    const pageChange = controllerHarness();
    pageChange.begin();
    pageChange.activePageId = 'other-page';
    expect(pageChange.controller.finish(7, 130, 230)).toMatchObject({ status: 'cancelled', reason: 'active-page-changed' });

    const reparented = controllerHarness();
    reparented.begin();
    const source = reparented.current.pages[0];
    const target = source.objects[0];
    reparented.current = {
      ...reparented.current,
      pages: [
        { ...source, objects: [] },
        { ...source, id: 'other-page', objects: [target] },
      ],
    };
    expect(reparented.controller.finish(7, 130, 230)).toMatchObject({ status: 'cancelled', reason: 'target-page-changed' });
  });

  it('treats zero-delta pointerup as a semantic no-op', () => {
    const h = controllerHarness();
    h.begin();
    expect(h.controller.finish(7, 100, 200).status).toBe('noop');
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('clears preview and reports a failed final commit without a second action', () => {
    const h = controllerHarness();
    h.execute.mockImplementationOnce(() => ({ ok: false, error: { code: 'OBJECT_LOCKED', details: 'target' } }));
    h.begin();
    h.controller.move(7, 130, 230);
    const result = h.controller.finish(7, 130, 230);
    expect(result.status).toBe('failed');
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(h.previews.at(-1)).toBeNull();
  });

  it('derives left, top and corner resize from the immutable start frame', () => {
    const start = { xU: 100, yU: 200, widthU: 50, heightU: 80 };
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'w' }, 10, 999)).toEqual({ xU: 110, yU: 200, widthU: 40, heightU: 80 });
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'n' }, 999, 15)).toEqual({ xU: 100, yU: 215, widthU: 50, heightU: 65 });
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'nw' }, 10, 15)).toEqual({ xU: 110, yU: 215, widthU: 40, heightU: 65 });
  });

  it('clamps handle crossing at 1 U without flipping the controlled edge', () => {
    const start = { xU: 100, yU: 200, widthU: 50, heightU: 80 };
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'w' }, 500, 0)).toEqual({ xU: 149, yU: 200, widthU: 1, heightU: 80 });
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'n' }, 0, 500)).toEqual({ xU: 100, yU: 279, widthU: 50, heightU: 1 });
    expect(previewFrameFromDelta(start, { type: 'resize', handle: 'se' }, -500, -500)).toEqual({ xU: 100, yU: 200, widthU: 1, heightU: 1 });
  });

  it('does not accumulate rounded preview deltas across moves', () => {
    const h = controllerHarness();
    h.begin();
    const first = h.controller.move(7, 110, 200)!;
    const second = h.controller.move(7, 120, 200)!;
    const start = frameToU(h.current.pages[0].objects[0].frame);
    expect(first.frameU.xU - start.xU).toBe(mmToU(5));
    expect(second.frameU.xU - start.xU).toBe(mmToU(10));
  });

  it('converts pointer movement correctly under a non-1 visual scale', () => {
    const h = controllerHarness();
    expect(h.controller.begin({
      pointerId: 7,
      objectId: 'target',
      pageId: h.current.pages[0].id,
      kind: { type: 'move' },
      clientX: 100,
      clientY: 200,
      pageClientWidthPx: 420,
      pageClientHeightPx: 640,
    })).toBe(true);
    const preview = h.controller.move(7, 142, 264)!;
    const start = frameToU(h.current.pages[0].objects[0].frame);
    expect(preview.frameU.xU - start.xU).toBe(mmToU(21));
    expect(preview.frameU.yU - start.yU).toBe(mmToU(29.7));
  });
});
