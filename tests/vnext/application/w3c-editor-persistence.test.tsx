import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, projectEditableRichText, type ApplicationExecutionDependencies } from '@/vnext/application';
import {
  resolveKnownW2CDemoAssetUrls,
  W2C_DEMO_ASSETS,
  W2C_PRIMARY_ASSET_ID,
} from '@/vnext/app/editor-defaults';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';

const A_ID = '11111111-1111-4111-8111-111111111111';
const B_ID = '22222222-2222-4222-8222-222222222222';
const M0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const M1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
function textDocument(id = A_ID, title = 'Catalog A', content = 'Modelo'): CatalogDocument {
  return {
    schemaVersion: 1,
    id,
    title,
    locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: {
        fontFamily: 'Noto Sans',
        fontSizePt: 10,
        lineHeight: 1.2,
        fontWeight: 400,
        color: '#172033',
      },
      palette: ['#172033'],
    },
    pages: [{
      id: `page-${id.slice(0, 4)}`,
      widthMm: 210,
      heightMm: 297,
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        text: plainRichText('text-local', content),
        style: {
          fontFamily: 'Noto Sans',
          fontSizePt: 12,
          lineHeight: 1.2,
          fontWeight: 700,
          color: '#172033',
          textAlign: 'left',
        },
      }],
    }],
    assets: [],
  };
}

function twoPageTextDocument(): CatalogDocument {
  const first = textDocument();
  return {
    ...first,
    pages: [
      ...first.pages,
      { id: 'page-second', widthMm: 210, heightMm: 297, objects: [] },
    ],
  };
}

function envelope(
  document: CatalogDocument,
  remoteRevision = 1,
  lastMutationId = M0
): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-12T17:00:00.000Z',
    updatedAt: '2026-09-12T17:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function repositoryBase(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    listCatalogs: () => unavailable(),
    getCatalog: () => unavailable(),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
    ...overrides,
  };
}

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function runtimeFor(repository: CatalogRepository, document = textDocument()) {
  const dependencies: ApplicationExecutionDependencies = { createId: ids('generated') };
  const session = createDocumentSession(document, dependencies);
  let open = 0;
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: dependencies,
    createMutationId: () => M1,
    createOpenSessionId: () => `open-${++open}`,
    authLineage: 'user-a:0',
    binding: envelope(document),
  });
  return { runtime, session };
}

function setPageRect(container: HTMLElement): void {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 420,
    bottom: 594,
    width: 420,
    height: 594,
    toJSON: () => ({}),
  });
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(`[data-editor-action="${action}"]`);
  if (!element) throw new Error(`Missing editor action ${action}`);
  return element;
}

function beginTextEdit(container: HTMLElement): HTMLTextAreaElement {
  setPageRect(container);
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]');
  if (!hit) throw new Error('Missing text hit target');
  fireEvent.pointerDown(hit, { pointerId: 80, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId: 80, button: 0, clientX: 80, clientY: 80 });
  fireEvent.click(button(container, 'edit-text'));
  const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]');
  if (!textarea) throw new Error('Missing Text draft textarea');
  return textarea;
}

function authoredText(document: CatalogDocument): string | null {
  const object = document.pages[0].objects.find((entry) => entry.id === 'text-target');
  if (!object || object.type !== 'text') throw new Error('Missing text object');
  return projectEditableRichText(object.text);
}

describe('W3.C Father-visible Save integration', () => {
  it('L17 commits a valid visible draft before snapshot and reports Saved only after ACK', async () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return pending.promise;
    });
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    const { container } = render(<VNextApp runtime={runtime} />);

    const textarea = beginTextEdit(container);
    fireEvent.change(textarea, { target: { value: 'Texto visível salvo' } });
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Unsaved changes');

    fireEvent.click(button(container, 'save'));
    expect(saveCAS).toHaveBeenCalledTimes(1);
    expect(authoredText(request.documentSnapshot)).toBe('Texto visível salvo');
    expect(authoredText(session.getSnapshot().document)).toBe('Texto visível salvo');
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    await waitFor(() => expect(container.querySelector('[data-save-state]')?.textContent).toBe('Saving…'));

    pending.resolve({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) });
    await waitFor(() => expect(container.querySelector('[data-save-state]')?.textContent).toBe('Saved'));
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);

    fireEvent.click(button(container, 'undo'));
    expect(authoredText(session.getSnapshot().document)).toBe('Modelo');
  });

  it('L17b blocks Save during IME composition and preserves the visible draft', () => {
    const saveCAS = vi.fn();
    const { runtime } = runtimeFor(repositoryBase({ saveCAS }));
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);

    fireEvent.change(textarea, { target: { value: 'まだ入力中' } });
    fireEvent.compositionStart(textarea);
    fireEvent.click(button(container, 'save'));

    expect(saveCAS).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('まだ入力中');
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Unsaved changes');
    expect(container.textContent).toContain('Conclua a composição de texto antes de salvar.');
  });

  it('BLOCKED-DRAFT-CANCEL clears a resolved authoring block and immediately projects Saved', () => {
    const saveCAS = vi.fn();
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    const acknowledgedDocument = session.getSnapshot().document;
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);

    fireEvent.change(textarea, { target: { value: 'Ainda compondo' } });
    fireEvent.compositionStart(textarea);
    fireEvent.click(button(container, 'save'));

    expect(saveCAS).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Ainda compondo');
    expect(runtime.workspace.getSnapshot()).toMatchObject({
      dirty: true,
      save: { phase: 'blocked', label: 'Unsaved changes', dirty: true },
    });
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);

    fireEvent.click(button(container, 'cancel-text'));

    const resolved = runtime.workspace.getSnapshot();
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(session.getSnapshot().document).toBe(acknowledgedDocument);
    expect(resolved.dirty).toBe(false);
    expect(resolved.save).toMatchObject({ phase: 'idle', label: 'Saved', dirty: false });
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);
    expect(resolved.dirty || runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Saved');
  });

  it('clears only the authoring block when cancelling a draft over an already dirty canonical edit', () => {
    const saveCAS = vi.fn();
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    const original = session.getSnapshot().document.pages[0].objects[0];
    if (original.type !== 'text') throw new Error('Expected Text');
    act(() => {
      expect(session.execute({
        type: 'text.setContent',
        objectId: original.id,
        expectedText: original.text,
        plainText: 'Canonical dirty',
      }).ok).toBe(true);
    });
    const dirtyCanonicalDocument = session.getSnapshot().document;
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);

    fireEvent.change(textarea, { target: { value: 'Draft temporário' } });
    fireEvent.compositionStart(textarea);
    fireEvent.click(button(container, 'save'));
    expect(saveCAS).not.toHaveBeenCalled();
    expect(runtime.workspace.getSnapshot().save.phase).toBe('blocked');

    fireEvent.click(button(container, 'cancel-text'));

    const resolved = runtime.workspace.getSnapshot();
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(session.getSnapshot().document).toBe(dirtyCanonicalDocument);
    expect(authoredText(session.getSnapshot().document)).toBe('Canonical dirty');
    expect(resolved.dirty).toBe(true);
    expect(resolved.save).toMatchObject({ phase: 'idle', label: 'Unsaved changes', dirty: true });
  });

  it('composition end invalidates the obsolete authoring blocker while the remaining draft stays dirty', () => {
    const pending = deferred<PersistenceResult<CatalogPersistenceEnvelope>>();
    const saveCAS = vi.fn(() => pending.promise);
    const { runtime } = runtimeFor(repositoryBase({ saveCAS }));
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);

    fireEvent.change(textarea, { target: { value: 'Composição concluída' } });
    fireEvent.compositionStart(textarea);
    fireEvent.click(button(container, 'save'));
    expect(saveCAS).not.toHaveBeenCalled();
    expect(runtime.workspace.getSnapshot().save.phase).toBe('blocked');

    fireEvent.compositionEnd(textarea);

    const recovered = runtime.workspace.getSnapshot();
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Composição concluída');
    expect(recovered.dirty).toBe(true);
    expect(recovered.save).toMatchObject({ phase: 'idle', label: 'Unsaved changes', dirty: true, canSave: true });
    expect(recovered.save.message).toBeUndefined();

    fireEvent.click(button(container, 'save'));
    expect(saveCAS).toHaveBeenCalledTimes(1);
  });

  it('draft-state notification preserves a non-authoring blocked condition', () => {
    const { runtime } = runtimeFor(repositoryBase());
    runtime.workspace.setPhase('blocked', 'Canonical snapshot failed validation');

    runtime.workspace.notifyDraftStateChanged();

    expect(runtime.workspace.getSnapshot().save).toMatchObject({
      phase: 'blocked',
      label: 'Unsaved changes',
      dirty: true,
      message: 'Canonical snapshot failed validation',
    });
  });

  it('L17b blocks an invalid control-character draft and preserves it visibly', () => {
    const saveCAS = vi.fn();
    const { runtime } = runtimeFor(repositoryBase({ saveCAS }));
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);
    const invalidDraft = 'Inválido' + String.fromCharCode(1);

    fireEvent.change(textarea, { target: { value: invalidDraft } });
    fireEvent.click(button(container, 'save'));

    expect(saveCAS).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe(invalidDraft);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Unsaved changes');
  });

  it('L17b blocks a stale draft after canonical Text changes and preserves the draft', () => {
    const saveCAS = vi.fn();
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }));
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);
    const original = session.getSnapshot().document.pages[0].objects[0];
    if (original.type !== 'text') throw new Error('Expected Text');

    act(() => {
      expect(session.execute({
        type: 'text.setContent',
        objectId: original.id,
        expectedText: original.text,
        plainText: 'Canonical newer',
      }).ok).toBe(true);
    });
    fireEvent.change(textarea, { target: { value: 'Draft antigo preservado' } });
    fireEvent.click(button(container, 'save'));

    expect(saveCAS).not.toHaveBeenCalled();
    expect(authoredText(session.getSnapshot().document)).toBe('Canonical newer');
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Draft antigo preservado');
    expect(container.textContent).toContain('rascunho estava aberto');
  });

  it('DIRTY-DRAFT-CANCEL republishes Saved after page activation discards the only visible draft', () => {
    const document = twoPageTextDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const acknowledgedDocument = session.getSnapshot().document;
    const { container } = render(<VNextApp runtime={runtime} />);
    const textarea = beginTextEdit(container);

    fireEvent.change(textarea, { target: { value: 'Discard this draft' } });
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Unsaved changes');

    const pageButtons = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    expect(pageButtons).toHaveLength(2);
    fireEvent.click(pageButtons[1]);

    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(session.getSnapshot().document).toBe(acknowledgedDocument);
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(runtime.workspace.getSnapshot().save.label).toBe('Saved');
    expect(runtime.saveCoordinator.hasUnresolvedActiveMutation()).toBe(false);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Saved');
  });
});

describe('W3.C workspace remount/session isolation', () => {
  it('REOPEN-4 remounts the workspace so subsequent actions mutate B only and history is fresh', async () => {
    const documentB = textDocument(B_ID, 'Catalog B', 'B persisted');
    const getCatalog = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: envelope(documentB, 4, M0),
    }));
    const { runtime, session: sessionA } = runtimeFor(repositoryBase({ getCatalog }));
    const { container } = render(<VNextApp runtime={runtime} />);
    const aBefore = sessionA.getSnapshot().document;

    await act(async () => {
      const result = await runtime.reopenCoordinator.open(B_ID);
      expect(result.ok).toBe(true);
    });

    const sessionB = runtime.workspace.getSnapshot().session;
    expect(sessionB).not.toBe(sessionA);
    expect(sessionB.getSnapshot()).toMatchObject({
      canUndo: false,
      canRedo: false,
      localSequence: 0,
    });
    expect(button(container, 'undo')).toBeDisabled();

    fireEvent.click(button(container, 'add-shape'));
    expect(runtime.workspace.getSnapshot().session).toBe(sessionB);
    expect(sessionB.getSnapshot().document.pages[0].objects).toHaveLength(2);
    expect(sessionA.getSnapshot().document).toBe(aBefore);
    expect(sessionA.getSnapshot().document.pages[0].objects).toHaveLength(1);
  });
});

describe('W3.C degraded asset reopen seam', () => {
  it('preserves a mismatched AssetRef and does not borrow a demo URL from an id-only collision', () => {
    const original = W2C_DEMO_ASSETS.find((asset) => asset.id === W2C_PRIMARY_ASSET_ID);
    expect(original).toBeDefined();
    if (!original) throw new Error('W2.C demo asset fixture unavailable');
    const degraded = { ...original, sha256: 'f'.repeat(64) };
    const document = { ...textDocument(), assets: [degraded] };

    const urls = resolveKnownW2CDemoAssetUrls(document);

    expect(urls.has(W2C_PRIMARY_ASSET_ID)).toBe(false);
    expect(document.assets[0]).toEqual(degraded);
    expect(document.assets[0]?.sha256).toBe('f'.repeat(64));
  });
});
