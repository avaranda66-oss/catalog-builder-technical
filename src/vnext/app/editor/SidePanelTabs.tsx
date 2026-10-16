import React from 'react';

export type SidePanel = 'properties' | 'assistant';

/** Ids of the two panels the tabs show (the assistant id is also used by the top bar button). */
export const SIDE_PROPERTIES_PANEL_ID = 'vnext-side-properties';
export const SIDE_ASSISTANT_PANEL_ID = 'vnext-assistant-chat';

const TABS: ReadonlyArray<{ panel: SidePanel; label: string; controls: string }> = [
  { panel: 'properties', label: 'Propriedades', controls: SIDE_PROPERTIES_PANEL_ID },
  { panel: 'assistant', label: 'Assistente', controls: SIDE_ASSISTANT_PANEL_ID },
];

export interface SidePanelTabsProps {
  active: SidePanel;
  onChange: (panel: SidePanel) => void;
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
    onChange(TABS[next].panel);
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
          onClick={() => { if (active !== tab.panel) onChange(tab.panel); }}
          onKeyDown={(event) => move(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
