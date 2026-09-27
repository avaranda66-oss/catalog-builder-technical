import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createDocumentSession,
  executeApplicationAction,
  type IdGenerator,
} from '@/vnext/application';
import {
  frameToCanonicalU,
  plainRichText,
  type CatalogDocument,
  type EditorialObject,
  type GroupObject,
  type LeafEditorialObject,
} from '@/vnext/domain';
import { documentStyle, emptyTable } from '../proof/test-data';

function ids(prefix = 'w4f5'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function shape(
  id: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  zIndex: number,
  locked = false
): LeafEditorialObject {
  return {
    id,
    type: 'shape',
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex,
    ...(locked ? { locked: true } : {}),
    shape: 'rectangle',
    style: { fill: '#173F52' },
  };
}

function text(
  id: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  zIndex: number
): LeafEditorialObject {
  return {
    id,
    type: 'text',
    frame: { xMm, yMm, widthMm, heightMm },
    zIndex,
    text: plainRichText(`${id}-rich`, id),
    style: { fontSizePt: 9, color: '#172033' },
  };
}

function group(id: string, xMm: number, yMm: number, zIndex: number, childLocked = false): GroupObject {
  return {
    id,
    type: 'group',
    frame: { xMm, yMm, widthMm: 30, heightMm: 10 },
    zIndex,
    objects: [
      shape(`${id}-a`, 0, 0, 10, 10, 0, childLocked),
      shape(`${id}-b`, 20, 0, 10, 10, 1),
    ],
  };
}

function documentWith(
  objects: EditorialObject[],
  secondPageObjects: EditorialObject[] = [],
  assets: CatalogDocument['assets'] = []
): CatalogDocument {
  return {
    schemaVersion: 1,
    id: 'document',
    title: 'W4.F.5 fixture',
    locale: 'pt-BR',
    style: documentStyle,
    assets,
    pages: [
      {
        id: 'page',
        widthMm: 210,
        heightMm: 297,
        safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
        objects,
      },
      ...(secondPageObjects.length > 0
        ? [{
          id: 'page-2',
          widthMm: 210 as const,
          heightMm: 297 as const,
          safeArea: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
          objects: secondPageObjects,
        }]
        : []),
    ],
  };
}

function top(document: CatalogDocument, objectId: string): EditorialObject {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === objectId);
  if (!object) throw new Error(`Missing top-level object ${objectId}`);
  return object;
}

function target(object: EditorialObject) {
  return { objectId: object.id, expectedFrame: frameToCanonicalU(object.frame) };
}

function execute(document: CatalogDocument, action: unknown) {
  return executeApplicationAction(document, action, { createId: ids('unused') });
}

const alignmentFixture = () => documentWith([
  shape('a', -10, 10, 20, 10, 0),
  text('b', 30, -5, 10, 30, 1),
  group('g', 60, 25, 2),
]);

describe('W4.F.5 action schemas', () => {
  it('accepts strict lock/align/distribute actions and rejects malformed target sets', () => {
    const frame = { xU: 0, yU: 0, widthU: 10000, heightU: 10000 };
    expect(ApplicationActionSchema.safeParse({
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: true,
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: true, extra: true,
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.align', pageId: 'page',
      targets: [{ objectId: 'a', expectedFrame: frame }, { objectId: 'b', expectedFrame: frame }],
      alignment: 'left',
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.align', pageId: 'page',
      targets: [{ objectId: 'a', expectedFrame: frame }],
      alignment: 'left',
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.align', pageId: 'page',
      targets: [{ objectId: 'a', expectedFrame: frame }, { objectId: 'a', expectedFrame: frame }],
      alignment: 'left',
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.distribute', pageId: 'page',
      targets: [
        { objectId: 'a', expectedFrame: frame },
        { objectId: 'b', expectedFrame: frame },
        { objectId: 'c', expectedFrame: frame },
      ],
      axis: 'horizontal',
    }).success).toBe(true);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.distribute', pageId: 'page',
      targets: [{ objectId: 'a', expectedFrame: frame }, { objectId: 'b', expectedFrame: frame }],
      axis: 'horizontal',
    }).success).toBe(false);
    expect(ApplicationActionSchema.safeParse({
      type: 'objects.align', pageId: 'page',
      targets: [
        { objectId: 'a', expectedFrame: { ...frame, xU: 0.5 } },
        { objectId: 'b', expectedFrame: frame },
      ],
      alignment: 'left',
    }).success).toBe(false);
  });
});

describe('W4.F.5 object.setLocked', () => {
  it('locks, unlocks by removing the optional property, and keeps same-state requests semantic no-ops', () => {
    const initial = documentWith([shape('a', 10, 10, 10, 10, 0)]);
    const locked = execute(initial, {
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: true,
    });
    expect(locked.ok).toBe(true);
    if (!locked.ok) return;
    expect(top(locked.document, 'a')).toMatchObject({ locked: true });
    expect(locked.metadata).toMatchObject({ changed: true, affectedIds: ['a'] });

    const noOp = execute(locked.document, {
      type: 'object.setLocked', objectId: 'a', expectedLocked: true, locked: true,
    });
    expect(noOp).toMatchObject({ ok: true, metadata: { changed: false, affectedIds: [] } });
    if (!noOp.ok) return;
    expect(noOp.document).toEqual(locked.document);

    const unlocked = execute(locked.document, {
      type: 'object.setLocked', objectId: 'a', expectedLocked: true, locked: false,
    });
    expect(unlocked.ok).toBe(true);
    if (!unlocked.ok) return;
    expect(Object.prototype.hasOwnProperty.call(top(unlocked.document, 'a'), 'locked')).toBe(false);

    const importedFalse = documentWith([{ ...shape('a', 10, 10, 10, 10, 0), locked: false }]);
    const falseNoOp = execute(importedFalse, {
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: false,
    });
    expect(falseNoOp).toMatchObject({ ok: true, metadata: { changed: false } });
    if (!falseNoOp.ok) return;
    expect(Object.prototype.hasOwnProperty.call(top(falseNoOp.document, 'a'), 'locked')).toBe(true);
  });

  it('uses own root lock CAS, preserves descendant locks, rejects grouped children, and stales mismatches', () => {
    const grouped = documentWith([group('g', 20, 30, 0, true)]);
    const rootLocked = execute(grouped, {
      type: 'object.setLocked', objectId: 'g', expectedLocked: false, locked: true,
    });
    expect(rootLocked.ok).toBe(true);
    if (!rootLocked.ok) return;
    const lockedGroup = top(rootLocked.document, 'g');
    expect(lockedGroup.type).toBe('group');
    if (lockedGroup.type !== 'group') return;
    expect(lockedGroup.locked).toBe(true);
    expect(lockedGroup.objects[0].locked).toBe(true);

    const rootUnlocked = execute(rootLocked.document, {
      type: 'object.setLocked', objectId: 'g', expectedLocked: true, locked: false,
    });
    expect(rootUnlocked.ok).toBe(true);
    if (!rootUnlocked.ok) return;
    const reopenedGroup = top(rootUnlocked.document, 'g');
    expect(reopenedGroup.type).toBe('group');
    if (reopenedGroup.type !== 'group') return;
    expect(reopenedGroup.locked).toBeUndefined();
    expect(reopenedGroup.objects[0].locked).toBe(true);

    expect(execute(grouped, {
      type: 'object.setLocked', objectId: 'g-a', expectedLocked: true, locked: false,
    })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
    expect(execute(grouped, {
      type: 'object.setLocked', objectId: 'g', expectedLocked: true, locked: false,
    })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    expect(execute(grouped, {
      type: 'object.setLocked', objectId: 'missing-object', expectedLocked: false, locked: true,
    })).toMatchObject({ ok: false, error: { code: 'OBJECT_NOT_FOUND' } });
  });
});

describe('W4.F.5 alignment', () => {
  const cases = [
    ['left', { a: [-10, 10], b: [-10, -5], g: [-10, 25] }],
    ['horizontal-center', { a: [30, 10], b: [35, -5], g: [25, 25] }],
    ['right', { a: [70, 10], b: [80, -5], g: [60, 25] }],
    ['top', { a: [-10, -5], b: [30, -5], g: [60, -5] }],
    ['vertical-center', { a: [-10, 10], b: [30, 0], g: [60, 10] }],
    ['bottom', { a: [-10, 25], b: [30, 5], g: [60, 25] }],
  ] as const;

  it.each(cases)('%s uses the selected bounding box and preserves every non-position field', (alignment, expected) => {
    const initial = alignmentFixture();
    const before = structuredClone(initial);
    const result = execute(initial, {
      type: 'objects.align',
      pageId: 'page',
      targets: ['g', 'a', 'b'].map((id) => target(top(initial, id))),
      alignment,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const id of ['a', 'b', 'g'] as const) {
      const actual = top(result.document, id);
      const original = top(before, id);
      expect([actual.frame.xMm, actual.frame.yMm]).toEqual(expected[id]);
      expect({ ...actual, frame: { ...actual.frame, xMm: 0, yMm: 0 } })
        .toEqual({ ...original, frame: { ...original.frame, xMm: 0, yMm: 0 } });
    }
    const groupBefore = top(before, 'g');
    const groupAfter = top(result.document, 'g');
    expect(groupBefore.type).toBe('group');
    expect(groupAfter.type).toBe('group');
    if (groupBefore.type === 'group' && groupAfter.type === 'group') {
      expect(groupAfter.objects).toEqual(groupBefore.objects);
    }
  });

  it('rounds half-U centers deterministically and treats already aligned targets as a no-op', () => {
    const initial = documentWith([
      shape('a', 0, 0, 0.0002, 0.001, 0),
      shape('b', 0.0003, 0, 0.0001, 0.001, 1),
    ]);
    const action = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b'].map((id) => target(top(initial, id))),
      alignment: 'horizontal-center' as const,
    };
    const result = execute(initial, action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(frameToCanonicalU(top(result.document, 'a').frame).xU).toBe(1);
    expect(frameToCanonicalU(top(result.document, 'b').frame).xU).toBe(2);

    const prepared = {
      ...action,
      targets: ['a', 'b'].map((id) => target(top(result.document, id))),
    };
    expect(execute(result.document, prepared)).toMatchObject({
      ok: true,
      metadata: { changed: false, affectedIds: [] },
    });
  });
});

describe('W4.F.5 distribution', () => {
  it('distributes horizontally with negative spacing/remainder, fixes endpoints, and ignores target input order', () => {
    const initial = documentWith([
      shape('a', 0, 10, 20, 10, 0),
      shape('b', 5, 10, 10, 10, 1),
      shape('c', 11, 10, 20, 10, 2),
    ]);
    const targets = ['a', 'b', 'c'].map((id) => target(top(initial, id)));
    const result = execute(initial, {
      type: 'objects.distribute', pageId: 'page', targets: [...targets].reverse(), axis: 'horizontal',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(top(result.document, 'a').frame.xMm).toBe(0);
    expect(top(result.document, 'b').frame.xMm).toBe(10.5);
    expect(top(result.document, 'c').frame.xMm).toBe(11);

    const forward = execute(initial, {
      type: 'objects.distribute', pageId: 'page', targets, axis: 'horizontal',
    });
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(forward.document).toEqual(result.document);
  });

  it('distributes vertically, supports more than three targets, and keeps first/last fixed', () => {
    const initial = documentWith([
      shape('a', 10, -10, 10, 10, 0),
      shape('b', 10, 5, 10, 7, 1),
      shape('c', 10, 20, 10, 5, 2),
      shape('d', 10, 50, 10, 10, 3),
    ]);
    const result = execute(initial, {
      type: 'objects.distribute',
      pageId: 'page',
      targets: ['d', 'b', 'a', 'c'].map((id) => target(top(initial, id))),
      axis: 'vertical',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(top(result.document, 'a').frame.yMm).toBe(-10);
    expect(top(result.document, 'd').frame.yMm).toBe(50);
    expect(top(result.document, 'b').frame.yMm).toBeCloseTo(12.6667, 4);
    expect(top(result.document, 'c').frame.yMm).toBeCloseTo(32.3333, 4);
  });

  it('uses canonical visual order as the final geometric tie-break', () => {
    const initial = documentWith([
      shape('a', 0, 0, 10, 10, 5),
      shape('b', 0, 0, 10, 10, -2),
      shape('c', 40, 0, 10, 10, 9),
    ]);
    const result = execute(initial, {
      type: 'objects.distribute',
      pageId: 'page',
      targets: ['a', 'c', 'b'].map((id) => target(top(initial, id))),
      axis: 'horizontal',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(top(result.document, 'b').frame.xMm).toBe(0);
    expect(top(result.document, 'a').frame.xMm).toBe(20);
    expect(top(result.document, 'c').frame.xMm).toBe(40);
  });

  it('returns a semantic no-op when spacing is already equal', () => {
    const initial = documentWith([
      shape('a', 0, 0, 10, 10, 0),
      shape('b', 20, 0, 10, 10, 1),
      shape('c', 40, 0, 10, 10, 2),
    ]);
    const result = execute(initial, {
      type: 'objects.distribute',
      pageId: 'page',
      targets: ['c', 'a', 'b'].map((id) => target(top(initial, id))),
      axis: 'horizontal',
    });
    expect(result).toMatchObject({ ok: true, metadata: { changed: false, affectedIds: [] } });
    if (!result.ok) return;
    expect(result.document).toEqual(initial);
  });

  it('fails distribution overflow before candidate construction', () => {
    const initial = documentWith([
      shape('a', 0, 0, 1, 1, 0),
      shape('b', 1, 0, 1, 1, 1),
      shape('c', 2, 0, 1, 1, 2),
      shape('d', 800_000_000_000, 0, 1, 1, 3),
    ]);
    const before = structuredClone(initial);
    const result = execute(initial, {
      type: 'objects.distribute',
      pageId: 'page',
      targets: ['a', 'b', 'c', 'd'].map((id) => target(top(initial, id))),
      axis: 'horizontal',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_GEOMETRY' } });
    expect(initial).toEqual(before);
  });
});

describe('W4.F.5 CAS, atomicity, concurrency, and history', () => {
  it('stales moved/resized frames, blocks live locks/group closure, and never partially mutates', () => {
    const initial = documentWith([
      shape('a', 0, 0, 10, 10, 0),
      shape('b', 20, 20, 10, 10, 1),
      group('g', 50, 30, 2),
    ]);
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b', 'g'].map((id) => target(top(initial, id))),
      alignment: 'left' as const,
    };

    const moved: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => object.id === 'b'
          ? { ...object, frame: { ...object.frame, xMm: 21 } }
          : object),
      }],
    };
    const beforeMoved = structuredClone(moved);
    expect(execute(moved, prepared)).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    expect(moved).toEqual(beforeMoved);

    const resized: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => object.id === 'b'
          ? { ...object, frame: { ...object.frame, widthMm: object.frame.widthMm + 1 } }
          : object),
      }],
    };
    expect(execute(resized, prepared)).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });

    const locked: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => object.id === 'b' ? { ...object, locked: true } : object),
      }],
    };
    expect(execute(locked, prepared)).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });

    const closureLocked: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => object.id !== 'g' || object.type !== 'group'
          ? object
          : { ...object, objects: object.objects.map((child, index) => index === 0 ? { ...child, locked: true } : child) }),
      }],
    };
    expect(execute(closureLocked, prepared)).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });
  });

  it('preserves live concurrent content and z-order when frames still match', () => {
    const initial = documentWith([
      text('a', 0, 0, 20, 10, 0),
      shape('b', 30, 10, 10, 10, 1),
    ]);
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b'].map((id) => target(top(initial, id))),
      alignment: 'left' as const,
    };
    const live: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => object.id === 'a' && object.type === 'text'
          ? { ...object, zIndex: 7, text: plainRichText('new-rich', 'Novo conteúdo') }
          : object.id === 'b' ? { ...object, zIndex: -4 } : object),
      }],
    };
    const result = execute(live, prepared);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = top(result.document, 'a');
    expect(a.zIndex).toBe(7);
    expect(a.type).toBe('text');
    if (a.type === 'text') expect(a.text).toEqual(plainRichText('new-rich', 'Novo conteúdo'));
    expect(top(result.document, 'b').zIndex).toBe(-4);
  });

  it('preserves unrelated object changes and live page order when target frames still match', () => {
    const initial = documentWith(
      [
        shape('a', 0, 0, 10, 10, 0),
        shape('b', 30, 10, 10, 10, 1),
        shape('unrelated', 80, 40, 10, 10, 2),
      ],
      [shape('page-two-shape', 20, 20, 10, 10, 0)]
    );
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b'].map((id) => target(top(initial, id))),
      alignment: 'left' as const,
    };
    const pageOne = initial.pages[0];
    const pageTwo = initial.pages[1];
    const livePageOne = {
      ...pageOne,
      objects: pageOne.objects.map((object) => object.id === 'unrelated' && object.type === 'shape'
        ? { ...object, style: { ...object.style, fill: '#abcdef' } }
        : object),
    };
    const live: CatalogDocument = { ...initial, pages: [pageTwo, livePageOne] };
    const result = execute(live, prepared);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.pages.map((page) => page.id)).toEqual(['page-2', 'page']);
    expect(top(result.document, 'unrelated')).toMatchObject({ style: { fill: '#abcdef' } });
  });

  it('rejects deleted/cross-page targets without partial mutation', () => {
    const initial = documentWith(
      [shape('a', 0, 0, 10, 10, 0), shape('b', 20, 10, 10, 10, 1)],
      [shape('page-two-shape', 40, 20, 10, 10, 0)]
    );
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b'].map((id) => target(top(initial, id))),
      alignment: 'left' as const,
    };
    const deleted: CatalogDocument = {
      ...initial,
      pages: initial.pages.map((page) => page.id === 'page'
        ? { ...page, objects: page.objects.filter((object) => object.id !== 'b') }
        : page),
    };
    const beforeDeleted = structuredClone(deleted);
    expect(execute(deleted, prepared)).toMatchObject({ ok: false, error: { code: 'OBJECT_NOT_FOUND' } });
    expect(deleted).toEqual(beforeDeleted);

    const pageTwo = initial.pages[1].objects[0];
    expect(execute(initial, {
      type: 'objects.align',
      pageId: 'page',
      targets: [target(top(initial, 'a')), target(pageTwo)],
      alignment: 'top',
    })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('preserves live Image presentation/asset and Table state when frames still match', () => {
    const assetA = {
      id: 'asset-a', version: '1', sha256: 'a'.repeat(64), mime: 'image/png' as const,
      widthPx: 20, heightPx: 20, name: 'a.png', alt: 'A',
    };
    const assetB = {
      id: 'asset-b', version: '1', sha256: 'b'.repeat(64), mime: 'image/png' as const,
      widthPx: 20, heightPx: 20, name: 'b.png', alt: 'B',
    };
    const table = emptyTable(1, 1);
    const initial = documentWith([
      {
        id: 'image',
        type: 'image',
        frame: { xMm: 10, yMm: 10, widthMm: 20, heightMm: 20 },
        zIndex: 0,
        assetId: 'asset-a',
        fit: 'contain',
        focalPoint: { x: 0.5, y: 0.5 },
      },
      {
        id: 'table-object',
        type: 'table',
        frame: { xMm: 60, yMm: 25, widthMm: 80, heightMm: 30 },
        zIndex: 1,
        table,
      },
    ], [], [assetA, assetB]);
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['image', 'table-object'].map((id) => target(top(initial, id))),
      alignment: 'left' as const,
    };
    const liveTable = structuredClone(table);
    liveTable.style.base.color = '#123456';
    const live: CatalogDocument = {
      ...initial,
      pages: [{
        ...initial.pages[0],
        objects: initial.pages[0].objects.map((object) => {
          if (object.id === 'image' && object.type === 'image') {
            return { ...object, assetId: 'asset-b', fit: 'cover' as const, focalPoint: { x: 0.2, y: 0.8 } };
          }
          if (object.id === 'table-object' && object.type === 'table') return { ...object, table: liveTable };
          return object;
        }),
      }],
    };
    const result = execute(live, prepared);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.ok).toBe(true);
    expect(top(result.document, 'image')).toMatchObject({
      assetId: 'asset-b', fit: 'cover', focalPoint: { x: 0.2, y: 0.8 },
    });
    const arrangedTable = top(result.document, 'table-object');
    expect(arrangedTable.type).toBe('table');
    if (arrangedTable.type === 'table') expect(arrangedTable.table).toEqual(liveTable);
  });

  it('rejects a target that became grouped after preparation', () => {
    const initial = documentWith([
      shape('a', 0, 0, 10, 10, 0),
      shape('b', 20, 0, 10, 10, 1),
      shape('c', 50, 0, 10, 10, 2),
    ]);
    const prepared = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'c'].map((id) => target(top(initial, id))),
      alignment: 'top' as const,
    };
    const grouped = execute(initial, { type: 'group.create', pageId: 'page', objectIds: ['a', 'b'] });
    expect(grouped.ok).toBe(true);
    if (!grouped.ok) return;
    expect(execute(grouped.document, prepared)).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('fails safe-integer overflow before candidate construction', () => {
    const initial = documentWith([
      shape('a', 900719925474, 0, 1, 1, 0),
      shape('b', 0, 0, 1, 1, 1),
    ]);
    const before = structuredClone(initial);
    const result = execute(initial, {
      type: 'objects.align',
      pageId: 'page',
      targets: ['a', 'b'].map((id) => target(top(initial, id))),
      alignment: 'right',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_GEOMETRY' } });
    expect(initial).toEqual(before);
  });

  it('records exactly one history transition for a changed root lock', () => {
    const initial = documentWith([shape('a', 0, 0, 10, 10, 0)]);
    const session = createDocumentSession(initial, { createId: ids('lock-history') });
    expect(session.execute({
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: true,
    })).toMatchObject({ ok: true, metadata: { changed: true } });
    expect(session.getSnapshot()).toMatchObject({ localSequence: 1, canUndo: true, canRedo: false });
    expect(top(session.getSnapshot().document, 'a').locked).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.getSnapshot()).toMatchObject({ localSequence: 2, canUndo: false, canRedo: true });
    expect(session.redo().ok).toBe(true);
    expect(top(session.getSnapshot().document, 'a').locked).toBe(true);
    expect(session.getSnapshot().localSequence).toBe(3);
  });

  it('records one history transition for a five-object arrange and preserves Redo across no-op/failure', () => {
    const initial = documentWith([
      shape('a', 0, 0, 10, 10, 0),
      shape('b', 10, 10, 10, 10, 1),
      shape('c', 20, 20, 10, 10, 2),
      shape('d', 30, 30, 10, 10, 3),
      shape('e', 40, 40, 10, 10, 4),
    ]);
    const session = createDocumentSession(initial, { createId: ids('history') });
    const action = {
      type: 'objects.align' as const,
      pageId: 'page',
      targets: ['a', 'b', 'c', 'd', 'e'].map((id) => target(top(initial, id))),
      alignment: 'top' as const,
    };
    expect(session.execute(action)).toMatchObject({ ok: true, metadata: { changed: true } });
    expect(session.getSnapshot()).toMatchObject({ localSequence: 1, canUndo: true, canRedo: false });
    const arranged = structuredClone(session.getSnapshot().document);

    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(initial);
    expect(session.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true, localSequence: 2 });

    const noOp = session.execute({
      type: 'object.setLocked', objectId: 'a', expectedLocked: false, locked: false,
    });
    expect(noOp).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(session.getSnapshot()).toMatchObject({ canRedo: true, localSequence: 2 });

    const failed = session.execute({
      ...action,
      targets: action.targets.map((entry) => entry.objectId === 'b'
        ? { ...entry, expectedFrame: { ...entry.expectedFrame, xU: entry.expectedFrame.xU + 1 } }
        : entry),
    });
    expect(failed).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    expect(session.getSnapshot()).toMatchObject({ canRedo: true, localSequence: 2 });

    expect(session.redo().ok).toBe(true);
    expect(session.getSnapshot().document).toEqual(arranged);
    expect(session.getSnapshot().localSequence).toBe(3);
  });
});
