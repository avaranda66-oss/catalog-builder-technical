import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import type { AssetPersistenceBridge, AssetRef, AssetResolutionResult } from '@/vnext/asset';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { PagePanel } from '@/vnext/app/editor/PagePanel';
import { pageThumbnailDiagnostics, pageThumbnailShadowRoot } from '@/vnext/app/editor/PageThumbnail';
import { PageTemplateGallery } from '@/vnext/app/editor/PageTemplateGallery';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';
import { pageTitle } from '@/vnext/editor/page-title';
import { PRESYS_ARCHETYPES, presysDocumentStyle } from '@/vnext/library/presys-archetypes';
import { bindPresysPageReuse, DefaultStarterDependencyPreparer } from '@/vnext/library/starter-dependencies';
import { createPresysPageTemplateRegistry, PRESYS_STARTER } from '@/vnext/library/presys-ta25n-starter';

/** IntersectionObserver stand-in: every observed host whose index is in `visible` is reported on screen. */
let visibleHosts: (host: Element, order: number) => boolean = () => true;
let observedCount = 0;
class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    const order = observedCount++;
    this.callback([{ isIntersecting: visibleHosts(target, order), target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

beforeEach(() => {
  visibleHosts = () => true;
  observedCount = 0;
  pageThumbnailDiagnostics.reset();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function text(id: string, content: string, yMm: number, fontSizePt = 12): EditorialObject {
  return {
    id, type: 'text', frame: { xMm: 20, yMm, widthMm: 150, heightMm: 14 }, zIndex: 0, text: plainRichText(id, content),
    style: { fontFamily: 'Noto Sans', fontSizePt, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
  };
}

function documentOf(pageCount: number): CatalogDocument {
  let next = 0;
  const base = createW2CDemoDocument(() => `doc-${++next}`);
  return {
    ...base,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      id: `page-${index + 1}`, widthMm: 210, heightMm: 297,
      objects: [text(`note-${index + 1}`, `Observação ${index + 1}`, 20, 9), text(`title-${index + 1}`, `Título exclusivo ${index + 1}`, 40, 24)],
    })),
  };
}

function Host({ session }: { session: DocumentSession }) {
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [current, setCurrent] = React.useState(snapshot.document.pages[0].id);
  return (
    <PagePanel pages={snapshot.document.pages} currentPageId={current} session={session} prepareForChange={() => true}
      onSelectPage={setCurrent} onAddPage={() => undefined} onStatus={() => undefined}
      thumbnails={{ document: snapshot.document, assetUrls: new Map() }} />
  );
}

const hosts = () => [...document.querySelectorAll<HTMLElement>('[data-page-thumbnail]')];

describe('pageTitle (FR-18 label)', () => {
  it('uses the text in the largest letters, then the top-most one, shortened', () => {
    const page = documentOf(1).pages[0];
    expect(pageTitle(page)).toBe('Título exclusivo 1');
    expect(pageTitle({ ...page, objects: [text('a', 'Primeiro', 30), text('b', 'Segundo', 10)] })).toBe('Segundo');
    expect(pageTitle({ ...page, objects: [] })).toBe('');
    expect(pageTitle({ ...page, objects: [text('long', 'Calibradores de temperatura de bloco seco da linha avançada', 10)] }))
      .toBe('Calibradores de temperatura de bloco seco da li…');
  });
});

describe('PagePanel thumbnails (FR-18)', () => {
  it('shows a named thumbnail per page while the button keeps its plain name', async () => {
    const session = createDocumentSession(documentOf(3), { createId: () => crypto.randomUUID() });
    render(<Host session={session} />);
    const nav = screen.getByRole('navigation', { name: 'Navegação de páginas' });
    const second = within(nav).getByRole('button', { name: 'Página 2' });
    expect(second).toHaveAttribute('title', 'Título exclusivo 2');
    expect(second.querySelector('[data-page-title]')).toHaveAttribute('data-page-title', 'Título exclusivo 2');
    await waitFor(() => expect(hosts().map((host) => host.getAttribute('data-thumbnail-state'))).toEqual(['rendered', 'rendered', 'rendered']));
    const shadow = pageThumbnailShadowRoot(hosts()[1]);
    expect(shadow?.querySelector('[data-editorial-root] [data-page-id="page-2"]')).toBeTruthy();
    expect(shadow?.textContent).toContain('Título exclusivo 2');
    // The drawn page never leaks into the editor's own page or its searches.
    expect(screen.queryByText('Título exclusivo 2')).toBeNull();
    expect(document.querySelector('[data-page-id="page-2"]')).toBeNull();
    expect(hosts().every((host) => host.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('draws only the pages on screen and caches each page by its content', async () => {
    visibleHosts = (_host, order) => order < 3;
    const session = createDocumentSession(documentOf(10), { createId: () => crypto.randomUUID() });
    render(<Host session={session} />);
    await waitFor(() => expect(pageThumbnailDiagnostics.draws).toBe(3));
    expect(hosts().filter((host) => host.getAttribute('data-thumbnail-state') === 'rendered')).toHaveLength(3);
    expect(hosts().filter((host) => host.getAttribute('data-thumbnail-state') === 'waiting')).toHaveLength(7);

    // Editing page 2 redraws page 2 only; the other on-screen pages keep their drawing.
    const title = session.getSnapshot().document.pages[1].objects[1] as Extract<EditorialObject, { type: 'text' }>;
    act(() => {
      expect(session.execute({ type: 'text.setContent', objectId: 'title-2', expectedText: title.text, plainText: 'Título novo 2' }).ok).toBe(true);
    });
    await waitFor(() => expect(pageThumbnailDiagnostics.draws).toBe(4));
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('title', 'Título novo 2');
    expect(pageThumbnailShadowRoot(hosts()[1])?.textContent).toContain('Título novo 2');
  });

  it('draws nothing where the browser cannot tell what is on screen', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('IntersectionObserver', undefined);
    const session = createDocumentSession(documentOf(2), { createId: () => crypto.randomUUID() });
    render(<Host session={session} />);
    expect(hosts().map((host) => host.getAttribute('data-thumbnail-state'))).toEqual(['waiting', 'waiting']);
    expect(pageThumbnailDiagnostics.draws).toBe(0);
  });

  it('keeps the plain icon list when no thumbnails are requested', () => {
    const session = createDocumentSession(documentOf(2), { createId: () => crypto.randomUUID() });
    render(<PagePanel pages={session.getSnapshot().document.pages} currentPageId="page-1" session={session} prepareForChange={() => true}
      onSelectPage={() => undefined} onAddPage={() => undefined} onStatus={() => undefined} />);
    expect(hosts()).toHaveLength(0);
    expect(document.querySelectorAll('.vnext-page-icon')).toHaveLength(2);
  });
});

describe('"Usar modelo…" gallery (FR-80/FR-18)', () => {
  it('lists every PRESYS page model by name with a thumbnail and its description', async () => {
    const onChange = vi.fn();
    render(<PageTemplateGallery value={PRESYS_ARCHETYPES[0].templateId} onChange={onChange} />);
    const gallery = screen.getByRole('group', { name: 'Modelo de página PRESYS' });
    const radios = within(gallery).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      ...PRESYS_ARCHETYPES.map((archetype) => archetype.templateId), 'presys-ta25n-presentation-a4', 'presys-ta25n-specifications-a4',
    ]);
    expect(within(gallery).getByRole('radio', { name: 'Capa' })).toBeChecked();
    expect(within(gallery).getByRole('radio', { name: 'Código de pedido' })).toHaveAccessibleDescription('Estrutura do código, tabela de opções por campo e um exemplo de pedido.');
    fireEvent.click(within(gallery).getByRole('radio', { name: 'Contracapa' }));
    expect(onChange).toHaveBeenCalledWith('presys-p9-contracapa');
    await waitFor(() => expect(hosts().filter((host) => host.getAttribute('data-thumbnail-state') === 'rendered')).toHaveLength(11));
  });
});

describe('EditorWorkspace inserts a PRESYS archetype page (FR-80)', () => {
  it('Esc closes the gallery and returns to "Usar modelo…"', () => {
    const templates = createPresysPageTemplateRegistry();
    const doc: CatalogDocument = { schemaVersion: 1, id: 'doc-esc', title: 'Catálogo', locale: 'pt-BR', style: presysDocumentStyle(), assets: [],
      pages: [{ id: 'first', widthMm: 210, heightMm: 297, objects: [] }] };
    const session = createDocumentSession(doc, { createId: () => crypto.randomUUID(), templateRegistry: templates });
    const preparer = new DefaultStarterDependencyPreparer({ finalizeUpload: vi.fn(), resolve: vi.fn() } as unknown as AssetPersistenceBridge, async () => new Uint8Array());
    bindPresysPageReuse(session, { templates, preparer, getLineage: () => ({ authLineage: 'A:1', authorityScopeId: 'scope:A', openSessionId: 'open-A', catalogId: doc.id }), isCurrent: () => true, installRuntimeAsset: vi.fn() });
    render(<EditorWorkspace session={session} simpleByDefault />);
    const opener = screen.getByRole('button', { name: 'Usar modelo…' });
    fireEvent.click(opener);
    const gallery = screen.getByRole('group', { name: 'Modelo de página PRESYS' });
    expect(gallery).toHaveAccessibleDescription('Escolha um modelo e clique em “Inserir modelo”. A página nova entra depois da página atual.');
    const capa = within(gallery).getByRole('radio', { name: 'Capa' });
    capa.focus();
    fireEvent.keyDown(capa, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Modelo de página PRESYS' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Usar modelo…' }));
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  });

  const bytes = new Uint8Array(readFileSync('public/assets/presys/ta-25n-starter-v1.png'));
  const asset: AssetRef = { ...PRESYS_STARTER.sourceDocument.assets[0], id: '00000000-0000-4000-8000-0000000000aa' };

  it('chooses "Contracapa" in the gallery and inserts it after the current page, with Desfazer', async () => {
    const templates = createPresysPageTemplateRegistry();
    const doc: CatalogDocument = { schemaVersion: 1, id: 'doc', title: 'Catálogo', locale: 'pt-BR', style: presysDocumentStyle(), assets: [],
      pages: [{ id: 'first', widthMm: 210, heightMm: 297, objects: [text('cover', 'Capa do catálogo', 30, 26)] }] };
    let next = 0;
    const session = createDocumentSession(doc, { createId: () => `generated-${++next}`, templateRegistry: templates });
    const resolve = vi.fn(async (): Promise<AssetResolutionResult> => ({ ok: true, state: { status: 'resolved', asset, url: 'blob:test', expiresAt: Date.now() + 60000 } }));
    const preparer = new DefaultStarterDependencyPreparer({ finalizeUpload: vi.fn(async () => ({ ok: true as const, asset })), resolve } as unknown as AssetPersistenceBridge, async () => bytes);
    bindPresysPageReuse(session, { templates, preparer, getLineage: () => ({ authLineage: 'A:1', authorityScopeId: 'scope:A', openSessionId: 'open-A', catalogId: doc.id }), isCurrent: () => true, installRuntimeAsset: vi.fn() });

    render(<EditorWorkspace session={session} simpleByDefault />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar modelo…' }));
    const gallery = screen.getByRole('group', { name: 'Modelo de página PRESYS' });
    fireEvent.click(within(gallery).getByRole('radio', { name: 'Contracapa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Inserir modelo após a página atual' }));

    const pages = session.getSnapshot().document.pages;
    expect(pages).toHaveLength(2);
    expect(JSON.stringify(pages[1].objects)).toContain('Seu distribuidor:');
    expect(screen.getByText('Modelo inserido como página nova, depois da página atual. Para voltar, use Desfazer.')).toBeInTheDocument();
    // In the simple editor the gallery closes once the page is in.
    expect(screen.queryByRole('group', { name: 'Modelo de página PRESYS' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Usar modelo…' })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Navegação de páginas' })).getByRole('button', { name: 'Página 2' }))
      .toHaveAttribute('aria-current', 'page'));
    act(() => { expect(session.undo().ok).toBe(true); });
    expect(session.getSnapshot().document.pages).toHaveLength(1);
  });
});
