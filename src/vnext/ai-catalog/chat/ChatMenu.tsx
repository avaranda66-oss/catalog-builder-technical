import React from 'react';
import { ChatIcon, type ChatIconName } from './ChatIcons';

export interface ChatMenuItem {
  readonly id: string;
  readonly label: string;
  /** A second, smaller line (for example the date of a conversation). */
  readonly detail?: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** The item that is in use now (the open conversation). */
  readonly current?: boolean;
}
export interface ChatMenuSection {
  readonly label?: string;
  readonly items: readonly ChatMenuItem[];
}

interface Props {
  /** Name of the button (also its tooltip). */
  readonly label: string;
  readonly icon: ChatIconName;
  /** Visible text next to the icon; without it the button shows only the icon. */
  readonly text?: string;
  /** Name of the menu that opens. */
  readonly menuLabel: string;
  readonly sections: readonly ChatMenuSection[];
  /** Shown when there is nothing to choose. */
  readonly emptyText?: string;
}

/**
 * A button that opens a short menu under it (the history and the ⚙ of the assistant). Keyboard: Enter or Space opens
 * it on the first item, the arrows move, Esc closes it and gives the focus back to the button (without closing the
 * assistant), Tab leaves it. A click outside closes it.
 */
export function ChatMenu({ label, icon, text, menuLabel, sections, emptyText }: Props) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();
  const items = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  React.useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    globalThis.document.addEventListener('pointerdown', outside);
    return () => globalThis.document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  };
  const onMenuKey = (event: React.KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(globalThis.document.activeElement as HTMLButtonElement);
    const move = (next: number) => { event.preventDefault(); list[(next + list.length) % list.length]?.focus(); };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') setOpen(false);
  };
  const hasItems = sections.some((section) => section.items.length > 0);
  return (
    <div className="ai-chat-menu" ref={root}>
      <button ref={trigger} type="button" className={text ? 'ai-chat-tool ai-chat-tool-text' : 'ai-chat-tool'}
        aria-label={text ? undefined : label} title={label} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true); } }}>
        <ChatIcon name={icon} />{text && <span>{text}</span>}
      </button>
      {open && (
        <div id={menuId} className="ai-chat-menu-popup" role="menu" aria-label={menuLabel} onKeyDown={onMenuKey}>
          {!hasItems && emptyText && <p className="ai-chat-menu-empty">{emptyText}</p>}
          {sections.filter((section) => section.items.length > 0).map((section, index) => (
            <div key={section.label ?? index} role="group" aria-label={section.label} className="ai-chat-menu-section">
              {section.label && <p className="ai-chat-menu-heading" aria-hidden="true">{section.label}</p>}
              {section.items.map((item) => (
                <button key={item.id} type="button" role="menuitem" disabled={item.disabled}
                  aria-current={item.current ? 'true' : undefined} data-menu-item={item.id}
                  onClick={() => { close(true); item.onSelect(); }}>
                  <span>{item.label}</span>
                  {item.detail && <small>{item.detail}</small>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
