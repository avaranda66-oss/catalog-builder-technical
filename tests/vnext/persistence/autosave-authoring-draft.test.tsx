import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { projectEditableRichText } from '@/vnext/application';
import { VNextApp } from '@/vnext/app/VNextApp';
import { plainRichText, type CatalogDocument } from '@/vnext/domain';
import {
  ManualAutosaveClock,
  StrictCasCatalogRepository,
  documentFixture,
  runtimeFixture,
  settleAsyncWork,
} from './w3h-fixtures';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') {
    globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  }
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function textDocument(): CatalogDocument {
  const base = documentFixture();
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'text-target',
        type: 'text',
        frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
        zIndex: 0,
        text: plainRichText('text-local', 'Modelo'),
        style: {
          fontFamily: 'Noto Sans',
          fontSizePt: 12,
          lineHeight: 1.2,
          fontWeight: 700,
          color: '#172033',
          textAlign: 'left',
        },
      }],
    }],
  };
}

function currentText(document: CatalogDocument): string | null {
  const object = document.pages[0]?.objects.find((entry) => entry.id === 'text-target');
  if (!object || object.type !== 'text') throw new Error('Missing text target');
  return projectEditableRichText(object.text);
}

describe('W3.H real Father text-edit autosave barrier', () => {
  it('keeps a valid active text draft mounted through debounce, then autosaves only after explicit commit', async () => {
    const document = textDocument();
    const repository = new StrictCasCatalogRepository(document);
    const clock = new ManualAutosaveClock();
    const active = runtimeFixture(repository, document, 9100, {
      autosaveClock: clock,
      debounceMs: 25,
    });
    const { container } = render(<VNextApp runtime={active.runtime} />);

    let renameOk = false;
    act(() => {
      renameOk = active.session.execute({ type: 'document.rename', title: 'Dirty before text edit' }).ok;
    });
    expect(renameOk).toBe(true);
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(clock.pendingCount()).toBe(1);

    const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
    if (!page) throw new Error('Missing canonical page');
    page.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 420,
      bottom: 594,
      width: 420,
      height: 594,
      toJSON: () => ({}),
    });
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]');
    if (!hit) throw new Error('Missing text hit target');
    fireEvent.pointerDown(hit, { pointerId: 44, button: 0, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(hit, { pointerId: 44, button: 0, clientX: 80, clientY: 80 });
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="edit-text"]')!);

    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]');
    if (!textarea) throw new Error('Missing text editor');
    fireEvent.change(textarea, { target: { value: 'Rascunho Father preservado' } });

    await waitFor(() => {
      expect(active.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(true);
    });
    const authoringBarrier = active.runtime.workspace.getAuthoringBarrier();
    const captureRecoveryOverlay = authoringBarrier.captureRecoveryOverlay;
    expect(captureRecoveryOverlay).toBeDefined();
    expect(captureRecoveryOverlay?.()).toMatchObject({
      kind: 'TEXT_DRAFT_V1',
      objectId: 'text-target',
      draft: 'Rascunho Father preservado',
    });
    expect(clock.pendingCount()).toBe(0);

    await act(async () => {
      clock.advanceBy(100);
      await settleAsyncWork(4);
    });

    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value)
      .toBe('Rascunho Father preservado');
    expect(currentText(active.session.getSnapshot().document)).toBe('Modelo');
    expect(active.runtime.workspace.getSnapshot().dirty).toBe(true);
    expect(repository.saveCAS).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-editor-action="commit-text"]')!);
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(active.runtime.workspace.getAuthoringBarrier().hasPendingDraft()).toBe(false);
    expect(currentText(active.session.getSnapshot().document)).toBe('Rascunho Father preservado');
    expect(clock.pendingCount()).toBe(1);

    await act(async () => {
      clock.advanceBy(25);
      await settleAsyncWork(4);
      await active.runtime.saveCoordinator.waitForActiveSave();
    });

    expect(repository.saveCAS).toHaveBeenCalledTimes(1);
    expect(repository.current(document.id).documentSnapshot.title).toBe('Dirty before text edit');
    expect(currentText(repository.current(document.id).documentSnapshot)).toBe('Rascunho Father preservado');
    expect(active.runtime.workspace.getSnapshot()).toMatchObject({
      dirty: false,
      save: { phase: 'idle', label: 'Saved' },
    });
    await act(async () => {
      await active.runtime.dispose();
    });
  });
});
