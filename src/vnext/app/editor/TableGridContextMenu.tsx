import React from 'react';
import { createPortal } from 'react-dom';
import type { TableGridCommand, TableGridMenuModel } from '../../editor/table-grid-commands';
import './TableGridContextMenu.css';

export interface TableGridContextMenuProps {
  /** Where the menu opens, in viewport px (the right-click point). */
  readonly x: number;
  readonly y: number;
  readonly model: TableGridMenuModel;
  onCommand(command: TableGridCommand): void;
  /** `restoreFocus` is true when the person closed it from the keyboard. */
  onClose(restoreFocus: boolean): void;
}

interface MenuEntry {
  readonly id: string;
  readonly label: string;
  readonly command: TableGridCommand;
  readonly danger?: boolean;
  readonly separatorBefore?: boolean;
}

function menuEntries(model: TableGridMenuModel): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (model.insertRows) {
    entries.push(
      { id: 'insert-row-before', label: 'Inserir linha acima', command: { type: 'insert', axis: 'row', position: 'before' } },
      { id: 'insert-row-after', label: 'Inserir linha abaixo', command: { type: 'insert', axis: 'row', position: 'after' } },
    );
  }
  if (model.insertColumns) {
    entries.push(
      { id: 'insert-column-before', label: 'Inserir coluna à esquerda', command: { type: 'insert', axis: 'column', position: 'before' } },
      { id: 'insert-column-after', label: 'Inserir coluna à direita', command: { type: 'insert', axis: 'column', position: 'after' } },
    );
  }
  let separator = entries.length > 0;
  if (model.removeRows) {
    entries.push({ id: 'remove-rows', label: model.removeRows.label, command: { type: 'remove', axis: 'row' }, danger: true, separatorBefore: separator });
    separator = false;
  }
  if (model.removeColumns) {
    entries.push({ id: 'remove-columns', label: model.removeColumns.label, command: { type: 'remove', axis: 'column' }, danger: true, separatorBefore: separator });
  }
  if (model.canMerge) entries.push({ id: 'merge', label: 'Mesclar células', command: { type: 'merge' }, separatorBefore: true });
  if (model.canUnmerge) entries.push({ id: 'unmerge', label: 'Desmesclar células', command: { type: 'unmerge' }, separatorBefore: true });
  return entries;
}

const MENU_MARGIN_PX = 8;

/**
 * FR-34 (slice 2A) — right-click menu of the table grid. It is drawn on the page body, outside the zoomed page, so
 * it always has the same readable size. Arrow keys move, Enter chooses, Esc closes.
 */
export function TableGridContextMenu({ x, y, model, onCommand, onClose }: TableGridContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({ left: x, top: y });
  const entries = menuEntries(model);

  // Keeps the whole menu inside the window (a right-click near the bottom opens it upwards).
  React.useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(MENU_MARGIN_PX, window.innerWidth - rect.width - MENU_MARGIN_PX);
    const maxTop = Math.max(MENU_MARGIN_PX, window.innerHeight - rect.height - MENU_MARGIN_PX);
    setPosition({ left: Math.min(Math.max(x, MENU_MARGIN_PX), maxLeft), top: Math.min(Math.max(y, MENU_MARGIN_PX), maxTop) });
  }, [x, y]);

  React.useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      onClose(false);
    };
    const closeOnResize = () => onClose(false);
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [onClose]);

  const moveFocus = (direction: 1 | -1 | 'first' | 'last') => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = direction === 'first' ? 0
      : direction === 'last' ? items.length - 1
        : (current + direction + items.length) % items.length;
    items[next].focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // The menu owns its keys: none of them reaches the grid or the page shortcuts.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveFocus('first');
    } else if (event.key === 'End') {
      event.preventDefault();
      moveFocus('last');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Ações da tabela"
      className="vnext-table-grid-menu"
      data-table-grid-menu=""
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry) => (
        <React.Fragment key={entry.id}>
          {entry.separatorBefore && <div role="separator" className="vnext-table-grid-menu-separator" />}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-table-grid-command={entry.id}
            className={entry.danger ? 'is-danger' : undefined}
            onClick={() => {
              onClose(false);
              onCommand(entry.command);
            }}
          >
            {entry.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
}
