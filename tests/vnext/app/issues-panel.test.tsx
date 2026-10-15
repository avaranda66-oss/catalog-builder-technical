import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, type DocumentSession } from '@/vnext/application';
import { createMinimalW2CTable, createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { IssuesPanel, editorIssues } from '@/vnext/app/editor/IssuesPanel';
import { ISSUE_FIXES, issueFixFor } from '@/vnext/app/editor/issue-fixes';
import { arrivalMessage, locatableIssue } from '@/vnext/app/editor/use-issue-navigation';
import { plainRichText, type CatalogDocument, type Diagnostic, type TableObject } from '@/vnext/domain';

afterEach(cleanup);

function specTable(id: string, values: readonly (readonly string[])[]): TableObject {
  const table = createMinimalW2CTable();
  const columns = values[0].length;
  table.id = `${id}-model`;
  table.columns = Array.from({ length: columns }, (_, index) => ({ ...table.columns[0], id: `${id}-column-${index}` }));
  table.rows = values.map((_, index) => ({ ...table.rows[0], id: `${id}-row-${index}`, role: index === 0 ? 'header' as const : 'body' as const }));
  table.cells = values.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
    const cellId = `${id}-cell-${rowIndex}-${columnIndex}`;
    return {
      id: cellId, rowId: `${id}-row-${rowIndex}`, columnId: `${id}-column-${columnIndex}`,
      content: value ? { type: 'richText' as const, value: plainRichText(`${cellId}-text`, value) } : { type: 'empty' as const },
    };
  }));
  return { id, type: 'table', frame: { xMm: 20, yMm: 40, widthMm: 150, heightMm: 60 }, zIndex: 1, table };
}

function catalog(table = specTable('spec', [['Parâmetro', 'Valor'], ['Faixa', 'A COMPLETAR'], ['', ''], ['Peso', '3 kg']])): CatalogDocument {
  let id = 0;
  const document = createW2CDemoDocument(() => `issues-${++id}`);
  const first = document.pages[0];
  return {
    ...document,
    pages: [
      { ...first, id: 'page-one', objects: [{ id: 'cover-text', type: 'text', frame: { xMm: 20, yMm: 20, widthMm: 120, heightMm: 12 }, zIndex: 0, text: plainRichText('cover', 'TA-25N'), style: {} }] },
      { ...first, id: 'page-two', objects: [table] },
    ],
  };
}

function setup(document = catalog(), diagnostics: Diagnostic[] = [
  { code: 'TEXT_OBJECT_OVERFLOW', severity: 'ERROR', details: 'Text exceeds authored object frame', pageId: 'page-one', objectId: 'cover-text' },
]) {
  const session = createDocumentSession(document, { createId: () => crypto.randomUUID() });
  const onLocate = vi.fn();
  const onMessage = vi.fn();
  const props = { diagnostics, simple: true, onLocate, session, prepare: () => true, onMessage };
  const view = render(<IssuesPanel document={session.getSnapshot().document} {...props} />);
  const rerender = () => view.rerender(<IssuesPanel document={session.getSnapshot().document} {...props} />);
  return { view, session, onLocate, onMessage, rerender };
}

describe('FR-13 issues list', () => {
  it('turns the problem counter into a button listing every page with plain locations', () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Problemas do catálogo: 2 a corrigir · 1 para revisar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('dialog', { name: 'Problemas do catálogo' });
    const pageOne = within(panel).getByRole('region', { name: 'Página 1' });
    const pageTwo = within(panel).getByRole('region', { name: 'Página 2' });
    expect(pageOne).toHaveTextContent('Página 1 · texto 1');
    expect(pageOne).toHaveTextContent('O texto não cabe no espaço reservado.');
    expect(pageTwo).toHaveTextContent('Página 2 · tabela 1 · linha 2, coluna 2');
    expect(pageTwo).toHaveTextContent('Ainda está escrito “A COMPLETAR”.');
    expect(pageTwo).toHaveTextContent('Esta tabela tem 1 linha vazia');
    expect(panel).not.toHaveTextContent(/UNRESOLVED|EMPTY_TABLE_ROW|issues-|spec-cell/);
  });

  it('"Ir até lá" closes the list and asks the editor to show the exact problem', () => {
    const { onLocate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Problemas do catálogo/ }));
    const placeholder = screen.getByText('Página 2 · tabela 1 · linha 2, coluna 2').closest('li')!;
    fireEvent.click(within(placeholder).getByRole('button', { name: 'Ir até lá' }));
    expect(onLocate).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNRESOLVED_PLACEHOLDER', pageId: 'page-two', objectId: 'spec', cellId: 'spec-cell-1-1' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Escape and returns focus to the counter', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /Problemas do catálogo/ });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('removes empty rows with one click, as one step that Desfazer reverts', () => {
    const { session, onMessage, rerender } = setup();
    const before = session.getSnapshot().document;
    fireEvent.click(screen.getByRole('button', { name: /Problemas do catálogo/ }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Remover linhas vazias' })); });
    expect(onMessage).toHaveBeenCalledWith('1 linha vazia removida. Use Desfazer se precisar.');
    const table = session.getSnapshot().document.pages[1].objects[0] as TableObject;
    expect(table.table.rows.map((row) => row.id)).toEqual(['spec-row-0', 'spec-row-1', 'spec-row-3']);
    rerender();
    expect(screen.queryByText(/linha vazia/)).toBeNull();
    expect(session.undo().ok).toBe(true);
    expect(session.getSnapshot().document).toBe(before);
  });

  it('does not offer to delete every row of an empty table, and hides when nothing is left', () => {
    const empty = catalog(specTable('blank', [['', ''], ['', '']]));
    const session = createDocumentSession(empty, { createId: () => crypto.randomUUID() });
    const diagnostic = editorIssues(empty, []).find((issue) => issue.code === 'EMPTY_TABLE_ROW')!;
    expect(diagnostic).toBeDefined();
    expect(issueFixFor({ document: empty, session, diagnostic })).toBeUndefined();
    const clean = catalog(specTable('clean', [['Parâmetro'], ['Faixa']]));
    const { view } = setup(clean, []);
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('FR-13 fix registry and locating', () => {
  it('keeps one-click fixes in a registry keyed by diagnostic code', () => {
    expect(Object.keys(ISSUE_FIXES).sort()).toEqual(['EMPTY_TABLE_ROW', 'TABLE_CONTENT_OVERFLOW']);
    const document = catalog();
    const session: DocumentSession = createDocumentSession(document, { createId: () => crypto.randomUUID() });
    // Without a current measurement the height fix is not offered.
    expect(issueFixFor({ document, session, diagnostic: { code: 'TABLE_CONTENT_OVERFLOW', severity: 'ERROR', details: '', pageId: 'page-two', objectId: 'spec' } })).toBeUndefined();
  });

  it('resolves table-only and grouped diagnostics to the object the editor can select', () => {
    const document = catalog();
    expect(locatableIssue(document, { code: 'TABLE_WIDTH_INFEASIBLE', severity: 'ERROR', details: '', pageId: 'page-two', tableId: 'spec-model' }))
      .toMatchObject({ pageId: 'page-two', objectId: 'spec', groupedChild: false });
    const grouped: CatalogDocument = { ...document, pages: [document.pages[0], { ...document.pages[1], objects: [{
      id: 'group', type: 'group', frame: { xMm: 20, yMm: 40, widthMm: 150, heightMm: 80 }, zIndex: 0, objects: [
        { ...(document.pages[1].objects[0] as TableObject), frame: { xMm: 0, yMm: 0, widthMm: 150, heightMm: 60 } },
        { id: 'caption', type: 'text', frame: { xMm: 0, yMm: 70, widthMm: 150, heightMm: 10 }, zIndex: 1, text: plainRichText('caption', 'Legenda'), style: {} },
      ],
    }] }] };
    expect(locatableIssue(grouped, { code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', details: '', pageId: 'page-two', objectId: 'spec', cellId: 'spec-cell-1-1' }))
      .toMatchObject({ containerGroupId: 'group', topLevelObjectId: 'group', groupedChild: true });
    expect(locatableIssue(document, { code: 'X', severity: 'ERROR', details: '', pageId: 'missing-page', objectId: 'spec' })).toBeUndefined();
  });

  it('tells the person what to do on arrival, pointing to the one-click fix when there is one', () => {
    expect(arrivalMessage({ code: 'EMPTY_TABLE_ROW', severity: 'WARNING', details: 'emptyRows=2' })).toBe(
      'Esta tabela tem 2 linhas vazias, que sairão em branco no PDF. Preencha as linhas ou remova as que sobraram. '
      + 'Para resolver de uma vez, abra a lista de problemas acima da página e use “Remover linhas vazias”.');
    expect(arrivalMessage({ code: 'UNRESOLVED_PLACEHOLDER', severity: 'ERROR', details: 'surface=cell; token=TBD' }))
      .toBe('Ainda está escrito “TBD”. Troque pela informação correta antes de publicar.');
  });
});
