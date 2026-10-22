import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalogDocument, createDocumentSession, type DocumentSession } from '@/vnext/application';
import { CATALOG_TITLE_MESSAGES, CatalogTitleButton } from '@/vnext/app/editor/CatalogTitleButton';

function idSequence() {
  let next = 0;
  return () => {
    next += 1;
    return `00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`;
  };
}

function newSession(title = 'TA-25N — Ficha técnica'): DocumentSession {
  const createId = idSequence();
  return createDocumentSession(createCatalogDocument(createId, title), { createId });
}

/** Mirrors the editor: the title always comes from the live session snapshot. */
function LiveTitle({ session, disabled }: { readonly session: DocumentSession; readonly disabled?: boolean }) {
  const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <CatalogTitleButton session={session} title={snapshot.document.title} disabled={disabled} />;
}

function titleButton() {
  return screen.getByRole('button', { name: /TA-25N|PCON-Y18|Catálogo/ });
}

describe('FR-02 editor title renames the open catalog in place', () => {
  afterEach(() => cleanup());

  it('shows the name as a heading the person can click', () => {
    render(<LiveTitle session={newSession()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'TA-25N — Ficha técnica' })).toBeInTheDocument();
    expect(titleButton()).toHaveAccessibleDescription(CATALOG_TITLE_MESSAGES.hint);
  });

  it('renames through one undoable document.rename on the live session when Enter is pressed', () => {
    const session = newSession();
    const execute = vi.spyOn(session, 'execute');
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    const input = screen.getByRole('textbox', { name: 'Nome do catálogo' });
    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription(CATALOG_TITLE_MESSAGES.editingHint);
    fireEvent.change(input, { target: { value: '  PCON-Y18\tFicha técnica  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: 'document.rename', title: 'PCON-Y18 Ficha técnica' });
    expect(session.getSnapshot().document.title).toBe('PCON-Y18 Ficha técnica');
    expect(screen.getByRole('heading', { level: 1, name: 'PCON-Y18 Ficha técnica' })).toBeInTheDocument();
    act(() => {
      expect(session.undo().ok).toBe(true);
    });
    expect(session.getSnapshot().document.title).toBe('TA-25N — Ficha técnica');
  });

  it('saves on blur too, but only once', () => {
    const session = newSession();
    const execute = vi.spyOn(session, 'execute');
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    const input = screen.getByRole('textbox', { name: 'Nome do catálogo' });
    fireEvent.change(input, { target: { value: 'Catálogo de calibradores' } });
    fireEvent.blur(input);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().document.title).toBe('Catálogo de calibradores');
  });

  it('cancels with Esc and keeps the previous name', () => {
    const session = newSession();
    const execute = vi.spyOn(session, 'execute');
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    const input = screen.getByRole('textbox', { name: 'Nome do catálogo' });
    fireEvent.change(input, { target: { value: 'Nome que desisti' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(session.getSnapshot().document.title).toBe('TA-25N — Ficha técnica');
  });

  it('refuses an empty name with a plain message and keeps the old one', () => {
    const session = newSession();
    const execute = vi.spyOn(session, 'execute');
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    const input = screen.getByRole('textbox', { name: 'Nome do catálogo' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(CATALOG_TITLE_MESSAGES.empty);
    expect(screen.getByRole('heading', { level: 1, name: 'TA-25N — Ficha técnica' })).toBeInTheDocument();
  });

  it('does not create an undo step when the name did not change', () => {
    const session = newSession();
    const execute = vi.spyOn(session, 'execute');
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nome do catálogo' }), { key: 'Enter' });
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().canUndo).toBe(false);
  });

  it('explains when the session refuses the rename', () => {
    const session = newSession();
    vi.spyOn(session, 'execute').mockReturnValue({
      ok: false,
      error: { code: 'INVALID_ACTION', details: 'refused' },
    } as unknown as ReturnType<DocumentSession['execute']>);
    render(<LiveTitle session={session} />);
    fireEvent.click(titleButton());
    const input = screen.getByRole('textbox', { name: 'Nome do catálogo' });
    fireEvent.change(input, { target: { value: 'Outro nome' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(CATALOG_TITLE_MESSAGES.failed);
  });

  it('cannot be edited while disabled', () => {
    render(<LiveTitle session={newSession()} disabled />);
    expect(titleButton()).toBeDisabled();
    fireEvent.click(titleButton());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('gives back the negative side margins in max-width, so a short name is not cut with "..."', () => {
    // The browser check (1366 and 1280 px) showed "Teste X e Y" as "Teste X...": the h1 shrinks to the button's
    // margin box (14 px narrower than the button) and max-width: 100% then cut the button by those 14 px.
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(process.cwd(), 'src/vnext/app/editor/entry-and-title.css'), 'utf8');
    document.head.append(style);
    try {
      render(<LiveTitle session={newSession('Teste X e Y')} />);
      const computed = getComputedStyle(screen.getByRole('button', { name: /Teste X e Y/ }));
      const sideMargins = -parseFloat(computed.marginLeft) - parseFloat(computed.marginRight);
      expect(sideMargins).toBe(14);
      expect(computed.maxWidth.replace(/\s+/g, '')).toBe(`calc(100%+${sideMargins}px)`);
    } finally {
      style.remove();
    }
  });
});
