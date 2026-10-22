import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { LAST_PAGE_MESSAGE, PagePanel } from '@/vnext/app/editor/PagePanel';
import { plainRichText, type CatalogDocument, type EditorialObject } from '@/vnext/domain';

afterEach(cleanup);

function ids(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function text(id: string, content: string, yMm: number): EditorialObject {
  return {
    id, type: 'text', frame: { xMm: 20, yMm, widthMm: 80, heightMm: 12 }, zIndex: 0, text: plainRichText(id, content),
    style: { fontFamily: 'Noto Sans', fontSizePt: 12, lineHeight: 1.2, fontWeight: 700, color: '#172033', textAlign: 'left' },
  };
}

function shape(id: string): EditorialObject {
  return { id, type: 'shape', frame: { xMm: 20, yMm: 60, widthMm: 40, heightMm: 20 }, zIndex: 1, shape: 'rectangle', style: { fill: '#edf5ff' } };
}

function threePageDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('doc'));
  return {
    ...base,
    pages: [
      { id: 'page-cover', widthMm: 210, heightMm: 297, objects: [text('cover-title', 'Capa TA-25N', 20)] },
      { id: 'page-specs', widthMm: 210, heightMm: 297, objects: [text('specs-title', 'Especificações', 20), text('specs-note', 'Nota', 200), shape('specs-box')] },
      { id: 'page-extra', widthMm: 210, heightMm: 297, objects: [] },
    ],
  };
}

function Host({ session, prepareForChange = () => true }: { session: DocumentSession; prepareForChange?: () => boolean }) {
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [current, setCurrent] = React.useState(snapshot.document.pages[0].id);
  const [status, setStatus] = React.useState('');
  const live = snapshot.document.pages.some((page) => page.id === current) ? current : snapshot.document.pages[0].id;
  return (
    <>
      <PagePanel pages={snapshot.document.pages} currentPageId={live} session={session} prepareForChange={prepareForChange}
        onSelectPage={setCurrent} onAddPage={() => undefined} onStatus={setStatus} />
      <p role="status">{status}</p>
    </>
  );
}

function setup(document = threePageDocument(), prepareForChange?: () => boolean) {
  const session = createDocumentSession(document, { createId: ids('generated') });
  const view = render(<Host session={session} prepareForChange={prepareForChange} />);
  return { session, view };
}

const pageOrder = (session: DocumentSession) => session.getSnapshot().document.pages.map((page) => page.id);
const openMenu = (pageNumber: number) => fireEvent.click(screen.getByRole('button', { name: `Opções da Página ${pageNumber}` }));
const status = () => screen.getByRole('status').textContent;

describe('PagePanel (FR-11)', () => {
  it('keeps the page buttons and gives every page its own "⋯" menu', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Navegação de páginas' });
    expect(within(nav).getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page');
    expect(nav.querySelectorAll('[data-page-nav-id]')).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: `Opções da Página ${n}` })).toHaveAttribute('aria-haspopup', 'menu');
    }
    openMenu(2);
    const menu = screen.getByRole('menu', { name: 'Opções da Página 2' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Duplicar página', 'Mover para cima', 'Mover para baixo', 'Excluir página…',
    ]);
    expect(within(menu).getByRole('menuitem', { name: 'Duplicar página' })).toHaveFocus();
  });

  it('duplicates a page right after it, opens the copy, and Desfazer removes it', () => {
    const { session } = setup();
    openMenu(2);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar página' }));
    const order = pageOrder(session);
    expect(order).toHaveLength(4);
    expect(order.slice(0, 2)).toEqual(['page-cover', 'page-specs']);
    expect(order[3]).toBe('page-extra');
    expect(screen.getByRole('button', { name: 'Página 3' })).toHaveAttribute('aria-current', 'page');
    expect(session.getSnapshot().document.pages[2].objects).toHaveLength(3);
    expect(status()).toBe('Página 2 duplicada. A cópia é a Página 3. Para voltar, use Desfazer.');
    expect(screen.queryByRole('menu')).toBeNull();

    expect(session.undo().ok).toBe(true);
    expect(pageOrder(session)).toEqual(['page-cover', 'page-specs', 'page-extra']);
  });

  it('moves pages up and down with one undoable step each', () => {
    const { session } = setup();
    openMenu(1);
    expect(screen.getByRole('menuitem', { name: 'Mover para cima' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para baixo' }));
    expect(pageOrder(session)).toEqual(['page-specs', 'page-cover', 'page-extra']);
    expect(status()).toBe('Página 1 movida para baixo. Agora ela é a Página 2.');
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');

    openMenu(3);
    expect(screen.getByRole('menuitem', { name: 'Mover para baixo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para cima' }));
    expect(pageOrder(session)).toEqual(['page-specs', 'page-extra', 'page-cover']);

    expect(session.undo().ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(pageOrder(session)).toEqual(['page-cover', 'page-specs', 'page-extra']);
  });

  it('asks before deleting, naming the page and what is on it; Cancelar and Esc keep it', () => {
    const { session } = setup();
    openMenu(2);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir página…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Excluir a Página 2?' });
    expect(dialog).toHaveAccessibleDescription(
      'Ela começa com “Especificações”. Ela tem 3 objetos: 2 textos e 1 forma. Tudo o que está nela será excluído. Se mudar de ideia, use Desfazer (Ctrl+Z).'
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(pageOrder(session)).toHaveLength(3);

    openMenu(2);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir página…' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(pageOrder(session)).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Opções da Página 2' })).toHaveFocus();
  });

  it('deletes the current page, opens its neighbour, and Desfazer brings it back', () => {
    const { session } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    openMenu(2);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir página…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Página 2' }));
    expect(pageOrder(session)).toEqual(['page-cover', 'page-extra']);
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');
    expect(session.getSnapshot().document.pages[1].id).toBe('page-extra');
    expect(status()).toBe('Página 2 excluída. Para recuperar, use Desfazer.');

    expect(session.undo().ok).toBe(true);
    expect(pageOrder(session)).toEqual(['page-cover', 'page-specs', 'page-extra']);
    expect(session.getSnapshot().document.pages[1].objects).toHaveLength(3);
  });

  it('explains clearly that the last page cannot be deleted', () => {
    const base = threePageDocument();
    const { session } = setup({ ...base, pages: [base.pages[0]] });
    openMenu(1);
    const item = screen.getByRole('menuitem', { name: 'Excluir página…' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('O catálogo precisa ter pelo menos uma página.');
    fireEvent.click(item);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(status()).toBe(LAST_PAGE_MESSAGE);
    expect(pageOrder(session)).toHaveLength(1);
  });

  it('supports the keyboard: arrows move in the menu and Esc returns to "⋯"', () => {
    setup();
    openMenu(1);
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Duplicar página' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Mover para baixo' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Excluir página…' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Duplicar página' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Opções da Página 1' })).toHaveFocus();
  });

  it('closes the menu when clicking elsewhere', () => {
    setup();
    openMenu(1);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does nothing while an open edit cannot be concluded', () => {
    const prepare = vi.fn(() => false);
    const { session } = setup(threePageDocument(), prepare);
    const before = session.getSnapshot().document;
    openMenu(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar página' }));
    openMenu(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para baixo' }));
    openMenu(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir página…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Página 1' }));
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(session.getSnapshot().document).toBe(before);
  });
});
