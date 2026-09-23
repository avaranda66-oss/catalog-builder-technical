import React from 'react';
import { qCss, type TableModel } from '../domain';
import type { TablePlan } from '../rendering';
import {
  canonicalTablePoint,
  normalizeTableSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  wholeTableSelection,
  type TableSelection,
  type TableSelectionIdentity,
  type TableSelectionPoint,
} from '../editor/table-selection';

interface DragState {
  pointerId: number;
  sourceSequence: number;
  anchor: TableSelectionPoint;
  before: TableSelection;
  startX: number;
  startY: number;
  touch: boolean;
  moved: boolean;
}

export interface TableGridOverlayProps {
  table: TableModel;
  plan: TablePlan;
  identity: TableSelectionIdentity;
  selection: TableSelection;
  localSequence: number;
  onSelectionChange(selection: TableSelection): void;
  onStaleGesture(): void;
  onActivateCell?(point: TableSelectionPoint): void;
  onCopyClipboard?(event: React.ClipboardEvent<HTMLDivElement>): void;
  onPasteClipboard?(event: React.ClipboardEvent<HTMLDivElement>): void;
  editingCellId?: string;
}

function cumulative(values: readonly number[]): number[] {
  const result = [0];
  for (const value of values) result.push(result[result.length - 1] + value);
  return result;
}

export function TableGridOverlay({
  table,
  plan,
  identity,
  selection,
  localSequence,
  onSelectionChange,
  onStaleGesture,
  onActivateCell,
  onCopyClipboard,
  onPasteClipboard,
  editingCellId,
}: TableGridOverlayProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const rows = plan.rowQ ?? [];
  const columns = plan.trackQ;
  const x = cumulative(columns);
  const y = cumulative(rows);
  const gridOffsetYQ = plan.gridOffsetYQ ?? 0;
  const normalized = normalizeTableSelection(table, selection);

  React.useLayoutEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [identity.objectId]);

  React.useEffect(() => {
    const drag = dragRef.current;
    if (!drag || drag.sourceSequence === localSequence) return;
    dragRef.current = null;
    onSelectionChange(drag.before);
    onStaleGesture();
  }, [localSequence, onSelectionChange, onStaleGesture]);

  if (rows.length !== table.rows.length || columns.length !== table.columns.length || !normalized) return null;

  const selectCell = (point: TableSelectionPoint, extend: boolean) => {
    const canonical = canonicalTablePoint(table, point);
    if (!canonical) return;
    const anchor = extend && (selection.kind === 'cell' || selection.kind === 'range')
      ? selection.anchor
      : canonical;
    const focus = extend ? point : canonical;
    onSelectionChange(tableRangeSelection(identity, anchor, focus));
  };

  const pointAtClient = (clientX: number, clientY: number): TableSelectionPoint | undefined => {
    const targets = rootRef.current?.querySelectorAll<HTMLElement>('[data-table-cell]') ?? [];
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      const [rowIndex, columnIndex] = (target.dataset.tableCell ?? '').split(':').map(Number);
      const row = table.rows[rowIndex];
      const column = table.columns[columnIndex];
      if (row && column) return { rowId: row.id, columnId: column.id };
    }
    return undefined;
  };

  const beginCellDrag = (event: React.PointerEvent<HTMLButtonElement>, point: TableSelectionPoint) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const canonical = canonicalTablePoint(table, point);
    if (!canonical) return;
    const anchor = event.shiftKey && (selection.kind === 'cell' || selection.kind === 'range')
      ? selection.anchor
      : canonical;
    const touch = event.pointerType === 'touch';
    dragRef.current = {
      pointerId: event.pointerId,
      sourceSequence: localSequence,
      anchor,
      before: selection,
      startX: event.clientX,
      startY: event.clientY,
      touch,
      moved: false,
    };
    if (!touch) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onSelectionChange(tableRangeSelection(identity, anchor, event.shiftKey ? point : canonical));
    }
  };

  const moveCellDrag = (event: React.PointerEvent<HTMLButtonElement>, point: TableSelectionPoint) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.sourceSequence !== localSequence) {
      dragRef.current = null;
      onSelectionChange(drag.before);
      onStaleGesture();
      return;
    }
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) drag.moved = true;
    if (drag.touch) return;
    const focus = pointAtClient(event.clientX, event.clientY) ?? point;
    if (canonicalTablePoint(table, focus)) onSelectionChange(tableRangeSelection(identity, drag.anchor, focus));
  };

  const finishCellDrag = (event: React.PointerEvent<HTMLButtonElement>, point: TableSelectionPoint) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.sourceSequence !== localSequence) {
      onSelectionChange(drag.before);
      onStaleGesture();
      return;
    }
    if (drag.touch && !drag.moved) selectCell(pointAtClient(event.clientX, event.clientY) ?? point, event.shiftKey);
  };

  const cancelCellDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    onSelectionChange(drag.before);
  };

  const highlightStyle: React.CSSProperties = {
    left: qCss(x[normalized.columnStart]),
    top: qCss(gridOffsetYQ + y[normalized.rowStart]),
    width: qCss(x[normalized.columnEnd + 1] - x[normalized.columnStart]),
    height: qCss(y[normalized.rowEnd + 1] - y[normalized.rowStart]),
  };

  return (
    <div
      ref={rootRef}
      className="vnext-table-grid-overlay"
      data-table-grid-overlay=""
      data-table-id={table.id}
      data-local-sequence={localSequence}
      role="grid"
      aria-label="Grade da tabela"
      tabIndex={0}
      onCopy={onCopyClipboard}
      onPaste={onPasteClipboard}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="vnext-table-selection-highlight" data-table-selection-highlight="" style={highlightStyle} aria-hidden="true" />
      <button
        type="button"
        className="vnext-table-whole-selector"
        data-table-selector="table"
        aria-label="Selecionar tabela inteira"
        style={{ top: qCss(gridOffsetYQ) }}
        onClick={() => onSelectionChange(wholeTableSelection(identity))}
      >
        T
      </button>
      {table.columns.map((column, columnIndex) => (
        <button
          key={column.id}
          type="button"
          className="vnext-table-column-selector"
          data-table-column-selector={columnIndex}
          aria-label={`Selecionar coluna ${columnIndex + 1}`}
          style={{ left: qCss(x[columnIndex]), top: qCss(gridOffsetYQ), width: qCss(columns[columnIndex]) }}
          onClick={(event) => {
            const anchor = event.shiftKey && selection.kind === 'columns' ? selection.anchorColumnId : column.id;
            onSelectionChange(tableColumnSelection(identity, anchor, column.id));
          }}
        >
          {columnIndex + 1}
        </button>
      ))}
      {table.rows.map((row, rowIndex) => (
        <button
          key={row.id}
          type="button"
          className="vnext-table-row-selector"
          data-table-row-selector={rowIndex}
          aria-label={`Selecionar linha ${rowIndex + 1}`}
          style={{ top: qCss(gridOffsetYQ + y[rowIndex]), height: qCss(rows[rowIndex]) }}
          onClick={(event) => {
            const anchor = event.shiftKey && selection.kind === 'rows' ? selection.anchorRowId : row.id;
            onSelectionChange(tableRowSelection(identity, anchor, row.id));
          }}
        >
          {rowIndex + 1}
        </button>
      ))}
      {table.rows.flatMap((row, rowIndex) => table.columns.map((column, columnIndex) => {
        const point = { rowId: row.id, columnId: column.id };
        return (
          <button
            key={`${row.id}:${column.id}`}
            type="button"
            tabIndex={-1}
            role="gridcell"
            className="vnext-table-cell-target"
            data-table-cell={`${rowIndex}:${columnIndex}`}
            aria-label={`Linha ${rowIndex + 1}, coluna ${columnIndex + 1}`}
            data-cell-editing={(() => {
              const canonical = canonicalTablePoint(table, point);
              if (!canonical || !editingCellId) return undefined;
              const anchor = table.cells.find((cell) => cell.rowId === canonical.rowId && cell.columnId === canonical.columnId);
              return anchor?.id === editingCellId ? 'true' : undefined;
            })()}
            style={{
              left: qCss(x[columnIndex]),
              top: qCss(gridOffsetYQ + y[rowIndex]),
              width: qCss(columns[columnIndex]),
              height: qCss(rows[rowIndex]),
            }}
            onPointerDown={(event) => beginCellDrag(event, point)}
            onPointerMove={(event) => moveCellDrag(event, point)}
            onPointerUp={(event) => finishCellDrag(event, point)}
            onPointerCancel={cancelCellDrag}
            onLostPointerCapture={cancelCellDrag}
            onDoubleClick={(event) => {
              event.stopPropagation();
              const canonical = canonicalTablePoint(table, point);
              if (!canonical) return;
              onSelectionChange(tableRangeSelection(identity, canonical, canonical));
              onActivateCell?.(canonical);
            }}
          />
        );
      }))}
    </div>
  );
}
