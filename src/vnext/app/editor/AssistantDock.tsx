import React from 'react';
import type { EditorialObject } from '../../domain';
import { SIDE_ASSISTANT_PANEL_ID } from './SidePanelTabs';
import './AssistantDock.css';

export interface AssistantSelection {
  /** How many objects are selected on the page. */
  count: number;
  /** Type of the single selected object, when exactly one is selected. */
  type?: EditorialObject['type'];
}

const OBJECT_NAMES: Readonly<Record<EditorialObject['type'], string>> = {
  text: 'texto', image: 'imagem', table: 'tabela', shape: 'forma', polygon: 'polígono', line: 'linha', icon: 'ícone', group: 'grupo',
};

/** Plain words for what the assistant works on, shown above its text box. */
export function assistantSelectionLabel({ count, type }: AssistantSelection): string {
  if (count > 1) return `${count} objetos selecionados na página`;
  if (count === 1) return `Selecionado na página: ${type ? OBJECT_NAMES[type] : 'objeto'}`;
  return 'Nada selecionado na página';
}

export interface AssistantDockProps {
  open: boolean;
  onClose: () => void;
  /** The assistant (its own header has "Fechar"). */
  children: React.ReactNode;
}

/** Remembered in this browser only (a convenience: without storage the panel simply opens at its normal width). */
export const ASSISTANT_WIDE_STORAGE_KEY = 'catalog-builder:assistant-wide:v1';

/** "Ampliar": the wider assistant panel, remembered in this browser. */
export function useAssistantWide(): [boolean, (wide: boolean) => void] {
  const [wide, setWide] = React.useState(() => {
    try { return globalThis.localStorage?.getItem(ASSISTANT_WIDE_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const change = React.useCallback((next: boolean) => {
    setWide(next);
    try { globalThis.localStorage?.setItem(ASSISTANT_WIDE_STORAGE_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  }, []);
  return [wide, change];
}

function isShown(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && !element.closest('[hidden]');
}

/**
 * FR-17: the assistant panel, shown in the right column in place of "Propriedades" (as a fixed
 * panel over the screen only below 900 px), a little wider than "Propriedades" so the conversation
 * reads like a chat ("Ampliar" widens it more). The (empty, hidden) panel is always there, so the tab
 * and the top bar button always point at it; the assistant inside is created on the first opening
 * and then stays mounted while hidden, so going back to "Propriedades" and returning keeps the
 * typed request, the conversation and any proposal waiting for confirmation. The selection on the
 * page stays as it is. Closing it from inside ("Fechar", Esc) puts the keyboard focus back on what
 * opened it.
 */
export function AssistantDock({ open, onClose, children }: AssistantDockProps) {
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);
  const panelRef = React.useRef<HTMLElement>(null);
  const wasOpen = React.useRef(open);
  const wasOpenBeforePaint = React.useRef(open);
  const opener = React.useRef<HTMLElement | null>(null);

  // Before paint, so before the assistant puts the cursor in its own field (a later effect):
  // remember what opened the panel, and give the focus back to it when the panel closes while
  // holding the focus (otherwise it would fall to the page body and the keyboard user is lost).
  React.useLayoutEffect(() => {
    const changed = open !== wasOpenBeforePaint.current;
    wasOpenBeforePaint.current = open;
    if (!changed) return;
    const root = globalThis.document;
    const panel = panelRef.current;
    const active = root.activeElement;
    if (open) {
      opener.current = active instanceof HTMLElement && active !== root.body && !panel?.contains(active) ? active : null;
      return;
    }
    const lostFocus = !active || active === root.body || Boolean(panel?.contains(active));
    if (!lostFocus) return;
    const target = [opener.current, root.querySelector('[data-side-tab="assistant"]')].find(isShown);
    target?.focus();
  }, [open]);

  // On reopening (not the first time, when the assistant focuses its own field), put the cursor
  // back in the request field so the person can type right away.
  React.useEffect(() => {
    const reopened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!reopened) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(globalThis.document.activeElement)) return;
    panel.querySelector<HTMLTextAreaElement>('textarea:not([disabled])')?.focus();
  }, [open]);

  return (
    <aside
      ref={panelRef}
      id={SIDE_ASSISTANT_PANEL_ID}
      className="vnext-assistant-dock"
      aria-label="Assistente do catálogo atual"
      data-vnext-assistant={open ? 'open' : 'closed'}
      hidden={!open}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      }}
    >
      {mounted && children}
    </aside>
  );
}
