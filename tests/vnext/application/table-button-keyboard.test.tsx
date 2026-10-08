import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createDocumentSession } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { createW4BTableDocument, W4B_OBJECT_ID } from '../proof/fixtures/w4b-table-document';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe('table selection preserves native button keyboard activation', () => {
  it.each(['duplicate', 'add-table', 'toggle-table-inspector-advanced'])('does not intercept Enter on %s', async (action) => {
    const session = createDocumentSession(createW4BTableDocument(), { createId: () => crypto.randomUUID() });
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${W4B_OBJECT_ID}"]`)!;
    const before = session.getSnapshot().document;
    await act(async () => {
      fireEvent.pointerDown(hit, { pointerId: 31, button: 0 });
      fireEvent.pointerUp(hit, { pointerId: 31, button: 0 });
    });
    const button = container.querySelector<HTMLButtonElement>(`[data-editor-action="${action}"]`)!;
    expect(button).not.toBeDisabled();
    act(() => button.focus());
    // The browser performs native button activation after an uncancelled Enter.
    // The companion Chromium proof asserts the actual resulting duplication.
    expect(fireEvent.keyDown(button, { key: 'Enter', cancelable: true })).toBe(true);
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-editor-mode', 'select');
    expect(session.getSnapshot().document).toBe(before);
  });
});
