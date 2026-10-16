import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import './entry-and-title.css';

export interface LibraryRowMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  /** Receives the menu button so a dialog opened from here can return focus to it. */
  readonly onSelect: (trigger: HTMLButtonElement | null) => void;
}

/** "Mais" menu of a Library row: keeps rarely used actions (such as Arquivar) one step away. */
export function LibraryRowMenu({
  label,
  items,
  disabled = false,
}: {
  /** Accessible name of the menu button, e.g. "Mais ações de TA-25N". */
  readonly label: string;
  readonly items: readonly LibraryRowMenuItem[];
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const menuId = React.useId();

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  React.useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const moveFocus = (direction: 1 | -1 | 'first' | 'last') => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (entries.length === 0) return;
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const next = direction === 'first'
      ? 0
      : direction === 'last'
        ? entries.length - 1
        : (current + direction + entries.length) % entries.length;
    entries[next].focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
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
      close(false);
    }
  };

  return (
    <div className="vnext-library-row-menu">
      <button
        ref={triggerRef}
        type="button"
        className="is-quiet"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={17} aria-hidden="true" />
        <span aria-hidden="true">Mais</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="vnext-library-row-menu-list"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect(triggerRef.current);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
