import React from 'react';

export type SidePanel = 'properties' | 'assistant';
/** How the person switched panels: with the arrow keys (focus stays on the tab) or by a click. */
export type SidePanelSwitchSource = 'keyboard' | 'pointer';

/** Ids of the two panels the tabs show (the assistant id is also used by the top bar button). */
export const SIDE_PROPERTIES_PANEL_ID = 'vnext-side-properties';
export const SIDE_ASSISTANT_PANEL_ID = 'vnext-assistant-chat';

const TABS: ReadonlyArray<{ panel: SidePanel; label: string; controls: string }> = [
  { panel: 'properties', label: 'Propriedades', controls: SIDE_PROPERTIES_PANEL_ID },
  { panel: 'assistant', label: 'Assistente', controls: SIDE_ASSISTANT_PANEL_ID },
];

export interface SidePanelTabsProps {
  active: SidePanel;
  onChange: (panel: SidePanel, source: SidePanelSwitchSource) => void;
}

/**
 * FR-17: "Propriedades | Assistente" at the top of the right column. The assistant takes the place
 * of the properties in the same column instead of covering the column (or the page). Switching
 * never changes what is selected on the page. Arrow keys, Home and End move between the tabs.
 */
export function SidePanelTabs({ active, onChange }: SidePanelTabsProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (TABS[next].panel !== active) onChange(TABS[next].panel, 'keyboard');
    refs.current[next]?.focus();
  };
  return (
    <div className="vnext-side-tabs" role="tablist" aria-label="Painel da direita" data-side-tabs="">
      {TABS.map((tab, index) => (
        <button
          key={tab.panel}
          ref={(element) => { refs.current[index] = element; }}
          type="button"
          role="tab"
          id={`vnext-side-tab-${tab.panel}`}
          aria-selected={active === tab.panel}
          aria-controls={tab.controls}
          tabIndex={active === tab.panel ? 0 : -1}
          data-side-tab={tab.panel}
          onClick={() => { if (active !== tab.panel) onChange(tab.panel, 'pointer'); }}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface SidePanelColumnProps {
  active: SidePanel;
  onChange: (panel: SidePanel) => void;
  /** The tabs exist only in the simple mode (the full mode has no assistant here). */
  showTabs: boolean;
  /** The "Propriedades" panel and, in the simple mode, the assistant panel. */
  children: React.ReactNode;
}

/**
 * FR-17: the right column of the editor, with "Propriedades | Assistente" on top and one panel
 * below. A click on "Assistente" lets the assistant put the cursor in its request field; moving
 * with the arrow keys keeps the focus on the tab (the panels below are children, so this effect
 * runs after theirs and has the last word).
 */
export function SidePanelColumn({ active, onChange, showTabs, children }: SidePanelColumnProps) {
  const columnRef = React.useRef<HTMLDivElement>(null);
  const keyboardSwitch = React.useRef<SidePanel | null>(null);
  React.useEffect(() => {
    const panel = keyboardSwitch.current;
    keyboardSwitch.current = null;
    if (panel) columnRef.current?.querySelector<HTMLButtonElement>(`[data-side-tab="${panel}"]`)?.focus();
  }, [active]);
  return (
    <div ref={columnRef} className="vnext-side-column" data-side-panel={showTabs ? active : 'properties'}>
      {showTabs && <SidePanelTabs active={active} onChange={(panel, source) => {
        keyboardSwitch.current = source === 'keyboard' ? panel : null;
        onChange(panel);
      }} />}
      {children}
    </div>
  );
}
