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
  return { ...rendered, document, Harness, changes, stale, initial };
}

describe('W4.A visible Table grid gesture state', () => {
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
