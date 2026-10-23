import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { compilePlans } from '@/vnext/rendering';
import { mmToU } from '@/vnext/domain';
import { createDocumentSession } from '@/vnext/application';
import { TableGridOverlay } from '@/vnext/app/table-grid-overlay';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { resetStageZoomStore } from '@/vnext/app/editor/use-stage-zoom';
import { tableCellSelection, tableSelectionIdentity } from '@/vnext/editor/table-selection';
import { createW4ATableDocument, W4A_OBJECT_ID, W4A_PAGE_ID, W4A_TABLE_ID } from '../../proof/fixtures/w4a-table-document';
import { ACTORS, seededStore, testRuntime, viewerOf } from './arsenal-doubles';

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  window.localStorage.clear();
  resetStageZoomStore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Onda 4.5 — "Guardar tabela no arsenal…" no menu da tabela', () => {
  it('fica no fim do menu do botão direito, separado dos comandos da grade', () => {
    const document = createW4ATableDocument();
    const object = document.pages[0].objects[0];
    if (object.type !== 'table') throw new Error('Missing Table fixture');
    const plan = compilePlans(document).plans.get(object.table.id)!;
    // jsdom has no layout: the same measured rows as the grid tests.
    plan.rowQ = [640, 720, 800];
    plan.gridOffsetYQ = 160;
    const identity = tableSelectionIdentity(W4A_PAGE_ID, W4A_OBJECT_ID, W4A_TABLE_ID);
    const onSelect = vi.fn();
    const { container } = render(<TableGridOverlay table={object.table} plan={plan} identity={identity}
      selection={tableCellSelection(identity, { rowId: object.table.rows[0].id, columnId: object.table.columns[0].id })}
      localSequence={0} pageWidthU={mmToU(210)} pageHeightU={mmToU(297)}
      onSelectionChange={vi.fn()} onStaleGesture={vi.fn()} onGridCommand={vi.fn()}
      menuExtras={[{ id: 'save-to-arsenal', label: 'Guardar tabela no arsenal…', onSelect }]} />);
    fireEvent.contextMenu(container.querySelector('[data-table-cell="0:1"]')!);
    const menu = screen.getByRole('menu', { name: 'Ações da tabela' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.at(-1)).toHaveTextContent('Guardar tabela no arsenal…');
    expect(within(menu).getAllByRole('separator').length).toBeGreaterThan(0);
    fireEvent.click(items.at(-1)!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sem extras o menu fica como antes', () => {
    const document = createW4ATableDocument();
    const object = document.pages[0].objects[0];
    if (object.type !== 'table') throw new Error('Missing Table fixture');
    const plan = compilePlans(document).plans.get(object.table.id)!;
    // jsdom has no layout: the same measured rows as the grid tests.
    plan.rowQ = [640, 720, 800];
    plan.gridOffsetYQ = 160;
    const identity = tableSelectionIdentity(W4A_PAGE_ID, W4A_OBJECT_ID, W4A_TABLE_ID);
    const { container } = render(<TableGridOverlay table={object.table} plan={plan} identity={identity}
      selection={tableCellSelection(identity, { rowId: object.table.rows[0].id, columnId: object.table.columns[0].id })}
      localSequence={0} pageWidthU={mmToU(210)} pageHeightU={mmToU(297)}
      onSelectionChange={vi.fn()} onStaleGesture={vi.fn()} onGridCommand={vi.fn()} />);
    fireEvent.contextMenu(container.querySelector('[data-table-cell="0:1"]')!);
    expect(screen.queryByRole('menuitem', { name: /arsenal/ })).toBeNull();
  });

  it('no editor, a tabela selecionada oferece "Guardar tabela no arsenal…" e o diálogo avisa dos valores', async () => {
    const session = createDocumentSession(createW4ATableDocument(), { createId: (() => { let n = 0; return () => `w4a-new-${++n}`; })() });
    const { store } = await seededStore();
    const runtime = testRuntime(store.as({ ...ACTORS.author }), viewerOf(ACTORS.author));
    const { container } = render(<EditorWorkspace session={session} simpleByDefault arsenal={runtime} />);
    const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]')!;
    page.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 420, bottom: 594, width: 420, height: 594, toJSON: () => ({}) });
    const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${W4A_OBJECT_ID}"]`)!;
    fireEvent.pointerDown(hit, { pointerId: 7, button: 0, clientX: 60, clientY: 60 });
    fireEvent.pointerUp(hit, { pointerId: 7, button: 0, clientX: 60, clientY: 60 });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tabela no arsenal…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Guardar no arsenal' });
    expect(runtime.capture.calls[0].source).toEqual({ kind: 'table', objectId: W4A_OBJECT_ID });
    expect(within(dialog).getByText(/A tabela vai sem valores/)).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Manter os valores/ })).not.toBeChecked();
  });
});
