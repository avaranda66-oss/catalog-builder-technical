import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, projectEditableRichText, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import { InMemoryRecoveryRepository, digestCanonicalDocument } from '@/vnext/recovery';
import { recoveryRecord } from '../recovery/fixtures';
import { createW4F3Document, W4F3_OBJECT_ID } from '../proof/fixtures/w4f3-table-document';

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
function unavailable<T>(): Promise<PersistenceResult<T>> {
  return Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
}

function repositoryBase(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  const base: CatalogRepository = {
    listCatalogs: () => unavailable(),
    getCatalog: () => unavailable(),
    createCatalog: () => unavailable(),
    saveCAS: () => unavailable(),
    archiveCAS: () => unavailable(),
  };
  return Object.assign(base, overrides);
}

function envelope(document: CatalogDocument, remoteRevision = 1, lastMutationId = M0): CatalogPersistenceEnvelope {
  return {
    catalogId: document.id,
    remoteRevision,
    lastMutationId,
    title: document.title,
    locale: document.locale,
    createdAt: '2026-09-29T12:00:00.000Z',
    updatedAt: '2026-09-29T12:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999',
    updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null,
    documentSchemaVersion: 1,
    documentSnapshot: document,
  };
}

function ids(prefix: string) {
  let next = 0;
  return () => prefix + '-' + (++next);
}

function runtimeFor(
  repository: CatalogRepository,
  document: CatalogDocument,
  recoveryRepository?: InMemoryRecoveryRepository
) {
  const dependencies: ApplicationExecutionDependencies = { createId: ids('pilot') };
  const session = createDocumentSession(document, dependencies);
  let mutation = 0;
  const openSessionIds = [
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
  ];
  let open = 0;
  const runtime = new VNextPersistenceRuntime({
    session,
    repository,
    applicationDependencies: dependencies,
    createMutationId: () => mutation++ === 0 ? M1 : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    createOpenSessionId: () => openSessionIds[open++] ?? 'abababab-abab-4bab-8bab-abababababab',
    authLineage: 'user-a:0',
    authorityScopeId: 'user-a',
    recoveryRepository,
    binding: envelope(document),
  });
  return { runtime, session };
}

function twoPageTableDocument(): CatalogDocument {
  const document = createW4F3Document();
  document.pages.push({ id: 'pilot-a-second-page', widthMm: 210, heightMm: 297, objects: [] });
  return document;
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('[data-editor-action="' + action + '"]');
  if (!found) throw new Error('Missing editor action ' + action);
  return found;
}

async function waitForEditor(container: HTMLElement): Promise<void> {
  await waitFor(() => expect(container.querySelector('[data-editor-action="add-shape"]')).not.toBeNull());
}

async function selectTableTitle(container: HTMLElement): Promise<HTMLTextAreaElement> {
  await waitForEditor(container);
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="' + W4F3_OBJECT_ID + '"]');
  if (!hit) throw new Error('Missing table hit target');
  fireEvent.pointerDown(hit, { pointerId: 91, button: 0, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId: 91, button: 0, clientX: 100, clientY: 100 });
  return waitFor(() => {
    const input = container.querySelector<HTMLTextAreaElement>('[data-table-title-input]');
    if (!input) throw new Error('Missing table title input');
    return input;
  });
}

function setPageRect(container: HTMLElement, width = 420, height = 594): void {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  });
}

function enableTransformFreePhysicalMeasurement() {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = nativeGetComputedStyle(element, pseudoElement);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform' || property === 'scale' || property === 'translate' || property === 'rotate') return 'none';
        if (property === 'zoom') return '1';
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as CSSStyleDeclaration;
  });
  const originalDecode = HTMLImageElement.prototype.decode;
  const originalGetClientRects = Range.prototype.getClientRects;
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  return () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalGetClientRects;
  };
}

async function openSemanticPanel(container: HTMLElement): Promise<() => void> {
  const restoreMeasurement = enableTransformFreePhysicalMeasurement();
  setPageRect(container);
  await selectTableTitle(container);
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]');
  if (!shell) throw new Error('Missing VNext shell');
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(button(container, 'edit-table'));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
    expect(container.querySelector('[data-table-grid-overlay]')).not.toBeNull();
  });
  fireEvent.click(button(container, 'marker-panel'));
  await waitFor(() => expect(container.querySelector('[data-marker-legend-panel]')).not.toBeNull());
  return restoreMeasurement;
}

function tableObject(document: CatalogDocument) {
  const object = document.pages[0].objects.find((entry) => entry.id === W4F3_OBJECT_ID);
  if (!object || object.type !== 'table') throw new Error('Missing PILOT.A table');
  return object;
}
function tableTitleText(document: CatalogDocument): string | null {
  const title = tableObject(document).table.title;
  return title ? projectEditableRichText(title) : null;
}

function documentWithAnnotation(): CatalogDocument {
  const document = twoPageTableDocument();
  const table = tableObject(document).table;
  table.annotations = [{
    id: 'pilot-a-note',
    kind: 'note',
    text: plainRichText('pilot-a-note-text', 'Nota base'),
  }];
  table.annotationIds = ['pilot-a-note'];
  return document;
}

describe('PILOT.A Table Title authorship trust', () => {
  it('marks a title draft unsaved and general Save canonicalizes and persists it', async () => {
    let request!: SaveCatalogCasRequest;
    const saveCAS = vi.fn((next: SaveCatalogCasRequest) => {
      request = next;
      return Promise.resolve({ ok: true as const, value: envelope(next.documentSnapshot, 2, next.mutationId) });
    });
    const document = createW4F3Document();
    const { runtime, session } = runtimeFor(repositoryBase({ saveCAS }), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);

    fireEvent.change(input, { target: { value: 'Título PILOT.A' } });
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Alterações não salvas');

    fireEvent.click(button(container, 'save'));
    await waitFor(() => expect(saveCAS).toHaveBeenCalledTimes(1));
    expect(tableTitleText(request.documentSnapshot)).toBe('Título PILOT.A');
    expect(tableTitleText(session.getSnapshot().document)).toBe('Título PILOT.A');
    await waitFor(() => expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo'));
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
  });

  it('canonicalizes a valid title before page context change', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);

    fireEvent.change(input, { target: { value: 'Título antes da página' } });
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    expect(pages).toHaveLength(2);
    fireEvent.click(pages[1]);

    expect(tableTitleText(session.getSnapshot().document)).toBe('Título antes da página');
    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe('pilot-a-second-page');
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
  });
  it('preserves a stale title draft and blocks page transition', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);
    const original = tableObject(session.getSnapshot().document);

    fireEvent.change(input, { target: { value: 'Meu título preservado' } });
    act(() => {
      const result = session.execute({
        type: 'table.title.set',
        pageId: document.pages[0].id,
        objectId: original.id,
        tableId: original.table.id,
        expectedTitle: original.table.title ?? null,
        plainText: 'Título externo',
      });
      expect(result.ok).toBe(true);
    });
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);
    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe(document.pages[0].id);
    expect(tableTitleText(session.getSnapshot().document)).toBe('Título externo');
    expect(container.querySelector<HTMLTextAreaElement>('[data-table-title-input]')?.value).toBe('Meu título preservado');
    expect(runtime.workspace.captureRecoveryOverlay()).toMatchObject({
      kind: 'TABLE_TITLE_DRAFT_V1',
      draft: 'Meu título preservado',
    });
  });

  it('blocks title composition and explicit cancel is the only local discard', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);

    fireEvent.change(input, { target: { value: 'Título em composição' } });
    fireEvent.compositionStart(input);
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);

    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe(document.pages[0].id);
    expect(tableTitleText(session.getSnapshot().document)).not.toBe('Título em composição');
    expect(runtime.workspace.getSnapshot().dirty).toBe(true);
    fireEvent.compositionEnd(input);
    fireEvent.click(button(container, 'cancel-table-title-draft'));
    expect(runtime.workspace.getSnapshot().dirty).toBe(false);
    expect(container.querySelector('[data-save-state]')?.textContent).toBe('Salvo');
  });

  it('persists and restores a table title Recovery overlay without activating IME', async () => {
    const recoveryRepository = new InMemoryRecoveryRepository();
    const document = createW4F3Document();
    const active = runtimeFor(repositoryBase(), document, recoveryRepository);
    const view = render(<VNextApp runtime={active.runtime} />);
    const input = await selectTableTitle(view.container);

    fireEvent.change(input, { target: { value: 'Título recuperável' } });
    fireEvent.compositionStart(input);
    await act(async () => active.runtime.recoveryManager?.flush());

    const key = {
      authorityScopeId: 'user-a',
      catalogId: document.id,
      openSessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    const inspection = await recoveryRepository.get(key);
    expect(inspection?.status).toBe('VALID');
    if (!inspection || inspection.status !== 'VALID') throw new Error('Expected valid Recovery');
    expect(inspection.record.authoringRecoveryOverlay).toMatchObject({
      kind: 'TABLE_TITLE_DRAFT_V1',
      draft: 'Título recuperável',
      compositionWasActive: true,
    });
    view.unmount();
    await active.runtime.dispose();

    const reopenRepository = repositoryBase({
      getCatalog: () => Promise.resolve({ ok: true as const, value: envelope(document) }),
    });
    const restoreRepository = new InMemoryRecoveryRepository();
    const table = tableObject(document).table;
    const restoreRecord = await recoveryRecord({
      authorityScopeId: 'user-a',
      catalogId: document.id,
      openSessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      localEditSequence: 0,
      baseRemoteRevision: 1,
      baseRemoteSnapshotDigest: await digestCanonicalDocument(document),
      documentSnapshot: document,
      snapshotDigest: await digestCanonicalDocument(document),
      authoringRecoveryOverlay: {
        kind: 'TABLE_TITLE_DRAFT_V1',
        pageId: document.pages[0].id,
        objectId: W4F3_OBJECT_ID,
        tableId: table.id,
        expectedTitle: table.title ?? null,
        draft: 'Título recuperável',
        compositionWasActive: true,
      },
    });
    await restoreRepository.putIfNewer(restoreRecord);
    const recovered = runtimeFor(reopenRepository, document, restoreRepository);
    const [candidate] = await recovered.runtime.recoveryStartup!.discover('user-a');
    expect(candidate?.decision.kind).toBe('RECOVERABLE_OVER_SAME_REMOTE_BASE');
    expect(await recovered.runtime.recover(candidate!)).toBe(true);

    const restoredView = render(<VNextApp runtime={recovered.runtime} />);
    await waitFor(() => expect(
      restoredView.container.querySelector<HTMLTextAreaElement>('[data-table-title-input]')?.value
    ).toBe('Título recuperável'));
    expect(recovered.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    expect(tableTitleText(recovered.session.getSnapshot().document)).toBe(tableTitleText(document));
  });
  it('preserves an invalid Inspector frame draft when page replacement is attempted', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    await selectTableTitle(container);
    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]');
    if (!x) throw new Error('Missing Inspector x field');

    fireEvent.change(x, { target: { value: 'not-a-number' } });
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);
    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe(document.pages[0].id);
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')?.value).toBe('not-a-number');
    expect(runtime.workspace.captureRecoveryOverlay()).toMatchObject({
      kind: 'INSPECTOR_FRAME_DRAFT_V1',
      draft: { x: 'not-a-number' },
    });
    expect(session.getSnapshot().document.pages[0].objects.some((object) => object.id === W4F3_OBJECT_ID)).toBe(true);
  });

  it('uses the title apply primitive for explicit Save and keeps Remove title canonical', async () => {
    const document = createW4F3Document();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);
    const sequence = session.getSnapshot().localSequence;

    fireEvent.change(input, { target: { value: 'Título explícito' } });
    fireEvent.click(button(container, 'set-table-title'));
    expect(tableTitleText(session.getSnapshot().document)).toBe('Título explícito');
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
    expect(session.getSnapshot().localSequence).toBe(sequence + 1);

    const current = container.querySelector<HTMLTextAreaElement>('[data-table-title-input]');
    if (!current) throw new Error('Missing current title input');
    fireEvent.change(current, { target: { value: 'Rascunho antes de remover' } });
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    fireEvent.click(button(container, 'clear-table-title'));
    expect(tableTitleText(session.getSnapshot().document)).toBeNull();
    expect(runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
    expect(session.getSnapshot().localSequence).toBe(sequence + 2);
  });

  it('preserves a title draft if its table target is deleted before transition', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);
    fireEvent.change(input, { target: { value: 'Título órfão preservado' } });

    act(() => {
      const result = session.execute({ type: 'object.delete', objectId: W4F3_OBJECT_ID });
      expect(result.ok).toBe(true);
    });
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);

    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe(document.pages[0].id);
    expect(runtime.workspace.captureRecoveryOverlay()).toMatchObject({
      kind: 'TABLE_TITLE_DRAFT_V1',
      draft: 'Título órfão preservado',
    });
  });

  it('serializes Title into canonical state before starting an Inspector draft', async () => {
    const document = createW4F3Document();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const input = await selectTableTitle(container);
    fireEvent.change(input, { target: { value: 'Título antes do Inspector' } });
    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]');
    if (!x) throw new Error('Missing Inspector x field');

    fireEvent.focus(x);
    expect(tableTitleText(session.getSnapshot().document)).toBe('Título antes do Inspector');
    const liveX = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]');
    if (!liveX) throw new Error('Missing live Inspector x field');
    fireEvent.change(liveX, { target: { value: '42.5' } });

    expect(tableTitleText(session.getSnapshot().document)).toBe('Título antes do Inspector');
    expect(runtime.workspace.captureRecoveryOverlay()).toMatchObject({
      kind: 'INSPECTOR_FRAME_DRAFT_V1',
      draft: { x: '42.5' },
    });
  });

  it('blocks invalid Inspector draft from replacing the selected object', async () => {
    const document = createW4F3Document();
    const { runtime } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    await selectTableTitle(container);
    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]');
    if (!x) throw new Error('Missing Inspector x field');
    fireEvent.change(x, { target: { value: 'not-a-number' } });

    const other = [...container.querySelectorAll<HTMLElement>('[data-editor-object-id]')]
      .find((entry) => entry.getAttribute('data-editor-object-id') !== W4F3_OBJECT_ID);
    if (!other) throw new Error('Missing alternate object');
    fireEvent.pointerDown(other, { pointerId: 92, button: 0, clientX: 100, clientY: 150 });
    fireEvent.pointerUp(other, { pointerId: 92, button: 0, clientX: 100, clientY: 150 });

    expect(container.querySelector<HTMLElement>('[data-editor-object-id="' + W4F3_OBJECT_ID + '"]')?.getAttribute('data-selected')).toBe('true');
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')?.value).toBe('not-a-number');
  });

  it('bounded annotation check preserves visible input and surfaces stale failure before context change', async () => {
    const document = documentWithAnnotation();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const restoreMeasurement = await openSemanticPanel(container);
    const note = container.querySelector<HTMLTextAreaElement>('[data-annotation-text="pilot-a-note"]');
    if (!note) throw new Error('Missing annotation editor');
    fireEvent.change(note, { target: { value: 'Nota local preservada' } });

    const execute = vi.spyOn(session, 'execute');
    execute.mockReturnValueOnce({
      ok: false,
      error: { code: 'TARGET_STALE', details: 'forced stale annotation for PILOT.A bounded check' },
    });
    fireEvent.blur(note);

    expect(note.value).toBe('Nota local preservada');
    expect(container.textContent).toContain('A anotação mudou. Revise antes de editar.');
    execute.mockRestore();
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);
    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe('pilot-a-second-page');
    restoreMeasurement();
  });

  it('bounded legend check preserves explicit form value and surfaces stale failure before context change', async () => {
    const document = twoPageTableDocument();
    const { runtime, session } = runtimeFor(repositoryBase(), document);
    const { container } = render(<VNextApp runtime={runtime} />);
    const restoreMeasurement = await openSemanticPanel(container);
    const legend = container.querySelector<HTMLTextAreaElement>('[data-legend-text="w4f3-legend-a"]');
    if (!legend) throw new Error('Missing legend editor');
    fireEvent.change(legend, { target: { value: 'Legenda local preservada' } });

    const execute = vi.spyOn(session, 'execute');
    execute.mockReturnValueOnce({
      ok: false,
      error: { code: 'TARGET_STALE', details: 'forced stale legend for PILOT.A bounded check' },
    });
    const update = container.querySelector<HTMLButtonElement>(
      '[data-legend-entry-id="w4f3-legend-a"] [data-editor-action="update-legend"]'
    );
    if (!update) throw new Error('Missing legend update action');
    fireEvent.click(update);

    expect(legend.value).toBe('Legenda local preservada');
    expect(container.textContent).toContain('A tabela mudou. A operação foi cancelada sem alterações parciais.');
    execute.mockRestore();
    const pages = container.querySelectorAll<HTMLButtonElement>('[aria-label="Navegação de páginas"] button');
    fireEvent.click(pages[1]);
    expect(container.querySelector('[data-vnext-shell]')?.getAttribute('data-active-page-id')).toBe('pilot-a-second-page');
    restoreMeasurement();
  });
});
