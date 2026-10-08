import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createDocumentSession, createStaticPageTemplateRegistry, projectEditableRichText } from '@/vnext/application';
import { mmToU, plainRichText, type CatalogDocument, type RichText } from '@/vnext/domain';
import { createW2CDemoDocument } from '@/vnext/app/editor-defaults';
import { isCurrentDiagnosticSource } from '@/vnext/app/authoring-diagnostics';
import { tableStyleDisabledGuidance } from '@/vnext/app/EditorWorkspace';
import { TableStyleInspector } from '@/vnext/app/TableStyleInspector';
import { VNextApp } from '@/vnext/app/VNextApp';
import { W2E_PAGE_TEMPLATE } from '@/vnext/app/page-template-fixtures';
import { createW4BTableDocument } from '../proof/fixtures/w4b-table-document';
import { createW4DTableDocument, W4D_OBJECT_B_ID } from '../proof/fixtures/w4d-table-document';

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

function seedArrangementDocument(options: { includeSecondPage?: boolean } = {}): CatalogDocument {
  const base = createW2CDemoDocument(ids('arrange-seed'));
  const objects = [
    {
      id: 'arrange-a',
      type: 'shape' as const,
      frame: { xMm: 20, yMm: 30, widthMm: 20, heightMm: 12 },
      zIndex: 0,
      shape: 'rectangle' as const,
      style: { fill: '#edf5ff' },
    },
    {
      id: 'arrange-b',
      type: 'text' as const,
      frame: { xMm: 70, yMm: 45, widthMm: 30, heightMm: 16 },
      zIndex: 1,
      text: plainRichText('arrange-b-rich', 'B'),
      style: { fontSizePt: 10 },
    },
    {
      id: 'arrange-c',
      type: 'shape' as const,
      frame: { xMm: 130, yMm: 60, widthMm: 20, heightMm: 12 },
      zIndex: 2,
      shape: 'rectangle' as const,
      style: { fill: '#dbeafe' },
    },
  ];
  const firstPage = { ...base.pages[0], objects };
  return {
    ...base,
    pages: options.includeSecondPage
      ? [firstPage, { ...base.pages[0], id: 'arrange-page-two', objects: [] }]
      : [firstPage],
  };
}

function seedClosureLockedGroupDocument(): CatalogDocument {
  const base = createW2CDemoDocument(ids('closure-seed'));
  return {
    ...base,
    pages: [{
      ...base.pages[0],
      objects: [
        {
          id: 'locked-group',
          type: 'group' as const,
          frame: { xMm: 20, yMm: 30, widthMm: 30, heightMm: 10 },
          zIndex: 0,
          objects: [
            {
              id: 'locked-child',
              type: 'shape' as const,
              frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
              zIndex: 0,
              locked: true,
              shape: 'rectangle' as const,
              style: { fill: '#edf5ff' },
            },
            {
              id: 'open-child',
              type: 'shape' as const,
              frame: { xMm: 20, yMm: 0, widthMm: 10, heightMm: 10 },
              zIndex: 1,
              shape: 'rectangle' as const,
              style: { fill: '#dbeafe' },
            },
          ],
        },
        {
          id: 'outside-shape',
          type: 'shape' as const,
          frame: { xMm: 90, yMm: 30, widthMm: 20, heightMm: 10 },
          zIndex: 1,
          shape: 'rectangle' as const,
          style: { fill: '#f1f5f9' },
        },
      ],
    }],
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

function pointerClick(element: HTMLElement, pointerId: number): void {
  fireEvent.pointerDown(element, { pointerId, button: 0 });
  fireEvent.pointerUp(element, { pointerId, button: 0 });
  fireEvent.click(element);
}

function enableTransformFreePhysicalMeasurement() {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = nativeGetComputedStyle(element, pseudoElement);
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform' || property === 'scale' || property === 'translate' || property === 'rotate') return 'none';
        if (property === 'zoom') return '1';
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as CSSStyleDeclaration;
  });
  const originalDecode = HTMLImageElement.prototype.decode;
  const originalGetClientRects = Range.prototype.getClientRects;
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  return () => {
    computedStyle.mockRestore();
    HTMLImageElement.prototype.decode = originalDecode;
    Range.prototype.getClientRects = originalGetClientRects;
  };
}

async function enterMeasuredTableGrid(container: HTMLElement, tableId: string, pointerId: number): Promise<void> {
  setPageRect(container);
  const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${tableId}"]`);
  if (!hit) throw new Error('Missing Table hit target');
  fireEvent.pointerDown(hit, { pointerId, button: 0, clientX: 120, clientY: 100 });
  fireEvent.pointerUp(hit, { pointerId, button: 0, clientX: 120, clientY: 100 });
  const shell = container.querySelector<HTMLElement>('[data-vnext-shell]');
  if (!shell) throw new Error('Missing VNext shell');
  await waitFor(() => {
    if (shell.getAttribute('data-editor-mode') !== 'table-grid') fireEvent.click(button(container, 'edit-table'));
    expect(shell).toHaveAttribute('data-editor-mode', 'table-grid');
    expect(container.querySelector('[data-table-grid-overlay]')).toBeTruthy();
  });
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

    const callsBeforeBlockedDelete = execute.mock.calls.length;
    fireEvent.click(button(container, 'delete'));
    expect(execute.mock.calls).toHaveLength(callsBeforeBlockedDelete);
    expect(container.querySelector<HTMLInputElement>('[data-inspector-field="width"]')?.value).toBe('not-a-number');

    fireEvent.change(width, { target: { value: '63.75' } });
    fireEvent.blur(width);
    fireEvent.click(button(container, 'delete'));
    expect(execute.mock.calls.at(-1)?.[0].type).toBe('object.delete');

    fireEvent.click(button(container, 'undo'));
    expect(undo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button(container, 'redo')).not.toBeDisabled());
    fireEvent.click(button(container, 'redo'));
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['x', 'Horizontal', '80'],
    ['y', 'Vertical', '20'],
  ] as const)('cancels %s focal range gesture on owned capture loss and keeps later blur semantic no-op', async (axis, _label, draftValue) => {
    const session = sessionWithDemo();
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);

    fireEvent.click(button(container, 'add-image'));
    const image = session.getSnapshot().document.pages[0].objects.at(-1);
    expect(image?.type).toBe('image');
    if (!image || image.type !== 'image') return;

    const fit = container.querySelector<HTMLSelectElement>('[data-image-fit]')!;
    fireEvent.change(fit, { target: { value: 'cover' } });
    expect(session.getSnapshot().document.pages[0].objects.find((object) => object.id === image.id))
      .toMatchObject({ type: 'image', fit: 'cover' });

    const x = container.querySelector<HTMLInputElement>('[data-inspector-field="x"]')!;
    fireEvent.change(x, { target: { value: '25' } });
    fireEvent.blur(x);
    fireEvent.click(button(container, 'undo'));
    await waitFor(() => expect(session.getSnapshot().canRedo).toBe(true));

    const range = container.querySelector<HTMLInputElement>(`[data-image-focal-axis="${axis}"]`)!;
    const canonicalValue = range.value;
    const before = session.getSnapshot();
    const presentationCallsBefore = execute.mock.calls.filter(([action]) => action.type === 'image.setPresentation').length;
    const pointerId = axis === 'x' ? 401 : 402;

    fireEvent.pointerDown(range, { pointerId, button: 0 });
    fireEvent.change(range, { target: { value: draftValue } });
    expect(range.value).toBe(draftValue);
    expect(session.getSnapshot().localSequence).toBe(before.localSequence);

    fireEvent.lostPointerCapture(range, { pointerId: pointerId + 1000 });
    expect(range.value).toBe(draftValue);
    expect(session.getSnapshot().localSequence).toBe(before.localSequence);

    fireEvent.lostPointerCapture(range, { pointerId });
    await waitFor(() => expect(range.value).toBe(canonicalValue));
    fireEvent.blur(range);

    const after = session.getSnapshot();
    expect(after.document).toBe(before.document);
    expect(after.localSequence).toBe(before.localSequence);
    expect(after.canUndo).toBe(before.canUndo);
    expect(after.canRedo).toBe(before.canRedo);
    expect(execute.mock.calls.filter(([action]) => action.type === 'image.setPresentation')).toHaveLength(presentationCallsBefore);
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

  it('controlled click-away and page change both canonicalize a valid Text draft before transition', () => {
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
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Commit antes da troca de página' } });
    const secondPage = [...container.querySelectorAll<HTMLButtonElement>('.vnext-page-list button')][1];
    fireEvent.click(secondPage);
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Commit antes da troca de página');
  });

  it('Undo canonicalizes the current draft first and Redo restores that canonical history entry', () => {
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
    fireEvent.change(container.querySelector('[data-text-edit-textarea]')!, { target: { value: 'Rascunho canonicalizado por Undo' } });
    fireEvent.click(button(container, 'undo'));
    expect(container.querySelector('[data-text-edit-textarea]')).toBeNull();
    expect(textObject(session.getSnapshot().document).text).toEqual(committed);
    expect(session.getSnapshot().canRedo).toBe(true);

    fireEvent.click(button(container, 'redo'));
    expect(projectEditableRichText(textObject(session.getSnapshot().document).text)).toBe('Rascunho canonicalizado por Undo');
    expect(session.getSnapshot().canUndo).toBe(true);
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

  it('fails a stale commit closed while preserving the visible draft and intervening canonical content', () => {
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
    expect(container.querySelector<HTMLTextAreaElement>('[data-text-edit-textarea]')?.value).toBe('Rascunho stale');
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

describe('W4.F.5 visible object arrangement and locking', () => {
  it('adds modifier-free multi-selection, arrangement controls, touch-like selection, and page-change cleanup', () => {
    const session = sessionWithDemo(seedArrangementDocument({ includeSecondPage: true }));
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);

    const multi = button(container, 'toggle-multi-select');
    expect(multi).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(multi);
    expect(multi).toHaveAttribute('aria-pressed', 'true');

    for (const [index, id] of ['arrange-a', 'arrange-b'].entries()) {
      const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${id}"]`)!;
      fireEvent.pointerDown(hit, { pointerId: 200 + index, button: 0, clientX: 80 + index * 40, clientY: 80 });
    }
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(2);
    expect(container.querySelector('.vnext-info h2')).toHaveTextContent('2 objetos selecionados');
    expect(button(container, 'align-left')).not.toBeDisabled();
    expect(button(container, 'distribute-horizontal')).toBeDisabled();

    const third = container.querySelector<HTMLElement>('[data-editor-object-id="arrange-c"]')!;
    fireEvent.pointerDown(third, { pointerId: 203, button: 0, clientX: 200, clientY: 100 });
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(3);
    expect(button(container, 'distribute-horizontal')).not.toBeDisabled();

    fireEvent.click(button(container, 'align-left'));
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'objects.align', alignment: 'left' });
    expect(session.getSnapshot().document.pages[0].objects.map((object) => object.frame.xMm)).toEqual([20, 20, 20]);

    fireEvent.click(button(container, 'distribute-horizontal'));
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'objects.distribute', axis: 'horizontal' });

    const pages = container.querySelectorAll<HTMLButtonElement>('.vnext-page-list button');
    expect(pages).toHaveLength(2);
    fireEvent.click(pages[1]);
    expect(button(container, 'toggle-multi-select')).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(0);
  });

  it('locks and unlocks a selected root while preserving selection and disabling ordinary mutation affordances', () => {
    const session = sessionWithDemo(seedArrangementDocument());
    const execute = vi.spyOn(session, 'execute');
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const hit = container.querySelector<HTMLElement>('[data-editor-object-id="arrange-b"]')!;

    fireEvent.pointerDown(hit, { pointerId: 210, button: 0, clientX: 120, clientY: 100 });
    fireEvent.pointerUp(hit, { pointerId: 210, button: 0, clientX: 120, clientY: 100 });
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8);

    const lock = button(container, 'toggle-object-lock');
    expect(lock).toHaveTextContent('Bloquear objeto');
    fireEvent.click(lock);
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'object.setLocked', objectId: 'arrange-b', expectedLocked: false, locked: true,
    });
    const locked = session.getSnapshot().document.pages[0].objects.find((object) => object.id === 'arrange-b');
    expect(locked?.locked).toBe(true);
    expect(container.querySelector('[data-editor-object-id="arrange-b"]')).toHaveAttribute('data-selected', 'true');
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(0);
    for (const action of ['duplicate', 'delete', 'send-back', 'send-backward', 'bring-forward', 'bring-front', 'edit-text']) {
      expect(button(container, action)).toBeDisabled();
    }
    for (const input of container.querySelectorAll<HTMLInputElement>('[data-inspector-field]')) expect(input).toBeDisabled();
    expect(lock).not.toBeDisabled();
    expect(lock).toHaveTextContent('Desbloquear objeto');
    expect(container.querySelector('#vnext-object-lock-reason')).toHaveTextContent('Objeto bloqueado.');

    fireEvent.click(lock);
    expect(execute.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'object.setLocked', objectId: 'arrange-b', expectedLocked: true, locked: false,
    });
    expect(session.getSnapshot().document.pages[0].objects.find((object) => object.id === 'arrange-b')?.locked).toBeUndefined();
    expect(container.querySelectorAll('[data-resize-handle]')).toHaveLength(8);
    expect(button(container, 'edit-text')).not.toBeDisabled();
  });

  it('distinguishes own Group lock from descendant closure lock and blocks arrangement without false unlock guidance', () => {
    const session = sessionWithDemo(seedClosureLockedGroupDocument());
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    const groupHit = container.querySelector<HTMLElement>('[data-editor-object-id="locked-group"]')!;

    fireEvent.pointerDown(groupHit, { pointerId: 220, button: 0, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(groupHit, { pointerId: 220, button: 0, clientX: 80, clientY: 80 });
    expect(button(container, 'toggle-object-lock')).toHaveTextContent('Bloquear objeto');
    expect(container.querySelector('#vnext-object-closure-lock-reason')).toHaveTextContent(
      'Este grupo contém um objeto interno bloqueado e não pode ser organizado nesta versão.'
    );
    for (const input of container.querySelectorAll<HTMLInputElement>('[data-inspector-field]')) expect(input).toBeDisabled();
    expect(button(container, 'duplicate')).toBeDisabled();
    expect(button(container, 'ungroup')).toBeDisabled();

    fireEvent.click(button(container, 'toggle-multi-select'));
    const outside = container.querySelector<HTMLElement>('[data-editor-object-id="outside-shape"]')!;
    fireEvent.pointerDown(outside, { pointerId: 221, button: 0, clientX: 190, clientY: 80 });
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(2);
    expect(container.querySelector('[data-object-arrangement]')).toHaveTextContent(
      'Um dos grupos selecionados contém um objeto interno bloqueado.'
    );
    expect(button(container, 'align-left')).toBeDisabled();
  });

  it('disarms modifier-free selection and narrows selection when entering Text edit', () => {
    const session = sessionWithDemo(seedArrangementDocument());
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);
    fireEvent.click(button(container, 'toggle-multi-select'));

    const textHit = container.querySelector<HTMLElement>('[data-editor-object-id="arrange-b"]')!;
    const shapeHit = container.querySelector<HTMLElement>('[data-editor-object-id="arrange-a"]')!;
    fireEvent.pointerDown(textHit, { pointerId: 230, button: 0, clientX: 120, clientY: 100 });
    fireEvent.pointerDown(shapeHit, { pointerId: 231, button: 0, clientX: 60, clientY: 80 });
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(2);

    fireEvent.pointerDown(shapeHit, { pointerId: 232, button: 0, clientX: 60, clientY: 80 });
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
    fireEvent.click(button(container, 'edit-text'));
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-editor-mode', 'text-edit');
    expect(button(container, 'toggle-multi-select')).toHaveAttribute('aria-pressed', 'false');
    expect(button(container, 'toggle-multi-select')).toBeDisabled();
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
  });

  it('disarms modifier-free selection and keeps only the Table target when Table editing is requested', () => {
    const document = createW4BTableDocument();
    const table = document.pages[0].objects.find((object) => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Missing Table fixture');
    const session = sessionWithDemo(document);
    const { container } = render(<VNextApp session={session} />);
    setPageRect(container);

    fireEvent.click(button(container, 'toggle-multi-select'));
    const hit = container.querySelector<HTMLElement>(`[data-editor-object-id="${table.id}"]`)!;
    fireEvent.pointerDown(hit, { pointerId: 240, button: 0, clientX: 120, clientY: 100 });
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
    expect(button(container, 'toggle-multi-select')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(button(container, 'edit-table'));
    expect(button(container, 'toggle-multi-select')).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
    expect(container.querySelector(`[data-editor-object-id="${table.id}"][data-selected="true"]`)).toBeTruthy();
    expect(container.querySelector('[role="status"]')).toHaveTextContent('Aguarde a medição da tabela para editar a grade.');
  });

  it('collapses real Table authoring for local/concurrent locks and canonicalizes a valid dirty cell draft before local lock', async () => {
    const document = createW4BTableDocument();
    const sourceTable = document.pages[0].objects.find((object) => object.type === 'table');
    if (!sourceTable || sourceTable.type !== 'table') throw new Error('Missing Table fixture');
    const session = sessionWithDemo(document);
    const execute = vi.spyOn(session, 'execute');
    const restorePhysicalMeasurement = enableTransformFreePhysicalMeasurement();
    const { container } = render(<VNextApp session={session} />);
    const shell = container.querySelector<HTMLElement>('[data-vnext-shell]');
    if (!shell) throw new Error('Missing VNext shell');

    const canonicalTable = () => {
      const object = session.getSnapshot().document.pages[0].objects.find((entry) => entry.id === sourceTable.id);
      if (!object || object.type !== 'table') throw new Error('Missing canonical Table');
      return object;
    };
    const assertSingularTableSelection = () => {
      expect(container.querySelectorAll('[data-editor-object-id][data-selected="true"]')).toHaveLength(1);
      expect(container.querySelector(`[data-editor-object-id="${sourceTable.id}"][data-selected="true"]`)).toBeTruthy();
    };

    await enterMeasuredTableGrid(container, sourceTable.id, 241);
    expect(container.querySelector('[data-table-axis-toolbar]')).toBeTruthy();
    expect(container.querySelector('[data-table-grid-overlay]')).toBeTruthy();
    expect(container.querySelector('[data-table-cell-inspector]')).toBeTruthy();
    fireEvent.click(button(container, 'paste-table-cells'));
    fireEvent.click(button(container, 'marker-panel'));
    expect(container.querySelector('[data-table-paste-fallback]')).toBeTruthy();
    expect(container.querySelector('[data-marker-legend-panel]')).toBeTruthy();

    const localBefore = session.getSnapshot();
    const tableBeforeLocalLock = structuredClone(canonicalTable().table);
    const localCallsBefore = execute.mock.calls.length;
    pointerClick(button(container, 'toggle-object-lock'), 242);

    await waitFor(() => {
      expect(shell).toHaveAttribute('data-editor-mode', 'select');
      expect(container.querySelector('[data-table-grid-overlay]')).toBeNull();
      expect(canonicalTable().locked).toBe(true);
    });
    const localAfter = session.getSnapshot();
    expect(localAfter.localSequence).toBe(localBefore.localSequence + 1);
    expect(canonicalTable().table).toEqual(tableBeforeLocalLock);
    expect(execute.mock.calls.slice(localCallsBefore).map(([action]) => action.type)).toEqual(['object.setLocked']);
    expect(execute.mock.calls.slice(localCallsBefore).some(([action]) => action.type === 'table.cell.setContent')).toBe(false);
    assertSingularTableSelection();
    expect(container.querySelector('[data-table-axis-toolbar]')).toBeNull();
    expect(container.querySelector('[data-table-paste-fallback]')).toBeNull();
    expect(container.querySelector('[data-marker-legend-panel]')).toBeNull();
    expect(container.querySelector('[data-table-cell-inspector]')).toBeNull();
    expect(button(container, 'toggle-object-lock')).toHaveTextContent('Desbloquear objeto');
    expect(button(container, 'toggle-object-lock')).not.toBeDisabled();
    expect(button(container, 'open-table-semantics')).toBeDisabled();

    const unlockBefore = session.getSnapshot();
    pointerClick(button(container, 'toggle-object-lock'), 243);
    await waitFor(() => expect(canonicalTable().locked).toBeUndefined());
    expect(session.getSnapshot().localSequence).toBe(unlockBefore.localSequence + 1);
    expect(shell).toHaveAttribute('data-editor-mode', 'select');
    assertSingularTableSelection();
    expect(button(container, 'edit-table')).not.toBeDisabled();
    expect(container.querySelector('[data-table-grid-overlay]')).toBeNull();

    await enterMeasuredTableGrid(container, sourceTable.id, 244);
    fireEvent.click(button(container, 'edit-cell-content'));
    await waitFor(() => expect(container.querySelector('[data-cell-edit-session]')).toBeTruthy());
    expect(shell).toHaveAttribute('data-editor-mode', 'cell-edit');
    expect(button(container, 'insert-rows-after')).toBeDisabled();
    expect(button(container, 'insert-rows-after')).toHaveAttribute('title', 'Conclua a edição da célula antes de alterar eixos.');
    const originalCellContent = structuredClone(canonicalTable().table.cells[0].content);
    const draftSequence = session.getSnapshot().localSequence;
    const draftCallsBefore = execute.mock.calls.length;
    const richTextDraft = container.querySelector<HTMLTextAreaElement>('[data-cell-rich-text]');
    if (!richTextDraft) throw new Error('Missing rich-text cell draft');
    fireEvent.change(richTextDraft, { target: { value: 'DIRTY-MUST-NOT-COMMIT' } });
    expect(session.getSnapshot().localSequence).toBe(draftSequence);
    expect(canonicalTable().table.cells[0].content).toEqual(originalCellContent);
    expect(execute.mock.calls).toHaveLength(draftCallsBefore);

    pointerClick(button(container, 'toggle-object-lock'), 245);
    await waitFor(() => {
      expect(shell).toHaveAttribute('data-editor-mode', 'select');
      expect(container.querySelector('[data-cell-edit-session]')).toBeNull();
      expect(container.querySelector('[data-table-grid-overlay]')).toBeNull();
      expect(canonicalTable().locked).toBe(true);
    });
    expect(session.getSnapshot().localSequence).toBe(draftSequence + 2);
    expect(canonicalTable().table.cells[0].content).not.toEqual(originalCellContent);
    expect(JSON.stringify(canonicalTable().table.cells[0].content)).toContain('DIRTY-MUST-NOT-COMMIT');
    expect(execute.mock.calls.slice(draftCallsBefore).map(([action]) => action.type))
      .toEqual(['table.cell.setContent', 'object.setLocked']);
    assertSingularTableSelection();
    expect(button(container, 'toggle-object-lock')).toHaveTextContent('Desbloquear objeto');

    pointerClick(button(container, 'toggle-object-lock'), 246);
    await waitFor(() => expect(canonicalTable().locked).toBeUndefined());
    await enterMeasuredTableGrid(container, sourceTable.id, 247);
    const concurrentBefore = session.getSnapshot();
    const concurrentCallsBefore = execute.mock.calls.length;
    act(() => {
      const result = session.execute({
        type: 'object.setLocked',
        objectId: sourceTable.id,
        expectedLocked: false,
        locked: true,
      });
      expect(result.ok).toBe(true);
    });

    await waitFor(() => {
      expect(shell).toHaveAttribute('data-editor-mode', 'select');
      expect(container.querySelector('[data-table-grid-overlay]')).toBeNull();
      expect(canonicalTable().locked).toBe(true);
    });
    expect(session.getSnapshot().localSequence).toBe(concurrentBefore.localSequence + 1);
    expect(execute.mock.calls.slice(concurrentCallsBefore).map(([action]) => action.type)).toEqual(['object.setLocked']);
    assertSingularTableSelection();
    expect(button(container, 'toggle-object-lock')).toHaveTextContent('Desbloquear objeto');
    expect(button(container, 'open-table-semantics')).toBeDisabled();
    restorePhysicalMeasurement();
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

function renderTableStyleGuidance(hasCellDraft: boolean, isLocked: boolean) {
  const document = createW4BTableDocument();
  const object = document.pages[0].objects[0];
  if (!object || object.type !== 'table') throw new Error('Missing table fixture');
  const disabledReason = tableStyleDisabledGuidance(hasCellDraft, isLocked);
  const disabled = disabledReason !== undefined;
  const disabledReasonId = disabled ? 'table-style-disabled-test' : undefined;
  const view = render(<TableStyleInspector
    table={object.table}
    documentStyle={document.style}
    scope={{ kind: 'table' }}
    roleScope={null}
    disabled={disabled}
    disabledReasonId={disabledReasonId}
    disabledReason={disabledReason}
    advancedOpen={false}
    paddingLinked={true}
    onRoleScopeChange={() => undefined}
    onAdvancedOpenChange={() => undefined}
    onPaddingLinkedChange={() => undefined}
    onPatch={() => undefined}
    onBorderPreset={() => undefined}
    onPreset={() => undefined}
    onAnnotationGap={() => undefined}
  />);
  const control = view.container.querySelector<HTMLSelectElement>('[data-style-property="fontFamily"]');
  if (!control) throw new Error('Missing representative style control');
  return { ...view, control, disabledReasonId };
}

describe('W4.F.2 F1 disabled Table style guidance', () => {
  it('keeps Cell-draft guidance truthful and connected through aria-describedby', () => {
    const view = renderTableStyleGuidance(true, false);
    expect(view.control).toBeDisabled();
    expect(view.control).toHaveAttribute('aria-describedby', view.disabledReasonId);
    expect(view.container.querySelector('.vnext-style-disabled-reason')).toHaveTextContent(
      'Conclua ou cancele a edição da célula para alterar a apresentação da tabela.'
    );
  });

  it('explains a locked Table without draft-only wording', () => {
    const view = renderTableStyleGuidance(false, true);
    expect(view.control).toBeDisabled();
    expect(view.control).toHaveAttribute('aria-describedby', view.disabledReasonId);
    expect(view.container.querySelector('.vnext-style-disabled-reason')).toHaveTextContent(
      'Tabela bloqueada. Desbloqueie a tabela para alterar a apresentação.'
    );
    expect(view.container.textContent).not.toContain('Conclua ou cancele a edição da célula para alterar a apresentação da tabela.');
  });

  it('keeps an editable Table enabled with no stale reason or aria reference', () => {
    const view = renderTableStyleGuidance(false, false);
    expect(view.control).not.toBeDisabled();
    expect(view.control).not.toHaveAttribute('aria-describedby');
    expect(view.container.querySelector('.vnext-style-disabled-reason')).toBeNull();
  });

  it('reports both causes when Cell draft and Table lock coexist', () => {
    const view = renderTableStyleGuidance(true, true);
    expect(view.control).toBeDisabled();
    expect(view.control).toHaveAttribute('aria-describedby', view.disabledReasonId);
    expect(view.container.querySelector('.vnext-style-disabled-reason')).toHaveTextContent(
      'Conclua ou cancele a edição da célula e desbloqueie a tabela para alterar a apresentação.'
    );
  });
});


describe('P1.A simple-by-default workspace', () => {
  it('creates the default table when the size disclosure is closed despite retained custom or invalid inputs', () => {
    const session = sessionWithDemo();
    const { container, getByLabelText } = render(<VNextApp session={session} simpleByDefault />);
    for (const rows of ['10', '0']) {
      fireEvent.click(button(container, 'new-table-size'));
      fireEvent.change(getByLabelText('Linhas da nova tabela'), { target: { value: rows } });
      fireEvent.change(getByLabelText('Colunas da nova tabela'), { target: { value: '5' } });
      fireEvent.click(button(container, 'new-table-size'));
      const before = session.getSnapshot();
      fireEvent.click(button(container, 'add-table'));
      const after = session.getSnapshot();
      const created = after.document.pages[0].objects.find((object) => !before.document.pages[0].objects.some((existing) => existing.id === object.id));
      if (!created || created.type !== 'table') throw new Error('Missing default table');
      expect(created.table.rows).toHaveLength(1);
      expect(created.table.columns).toHaveLength(1);
      expect(after.localSequence).toBe(before.localSequence + 1);
      fireEvent.click(button(container, 'undo'));
      expect(session.getSnapshot().document).toEqual(before.document);
    }
  });

  it('creates the chosen 10 by 5 table in one action with exact undo/redo and rejects invalid dimensions', () => {
    const session = sessionWithDemo();
    const { container, getByLabelText } = render(<VNextApp session={session} simpleByDefault />);
    fireEvent.click(button(container, 'new-table-size'));
    fireEvent.change(getByLabelText('Linhas da nova tabela'), { target: { value: '10' } });
    fireEvent.change(getByLabelText('Colunas da nova tabela'), { target: { value: '5' } });
    const before = session.getSnapshot();
    fireEvent.click(button(container, 'add-table'));
    const after = session.getSnapshot();
    const table = after.document.pages[0].objects.find((object) => object.type === 'table');
    if (!table || table.type !== 'table') throw new Error('Missing created table');
    expect(table.table.rows).toHaveLength(10);
    expect(table.table.columns).toHaveLength(5);
    expect(table.table.cells).toHaveLength(50);
    expect(table.table.cells.every((cell) => cell.content.type === 'empty')).toBe(true);
    expect(after.localSequence).toBe(before.localSequence + 1);
    expect(new Set([table.table.id, ...table.table.rows.map((row) => row.id), ...table.table.columns.map((column) => column.id), ...table.table.cells.map((cell) => cell.id)]).size).toBe(66);
    fireEvent.click(button(container, 'undo'));
    expect(session.getSnapshot().document).toEqual(before.document);
    fireEvent.click(button(container, 'redo'));
    expect(session.getSnapshot().document).toEqual(after.document);
    fireEvent.click(button(container, 'new-table-size'));
    for (const value of ['', '0', '1.5', '151', '-1']) {
      fireEvent.change(getByLabelText('Linhas da nova tabela'), { target: { value } });
      const unchanged = session.getSnapshot();
      fireEvent.click(button(container, 'add-table'));
      expect(container.querySelector('[role="status"]')).toHaveTextContent('Nenhuma tabela foi criada.');
      expect(session.getSnapshot().document).toEqual(unchanged.document);
      expect(session.getSnapshot().localSequence).toBe(unchanged.localSequence);
    }
  });

  it.each([
    ['00017\t±0,01%\n°C\tμA', '2 linha(s) × 2 coluna(s)', '1 linha(s) × 1 coluna(s)'],
    ['A\tB\nC', 'quantidades diferentes de colunas', 'incluindo as células vazias'],
    ['"sem fechamento', 'aspas incompletas', 'Copie novamente'],
  ])('keeps paste discoverable and explains rejected input without changing the table: %s', async (input, diagnosis, recovery) => {
    const session = sessionWithDemo(createW4DTableDocument());
    const restore = enableTransformFreePhysicalMeasurement();
    try {
      const { container } = render(<VNextApp session={session} simpleByDefault />);
      await enterMeasuredTableGrid(container, W4D_OBJECT_B_ID, 701);
      expect(button(container, 'toggle-table-options')).toHaveAttribute('aria-expanded', 'false');
      expect(button(container, 'copy-table-cells')).toBeEnabled();
      expect(button(container, 'paste-table-cells')).toBeEnabled();
      const cell = container.querySelector<HTMLElement>('[data-table-cell="3:3"]');
      if (!cell) throw new Error('Missing destination cell');
      pointerClick(cell, 702);
      fireEvent.click(button(container, 'paste-table-cells'));
      const textarea = container.querySelector<HTMLTextAreaElement>('[data-table-paste-textarea]');
      if (!textarea) throw new Error('Missing paste input');
      fireEvent.change(textarea, { target: { value: input } });
      const before = session.getSnapshot();
      fireEvent.click(button(container, 'apply-native-table-paste'));
      expect(container.querySelector('[role="status"]')).toHaveTextContent(diagnosis);
      expect(container.querySelector('[role="status"]')).toHaveTextContent(recovery);
      expect(container.querySelector('[role="status"]')).toHaveTextContent('Nada foi alterado.');
      expect(textarea.value).toBe(input);
      expect(session.getSnapshot().document).toEqual(before.document);
      expect(session.getSnapshot().localSequence).toBe(before.localSequence);
    } finally { restore(); }
  });

  it('keeps the novice toolbar compact until advanced tools are requested', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    expect(container.querySelector('[data-vnext-shell]')).toHaveAttribute('data-simple-by-default', 'true');
    expect(button(container, 'add-text')).toHaveTextContent('Texto');
    expect(button(container, 'add-image')).toHaveTextContent('Imagem');
    expect(button(container, 'add-table')).toHaveTextContent('Tabela');
    expect(container.querySelector('[data-editor-action="add-shape"]')).toBeNull();
    expect(container.querySelector('[data-editor-action="toggle-multi-select"]')).toBeNull();
    expect(container.querySelector('[data-editor-action="group"]')).toBeNull();
    const more = button(container, 'toggle-advanced-tools');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(button(container, 'add-shape')).toBeTruthy();
    expect(button(container, 'toggle-multi-select')).toBeTruthy();
    expect(button(container, 'group')).toBeTruthy();
  });

  it('shows ordinary selection actions contextually without opening advanced tools', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    expect(container.querySelector('[data-editor-action="edit-text"]')).toBeNull();
    expect(container.querySelector('[data-editor-action="duplicate"]')).toBeNull();
    selectText(container, 401);
    expect(button(container, 'edit-text')).toBeEnabled();
    expect(button(container, 'duplicate')).toBeEnabled();
    expect(button(container, 'delete')).toBeEnabled();
    expect(container.querySelector('[data-editor-action="add-shape"]')).toBeNull();
  });
});

describe('P1.B contextual inspector disclosure', () => {
  it('hides universal geometry and locking until requested in simple mode', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectText(container, 501);
    expect(container.querySelector('.vnext-info h2')).toHaveTextContent('Texto');
    expect(container.querySelector('[data-inspector-authoring]')).toBeNull();
    expect(container.querySelector('[data-object-locking]')).toBeNull();
    const details = button(container, 'toggle-inspector-details');
    expect(details).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('[data-inspector-authoring]')).toBeTruthy();
    expect(container.querySelector('[data-object-locking]')).toBeTruthy();
  });

  it('resets advanced disclosure when the selection context changes', () => {
    const session = sessionWithDemo(seedTextDocument({ includeShape: true }));
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    selectText(container, 502);
    const details = button(container, 'toggle-inspector-details');
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('[data-inspector-authoring]')).toBeTruthy();

    setPageRect(container);
    const shape = container.querySelector<HTMLElement>('[data-editor-object-id="shape-other"]');
    if (!shape) throw new Error('Missing shape target');
    fireEvent.pointerDown(shape, { pointerId: 503, button: 0, clientX: 250, clientY: 80 });
    fireEvent.pointerUp(shape, { pointerId: 503, button: 0, clientX: 250, clientY: 80 });

    expect(container.querySelector('.vnext-info h2')).toHaveTextContent('Forma');
    expect(button(container, 'toggle-inspector-details')).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-inspector-authoring]')).toBeNull();
    expect(container.querySelector('[data-object-locking]')).toBeNull();
  });

  it('preserves the full historical inspector outside simple mode', () => {
    const session = sessionWithDemo(seedTextDocument());
    const { container } = render(<VNextApp session={session} />);
    selectText(container, 502);
    expect(container.querySelector('.vnext-info h2')).toHaveTextContent('Geometria do objeto');
    expect(container.querySelector('[data-editor-action="toggle-inspector-details"]')).toBeNull();
    expect(container.querySelector('[data-inspector-authoring]')).toBeTruthy();
    expect(container.querySelector('[data-object-locking]')).toBeTruthy();
  });
});

describe('P1.C office-user inspector guidance', () => {
  it('explains the editing task before advanced controls while preserving disclosure reset', () => {
    const session = sessionWithDemo(seedTextDocument({ includeShape: true }));
    const { container } = render(<VNextApp session={session} simpleByDefault />);
    const inspector = container.querySelector('.vnext-info');
    expect(inspector).toHaveTextContent('Para adicionar conteúdo, use a barra acima da página.');
    expect(inspector).not.toHaveTextContent('geometria');
    selectText(container, 601);
    expect(inspector).toHaveTextContent('Use Editar texto');
    expect(button(container, 'toggle-inspector-details')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button(container, 'toggle-inspector-details'));
    expect(container.querySelector('[data-inspector-authoring]')).toBeTruthy();
    setPageRect(container);
    const shape = container.querySelector<HTMLElement>('[data-editor-object-id="shape-other"]');
    if (!shape) throw new Error('Missing shape target');
    fireEvent.pointerDown(shape, { pointerId: 602, button: 0, clientX: 250, clientY: 80 });
    fireEvent.pointerUp(shape, { pointerId: 602, button: 0, clientX: 250, clientY: 80 });
    expect(inspector).toHaveTextContent('Use as alças para mudar o tamanho.');
    expect(button(container, 'toggle-inspector-details')).toHaveAttribute('aria-expanded', 'false');
  });
});
