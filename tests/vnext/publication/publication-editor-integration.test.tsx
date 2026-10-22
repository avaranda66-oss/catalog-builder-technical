import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type ApplicationExecutionDependencies } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  VNextPersistenceRuntime,
  type CatalogPersistenceEnvelope,
  type CatalogRepository,
  type PersistenceResult,
  type SaveCatalogCasRequest,
} from '@/vnext/persistence';
import type { PublicationReviewResult, PublicationSource } from '@/vnext/publication/review';

/**
 * FR-50 / FR-13 / FR-12 integration: real editor, real persistence runtime and save coordinator; only the browser
 * measurement pipeline of the review is replaced (it needs real fonts and layout).
 */
const checks = vi.hoisted(() => ({ review: vi.fn(), verify: vi.fn(), release: vi.fn() }));
vi.mock('@/vnext/publication/review', async original => ({ ...await original<object>(),
  reviewPublication: checks.review, verifyPublicationForPrint: checks.verify, releasePublicationResources: checks.release }));

const CATALOG_ID = '11111111-1111-4111-8111-111111111111';
const M0 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  vi.resetAllMocks();
  checks.review.mockImplementation(async (source: PublicationSource): Promise<PublicationReviewResult> => ({ status: 'READY', document: source.document,
    plans: new Map(), urls: new Map(), diagnostics: [], snapshot: { facts: [], geometryDiagnostics: [] } }));
  if (typeof globalThis.PointerEvent === 'undefined') {
    class MockPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) { super(type, params); this.pointerId = params.pointerId ?? 1; }
    }
    globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  }
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

function text(id: string, value: string, yMm: number) {
  return { id, type: 'text' as const, frame: { xMm: 20, yMm, widthMm: 120, heightMm: 14 }, zIndex: 0, text: plainRichText(`${id}-rich`, value),
    style: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400 as const, color: '#172033', textAlign: 'left' as const } };
}

function catalog(secondText = 'Faixa: A COMPLETAR'): CatalogDocument {
  return {
    schemaVersion: 1, id: CATALOG_ID, title: 'TA-25N — Ficha técnica', locale: 'pt-BR',
    style: {
      fonts: [{ family: 'Noto Sans', revision: '5.3.0', weight: 400, style: 'normal' }],
      defaultText: { fontFamily: 'Noto Sans', fontSizePt: 10, lineHeight: 1.2, fontWeight: 400, color: '#172033' },
      palette: ['#172033'],
    },
    pages: [
      { id: 'page-first', widthMm: 210, heightMm: 297, objects: [text('first-text', 'TA-25N', 30)] },
      { id: 'page-second', widthMm: 210, heightMm: 297, objects: [text('second-text', secondText, 60)] },
    ],
    assets: [],
  };
}

function envelope(document: CatalogDocument, remoteRevision = 1, lastMutationId = M0): CatalogPersistenceEnvelope {
  return { catalogId: document.id, remoteRevision, lastMutationId, title: document.title, locale: document.locale,
    createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z',
    createdBy: '99999999-9999-4999-8999-999999999999', updatedBy: '99999999-9999-4999-8999-999999999999',
    archivedAt: null, documentSchemaVersion: 1, documentSnapshot: document };
}

function harness(saveCAS: CatalogRepository['saveCAS'], document = catalog()) {
  const unavailable = <T,>(): Promise<PersistenceResult<T>> => Promise.resolve({ ok: false, error: { code: 'REMOTE_FAILURE' } });
  const repository: CatalogRepository = { listCatalogs: unavailable, getCatalog: unavailable, createCatalog: unavailable, saveCAS, archiveCAS: unavailable };
  let next = 0;
  const dependencies: ApplicationExecutionDependencies = { createId: () => `generated-${++next}` };
  const session = createDocumentSession(document, dependencies);
  const runtime = new VNextPersistenceRuntime({
    session, repository, applicationDependencies: dependencies,
    createMutationId: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    createOpenSessionId: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    authLineage: 'user-a:0', authorityScopeId: 'user-a', binding: envelope(document),
  });
  // Same rule as bootstrap.tsx: only a saved, idle version can be reviewed.
  const getPublicationSource = (): PublicationSource | undefined => {
    const snapshot = runtime.workspace.getSnapshot(), binding = snapshot.binding;
    if (binding.kind !== 'PERSISTED' || snapshot.dirty || snapshot.save.phase !== 'idle' || runtime.saveCoordinator.hasUnresolvedActiveMutation()) return undefined;
    return { document: snapshot.session.getSnapshot().document, remoteRevision: binding.remoteRevision, openSessionId: binding.openSessionId,
      authLineage: 'user-a:0', authorityScopeId: 'user-a', assetUrls: snapshot.assetUrls };
  };
  const view = render(<VNextApp runtime={runtime} simpleByDefault getPublicationSource={getPublicationSource} />);
  return { view, runtime, session };
}

/** Runs without React's test batching, so updates are scheduled as in a real browser. */
async function asInBrowser(run: () => Promise<void>): Promise<void> {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await run();
  } finally {
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

function publishButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('[data-editor-action="publish"]');
  if (!button) throw new Error('Missing Publicar / PDF');
  return button;
}

describe('FR-50 Publicar saves first and never gets stuck', () => {
  it('saves the last edit, then opens the review on the saved version', async () => {
    let resolveSave!: (value: PersistenceResult<CatalogPersistenceEnvelope>) => void;
    const saveCAS = vi.fn((request: SaveCatalogCasRequest) => new Promise<PersistenceResult<CatalogPersistenceEnvelope>>((resolve) => {
      resolveSave = resolve; void request;
    }));
    const { view, session } = harness(saveCAS);
    await waitFor(() => expect(publishButton(view.container)).toBeInTheDocument());
    act(() => { expect(session.execute({ type: 'document.rename', title: 'TA-25N — revisado' }).ok).toBe(true); });
    const button = publishButton(view.container);
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(saveCAS).toHaveBeenCalledOnce());
    expect(button).toHaveTextContent('Salvando…');
    expect(button).not.toBeDisabled();
    expect(document.querySelector('[data-publication-host]')).toBeNull();
    expect(checks.review).not.toHaveBeenCalled();
    const request = saveCAS.mock.calls[0][0];
    await act(async () => { resolveSave({ ok: true, value: envelope(request.documentSnapshot, 2, request.mutationId) }); });
    await waitFor(() => expect(document.querySelector('[data-publication-host]')).toHaveAttribute('data-publication-status', 'READY'));
    expect(checks.review).toHaveBeenCalledOnce();
    expect(checks.review.mock.calls[0][0]).toMatchObject({ remoteRevision: 2, document: { title: 'TA-25N — revisado' } });
    expect(button).toHaveTextContent('Publicar / PDF');
  });

  it('does not open a review it cannot finish when the save fails, and says why near the top', async () => {
    const saveCAS = vi.fn(() => Promise.resolve<PersistenceResult<CatalogPersistenceEnvelope>>({ ok: false, error: { code: 'OFFLINE' } }));
    const { view, session } = harness(saveCAS);
    await waitFor(() => expect(publishButton(view.container)).toBeInTheDocument());
    act(() => { session.execute({ type: 'document.rename', title: 'Sem conexão' }); });
    await act(async () => { fireEvent.click(publishButton(view.container)); });
    await waitFor(() => expect(saveCAS).toHaveBeenCalled());
    const notices = view.container.querySelector<HTMLElement>('[data-editor-notices]')!;
    await waitFor(() => expect(within(notices).getByRole('status')).toHaveTextContent('Para publicar, o catálogo precisa estar salvo'));
    expect(document.querySelector('[data-publication-host]')).toBeNull();
  });
});

describe('FR-13 "Corrigir este item" and the issues list reach the object', () => {
  it('closes the review, goes to the page and selects the object', async () => {
    checks.review.mockImplementation(async (source: PublicationSource): Promise<PublicationReviewResult> => ({ status: 'BLOCKED', document: source.document,
      plans: new Map(), urls: new Map(), diagnostics: [{ code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', details: 'surface=text; token=A COMPLETAR',
        pageId: 'page-second', objectId: 'second-text' }] }));
    const { view } = harness(vi.fn());
    await waitFor(() => expect(publishButton(view.container)).toBeInTheDocument());
    await act(async () => { fireEvent.click(publishButton(view.container)); });
    const dialog = await within(document.body).findByRole('dialog', { name: 'Revisar e publicar' });
    expect(within(dialog).getByText('Página 2 · texto 1')).toBeInTheDocument();
    // Simple mode (the father's editor): no "Detalhes técnicos" with internal codes under the item.
    expect(within(dialog).queryByText('Detalhes técnicos')).toBeNull();
    // Click as a browser does (outside act), so React schedules the page change the way it really does.
    await asInBrowser(async () => {
      within(dialog).getByRole('button', { name: 'Corrigir este item' }).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await waitFor(() => expect(document.querySelector('[data-publication-host]')).toBeNull());
      await waitFor(() => expect(view.container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', 'page-second'));
    });
    const shell = view.container.querySelector('[data-vnext-shell]')!;
    await waitFor(() => expect(shell).toHaveAttribute('data-active-page-id', 'page-second'));
    const target = view.container.querySelector<HTMLElement>('[data-editor-object-id="second-text"]')!;
    expect(target).toHaveAttribute('data-selected', 'true');
    // Keyboard focus reaches the object on the other page (not "Publicar / PDF", where Enter would reopen the review).
    await waitFor(() => expect(document.activeElement).toBe(target));
    // The side list only shows layout problems, so the message area says what to fix on arrival.
    const notices = view.container.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(within(notices).getByRole('status')).toHaveTextContent('Ainda está escrito “A COMPLETAR”. Troque pela informação correta antes de publicar.');
  });

  it('shows the provisional text in the editor counter and "Ir até lá" selects it', async () => {
    const { view } = harness(vi.fn());
    const counter = await within(view.container).findByRole('button', { name: 'Problemas do catálogo: 1 a corrigir · 0 para revisar' });
    fireEvent.click(counter);
    const panel = within(view.container).getByRole('dialog', { name: 'Problemas do catálogo' });
    expect(panel).toHaveTextContent('Ainda está escrito “A COMPLETAR”.');
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: 'Ir até lá' })); });
    const shell = view.container.querySelector('[data-vnext-shell]')!;
    await waitFor(() => expect(shell).toHaveAttribute('data-active-page-id', 'page-second'));
    expect(view.container.querySelector('[data-editor-object-id="second-text"]')).toHaveAttribute('data-selected', 'true');
  });
});

describe('FR-12 messages appear above the page, not at the end of the side panel', () => {
  it('shows the delete confirmation in the fixed area right under the top bar', async () => {
    const { view } = harness(vi.fn(), catalog('Faixa: 20 a 140 °C'));
    await waitFor(() => expect(publishButton(view.container)).toBeInTheDocument());
    const page = view.container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
    page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
    const hit = view.container.querySelector<HTMLElement>('[data-editor-object-id="first-text"]')!;
    fireEvent.pointerDown(hit, { pointerId: 7, button: 0, clientX: 60, clientY: 70 });
    fireEvent.pointerUp(hit, { pointerId: 7, button: 0, clientX: 60, clientY: 70 });
    fireEvent.click(view.container.querySelector<HTMLButtonElement>('[data-editor-action="delete"]')!);
    const notices = view.container.querySelector<HTMLElement>('[data-editor-notices]')!;
    expect(within(notices).getByRole('status')).toHaveTextContent('Objeto excluído.');
    const topbar = view.container.querySelector('.vnext-topbar')!, workspace = view.container.querySelector('.vnext-workspace')!;
    expect(topbar.compareDocumentPosition(notices) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notices.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(view.container.querySelector('.vnext-info .vnext-live-status')).toBeNull();
  });
});
