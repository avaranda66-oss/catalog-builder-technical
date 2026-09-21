import { describe, expect, it } from 'vitest';
import { createCatalogDocument, createDocumentSession, executeApplicationAction, type ApplicationAction } from '@/vnext/application';
import { W2C_DEMO_ASSETS, createInsertSpec } from '@/vnext/app/editor-defaults';

function setup() {
  let id = 0;
  const createId = () => `test-${++id}`;
  const document = createCatalogDocument(createId, 'Blank');
  const asset = { ...W2C_DEMO_ASSETS[0], id: 'uploaded' };
  const spec = createInsertSpec('image', document.pages[0]);
  if (spec.type !== 'image') throw new Error('Expected image');
  const action = { type: 'object.insert', pageId: document.pages[0].id, object: { ...spec, type: 'image', assetId: asset.id, asset } } as const;
  return { document, asset, action, createId };
}

describe('atomic Image insertion with canonical AssetRef', () => {
  it('inserts from empty assets, object first in metadata, exact single Undo/Redo', () => {
    const { document, action, asset, createId } = setup();
    const session = createDocumentSession(document, { createId });
    const result = session.execute(action);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('insert failed');
    const after = session.getSnapshot().document;
    expect(after.assets).toEqual([asset]);
    expect(after.pages[0].objects[0]).toMatchObject({ assetId: asset.id, fit: 'contain' });
    expect(result.metadata.createdIds).toEqual([after.pages[0].objects[0].id, asset.id]);
    session.undo();
    expect(session.getSnapshot().document).toEqual(document);
    expect(session.getSnapshot().canUndo).toBe(false);
    session.redo();
    expect(session.getSnapshot().document).toEqual(after);
    expect(JSON.stringify(after)).not.toMatch(/blob:|https?:|base64|bytes/);
  });

  it('allocator observes supplied asset ID', () => {
    const { document, action, asset } = setup();
    let n = 0;
    const result = executeApplicationAction(document, action, { createId: () => n++ === 0 ? asset.id : 'fresh-object' });
    expect(result.ok).toBe(false);
    expect(document.assets).toEqual([]);
  });

  it.each([true, false])('reuses an existing asset (payload=%s)', (payload) => {
    const { document, action, asset, createId } = setup();
    const result = executeApplicationAction({ ...document, assets: [asset] }, {
      ...action, object: { ...action.object, asset: payload ? asset : undefined },
    }, { createId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.assets).toEqual([asset]);
      expect(result.metadata.createdIds).toHaveLength(1);
    }
  });

  it.each(['mismatch', 'metadata', 'invalid', 'missing', 'page', 'collision', 'frame'] as const)('fails atomically: %s', (kind) => {
    const { document, action, asset, createId } = setup();
    let input: unknown = action;
    const before = structuredClone(document);
    if (kind === 'mismatch') input = { ...action, object: { ...action.object, assetId: 'other' } };
    if (kind === 'metadata') { document.assets = [asset]; input = { ...action, object: { ...action.object, asset: { ...asset, alt: 'different' } } }; }
    if (kind === 'invalid') input = { ...action, object: { ...action.object, asset: { ...asset, widthPx: -1 } } };
    if (kind === 'missing') input = { ...action, object: { ...action.object, asset: undefined } };
    if (kind === 'page') input = { ...action, pageId: 'missing' };
    if (kind === 'collision') input = { ...action, object: { ...action.object, assetId: document.pages[0].id, asset: { ...asset, id: document.pages[0].id } } };
    if (kind === 'frame') input = { ...action, object: { ...action.object, frameU: { ...action.object.frameU, widthU: 0 } } };
    const session = createDocumentSession(document, { createId });
    const snapshot = session.getSnapshot();
    const result = session.execute(input as ApplicationAction);
    expect(result.ok).toBe(false);
    if (!result.ok && kind === 'missing') expect(result.error.code).toBe('ASSET_NOT_FOUND');
    expect(session.getSnapshot()).toEqual(snapshot);
    expect(document.pages).toEqual(before.pages);
  });

  it('Icon still requires an existing asset and rejects a payload', () => {
    const { document, action, createId } = setup();
    const object = { type: 'icon', assetId: 'missing', frameU: action.object.frameU, zIndex: 0 };
    expect(executeApplicationAction(document, { ...action, object }, { createId }).ok).toBe(false);
    expect(executeApplicationAction(document, { ...action, object: { ...object, asset: action.object.asset } }, { createId }).ok).toBe(false);
  });
});
