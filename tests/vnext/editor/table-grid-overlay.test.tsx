import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePlans } from '@/vnext/rendering';
import { mmToU } from '@/vnext/domain';
import { TableGridOverlay } from '@/vnext/app/table-grid-overlay';
import { tableCellSelection, tableSelectionIdentity, type TableSelection } from '@/vnext/editor/table-selection';
import { createW4ATableDocument, W4A_OBJECT_ID, W4A_PAGE_ID, W4A_TABLE_ID } from '../proof/fixtures/w4a-table-document';

afterEach(cleanup);

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
});

function setup(sequence = 0) {
  const document = createW4ATableDocument();
  const object = document.pages[0].objects[0];
  if (object.type !== 'table') throw new Error('Missing Table fixture');
  const table = object.table;
  const plan = compilePlans(document).plans.get(table.id)!;
  plan.rowQ = [640, 720, 800];
  plan.gridOffsetYQ = 160;
  const identity = tableSelectionIdentity(W4A_PAGE_ID, W4A_OBJECT_ID, W4A_TABLE_ID);
  const initial = tableCellSelection(identity, { rowId: table.rows[0].id, columnId: table.columns[0].id });
  const changes: TableSelection[] = [];
  const stale = vi.fn();
  const activate = vi.fn();

  function Harness({ localSequence }: { localSequence: number }) {
    const [selection, setSelection] = React.useState<TableSelection>(initial);
    return <TableGridOverlay
      table={table}
      plan={plan}
      identity={identity}
      selection={selection}
      localSequence={localSequence}
      pageWidthU={mmToU(document.pages[0].widthMm)}
      pageHeightU={mmToU(document.pages[0].heightMm)}
      onSelectionChange={(next) => { changes.push(next); setSelection(next); }}
      onStaleGesture={stale}
      onActivateCell={activate}
    />;
  }

  const rendered = render(<Harness localSequence={sequence} />);
  const cells = [...rendered.container.querySelectorAll<HTMLElement>('[data-table-cell]')];
  cells.forEach((cell) => {
    const [row, column] = cell.dataset.tableCell!.split(':').map(Number);
    const left = column * 100;
    const top = row * 40;
    cell.getBoundingClientRect = () => ({
      x: left, y: top, left, top, right: left + 100, bottom: top + 40,
      width: 100, height: 40, toJSON: () => ({}),
    });
  });
  return { ...rendered, document, Harness, changes, stale, activate, initial };
}

describe('W4.A visible Table grid gesture state', () => {
  it('selects a first touch without editing when the browser inherits a double click from a toolbar tap', () => {
    const { container, changes, activate } = setup();
    const cell = container.querySelector<HTMLElement>('[data-table-cell="0:1"]')!;
    fireEvent.pointerDown(cell, { pointerId: 20, pointerType: 'touch', button: 0, clientX: 110, clientY: 10 });
    fireEvent.pointerUp(cell, { pointerId: 20, pointerType: 'touch', clientX: 110, clientY: 10 });
    fireEvent.doubleClick(cell, { detail: 2 });
    expect(changes.at(-1)).toMatchObject({ focus: { columnId: 'w4a-column-b' } });
    expect(activate).not.toHaveBeenCalled();
  });

  it('requires consecutive touches on the same cell for touch editing and preserves mouse double click', () => {
    const { container, activate } = setup();
    const tap = (target: HTMLElement, x: number, pointerId: number) => {
      fireEvent.pointerDown(target, { pointerId, pointerType: 'touch', button: 0, clientX: x, clientY: 10 });
      fireEvent.pointerUp(target, { pointerId, pointerType: 'touch', clientX: x, clientY: 10 });
    };
    const first = container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!;
    const second = container.querySelector<HTMLElement>('[data-table-cell="0:1"]')!;
    tap(first, 10, 21);
    tap(second, 110, 22);
    fireEvent.doubleClick(second, { detail: 2 });
    expect(activate).not.toHaveBeenCalled();
    tap(second, 110, 23);
    fireEvent.doubleClick(second, { detail: 2 });
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(first, { pointerId: 24, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(first, { pointerId: 24, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.doubleClick(first, { detail: 2 });
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a stale touch on the same cell for a later inherited double click', () => {
    const { container, activate } = setup();
    const cell = container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!;
    for (const [pointerId, completedAt] of [[25, 100], [26, 1100]]) {
      fireEvent.pointerDown(cell, { pointerId, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
      const event = new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'touch', clientX: 10, clientY: 10 } as PointerEventInit);
      Object.defineProperty(event, 'timeStamp', { value: completedAt });
      fireEvent(cell, event);
    }
    fireEvent.doubleClick(cell, { detail: 2 });
    expect(activate).not.toHaveBeenCalled();
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('restores the prior selection on %s without document mutation', (eventName) => {
    const { container, document, changes, initial } = setup();
    const before = JSON.stringify(document);
    const start = container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!;
    fireEvent.pointerDown(start, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(start, { pointerId: 7, pointerType: 'mouse', clientX: 110, clientY: 45 });
    expect(changes.at(-1)?.kind).toBe('range');
    fireEvent[eventName](start, { pointerId: 7, pointerType: 'mouse' });
    expect(changes.at(-1)).toEqual(initial);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('discards a stale completion after localSequence changes and keeps touch scrolling from becoming a drag', () => {
    const { container, rerender, Harness, changes, stale, initial } = setup();
    const start = container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!;
    fireEvent.pointerDown(start, { pointerId: 8, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(start, { pointerId: 8, pointerType: 'mouse', clientX: 110, clientY: 45 });
    rerender(<Harness localSequence={1} />);
    expect(stale).toHaveBeenCalledTimes(1);
    expect(changes.at(-1)).toEqual(initial);

    const count = changes.length;
    const touch = container.querySelector<HTMLElement>('[data-table-cell="0:0"]')!;
    fireEvent.pointerDown(touch, { pointerId: 9, pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(touch, { pointerId: 9, pointerType: 'touch', clientX: 80, clientY: 80 });
    fireEvent.pointerUp(touch, { pointerId: 9, pointerType: 'touch', clientX: 80, clientY: 80 });
    expect(changes).toHaveLength(count);
  });
});
