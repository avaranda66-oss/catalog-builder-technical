import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentSession, projectEditableRichText } from '@/vnext/application';
import { EditorWorkspace } from '@/vnext/app/EditorWorkspace';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';

afterEach(cleanup);

function entry() {
  let id = 0;
  const createId = () => `translation-entry-${++id}`;
  const session = createDocumentSession(createW2CDemoDocument(createId), { createId });
  const open = vi.fn();
  const view = render(<EditorWorkspace session={session} onRequestTranslation={open} />);
  fireEvent.click(view.getByRole('button', { name: 'Adicionar texto' }));
  const hit = view.container.querySelector<HTMLElement>('[data-editor-object-id][data-selected="true"]')!;
  fireEvent.keyDown(hit, { key: 'Enter' });
  const textarea = view.container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
  expect(textarea).not.toBeNull();
  fireEvent.change(textarea, { target: { value: 'PRESYS conteúdo visível antes da tradução' } });
  return { session, view, open, textarea };
}

describe('W5.B keyboard translation entry', () => {
  it('commits visible text through the existing authoring barrier before opening review', () => {
    const { session, view, open } = entry();
    // A keyboard-generated click has no preceding pointerdown capture.
    fireEvent.click(view.getByRole('button', { name: /^Traduzir$/ }), { detail: 0 });
    expect(open).toHaveBeenCalledTimes(1);
    const object = session.getSnapshot().document.pages[0].objects.find(object => object.type === 'text')!;
    expect(object.type === 'text' && projectEditableRichText(object.text)).toBe('PRESYS conteúdo visível antes da tradução');
    expect(view.container.querySelector('[data-text-edit-textarea]')).toBeNull();
  });
  it('keeps composing text visible and refuses a context transition', () => {
    const { view, open, textarea } = entry();
    fireEvent.compositionStart(textarea);
    fireEvent.click(view.getByRole('button', { name: /^Traduzir$/ }), { detail: 0 });
    expect(open).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-text-edit-textarea]')).not.toBeNull();
  });
});
