import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { trapReviewTab, useReviewDialog } from '@/vnext/app/review-dialog';

afterEach(cleanup);
function Dialog({ phase }: { phase: string }) {
  const ref = React.useRef<HTMLElement>(null); useReviewDialog(ref, phase);
  return <section ref={ref} tabIndex={-1} role="dialog" onKeyDown={trapReviewTab}><button>Fechar</button>{phase === 'idle' ? <button>Gerar</button> : <textarea aria-label="Revisão" />}</section>;
}
describe('W5.C review keyboard accessibility', () => {
  it('contains focus after async action disappears, inerts background and restores trigger', () => {
    const background = document.createElement('div'); background.setAttribute('data-vnext-shell', '');
    const trigger = document.createElement('button'); background.append(trigger); document.body.append(background); trigger.focus();
    const view = render(<Dialog phase="idle" />);
    expect(background.inert).toBe(true);
    view.getByRole('button', { name: 'Gerar' }).focus();
    view.rerender(<Dialog phase="review" />);
    expect(view.getByRole('dialog').contains(document.activeElement)).toBe(true);
    const first = view.getByRole('button', { name: 'Fechar' }), last = view.getByRole('textbox');
    last.focus(); fireEvent.keyDown(last, { key: 'Tab' }); expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
    view.getByRole('dialog').focus();
    fireEvent.keyDown(view.getByRole('dialog'), { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
    view.unmount(); expect(background.inert).toBe(false); expect(document.activeElement).toBe(trigger); background.remove();
  });
});
