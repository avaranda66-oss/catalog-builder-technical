import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SaveToArsenalCard, type SaveToArsenalPage } from '@/vnext/ai-catalog/ArsenalAssistantCards';

/**
 * Onda 4.5 — "Guardar no arsenal?" in the conversation. It must not take the conversation over: without the link of the
 * "Apliquei…" message it is a short question; the name and category fields open only when the person asks.
 */
afterEach(cleanup);

const PAGES: readonly SaveToArsenalPage[] = [
  { pageId: 'p1', heading: 'Catálogo técnico PRESYS', type: 'cover' },
  { pageId: 'p2', heading: 'Ficha técnica', type: 'comparison' },
];

describe('SaveToArsenalCard', () => {
  it('starts as a short question: no fields until "Guardar…"; then the name gets the cursor', () => {
    const onSave = vi.fn();
    render(<SaveToArsenalCard pages={PAGES} onSave={onSave} onDismiss={vi.fn()} />);
    const card = screen.getByRole('group', { name: 'Guardar no arsenal' });
    expect(card).toHaveTextContent('A IA montou estas 2 páginas. A equipe pode usar de novo, sem gastar IA.');
    expect(within(card).queryByRole('textbox')).toBeNull();
    expect(within(card).queryByRole('combobox')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar…' }));
    const name = within(card).getByRole('textbox', { name: 'Nome' });
    expect(name).toHaveFocus();
    expect(name).toHaveValue('Catálogo técnico PRESYS');
    expect(within(card).getByRole('combobox', { name: 'Categoria' })).toHaveValue('capas');
    fireEvent.click(within(card).getByRole('button', { name: 'Guardar no arsenal' }));
    expect(onSave).toHaveBeenCalledWith('p1', 'Catálogo técnico PRESYS', 'capas');
  });

  it('opened from the link of "Apliquei…" (startOpen) shows the fields at once; "Agora não" dismisses', () => {
    const onDismiss = vi.fn();
    render(<SaveToArsenalCard pages={PAGES.slice(1)} startOpen onSave={vi.fn()} onDismiss={onDismiss} />);
    const card = screen.getByRole('group', { name: 'Guardar no arsenal' });
    expect(within(card).getByRole('textbox', { name: 'Nome' })).toHaveValue('Ficha técnica');
    expect(within(card).getByRole('combobox', { name: 'Categoria' })).toHaveValue('paginas');
    expect(within(card).queryByRole('combobox', { name: 'Página' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Agora não' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
