import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry, projectEditableRichText } from '@/vnext/application';
import { mmToU, plainRichText, type CatalogDocument, type RichText } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { isCurrentDiagnosticSource } from '@/vnext/app/authoring-diagnostics';
import { VNextApp } from '@/vnext/app/VNextApp';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';

afterEach(cleanup);

beforeEach(() => {
  class MockPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  if (typeof globalThis.PointerEvent === 'undefined') globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

function ids(prefix = 'ui') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function sessionWithDemo(document = createW2CDemoDocument(ids('doc'))) {
  return createDocumentSession(document, {
    createId: ids('generated'),
    templateRegistry: createStaticPageTemplateRegistry([W2E_PAGE_TEMPLATE]),
  });
}

function seedShapeDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [{
        id: 'shape-target',
        type: 'shape',
        frame: { xMm: 20, yMm: 30, widthMm: 40, heightMm: 50 },
        zIndex: 0,
        shape: 'rectangle',
        style: { fill: '#edf5ff' },
      }],
    }],
  };
}

function seedSafeAreaDocument(frame = { xMm: 5, yMm: 20, widthMm: 40, heightMm: 50 }): CatalogDocument {
  const document = seedShapeDocument();
  return {
    ...document,
    pages: [{
      ...document.pages[0],
      safeArea: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 },
      objects: [{ ...document.pages[0].objects[0], frame }],
    }],
  };
}

function seedTextDocument(options: {
  text?: RichText;
  locked?: boolean;
  includeShape?: boolean;
  includeSecondPage?: boolean;
} = {}): CatalogDocument {
  const base = createW2CDemoDocument(ids('text-seed'));
  const text = {
    id: 'text-target',
    type: 'text' as const,
    frame: { xMm: 20, yMm: 30, widthMm: 72, heightMm: 20 },
    zIndex: 0,
    ...(options.locked ? { locked: true } : {}),
    text: options.text ?? plainRichText('text-local', 'Modelo'),
    style: {
      fontFamily: 'Noto Sans',
      fontSizePt: 12,
      lineHeight: 1.2,
      fontWeight: 700 as const,
      color: '#172033',
      textAlign: 'left' as const,
    },
  };
  const shape = {
    id: 'shape-other',
    type: 'shape' as const,
    frame: { xMm: 110, yMm: 30, widthMm: 30, heightMm: 20 },
    zIndex: 1,
    shape: 'rectangle' as const,
    style: { fill: '#edf5ff' },
  };
  const firstPage = {
    ...base.pages[0],
    objects: options.includeShape ? [text, shape] : [text],
  };
  return {
    ...base,
    pages: options.includeSecondPage
      ? [firstPage, { ...base.pages[0], id: 'page-two', objects: [] }]
      : [firstPage],
  };
}

function complexText(): RichText {
  return {
    paragraphs: [{
      id: 'complex-p',
      inlines: [
        { kind: 'text', id: 'complex-a', text: 'A', marks: [] },
        { kind: 'text', id: 'complex-b', text: 'B', marks: ['bold'] },
      ],
    }],
  };
}

function textObject(document: CatalogDocument) {
  const object = document.pages.flatMap((page) => page.objects).find((entry) => entry.id === 'text-target');
  if (!object || object.type !== 'text') throw new Error('Missing text target');
  return object;
}

function selectText(container: HTMLElement, pointerId = 80): HTMLElement {
  setPageRect(container);
  const hit = container.querySelector<HTMLElement>('[data-editor-object-id="text-target"]');
  if (!hit) throw new Error('Missing text hit target');
  fireEvent.pointerDown(hit, { pointerId, button: 0, clientX: 80, clientY: 80 });
  fireEvent.pointerUp(hit, { pointerId, button: 0, clientX: 80, clientY: 80 });
  return hit;
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(`[data-editor-action="${action}"]`);
  if (!element) throw new Error(`Missing editor action ${action}`);
  return element;
}

function setPageRect(container: HTMLElement, width = 420, height = 594): HTMLElement {
  const page = container.querySelector<HTMLElement>('[data-editorial-root] [data-page-id]');
  if (!page) throw new Error('Missing canonical page');
  page.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return page;
}

describe('W2.C visible editor workspace', () => {
  it('inserts the W2.E page template as ordinary content, activates it, and restores exact identities with history', async () => {
    const session = sessionWithDemo();
    const { container } = render(<VNextApp session={session} />);
    const beforePageId = session.getSnapshot().document.pages[0].id;

    fireEvent.click(button(container, 'insert-template'));
    const inserted = session.getSnapshot().document.pages[1];
    expect(inserted.objects.map((object) => object.type)).toEqual(['text', 'shape', 'image', 'table']);
    expect(inserted.safeArea).toEqual({ topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 });
    await waitFor(() => expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-active-page-id', inserted.id));
    expect(container.querySelector('[data-editorial-root] [data-editor-action="insert-template"]')).toBeNull();
    const insertedIds = [inserted.id, ...inserted.objects.map((object) => object.id)];

    fireEvent.click(button(container, 'undo'));
    expect(session.getSnapshot().document.pages.map((page) => page.id)).toEqual([beforePageId]);
    fireEvent.click(button(container, 'redo'));
    expect(session.getSnapshot().document.pages[1].id).toBe(insertedIds[0]);
    expect(session.getSnapshot().document.pages[1].objects.map((object) => object.id)).toEqual(insertedIds.slice(1));
  });

  it('wires all visible basic authoring actions through W2.B and keeps overlay outside DocumentRenderer', async () => {
    const session = sessionWithDemo();
    const execute = vi.spyOn(session, 'execute');
    const undo = vi.spyOn(session, 'undo');
    const redo = vi.spyOn(session, 'redo');
    const { container } = render(<VNextApp session={session} />);

    const root = container.querySelector('[data-editorial-root]')!;
    const overlay = container.querySelector('[data-editor-overlay]')!;
    expect(root.contains(overlay)).toBe(false);
    expect(overlay.querySelectorAll('[data-resize-handle]')).toHaveLength(0);

    for (const action of ['add-text', 'add-image', 'add-table', 'add-shape', 'add-line']) {
      fireEvent.click(button(container, action));
    }
    expect(session.getSnapshot().document.pages[0].objects.map((object) => object.type)).toEqual(['text', 'image', 'table', 'shape', 'line']);
    expect(execute.mock.calls.filter(([action]) => action.type === 'object.insert')).toHaveLength(5);

    fireEvent.click(button(container, 'duplicate'));
    expect(execute.mock.calls.at(-1)?.[0].type).toBe('object.duplicate');
    fireEvent.click(button(container, 'send-back'));
    expect(execute.mock.calls.at(-1)?.[0].type).toBe('object.reorder');

    fireEvent.click(button(container, 'add-image'));
    const selectedImage = session.getSnapshot().document.pages[0].objects.at(-1)!;
    expect(selectedImage.type).toBe('image');
    const originalAssetId = selectedImage.type === 'image' ? selectedImage.assetId : '';
    fireEvent.click(button(container, 'replace-image'));
    expect(execute.mock.calls.at(-1)?.[0].type).toBe('image.replace');
    const replaced = session.getSnapshot().document.pages[0].objects.find((object) => object.id === selectedImage.id)!;
    expect(replaced.type === 'image' && replaced.assetId).not.toBe(originalAssetId);

    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')!;
    fireEvent.change(x, { target: { value: '25.125' } });
    fireEvent.blur(x);
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'object.move', xU: mmToU(25.125) });

    const width = container.querySelector<HTMLInputElement>('[data-inspector-field="width"]')!;
    fireEvent.change(width, { target: { value: '63.75' } });
    fireEvent.blur(width);
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'object.resize', widthU: mmToU(63.75) });

    const beforeInvalid = session.getSnapshot().document;
    fireEvent.change(width, { target: { value: 'not-a-number' } });
    fireEvent.blur(width);
    expect(session.getSnapshot().document).toBe(beforeInvalid);

    fireEvent.click(button(container, 'delete'));
    expect(execute.mock.calls.at(-1)?.[0].type).toBe('object.delete');

    fireEvent.click(button(container, 'undo'));
    expect(undo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button(container, 'redo')).not.toBeDisabled());
    fireEvent.click(button(container, 'redo'));
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('shows eight handles for one selected object and selection itself creates no history', () => {
    const session = sessionWithDemo(seedShapeDocument());
    const execute = vi.spyOn(session, 'execute');
    const before = session.getSnapshot();
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(hit, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    expect(hit).toHaveAttribute('data-selected', 'true');
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8);
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toBe(before.document);
    expect(session.getSnapshot().canUndo).toBe(before.canUndo);
    expect(session.getSnapshot().canRedo).toBe(before.canRedo);
  });

  it('renders pointermove preview without canonical writes, then commits one move', () => {
    const session = sessionWithDemo(seedShapeDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    const before = session.getSnapshot().document;
    fireEvent.pointerDown(hit, { pointerId: 2, button: 0, clientX: 100, clientY: 100 });
    for (let i = 1; i <= 110; i += 1) fireEvent.pointerMove(hit, { pointerId: 2, clientX: 100 + i / 10, clientY: 100 + i / 20 });
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toBe(before);
    expect(container.querySelector('[data-editor-preview="true"]')).toBeTruthy();
    fireEvent.pointerUp(hit, { pointerId: 2, button: 0, clientX: 142, clientY: 159.4 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].type).toBe('object.move');
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('cancels preview on %s without committing', (eventName) => {
    const session = sessionWithDemo(seedShapeDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    const before = session.getSnapshot().document;
    fireEvent.pointerDown(hit, { pointerId: 3, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 3, clientX: 130, clientY: 130 });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeTruthy();
    fireEvent[eventName](hit, { pointerId: 3 });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toBe(before);
  });

  it('cancels preview on Escape, element focus loss, and window focus loss without committing', () => {
    const session = sessionWithDemo(seedShapeDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    const before = session.getSnapshot().document;

    fireEvent.pointerDown(hit, { pointerId: 4, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 4, clientX: 130, clientY: 130 });
    fireEvent.keyDown(hit, { key: 'Escape' });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();

    fireEvent.pointerDown(hit, { pointerId: 5, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 5, clientX: 130, clientY: 130 });
    fireEvent.blur(hit, { relatedTarget: document.body });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();

    fireEvent.pointerDown(hit, { pointerId: 51, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 51, clientX: 130, clientY: 130 });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeTruthy();
    fireEvent.blur(window);
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toBe(before);
  });

  it('Undo cancels an active gesture before history navigation', () => {
    const session = sessionWithDemo();
    const { container } = render(<VNextApp session={session} />);
    fireEvent.click(button(container, 'add-shape'));
    setPageRect(container);
    const inserted = session.getSnapshot().document.pages[0].objects[0];
    const originalFrame = inserted.frame;
    const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${inserted.id}"]`)!;
    fireEvent.pointerDown(hit, { pointerId: 6, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 6, clientX: 142, clientY: 142 });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeTruthy();
    fireEvent.click(button(container, 'undo'));
    expect(session.getSnapshot().document.pages[0].objects).toHaveLength(0);
    fireEvent.click(button(container, 'redo'));
    expect(session.getSnapshot().document.pages[0].objects[0].frame).toEqual(originalFrame);
  });

  it('Redo cancels an active gesture before applying the redo snapshot', () => {
    const initial = seedShapeDocument();
    const session = sessionWithDemo(initial);
    expect(session.execute({ type: 'object.move', objectId: 'shape-target', xU: mmToU(25), yU: mmToU(30) }).ok).toBe(true);
    expect(session.undo().ok).toBe(true);
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 7, clientX: 142, clientY: 142 });
    expect(container.querySelector('[data-editor-preview="true"]')).toBeTruthy();
    fireEvent.click(button(container, 'redo'));
    expect(container.querySelector('[data-editor-preview="true"]')).toBeNull();
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(25);
  });
});

describe('W2.G direct Text editing workspace', () => {
  it('activates by Enter and contextual button, keeps the textarea outside publication, and hides resize handles', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} />);
    const hit = selectText(container);
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8);

    fireEvent.keyDown(hit, { key: 'Enter' });
    let textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]');
    expect(textarea).toBeTruthy();
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-editor-mode', 'text-edit');
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(0);
    expect(container.querySelector('[data-editorial-root] [data-text-edit-textarea]')).toBeNull();
    expect(container.querySelector('[data-editorial-root] [data-editor-action="commit-text"]')).toBeNull();
    fireEvent.click(button(container, 'cancel-text'));

    selectText(container, 81);
    fireEvent.click(button(container, 'edit-text'));
    textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]');
    expect(textarea?.value).toBe('Modelo');
  });

  it('suppresses the second click of a jittery double activation so the authored frame is unchanged', () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    const beforeFrame = textObject(session.getSnapshot().document).frame;
    const hit = selectText(container, 82);

    fireEvent.pointerDown(hit, { pointerId: 83, button: 0, clientX: 81, clientY: 81 });
    fireEvent.pointerMove(hit, { pointerId: 83, clientX: 83, clientY: 82 });
    fireEvent.pointerUp(hit, { pointerId: 83, button: 0, clientX: 83, clientY: 82 });

    expect(container.querySelector('[data-text-edit-textarea]')).toBeTruthy();
    expect(textObject(session.getSnapshot().document).frame).toEqual(beforeFrame);
    expect(execute.mock.calls.some(([action]) => action.type === 'object.move')).toBe(false);
  });

  it('fails safely for locked and complex Text and never exposes grouped Text child editing', () => {
    const lockedSession = sessionWithDemo(seedTextDocument({ locked: true }));
    const lockedView = render(<VNextApp session={lockedSession} />);
    const lockedHit = selectText(lockedView.container, 84);
    expect(button(lockedView.container, 'edit-text')).toBeDisabled();
    fireEvent.keyDown(lockedHit, { key: 'Enter' });
    expect(lockedView.container.querySelector('[data-text-edit-textarea]')).toBeNull();
    cleanup();

    const complexSession = sessionWithDemo(seedTextDocument({ text: complexText() }));
    const complexView = render(<VNextApp session={complexSession} />);
    const complexHit = selectText(complexView.container, 85);
    expect(button(complexView.container, 'edit-text')).toBeDisabled();
    fireEvent.keyDown(complexHit, { key: 'Enter' });
    expect(complexView.container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(complexView.container.querySelector('[role="status"]')?.textContent).toContain('formatação estrutural complexa');
    cleanup();

    const groupSession = sessionWithDemo();
    const groupView = render(<VNextApp session={groupSession} />);
    fireEvent.click(button(groupView.container, 'add-text'));
    const textId = groupSession.getSnapshot().document.pages[0].objects[0].id;
    fireEvent.click(button(groupView.container, 'add-shape'));
    const shapeId = groupSession.getSnapshot().document.pages[0].objects[1].id;
    setPageRect(groupView.container);
    const textHit = groupView.container.querySelector<HTMLElement>(`[data-editor-object-id="${textId}"]`)!;
    const shapeHit = groupView.container.querySelector<HTMLElement>(`[data-editor-object-id="${shapeId}"]`)!;
    fireEvent.pointerDown(textHit, { pointerId: 86, button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(textHit, { pointerId: 86, button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerDown(shapeHit, { pointerId: 87, button: 0, clientX: 160, clientY: 40, ctrlKey: true });
    fireEvent.click(button(groupView.container, 'group'));
    expect(groupView.container.querySelector(`[data-editor-object-id="${textId}"]`)).toBeNull();
    expect(button(groupView.container, 'edit-text')).toBeDisabled();
  });

  it('keeps typing ephemeral, Escape discards it, and one explicit commit preserves frame/style while producing one history step', () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const beforeObject = textObject(session.getSnapshot().document);
    const beforeDocument = session.getSnapshot().document;
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 88);
    fireEvent.click(button(container, 'edit-text'));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;

    fireEvent.change(textarea, { target: { value: 'Rascunho\n± 0.05 °C' } });
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().document).toBe(beforeDocument);
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Modelo');

    selectText(container, 89);
    fireEvent.click(button(container, 'edit-text'));
    const textarea2 = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.change(textarea2, { target: { value: 'Final\n100 Ω' } });
    fireEvent.click(button(container, 'commit-text'));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].type).toBe('text.setContent');
    const afterObject = textObject(session.getSnapshot().document);
    expect(projectEditableRichText(afterObject.text)).toBe('Final\n100 Ω');
    expect(afterObject.frame).toEqual(beforeObject.frame);
    expect(afterObject.style).toEqual(beforeObject.style);
    expect(afterObject.zIndex).toBe(beforeObject.zIndex);
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.undo().ok).toBe(true);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Modelo');
    expect(session.redo().ok).toBe(true);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Final\n100 Ω');
  });

  it('raw blur and window blur retain the draft, while Ctrl/Cmd+Enter commits once', () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 90);
    fireEvent.click(button(container, 'edit-text'));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.change(textarea, { target: { value: 'Mantido em foco externo' } });
    fireEvent.blur(textarea);
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Mantido em foco externo');
    expect(execute).not.toHaveBeenCalled();
    fireEvent.blur(window);
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Mantido em foco externo');
    expect(execute).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Mantido em foco externo');
  });

  it('inserts every technical symbol at the textarea selection without committing and restores focus', async () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 91);
    fireEvent.click(button(container, 'edit-text'));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    textarea.setSelectionRange(0, textarea.value.length);
    const symbolButtons = [...container.querySelectorAll<HTMLButtonElement>('[data-editor-symbol-index]')];
    expect(symbolButtons.map((entry) => entry.textContent)).toEqual(['±', '°C', 'Ω', 'µ', '≤', '≥', '≈']);
    fireEvent.click(symbolButtons[0]);
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(textarea.value).toBe('±');
    expect(execute).not.toHaveBeenCalled();
    for (const symbolButton of symbolButtons.slice(1)) {
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.click(symbolButton);
      await waitFor(() => expect(document.activeElement).toBe(textarea));
    }
    expect(textarea.value).toBe('±°CΩµ≤≥≈');
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(button(container, 'commit-text'));
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('±°CΩµ≤≥≈');
  });

  it('controlled click-away commits before another object interaction, while page change cancels', () => {
    const session = sessionWithDemo(seedTextDocument({ includeShape: true, includeSecondPage: true }));
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 92);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Commit no click-away' } });
    const shape = container.querySelector<HTMLElement>('[data-editor-object-id="shape-other"]')!;
    fireEvent.pointerDown(shape, { pointerId: 93, button: 0, clientX: 200, clientY: 80 });
    fireEvent.pointerUp(shape, { pointerId: 93, button: 0, clientX: 200, clientY: 80 });
    expect(execute.mock.calls.filter(([action]) => action.type === 'text.setContent')).toHaveLength(1);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Commit no click-away');

    selectText(container, 94);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Não deve persistir' } });
    const secondPage = [...container.querySelectorAll<HTMLButtonElement>('.vnext-page-list button')][1];
    fireEvent.click(secondPage);
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Commit no click-away');
  });

  it('Undo and Redo cancel an unconfirmed draft before navigating canonical history', () => {
    const session = sessionWithDemo(seedTextDocument());
    const original = textObject(session.getSnapshot().document).text;
    expect(session.execute({
      type: 'text.setContent',
      objectId: 'text-target',
      expectedText: original,
      plainText: 'Commit anterior',
    }).ok).toBe(true);
    const committed = textObject(session.getSnapshot().document).text;
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 95);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Rascunho descartado por Undo' } });
    fireEvent.click(button(container, 'undo'));
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(textObject(session.getSnapshot().document).text).toEqual(original);

    selectText(container, 96);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Rascunho descartado por Redo' } });
    fireEvent.click(button(container, 'redo'));
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(textObject(session.getSnapshot().document).text).toEqual(committed);
  });

  it('does not trigger commit during IME composition and commits after composition ends', () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 97);
    fireEvent.click(button(container, 'edit-text'));
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')!;
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: 'Calibração á' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true });
    expect(execute).not.toHaveBeenCalled();
    expect(container.querySelector('[data-text-edit-textarea]')).toBeTruthy();
    fireEvent.compositionEnd(textarea);
    fireEvent.click(button(container, 'commit-text'));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Calibração á');
  });

  it('fails a stale commit closed and keeps the intervening canonical content', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 98);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Rascunho stale' } });
    const expected = textObject(session.getSnapshot().document).text;
    expect(session.execute({
      type: 'text.setContent',
      objectId: 'text-target',
      expectedText: expected,
      plainText: 'Mudança concorrente',
    }).ok).toBe(true);
    fireEvent.click(button(container, 'commit-text'));
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Mudança concorrente');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('rascunho não foi aplicado');
  });

  it('closes a no-op edit with one semantic action and no history entry', () => {
    const session = sessionWithDemo(seedTextDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 99);
    fireEvent.click(button(container, 'edit-text'));
    fireEvent.click(button(container, 'commit-text'));
    expect(execute.mock.calls.filter(([action]) => action.type === 'text.setContent')).toHaveLength(1);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().canRedo).toBe(false);
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
  });
});

describe('W2.F visible Group workflow', () => {
  it('supports Ctrl/Cmd-style top-level multi-selection, Group/Ungroup selection transitions, and Group-only chrome', () => {
    const session=sessionWithDemo();
    const execute=vi.spyOn(session,'execute');
    const {container}=render(<VNextApp session={session}/>);
    fireEvent.click(button(container,'add-text'));
    const textId=session.getSnapshot().document.pages[0].objects[0].id;
    fireEvent.click(button(container,'add-shape'));
    const shapeId=session.getSnapshot().document.pages[0].objects[1].id;
    setPageRect(container);

    const textHit=container.querySelector<HTMLElement>(`[data-editor-object-id="${textId}"]`)!;
    const shapeHit=container.querySelector<HTMLElement>(`[data-editor-object-id="${shapeId}"]`)!;
    fireEvent.pointerDown(textHit,{pointerId:60,button:0,clientX:40,clientY:40});
    fireEvent.pointerUp(textHit,{pointerId:60,button:0,clientX:40,clientY:40});
    fireEvent.pointerDown(shapeHit,{pointerId:61,button:0,clientX:200,clientY:40,ctrlKey:true});
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(2);
    expect(button(container,'group')).not.toBeDisabled();

    fireEvent.click(button(container,'group'));
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({type:'group.create'});
    const group=session.getSnapshot().document.pages[0].objects[0];
    expect(group.type).toBe('group');
    if(group.type!=='group')return;
    expect(group.objects.map((child)=>child.id)).toEqual([textId,shapeId]);
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
    expect(container.querySelector(`[data-editor-object-id="${group.id}"][data-selected="true"]`)).toBeTruthy();
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(0);
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')).not.toHaveAttribute('readonly');
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="y"]')).not.toHaveAttribute('readonly');
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="width"]')).toHaveAttribute('readonly');
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="height"]')).toHaveAttribute('readonly');
    expect(container.querySelector('[data-editorial-root] [data-editor-action="group"]')).toBeNull();
    expect(container.querySelector('[data-editorial-root] [data-resize-handle]')).toBeNull();
    expect(container.querySelector(`[data-editor-object-id="${textId}"]`)).toBeNull();
    expect(container.querySelector(`[data-editor-object-id="${shapeId}"]`)).toBeNull();

    fireEvent.click(button(container,'ungroup'));
    expect(execute.mock.calls.at(-1)?.[0]).toEqual({type:'group.ungroup',groupId:group.id});
    expect(session.getSnapshot().document.pages[0].objects.map((object)=>object.id)).toEqual([textId,shapeId]);
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(2);
    expect(button(container,'group')).not.toBeDisabled();
  });
});

describe('W2.D visible snapping and diagnostics', () => {
  it('shows ephemeral page-edge guides, clears them away from the target/commit, and disables snapping without changing pointer sampling', () => {
    const session = sessionWithDemo(seedShapeDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;

    fireEvent.pointerDown(hit, { pointerId: 20, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 20, clientX: 62, clientY: 100 });
    expect(execute).not.toHaveBeenCalled();
    expect(container.querySelector('[data-snap-guide="x"][data-snap-guide-kind="page-edge"]')).toBeTruthy();

    fireEvent.pointerMove(hit, { pointerId: 20, clientX: 100, clientY: 100 });
    expect(container.querySelector('[data-snap-guide]')).toBeNull();

    fireEvent.pointerMove(hit, { pointerId: 20, clientX: 62, clientY: 100 });
    fireEvent.pointerUp(hit, { pointerId: 20, button: 0, clientX: 62, clientY: 100 });
    expect(container.querySelector('[data-snap-guide]')).toBeNull();
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);

    fireEvent.click(button(container, 'undo'));
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(20);
    fireEvent.click(button(container, 'toggle-snapping'));
    expect(button(container, 'toggle-snapping')).toHaveAttribute('aria-pressed', 'false');

    const restoredHit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(restoredHit, { pointerId: 21, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(restoredHit, { pointerId: 21, clientX: 62, clientY: 100 });
    expect(container.querySelector('[data-snap-guide]')).toBeNull();
    fireEvent.pointerUp(restoredHit, { pointerId: 21, button: 0, clientX: 62, clientY: 100 });
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('shows canonical safe-area warning and outside-page error without moving authored geometry, then clears the error after explicit correction', async () => {
    const session = sessionWithDemo(seedSafeAreaDocument());
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 30, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(hit, { pointerId: 30, button: 0, clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(container.querySelector('[data-diagnostic-code="SAFE_AREA_VIOLATION"][data-diagnostic-severity="WARNING"]')).toBeTruthy();
    });
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(5);
    expect(container.querySelector('[data-editor-safe-area]')).toBeTruthy();
    expect(container.querySelector('[data-editorial-root] [data-editor-safe-area]')).toBeNull();
    expect(container.querySelector('[data-editorial-root] [data-editor-diagnostic-badge]')).toBeNull();

    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')!;
    fireEvent.change(x, { target: { value: '-1' } });
    fireEvent.blur(x);
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(-1);
    await waitFor(() => {
      expect(container.querySelector('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"][data-diagnostic-severity="ERROR"]')).toBeTruthy();
    });

    fireEvent.change(x, { target: { value: '20' } });
    fireEvent.blur(x);
    expect(session.getSnapshot().document.pages[0].objects[0].frame.xMm).toBe(20);
    await waitFor(() => {
      expect(container.querySelector('[data-diagnostic-code="OBJECT_OUTSIDE_PAGE"]')).toBeNull();
    });
  });

  it('keeps guide, safe-area, badge, toggle, and diagnostics chrome outside every canonical editorial root', async () => {
    const session = sessionWithDemo(seedSafeAreaDocument());
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="shape-target"]')!;
    fireEvent.pointerDown(hit, { pointerId: 40, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(hit, { pointerId: 40, clientX: 110, clientY: 100 });
    await waitFor(() => expect(container.querySelector('[data-editor-diagnostic-badge]')).toBeTruthy());

    for (const root of container.querySelectorAll('[data-editorial-root]')) {
      expect(root.querySelector('[data-snap-guide]')).toBeNull();
      expect(root.querySelector('[data-editor-safe-area]')).toBeNull();
      expect(root.querySelector('[data-editor-diagnostic-badge]')).toBeNull();
      expect(root.querySelector('[data-editor-diagnostics]')).toBeNull();
      expect(root.querySelector('[data-editor-action="toggle-snapping"]')).toBeNull();
    }
  });

  it('rejects stale diagnostic results by canonical snapshot identity', () => {
    const first = seedShapeDocument();
    const second = {
      ...first,
      title: 'new canonical snapshot',
    };
    expect(isCurrentDiagnosticSource(first, first)).toBe(true);
    expect(isCurrentDiagnosticSource(second, first)).toBe(false);
  });
});
