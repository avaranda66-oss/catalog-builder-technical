import { describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession, projectImageExpectedState } from '@/vnext/application';
import { mmToU, type CatalogDocument, type TableObject } from '@/vnext/domain';
import { VNextPersistenceRuntime, type CatalogRepository } from '@/vnext/persistence';
import type { AssetUploadResult } from '@/vnext/asset';
import { imageUploadErrorMessage, imageUploadLineage, uploadWorkspaceImage, type ImageUploadIntent } from '@/vnext/app/image-upload';
import { W2C_DEMO_ASSETS } from '@/vnext/app/editor-defaults';
import { emptyTable } from '../proof/test-data';

function setup() {
  let n = 0;
  const createId = () => `id-${++n}`;
  const document = createCatalogDocument(createId);
  const session = createDocumentSession(document, { createId });
  const unavailable = async () => ({ ok: false as const, error: { code: 'OFFLINE' as const } });
  const repository: CatalogRepository = { getCatalog: unavailable, listCatalogs: unavailable, createCatalog: unavailable, saveCAS: unavailable, archiveCAS: unavailable };
  const runtime = new VNextPersistenceRuntime({ session, repository, applicationDependencies: { createId }, createMutationId: createId, createOpenSessionId: createId, authLineage: 'user', authorityScopeId: 'scope', autosave: false });
  const asset = { ...W2C_DEMO_ASSETS[0], id: 'real-upload' };
  const success: AssetUploadResult = { ok: true, asset, runtimeState: { status: 'resolved', asset, url: 'blob:runtime-only', expiresAt: 9999999999999 } };
  const intent: ImageUploadIntent = { type: 'insert', pageId: document.pages[0].id, session, lineage: imageUploadLineage(runtime) };
  let release!: (result: AssetUploadResult) => void;
  const bridge = { upload: vi.fn(() => new Promise<AssetUploadResult>((resolve) => { release = resolve; })) };
  const file = { name: 'real.png', type: 'image/png', arrayBuffer: vi.fn(async () => new ArrayBuffer(4)) };
  const input = { intent, file, runtime, bridge, getActivePageId: () => document.pages[0].id, isCurrent: () => true };
  return { document, session, runtime, asset, success, input, bridge, release: () => release(success) };
}

describe('shared Image upload orchestration', () => {
  it('links once, then installs runtime data; Redo never uploads', async () => {
    const s = setup();
    const resultPromise = uploadWorkspaceImage(s.input);
    await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
    expect(s.runtime.workspace.getSnapshot().assetUrls.size).toBe(0);
    s.release();
    const result = await resultPromise;
    expect(result.message).toBe('Imagem adicionada.');
    expect(result.objectId).toBe(s.session.getSnapshot().document.pages[0].objects[0].id);
    expect(s.runtime.workspace.getSnapshot().assetUrls.get(s.asset.id)).toBe('blob:runtime-only');
    s.session.undo(); s.session.redo();
    expect(s.bridge.upload).toHaveBeenCalledTimes(1);
  });

  it.each(['auth', 'authority', 'open', 'catalog', 'session', 'page-switch', 'page-removed', 'unmounted'] as const)('rejects stale %s without document/runtime mutation', async (kind) => {
    const s = setup();
    const promise = uploadWorkspaceImage(s.input);
    await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
    const workspace = s.runtime.workspace;
    if (kind === 'auth') workspace.updateAuthLineage('new-user');
    if (kind === 'authority') workspace.updateAuthContext('user', 'new-scope');
    if (kind === 'session') workspace.replaceActive(createDocumentSession(s.document, { createId: () => 'unused' }), workspace.getSnapshot().binding);
    if (kind === 'open' || kind === 'catalog') {
      const binding = workspace.getSnapshot().binding;
      workspace.replaceActive(s.session, { ...binding, ...(kind === 'open' ? { openSessionId: 'other' } : { kind: 'PERSISTED', catalogId: 'other' }) } as typeof binding);
    }
    if (kind === 'page-switch') s.input.getActivePageId = () => 'another-page';
    if (kind === 'page-removed') {
      s.session.execute({ type: 'page.add' });
      s.session.execute({ type: 'page.delete', pageId: s.document.pages[0].id });
    }
    if (kind === 'unmounted') s.input.isCurrent = () => false;
    const before = s.session.getSnapshot();
    s.release();
    expect((await promise).message).toMatch(/descartado/);
    expect(s.session.getSnapshot()).toEqual(before);
    expect(workspace.getSnapshot().assetUrls.size).toBe(0);
    expect(workspace.getSnapshot().assetRuntimeStates.size).toBe(0);
  });

  it('rejects changed lineage during file read before upload', async () => {
    const s = setup();
    s.input.file.arrayBuffer = vi.fn(async () => { s.runtime.workspace.updateAuthLineage('other'); return new ArrayBuffer(4); });
    expect((await uploadWorkspaceImage(s.input)).message).toMatch(/descartado/);
    expect(s.bridge.upload).not.toHaveBeenCalled();
  });

  it.each(['UNSUPPORTED_MEDIA', 'INVALID_DIMENSIONS', 'OFFLINE', 'UPLOAD_FAILED', 'STALE_RESULT', 'AMBIGUOUS_COMMIT_OUTCOME', 'UNKNOWN'])('safe supported failure: %s', async (code) => {
    const s = setup();
    s.bridge.upload.mockResolvedValue({ ok: false, error: { code, message: 'secret-internal-details' } });
    const result = await uploadWorkspaceImage(s.input);
    expect(result.message).toBe(imageUploadErrorMessage(code));
    expect(result.message).not.toContain('secret');
    expect(s.session.getSnapshot().document).toEqual(s.document);
  });

  it('reports successful insertion with unavailable preview truthfully', async () => {
    const s = setup();
    s.bridge.upload.mockResolvedValue({ ok: true, asset: s.asset, runtimeState: { status: 'offline', asset: s.asset } });
    expect((await uploadWorkspaceImage(s.input)).message).toMatch(/adicionada.*temporariamente indisponível/);
    expect(s.session.getSnapshot().document.assets).toHaveLength(1);
    expect(s.runtime.workspace.getSnapshot().assetUrls.size).toBe(0);
  });

  it.each([false, true])('replacement captures target; removed target=%s cannot install runtime data', async (remove) => {
    const s = setup();
    s.bridge.upload.mockResolvedValue(s.success);
    const inserted = await uploadWorkspaceImage(s.input);
    const replacement = { ...s.asset, id: 'replacement' };
    const live = s.session.getSnapshot().document.pages[0].objects.find((object) => object.id === inserted.objectId);
    expect(live?.type).toBe('image');
    if (live?.type !== 'image') return;
    const intent: ImageUploadIntent = {
      type: 'replace',
      objectId: inserted.objectId!,
      expectedImage: projectImageExpectedState(live),
      session: s.session,
      lineage: imageUploadLineage(s.runtime),
    };
    if (remove) s.session.execute({ type: 'object.delete', objectId: inserted.objectId! });
    s.bridge.upload.mockResolvedValue({ ok: true, asset: replacement, runtimeState: { status: 'offline', asset: replacement } });
    const result = await uploadWorkspaceImage({ ...s.input, intent });
    expect(result.message).toMatch(remove ? /Não foi possível vincular/ : /substituída/);
    expect(s.runtime.workspace.getSnapshot().assetRuntimeStates.has(replacement.id)).toBe(!remove);
  });
});

function setupTableCellUpload() {
  let n = 0;
  const createId = () => `table-id-${++n}`;
  const base = createCatalogDocument(createId);
  const table = emptyTable();
  const tableObject: TableObject = {
    id: 'table-object',
    type: 'table',
    frame: { xMm: 10, yMm: 10, widthMm: 120, heightMm: 80 },
    zIndex: 0,
    table,
  };
  const document: CatalogDocument = {
    ...base,
    pages: [{ ...base.pages[0], objects: [tableObject] }],
  };
  const session = createDocumentSession(document, { createId });
  const unavailable = async () => ({ ok: false as const, error: { code: 'OFFLINE' as const } });
  const repository: CatalogRepository = {
    getCatalog: unavailable,
    listCatalogs: unavailable,
    createCatalog: unavailable,
    saveCAS: unavailable,
    archiveCAS: unavailable,
  };
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: { createId },
    createMutationId: createId,
    createOpenSessionId: createId,
    authLineage: 'user',
    authorityScopeId: 'scope',
    autosave: false,
  });
  const asset = { ...W2C_DEMO_ASSETS[0], id: 'table-cell-upload' };
  const cell = table.cells[0];
  const intent: ImageUploadIntent = {
    type: 'table-cell',
    pageId: document.pages[0].id,
    objectId: tableObject.id,
    tableId: table.id,
    cellId: cell.id,
    expectedContent: cell.content,
    expectedContentPresentation: cell.contentPresentation,
    fit: 'cover',
    targetWidthU: mmToU(22),
    targetHeightU: mmToU(13),
    session,
    lineage: imageUploadLineage(runtime),
  };
  let release!: (result: AssetUploadResult) => void;
  const bridge = { upload: vi.fn(() => new Promise<AssetUploadResult>((resolve) => { release = resolve; })) };
  const file = { name: 'cell.png', type: 'image/png', arrayBuffer: vi.fn(async () => new ArrayBuffer(4)) };
  const input = {
    intent,
    file,
    runtime,
    bridge,
    getActivePageId: () => document.pages[0].id,
    isCurrent: () => true,
  };
  const success: AssetUploadResult = {
    ok: true,
    asset,
    runtimeState: { status: 'resolved', asset, url: 'blob:table-cell', expiresAt: 9999999999999 },
  };
  return { document, session, runtime, asset, intent, input, bridge, release: () => release(success) };
}

describe('W4.F.3 shared Image upload orchestration for Table Cells', () => {
  it('uploads through the shared bridge, then links through table.cell.setImage and installs runtime state', async () => {
    const s = setupTableCellUpload();
    const execute = vi.spyOn(s.session, 'execute');
    const resultPromise = uploadWorkspaceImage(s.input);
    await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
    s.release();
    const result = await resultPromise;
    expect(result.message).toBe('Imagem vinculada à célula.');
    const object = s.session.getSnapshot().document.pages[0].objects[0];
    expect(object.type).toBe('table');
    if (object.type !== 'table') return;
    const cell = object.table.cells[0];
    expect(cell.content).toEqual({ type: 'image', assetId: s.asset.id });
    expect(cell.contentPresentation?.image).toEqual({
      fit: 'cover',
      targetWidthMm: 22,
      targetHeightMm: 13,
    });
    expect(execute.mock.calls.some(([action]) => action.type === 'table.cell.setImage')).toBe(true);
    expect(s.runtime.workspace.getSnapshot().assetUrls.get(s.asset.id)).toBe('blob:table-cell');
  });

  it('does not link or install runtime data when target Cell becomes stale while upload is in flight', async () => {
    const s = setupTableCellUpload();
    const promise = uploadWorkspaceImage(s.input);
    await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
    const currentObject = s.session.getSnapshot().document.pages[0].objects[0];
    expect(currentObject.type).toBe('table');
    if (currentObject.type !== 'table') return;
    const currentCell = currentObject.table.cells[0];
    const changed = s.session.execute({
      type: 'table.cell.setContent',
      pageId: s.document.pages[0].id,
      objectId: 'table-object',
      tableId: currentObject.table.id,
      cellId: currentCell.id,
      expectedContent: currentCell.content,
      content: { type: 'technicalCode', value: 'changed-during-upload' },
      allowTypeChange: true,
    });
    expect(changed.ok).toBe(true);
    s.release();
    expect((await promise).message).toMatch(/Não foi possível vincular/);
    const afterObject = s.session.getSnapshot().document.pages[0].objects[0];
    expect(afterObject.type).toBe('table');
    if (afterObject.type !== 'table') return;
    expect(afterObject.table.cells[0].content).toEqual({ type: 'technicalCode', value: 'changed-during-upload' });
    expect(afterObject.table.cells[0].contentPresentation?.image).toBeUndefined();
    expect(s.runtime.workspace.getSnapshot().assetUrls.has(s.asset.id)).toBe(false);
    expect(s.runtime.workspace.getSnapshot().assetRuntimeStates.has(s.asset.id)).toBe(false);
  });
});

function setupStandaloneReplaceUpload(options: { locked?: boolean } = {}) {
  let n = 0;
  const createId = () => `standalone-id-${++n}`;
  const base = createCatalogDocument(createId);
  const primary = { ...W2C_DEMO_ASSETS[0], id: 'standalone-primary' };
  const alternate = { ...W2C_DEMO_ASSETS[1], id: 'standalone-alternate' };
  const document: CatalogDocument = {
    ...base,
    assets: [primary, alternate],
    pages: [{
      ...base.pages[0],
      objects: [
        {
          id: 'standalone-image',
          type: 'image',
          frame: { xMm: 10, yMm: 10, widthMm: 60, heightMm: 40 },
          zIndex: 0,
          ...(options.locked ? { locked: true } : {}),
          assetId: primary.id,
          fit: 'cover',
          focalPoint: { x: 0.2, y: 0.8 },
        },
        {
          id: 'standalone-shape',
          type: 'shape',
          frame: { xMm: 80, yMm: 10, widthMm: 20, heightMm: 20 },
          zIndex: 1,
          shape: 'rectangle',
          style: {},
        },
      ],
    }],
  };
  const session = createDocumentSession(document, { createId });
  const unavailable = async () => ({ ok: false as const, error: { code: 'OFFLINE' as const } });
  const repository: CatalogRepository = {
    getCatalog: unavailable,
    listCatalogs: unavailable,
    createCatalog: unavailable,
    saveCAS: unavailable,
    archiveCAS: unavailable,
  };
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: { createId },
    createMutationId: createId,
    createOpenSessionId: createId,
    authLineage: 'user',
    authorityScopeId: 'scope',
    autosave: false,
  });

  const live = session.getSnapshot().document.pages[0].objects[0];
  if (live.type !== 'image') throw new Error('standalone Image fixture missing');
  const intent: ImageUploadIntent = {
    type: 'replace',
    objectId: live.id,
    expectedImage: projectImageExpectedState(live),
    session,
    lineage: imageUploadLineage(runtime),
  };
  const uploaded = { ...W2C_DEMO_ASSETS[1], id: 'standalone-uploaded' };
  const success: AssetUploadResult = {
    ok: true,
    asset: uploaded,
    runtimeState: {
      status: 'resolved',
      asset: uploaded,
      url: 'blob:standalone-uploaded',
      expiresAt: 9999999999999,
    },
  };
  let release!: (result: AssetUploadResult) => void;
  const bridge = {
    upload: vi.fn(() => new Promise<AssetUploadResult>((resolve) => { release = resolve; })),
  };
  const file = {
    name: 'standalone.png',
    type: 'image/png',
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  };
  const input = {
    intent,
    file,
    runtime,
    bridge,
    getActivePageId: () => document.pages[0].id,
    isCurrent: () => true,
  };
  return {
    document,
    session,
    runtime,
    primary,
    alternate,
    uploaded,
    intent,
    input,
    bridge,
    release: () => release(success),
    createId,
  };
}

describe('W4.F.4 standalone Image replacement upload concurrency', () => {
  it.each(['focal', 'fit', 'asset', 'delete', 'group'] as const)(
    'rejects stale/invalid target after pending upload: %s without canonical/runtime asset leak',
    async (kind) => {
      const s = setupStandaloneReplaceUpload();
      const promise = uploadWorkspaceImage(s.input);
      await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
      const image = s.session.getSnapshot().document.pages[0].objects.find((object) => object.id === 'standalone-image');
      expect(image?.type).toBe('image');
      if (image?.type !== 'image') return;
      if (kind === 'focal' || kind === 'fit') {
        const result = s.session.execute({
          type: 'image.setPresentation',
          objectId: image.id,
          expectedImage: projectImageExpectedState(image),
          fit: kind === 'fit' ? 'contain' : image.fit,
          focalPoint: kind === 'focal' ? { x: 0.75, y: 0.25 } : projectImageExpectedState(image).focalPoint,
        });
        expect(result.ok).toBe(true);
      } else if (kind === 'asset') {
        expect(s.session.execute({
          type: 'image.replace',
          objectId: image.id,
          expectedImage: projectImageExpectedState(image),
          assetId: s.alternate.id,
        }).ok).toBe(true);
      } else if (kind === 'delete') {
        expect(s.session.execute({ type: 'object.delete', objectId: image.id }).ok).toBe(true);
      } else {
        expect(s.session.execute({
          type: 'group.create',
          pageId: s.document.pages[0].id,
          objectIds: [image.id, 'standalone-shape'],
        }).ok).toBe(true);
      }
      const beforeReleaseSequence = s.session.getSnapshot().localSequence;
      s.release();
      const result = await promise;
      expect(result.message).not.toMatch(/Imagem substituída\./);
      expect(s.session.getSnapshot().document.assets.some((asset) => asset.id === s.uploaded.id)).toBe(false);
      expect(s.runtime.workspace.getSnapshot().assetRuntimeStates.has(s.uploaded.id)).toBe(false);
      expect(s.runtime.workspace.getSnapshot().assetUrls.has(s.uploaded.id)).toBe(false);
      expect(s.session.getSnapshot().localSequence).toBe(beforeReleaseSequence);
    }
  );

  it.each(['frame', 'zIndex'] as const)(
    'does not over-CAS %s changes and preserves newer live geometry/order',
    async (kind) => {
      const s = setupStandaloneReplaceUpload();
      const promise = uploadWorkspaceImage(s.input);
      await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
      if (kind === 'frame') {
        expect(s.session.execute({
          type: 'object.move',
          objectId: 'standalone-image',
          xU: mmToU(31),
          yU: mmToU(42),
        }).ok).toBe(true);
      } else {
        expect(s.session.execute({
          type: 'object.reorder',
          objectId: 'standalone-image',
          targetIndex: 1,
        }).ok).toBe(true);
      }
      const beforeRelease = s.session.getSnapshot();
      const liveBefore = beforeRelease.document.pages[0].objects.find((object) => object.id === 'standalone-image');
      expect(liveBefore?.type).toBe('image');
      s.release();
      expect((await promise).message).toMatch(/substituída/);
      const after = s.session.getSnapshot();
      const liveAfter = after.document.pages[0].objects.find((object) => object.id === 'standalone-image');
      expect(liveAfter?.type).toBe('image');
      if (liveBefore?.type !== 'image' || liveAfter?.type !== 'image') return;
      expect(liveAfter.frame).toEqual(liveBefore.frame);
      expect(liveAfter.zIndex).toBe(liveBefore.zIndex);
      expect(liveAfter.assetId).toBe(s.uploaded.id);
      expect(liveAfter.fit).toBe('cover');
      expect(liveAfter.focalPoint).toEqual({ x: 0.2, y: 0.8 });
      expect(after.localSequence).toBe(beforeRelease.localSequence + 1);
      expect(s.runtime.workspace.getSnapshot().assetUrls.get(s.uploaded.id)).toBe('blob:standalone-uploaded');
    }
  );

  it('enforces live lock at link time and installs no runtime state', async () => {
    const s = setupStandaloneReplaceUpload({ locked: true });
    const promise = uploadWorkspaceImage(s.input);
    await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
    const sequence = s.session.getSnapshot().localSequence;
    s.release();
    expect((await promise).message).toMatch(/Não foi possível vincular/);
    expect(s.session.getSnapshot().localSequence).toBe(sequence);
    expect(s.session.getSnapshot().document.assets.some((asset) => asset.id === s.uploaded.id)).toBe(false);
    expect(s.runtime.workspace.getSnapshot().assetRuntimeStates.has(s.uploaded.id)).toBe(false);
  });

  it.each(['auth', 'authority', 'open', 'catalog', 'session', 'unmounted'] as const)(
    'rejects replace lineage/session drift: %s before semantic link',
    async (kind) => {
      const s = setupStandaloneReplaceUpload();
      const promise = uploadWorkspaceImage(s.input);
      await vi.waitFor(() => expect(s.bridge.upload).toHaveBeenCalledTimes(1));
      const workspace = s.runtime.workspace;
      if (kind === 'auth') workspace.updateAuthLineage('other-user');
      if (kind === 'authority') workspace.updateAuthContext('user', 'other-scope');
      if (kind === 'session') {
        workspace.replaceActive(
          createDocumentSession(s.document, { createId: () => 'replacement-session-id' }),
          workspace.getSnapshot().binding
        );
      }
      if (kind === 'open' || kind === 'catalog') {
        const binding = workspace.getSnapshot().binding;
        workspace.replaceActive(
          s.session,
          {
            ...binding,
            ...(kind === 'open'
              ? { openSessionId: 'other-open' }
              : { kind: 'PERSISTED' as const, catalogId: 'other-catalog' }),
          } as typeof binding
        );
      }
      if (kind === 'unmounted') s.input.isCurrent = () => false;
      s.release();
      expect((await promise).message).toMatch(/descartado/);
      expect(s.session.getSnapshot().document.assets.some((asset) => asset.id === s.uploaded.id)).toBe(false);
      expect(workspace.getSnapshot().assetRuntimeStates.has(s.uploaded.id)).toBe(false);
    }
  );
});
