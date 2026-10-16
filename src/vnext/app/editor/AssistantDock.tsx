import React from 'react';
import type { EditorialObject } from '../../domain';
import { SIDE_ASSISTANT_PANEL_ID } from './SidePanelTabs';

export type AssistantMode = 'gemini' | 'tools';

export interface AssistantSelection {
  /** How many objects are selected on the page. */
  count: number;
  /** Type of the single selected object, when exactly one is selected. */
  type?: EditorialObject['type'];
}

const OBJECT_NAMES: Readonly<Record<EditorialObject['type'], string>> = {
  text: 'texto', image: 'imagem', table: 'tabela', shape: 'forma', line: 'linha', icon: 'ícone', group: 'grupo',
};

/** Plain words for what the assistant works on, shown at the top of the assistant tab. */
export function assistantSelectionLabel({ count, type }: AssistantSelection): string {
  if (count > 1) return `${count} objetos selecionados na página`;
  if (count === 1) return `Selecionado na página: ${type ? OBJECT_NAMES[type] : 'objeto'}`;
  return 'Nada selecionado na página';
}

export interface AssistantDockProps {
  open: boolean;
  onClose: () => void;
  mode: AssistantMode;
  onModeChange: (mode: AssistantMode) => void;
  selection: AssistantSelection;
  /** The assistant for the current mode (Gemini composer or the quick tools). */
  children: React.ReactNode;
}

/**
 * FR-17: the assistant panel, shown in the right column in place of "Propriedades" (as a fixed
 * panel over the screen only below 900 px). Once opened it stays mounted while hidden, so going
 * back to "Propriedades" and returning keeps the typed request, the conversation and any proposal
 * waiting for confirmation. The selection on the page stays as it is; the first line says what the
 * assistant sees selected.
 */
export function AssistantDock({ open, onClose, mode, onModeChange, selection, children }: AssistantDockProps) {
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);
  const panelRef = React.useRef<HTMLElement>(null);
  const wasOpen = React.useRef(open);

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

  if (!mounted) return null;
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
      <div className="vnext-assistant-dock-controls">
        <span data-assistant-selection="">{assistantSelectionLabel(selection)}</span>
        <button type="button" aria-label="Fechar painel do assistente" onClick={onClose}>Fechar <span aria-hidden="true">✕</span></button>
      </div>
      <div className="vnext-assistant-mode" role="tablist" aria-label="Modo do assistente">
        <button role="tab" aria-selected={mode === 'gemini'} type="button" onClick={() => onModeChange('gemini')}>Criar com Gemini</button>
        <button role="tab" aria-selected={mode === 'tools'} type="button" onClick={() => onModeChange('tools')}>Ferramentas</button>
      </div>
      {children}
    </aside>
  );
}
