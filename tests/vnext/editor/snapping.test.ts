import { describe, expect, it } from 'vitest';
import { resolveSnap, type SnapInput } from '@/vnext/editor/snapping';

const page = { xU: 0, yU: 0, widthU: 1000, heightU: 800 };
const safeArea = { xU: 100, yU: 80, widthU: 800, heightU: 640 };
const baseFrame = { xU: 202, yU: 152, widthU: 100, heightU: 80 };

function snap(overrides: Partial<SnapInput> = {}) {
  return resolveSnap({
    candidateFrameU: baseFrame,
    pageBoundsU: page,
    safeAreaU: undefined,
    siblingFramesU: [],
    thresholdU: 5,
    axes: { x: true, y: true },
    ...overrides,
  });
}

describe('W2.D pure U snap engine', () => {
  it.each([
    ['left', { xU: 3, yU: 100, widthU: 100, heightU: 80 }, { xU: 0, yU: 100, widthU: 100, heightU: 80 }, 'x', 0],
    ['right', { xU: 897, yU: 100, widthU: 100, heightU: 80 }, { xU: 900, yU: 100, widthU: 100, heightU: 80 }, 'x', 1000],
    ['top', { xU: 200, yU: 4, widthU: 100, heightU: 80 }, { xU: 200, yU: 0, widthU: 100, heightU: 80 }, 'y', 0],
    ['bottom', { xU: 200, yU: 716, widthU: 100, heightU: 80 }, { xU: 200, yU: 720, widthU: 100, heightU: 80 }, 'y', 800],
  ] as const)('snaps to page %s edge', (_name, candidate, expected, axis, positionU) => {
    const result = snap({ candidateFrameU: candidate });
    expect(result.frameU).toEqual(expected);
    expect(result.guides).toContainEqual(expect.objectContaining({ axis, positionU, kind: 'page-edge' }));
  });

  it('snaps object centers to page centers on both axes independently', () => {
    const result = snap({ candidateFrameU: { xU: 447, yU: 357, widthU: 100, heightU: 80 } });
    expect(result.frameU).toEqual({ xU: 450, yU: 360, widthU: 100, heightU: 80 });
    expect(result.guides).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'x', positionU: 500, kind: 'page-center' }),
      expect.objectContaining({ axis: 'y', positionU: 400, kind: 'page-center' }),
    ]));
  });

  it.each([
    ['left', { xU: 97, yU: 200, widthU: 100, heightU: 80 }, 'x', 100],
    ['right', { xU: 803, yU: 200, widthU: 100, heightU: 80 }, 'x', 900],
    ['top', { xU: 200, yU: 76, widthU: 100, heightU: 80 }, 'y', 80],
    ['bottom', { xU: 200, yU: 643, widthU: 100, heightU: 80 }, 'y', 720],
  ] as const)('snaps to safe-area %s', (_name, candidate, axis, positionU) => {
    const result = snap({ candidateFrameU: candidate, safeAreaU: safeArea });
    expect(result.guides).toContainEqual(expect.objectContaining({ axis, positionU, kind: 'safe-area' }));
  });

  it('snaps moving edges and centers to sibling edges and centers', () => {
    const siblingFramesU = [{ objectId: 'b', frameU: { xU: 350, yU: 300, widthU: 120, heightU: 90 } }];
    const edge = snap({ candidateFrameU: { xU: 247, yU: 210, widthU: 100, heightU: 80 }, siblingFramesU });
    expect(edge.frameU.xU).toBe(250);
    expect(edge.guides).toContainEqual(expect.objectContaining({ axis: 'x', positionU: 350, kind: 'object-edge', sourceObjectId: 'b' }));

    const centerSiblingFramesU = [{ objectId: 'b', frameU: { xU: 300, yU: 250, widthU: 220, heightU: 190 } }];
    const center = snap({ candidateFrameU: { xU: 357, yU: 302, widthU: 100, heightU: 80 }, siblingFramesU: centerSiblingFramesU });
    expect(center.frameU).toMatchObject({ xU: 360, yU: 305 });
    expect(center.guides).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'x', positionU: 410, kind: 'object-center', sourceObjectId: 'b' }),
      expect.objectContaining({ axis: 'y', positionU: 345, kind: 'object-center', sourceObjectId: 'b' }),
    ]));
  });

  it('honors X-only and Y-only axis ownership', () => {
    expect(snap({ candidateFrameU: { xU: 3, yU: 4, widthU: 100, heightU: 80 }, axes: { x: true, y: false } })).toMatchObject({
      frameU: { xU: 0, yU: 4, widthU: 100, heightU: 80 },
    });
    expect(snap({ candidateFrameU: { xU: 3, yU: 4, widthU: 100, heightU: 80 }, axes: { x: false, y: true } })).toMatchObject({
      frameU: { xU: 3, yU: 0, widthU: 100, heightU: 80 },
    });
  });

  it.each([
    ['w', { xU: 103, yU: 200, widthU: 197, heightU: 80 }, { xU: 100, yU: 200, widthU: 200, heightU: 80 }],
    ['e', { xU: 700, yU: 200, widthU: 197, heightU: 80 }, { xU: 700, yU: 200, widthU: 200, heightU: 80 }],
    ['n', { xU: 300, yU: 83, widthU: 100, heightU: 197 }, { xU: 300, yU: 80, widthU: 100, heightU: 200 }],
    ['s', { xU: 300, yU: 520, widthU: 100, heightU: 197 }, { xU: 300, yU: 520, widthU: 100, heightU: 200 }],
    ['nw', { xU: 103, yU: 83, widthU: 197, heightU: 197 }, { xU: 100, yU: 80, widthU: 200, heightU: 200 }],
  ] as const)('resize handle %s snaps only controlled edge(s)', (resizeHandle, candidateFrameU, expected) => {
    expect(snap({ candidateFrameU, safeAreaU: safeArea, resizeHandle })).toMatchObject({ frameU: expected });
  });

  it('does not snap outside threshold, snaps inside, and includes exact threshold boundary', () => {
    expect(snap({ candidateFrameU: { xU: 6, yU: 200, widthU: 100, heightU: 80 } }).frameU.xU).toBe(6);
    expect(snap({ candidateFrameU: { xU: 4, yU: 200, widthU: 100, heightU: 80 } }).frameU.xU).toBe(0);
    expect(snap({ candidateFrameU: { xU: 5, yU: 200, widthU: 100, heightU: 80 } }).frameU.xU).toBe(0);
  });

  it('breaks equal-distance ties by candidate kind priority', () => {
    const result = snap({
      candidateFrameU: { xU: 202, yU: 200, widthU: 100, heightU: 80 },
      pageBoundsU: { xU: 200, yU: 0, widthU: 1000, heightU: 800 },
      safeAreaU: { xU: 204, yU: 80, widthU: 800, heightU: 640 },
    });
    expect(result.frameU.xU).toBe(204);
    expect(result.guides[0]).toMatchObject({ kind: 'safe-area', positionU: 204 });
  });

  it('breaks equal-distance sibling ties by stable object ID regardless of array insertion order', () => {
    const a = { objectId: 'a', frameU: { xU: 304, yU: 50, widthU: 50, heightU: 50 } };
    const z = { objectId: 'z', frameU: { xU: 300, yU: 50, widthU: 50, heightU: 50 } };
    const candidateFrameU = { xU: 202, yU: 200, widthU: 100, heightU: 80 };
    const first = snap({ candidateFrameU, siblingFramesU: [z, a] });
    const second = snap({ candidateFrameU, siblingFramesU: [a, z] });
    expect(first).toEqual(second);
    expect(first.guides[0]).toMatchObject({ sourceObjectId: 'a', positionU: 304 });
  });

  it('breaks equal-distance Unicode sibling ties by locale-independent stable object ID regardless of array insertion order', () => {
    const z = { objectId: 'z', frameU: { xU: 304, yU: 50, widthU: 50, heightU: 50 } };
    const aUmlaut = { objectId: 'ä', frameU: { xU: 300, yU: 50, widthU: 50, heightU: 50 } };
    const candidateFrameU = { xU: 202, yU: 200, widthU: 100, heightU: 80 };
    const expectedWinnerId = 'z';

    expect('z' < 'ä').toBe(true);

    const first = snap({ candidateFrameU, siblingFramesU: [aUmlaut, z] });
    const second = snap({ candidateFrameU, siblingFramesU: [z, aUmlaut] });

    expect(first).toEqual(second);
    expect(first.guides[0]).toMatchObject({ sourceObjectId: expectedWinnerId, positionU: 304 });
  });

  it('supports negative-coordinate snap targets without clamping to the page', () => {
    const result = snap({
      candidateFrameU: { xU: -97, yU: 200, widthU: 100, heightU: 80 },
      siblingFramesU: [{ objectId: 'negative', frameU: { xU: -100, yU: 50, widthU: 40, heightU: 40 } }],
    });
    expect(result.frameU.xU).toBe(-100);
    expect(result.guides[0]).toMatchObject({ sourceObjectId: 'negative', positionU: -100 });
  });

  it('preserves the 1 U minimum for controlled resize edges', () => {
    const result = snap({
      candidateFrameU: { xU: 999, yU: 200, widthU: 1, heightU: 80 },
      resizeHandle: 'w',
      thresholdU: 5,
    });
    expect(result.frameU).toEqual({ xU: 999, yU: 200, widthU: 1, heightU: 80 });
  });

  it('returns a cloned unchanged frame with no guides when snapping is disabled', () => {
    const candidateFrameU = { xU: 3, yU: 4, widthU: 100, heightU: 80 };
    const result = snap({ candidateFrameU, enabled: false });
    expect(result.frameU).toEqual(candidateFrameU);
    expect(result.frameU).not.toBe(candidateFrameU);
    expect(result.guides).toEqual([]);
  });

  it('never mutates candidate or sibling input', () => {
    const candidateFrameU = { xU: 3, yU: 4, widthU: 100, heightU: 80 };
    const siblingFramesU = [{ objectId: 'x', frameU: { xU: 200, yU: 200, widthU: 50, heightU: 50 } }];
    const beforeCandidate = structuredClone(candidateFrameU);
    const beforeSiblings = structuredClone(siblingFramesU);
    snap({ candidateFrameU, siblingFramesU });
    expect(candidateFrameU).toEqual(beforeCandidate);
    expect(siblingFramesU).toEqual(beforeSiblings);
  });
});
