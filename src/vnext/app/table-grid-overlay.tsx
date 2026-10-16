import React from 'react';
import { pxToQ, qCss, uToQ, type TableModel } from '../domain';
import { pointerAxisDeltaU } from './editor-interaction';
import type { TablePlan } from '../rendering';
import { resolveGridTypingKey } from '../editor/editor-keyboard';
import { tableGridMenuModel, type TableGridCommand } from '../editor/table-grid-commands';
import {
  createTablePointResolver,
  normalizeTableSelection,
  tableCellSelection,
  tableColumnSelection,
  tableRangeSelection,
  tableRowSelection,
  wholeTableSelection,
  type TableSelection,
  type TableSelectionIdentity,
  type TableSelectionPoint,
} from '../editor/table-selection';
import type { CellInlineEditorCell } from './editor/CellInlineEditor';
import { TableGridContextMenu } from './editor/TableGridContextMenu';

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

interface DimensionDragState {
  pointerId: number;
  sourceSequence: number;
  axis: 'row' | 'column';
  index: number;
  startClient: number;
  pageExtentU: number;
  renderedPageExtentQ: number;
  deltaU: number;
  deltaQ: number;
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
  rangeExtensionArmed?: boolean;
  onRangeExtensionComplete?(): void;
  editingCellId?: string;
  dimensionEditingEnabled?: boolean;
  pageWidthU: number;
  pageHeightU: number;
  onRowBoundaryCommit?(rowIndex: number, deltaU: number): void;
  onColumnBoundaryCommit?(leftColumnIndex: number, deltaU: number): void;
  /** FR-30: draws the editor over the cell being edited (`editingCellId`). */
  renderCellEditor?(cell: CellInlineEditorCell): React.ReactNode;
  /** FR-30: a printable key on the selected cell starts the edit and replaces the content ('' for a dead key). */
  onTypeToEdit?(text: string): void;
  /** FR-30: pressing another cell while one is being edited saves it and selects the pressed cell. */
  onCellPressWhileEditing?(point: TableSelectionPoint): void;
  /** FR-34: "+" buttons between rows/columns and the right-click menu. */
  onGridCommand?(command: TableGridCommand): void;
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
  rangeExtensionArmed = false,
  onRangeExtensionComplete,
  editingCellId,
  dimensionEditingEnabled = true,
  pageWidthU,
  pageHeightU,
  onRowBoundaryCommit,
  onColumnBoundaryCommit,
  renderCellEditor,
  onTypeToEdit,
  onCellPressWhileEditing,
  onGridCommand,
}: TableGridOverlayProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const lastCellPointerTypeRef = React.useRef('');
  const lastTouchTapRef = React.useRef<(TableSelectionPoint & { completedAt: number }) | null>(null);
  const dimensionDragRef = React.useRef<DimensionDragState | null>(null);
  const [dimensionPreview, setDimensionPreview] = React.useState<DimensionDragState | null>(null);
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const closeMenu = React.useCallback((restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) rootRef.current?.focus({ preventScroll: true });
  }, []);
  const resolvePoint = React.useMemo(() => createTablePointResolver(table), [table]);
  const rows = plan.rowQ ?? [];
  const columns = plan.trackQ;
  const x = cumulative(columns);
  const y = cumulative(rows);
  const gridOffsetYQ = plan.gridOffsetYQ ?? 0;
  const normalized = normalizeTableSelection(table, selection);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const activeElement = root?.ownerDocument.activeElement;
    // Physical measurement can remount the grid while an inspector field is in use.
    if (activeElement?.closest('input, textarea, select, [contenteditable="true"]')) return;
    root?.focus({ preventScroll: true });
  }, [identity.objectId]);

  React.useEffect(() => {
    lastTouchTapRef.current = null;
  }, [identity.objectId, localSequence]);

  React.useEffect(() => {
    const drag = dragRef.current;
    if (drag && drag.sourceSequence !== localSequence) {
      dragRef.current = null;
      onSelectionChange(drag.before);
      onStaleGesture();
    }
    const dimensionDrag = dimensionDragRef.current;
    if (dimensionDrag && dimensionDrag.sourceSequence !== localSequence) {
      dimensionDragRef.current = null;
      setDimensionPreview(null);
      onStaleGesture();
    }
  }, [localSequence, onSelectionChange, onStaleGesture]);

  if (rows.length !== table.rows.length || columns.length !== table.columns.length || !normalized) return null;

  const selectCell = (point: TableSelectionPoint, extend: boolean) => {
    const canonical = resolvePoint(point);
    if (!canonical) return;
    if (rangeExtensionArmed && (selection.kind === 'cell' || selection.kind === 'range')) {
      onSelectionChange(tableRangeSelection(identity, selection.anchor, point));
      onRangeExtensionComplete?.();
      return;
    }
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
    const canonical = resolvePoint(point);
    if (!canonical) return;
    if (editingCellId && onCellPressWhileEditing) {
      // Like Excel: clicking another cell saves the one being typed in and moves there.
      event.preventDefault();
      onCellPressWhileEditing(canonical);
      return;
    }
    const anchor = event.shiftKey && (selection.kind === 'cell' || selection.kind === 'range')
      ? selection.anchor
      : canonical;
    const touch = event.pointerType === 'touch';
    lastCellPointerTypeRef.current = event.pointerType;
    if (!touch) lastTouchTapRef.current = null;
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
      if (rangeExtensionArmed) {
        dragRef.current = null;
        selectCell(point, true);
      } else {
        onSelectionChange(tableRangeSelection(identity, anchor, event.shiftKey ? point : canonical));
      }
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
    if (resolvePoint(focus)) onSelectionChange(tableRangeSelection(identity, drag.anchor, focus));
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
    if (drag.touch) {
      const target = !drag.moved ? pointAtClient(event.clientX, event.clientY) ?? point : undefined;
      const canonical = target && resolvePoint(target);
      const previous = lastTouchTapRef.current;
      const secondTap = Boolean(canonical && previous && !rangeExtensionArmed
        && canonical.rowId === previous.rowId && canonical.columnId === previous.columnId
        && event.timeStamp - previous.completedAt >= 0 && event.timeStamp - previous.completedAt <= 500);
      lastTouchTapRef.current = !secondTap && canonical && !rangeExtensionArmed
        ? { ...canonical, completedAt: event.timeStamp } : null;
      if (target) selectCell(target, event.shiftKey);
      if (secondTap && canonical) onActivateCell?.(canonical);
    }
  };

  const cancelCellDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    lastTouchTapRef.current = null;
    onSelectionChange(drag.before);
  };

  const beginDimensionDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    axis: 'row' | 'column',
    index: number
  ) => {
    if (!dimensionEditingEnabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest('[data-vnext-page-stage]') as HTMLElement | null;
    const canonicalPage = stage?.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
    const pageRect = canonicalPage?.getBoundingClientRect();
    if (!pageRect) return;
    const pageExtentU = axis === 'column' ? pageWidthU : pageHeightU;
    const renderedPageExtentQ = pxToQ(axis === 'column' ? pageRect.width : pageRect.height);
    if (pageExtentU <= 0 || renderedPageExtentQ <= 0) return;
    const state: DimensionDragState = {
      pointerId: event.pointerId,
      sourceSequence: localSequence,
      axis,
      index,
      startClient: axis === 'column' ? event.clientX : event.clientY,
      pageExtentU,
      renderedPageExtentQ,
      deltaU: 0,
      deltaQ: 0,
    };
    dimensionDragRef.current = state;
    setDimensionPreview(state);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDimensionDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dimensionDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.sourceSequence !== localSequence) {
      dimensionDragRef.current = null;
      setDimensionPreview(null);
      onStaleGesture();
      return;
    }
    const client = current.axis === 'column' ? event.clientX : event.clientY;
    const deltaU = pointerAxisDeltaU(
      client - current.startClient,
      current.pageExtentU,
      current.renderedPageExtentQ
    );
    const deltaQ = uToQ(deltaU);
    const next = { ...current, deltaU, deltaQ };
    dimensionDragRef.current = next;
    setDimensionPreview(next);
  };

  const finishDimensionDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dimensionDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dimensionDragRef.current = null;
    setDimensionPreview(null);
    if (current.sourceSequence !== localSequence) {
      onStaleGesture();
      return;
    }
    if (current.deltaU === 0) return;
    if (current.axis === 'column') onColumnBoundaryCommit?.(current.index, current.deltaU);
    else onRowBoundaryCommit?.(current.index, current.deltaU);
  };

  const cancelDimensionDrag = () => {
    if (!dimensionDragRef.current) return;
    dimensionDragRef.current = null;
    setDimensionPreview(null);
  };

  const insideSelection = (rowIndex: number, columnIndex: number) => rowIndex >= normalized.rowStart
    && rowIndex <= normalized.rowEnd && columnIndex >= normalized.columnStart && columnIndex <= normalized.columnEnd;

  // FR-34: right-click on a cell, a row number or a column number opens the grid menu for that place.
  const openMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onGridCommand || editingCellId || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-cell-inline-editor], [data-table-grid-menu]')) return;
    event.preventDefault();
    const target = event.target.closest<HTMLElement>('[data-table-cell], [data-table-row-selector], [data-table-column-selector]');
    if (target?.dataset.tableCell) {
      const [rowIndex, columnIndex] = target.dataset.tableCell.split(':').map(Number);
      const canonical = resolvePoint({ rowId: table.rows[rowIndex].id, columnId: table.columns[columnIndex].id });
      if (canonical && !insideSelection(rowIndex, columnIndex)) onSelectionChange(tableCellSelection(identity, canonical));
    } else if (target?.dataset.tableRowSelector) {
      const rowIndex = Number(target.dataset.tableRowSelector);
      if (selection.kind !== 'rows' || !insideSelection(rowIndex, 0)) onSelectionChange(tableRowSelection(identity, table.rows[rowIndex].id));
    } else if (target?.dataset.tableColumnSelector) {
      const columnIndex = Number(target.dataset.tableColumnSelector);
      if (selection.kind !== 'columns' || !insideSelection(0, columnIndex)) {
        onSelectionChange(tableColumnSelection(identity, table.columns[columnIndex].id));
      }
    }
    setMenu({ x: event.clientX, y: event.clientY });
  };

  // FR-30: typing on the selected cell starts the edit; the menu key opens the grid menu (FR-34).
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingCellId || !(event.target instanceof Element)) return;
    if (event.target.closest('[data-cell-inline-editor], [data-table-grid-menu]')) return;
    if (onGridCommand && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault();
      event.stopPropagation();
      const rect = rootRef.current?.querySelector('[data-table-selection-highlight]')?.getBoundingClientRect();
      setMenu({ x: rect ? rect.left + Math.min(rect.width, 24) : 0, y: rect ? rect.bottom : 0 });
      return;
    }
    if (!onTypeToEdit || selection.kind !== 'cell') return;
    const typing = resolveGridTypingKey({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    });
    if (!typing) return;
    // A dead key is left to the browser, so the accent lands on the next letter inside the editor.
    if (typing.kind === 'character') event.preventDefault();
    event.stopPropagation();
    onTypeToEdit(typing.kind === 'character' ? typing.text : '');
  };

  const editingAnchor = editingCellId ? table.cells.find((cell) => cell.id === editingCellId && !cell.coveredBy) : undefined;
  const editingRow = editingAnchor ? table.rows.findIndex((row) => row.id === editingAnchor.rowId) : -1;
  const editingColumn = editingAnchor ? table.columns.findIndex((column) => column.id === editingAnchor.columnId) : -1;
  const editingRect = editingAnchor && editingRow >= 0 && editingColumn >= 0 ? {
    leftQ: x[editingColumn],
    topQ: gridOffsetYQ + y[editingRow],
    widthQ: x[Math.min(editingColumn + (editingAnchor.span?.columns ?? 1), columns.length)] - x[editingColumn],
    heightQ: y[Math.min(editingRow + (editingAnchor.span?.rows ?? 1), rows.length)] - y[editingRow],
  } : undefined;
  const showInsertButtons = Boolean(onGridCommand) && dimensionEditingEnabled && !editingCellId;

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
      onKeyDown={onGridKeyDown}
      onContextMenu={openMenu}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        lastTouchTapRef.current = null;
      }}
      onPointerDownCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-table-cell]')) return;
        lastTouchTapRef.current = null;
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="vnext-table-selection-highlight" data-table-selection-highlight="" style={highlightStyle} aria-hidden="true" />
      {dimensionPreview && (
        <div
          className={'vnext-table-dimension-preview is-' + dimensionPreview.axis}
          data-table-dimension-preview={dimensionPreview.axis}
          data-table-dimension-delta-q={dimensionPreview.deltaQ}
          style={dimensionPreview.axis === 'column'
            ? {
                left: qCss(x[dimensionPreview.index + 1] + dimensionPreview.deltaQ),
                top: qCss(gridOffsetYQ),
                height: qCss(y[y.length - 1]),
              }
            : {
                left: 0,
                top: qCss(gridOffsetYQ + y[dimensionPreview.index + 1] + dimensionPreview.deltaQ),
                width: qCss(x[x.length - 1]),
              }}
          aria-hidden="true"
        />
      )}
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
        <React.Fragment key={column.id}>
        <button
          type="button"
          className="vnext-table-column-selector"
          data-table-column-selector={columnIndex}
          aria-label={`Selecionar coluna ${columnIndex + 1}`}
          style={{ left: qCss(x[columnIndex]), top: qCss(gridOffsetYQ), width: qCss(columns[columnIndex]) }}
          onClick={(event) => {
            const extending = rangeExtensionArmed && selection.kind === 'columns';
            const anchor = (event.shiftKey || extending) && selection.kind === 'columns'
              ? selection.anchorColumnId
              : column.id;
            onSelectionChange(tableColumnSelection(identity, anchor, column.id));
            if (extending) onRangeExtensionComplete?.();
          }}
        >
          {columnIndex + 1}
        </button>
        {showInsertButtons && (
          <button
            type="button"
            tabIndex={-1}
            className="vnext-table-axis-insert is-column"
            data-table-insert-column-after={columnIndex}
            aria-label={`Inserir coluna à direita da coluna ${columnIndex + 1}`}
            title="Inserir coluna"
            style={{ left: qCss(x[columnIndex + 1]), top: qCss(gridOffsetYQ) }}
            onClick={() => onGridCommand?.({ type: 'insert', axis: 'column', position: 'after', referenceAxisId: column.id })}
          >
            +
          </button>
        )}
        </React.Fragment>
      ))}
      {table.rows.map((row, rowIndex) => (
        <React.Fragment key={row.id}>
        <button
          type="button"
          className="vnext-table-row-selector"
          data-table-row-selector={rowIndex}
          aria-label={`Selecionar linha ${rowIndex + 1}`}
          style={{ top: qCss(gridOffsetYQ + y[rowIndex]), height: qCss(rows[rowIndex]) }}
          onClick={(event) => {
            const extending = rangeExtensionArmed && selection.kind === 'rows';
            const anchor = (event.shiftKey || extending) && selection.kind === 'rows'
              ? selection.anchorRowId
              : row.id;
            onSelectionChange(tableRowSelection(identity, anchor, row.id));
            if (extending) onRangeExtensionComplete?.();
          }}
        >
          {rowIndex + 1}
        </button>
        {showInsertButtons && (
          <button
            type="button"
            tabIndex={-1}
            className="vnext-table-axis-insert is-row"
            data-table-insert-row-after={rowIndex}
            aria-label={`Inserir linha abaixo da linha ${rowIndex + 1}`}
            title="Inserir linha"
            style={{ top: qCss(gridOffsetYQ + y[rowIndex + 1]) }}
            onClick={() => onGridCommand?.({ type: 'insert', axis: 'row', position: 'after', referenceAxisId: row.id })}
          >
            +
          </button>
        )}
        </React.Fragment>
      ))}
      {dimensionEditingEnabled && table.columns.slice(0, -1).map((column, columnIndex) => (
        <button
          key={'column-boundary:' + column.id}
          type="button"
          className="vnext-table-column-resize-handle"
          data-table-column-boundary={columnIndex}
          aria-label={`Ajustar largura entre coluna ${columnIndex + 1} e ${columnIndex + 2}`}
          style={{
            left: qCss(x[columnIndex + 1]),
            top: qCss(gridOffsetYQ),
            height: qCss(y[y.length - 1]),
          }}
          onPointerDown={(event) => beginDimensionDrag(event, 'column', columnIndex)}
          onPointerMove={moveDimensionDrag}
          onPointerUp={finishDimensionDrag}
          onPointerCancel={cancelDimensionDrag}
          onLostPointerCapture={cancelDimensionDrag}
        />
      ))}
      {dimensionEditingEnabled && table.rows.slice(0, -1).map((row, rowIndex) => (
        <button
          key={'row-boundary:' + row.id}
          type="button"
          className="vnext-table-row-resize-handle"
          data-table-row-boundary={rowIndex}
          aria-label={`Ajustar altura entre linha ${rowIndex + 1} e ${rowIndex + 2}`}
          style={{
            left: 0,
            top: qCss(gridOffsetYQ + y[rowIndex + 1]),
            width: qCss(x[x.length - 1]),
          }}
          onPointerDown={(event) => beginDimensionDrag(event, 'row', rowIndex)}
          onPointerMove={moveDimensionDrag}
          onPointerUp={finishDimensionDrag}
          onPointerCancel={cancelDimensionDrag}
          onLostPointerCapture={cancelDimensionDrag}
        />
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
              if (!editingCellId) return undefined;
              const canonical = resolvePoint(point);
              if (!canonical) return undefined;
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
              // Touch click counts can carry over from other targets; completed taps handle touch editing.
              if (lastCellPointerTypeRef.current === 'touch') return;
              lastTouchTapRef.current = null;
              const canonical = resolvePoint(point);
              if (!canonical) return;
              onSelectionChange(tableRangeSelection(identity, canonical, canonical));
              onActivateCell?.(canonical);
            }}
          />
        );
      }))}
      {editingRect && renderCellEditor && (
        <div
          className="vnext-cell-inline-anchor"
          data-cell-inline-anchor=""
          style={{
            left: qCss(editingRect.leftQ),
            top: qCss(editingRect.topQ),
            width: qCss(editingRect.widthQ),
            height: qCss(editingRect.heightQ),
          }}
        >
          {renderCellEditor({
            widthPx: editingRect.widthQ / 64,
            heightPx: editingRect.heightQ / 64,
            rowIndex: editingRow,
            columnIndex: editingColumn,
          })}
        </div>
      )}
      {menu && onGridCommand && !editingCellId && (
        <TableGridContextMenu
          x={menu.x}
          y={menu.y}
          model={tableGridMenuModel(table, selection)}
          onCommand={onGridCommand}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
