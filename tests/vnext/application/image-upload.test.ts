import { describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession } from '@/vnext/application';
import { VNextPersistenceRuntime, type CatalogRepository } from '@/vnext/persistence';
import type { AssetUploadResult } from '@/vnext/asset';
import { imageUploadErrorMessage, imageUploadLineage, uploadWorkspaceImage, type ImageUploadIntent } from '@/vnext/app/image-upload';
import { W2C_DEMO_ASSETS } from '@/vnext/app/editor-defaults';

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
    const intent: ImageUploadIntent = { type: 'replace', objectId: inserted.objectId!, session: s.session, lineage: imageUploadLineage(s.runtime) };
    if (remove) s.session.execute({ type: 'object.delete', objectId: inserted.objectId! });
    s.bridge.upload.mockResolvedValue({ ok: true, asset: replacement, runtimeState: { status: 'offline', asset: replacement } });
    const result = await uploadWorkspaceImage({ ...s.input, intent });
    expect(result.message).toMatch(remove ? /Não foi possível vincular/ : /substituída/);
    expect(s.runtime.workspace.getSnapshot().assetRuntimeStates.has(replacement.id)).toBe(!remove);
  });
});
