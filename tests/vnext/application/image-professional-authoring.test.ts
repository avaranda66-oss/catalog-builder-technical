import { describe, expect, it } from 'vitest';
import {
  ApplicationActionSchema,
  createCatalogDocument,
  createDocumentSession,
  executeApplicationAction,
  imageExpectedStateEquals,
  projectImageExpectedState,
} from '@/vnext/application';
import type { AssetRef, CatalogDocument, ImageObject } from '@/vnext/domain';

function asset(id: string, hex: string): AssetRef {
  return {
    id,
    version: '1',
    sha256: hex.repeat(64),
    mime: 'image/png',
    widthPx: 800,
    heightPx: 600,
    name: `${id}.png`,
    alt: id,
  };
}

const assetA = asset('asset-a', 'a');
const assetB = asset('asset-b', 'b');
const assetC = asset('asset-c', 'c');

function fixture(options: {
  fit?: 'contain' | 'cover';
  focalPoint?: { x: number; y: number };
  locked?: boolean;
} = {}): CatalogDocument {
  let id = 0;
  const base = createCatalogDocument(() => `fixture-${++id}`);
  const image: ImageObject = {
    id: 'image-object',
    type: 'image',
    frame: { xMm: 10, yMm: 20, widthMm: 40, heightMm: 30 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    assetId: assetA.id,
    fit: options.fit ?? 'contain',
    ...(options.focalPoint ? { focalPoint: { ...options.focalPoint } } : {}),
  };
  return {
    ...base,
    assets: [assetA, assetB],
    pages: [{
      ...base.pages[0],
      objects: [
        image,
        {
          id: 'shape-object',
          type: 'shape',
          frame: { xMm: 60, yMm: 20, widthMm: 20, heightMm: 20 },
          zIndex: 1,
          shape: 'rectangle',
          style: {},
        },
      ],
    }],
  };
}

function imageFrom(document: CatalogDocument): ImageObject {
  const object = document.pages.flatMap((page) => page.objects)
    .flatMap((object) => object.type === 'group' ? object.objects : [object])
    .find((object) => object.id === 'image-object');
  if (!object || object.type !== 'image') throw new Error('image fixture missing');
  return object;
}

function groupedFixture(): CatalogDocument {
  const document = fixture({ fit: 'cover', focalPoint: { x: 0.2, y: 0.8 } });
  return {
    ...document,
    pages: [{
      ...document.pages[0],
      objects: [{
        id: 'group-object',
        type: 'group',
        frame: { xMm: 10, yMm: 20, widthMm: 40, heightMm: 30 },
        zIndex: 0,
        objects: [
          {
            ...imageFrom(document),
            frame: { xMm: 0, yMm: 0, widthMm: 20, heightMm: 30 },
          },
          {
            id: 'group-shape',
            type: 'shape',
            frame: { xMm: 20, yMm: 0, widthMm: 20, heightMm: 30 },
            zIndex: 1,
            shape: 'rectangle',
            style: {},
          },
        ],
      }],
    }],
  };
}

describe('W4.F.4 Image expected-state contract', () => {
  it('projects missing focal to center without materializing authored state', () => {
    const document = fixture();
    const image = imageFrom(document);
    expect(image.focalPoint).toBeUndefined();
    expect(projectImageExpectedState(image)).toEqual({
      assetId: assetA.id,
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(imageExpectedStateEquals(image, {
      assetId: assetA.id,
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    })).toBe(true);
    expect(image.focalPoint).toBeUndefined();
  });

  it.each([
    { x: -0.001, y: 0.5 },
    { x: 1.001, y: 0.5 },
    { x: 0.5, y: -0.001 },
    { x: 0.5, y: 1.001 },
    { x: Number.NaN, y: 0.5 },
    { x: Number.POSITIVE_INFINITY, y: 0.5 },
  ])('rejects invalid focal point %#', (focalPoint) => {
    expect(ApplicationActionSchema.safeParse({
      type: 'image.setPresentation',
      objectId: 'image-object',
      expectedImage: { assetId: assetA.id, fit: 'cover', focalPoint: { x: 0.5, y: 0.5 } },
      fit: 'cover',
      focalPoint,
    }).success).toBe(false);
  });
});

describe('W4.F.4 standalone Image presentation', () => {
  it('changes fit without materializing optional center, authors focal, preserves it under contain, and resets center', () => {
    const session = createDocumentSession(fixture(), { createId: () => 'unused' });
    const initial = imageFrom(session.getSnapshot().document);
    const initialFrame = initial.frame;
    const initialSequence = session.getSnapshot().localSequence;

    const cover = session.execute({
      type: 'image.setPresentation',
      objectId: initial.id,
      expectedImage: projectImageExpectedState(initial),
      fit: 'cover',
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(cover).toMatchObject({ ok: true, metadata: { changed: true } });
    let current = imageFrom(session.getSnapshot().document);
    expect(current.fit).toBe('cover');
    expect(current.focalPoint).toBeUndefined();
    expect(current.frame).toEqual(initialFrame);
    expect(current.assetId).toBe(assetA.id);

    const authored = session.execute({
      type: 'image.setPresentation',
      objectId: current.id,
      expectedImage: projectImageExpectedState(current),
      fit: 'cover',
      focalPoint: { x: 0.237, y: 0.811 },
    });
    expect(authored).toMatchObject({ ok: true, metadata: { changed: true } });
    current = imageFrom(session.getSnapshot().document);
    expect(current.focalPoint).toEqual({ x: 0.237, y: 0.811 });

    const contain = session.execute({
      type: 'image.setPresentation',
      objectId: current.id,
      expectedImage: projectImageExpectedState(current),
      fit: 'contain',
      focalPoint: { x: 0.237, y: 0.811 },
    });
    expect(contain).toMatchObject({ ok: true, metadata: { changed: true } });
    current = imageFrom(session.getSnapshot().document);
    expect(current.fit).toBe('contain');
    expect(current.focalPoint).toEqual({ x: 0.237, y: 0.811 });

    const centered = session.execute({
      type: 'image.setPresentation',
      objectId: current.id,
      expectedImage: projectImageExpectedState(current),
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    });
    expect(centered).toMatchObject({ ok: true, metadata: { changed: true } });
    current = imageFrom(session.getSnapshot().document);
    expect(current.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(session.getSnapshot().localSequence).toBe(initialSequence + 4);

    const beforeNoOp = session.getSnapshot().localSequence;
    expect(session.execute({
      type: 'image.setPresentation',
      objectId: current.id,
      expectedImage: projectImageExpectedState(current),
      fit: current.fit,
      focalPoint: { x: 0.5, y: 0.5 },
    })).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(session.getSnapshot().localSequence).toBe(beforeNoOp);
  });

  it.each([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 0.333, y: 0.667 },
  ])('authors boundary/interior focal point %#', (focalPoint) => {
    const document = fixture({ fit: 'cover' });
    const image = imageFrom(document);
    const result = executeApplicationAction(document, {
      type: 'image.setPresentation',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      fit: 'cover',
      focalPoint,
    }, { createId: () => 'unused' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(imageFrom(result.document).focalPoint).toEqual(focalPoint);
  });

  it('uses narrow semantic CAS while preserving newer frame and zIndex', () => {
    const session = createDocumentSession(fixture({ fit: 'cover' }), { createId: () => 'unused' });
    const prepared = projectImageExpectedState(imageFrom(session.getSnapshot().document));
    expect(session.execute({
      type: 'object.move',
      objectId: 'image-object',
      xU: 250_000,
      yU: 350_000,
    }).ok).toBe(true);
    expect(session.execute({ type: 'object.reorder', objectId: 'image-object', targetIndex: 1 }).ok).toBe(true);
    const beforePresentation = imageFrom(session.getSnapshot().document);
    expect(session.execute({
      type: 'image.setPresentation',
      objectId: 'image-object',
      expectedImage: prepared,
      fit: 'cover',
      focalPoint: { x: 0.1, y: 0.9 },
    })).toMatchObject({ ok: true, metadata: { changed: true } });
    const after = imageFrom(session.getSnapshot().document);
    expect(after.frame).toEqual(beforePresentation.frame);
    expect(after.zIndex).toBe(beforePresentation.zIndex);
    expect(after.focalPoint).toEqual({ x: 0.1, y: 0.9 });
  });

  it('rejects stale asset, fit, and focal state with zero additional sequence', () => {
    const staleCases = ['asset', 'fit', 'focal'] as const;
    for (const kind of staleCases) {
      const session = createDocumentSession(fixture({ fit: 'cover' }), { createId: () => 'unused' });
      const before = imageFrom(session.getSnapshot().document);
      const stale = projectImageExpectedState(before);
      if (kind === 'asset') {
        expect(session.execute({
          type: 'image.replace',
          objectId: before.id,
          expectedImage: projectImageExpectedState(before),
          assetId: assetB.id,
        }).ok).toBe(true);
      } else {
        expect(session.execute({
          type: 'image.setPresentation',
          objectId: before.id,
          expectedImage: projectImageExpectedState(before),
          fit: kind === 'fit' ? 'contain' : 'cover',
          focalPoint: kind === 'focal' ? { x: 0.1, y: 0.9 } : { x: 0.5, y: 0.5 },
        }).ok).toBe(true);
      }
      const sequence = session.getSnapshot().localSequence;
      expect(session.execute({
        type: 'image.setPresentation',
        objectId: before.id,
        expectedImage: stale,
        fit: 'cover',
        focalPoint: { x: 0.8, y: 0.2 },
      })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
      expect(session.getSnapshot().localSequence).toBe(sequence);
    }
  });

  it('enforces live locked and grouped-child authority', () => {
    const locked = fixture({ fit: 'cover', locked: true });
    const lockedImage = imageFrom(locked);
    expect(executeApplicationAction(locked, {
      type: 'image.setPresentation',
      objectId: lockedImage.id,
      expectedImage: projectImageExpectedState(lockedImage),
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });

    const grouped = groupedFixture();
    const groupedImage = imageFrom(grouped);
    expect(executeApplicationAction(grouped, {
      type: 'image.setPresentation',
      objectId: groupedImage.id,
      expectedImage: projectImageExpectedState(groupedImage),
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });
});

describe('W4.F.4 standalone Image replacement', () => {
  it('replaces existing asset while preserving live Image presentation and geometry, with Undo/Redo', () => {
    const session = createDocumentSession(fixture({ fit: 'cover', focalPoint: { x: 0.2, y: 0.8 } }), { createId: () => 'unused' });
    const before = imageFrom(session.getSnapshot().document);
    const beforeDocument = JSON.stringify(session.getSnapshot().document);
    const result = session.execute({
      type: 'image.replace',
      objectId: before.id,
      expectedImage: projectImageExpectedState(before),
      assetId: assetB.id,
    });
    expect(result).toMatchObject({ ok: true, metadata: { changed: true, createdIds: [] } });
    const after = imageFrom(session.getSnapshot().document);
    expect(after).toEqual({ ...before, assetId: assetB.id });
    expect(session.undo().ok).toBe(true);
    expect(JSON.stringify(session.getSnapshot().document)).toBe(beforeDocument);
    expect(session.redo().ok).toBe(true);
    expect(imageFrom(session.getSnapshot().document)).toEqual(after);
  });

  it('treats same-asset replace as zero-history no-op and rejects missing asset', () => {
    const session = createDocumentSession(fixture({ fit: 'cover' }), { createId: () => 'unused' });
    const image = imageFrom(session.getSnapshot().document);
    const sequence = session.getSnapshot().localSequence;
    expect(session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: image.assetId,
    })).toMatchObject({ ok: true, metadata: { changed: false } });
    expect(session.getSnapshot().localSequence).toBe(sequence);
    expect(session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: 'missing',
    })).toMatchObject({ ok: false, error: { code: 'ASSET_NOT_FOUND' } });
    expect(session.getSnapshot().localSequence).toBe(sequence);
  });

  it('atomically adds a new AssetRef and rejects stale replacement without registering it', () => {
    const session = createDocumentSession(fixture({ fit: 'cover' }), { createId: () => 'unused' });
    const image = imageFrom(session.getSnapshot().document);
    const first = session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: assetC.id,
      asset: assetC,
    });
    expect(first).toMatchObject({ ok: true, metadata: { changed: true, createdIds: [assetC.id] } });
    expect(session.getSnapshot().document.assets.filter((entry) => entry.id === assetC.id)).toHaveLength(1);

    expect(session.undo().ok).toBe(true);
    const restored = imageFrom(session.getSnapshot().document);
    const staleExpected = projectImageExpectedState(restored);
    expect(session.execute({
      type: 'image.setPresentation',
      objectId: restored.id,
      expectedImage: projectImageExpectedState(restored),
      fit: 'contain',
      focalPoint: { x: 0.5, y: 0.5 },
    }).ok).toBe(true);
    const sequence = session.getSnapshot().localSequence;
    expect(session.execute({
      type: 'image.replace',
      objectId: restored.id,
      expectedImage: staleExpected,
      assetId: assetC.id,
      asset: assetC,
    })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });
    expect(session.getSnapshot().document.assets.some((entry) => entry.id === assetC.id)).toBe(false);
    expect(session.getSnapshot().localSequence).toBe(sequence);
  });

  it('reuses identical AssetRef metadata and rejects divergent/mismatched identity', () => {
    const document = fixture({ fit: 'cover' });
    const image = imageFrom(document);
    const same = executeApplicationAction(document, {
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: assetB.id,
      asset: { ...assetB },
    }, { createId: () => 'unused' });
    expect(same.ok).toBe(true);
    if (!same.ok) return;
    expect(same.document.assets.filter((entry) => entry.id === assetB.id)).toHaveLength(1);

    expect(executeApplicationAction(document, {
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: assetB.id,
      asset: { ...assetB, alt: 'divergent' },
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });

    expect(executeApplicationAction(document, {
      type: 'image.replace',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      assetId: 'other-id',
      asset: assetC,
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });

  it('enforces stale, locked, and grouped replacement barriers', () => {
    const session = createDocumentSession(fixture({ fit: 'cover' }), { createId: () => 'unused' });
    const image = imageFrom(session.getSnapshot().document);
    const stale = projectImageExpectedState(image);
    expect(session.execute({
      type: 'image.setPresentation',
      objectId: image.id,
      expectedImage: projectImageExpectedState(image),
      fit: 'cover',
      focalPoint: { x: 0.1, y: 0.9 },
    }).ok).toBe(true);
    expect(session.execute({
      type: 'image.replace',
      objectId: image.id,
      expectedImage: stale,
      assetId: assetB.id,
    })).toMatchObject({ ok: false, error: { code: 'TARGET_STALE' } });

    const locked = fixture({ fit: 'cover', locked: true });
    const lockedImage = imageFrom(locked);
    expect(executeApplicationAction(locked, {
      type: 'image.replace',
      objectId: lockedImage.id,
      expectedImage: projectImageExpectedState(lockedImage),
      assetId: assetB.id,
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'OBJECT_LOCKED' } });

    const grouped = groupedFixture();
    const groupedImage = imageFrom(grouped);
    expect(executeApplicationAction(grouped, {
      type: 'image.replace',
      objectId: groupedImage.id,
      expectedImage: projectImageExpectedState(groupedImage),
      assetId: assetB.id,
    }, { createId: () => 'unused' })).toMatchObject({ ok: false, error: { code: 'ACTION_INVALID' } });
  });
});
